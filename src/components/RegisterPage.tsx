import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import './RegisterPage.css';
import type { User } from '../types';
import { API_URL } from '../App';

const RegisterPage: React.FC = () => {
    // Basic form state
    const [username, setUsername] = React.useState('');
    const [password, setPassword] = React.useState('');
    const [confirmPassword, setConfirmPassword] = React.useState('');
    const navigate = useNavigate();

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!username.trim()) {
            alert('Username is required');
            return;
        }

        if (password !== confirmPassword) {
            alert("Passwords don't match!");
            return;
        }

        try {
            const existingRes = await fetch(`${API_URL}/users?username=${encodeURIComponent(username)}`);
            const existing = (await existingRes.json()) as User[];
            if (existing.length) {
                alert('Username already exists');
                return;
            }

            await fetch(`${API_URL}/users`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });

            alert('Registration successful! Please log in.');
            navigate('/login');
        } catch (err) {
            console.error(err);
            alert('Registration failed. Is json-server running?');
        }
    };

    return (
        <div className="register-page">
            <div className="register-container">
                <h2>Register</h2>
                <form onSubmit={handleRegister} className="register-form">
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
                            autoComplete="new-password"
                        />
                    </div>
                    <div className="form-group">
                        <label htmlFor="confirmPassword">Confirm Password</label>
                        <input
                            type="password"
                            id="confirmPassword"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            required
                            autoComplete="new-password"
                        />
                    </div>
                    <button type="submit" className="register-button">
                        Register
                    </button>
                </form>
                <p className="login-link">
                    Already have an account? <Link to="/login">Login</Link>
                </p>
            </div>
        </div>
    );
};

export default RegisterPage;
