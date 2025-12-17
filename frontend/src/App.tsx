import { useState, useEffect, useMemo } from 'react';
import { Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import './App.css';
import CreateTask from './components/CreateTask';
import TaskList from './components/TaskList';
import LoginPage from './components/LoginPage';
import RegisterPage from './components/RegisterPage';
import Notifications from './components/Notifications';
import type { Task } from './types';
import { API_URL, SOCKET_URL } from './config';
import { getAuthUser } from './auth';

type PatchedWindow = Window & { __authFetchPatched?: boolean };

function App() {
  // Install global fetch wrapper once: on any 401 response clear session,
  // mark session invalid and redirect to login so client shows alert there.
  useEffect(() => {
    const w = window as PatchedWindow;
    if (w.__authFetchPatched) return;
    w.__authFetchPatched = true;

    const orig = window.fetch.bind(window);
    window.fetch = async (...args: Parameters<typeof fetch>) => {
      const tokenFromArgs = () => {
        const input = args[0];
        const init = args[1] as RequestInit | undefined;

        const readAuthHeader = (headers: HeadersInit | undefined): string | null => {
          if (!headers) return null;
          if (headers instanceof Headers) return headers.get('authorization') ?? headers.get('Authorization');
          if (Array.isArray(headers)) {
            const found = headers.find(([k]) => k.toLowerCase() === 'authorization');
            return found?.[1] ?? null;
          }
          const obj = headers as Record<string, string>;
          return obj.authorization ?? obj.Authorization ?? null;
        };

        let authHeader: string | null = null;
        if (input instanceof Request) authHeader = input.headers.get('authorization') ?? input.headers.get('Authorization');
        if (!authHeader) authHeader = readAuthHeader(init?.headers);
        if (!authHeader) return null;

        const m = authHeader.match(/^\s*Bearer\s+(.+)\s*$/i);
        return m?.[1] ?? null;
      };

      const requestToken = tokenFromArgs();
      const res = await orig(...args);

      if (res.status === 401) {
        const urlFromArgs = () => {
          const input = args[0];
          if (typeof input === 'string') return input;
          if (input instanceof Request) return input.url;
          try {
            return String(input);
          } catch {
            return '';
          }
        };

        const rawUrl = urlFromArgs();
        let pathname = '';
        try {
          pathname = new URL(rawUrl, window.location.origin).pathname;
        } catch {
          pathname = '';
        }

        const isAuthEndpoint =
          pathname.endsWith('/auth/login') || pathname.endsWith('/auth/logout') || pathname.endsWith('/auth/register');

        // If the user isn't logged in yet (e.g. wrong password on login),
        // don't treat 401 as a "session expired" event.
        const currentToken = getAuthUser()?.token;
        const hadSession = Boolean(currentToken);

        // Avoid race: if an old/in-flight request returns 401 after a new login,
        // don't wipe the freshly-created session.
        const isCurrentRequest = requestToken && currentToken && requestToken === currentToken;

        if (!isAuthEndpoint && hadSession && isCurrentRequest) {
          try {
            localStorage.removeItem('authUser');
            localStorage.setItem('sessionInvalid', '1');
            window.location.href = '/login';
          } catch {
            // ignore
          }
        }
      }

      return res;
    };
  }, []);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [filterCompleted, setFilterCompleted] = useState<'All' | 'open' | 'done'>('All');
  const [filterSubject, setFilterSubject] = useState<string>('All');
  const [rtEvents, setRtEvents] = useState<unknown[]>([]);
  const location = useLocation();
  const navigate = useNavigate();

  const user = getAuthUser();

  const subjects = useMemo(() => {
    const s = new Set<string>();
    tasks.forEach((t) => s.add(t.subject));
    return ['All', ...Array.from(s).sort()];
  }, [tasks]);

  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      const completedOk =
        filterCompleted === 'All' ? true : filterCompleted === 'done' ? t.completed : !t.completed;
      const subjectOk = filterSubject === 'All' ? true : t.subject === filterSubject;
      return completedOk && subjectOk;
    });
  }, [tasks, filterCompleted, filterSubject]);

  useEffect(() => {
    const fetchTasks = async (token: string) => {
      const res = await fetch(`${API_URL}/tasks`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as Task[];
    };

    const boot = async () => {
      const currentUser = getAuthUser();

      if (location.pathname === '/' && !currentUser) {
        navigate('/login');
        return;
      }
      if (location.pathname !== '/' || !currentUser) return;

      try {
        setTasks(await fetchTasks(currentUser.token));
      } catch (e) {
        console.error(e);
      }
    };

    boot();
  }, [location.pathname, navigate]);

  useEffect(() => {
    if (!user?.token) return;

    let socket: import('socket.io-client').Socket | undefined;
    let cancelled = false;
    let pollTimer: number | undefined;

    const refreshTasks = async () => {
      if (!user?.token) return;
      try {
        const res = await fetch(`${API_URL}/tasks`, {
          headers: { Authorization: `Bearer ${user.token}` },
        });
        if (res.ok && !cancelled) setTasks((await res.json()) as Task[]);
      } catch (e) {
        console.error(e);
      }
    };

    const startPollingFallback = () => {
      if (pollTimer) return;
      // 1s fallback "realtime" when websocket can't connect
      pollTimer = window.setInterval(() => {
        void refreshTasks();
      }, 1000);
    };

    (async () => {
      const { io } = await import('socket.io-client');
      socket = io(SOCKET_URL, {
        auth: { token: user.token },
        // allow fallback transports; Docker/nginx/proxies often break raw websocket
        transports: ['websocket', 'polling'],
        path: '/socket.io',
      });

      socket.on('connect', async () => {
        await refreshTasks();
      });

      socket.on('connect_error', (err: unknown) => {
        console.error('socket connect_error', err);
        startPollingFallback();
      });

      socket.on('task:event', async (evt: unknown) => {
        setRtEvents((prev) => [...prev.slice(-49), evt]);
        await refreshTasks();
      });
    })();

    return () => {
      cancelled = true;
      if (pollTimer) window.clearInterval(pollTimer);
      try {
        socket?.disconnect();
      } catch {
        // ignore
      }
    };
  }, [user?.token]);

  const handleLogout = async () => {
    const u = getAuthUser();
    localStorage.removeItem('authUser');
    try {
      if (u?.token) {
        await fetch(`${API_URL}/auth/logout`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${u.token}` },
        });
      }
    } catch {
      // ignore
    }
    navigate('/login');
  };

  const MainApp = () => {
    const total = tasks.length;
    const done = tasks.filter((t) => t.completed).length;
    const open = total - done;

    const isTeacher = user?.role === 'teacher';

    const userLabel = user ? `${user.username}${user.role ? ` • ${user.role}` : ''}` : '';

    return (
      <div className="shell">
        <header className="topbar">
          <div className="brand">
            <div className="brand-mark" aria-hidden="true" />
            <div className="brand-copy">
              <div className="brand-title">Task Tracer</div>
              <div className="brand-subtitle">Realtime classroom tasks</div>
            </div>
          </div>

          <div className="topbar-right">
            {user ? (
              <div className="user-pill" title={userLabel}>
                <span className="user-dot" aria-hidden="true" />
                <span className="user-text">{userLabel}</span>
              </div>
            ) : null}
            <button onClick={handleLogout} className="btn btn-ghost">
              Sign out
            </button>
          </div>
        </header>

        <main className="dashboard">
          <section className="hero">
            <div className="hero-left">
              <h1 className="hero-title">Your workspace</h1>
              <p className="hero-desc">Stay on top of tasks with instant updates and a clean overview.</p>

              <div className="stats">
                <div className="stat">
                  <div className="stat-k">{total}</div>
                  <div className="stat-l">Total</div>
                </div>

                {isTeacher ? null : (
                  <>
                    <div className="stat">
                      <div className="stat-k">{open}</div>
                      <div className="stat-l">Open</div>
                    </div>
                    <div className="stat">
                      <div className="stat-k">{done}</div>
                      <div className="stat-l">Done</div>
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="hero-right">
              <div className="filters-card">
                <div className="filters-head">
                  <div>
                    <div className="filters-title">Filters</div>
                    <div className="filters-sub">Narrow down what you see</div>
                  </div>
                </div>

                <div className="filters-grid">
                  {!isTeacher ? (
                    <div className="field">
                      <label>Status</label>
                      <select
                        value={filterCompleted}
                        onChange={(e) => setFilterCompleted(e.target.value as 'All' | 'open' | 'done')}
                      >
                        <option value="All">All</option>
                        <option value="open">Open</option>
                        <option value="done">Done</option>
                      </select>
                    </div>
                  ) : null}

                  <div className="field">
                    <label>Subject</label>
                    <select value={filterSubject} onChange={(e) => setFilterSubject(e.target.value)}>
                      {subjects.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="grid">
            <div className="panel">
              <div className="panel-head">
                <h2 className="panel-title">Tasks</h2>
                <div className="panel-meta">Showing {filteredTasks.length} item(s)</div>
              </div>
              <TaskList tasks={filteredTasks} setTasks={setTasks} />
            </div>

            <aside className="side">
              {isTeacher ? (
                <div className="panel">
                  <div className="panel-head">
                    <h2 className="panel-title">Create</h2>
                    <div className="panel-meta">Teacher only</div>
                  </div>
                  <CreateTask setTasks={setTasks} />
                </div>
              ) : null}

              <div className="panel">
                <div className="panel-head">
                  <h2 className="panel-title">Activity</h2>
                  <div className="panel-meta">Latest updates</div>
                </div>
                <Notifications events={rtEvents} />
              </div>
            </aside>
          </section>
        </main>
      </div>
    );
  };

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/" element={<MainApp />} />
    </Routes>
  );
}

export default App;
