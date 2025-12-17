import './Task.css';
import type { Task as TaskType } from '../types';
import { API_URL } from '../config';
import { getAuthUser } from '../auth';
import toast from 'react-hot-toast';

export function Task({ task, setTasks }: { task: TaskType; setTasks: React.Dispatch<React.SetStateAction<TaskType[]>> }) {
    const handleToggleComplete = async () => {
        const user = getAuthUser();
        if (!user?.token) return;
        if (user.role === 'teacher') return;

        try {
            const res = await fetch(`${API_URL}/tasks/${task.id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${user.token}`,
                },
                body: JSON.stringify({ completed: !task.completed }),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const saved = (await res.json()) as TaskType;
            setTasks((prev) => prev.map((t) => (t.id === task.id ? saved : t)));
        } catch (error) {
            console.error('Error updating task:', error);
            toast.error('Update failed');
        }
    };

    const handleDelete = async () => {
        const user = getAuthUser();
        if (!user?.token) return;

        const deletePromise = (async () => {
            const res = await fetch(`${API_URL}/tasks/${task.id}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${user.token}` },
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            setTasks((prev) => prev.filter((t) => t.id !== task.id));
        })();

        toast.promise(deletePromise, {
            loading: 'Removing…',
            success: 'Deleted',
            error: 'Delete failed',
        });

        try {
            await deletePromise;
        } catch (error) {
            console.error('Error deleting task:', error);
        }
    };

    const currentUser = getAuthUser();
    const canComplete = currentUser?.role !== 'teacher';

    return (
        <li className={`task-item ${task.completed ? 'completed' : ''}`}>
            {canComplete ? (
                <input
                    type="checkbox"
                    className="task-checkbox"
                    checked={task.completed}
                    onChange={handleToggleComplete}
                />
            ) : null}
            <div className="task-details">
                <span className="task-title">{task.title}</span>
                <span className="task-subject">{task.subject}</span>
                <span className="task-date">Due: {new Date(task.finishDate).toLocaleDateString()}</span>
            </div>
            <div className="task-actions">
                {currentUser?.role === 'teacher' && currentUser.id === task.userId ? (
                    <button className="task-delete-button" onClick={handleDelete}>
                        Remove
                    </button>
                ) : null}
            </div>
        </li>
    );
}