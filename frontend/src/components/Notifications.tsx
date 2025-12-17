import { useEffect, useRef, useState } from 'react';
import type { Notification } from '../types';
import { API_URL } from '../config';
import { getAuthUser } from '../auth';
import toast from 'react-hot-toast';
import './Notifications.css';

export default function Notifications({ events }: { events: unknown[] }) {
  const [items, setItems] = useState<Notification[]>([]);
  const bootedRef = useRef(false);
  const shownIdsRef = useRef<Set<string>>(new Set());

  const fetchLatest = async () => {
    const user = getAuthUser();
    if (!user?.token) return;
    const res = await fetch(`${API_URL}/notifications?count=30`, {
      headers: { Authorization: `Bearer ${user.token}` },
    });
    if (!res.ok) {
      toast.error('Notifications failed to load');
      return;
    }
    const data = (await res.json()) as Notification[];
    setItems(data);

    // Toast only for newly-seen notifications (skip initial load)
    if (bootedRef.current) {
      const newOnes = data.filter((n) => !shownIdsRef.current.has(n.id));
      for (const n of newOnes.slice(-5)) {
        // Keep it short: message is primary, name/subject is optional context
        const prefix = n.name && n.subject ? `${n.name} (${n.subject}) — ` : '';
        toast(prefix + n.message);
        shownIdsRef.current.add(n.id);
      }
    } else {
      data.forEach((n) => shownIdsRef.current.add(n.id));
      bootedRef.current = true;
    }
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
    <div className="notify">
      <div className="notify-head">
        <div>
          <div className="notify-title">Notifications</div>
          <div className="notify-sub">Latest changes in real time</div>
        </div>
      </div>

      <ul className="notify-list">
        {items
          .slice()
          .reverse()
          .slice(0, 10)
          .map((n) => (
            <li key={n.id} className="notify-item">
              <span className="notify-msg">
                {n.name && n.subject ? `${n.name} (${n.subject}) — ` : ''}
                {n.message}
              </span>
              <span className="notify-ts">{new Date(n.ts).toLocaleString()}</span>
            </li>
          ))}
      </ul>
    </div>
  );
}
