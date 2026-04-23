import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useBuses } from '../context/BusesContext';
import { MapPin, Compass, Maximize, Radio, BusFront } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// Fix typical Leaflet marker icon issue
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Icons & Utilities
const stationIcon = new L.DivIcon({
    className: 'custom-station-icon',
    html: `<div style="background: var(--accent); width: 14px; height: 14px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 10px rgba(16, 185, 129, 0.4); transform: translate(-50%, -50%);"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
});

const userIcon = new L.DivIcon({
    className: 'custom-user-icon',
    html: `<div style="background: #3b82f6; width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 0 15px rgba(59, 130, 246, 0.5); border: 2px solid white; transform: translate(-50%, -50%); animate: pulse 2s infinite;"><div style="background: white; width: 8px; height: 8px; border-radius: 50%;"></div></div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
});

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

const calculateHeading = (prev, curr) => {
    if (!prev || !curr) return 0;
    const y = Math.sin((curr.lng - prev.lng) * Math.PI / 180) * Math.cos(curr.lat * Math.PI / 180);
    const x = Math.cos(prev.lat * Math.PI / 180) * Math.sin(curr.lat * Math.PI / 180) -
        Math.sin(prev.lat * Math.PI / 180) * Math.cos(curr.lat * Math.PI / 180) * Math.cos((curr.lng - prev.lng) * Math.PI / 180);
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
};

const center = [28.6865, 77.5533];
const routeCache = new Map();

// Helper Components
const SetNavigationBounds = ({ userLoc, busLoc }) => {
    const map = useMap();
    useEffect(() => {
        if (userLoc && busLoc) {
            const bounds = L.latLngBounds([
                [userLoc.lat, userLoc.lng],
                [busLoc.lat, busLoc.lng]
            ]);
            map.fitBounds(bounds, { padding: [100, 100], maxZoom: 16 });
        }
    }, [userLoc, busLoc, map]);
    return null;
};

const NavigationPath = ({ start, end }) => {
    const [path, setPath] = useState([]);

    useEffect(() => {
        if (!start || !end) return;
        const key = `${start.lat.toFixed(5)},${start.lng.toFixed(5)}-${end.lat.toFixed(5)},${end.lng.toFixed(5)}`;
        if (routeCache.has(key)) {
            setPath(routeCache.get(key));
            return;
        }

        const coords = `${start.lng},${start.lat};${end.lng},${end.lat}`;
        fetch(`https://router.project-osrm.org/route/v1/walking/${coords}?overview=full&geometries=geojson`)
            .then(res => res.json())
            .then(data => {
                if (data.routes && data.routes[0]) {
                    const snapped = data.routes[0].geometry.coordinates.map(c => [c[1], c[0]]);
                    routeCache.set(key, snapped);
                    setPath(snapped);
                } else {
                    setPath([[start.lat, start.lng], [end.lat, end.lng]]);
                }
            })
            .catch(() => setPath([[start.lat, start.lng], [end.lat, end.lng]]));
    }, [start, end]);

    if (path.length === 0) return null;
    return <Polyline positions={path} color="#3b82f6" weight={5} opacity={0.7} dashArray="10, 15" />;
};

export const RoadSnappedPolyline = ({ waypoints, color, weight, opacity, dashArray, congestionScore = 0 }) => {
    const [path, setPath] = useState([]);
    useEffect(() => {
        if (!waypoints || waypoints.length < 2) return;
        const coords = waypoints.map(wp => `${wp.lng},${wp.lat}`).join(';');
        fetch(`https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`)
            .then(res => res.json())
            .then(data => {
                if (data.routes && data.routes[0]) {
                    setPath(data.routes[0].geometry.coordinates.map(c => [c[1], c[0]]));
                } else {
                    setPath(waypoints.map(wp => [wp.lat, wp.lng]));
                }
            })
            .catch(() => setPath(waypoints.map(wp => [wp.lat, wp.lng])));
    }, [waypoints]);

    if (path.length === 0) return null;
    const routeColor = congestionScore > 5 ? 'var(--danger)' : congestionScore > 2 ? 'var(--warning)' : color;
    return <Polyline positions={path} color={routeColor} weight={weight} opacity={opacity} dashArray={dashArray} />;
};

