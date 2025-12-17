import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import './LoginPage.css';
import { API_URL } from '../config';
import toast from 'react-hot-toast';

type LoginResponse = { token: string; user: { id: number; username: string; role?: 'student' | 'teacher' } };

const LoginPage: React.FC = () => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const navigate = useNavigate();

    useEffect(() => {
        const flag = localStorage.getItem('sessionInvalid');
        if (flag) {
            localStorage.removeItem('sessionInvalid');
            toast.error('Session expired. Please sign in.');
        }
    }, []);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();

        const loginPromise = (async () => {
            const res = await fetch(`${API_URL}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password }),
            });

            if (!res.ok) {
                const msg = await res.text();
                throw new Error(msg || `HTTP ${res.status}`);
            }

            const data = (await res.json()) as LoginResponse;
            localStorage.setItem('authUser', JSON.stringify({ ...data.user, token: data.token }));
            navigate('/');
        })();

        toast.promise(loginPromise, {
            loading: 'Signing in…',
            success: 'Signed in',
            error: 'Login details are incorect',
        });

        try {
            await loginPromise;
        } catch (err) {
            console.error(err);
        }
    };

    return (
        <div className="login-page">
            <div className="login-container">
                <h2>Login</h2>
                <form onSubmit={handleLogin} className="login-form">
                    <div className="form-group">
                        <label htmlFor="username">Username</label>
                        <input
                            type="text"
                            id="username"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            required
                            autoComplete="username"
                        />
                    </div>
                    <div className="form-group">
                        <label htmlFor="password">Password</label>
                        <input
                            type="password"
                            id="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            autoComplete="current-password"
                        />
                    </div>
                    <button type="submit" className="login-button">
                        Login
                    </button>
                </form>
                <p className="register-link">
                    Don't have an account? <Link to="/register">Register</Link>
                </p>
            </div>
        </div>
    );
};

export default LoginPage;
