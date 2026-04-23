import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useBuses } from '../context/BusesContext';
import MapComponent from '../components/MapComponent';
import { Search, Compass, Info, Map as MapIcon, RefreshCw, BusFront, Volume2, Navigation, Bell, Clock, MapPin, Wind, Users as UsersIcon } from 'lucide-react';

const UserTracking = () => {
    const { 
        routes, activeBuses, messages, addMessage, 
        busFeedback, submitBusFeedback 
    } = useBuses();
    const [selectedRoute, setSelectedRoute] = useState('all');
    const [activeTab, setActiveTab] = useState('routes'); // 'routes' or 'chat'
    const [focusedBusId, setFocusedBusId] = useState(null);
    const [isFollowMode, setIsFollowMode] = useState(false);
    const [notificationsEnabled, setNotificationsEnabled] = useState(() => {
        return localStorage.getItem('bus_notifications') === 'true';
    });
    const [voiceEnabled, setVoiceEnabled] = useState(() => {
        return localStorage.getItem('bus_voice') === 'true';
    });
    const [searchQuery, setSearchQuery] = useState('');
    const [userLocation, setUserLocation] = useState(null);
    const [destinationStop, setDestinationStop] = useState(null);
    const [travelAlerts, setTravelAlerts] = useState({}); // { busId: true }
    const [batterySaver, setBatterySaver] = useState(false);

    // SMART ALERT: Monitor for "One Stop Before"
    React.useEffect(() => {
        if (!destinationStop || !focusedBusId || !activeBuses[focusedBusId]) return;
        
        const bus = activeBuses[focusedBusId];
        const currentRoute = routes.find(r => r.id === bus.routeId);
        if (!currentRoute?.waypoints) return;

        const destIdx = currentRoute.waypoints.findIndex(wp => wp.name === destinationStop.name);
        if (destIdx <= 0) return;

        const stopBefore = currentRoute.waypoints[destIdx - 1];
        const distToStopBefore = getDistance(bus.lat, bus.lng, stopBefore.lat, stopBefore.lng);

        if (distToStopBefore < 0.2 && !travelAlerts[focusedBusId]) {
            // Trigger alert
            setTravelAlerts(prev => ({ ...prev, [focusedBusId]: true }));
            if (notificationsEnabled) {
                new Notification(`Next Stop is YOURS!`, {
                    body: `Bus is arriving at ${stopBefore.name}. Your destination ${destinationStop.name} is next.`,
                    icon: '/bus-icon.png'
                });
            }
            if (voiceEnabled) {
                const msg = new SpeechSynthesisUtterance(`Attention! Your destination ${destinationStop.name} is the next stop. Please prepare to disembark.`);
                window.speechSynthesis.speak(msg);
            }
        }
    }, [activeBuses, focusedBusId, destinationStop, routes, notificationsEnabled, voiceEnabled]);

    // Get User Location for ETA calculations
    React.useEffect(() => {
        if ("geolocation" in navigator) {
            const watchId = navigator.geolocation.watchPosition(
                (pos) => setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
                (err) => console.error(err),
                { enableHighAccuracy: true }
            );
            return () => navigator.geolocation.clearWatch(watchId);
        }
    }, []);

    React.useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const trackId = params.get('track');
        if (trackId && activeBuses[trackId]) {
            setSelectedRoute(activeBuses[trackId].routeId);
            setFocusedBusId(trackId);
        }
    }, [activeBuses]);

    const activeCount = Object.keys(activeBuses).length;

    const toggleNotifications = () => {
        const newState = !notificationsEnabled;
        if (newState) {
            Notification.requestPermission().then(permission => {
                if (permission === 'granted') {
                    setNotificationsEnabled(true);
                    localStorage.setItem('bus_notifications', 'true');
                }
            });
        } else {
            setNotificationsEnabled(false);
            localStorage.setItem('bus_notifications', 'false');
        }
    };

    const toggleVoice = () => {
        const newState = !voiceEnabled;
        setVoiceEnabled(newState);
        localStorage.setItem('bus_voice', newState.toString());
        if (newState) {
            const msg = new SpeechSynthesisUtterance("Voice alerts enabled");
            window.speechSynthesis.speak(msg);
        }
    };

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

    const nearestBus = React.useMemo(() => {
        if (!userLocation || activeCount === 0) return null;
        const busesWithDist = Object.entries(activeBuses).map(([id, bus]) => ({
            id,
            ...bus,
            dist: getDistance(userLocation.lat, userLocation.lng, bus.lat, bus.lng)
        }));
        return busesWithDist.sort((a, b) => a.dist - b.dist)[0];
    }, [userLocation, activeBuses]);

    return (
        <div className="container" style={{ paddingBottom: '2rem' }}>
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4 mb-8">
                <div>
                    <h1 className="title-gradient" style={{ fontSize: 'clamp(1.75rem, 5vw, 2.5rem)' }}>Live Tracking</h1>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Real-time campus transit intelligence</p>
                </div>
                <div className="flex items-center gap-3">
                    <button 
                        onClick={() => setBatterySaver(!batterySaver)}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-full border transition-all ${batterySaver ? 'bg-warning/20 border-warning text-warning' : 'bg-white/5 border-white/10 text-muted'}`}
                        style={{ fontSize: '0.65rem', fontWeight: 800 }}
                    >
                        {batterySaver ? '🔋 SAVER ON' : '🔋 SAVER OFF'}
                    </button>
                    <div className="flex items-center gap-2 px-4 py-2 bg-card rounded-full border border-panel-border" style={{ background: 'var(--bg-card)', border: '1px solid var(--panel-border)', borderRadius: '100px' }}>
                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: activeCount > 0 ? 'var(--accent)' : 'var(--danger)', boxShadow: activeCount > 0 ? '0 0 10px var(--accent)' : 'none' }}></div>
                        <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{activeCount} active buses</span>
                    </div>
                </div>
            </div>

            <div className="layout-sidebar">
                <motion.div
                    className="overflow-hidden shadow-2xl map-responsive-wrapper"
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    style={{ borderRadius: 'var(--radius-md)', border: '1px solid var(--panel-border)' }}
                >
                    <MapComponent
                        selectedRouteId={selectedRoute}
                        notificationsEnabled={notificationsEnabled}
                        voiceEnabled={voiceEnabled}
                        focusedBusId={focusedBusId}
                        isFollowMode={isFollowMode}
                        setFollowMode={setIsFollowMode}
                        batterySaver={batterySaver}
                        onBusClick={(id) => {
                            setFocusedBusId(id);
                            if (id) setIsFollowMode(true);
                        }}
                    />
                </motion.div>

                <motion.div
                    className="flex flex-col gap-6"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                >
                    {/* CARD 1: SMART TRIP PLANNER */}
                    <div className="glass-card" style={{ padding: '1.25rem', border: '1px solid var(--accent-glow)' }}>
                        <div className="flex items-center gap-2 mb-4">
                            <Navigation size={18} className="text-accent" />
                            <h3 className="text-sm font-bold m-0 uppercase tracking-wider">Trip Planner</h3>
                        </div>
                        <div className="flex flex-col gap-3">
                            <div>
                                <label style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--text-muted)', marginBottom: '0.5rem', display: 'block' }}>WHERE ARE YOU GOING?</label>
                                <select 
                                    className="w-full bg-white/5 border border-white/10 rounded-lg p-2 text-xs"
                                    onChange={(e) => {
                                        const stop = JSON.parse(e.target.value);
                                        setDestinationStop(stop);
                                    }}
                                    value={destinationStop ? JSON.stringify(destinationStop) : ''}
                                >
                                    <option value="">Select Destination Stop...</option>
                                    {routes.flatMap(r => r.waypoints).filter((v, i, a) => a.findIndex(t => t.name === v.name) === i).map(stop => (
                                        <option key={stop.name} value={JSON.stringify(stop)}>{stop.name}</option>
                                    ))}
                                </select>
                            </div>
                            
                            {destinationStop && (
                                <motion.div 
                                    initial={{ opacity: 0, height: 0 }} 
                                    animate={{ opacity: 1, height: 'auto' }}
                                    className="p-3 rounded-lg bg-accent/5 border border-accent/20"
                                >
                                    <p className="text-[10px] font-bold text-accent mb-2 uppercase">Recommended Route</p>
                                    {(() => {
                                        const bestRoute = routes.find(r => r.waypoints.some(wp => wp.name === destinationStop.name));
                                        if (!bestRoute) return <p className="text-[10px]">No direct route found.</p>;
                                        return (
                                            <div className="flex justify-between items-center">
                                                <span className="text-xs font-bold">{bestRoute.name}</span>
                                                <button 
                                                    onClick={() => setSelectedRoute(bestRoute.id)}
                                                    className="btn btn-sm btn-primary" 
                                                    style={{ fontSize: '9px', padding: '4px 8px' }}
                                                >
                                                    View Route
                                                </button>
                                            </div>
                                        );
                                    })()}
                                </motion.div>
                            )}

                            <div className="flex gap-2 border-t pt-3 mt-1" style={{ borderColor: 'var(--panel-border)' }}>
                                <button
                                    className={`btn flex-1 justify-start ${notificationsEnabled ? 'btn-primary' : 'btn-outline'}`}
                                    onClick={toggleNotifications}
                                    style={{ fontSize: '0.7rem', padding: '0.5rem' }}
                                >
                                    <Bell size={14} /> Alerts
                                </button>
                                <button
                                    className={`btn flex-1 justify-start ${voiceEnabled ? 'btn-primary' : 'btn-outline'}`}
                                    onClick={toggleVoice}
                                    style={{ fontSize: '0.7rem', padding: '0.5rem', borderColor: voiceEnabled ? 'transparent' : 'var(--accent)', color: voiceEnabled ? 'white' : 'var(--accent)' }}
                                >
                                    <Volume2 size={14} /> Voice
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* CARD 2: NAVIGATION */}
                    <div className="glass-card" style={{ padding: '1.25rem' }}>
                        <div className="flex flex-col gap-3 mb-5">
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-lg bg-primary/10 text-primary">
                                    <Compass size={20} />
                                </div>
                                <h2 className="text-lg font-bold m-0">Navigator</h2>
                            </div>
                            <div className="relative">
                                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                                <input 
                                    type="text" 
                                    placeholder="Search routes or stops..." 
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    style={{ paddingLeft: '2.5rem', fontSize: '0.75rem' }}
                                />
                            </div>
                        </div>

                        <div className="flex gap-4 mb-4">
                            <button
                                className={`btn btn-sm ${selectedRoute === 'all' ? 'btn-primary' : 'btn-outline'}`}
                                onClick={() => { setSelectedRoute('all'); setSearchQuery(''); }}
                                style={{ flex: 1, fontSize: '0.75rem' }}
                            >
                                All Routes
                            </button>
                        </div>

                        <div className="flex flex-col gap-2 max-h-[250px] overflow-y-auto custom-scrollbar">
                            {routes.length === 0 ? (
                                [1, 2].map(i => <div key={i} className="skeleton" style={{ height: '50px', width: '100%', marginBottom: '0.5rem' }}></div>)
                            ) : (
                                routes
                                    .filter(r => {
                                        const query = searchQuery.toLowerCase();
                                        return r.name.toLowerCase().includes(query) || 
                                               r.id.toLowerCase().includes(query) ||
                                               r.waypoints?.some(wp => 
                                                   wp.name.toLowerCase().includes(query) || 
                                                   (wp.landmark && wp.landmark.toLowerCase().includes(query))
                                               );
                                    })
                                    .map(route => {
                                        const busesOnRoute = Object.entries(activeBuses)
                                            .map(([id, data]) => ({ ...data, driverId: id }))
                                            .filter(b => b.routeId === route.id);
                                        const isActive = busesOnRoute.length > 0;
                                        const isTrackingThisRoute = focusedBusId && busesOnRoute.some(b => b.driverId === focusedBusId);

                                        return (
                                            <button
                                                key={route.id}
                                                className={`btn w-full justify-between items-center mb-1 ${selectedRoute === route.id ? 'btn-primary' : 'btn-outline'}`}
                                                style={{ 
                                                    padding: '0.75rem 1rem',
                                                    border: isTrackingThisRoute ? '2px solid #3b82f6' : '1px solid var(--panel-border)',
                                                    position: 'relative',
                                                    overflow: 'hidden'
                                                }}
                                                onClick={() => {
                                                    setSelectedRoute(route.id);
                                                    if (busesOnRoute.length > 0) {
                                                        const busId = busesOnRoute[0].driverId;
                                                        setFocusedBusId(busId);
                                                        setIsFollowMode(true);
                                                    }
                                                }}
                                            >
                                                <div className="text-left">
                                                    <p className="font-bold text-sm m-0">{route.name}</p>
                                                    <p className="text-[10px] opacity-50 m-0">{route.id}</p>
                                                </div>
                                                <div className="flex flex-col items-end gap-1">
                                                    {isTrackingThisRoute && (
                                                        <span className="text-[0.5rem] bg-[#3b82f6] text-white px-1.5 py-0.5 rounded font-black tracking-tighter">NAVIGATING</span>
                                                    )}
                                                    {isActive && (
                                                        <div className="flex flex-col items-end gap-1">
                                                            <span className="text-[0.6rem] bg-[#10B981]/10 border border-[#10B981]/20 text-[#10B981] px-1.5 py-0.5 rounded font-bold">
                                                                ● {busesOnRoute.length} LIVE
                                                            </span>
                                                            <div className="flex gap-0.5">
                                                                {[1,2,3].map(i => (
                                                                    <div key={i} style={{ width: '4px', height: '4px', borderRadius: '1px', background: busesOnRoute[0].crowdStatus === 'Full' ? 'var(--danger)' : (busesOnRoute[0].crowdStatus === 'Substantial' ? 'var(--warning)' : 'var(--accent)') }}></div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </button>
                                        )
                                    })
                            )}
                        </div>
                    </div>

                    {/* CARD 3: BUS BUZZ */}
                    <div className="glass-card flex flex-col" style={{ padding: '1.25rem', minHeight: '380px' }}>
                        <div className="flex items-center justify-between mb-5">
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-lg bg-[#10B981]/10 text-[#10B981]">
                                    <Volume2 size={20} />
                                </div>
                                <h2 className="text-lg font-bold m-0">Bus Buzz</h2>
                            </div>
                            {focusedBusId && (
                                <span className="text-[9px] bg-[#10B981]/20 text-[#10B981] px-1.5 py-0.5 rounded-full font-black animate-pulse">LIVE</span>
                            )}
                        </div>

                        <div className="flex flex-col flex-1 gap-4 overflow-hidden">
                            {!focusedBusId ? (
                                <div className="flex-1 flex flex-col items-center justify-center text-center opacity-40 px-4">
                                    <Info size={32} className="mb-4" />
                                    <p className="text-xs">Select a live bus to provide feedback</p>
                                </div>
                            ) : (
                                <>
                                    <div className="p-3 rounded-lg bg-white/5 border border-white/5 flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center font-bold text-xs shadow-lg shadow-primary/20">
                                            #{focusedBusId.slice(-2)}
                                        </div>
                                        <div className="flex-1 overflow-hidden">
                                            <p className="text-xs font-bold leading-none truncate">BUS #{focusedBusId}</p>
                                            <p className="text-[9px] text-muted truncate">{activeBuses[focusedBusId]?.routeId}</p>
                                        </div>
                                    </div>

                                    <div className="flex flex-col gap-3 py-2 overflow-y-auto custom-scrollbar">
                                        <p style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Current Conditions</p>
                                        <div className="grid grid-cols-2 gap-2">
                                            {[
                                                { id: 'Too Cold', icon: '❄️', label: 'AC High' },
                                                { id: 'Too Hot', icon: '🔥', label: 'AC Low' },
                                                { id: 'Delayed', icon: '🕒', label: 'Stuck' },
                                                { id: 'Full', icon: '🤝', label: 'Packed' }
                                            ].map(reaction => {
                                                const count = busFeedback[focusedBusId]?.[reaction.id] || 0;
                                                return (
                                                    <button
                                                        key={reaction.id}
                                                        onClick={() => submitBusFeedback(focusedBusId, reaction.id)}
                                                        className="flex flex-col items-center gap-1 p-2.5 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 hover:border-white/20 transition-all group"
                                                    >
                                                        <span className="text-xl group-active:scale-125 transition-transform">{reaction.icon}</span>
                                                        <span className="text-[10px] font-bold opacity-60">{reaction.label}</span>
                                                        {count > 0 && (
                                                            <span className="mt-1 text-[9px] bg-primary/20 text-primary px-1.5 py-0.5 rounded-full font-black">
                                                                {count}
                                                            </span>
                                                        )}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    <div style={{ marginTop: 'auto', padding: '1rem', background: 'rgba(59, 130, 246, 0.05)', borderRadius: '12px', border: '1px dashed rgba(59, 130, 246, 0.2)' }}>
                                        <p style={{ fontSize: '0.7rem', color: 'var(--primary)', fontWeight: 800, margin: 0, textAlign: 'center' }}>
                                            Feedback is sent directly to the Admin Command Center.
                                        </p>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </motion.div>
            </div>

            {/* NEAREST BUS HUD - STICKY BOTTOM */}
            <AnimatePresence>
                {nearestBus && (
                    <motion.div 
                        initial={{ y: 100, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: 100, opacity: 0 }}
                        style={{ 
                            position: 'fixed', 
                            bottom: '1.5rem', 
                            left: '50%', 
                            transform: 'translateX(-50%)', 
                            zIndex: 2000, 
                            width: 'calc(100% - 2rem)', 
                            maxWidth: '500px' 
                        }}
                    >
                        <div className="glass-card" style={{ 
                            background: 'rgba(18, 18, 21, 0.95)', 
                            backdropFilter: 'blur(20px)', 
                            border: '1px solid var(--accent)',
                            padding: '1.25rem',
                            boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'between',
                            gap: '1.5rem'
                        }}>
                            <div className="flex items-center gap-4 flex-1">
                                <div style={{ 
                                    width: '56px', height: '56px', borderRadius: '16px', 
                                    background: 'var(--accent)', display: 'flex', 
                                    alignItems: 'center', justifyContent: 'center', 
                                    boxShadow: '0 10px 20px var(--accent-glow)',
                                    position: 'relative'
                                }}>
                                    <BusFront size={28} color="white" />
                                    <div style={{ position: 'absolute', top: '-5px', right: '-5px', background: 'var(--danger)', width: '12px', height: '12px', borderRadius: '50%', border: '2px solid white' }}></div>
                                </div>
                                <div>
                                    <div className="flex items-center gap-2 mb-1">
                                        <h4 style={{ margin: 0, fontSize: '1rem' }}>Bus #{nearestBus.id.slice(-2)}</h4>
                                        <span className="text-[10px] bg-accent/10 text-accent px-1.5 py-0.5 rounded font-black">NEAREST</span>
                                    </div>
                                    <div className="flex items-center gap-3 text-muted" style={{ fontSize: '0.75rem' }}>
                                        <div className="flex items-center gap-1"><Clock size={12} /> {Math.max(1, Math.round(nearestBus.dist * 3))}m</div>
                                        <div className="flex items-center gap-1"><Navigation size={12} /> {nearestBus.dist.toFixed(2)}km</div>
                                        <div className="flex items-center gap-1"><UsersIcon size={12} /> {nearestBus.crowdStatus}</div>
                                    </div>
                                </div>
                            </div>
                            <button 
                                className="btn btn-primary" 
                                style={{ padding: '0.75rem 1.25rem', borderRadius: '12px' }}
                                onClick={() => {
                                    setSelectedRoute(nearestBus.routeId);
                                    setFocusedBusId(nearestBus.id);
                                    setIsFollowMode(true);
                                }}
                            >
                                Track Now
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default UserTracking;
