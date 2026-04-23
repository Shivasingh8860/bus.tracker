import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useBuses } from '../context/BusesContext';
import { Bus, Map, LogOut, Shield, MapPin, Bell } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const Navbar = () => {
    const { user, logout } = useAuth();
    const { broadcasts } = useBuses();
    const navigate = useNavigate();

    const handleLogout = () => {
        logout();
        navigate('/');
    };

    const latestBroadcast = broadcasts[0];

    const typeColors = {
        info: { bg: 'rgba(99, 102, 241, 0.1)', border: 'rgba(99, 102, 241, 0.3)', text: 'var(--primary)' },
        warning: { bg: 'rgba(245, 158, 11, 0.1)', border: 'rgba(245, 158, 11, 0.3)', text: 'var(--warning)' },
        emergency: { bg: 'rgba(239, 68, 68, 0.1)', border: 'rgba(239, 68, 68, 0.3)', text: 'var(--danger)' }
    };

    return (
        <div style={{ position: 'sticky', top: 0, zIndex: 1000 }}>
            {/* Global Alert Bar */}
            <AnimatePresence>
                {latestBroadcast && (
                    <motion.div 
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        style={{ background: typeColors[latestBroadcast.type]?.bg || typeColors.info.bg, borderBottom: `1px solid ${typeColors[latestBroadcast.type]?.border || typeColors.info.border}`, overflow: 'hidden' }}
                    >
                        <div className="container" style={{ padding: '0.6rem 1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <Bell size={16} color={typeColors[latestBroadcast.type]?.text || 'var(--primary)'} className="fade-in" />
                            <p style={{ fontSize: '0.85rem', fontWeight: 600, color: typeColors[latestBroadcast.type]?.text || 'var(--primary)' }}>
                                {latestBroadcast.message}
                            </p>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            <nav className="glass-card" style={{ margin: '0.5rem auto', maxWidth: '1200px', width: '96%', padding: '0.5rem 1rem', borderRadius: 'var(--radius-lg)' }}>
            <div className="flex justify-between items-center">
                <Link to="/" className="flex items-center gap-3">
                    <Bus size={28} color="var(--primary)" />
                    <h2 style={{ fontSize: '1.25rem', margin: 0 }}>Campus<span style={{ color: 'var(--primary)' }}>Tracker</span></h2>
                </Link>

                <div className="flex items-center gap-2">
                    <Link to="/" className="btn btn-outline" style={{ border: 'none', fontSize: '0.9rem' }}>
                        <Map size={18} /> Public
                    </Link>

                    {user ? (
                        <>
                            {user.role === 'admin' ? (
                                <Link to="/admin" className="btn btn-outline" style={{ border: 'none', fontSize: '0.9rem' }}>
                                    <Shield size={18} /> Admin
                                </Link>
                            ) : (
                                <Link to="/driver" className="btn btn-outline" style={{ border: 'none', fontSize: '0.9rem' }}>
                                    <MapPin size={18} /> Drive
                                </Link>
                            )}
                            <button onClick={handleLogout} className="btn btn-danger" style={{ padding: '0.5rem 0.75rem', fontSize: '0.85rem' }}>
                                <LogOut size={16} /> Logout
                            </button>
                        </>
                    ) : (
                        <Link to="/login" className="btn btn-primary" style={{ padding: '0.5rem 1.25rem', fontSize: '0.9rem' }}>
                            Sign In
                        </Link>
                    )}
                </div>
            </div>
            </nav>
        </div>
    );
};

export default Navbar;