const LocateControl = ({ isFollowMode, setFollowMode }) => {
    const map = useMap();
    const [isFullscreen, setIsFullscreen] = useState(false);
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <button className="glass-card" onClick={() => {
                const mapElem = document.querySelector('.leaflet-container');
                if (!isFullscreen) {
                    if (mapElem.requestFullscreen) mapElem.requestFullscreen();
                } else {
                    if (document.exitFullscreen) document.exitFullscreen();
                }
                setIsFullscreen(!isFullscreen);
            }} style={{ padding: '0.6rem', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)', color: 'white', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <Maximize size={18} />
                <span style={{ fontSize: '0.75rem', fontWeight: 600 }}>Fullscreen</span>
            </button>
            <button className="glass-card" onClick={() => {
                map.locate({ setView: true, maxZoom: 16 });
                setFollowMode(false);
            }} style={{ padding: '0.6rem', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)', color: 'white', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <Compass size={18} color="var(--accent)" />
                <span style={{ fontSize: '0.75rem', fontWeight: 600 }}>Locate Me</span>
            </button>
            <button 
                className="glass-card" 
                onClick={() => setFollowMode(!isFollowMode)} 
                style={{ 
                    padding: '0.6rem', 
                    border: isFollowMode ? '1px solid var(--accent)' : '1px solid rgba(255,255,255,0.1)', 
                    background: isFollowMode ? 'rgba(16, 185, 129, 0.2)' : 'rgba(0,0,0,0.7)', 
                    backdropFilter: 'blur(8px)', 
                    color: isFollowMode ? 'var(--accent)' : 'white', 
                    display: 'flex', 
                    gap: '0.5rem', 
                    alignItems: 'center',
                    boxShadow: isFollowMode ? '0 0 15px rgba(16, 185, 129, 0.3)' : 'none'
                }}
            >
                <Radio size={18} className={isFollowMode ? "animate-pulse" : ""} />
                <span style={{ fontSize: '0.75rem', fontWeight: 600 }}>{isFollowMode ? 'Following' : 'Follow Bus'}</span>
            </button>
        </div>
    );
};

const MapFollower = ({ target, enabled }) => {
    const map = useMap();
    useEffect(() => {
        if (enabled && target) {
            map.panTo([target.lat, target.lng], { animate: true, duration: 1 });
        }
    }, [target, enabled, map]);
    return null;
};

const FleetLegend = () => (
    <div style={{ position: 'absolute', bottom: '1rem', left: '1rem', zIndex: 1000, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)', padding: '0.6rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }}>
        <div className="flex flex-col gap-2">
            {[
                { color: '#10b981', label: 'Empty / Low' },
                { color: '#f59e0b', label: 'Moderate' },
                { color: '#ef4444', label: 'Full / Standing' },
                { color: '#3b82f6', label: 'Navigating To', glow: true }
            ].map(item => (
                <div key={item.label} className="flex items-center gap-2">
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: item.color, boxShadow: item.glow ? `0 0 8px ${item.color}` : 'none' }}></div>
                    <span style={{ fontSize: '0.6rem', color: 'var(--text-main)' }}>{item.label}</span>
                </div>
            ))}
        </div>
    </div>
);

