import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { BusesContext } from './BusesContext';

// Mock default data (simulate backend)
export const BusesProvider = ({ children }) => {
    const [routes, setRoutes] = useState([]);
    const [drivers, setDrivers] = useState([]);
    const [activeBuses, setActiveBuses] = useState({});
    const [broadcasts, setBroadcasts] = useState([]);
    const [trafficReports, setTrafficReports] = useState({});
    const [messages, setMessages] = useState({}); // { driverId: [msg1, msg2] }
    const [presenceState, setPresenceState] = useState({}); // { driverId: { ... } }
    const [busFeedback, setBusFeedback] = useState({}); // { driverId: { 'Too Cold': 5, ... } }
    const lastLogTime = React.useRef({});

    const addMessage = (driverId, text, userName) => {
        const newMessage = {
            id: Date.now(),
            text,
            userName: userName || 'Passenger',
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        setMessages(prev => ({
            ...prev,
            [driverId]: [...(prev[driverId] || []), newMessage].slice(-20)
        }));
    };

    useEffect(() => {
        // Fetch Initial Data
        const fetchData = async () => {
            const { data: dData } = await supabase.from('drivers').select('*');
            if (dData) {
                setDrivers(dData.map(d => ({
                    ...d,
                    busNumber: d.busnumber || d.busNumber
                })));
            }

            const { data: rData } = await supabase.from('routes').select('*');
            if (rData) {
                // Enhance routes with landmarks for Smart Search
                const enhancedRoutes = rData.map(r => {
                    if (r.waypoints) {
                        r.waypoints = r.waypoints.map(wp => {
                            if (wp.name.toLowerCase().includes('lib')) wp.landmark = 'Library, Study Center';
                            if (wp.name.toLowerCase().includes('gate')) wp.landmark = 'Security, Main Entrance';
                            if (wp.name.toLowerCase().includes('hostel')) wp.landmark = 'Student Housing, Dorms';
                            if (wp.name.toLowerCase().includes('caf')) wp.landmark = 'Food Court, Dining Hall';
                            return wp;
                        });
                    }
                    return r;
                });
                setRoutes(enhancedRoutes);
            }

            const { data: bData } = await supabase.from('active_buses').select('*');
            if (bData) {
                const busMap = {};
                bData.forEach(b => {
                    busMap[b.driver_id] = {
                        lat: b.lat,
                        lng: b.lng,
                        routeId: b.route_id,
                        crowdStatus: b.crowd_status || 'Empty',
                        passengerCount: b.passenger_count || 0,
                        updatedAt: b.updated_at
                    };
                });
                setActiveBuses(busMap);
            }

            const { data: broadcastData } = await supabase.from('broadcasts').select('*').order('created_at', { ascending: false }).limit(3);
            if (broadcastData) setBroadcasts(broadcastData);

            // Fetch Traffic Reports
            const fifteenMinsAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
            const { data: reportData } = await supabase.from('traffic_reports').select('bus_id').gt('created_at', fifteenMinsAgo);
            if (reportData) {
                const counts = {};
                reportData.forEach(r => counts[r.bus_id] = (counts[r.bus_id] || 0) + 1);
                setTrafficReports(counts);
            }
        };

        fetchData();

        // Subscribe to real-time updates
        const busChannel = supabase.channel('public:active_buses')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'active_buses' }, payload => {
                if (payload.eventType === 'DELETE') {
                    setActiveBuses(prev => {
                        const newBuses = { ...prev };
                        delete newBuses[payload.old.driver_id];
                        return newBuses;
                    });
                } else {
                    const b = payload.new;
                    if (b.lat && b.lng) {
                        setActiveBuses(prev => ({
                            ...prev,
                            [b.driver_id]: {
                                lat: b.lat,
                                lng: b.lng,
                                routeId: b.route_id,
                                crowdStatus: b.crowd_status || 'Empty',
                                passengerCount: b.passenger_count || 0,
                                updatedAt: b.updated_at
                            }
                        }));
                    }
                }
            })
            .subscribe();

        const broadcastChannel = supabase.channel('public:broadcasts')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'broadcasts' }, payload => {
                if (payload.eventType === 'INSERT') {
                    setBroadcasts(prev => [payload.new, ...prev].slice(0, 3));
                } else if (payload.eventType === 'DELETE') {
                    setBroadcasts(prev => prev.filter(b => b.id !== payload.old.id));
                }
            })
            .subscribe();

        // Presence Channel Listener
        const presenceChannel = supabase.channel('fleet-presence')
            .on('presence', { event: 'sync' }, () => {
                const newState = presenceChannel.presenceState();
                setPresenceState(newState);
            })
            .on('presence', { event: 'join' }, ({ key, newPresences }) => {
                console.log('Driver joined:', key, newPresences);
            })
            .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
                console.log('Driver left:', key, leftPresences);
            })
            .subscribe();

        // Periodic traffic report refresh
        const trafficInterval = setInterval(async () => {
            const fifteenMinsAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
            const { data } = await supabase.from('traffic_reports').select('bus_id').gt('created_at', fifteenMinsAgo);
            if (data) {
                const counts = {};
                data.forEach(r => counts[r.bus_id] = (counts[r.bus_id] || 0) + 1);
                setTrafficReports(counts);
            }
        }, 30000);

        return () => {
            supabase.removeChannel(busChannel);
            supabase.removeChannel(broadcastChannel);
            supabase.removeChannel(presenceChannel);
            clearInterval(trafficInterval);
        };
    }, []);

    const submitTrafficReport = async (busId) => {
        const { error } = await supabase.from('traffic_reports').insert([{ bus_id: busId }]);
        if (!error) {
            setTrafficReports(prev => ({
                ...prev,
                [busId]: (prev[busId] || 0) + 1
            }));
        }
    };

    const submitBusFeedback = async (driverId, reaction) => {
        setBusFeedback(prev => {
            const current = prev[driverId] || {};
            return {
                ...prev,
                [driverId]: {
                    ...current,
                    [reaction]: (current[reaction] || 0) + 1
                }
            };
        });
        
        await supabase.from('traffic_reports').insert([{ 
            bus_id: driverId, 
            report_type: 'feedback', 
            details: reaction 
        }]);
    };

    // Intercept state changes and push to Supabase
    const addDriverToDB = async (driver) => {
        const payload = {
            id: driver.id,
            name: driver.name,
            busnumber: driver.busNumber,
            password: driver.password
        };
        const { error } = await supabase.from('drivers').insert([payload]);
        if (!error) {
            setDrivers(prev => [...prev, driver]);
        } else {
            console.error("Error adding driver to Supabase:", error);
            alert("Database Error! Failed to insert driver.");
        }
    };

    const removeDriverFromDB = async (id) => {
        const { error } = await supabase.from('drivers').delete().eq('id', id);
        if (!error) {
            setDrivers(prev => prev.filter(d => d.id !== id));
        }
    };

    const addRouteToDB = async (route) => {
        const { error } = await supabase.from('routes').insert([route]);
        if (!error) {
            setRoutes(prev => [...prev, route]);
        } else {
            console.error("Error adding route to Supabase:", error);
            alert("Database Error! Failed to insert route.");
        }
    };

    const updateDriverToDB = async (driver) => {
        const payload = {
            id: driver.id,
            name: driver.name,
            busnumber: driver.busNumber,
            password: driver.password
        };
        const { error } = await supabase.from('drivers').update(payload).eq('id', driver.id);
        if (!error) {
            setDrivers(prev => prev.map(d => d.id === driver.id ? driver : d));
        } else {
            console.error("Error updating driver in Supabase:", error);
            alert("Database Error! Failed to update driver.");
        }
    };

    const updateRouteToDB = async (route) => {
        const { error } = await supabase.from('routes').update(route).eq('id', route.id);
        if (!error) {
            setRoutes(prev => prev.map(r => r.id === route.id ? route : r));
        } else {
            console.error("Error updating route in Supabase:", error);
            alert("Database Error! Failed to update route.");
        }
    };

    const updateBusLocation = async (driverId, lat, lng, routeId, crowdStatus = 'Empty') => {
        if (!lat || !lng || isNaN(lat) || isNaN(lng)) return;
        const now = Date.now();

        // Optimistic UI update
        setActiveBuses(prev => ({
            ...prev,
            [driverId]: { lat, lng, routeId, crowdStatus, updatedAt: new Date().toISOString() }
        }));

        // Push to live broadcast (Skip for simulation buses to avoid DB FK errors)
        if (!driverId.startsWith('SIM-')) {
            await supabase.from('active_buses').upsert({
                driver_id: driverId,
                lat,
                lng,
                route_id: routeId,
                crowd_status: crowdStatus,
                updated_at: new Date().toISOString()
            });

            // Smart Analytics Logging: only log once every 30 seconds to save data
            if (!lastLogTime.current[driverId] || now - lastLogTime.current[driverId] > 30000) {
                lastLogTime.current[driverId] = now;
                await supabase.from('location_history').insert([{
                    driver_id: driverId,
                    route_id: routeId,
                    lat,
                    lng
                }]);
            }
        }
    };

    const updatePassengerCount = async (driverId, delta) => {
        const bus = activeBuses[driverId];
        if (!bus) return;

        const newCount = Math.max(0, (bus.passengerCount || 0) + delta);

        // Auto-calculate crowd status
        let newStatus = 'Empty';
        if (newCount > 20) newStatus = 'Full';
        else if (newCount > 5) newStatus = 'Substantial';

        await supabase.from('active_buses').update({
            passenger_count: newCount,
            crowd_status: newStatus
        }).eq('driver_id', driverId);
    };

    const fetchHistory = async (routeId = null) => {
        let query = supabase.from('location_history').select('*').order('created_at', { ascending: false }).limit(500);
        if (routeId) query = query.eq('route_id', routeId);
        const { data } = await query;
        return data || [];
    };

    const stopBusTracking = async (driverId) => {
        setActiveBuses(prev => {
            const newBuses = { ...prev };
            delete newBuses[driverId];
            return newBuses;
        });

        await supabase.from('active_buses').delete().eq('driver_id', driverId);
    };

    const removeRouteFromDB = async (id) => {
        const { error } = await supabase.from('routes').delete().eq('id', id);
        if (!error) {
            setRoutes(prev => prev.filter(r => r.id !== id));
        } else {
            console.error("Error removing route from Supabase:", error);
            alert("Database Error! Failed to delete route.");
        }
    };

    const sendBroadcast = async (message, type = 'info') => {
        const { error } = await supabase.from('broadcasts').insert([{ message, type }]);
        if (error) {
            console.error("Error sending broadcast:", error);
        }
    };

    const removeBroadcast = async (id) => {
        const { error } = await supabase.from('broadcasts').delete().eq('id', id);
        if (error) {
            console.error("Error removing broadcast:", error);
        }
    };

    return (
        <BusesContext.Provider value={{
            routes, addRoute: addRouteToDB, removeRoute: removeRouteFromDB, updateRoute: updateRouteToDB,
            drivers, addDriver: addDriverToDB, removeDriver: removeDriverFromDB, updateDriver: updateDriverToDB,
            activeBuses, updateBusLocation, stopBusTracking,
            broadcasts, sendBroadcast, removeBroadcast,
            presenceState,
            busFeedback, submitBusFeedback,
            fetchHistory,
            trafficReports, submitTrafficReport,
            updatePassengerCount,
            messages, addMessage
        }}>
            {children}
        </BusesContext.Provider>
    );
};
