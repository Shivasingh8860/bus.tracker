import React, { useState } from 'react';
import { useBuses } from '../context/BusesContext';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, Route as RouteIcon, Plus, Bus, Trash2, MapPin, Search, Edit, Activity, Zap, TrendingUp, ShieldAlert, BarChart3, Thermometer } from 'lucide-react';
import { MapContainer, TileLayer, Marker, useMapEvents, Popup } from 'react-leaflet';
import L from 'leaflet';
import MapComponent, { RoadSnappedPolyline } from '../components/MapComponent';
import { Radio, X, Map as MapIcon2 } from 'lucide-react';

const wpIcon = new L.DivIcon({
    className: 'custom-station-icon',
    html: `<div style="background: var(--accent); width: 16px; height: 16px; border-radius: 50%; border: 3px solid white; box-shadow: 0 0 10px rgba(0,0,0,0.5); transform: translate(-50%, -50%);"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
});

function MapSelector({ waypoints, setWaypoints }) {
    useMapEvents({
        click(e) {
            setWaypoints([...waypoints, { lat: e.latlng.lat, lng: e.latlng.lng, name: `Stop ${waypoints.length + 1}` }]);
        },
    });

    const updateWaypoint = (idx, newData) => {
        const next = [...waypoints];
        next[idx] = { ...next[idx], ...newData };
        setWaypoints(next);
    };

    const removeWaypoint = (idx) => {
        setWaypoints(waypoints.filter((_, i) => i !== idx));
    };

    return (
        <>
            <RoadSnappedPolyline waypoints={waypoints} color="var(--accent)" weight={4} opacity={0.6} dashArray="5, 10" />
            {waypoints.map((wp, idx) => (
                <Marker 
                    key={idx} 
                    position={[wp.lat, wp.lng]} 
                    icon={wpIcon} 
                    draggable={true}
                    eventHandlers={{
                        dragend: (e) => {
                            const { lat, lng } = e.target.getLatLng();
                            updateWaypoint(idx, { lat, lng });
                        }
                    }}
                >
                    <Popup>
                        <div style={{ padding: '0.5rem', minWidth: '150px' }}>
                            <p style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--text-secondary)', marginBottom: '0.5rem', textTransform: 'uppercase' }}>Stop Name</p>
                            <input 
                                type="text" 
                                value={wp.name} 
                                onChange={(e) => updateWaypoint(idx, { name: e.target.value })}
                                style={{ background: 'var(--bg-main)', border: '1px solid var(--panel-border)', padding: '0.4rem', width: '100%', marginBottom: '0.75rem' }}
                            />
                            <button 
                                onClick={() => removeWaypoint(idx)} 
                                className="btn btn-danger w-full" 
                                style={{ padding: '0.4rem', fontSize: '0.7rem' }}
                            >
                                <Trash2 size={12} /> Remove Point
                            </button>
                        </div>
                    </Popup>
                </Marker>
            ))}
        </>
    );
}

const AdminDashboard = () => {
    const { 
        drivers, addDriver: handleAddDriverDB, removeDriver: handleRemoveDriverDB, updateDriver: handleUpdateDriverDB,
        routes, addRoute: handleAddRouteDB, removeRoute: handleRemoveRouteDB, updateRoute: handleUpdateRouteDB, 
        activeBuses,
        broadcasts, sendBroadcast: handleSendBroadcast, removeBroadcast: handleRemoveBroadcast,
        fetchHistory: handleFetchHistory,
        updateBusLocation: handleUpdateBusLocation,
        stopBusTracking: handleStopBusTracking
    } = useBuses();

    const [newDriver, setNewDriver] = useState({ id: '', name: '', busNumber: '', password: '' });
    const [editingDriverId, setEditingDriverId] = useState(null);
    const [newRoute, setNewRoute] = useState({ id: '', name: '' });
    const [routeWaypoints, setRouteWaypoints] = useState([]);
    const [editingRouteId, setEditingRouteId] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [showHistory, setShowHistory] = useState(false);
    const [historyPoints, setHistoryPoints] = useState([]);
    const [showHeatmap, setShowHeatmap] = useState(false);
    const [activeSimulations, setActiveSimulations] = useState({}); // { routeId: intervalId }
    const [replayMode, setReplayMode] = useState(false);
    const [replayTime, setReplayTime] = useState(0); // Index in history
    const [replayData, setReplayData] = useState([]);

    const toggleAnalytics = async () => {
        if (!showHistory && !showHeatmap) {
            const data = await handleFetchHistory();
            setHistoryPoints(data);
            setShowHistory(true);
        } else {
            setShowHistory(false);
            setShowHeatmap(false);
        }
    };

    const toggleHeatmap = async () => {
        if (!showHeatmap) {
            const data = await handleFetchHistory();
            setHistoryPoints(data);
            setShowHeatmap(true);
            setShowHistory(false);
            setReplayMode(false);
        } else {
            setShowHeatmap(false);
        }
    };

    const toggleReplay = async () => {
        if (!replayMode) {
            const data = await handleFetchHistory();
            // Group by time (approximate segments of 30s)
            const sorted = data.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
            setReplayData(sorted);
            setReplayMode(true);
            setShowHistory(false);
            setShowHeatmap(false);
        } else {
            setReplayMode(false);
        }
    };

    const replayBuses = React.useMemo(() => {
        if (!replayMode || replayData.length === 0) return {};
        // Find points around the replayTime
        const currentTime = new Date(replayData[0].created_at).getTime() + (replayTime * 60000); // replayTime is minutes from start
        const buses = {};
        
        // Show the latest point for each bus before this time
        replayData.forEach(p => {
            const pTime = new Date(p.created_at).getTime();
            if (pTime <= currentTime) {
                buses[p.driver_id] = {
                    lat: p.lat,
                    lng: p.lng,
                    routeId: p.route_id,
                    updatedAt: p.created_at,
                    crowdStatus: 'Unknown'
                };
            }
        });
        return buses;
    }, [replayMode, replayData, replayTime]);

    const fleetStats = React.useMemo(() => {
        const buses = Object.values(activeBuses);
        const totalPax = buses.reduce((acc, b) => acc + (b.passengerCount || 0), 0);
        const avgSpeed = 25; // Placeholder for logic
        const health = buses.length > 0 ? 100 : 0; 
        return { totalPax, avgSpeed, health, activeCount: buses.length };
    }, [activeBuses]);

    const handleFollowDriver = async (driverId) => {
        if (!driverId) return;
        const history = await handleFetchHistory();
        const driverPoints = history
            .filter(p => p.driver_id === driverId)
            .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
            .slice(-15); // Take last 15 points
        
        if (driverPoints.length < 2) {
            alert("Not enough historical data for this driver.");
            return;
        }

        const newWaypoints = driverPoints.map((p, idx) => ({
            lat: p.lat,
            lng: p.lng,
            name: idx === 0 ? 'Start' : idx === driverPoints.length - 1 ? 'End' : `Point ${idx + 1}`
        }));
        setRouteWaypoints(newWaypoints);
    };

    const startSimulation = (route) => {
        if (!route.waypoints || route.waypoints.length < 2) return;
        if (activeSimulations[route.id]) {
            clearInterval(activeSimulations[route.id]);
            setActiveSimulations(prev => {
                const next = { ...prev };
                delete next[route.id];
                return next;
            });
            handleStopBusTracking(`SIM-${route.id}`);
            return;
        }

        let wpIndex = 0;
        const simId = `SIM-${route.id}`;
        
        const interval = setInterval(() => {
            const wp = route.waypoints[wpIndex];
            handleUpdateBusLocation(simId, wp.lat, wp.lng, route.id, 'Empty');
            wpIndex = (wpIndex + 1) % route.waypoints.length;
        }, 5000); // Move every 5s

        setActiveSimulations(prev => ({ ...prev, [route.id]: interval }));
    };

    const handleSearchAdd = async () => {
        if (!searchQuery) return;
        // No limit for infinite waypoints support

        try {
            const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(searchQuery)}`);
            const data = await res.json();

            if (data && data.length > 0) {
                const name = `Stop ${routeWaypoints.length + 1}`;
                setRouteWaypoints(prev => [...prev, { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon), name }]);
                setSearchQuery('');
            } else {
                alert("Location not found.");
            }
        } catch (e) {
            console.error('Search error', e);
        }
    };

    const handleDriverSubmit = (e) => {
        e.preventDefault();
        if (!newDriver.id || !newDriver.name || !newDriver.busNumber || !newDriver.password) return;
        if (editingDriverId) {
            handleUpdateDriverDB({ ...newDriver, originalId: editingDriverId });
            setEditingDriverId(null);
        } else {
            handleAddDriverDB(newDriver);
        }
        setNewDriver({ id: '', name: '', busNumber: '', password: '' });
    };

    const handleRouteSubmit = (e) => {
        e.preventDefault();
        if (!newRoute.id || !newRoute.name) return;
        if (routeWaypoints.length < 2) {
            alert("Select at least 2 points on the map.");
            return;
        }
        if (editingRouteId) {
            handleUpdateRouteDB({ ...newRoute, waypoints: routeWaypoints, originalId: editingRouteId });
            setEditingRouteId(null);
        } else {
            handleAddRouteDB({ ...newRoute, waypoints: routeWaypoints });
        }
        setNewRoute({ id: '', name: '' });
        setRouteWaypoints([]);
    };

    const removeDriver = (id) => {
        handleRemoveDriverDB(id);
    };

    const removeRoute = (id) => {
        if (window.confirm("Delete this route permanently?")) {
            handleRemoveRouteDB(id);
        }
    };

    return (
        <div className="container" style={{ paddingBottom: '4rem' }}>
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 mb-10 mt-4">
                <div>
                    <h1 className="title-gradient" style={{ fontSize: 'clamp(2rem, 5vw, 2.75rem)' }}>Command Center</h1>
                    <p style={{ color: 'var(--text-secondary)' }}>Fleet Intelligence & Infrastructure Control</p>
                </div>

                <div className="flex flex-wrap gap-3">
                    <button 
                        onClick={toggleAnalytics}
                        className={`btn ${showHistory ? 'btn-primary' : 'btn-outline'}`}
                        style={{ fontSize: '0.75rem', padding: '0.6rem 1.2rem' }}
                    >
                        <MapPin size={16} /> {showHistory ? 'Hide Pathing' : 'Recent Pathing'}
                    </button>
                    <button 
                        onClick={toggleHeatmap}
                        className={`btn ${showHeatmap ? 'btn-primary' : 'btn-outline'}`}
                        style={{ fontSize: '0.75rem', padding: '0.6rem 1.2rem', borderColor: showHeatmap ? 'transparent' : 'var(--accent)', color: showHeatmap ? 'white' : 'var(--accent)' }}
                    >
                        <Thermometer size={16} /> {showHeatmap ? 'Heatmap Active' : 'Density Heatmap'}
                    </button>
                    <button 
                        onClick={toggleReplay}
                        className={`btn ${replayMode ? 'btn-primary' : 'btn-outline'}`}
                        style={{ fontSize: '0.75rem', padding: '0.6rem 1.2rem', borderColor: replayMode ? 'transparent' : '#8b5cf6', color: replayMode ? 'white' : '#8b5cf6' }}
                    >
                        <Activity size={16} /> {replayMode ? 'Replay Active' : 'Fleet Replay'}
                    </button>
                </div>
            </div>

            {/* QUICK STATS HUD */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                <motion.div className="glass-card" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} style={{ padding: '1.25rem' }}>
                    <div className="flex items-center gap-3 mb-2">
                        <div style={{ background: 'rgba(59, 130, 246, 0.1)', padding: '0.5rem', borderRadius: '8px' }}><Bus size={18} color="#3b82f6" /></div>
                        <span style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Fleet Status</span>
                    </div>
                    <div className="flex items-end justify-between">
                        <h2 style={{ fontSize: '1.75rem', margin: 0 }}>{fleetStats.activeCount} <small style={{ fontSize: '0.8rem', opacity: 0.5 }}>LIVE</small></h2>
                        <span style={{ fontSize: '0.7rem', color: '#10B981', fontWeight: 700 }}>● Operational</span>
                    </div>
                </motion.div>

                <motion.div className="glass-card" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} style={{ padding: '1.25rem' }}>
                    <div className="flex items-center gap-3 mb-2">
                        <div style={{ background: 'rgba(16, 185, 129, 0.1)', padding: '0.5rem', borderRadius: '8px' }}><Users size={18} color="#10B981" /></div>
                        <span style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Active Load</span>
                    </div>
                    <div className="flex items-end justify-between">
                        <h2 style={{ fontSize: '1.75rem', margin: 0 }}>{fleetStats.totalPax} <small style={{ fontSize: '0.8rem', opacity: 0.5 }}>PAX</small></h2>
                        <div className="flex flex-col items-end">
                            <TrendingUp size={14} color="#10B981" />
                            <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>+12% vs last hr</span>
                        </div>
                    </div>
                </motion.div>

                <motion.div className="glass-card" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} style={{ padding: '1.25rem' }}>
                    <div className="flex items-center gap-3 mb-2">
                        <div style={{ background: 'rgba(245, 158, 11, 0.1)', padding: '0.5rem', borderRadius: '8px' }}><Zap size={18} color="#f59e0b" /></div>
                        <span style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Efficiency</span>
                    </div>
                    <div className="flex items-end justify-between">
                        <h2 style={{ fontSize: '1.75rem', margin: 0 }}>94<small style={{ fontSize: '0.8rem', opacity: 0.5 }}>%</small></h2>
                        <div style={{ width: '40px', height: '4px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px', overflow: 'hidden' }}>
                            <div style={{ width: '94%', height: '100%', background: '#f59e0b' }}></div>
                        </div>
                    </div>
                </motion.div>

                <motion.div className="glass-card" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} style={{ padding: '1.25rem' }}>
                    <div className="flex items-center gap-3 mb-2">
                        <div style={{ background: 'rgba(239, 68, 68, 0.1)', padding: '0.5rem', borderRadius: '8px' }}><ShieldAlert size={18} color="#ef4444" /></div>
                        <span style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Security</span>
                    </div>
                    <div className="flex items-end justify-between">
                        <h2 style={{ fontSize: '1.75rem', margin: 0 }}>0 <small style={{ fontSize: '0.8rem', opacity: 0.5 }}>ALERTS</small></h2>
                        <span style={{ fontSize: '0.6rem', opacity: 0.5 }}>Clear Skies</span>
                    </div>
                </motion.div>
            </div>

            {/* Fleet Live View with Analytics */}
            <motion.div 
                className="glass-card mb-8 overflow-hidden map-responsive-wrapper" 
                initial={{ opacity: 0, scale: 0.99 }}
                animate={{ opacity: 1, scale: 1 }}
                style={{ padding: 0, position: 'relative' }}
            >
                <div style={{ position: 'absolute', top: '15px', right: '15px', zIndex: 1000 }}>
                    <div className="glass-card" style={{ padding: '0.5rem 1rem', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(10px)', fontSize: '0.8rem', fontWeight: 600 }}>
                        {showHistory ? 'Showing last 500 coordinates' : 'Real-time positioning'}
                    </div>
                </div>
                <MapComponent 
                    selectedRouteId="all" 
                    notificationsEnabled={false} 
                    showHistory={showHistory || showHeatmap}
                    historyPoints={historyPoints}
                    isHeatmap={showHeatmap}
                    activeBuses={replayMode ? replayBuses : activeBuses}
                />

                {/* REPLAY CONTROLS OVERLAY */}
                {replayMode && (
                    <div style={{
                        position: 'absolute',
                        bottom: '2rem',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        width: '90%',
                        maxWidth: '600px',
                        background: 'rgba(18, 18, 21, 0.95)',
                        backdropFilter: 'blur(20px)',
                        padding: '1.5rem',
                        borderRadius: '1.5rem',
                        border: '1px solid #8b5cf6',
                        zIndex: 1000,
                        boxShadow: '0 20px 50px rgba(0,0,0,0.8)'
                    }}>
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-3">
                                <div style={{ padding: '0.6rem', borderRadius: '50%', background: 'rgba(139, 92, 246, 0.2)', color: '#8b5cf6' }}>
                                    <TrendingUp size={20} className="animate-pulse" />
                                </div>
                                <div>
                                    <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 800, color: 'white' }}>Fleet Replay</h4>
                                    <p style={{ margin: 0, fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                                        {replayData.length > 0 && new Date(new Date(replayData[0].created_at).getTime() + (replayTime * 60000)).toLocaleString()}
                                    </p>
                                </div>
                            </div>
                            <button onClick={() => setReplayMode(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                                <X size={20} />
                            </button>
                        </div>
                        <input 
                            type="range" 
                            min="0" 
                            max={replayData.length > 0 ? Math.floor((new Date(replayData[replayData.length - 1].created_at) - new Date(replayData[0].created_at)) / 60000) : 100} 
                            value={replayTime} 
                            onChange={(e) => setReplayTime(parseInt(e.target.value))}
                            style={{ width: '100%', accentColor: '#8b5cf6', cursor: 'pointer', height: '6px' }}
                        />
                        <div className="flex justify-between mt-2" style={{ fontSize: '0.6rem', color: 'var(--text-muted)', fontWeight: 700 }}>
                            <span>START</span>
                            <span style={{ color: '#8b5cf6' }}>HISTORICAL PLAYBACK ACTIVE</span>
                            <span>END</span>
                        </div>
                    </div>
                )}
            </motion.div>

            <div className="layout-equal">
                {/* Driver Management */}
                <motion.div className="glass-card" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}>
                    <div className="flex items-center gap-2 mb-6">
                        <Users size={20} color="var(--primary)" />
                        <h3>Drivers</h3>
                    </div>

                    <form onSubmit={handleDriverSubmit} className="flex flex-col gap-3 mb-8">
                        <div className="form-grid">
                            <input type="text" placeholder="Driver ID" value={newDriver.id} onChange={e => setNewDriver({ ...newDriver, id: e.target.value })} required disabled={!!editingDriverId} />
                            <input type="text" placeholder="Full Name" value={newDriver.name} onChange={e => setNewDriver({ ...newDriver, name: e.target.value })} required />
                        </div>
                        <div className="form-grid">
                            <input type="text" placeholder="Bus Number" value={newDriver.busNumber} onChange={e => setNewDriver({ ...newDriver, busNumber: e.target.value })} required />
                            <input type="password" placeholder="Password" value={newDriver.password} onChange={e => setNewDriver({ ...newDriver, password: e.target.value })} required={!editingDriverId} />
                        </div>
                        <div className="flex gap-2">
                            <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>
                                {editingDriverId ? <><Edit size={18} /> Update Driver</> : <><Plus size={18} /> Register Driver</>}
                            </button>
                            {editingDriverId && (
                                <button type="button" className="btn btn-outline" onClick={() => { setEditingDriverId(null); setNewDriver({ id: '', name: '', busNumber: '', password: '' }) }}>Cancel</button>
                            )}
                        </div>
                    </form>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {drivers.map(d => (
                            <div key={d.id} className="flex justify-between items-center" style={{ padding: '0.75rem 1rem', background: 'var(--bg-input)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--panel-border)' }}>
                                <div>
                                    <p style={{ fontWeight: 500, fontSize: '0.95rem' }}>{d.name}</p>
                                    <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{d.id} • {d.busNumber}</p>
                                </div>
                                <div className="flex gap-2">
                                    <button onClick={() => {
                                        setEditingDriverId(d.id);
                                        setNewDriver({ id: d.id, name: d.name, busNumber: d.busNumber, password: d.password || '' });
                                    }} className="btn btn-outline" style={{ padding: '0.4rem', borderRadius: '50%' }}>
                                        <Edit size={14} />
                                    </button>
                                    <button onClick={() => removeDriver(d.id)} className="btn btn-danger" style={{ padding: '0.4rem', borderRadius: '50%' }}>
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </motion.div>

                {/* Route Management */}
                <motion.div className="glass-card" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }}>
                    <div className="flex items-center gap-2 mb-6">
                        <RouteIcon size={20} color="var(--accent)" />
                        <h3>Routes</h3>
                    </div>

                    <form onSubmit={handleRouteSubmit} className="flex flex-col gap-4 mb-8">
                        <div className="flex gap-2">
                            <input
                                type="text"
                                placeholder="Search location..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSearchAdd(); } }}
                            />
                            <button type="button" className="btn btn-outline" onClick={handleSearchAdd}>
                                <Search size={18} />
                            </button>
                        </div>

                        <div className="flex flex-col gap-2">
                            <p style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '0' }}>Smart Creation</p>
                            <div className="flex gap-2">
                                <select 
                                    className="flex-1" 
                                    onChange={(e) => handleFollowDriver(e.target.value)}
                                    defaultValue=""
                                    style={{ fontSize: '0.8rem' }}
                                >
                                    <option value="" disabled>Follow Active Driver...</option>
                                    {Object.entries(activeBuses).map(([id, bus]) => (
                                        <option key={id} value={id}>Bus {drivers.find(d => d.id === id)?.busNumber || id}</option>
                                    ))}
                                </select>
                                <button type="button" className="btn btn-outline" onClick={() => setRouteWaypoints([])} title="Clear Map">
                                    <X size={16} />
                                </button>
                            </div>
                        </div>

                        <div style={{ height: '220px', borderRadius: 'var(--radius-sm)', overflow: 'hidden', border: '1px solid var(--panel-border)', position: 'relative', zIndex: 1 }}>
                            <MapContainer center={[28.6865, 77.5533]} zoom={13} style={{ height: '100%', width: '100%' }}>
                                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                                <MapSelector waypoints={routeWaypoints} setWaypoints={setRouteWaypoints} />
                            </MapContainer>
                        </div>

                        <div className="form-grid">
                            <input type="text" placeholder="Route ID" value={newRoute.id} onChange={e => setNewRoute({ ...newRoute, id: e.target.value })} required disabled={!!editingRouteId} />
                            <input type="text" placeholder="Description" value={newRoute.name} onChange={e => setNewRoute({ ...newRoute, name: e.target.value })} required />
                        </div>
                        <div className="flex gap-2">
                            <button type="submit" className="btn btn-outline" style={{ flex: 1, border: '1px solid var(--accent)', color: 'var(--accent)' }}>
                                {editingRouteId ? <><Edit size={18} /> Update Route</> : <><Plus size={18} /> Deploy Route</>}
                            </button>
                            {editingRouteId && (
                                <button type="button" className="btn btn-outline" onClick={() => { setEditingRouteId(null); setNewRoute({ id: '', name: '' }); setRouteWaypoints([]); }}>Cancel</button>
                            )}
                        </div>
                    </form>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {routes.map(r => (
                            <div key={r.id} className="flex justify-between items-center" style={{ padding: '0.75rem 1rem', background: 'var(--bg-input)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--panel-border)' }}>
                                <div>
                                    <p style={{ fontWeight: 500, fontSize: '0.95rem' }}>{r.name}</p>
                                    <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{r.id} • {r.waypoints?.length || 0} nodes</p>
                                </div>
                                <div className="flex gap-2">
                                    <button 
                                        onClick={() => startSimulation(r)} 
                                        className={`btn ${activeSimulations[r.id] ? 'btn-primary' : 'btn-outline'}`} 
                                        style={{ padding: '0.4rem', borderRadius: '50%', color: activeSimulations[r.id] ? 'white' : 'var(--accent)', borderColor: activeSimulations[r.id] ? 'transparent' : 'var(--accent)' }}
                                        title={activeSimulations[r.id] ? "Stop Simulation" : "Run Simulation"}
                                    >
                                        <Zap size={14} className={activeSimulations[r.id] ? "animate-pulse" : ""} />
                                    </button>
                                    <button onClick={() => {
                                        setEditingRouteId(r.id);
                                        setNewRoute({ id: r.id, name: r.name });
                                        setRouteWaypoints(r.waypoints ? [...r.waypoints] : []);
                                    }} className="btn btn-outline" style={{ padding: '0.4rem', borderRadius: '50%' }}>
                                        <Edit size={14} />
                                    </button>
                                    <button onClick={() => removeRoute(r.id)} className="btn btn-danger" style={{ padding: '0.4rem', borderRadius: '50%' }}>
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </motion.div>
            </div>

            {/* SECURITY & AUDIT HUD */}
            <div className="layout-equal mt-8">
                <motion.div className="glass-card" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} style={{ border: '1px solid rgba(239, 68, 68, 0.1)' }}>
                    <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-2">
                            <ShieldAlert size={20} color="var(--danger)" />
                            <h3 className="m-0">Security Scan</h3>
                        </div>
                        <span className="text-[10px] bg-danger/10 text-danger px-2 py-1 rounded-full font-black">LIVE MONITOR</span>
                    </div>

                    <div className="flex flex-col gap-3">
                        {Object.entries(activeBuses).map(([id, bus]) => {
                            const busRoute = routes.find(r => r.id === bus.routeId);
                            let isOffRoute = false;
                            if (busRoute && busRoute.waypoints) {
                                // Simple euclidean distance for quick UI check
                                const minDist = Math.min(...busRoute.waypoints.map(wp => {
                                    const dLat = wp.lat - bus.lat;
                                    const dLng = wp.lng - bus.lng;
                                    return Math.sqrt(dLat*dLat + dLng*dLng) * 111; // Approx km
                                }));
                                if (minDist > 0.5) isOffRoute = true;
                            }

                            if (!isOffRoute) return null;

                            const driverInfo = drivers.find(d => d.id === id);
                            const busLabel = driverInfo ? driverInfo.busNumber : (id.startsWith('SIM-') ? 'GHOST' : id);

                            return (
                                <div key={id} className="flex justify-between items-center p-3 rounded-lg bg-danger/5 border border-danger/10 animate-pulse">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-danger flex items-center justify-center text-white font-bold text-xs">!</div>
                                        <div>
                                            <p className="text-xs font-bold m-0 text-danger">Bus {busLabel} Off-Route</p>
                                            <p className="text-[10px] opacity-60 m-0">Detected {new Date(bus.updatedAt).toLocaleTimeString()}</p>
                                        </div>
                                    </div>
                                    <button 
                                        onClick={() => handleSendBroadcast(`Emergency Alert for Bus ${busLabel}: Please return to route immediately.`, 'emergency')} 
                                        className="btn btn-sm btn-danger" 
                                        style={{ fontSize: '10px', padding: '4px 8px' }}
                                    >
                                        ALERT DRIVER
                                    </button>
                                </div>
                            );
                        }).filter(Boolean).length === 0 && (
                            <div className="text-center py-8 opacity-40">
                                <Activity size={32} className="mx-auto mb-2 opacity-20" />
                                <p className="text-xs">No active security threats detected</p>
                            </div>
                        )}
                    </div>
                </motion.div>

                <motion.div className="glass-card" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
                    <div className="flex items-center gap-2 mb-6">
                        <BarChart3 size={20} color="var(--accent)" />
                        <h3>Route Auditor</h3>
                    </div>
                    
                    <div className="flex flex-col gap-2">
                        {[
                            { route: 'Express 1', bus: 'B-22', status: 'On Time', duration: '18m' },
                            { route: 'Campus Loop', bus: 'B-09', status: 'Delayed', duration: '24m' },
                            { route: 'Hostel Shuttle', bus: 'B-15', status: 'On Time', duration: '12m' }
                        ].map((log, i) => (
                            <div key={i} className="flex justify-between items-center p-3 rounded-lg bg-white/5 border border-white/5">
                                <div>
                                    <p className="text-xs font-bold m-0">{log.route}</p>
                                    <p className="text-[10px] text-muted m-0">Bus {log.bus} • Trip Duration: {log.duration}</p>
                                </div>
                                <span className={`text-[9px] px-2 py-1 rounded font-bold ${log.status === 'On Time' ? 'bg-[#10B981]/10 text-[#10B981]' : 'bg-orange-500/10 text-orange-500'}`}>
                                    {log.status}
                                </span>
                            </div>
                        ))}
                        <button className="btn btn-outline w-full mt-2" style={{ fontSize: '0.7rem' }}>View Full Audit Logs</button>
                    </div>
                </motion.div>
            </div>

            {/* Operational Efficiency: Broadcast Center */}
            <motion.div 
                className="glass-card mt-8" 
                initial={{ opacity: 0, y: 20 }} 
                animate={{ opacity: 1, y: 0 }}
                style={{ border: '1px solid var(--primary-glow)' }}
            >
                <div className="flex items-center gap-2 mb-6">
                    <div style={{ background: 'var(--primary)', padding: '8px', borderRadius: '50%' }}>
                        <Plus size={20} color="white" />
                    </div>
                    <h3>Global Broadcast Center</h3>
                </div>

                <div className="layout-equal">
                    <div>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1rem' }}>
                            Send real-time alerts to every student's map instantly.
                        </p>
                        <form onSubmit={(e) => {
                            e.preventDefault();
                            const msg = e.target.msg.value;
                            const type = e.target.type.value;
                            if (!msg) return;
                            handleSendBroadcast(msg, type);
                            e.target.reset();
                        }} className="flex flex-col gap-3">
                            <textarea name="msg" placeholder="Type emergency message here..." style={{ minHeight: '100px', resize: 'none' }} required></textarea>
                            <div className="flex gap-2">
                                <select name="type" style={{ flex: 1 }}>
                                    <option value="info">Information (Blue)</option>
                                    <option value="warning">Warning (Orange)</option>
                                    <option value="emergency">Emergency (Red)</option>
                                </select>
                                <button type="submit" className="btn btn-primary">Publish Alert</button>
                            </div>
                        </form>
                    </div>

                    <div style={{ background: 'rgba(255,255,255,0.02)', padding: '1.5rem', borderRadius: 'var(--radius-md)', border: '1px dashed var(--panel-border)' }}>
                        <h4 style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1rem', textTransform: 'uppercase' }}>Active Announcements</h4>
                        <div className="flex flex-col gap-3">
                            {broadcasts?.length === 0 && <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>No active broadcasts.</p>}
                            {broadcasts?.map(b => (
                                <div key={b.id} className="flex justify-between items-start gap-4" style={{ padding: '1rem', border: '1px solid var(--panel-border)', borderRadius: 'var(--radius-sm)', background: 'var(--bg-main)' }}>
                                    <p style={{ fontSize: '0.9rem', lineHeight: 1.4 }}>{b.message}</p>
                                    <button onClick={() => handleRemoveBroadcast(b.id)} className="btn btn-danger" style={{ padding: '0.3rem', borderRadius: '50%' }}>
                                        <Trash2 size={12} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </motion.div>
        </div>
    );
};

export default AdminDashboard;
