import './Task.css';
import type { Task as TaskType } from '../types';
import { API_URL } from '../App';


export function Task({ task, setTasks }: { task: TaskType; setTasks: React.Dispatch<React.SetStateAction<TaskType[]>> }) {
    const handleToggleComplete = async () => {
        try {
            const updatedTask: TaskType = { ...task, completed: !task.completed };
            await fetch(`${API_URL}/tasks/${task.id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(updatedTask),
            });
            setTasks((prevTasks) => prevTasks.map((t) => (t.id === task.id ? updatedTask : t)));
        } catch (error) {
            console.error('Error updating task:', error);
            alert('Failed to update task');
        }
    };

    const handleDelete = async () => {
        try {
            await fetch(`${API_URL}/tasks/${task.id}`, {
                method: 'DELETE',
            });
            setTasks((prevTasks) => prevTasks.filter((t) => t.id !== task.id));
        } catch (error) {
            console.error('Error deleting task:', error);
            alert('Failed to delete task');
        }
    };

    return (
        <li className={`task-item ${task.completed ? 'completed' : ''}`}>
            <input
                type="checkbox"
                className="task-checkbox"
                checked={task.completed}
                onChange={handleToggleComplete}
            />
            <div className="task-details">
                <span className="task-title">{task.title}</span>
                <span className="task-subject">{task.subject}</span>
                <span className="task-date">Due: {new Date(task.finishDate).toLocaleDateString()}</span>
            </div>
            <div className="task-actions">
                <button className="task-delete-button" onClick={handleDelete}>
                    Remove
                </button>
            </div>
        </li>
    );
}