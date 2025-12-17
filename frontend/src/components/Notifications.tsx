import { useEffect, useState } from 'react';
import type { Notification } from '../types';
import { API_URL } from '../config';

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

export default function Notifications({ events }: { events: unknown[] }) {
  const [items, setItems] = useState<Notification[]>([]);

  const fetchLatest = async () => {
    const user = getAuthUser();
    if (!user?.token) return;
    const res = await fetch(`${API_URL}/notifications?count=30`, {
      headers: { Authorization: `Bearer ${user.token}` },
    });
    if (!res.ok) return;
    const data = (await res.json()) as Notification[];
    setItems(data);
  };

  useEffect(() => {
    void fetchLatest();
  }, []);

  // On new socket event, refresh quickly (simple & reliable)
  useEffect(() => {
    void fetchLatest();
  }, [events.length]);

  if (!items.length) return null;

  return (
    <div style={{ marginTop: '1rem', padding: '0.75rem', border: '1px solid #eee', borderRadius: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '1rem' }}>
        <h3 style={{ margin: 0 }}>Notifications</h3>
        <small style={{ color: '#666' }}>Latest changes in real time</small>
      </div>

      <ul style={{ margin: '0.5rem 0 0', paddingLeft: '1rem' }}>
        {items
          .slice()
          .reverse()
          .slice(0, 10)
          .map((n) => (
            <li key={n.id} style={{ margin: '0.25rem 0' }}>
              <span style={{ color: '#444' }}>
                {n.name && n.subject ? `${n.name} (${n.subject}) — ` : ''}
                {n.message}
              </span>{' '}
              <small style={{ color: '#888' }}>({new Date(n.ts).toLocaleString()})</small>
            </li>
          ))}
      </ul>
    </div>
  );
}
