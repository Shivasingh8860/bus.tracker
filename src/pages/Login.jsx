import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { UserCircle, Lock, Shield, BusFront } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useBuses } from '../context/BusesContext';

const Login = () => {
    const [role, setRole] = useState('driver'); // 'driver' or 'admin'
    const [userId, setUserId] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const navigate = useNavigate();
    const { login } = useAuth();
    const { drivers } = useBuses();

    const handleLogin = (e) => {
        e.preventDefault();
        setError('');

        if (role === 'admin') {
            if (userId === 'admin' && password === 'admin123') {
                login('admin', { name: 'Super Admin' });
                navigate('/admin');
            } else {
                setError('Invalid admin credentials.');
            }
        } else {
            const driver = drivers.find(d => d.id === userId);
            if (driver && password === driver.password) {
                login('driver', driver);
                navigate('/driver');
            } else {
                setError('Invalid driver ID or password.');
            }
        }
    };

    return (
        <div className="flex justify-center items-center" style={{ minHeight: '70vh', padding: '1rem' }}>
            <motion.div
                className="glass-card"
                style={{ width: '100%', maxWidth: '400px', padding: '2.5rem' }}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
            >
                <div className="mb-8 text-center">
                    <h2 className="title-gradient" style={{ fontSize: '1.75rem', marginBottom: '0.5rem' }}>Access Portal</h2>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Choose your role to continue</p>
                </div>

                <div className="flex gap-2 mb-8" style={{ background: 'var(--bg-input)', padding: '0.3rem', borderRadius: 'var(--radius-sm)' }}>
                    <button
                        className={`btn w-full ${role === 'driver' ? 'btn-primary' : ''}`}
                        style={role === 'driver' ? {} : { background: 'transparent', color: 'var(--text-muted)' }}
                        onClick={() => setRole('driver')}
                    >
                        Driver
                    </button>
                    <button
                        className={`btn w-full ${role === 'admin' ? 'btn-primary' : ''}`}
                        style={role === 'admin' ? {} : { background: 'transparent', color: 'var(--text-muted)' }}
                        onClick={() => setRole('admin')}
                    >
                        Admin
                    </button>
                </div>

                {error && (
                    <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--danger)', color: 'var(--danger)', padding: '0.75rem', borderRadius: 'var(--radius-sm)', marginBottom: '1.5rem', fontSize: '0.85rem' }}>
                        {error}
                    </div>
                )}

                <form onSubmit={handleLogin} className="flex flex-col gap-5">
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Identity ID</label>
                        <input
                            type="text"
                            placeholder={role === 'driver' ? "D101" : "admin"}
                            value={userId}
                            onChange={(e) => setUserId(e.target.value)}
                            required
                        />
                    </div>

                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Security Key</label>
                        <input
                            type="password"
                            placeholder="••••••••"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                        />
                    </div>

                    <button type="submit" className="btn btn-primary" style={{ marginTop: '0.5rem', width: '100%', padding: '0.9rem' }}>
                        Establish Connection
                    </button>
                </form>
            </motion.div>
        </div>
    );
};

export default Login;