// SMOOTH INTERPOLATED MARKER COMPONENT
const SmoothBusMarker = React.memo(({ bus, isSelected, onBusClick, dynamics, batterySaver, routes, presenceState }) => {
    const [smoothPos, setSmoothPos] = useState([bus.lat, bus.lng]);
    const prevPos = React.useRef([bus.lat, bus.lng]);
    const targetPos = React.useRef([bus.lat, bus.lng]);
    const startTime = React.useRef(Date.now());
    const duration = 5000; // Expected broadcast interval

    useEffect(() => {
        prevPos.current = smoothPos;
        targetPos.current = [bus.lat, bus.lng];
        startTime.current = Date.now();
    }, [bus.lat, bus.lng]);

    useEffect(() => {
        if (batterySaver) {
            setSmoothPos([bus.lat, bus.lng]);
            return;
        }

        let rafId;
        const animate = () => {
            const now = Date.now();
            const progress = Math.min((now - startTime.current) / duration, 1);
            
            // Linear Interpolation (LERP)
            const lat = prevPos.current[0] + (targetPos.current[0] - prevPos.current[0]) * progress;
            const lng = prevPos.current[1] + (targetPos.current[1] - prevPos.current[1]) * progress;
            
            setSmoothPos([lat, lng]);

            if (progress < 1) {
                rafId = requestAnimationFrame(animate);
            }
        };
        rafId = requestAnimationFrame(animate);
        return () => cancelAnimationFrame(rafId);
    }, [bus.lat, bus.lng, batterySaver]);

    const busRoute = routes.find(r => r.id === bus.routeId);
    let isOffRoute = false;
    if (busRoute && busRoute.waypoints) {
        const minDist = Math.min(...busRoute.waypoints.map(wp => getDistance(wp.lat, wp.lng, bus.lat, bus.lng)));
        if (minDist > 0.5) isOffRoute = true;
    }

    const statusColor = bus.crowdStatus === 'Full' ? '#ef4444' : (bus.crowdStatus === 'Substantial' ? '#f59e0b' : '#10b981');
    const glowColor = isSelected ? '#3b82f6' : (isOffRoute ? '#ef4444' : statusColor);
    const isOnline = presenceState[bus.driverId] || 
                     bus.driverId.startsWith('SIM-') || 
                     (new Date() - new Date(bus.updatedAt) < 120000); // 2 min heartbeat fallback

    return (
        <Marker position={smoothPos} icon={new L.DivIcon({
            className: 'custom-bus-icon',
            html: `<div style="transform: scale(${isSelected ? (batterySaver ? 1.15 : 1.3) : 1}); transition: ${batterySaver ? 'none' : 'all 0.4s ease'}; z-index: ${isSelected ? 1000 : 1}; opacity: ${isOnline ? 1 : 0.4}">
                        <div style="background: ${statusColor}; width: 44px; height: 44px; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: ${batterySaver ? 'none' : `0 0 ${isSelected ? '25px' : '15px'} ${glowColor + '99'}`}; border: 4px solid ${isSelected ? '#3b82f6' : 'white'}; transform: translate(-50%, -50%); animation: ${batterySaver ? 'none' : (isOffRoute ? 'pulse-danger 1s infinite' : (isSelected ? 'pulse-nav 1.5s infinite' : 'none'))}; position: relative;">
                        <div style="transform: rotate(${dynamics.heading}deg); transition: ${batterySaver ? 'none' : 'transform 0.5s cubic-bezier(0.4, 0, 0.2, 1)'}; font-size: 1.4rem;">🚌</div>
                        ${dynamics.speed > 0 ? `<div style="position: absolute; bottom: -12px; background: rgba(0,0,0,0.8); color: white; font-size: 8px; padding: 1px 4px; border-radius: 4px; font-weight: 900; border: 1px solid rgba(255,255,255,0.1)">${dynamics.speed} KM/H</div>` : ''}
                        ${isOffRoute ? `<div style="position: absolute; top: -10px; right: -10px; background: #ef4444; color: white; font-size: 8px; padding: 2px 5px; border-radius: 4px; font-weight: 900; border: 2px solid white; box-shadow: 0 0 10px rgba(0,0,0,0.3)">OFF-ROUTE</div>` : ''}
                        ${!isOnline ? `<div style="position: absolute; top: -10px; left: -10px; background: #64748b; color: white; font-size: 8px; padding: 2px 5px; border-radius: 4px; font-weight: 900; border: 1px solid white;">OFFLINE</div>` : ''}
                        </div>
                    </div>`,
            iconSize: [44, 44], iconAnchor: [22, 22]
        })} eventHandlers={{ click: () => onBusClick(bus.driverId) }}>
            <Popup className="bus-popup">
                <div style={{ padding: '0.2rem', minWidth: '150px' }}>
                    <div className="flex justify-between items-center mb-2">
                        <p style={{ fontWeight: 700, fontSize: '1rem' }}>Bus {bus.driver?.busNumber}</p>
                        <span style={{ fontSize: '0.6rem', padding: '2px 6px', borderRadius: '4px', background: statusColor, color: 'white', fontWeight: 800 }}>{bus.crowdStatus}</span>
                    </div>
                    <button onClick={() => onBusClick(isSelected ? null : bus.driverId)} style={{ width: '100%', padding: '0.6rem', borderRadius: '4px', background: isSelected ? '#ef4444' : '#3b82f6', color: 'white', fontWeight: 600, border: 'none', cursor: 'pointer' }}>
                        {isSelected ? '🛑 End Navigation' : '🧭 Start Navigation'}
                    </button>
                </div>
            </Popup>
        </Marker>
    );
});

