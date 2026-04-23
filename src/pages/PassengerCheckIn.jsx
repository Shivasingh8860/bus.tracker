import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useBuses } from '../context/BusesContext';
import { motion, AnimatePresence } from 'framer-motion';
import { UserPlus, UserMinus, Bus, CheckCircle, Info } from 'lucide-react';

const PassengerCheckIn = () => {
    const { busId } = useParams();
    const { activeBuses, updatePassengerCount } = useBuses();
    const [action, setAction] = useState(null); // 'entry' or 'exit'
    
    const bus = activeBuses[busId];
    
    const handleAction = async (type) => {
        setAction(type);
        await updatePassengerCount(busId, type === 'entry' ? 1 : -1);
        setTimeout(() => setAction(null), 3000);
    };

    if (!bus) {
        return (
            <div className="container flex-col items-center justify-center" style={{ minHeight: '80vh' }}>
                <div className="glass-card text-center" style={{ maxWidth: '400px' }}>
                    <Bus size={48} color="var(--danger)" className="mb-4" />
                    <h2>Invalid Station</h2>
                    <p style={{ color: 'var(--text-secondary)' }}>This bus is either offline or the QR code is invalid.</p>
                    <Link to="/" className="btn btn-primary mt-6 w-full">Back to Map</Link>
                </div>
            </div>
        );
    }

    return (
        <div className="container flex flex-col items-center" style={{ pt: '2rem' }}>
            <motion.div 
                className="glass-card text-center w-full" 
                style={{ maxWidth: '450px' }}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
            >
                <div className="mb-6">
                    <div style={{ background: 'var(--primary-glow)', display: 'inline-flex', padding: '1rem', borderRadius: '50%', marginBottom: '1rem' }}>
                        <Bus size={32} color="var(--primary)" />
                    </div>
                    <h2 style={{ fontSize: '1.75rem' }}>Campus Shuttle</h2>
                    <p style={{ color: 'var(--text-secondary)' }}>Bus Number: <span style={{ color: 'var(--text-main)', fontWeight: 600 }}>{busId}</span></p>
                </div>

                <div className="flex flex-col gap-4 mb-8">
                    <button 
                        onClick={() => handleAction('entry')}
                        className="btn"
                        style={{ background: 'var(--accent)', color: 'white', padding: '1.5rem', fontSize: '1.25rem' }}
                        disabled={action}
                    >
                        <UserPlus size={24} /> Log My Entry
                    </button>

                    <button 
                        onClick={() => handleAction('exit')}
                        className="btn btn-outline"
                        style={{ padding: '1.5rem', fontSize: '1.25rem' }}
                        disabled={action}
                    >
                        <UserMinus size={24} /> Log My Exit
                    </button>
                </div>

                <AnimatePresence>
                    {action && (
                        <motion.div 
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                            className="p-4 rounded flex items-center justify-center gap-2"
                            style={{ background: 'rgba(16, 185, 129, 0.1)', color: 'var(--accent)', border: '1px solid var(--accent)' }}
                        >
                            <CheckCircle size={18} />
                            <span style={{ fontWeight: 600 }}>{action === 'entry' ? 'Boarding Logged!' : 'Exit Logged!'}</span>
                        </motion.div>
                    )}
                </AnimatePresence>

                <div className="mt-8 pt-8 border-t" style={{ borderColor: 'var(--panel-border)' }}>
                    <div className="flex items-center gap-2 justify-center mb-2" style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                        <Info size={14} />
                        <span>Current Occupancy: <strong>{bus.passengerCount || 0}</strong></span>
                    </div>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        This automated system helps other students see how crowded the bus is before it arrives.
                    </p>
                </div>
            </motion.div>
        </div>
    );
};

export default PassengerCheckIn;
