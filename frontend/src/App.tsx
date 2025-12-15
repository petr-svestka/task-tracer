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

type AuthUser = { id: number; username: string; token: string; role?: 'student' | 'teacher' };

function getAuthUser(): AuthUser | null {
  const raw = localStorage.getItem('authUser');
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

function App() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [filterCompleted, setFilterCompleted] = useState<'all' | 'open' | 'done'>('all');
  const [filterSubject, setFilterSubject] = useState<string>('all');
  const [rtEvents, setRtEvents] = useState<unknown[]>([]);
  const location = useLocation();
  const navigate = useNavigate();

  const user = getAuthUser();

  const subjects = useMemo(() => {
    const s = new Set<string>();
    tasks.forEach((t) => s.add(t.subject));
    return ['all', ...Array.from(s).sort()];
  }, [tasks]);

  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      const completedOk =
        filterCompleted === 'all' ? true : filterCompleted === 'done' ? t.completed : !t.completed;
      const subjectOk = filterSubject === 'all' ? true : t.subject === filterSubject;
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
              onChange={(e) => setFilterCompleted(e.target.value as 'all' | 'open' | 'done')}
            >
              <option value="all">All</option>
              <option value="open">Open</option>
              <option value="done">Done</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, color: '#666' }}>Category</label>
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
