import { useState, useEffect } from 'react';
import { Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import './App.css';
import CreateTask from './components/CreateTask';
import TaskList from './components/TaskList';
import LoginPage from './components/LoginPage';
import RegisterPage from './components/RegisterPage';
import type { Task } from './types';

export const API_URL = 'http://localhost:5000';

type AuthUser = { id: number; username: string; token: string };

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
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const fetchTasks = async (token: string) => {
      try {
        const res = await fetch(`${API_URL}/tasks`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as Task[];
        setTasks(data);
      } catch (error) {
        console.error('Error fetching tasks:', error);
      }
    };

    const user = getAuthUser();

    if (location.pathname === '/' && !user) {
      navigate('/login');
      return;
    }

    if (location.pathname === '/' && user) {
      fetchTasks(user.token);
    }
  }, [location.pathname, navigate]);

  const handleLogout = async () => {
    const user = getAuthUser();
    localStorage.removeItem('authUser');
    try {
      if (user?.token) {
        await fetch(`${API_URL}/auth/logout`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${user.token}` },
        });
      }
    } catch {
      // ignore
    }
    navigate('/login');
  };

  const user = getAuthUser();

  const MainApp = () => (
    <div className="app-container">
      <header className="app-header">
        <div>
          <h1>Todo List</h1>
          {user ? <small style={{ color: '#666' }}>Signed in as {user.username}</small> : null}
        </div>
        <button onClick={handleLogout} className="logout-button">Logout</button>
      </header>
      <div className="content-container">
        <CreateTask setTasks={setTasks} />
        <TaskList tasks={tasks} setTasks={setTasks} />
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
