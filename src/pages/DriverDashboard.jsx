import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useBuses } from '../context/BusesContext';
import { Radio, MapPin, StopCircle, Play, AlertCircle, AlertTriangle, Wifi, WifiOff, Loader2, Navigation, Clock, Users as UsersIcon, MessageSquare } from 'lucide-react';
import MapComponent from '../components/MapComponent';
import { motion, AnimatePresence } from 'framer-motion';

const DriverDashboard = () => {
    const { user } = useAuth();
    const { routes, drivers, updateBusLocation, stopBusTracking, activeBuses, submitTrafficReport } = useBuses();
    
    // Persistence initialization
    const getSavedState = () => {
        const saved = localStorage.getItem('driver_tracking_state');
        return saved ? JSON.parse(saved) : null;
    };

    const savedState = getSavedState();
    
    const [selectedRoute, setSelectedRoute] = useState(savedState?.routeId || '');
    const [isTracking, setIsTracking] = useState(savedState?.isTracking || false);
    const [crowdStatus, setCrowdStatus] = useState(savedState?.crowdStatus || 'Empty');
    
    // Auto-set route from Driver Profile if available
    useEffect(() => {
        const driverProfile = drivers.find(d => d.id === user?.id);
        if (driverProfile?.route_id && !selectedRoute) {
            setSelectedRoute(driverProfile.route_id);
        } else if (!selectedRoute && routes.length > 0) {
            setSelectedRoute(routes[0].id);
        }
    }, [drivers, user?.id, routes, selectedRoute]);
    
    const [currentLocation, setCurrentLocation] = useState(null);
    const [gpsStatus, setGpsStatus] = useState('idle'); // idle, searching, active, error
    const [gpsError, setGpsError] = useState(null);
    const [presenceChannel, setPresenceChannel] = useState(null);
    const [currentSpeed, setCurrentSpeed] = useState(0);
    const [sessionSeconds, setSessionSeconds] = useState(0);
    const [voiceEnabled, setVoiceEnabled] = useState(true);
    const [lastAnnouncedStop, setLastAnnouncedStop] = useState(null);
    const watchId = useRef(null);
    const wakeLock = useRef(null);

    // Persist state changes & sync live status
    useEffect(() => {
        if (user) {
            localStorage.setItem('driver_tracking_state', JSON.stringify({
                isTracking,
                routeId: selectedRoute,
                crowdStatus
            }));

            // Sync with DB if currently tracking
            if (isTracking && currentLocation) {
                updateBusLocation(user.id, currentLocation.lat, currentLocation.lng, selectedRoute, crowdStatus);
            }
        }
    }, [isTracking, selectedRoute, crowdStatus, user, currentLocation, updateBusLocation]);

    // Wake Lock Logic
    const requestWakeLock = async () => {
        if ('wakeLock' in navigator) {
            try {
                wakeLock.current = await navigator.wakeLock.request('screen');
            } catch (err) {
                console.error(`${err.name}, ${err.message}`);
            }
        }
    };

    const releaseWakeLock = () => {
        if (wakeLock.current) {
            wakeLock.current.release();
            wakeLock.current = null;
        }
    };

    const lastPosition = useRef(null);
    const kalmanState = useRef({
        lat: { x: null, p: 1, q: 0.001, r: 0.01 },
        lng: { x: null, p: 1, q: 0.001, r: 0.01 }
    });

    const applyKalman = (measurement, state) => {
        if (state.x === null) {
            state.x = measurement;
            return measurement;
        }
        // Prediction
        state.p = state.p + state.q;
        // Update
        const k = state.p / (state.p + state.r);
        state.x = state.x + k * (measurement - state.x);
        state.p = (1 - k) * state.p;
        return state.x;
    };

    const startTracking = useCallback(async () => {
        if (!("geolocation" in navigator)) {
            alert("Geolocation is not supported by your browser");
            return;
        }

        if (!selectedRoute) {
            alert("Please select a route before starting tracking.");
            return;
        }

        setGpsStatus('searching');
        setGpsError(null);
        setIsTracking(true);
        requestWakeLock();

        // 1. Get a FAST initial position (even if less accurate)
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const { latitude, longitude } = position.coords;
                setCurrentLocation({ lat: latitude, lng: longitude });
                updateBusLocation(user.id, latitude, longitude, selectedRoute, crowdStatus);
                lastPosition.current = { lat: latitude, lng: longitude };
            },
            (err) => console.warn("Initial fast fix failed:", err),
            { enableHighAccuracy: false, timeout: 3000 }
        );

        // 2. Start Continuous Watching with High Accuracy
        const options = {
            enableHighAccuracy: true,
            timeout: 20000, // Increase timeout for difficult environments
            maximumAge: 1000 // Allow 1s old cache for faster responses
        };

        // Set up Presence
        const channel = supabase.channel('fleet-presence', {
            config: { presence: { key: user.id } }
        });

        channel
            .on('presence', { event: 'sync' }, () => {
                console.log('Presence synced:', channel.presenceState());
            })
            .subscribe(async (status) => {
                if (status === 'SUBSCRIBED') {
                    await channel.track({
                        online_at: new Date().toISOString(),
                        bus_number: drivers.find(d => d.id === user.id)?.busNumber || 'N/A',
                        route_id: selectedRoute
                    });
                }
            });

        setPresenceChannel(channel);

        watchId.current = navigator.geolocation.watchPosition(
            (position) => {
                const { latitude, longitude, speed } = position.coords;
                if (speed !== null) setCurrentSpeed(Math.round(speed * 3.6)); // m/s to km/h

                // Apply Kalman Filtering for noise reduction
                const smoothLat = applyKalman(latitude, kalmanState.current.lat);
                const smoothLng = applyKalman(longitude, kalmanState.current.lng);

                // Throttling: Only update DB if moved > 5 meters OR > 5 seconds passed
                const hasMovedSignificantly = !lastPosition.current || 
                    getDistance(smoothLat, smoothLng, lastPosition.current.lat, lastPosition.current.lng) > 0.005;

                setCurrentLocation({ lat: smoothLat, lng: smoothLng });
                setGpsStatus('active');
                setGpsError(null);
                
                if (hasMovedSignificantly) {
                    updateBusLocation(user.id, smoothLat, smoothLng, selectedRoute, crowdStatus);
                    lastPosition.current = { lat: smoothLat, lng: smoothLng };
                }

                // GEOFENCE AUTO-CHECKIN LOGIC
                if (nextStop && voiceEnabled) {
                    const distToNext = getDistance(smoothLat, smoothLng, nextStop.lat, nextStop.lng);
                    if (distToNext < 0.05 && lastAnnouncedStop !== nextStop.name) { // 50 meters
                        setLastAnnouncedStop(nextStop.name);
                        const msg = new SpeechSynthesisUtterance(`Arriving at ${nextStop.name}. Please prepare for passengers.`);
                        window.speechSynthesis.speak(msg);
                    }
                }
            },
            (error) => {
                console.error('GPS Error:', error);
                setGpsStatus('error');
                let errorMsg = 'GPS Error';
                switch(error.code) {
                    case error.PERMISSION_DENIED: errorMsg = 'Permission denied'; break;
                    case error.POSITION_UNAVAILABLE: errorMsg = 'Position unavailable'; break;
                    case error.TIMEOUT: 
                        errorMsg = 'GPS timeout - Retrying...';
                        // Auto-retry on timeout
                        setTimeout(() => {
                            if (isTracking) startTracking();
                        }, 2000);
                        break;
                }
                setGpsError(errorMsg);
            },
            options
        );
    }, [user.id, selectedRoute, crowdStatus, updateBusLocation, isTracking]);

    const getDistance = (lat1, lon1, lat2, lon2) => {
        const R = 6371;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    };

    const stopTracking = useCallback(() => {
        if (watchId.current !== null) {
            navigator.geolocation.clearWatch(watchId.current);
            watchId.current = null;
        }
        if (presenceChannel) {
            presenceChannel.unsubscribe();
            setPresenceChannel(null);
        }
        setIsTracking(false);
        setGpsStatus('idle');
        setCurrentLocation(null);
        stopBusTracking(user.id);
        releaseWakeLock();
    }, [stopBusTracking, user.id, presenceChannel]);

    const toggleTracking = useCallback(() => {
        if (isTracking) {
            stopTracking();
        } else {
            startTracking();
        }
    }, [isTracking, startTracking, stopTracking]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (watchId.current !== null) {
                navigator.geolocation.clearWatch(watchId.current);
            }
            if (presenceChannel) {
                presenceChannel.unsubscribe();
            }
            releaseWakeLock();
        };
    }, [presenceChannel]);

    // Re-start tracking if it was active after refresh
    // Session Timer logic
    useEffect(() => {
        let timer;
        if (isTracking) {
            timer = setInterval(() => setSessionSeconds(s => s + 1), 1000);
        } else {
            setSessionSeconds(0);
        }
        return () => clearInterval(timer);
    }, [isTracking]);

    const formatTime = (totalSeconds) => {
        const hrs = Math.floor(totalSeconds / 3600);
        const mins = Math.floor((totalSeconds % 3600) / 60);
        const secs = totalSeconds % 60;
        return `${hrs > 0 ? `${hrs}:` : ''}${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    const currentRoute = routes.find(r => r.id === selectedRoute);
    
    const nextStop = React.useMemo(() => {
        if (!currentRoute?.waypoints || !currentLocation) return null;
        // Find nearest waypoint that is "ahead" (simplification: find nearest, then take next)
        const distances = currentRoute.waypoints.map(wp => ({
            ...wp,
            dist: getDistance(currentLocation.lat, currentLocation.lng, wp.lat, wp.lng)
        }));
        const nearestIdx = distances.reduce((minIdx, item, idx) => item.dist < distances[minIdx].dist ? idx : minIdx, 0);
        return distances[nearestIdx];
    }, [currentRoute, currentLocation]);

    return (
        <div className="container" style={{ maxWidth: '800px', paddingBottom: '4rem' }}>
            <motion.div
                className="glass-card"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
            >
                <div className="flex justify-between items-start mb-8 border-b" style={{ paddingBottom: '1.5rem', borderColor: 'var(--panel-border)' }}>
                    <div>
                        <h2 className="title-gradient" style={{ fontSize: '1.5rem' }}>Driver Station</h2>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Bus {user.busNumber} • {user.id}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                        <div className={`flex items-center gap-2 px-3 py-1 rounded-full ${isTracking ? 'bg-accent/10 border-accent/20' : 'bg-danger/10 border-danger/20'}`} style={{ border: '1px solid transparent' }}>
                            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: isTracking ? 'var(--accent)' : 'var(--danger)', boxShadow: isTracking ? '0 0 8px var(--accent)' : 'none' }}></span>
                            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: isTracking ? 'var(--accent)' : 'var(--danger)' }}>{isTracking ? 'LIVE' : 'OFFLINE'}</span>
                        </div>
                        {isTracking && (
                            <div className="flex flex-col items-end gap-1">
                                <div className="flex items-center gap-1" style={{ fontSize: '0.7rem', color: gpsStatus === 'active' ? 'var(--accent)' : (gpsStatus === 'error' ? 'var(--danger)' : 'var(--warning)') }}>
                                    {gpsStatus === 'searching' && <Loader2 size={10} className="animate-spin" />}
                                    {gpsStatus === 'active' && <Wifi size={10} />}
                                    {gpsStatus === 'error' && <WifiOff size={10} />}
                                    <span>GPS: {gpsStatus.toUpperCase()} {gpsError && `(${gpsError})`}</span>
                                </div>
                                <div className="flex items-center gap-1 text-white/40" style={{ fontSize: '0.65rem' }}>
                                    <Clock size={10} /> 
                                    <span>SESSION: {formatTime(sessionSeconds)}</span>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="layout-equal mb-8">
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <label style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Assigned Route</label>
                            <button 
                                onClick={() => setVoiceEnabled(!voiceEnabled)}
                                style={{ background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '2px 8px', borderRadius: '4px', border: `1px solid ${voiceEnabled ? 'var(--accent)' : 'var(--text-muted)'}` }}
                            >
                                <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: voiceEnabled ? 'var(--accent)' : 'var(--text-muted)' }} />
                                <span style={{ fontSize: '0.6rem', fontWeight: 800, color: voiceEnabled ? 'var(--accent)' : 'var(--text-muted)' }}>VOICE COPILOT {voiceEnabled ? 'ON' : 'OFF'}</span>
                            </button>
                        </div>
                        <select
                            value={selectedRoute}
                            onChange={(e) => setSelectedRoute(e.target.value)}
                            style={{ background: 'var(--bg-input)', border: '1px solid var(--panel-border)', borderRadius: 'var(--radius-sm)', padding: '0.6rem 1rem', width: '100%', color: 'var(--text-main)' }}
                        >
                            {routes.map(r => (
                                <option key={r.id} value={r.id}>{r.name}</option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label style={{ display: 'block', marginBottom: '0.8rem', fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Fleet Load & Occupancy</label>
                        <div className="flex gap-2 p-1 bg-white/5 rounded-xl border border-white/5">
                            {[
                                { id: 'Empty', color: 'var(--accent)', icon: '🟢' },
                                { id: 'Substantial', color: 'var(--warning)', icon: '🟡' },
                                { id: 'Full', color: 'var(--danger)', icon: '🔴' }
                            ].map(status => (
                                <button
                                    key={status.id}
                                    type="button"
                                    className={`flex-1 flex flex-col items-center gap-1 p-2 rounded-lg transition-all ${crowdStatus === status.id ? 'bg-white/10 shadow-lg' : 'opacity-40 hover:opacity-100'}`}
                                    onClick={() => setCrowdStatus(status.id)}
                                >
                                    <span style={{ fontSize: '1.2rem' }}>{status.icon}</span>
                                    <span style={{ fontSize: '0.65rem', fontWeight: 700, color: status.color }}>{status.id}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* ROUTE PROGRESS STEPPER */}
                {isTracking && currentRoute?.waypoints && (
                    <div className="mb-6 px-2">
                        <div className="flex justify-between items-center mb-2">
                            <span style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--text-muted)' }}>ROUTE PROGRESS</span>
                            <span style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--accent)' }}>{currentRoute.name}</span>
                        </div>
                        <div className="flex items-center gap-1">
                            {currentRoute.waypoints.map((wp, idx) => {
                                const isPassed = nextStop && currentRoute.waypoints.indexOf(nextStop) > idx;
                                const isCurrent = nextStop && nextStop.lat === wp.lat && nextStop.lng === wp.lng;
                                return (
                                    <React.Fragment key={idx}>
                                        <div 
                                            className={`h-1.5 rounded-full flex-1 transition-all duration-500 ${isPassed ? 'bg-accent' : (isCurrent ? 'bg-accent/40 animate-pulse' : 'bg-white/10')}`}
                                            title={wp.name}
                                        />
                                        {idx < currentRoute.waypoints.length - 1 && <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: 'var(--panel-border)' }} />}
                                    </React.Fragment>
                                );
                            })}
                        </div>
                    </div>
                )}

                <div 
                    className="mb-8 overflow-hidden map-responsive-wrapper" 
                    style={{ 
                        height: '400px', 
                        borderRadius: 'var(--radius-sm)', 
                        border: '1px solid var(--panel-border)',
                        position: 'relative'
                    }}
                >
                    <MapComponent selectedRouteId={selectedRoute} />
                    {!isTracking && (
                        <div style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            right: 0,
                            bottom: 0,
                            background: 'rgba(0,0,0,0.4)',
                            backdropFilter: 'blur(2px)',
                            zIndex: 1000,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            pointerEvents: 'none'
                        }}>
                            <div className="glass-card" style={{ background: 'var(--bg-card)', padding: '1rem 2rem', textAlign: 'center' }}>
                                <p style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-main)' }}>Map Preview Mode</p>
                                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Initiate broadcast to start live tracking</p>
                            </div>
                        </div>
                    )}
                    {isTracking && (
                        <>
                            {/* SPEEDOMETER */}
                            <div style={{
                                position: 'absolute',
                                top: '1rem',
                                left: '1rem',
                                zIndex: 1000,
                                pointerEvents: 'none'
                            }}>
                                <div className="glass-card flex flex-col items-center justify-center" style={{ width: '60px', height: '60px', borderRadius: '12px', background: 'rgba(0,0,0,0.8)', border: '2px solid var(--accent)', boxShadow: '0 0 20px rgba(16, 185, 129, 0.3)' }}>
                                    <span style={{ fontSize: '1.25rem', fontWeight: 900, color: 'white', lineHeight: 1 }}>{currentSpeed}</span>
                                    <span style={{ fontSize: '0.5rem', fontWeight: 800, color: 'var(--accent)' }}>KM/H</span>
                                </div>
                            </div>

                            {/* NAVIGATION HUD */}
                            <div style={{
                                position: 'absolute',
                                top: '1rem',
                                left: '50%',
                                transform: 'translateX(-50%)',
                                zIndex: 1000,
                                width: 'calc(100% - 2rem)',
                                maxWidth: '340px',
                                pointerEvents: 'none'
                            }}>
                                <motion.div 
                                    className="glass-card" 
                                    initial={{ y: -20, opacity: 0 }}
                                    animate={{ y: 0, opacity: 1 }}
                                    style={{ 
                                        background: 'rgba(18, 18, 21, 0.9)', 
                                        backdropFilter: 'blur(12px)',
                                        border: '1px solid rgba(16, 185, 129, 0.3)',
                                        padding: '0.75rem 1rem',
                                        boxShadow: '0 10px 25px rgba(0,0,0,0.5)'
                                    }}
                                >
                                    <div className="flex items-center justify-between gap-4">
                                        <div className="flex items-center gap-3">
                                            <div style={{ padding: '0.5rem', borderRadius: '50%', background: 'var(--accent)', color: 'white' }}>
                                                <Navigation size={18} />
                                            </div>
                                            <div>
                                                <p style={{ fontSize: '0.6rem', fontWeight: 800, color: 'var(--accent)', textTransform: 'uppercase', marginBottom: '2px', letterSpacing: '0.05em' }}>NEXT STATION</p>
                                                <h4 style={{ fontSize: '0.95rem', margin: 0, color: 'white' }}>{nextStop?.name || 'Calculating...'}</h4>
                                            </div>
                                        </div>
                                        <div className="text-right border-l pl-4" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
                                            <div className="flex items-center justify-end gap-1 text-accent mb-1">
                                                <Clock size={12} />
                                                <span style={{ fontSize: '0.8rem', fontWeight: 900 }}>{nextStop ? `${Math.max(1, Math.round(nextStop.dist * 3))}m` : '--'}</span>
                                            </div>
                                            <p style={{ fontSize: '0.6rem', color: 'var(--text-muted)', margin: 0 }}>{nextStop ? `${nextStop.dist.toFixed(2)}km away` : 'Estimating...'}</p>
                                        </div>
                                    </div>
                                </motion.div>
                            </div>

                            {/* QUICK ACTIONS */}
                            <div style={{
                                position: 'absolute',
                                bottom: '1rem',
                                right: '1rem',
                                zIndex: 1000,
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '0.5rem'
                            }}>
                                <button 
                                    onClick={() => {
                                        submitTrafficReport(user.id);
                                        alert('Traffic reported successfully! This will notify students on your route.');
                                    }}
                                    className="btn btn-primary" 
                                    style={{ 
                                        width: '44px', height: '44px', borderRadius: '50%', padding: 0, 
                                        background: 'rgba(245, 158, 11, 0.9)', 
                                        boxShadow: '0 5px 15px rgba(245, 158, 11, 0.3)',
                                        border: '2px solid rgba(255,255,255,0.2)'
                                    }}
                                    title="Report Traffic"
                                >
                                    <AlertCircle size={20} color="white" />
                                </button>
                                <button 
                                    className="btn btn-primary" 
                                    style={{ 
                                        width: '44px', height: '44px', borderRadius: '50%', padding: 0, 
                                        background: 'rgba(59, 130, 246, 0.9)', 
                                        boxShadow: '0 5px 15px rgba(59, 130, 246, 0.3)',
                                        border: '2px solid rgba(255,255,255,0.2)'
                                    }}
                                    title="View Student Chat"
                                >
                                    <MessageSquare size={20} color="white" />
                                </button>
                            </div>
                        </>
                    )}
                </div>

                <button
                    className={`btn w-full ${isTracking ? 'btn-danger' : 'btn-primary'}`}
                    style={{ padding: '1rem', fontVariantCaps: 'all-small-caps', fontSize: '1.1rem', letterSpacing: '0.05em' }}
                    onClick={toggleTracking}
                >
                    {isTracking ? <StopCircle size={20} /> : <Play size={20} />}
                    <span style={{ marginLeft: '0.5rem' }}>{isTracking ? 'Terminate Session' : 'Initiate Broadcast'}</span>
                </button>

                {isTracking && (
                    <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="mt-4 flex gap-2"
                    >
                        <button
                            className="btn w-full btn-danger"
                            style={{
                                background: 'transparent',
                                border: '2px solid var(--danger)',
                                color: 'var(--danger)',
                                fontWeight: 800,
                                fontSize: '1.2rem',
                                animation: 'pulse-danger 2s infinite'
                            }}
                            onClick={() => {
                                alert('🚨 EMERGENCY SOS BROADCAST SENT TO SECURITY');
                            }}
                        >
                            <AlertTriangle size={24} /> EMERGENCY SOS
                        </button>
                    </motion.div>
                )}

                {isTracking && (
                    <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="mt-10 p-6 border-t" 
                        style={{ borderColor: 'var(--panel-border)', textAlign: 'center' }}
                    >
                        <h4 className="mb-4" style={{ color: 'var(--text-secondary)' }}>Passenger Check-In Station</h4>
                        <div className="glass-card d-inline-block" style={{ display: 'inline-block', background: 'white', padding: '15px', borderRadius: '12px' }}>
                            <img
                                src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(`${window.location.origin}/checkin/${user.id}`)}`}
                                alt="Boarding QR"
                                style={{ display: 'block' }}
                            />
                        </div>
                        <p className="mt-4" style={{ fontSize: '0.8rem', color: 'var(--text-muted)', maxWidth: '300px', margin: '1rem auto' }}>
                            Display this QR to your passengers. When they scan it, their entry/exit will automatically update your bus's occupancy status.
                        </p>
                    </motion.div>
                )}
            </motion.div>
        </div>
    );
};

export default DriverDashboard;
