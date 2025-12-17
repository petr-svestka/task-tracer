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

function App() {
  // Install global fetch wrapper once: on any 401 response clear session,
  // mark session invalid and redirect to login so client shows alert there.
  useEffect(() => {
    if ((window as any).__authFetchPatched) return;
    (window as any).__authFetchPatched = true;

    const orig = window.fetch.bind(window);
    window.fetch = async (...args: Parameters<typeof fetch>) => {
      try {
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
            pathname.endsWith('/auth/login') ||
            pathname.endsWith('/auth/logout') ||
            pathname.endsWith('/auth/register');

          // If the user isn't logged in yet (e.g. wrong password on login),
          // don't treat 401 as a "session expired" event.
          const currentToken = getAuthUser()?.token;
          const hadSession = Boolean(currentToken);

          // Avoid race: if an old/in-flight request returns 401 after a new login,
          // don't wipe the freshly-created session.
          const isCurrentRequest = requestToken && currentToken && requestToken === currentToken;

          if (isAuthEndpoint || !hadSession || !isCurrentRequest) return res;

          try {
            localStorage.removeItem('authUser');
            localStorage.setItem('sessionInvalid', '1');
            window.location.href = '/login';
          } catch {
            // ignore
          }
        }
        return res;
      } catch (e) {
        throw e;
      }
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

      socket.on('disconnect', () => {
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

  const MainApp = () => (
    <div className="app-container">
      <header className="app-header">
        <div>
          <h1>Task Tracker</h1>
          {user ? <small style={{ color: '#666' }}>Signed in as {user.username}</small> : null}
        </div>
        <button onClick={handleLogout} className="logout-button">Logout</button>
      </header>

      <div className="content-container">
        <CreateTask setTasks={setTasks} />

        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, color: '#666' }}>Status</label>
            <select
              value={filterCompleted}
              onChange={(e) => setFilterCompleted(e.target.value as 'All' | 'open' | 'done')}
            >
              <option value="All">All</option>
              <option value="open">Open</option>
              <option value="done">Done</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, color: '#666' }}>Subject</label>
            <select value={filterSubject} onChange={(e) => setFilterSubject(e.target.value)}>
              {subjects.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>

        <TaskList tasks={filteredTasks} setTasks={setTasks} />
        <Notifications events={rtEvents} />
      </div>
    </div>
  );

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/" element={<MainApp />} />
    </Routes>
  );
}

export default App;
