import { useState } from 'react';
import './CreateTask.css';
import type { Task } from '../types';
import { API_URL } from '../config';
import { getAuthUser } from '../auth';
import toast from 'react-hot-toast';

function CreateTask({ setTasks }: { setTasks: React.Dispatch<React.SetStateAction<Task[]>> }) {
    const [description, setDescription] = useState<string>('');
    const [date, setDate] = useState<string>(new Date().toISOString().split('T')[0]);
    const [subject, setSubject] = useState<string>('');

    const auth = getAuthUser();
    if (auth?.role !== 'teacher') return null;

    const handleCreate = async () => {
        const user = getAuthUser();
        if (!user?.token) {
            toast.error('Please sign in');
            return;
        }

        if (!description.trim() || !subject.trim()) {
            toast.error('Fill in all fields');
            return;
        }

        const createPromise = (async () => {
            const payload = {
                title: description.trim(),
                finishDate: new Date(date).getTime(),
                subject: subject.trim(),
            };

            const res = await fetch(`${API_URL}/tasks`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${user.token}`,
                },
                body: JSON.stringify(payload),
            });

            if (!res.ok) {
                const text = await res.text();
                throw new Error(text || `HTTP ${res.status}`);
            }

            const newTask = (await res.json()) as Task;
            setTasks((prev) => {
                const next = [newTask, ...prev];
                // keep consistent ordering with backend (newest first)
                next.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
                return next;
            });

            setDescription('');
            setDate(new Date().toISOString().split('T')[0]);
            setSubject('');
        })();

        toast.promise(createPromise, {
            loading: 'Creating…',
            success: 'Created',
            error: 'Could not create task',
        });

        try {
            await createPromise;
        } catch (error) {
            console.error('Error creating task:', error);
        }
    };

    return (
        <div className="create-task-container">
            <h3>Create a New Task</h3>
            <div className="create-task-form">
                <div className="form-group">
                    <label htmlFor="description">Description:</label>
                    <input
                        type="text"
                        id="description"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                    />
                </div>
                <div className="form-group">
                    <label htmlFor="subject">Subject:</label>
                    <input type="text" id="subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
                </div>
                <div className="form-group">
                    <label htmlFor="date">Due Date:</label>
                    <input
                        type="date"
                        id="date"
                        value={date}
                        min={new Date().toISOString().split('T')[0]}
                        onChange={(e) => setDate(e.target.value)}
                    />
                </div>
                <button className="create-task-button" onClick={handleCreate}>
                    Create Task
                </button>
            </div>
        </div>
    );
}

export default CreateTask;
