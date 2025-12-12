import { useState } from 'react';
import './CreateTask.css';
import type { Task } from '../types';
import { API_URL } from '../App';

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

function CreateTask({ setTasks }: { setTasks: React.Dispatch<React.SetStateAction<Task[]>> }) {
    const [description, setDescription] = useState<string>('');
    const [date, setDate] = useState<string>(new Date().toISOString().split('T')[0]);
    const [subject, setSubject] = useState<string>('');

    const handleCreate = async () => {
        const user = getAuthUser();
        if (!user?.token) {
            alert('You must be logged in');
            return;
        }

        if (!description.trim() || !subject.trim()) {
            alert('Please fill out all fields.');
            return;
        }

        try {
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
            setTasks((prev) => [...prev, newTask]);

            setDescription('');
            setDate(new Date().toISOString().split('T')[0]);
            setSubject('');
        } catch (error) {
            console.error('Error creating task:', error);
            alert('Task creation failed. Is the API running on :5000?');
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