const MapComponent = ({ selectedRouteId, focusedBusId = null, onBusClick = () => { }, isFollowMode = false, setFollowMode = () => { }, showHistory = false, historyPoints = [], isHeatmap = false, batterySaver = false }) => {
    const { routes, activeBuses, drivers, trafficReports, presenceState } = useBuses();
    const [userLocation, setUserLocation] = useState(null);
    const [mapType, setMapType] = useState('roadmap');
    const [busTrails, setBusTrails] = useState({}); // { driverId: [[lat, lng], ...] }
    const [busDynamics, setBusDynamics] = useState({}); // { driverId: { heading: 0, speed: 0 } }

    useEffect(() => {
        if ("geolocation" in navigator) {
            const watchId = navigator.geolocation.watchPosition(
                (position) => setUserLocation({ lat: position.coords.latitude, lng: position.coords.longitude }),
                (error) => console.error(error),
                { enableHighAccuracy: true }
            );
            return () => navigator.geolocation.clearWatch(watchId);
        }
    }, []);

    // Track historical motion and calculate dynamics
    useEffect(() => {
        if (!activeBuses || Object.keys(activeBuses).length === 0) return;

        setBusTrails(prevTrails => {
            const nextTrails = { ...prevTrails };
            let changed = false;

            Object.entries(activeBuses).forEach(([id, bus]) => {
                if (!bus || typeof bus.lat !== 'number' || typeof bus.lng !== 'number') return;
                
                const trail = nextTrails[id] || [];
                const lastPos = trail[trail.length - 1];

                if (!lastPos || lastPos[0] !== bus.lat || lastPos[1] !== bus.lng) {
                    nextTrails[id] = [...trail, [bus.lat, bus.lng]].slice(-20);
                    changed = true;
                }
            });

            return changed ? nextTrails : prevTrails;
        });

        setBusDynamics(prevDynamics => {
            const nextDynamics = { ...prevDynamics };
            let changed = false;

            Object.entries(activeBuses).forEach(([id, bus]) => {
                if (!bus || typeof bus.lat !== 'number' || typeof bus.lng !== 'number') return;

                const trail = busTrails[id] || [];
                const lastPos = trail[trail.length - 1];

                if (lastPos && (lastPos[0] !== bus.lat || lastPos[1] !== bus.lng)) {
                    const heading = calculateHeading({ lat: lastPos[0], lng: lastPos[1] }, bus) || 0;
                    const dist = getDistance(lastPos[0], lastPos[1], bus.lat, bus.lng) || 0;
                    const timeDelta = 10 / 3600; // 10s estimate
                    const speed = Math.min(80, Math.round(dist / timeDelta)) || 0;
                    
                    nextDynamics[id] = { heading, speed };
                    changed = true;
                }
            });

            return changed ? nextDynamics : prevDynamics;
        });
    }, [activeBuses]); // We intentionally omit trails/dynamics to avoid infinite loops, functional updates handle them.

    const focusedBus = focusedBusId ? { ...activeBuses[focusedBusId], id: focusedBusId } : null;
    const activeBusesList = Object.entries(activeBuses).map(([driverId, data]) => ({
        driverId, driver: drivers.find(d => d.id === driverId), ...data
    }));

    return (
        <div style={{ height: '100%', width: '100%', position: 'relative' }}>
            <style>
                {` @keyframes pulse-nav { 0% { box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.7); } 70% { box-shadow: 0 0 0 10px rgba(59, 130, 246, 0); } 100% { box-shadow: 0 0 0 0 rgba(59, 130, 246, 0); } }
                   @keyframes pulse-danger { 0% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7); } 70% { box-shadow: 0 0 0 10px rgba(239, 68, 68, 0); } 100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); } }
                   .nav-dashboard { position: absolute; top: 1rem; right: 1rem; z-index: 1000; background: rgba(18, 18, 21, 0.85); backdrop-filter: blur(12px); border: 1px solid var(--panel-border); border-radius: var(--radius-md); padding: 1rem; min-width: 220px; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.3); } `}
            </style>

            <AnimatePresence>
                {focusedBus && userLocation && (
                    <motion.div className="nav-dashboard" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}>
                        <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                                <div className="p-1.5 rounded-full bg-accent/20 text-accent"><Radio size={14} className="animate-pulse" /></div>
                                <span style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--accent)', letterSpacing: '0.05em' }}>LIVE NAV</span>
                            </div>
                            <button onClick={() => onBusClick(null)} style={{ background: 'rgba(239, 68, 68, 0.1)', border: 'none', color: 'var(--danger)', fontSize: '0.65rem', fontWeight: 700, padding: '2px 8px', borderRadius: '4px', cursor: 'pointer' }}>END</button>
                        </div>
                        <div className="flex flex-col gap-2">
                            <div className="flex justify-between items-center bg-white/5 p-2 rounded-lg mb-1">
                                <div className="flex flex-col">
                                    <span style={{ fontSize: '0.6rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Current Speed</span>
                                    <span style={{ fontSize: '1.1rem', fontWeight: 900, color: 'var(--accent)' }}>
                                        {busDynamics[focusedBusId]?.speed || 0} <small style={{ fontSize: '0.6rem', opacity: 0.6 }}>KM/H</small>
                                    </span>
                                </div>
                                <div style={{ width: '40px', height: '40px', position: 'relative' }}>
                                    <svg viewBox="0 0 36 36" style={{ transform: 'rotate(-90deg)' }}>
                                        <circle cx="18" cy="18" r="16" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="3" />
                                        <circle cx="18" cy="18" r="16" fill="none" stroke="var(--accent)" strokeWidth="3" 
                                            strokeDasharray={`${(busDynamics[focusedBusId]?.speed || 0) * 100 / 80}, 100`} 
                                            style={{ transition: 'stroke-dasharray 0.5s ease' }}
                                        />
                                    </svg>
                                    <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', fontSize: '10px' }}>⚡</div>
                                </div>
                            </div>
                            <div className="flex justify-between items-end">
                                <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>ETA</span>
                                <span style={{ fontSize: '1.4rem', fontWeight: 800, color: '#3b82f6', lineHeight: 1 }}>
                                    {(() => {
                                        const dist = getDistance(userLocation.lat, userLocation.lng, focusedBus.lat, focusedBus.lng);
                                        const currentSpeed = busDynamics[focusedBusId]?.speed || 20;
                                        const mins = Math.max(1, Math.round((dist / Math.max(5, currentSpeed)) * 60));
                                        return mins < 2 ? 'Soon' : `${mins}m`;
                                    })()}
                                </span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Distance</span>
                                <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                                    {(() => {
                                        const dist = getDistance(userLocation.lat, userLocation.lng, focusedBus.lat, focusedBus.lng);
                                        return dist < 1 ? `${Math.round(dist * 1000)}m` : `${dist.toFixed(2)}km`;
                                    })()}
                                </span>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            <FleetLegend />

            <MapContainer center={center} zoom={13} style={{ height: '100%', width: '100%' }} zoomControl={false}>
                <div className="map-controls-floating" style={{ position: 'absolute', top: '1rem', left: '1rem', zIndex: 1000, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <button className="glass-card" onClick={() => setMapType(mapType === 'roadmap' ? 'satellite' : 'roadmap')} style={{ padding: '0.6rem', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)', color: 'white', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <MapPin size={18} />
                        <span style={{ fontSize: '0.75rem', fontWeight: 600 }}>{mapType === 'roadmap' ? 'Satellite' : 'Roadmap'}</span>
                    </button>
                    <LocateControl isFollowMode={isFollowMode} setFollowMode={setFollowMode} />
                </div>

                <TileLayer url={mapType === 'roadmap' ? "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" : "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"} />

                {/* Heatmap Layer */}
                {isHeatmap && historyPoints.map((p, i) => (
                    <Marker 
                        key={`heat-${i}`} 
                        position={[p.lat, p.lng]} 
                        icon={new L.DivIcon({
                            className: 'heat-point',
                            html: `<div style="background: var(--accent); width: 20px; height: 20px; border-radius: 50%; opacity: 0.15; filter: blur(4px);"></div>`,
                            iconSize: [20, 20],
                            iconAnchor: [10, 10]
                        })}
                    />
                ))}

                {showHistory && !isHeatmap && historyPoints.map((p, i) => (
                    <Marker 
                        key={`hist-${i}`} 
                        position={[p.lat, p.lng]} 
                        icon={new L.DivIcon({
                            className: 'hist-point',
                            html: `<div style="background: rgba(255,255,255,0.4); width: 4px; height: 4px; border-radius: 50%;"></div>`,
                            iconSize: [4, 4],
                            iconAnchor: [2, 2]
                        })}
                    />
                ))}

                {routes.filter(r => selectedRouteId === 'all' || r.id === selectedRouteId).map(route => {
                    const routeCongestion = Object.values(activeBuses).filter(b => b.routeId === route.id).reduce((acc, b) => acc + (trafficReports[b.driverId] || 0), 0);
                    return (
                        <React.Fragment key={route.id}>
                            <RoadSnappedPolyline waypoints={route.waypoints} color="var(--primary)" weight={selectedRouteId === route.id ? 5 : 2} opacity={selectedRouteId === 'all' || selectedRouteId === route.id ? 0.8 : 0.05} congestionScore={routeCongestion} />
                            {route.waypoints.map((wp, idx) => (
                                <Marker key={idx} position={[wp.lat, wp.lng]} icon={stationIcon}>
                                    <Popup className="bus-popup">
                                        <div style={{ padding: '0.2rem', minWidth: '180px' }}>
                                            <p style={{ fontWeight: 800, color: 'var(--text-main)', fontSize: '0.9rem', marginBottom: '0.5rem' }}>{wp.name || `Stop ${idx + 1}`}</p>
                                            <div className="flex flex-col gap-2">
                                                {activeBusesList.filter(b => b.routeId === route.id).map(bus => {
                                                    const dist = getDistance(wp.lat, wp.lng, bus.lat, bus.lng);
                                                    return (
                                                        <div key={bus.driverId} className="flex justify-between items-center p-2 rounded bg-white/5 border border-white/5">
                                                            <span style={{ fontSize: '0.75rem', fontWeight: 700 }}>Bus {bus.driver?.busNumber}</span>
                                                            <span style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--primary)' }}>{Math.max(1, Math.round((dist / 20) * 60))}m</span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    </Popup>
                                </Marker>
                            ))}
                        </React.Fragment>
                    );
                })}

                {focusedBus && userLocation && (
                    <>
                        <NavigationPath start={userLocation} end={{ lat: focusedBus.lat, lng: focusedBus.lng }} />
                        {!isFollowMode && <SetNavigationBounds userLoc={userLocation} busLoc={{ lat: focusedBus.lat, lng: focusedBus.lng }} />}
                    </>
                )}

                <MapFollower target={focusedBus} enabled={isFollowMode} />

                {/* Historical Pathing - ONLY for selected bus to save performance */}
                {focusedBusId && busTrails[focusedBusId] && (
                    <Polyline 
                        positions={busTrails[focusedBusId]} 
                        color="#3b82f6" 
                        weight={3} 
                        opacity={0.4} 
                        dashArray="5, 10" 
                    />
                )}

                {activeBusesList.map(bus => (
                    <SmoothBusMarker 
                        key={bus.driverId} 
                        bus={bus} 
                        isSelected={focusedBusId === bus.driverId}
                        onBusClick={onBusClick}
                        dynamics={busDynamics[bus.driverId] || { heading: 0, speed: 0 }}
                        batterySaver={batterySaver}
                        routes={routes}
                        presenceState={presenceState}
                    />
                ))}

                {userLocation && (
                    <Marker position={[userLocation.lat, userLocation.lng]} icon={userIcon}>
                        <Popup className="bus-popup">
                            <p style={{ fontWeight: 600, margin: 0, fontSize: '0.85rem' }}>Your Location</p>
                        </Popup>
                    </Marker>
                )}
            </MapContainer>
        </div>
    );
};

export default MapComponent;
