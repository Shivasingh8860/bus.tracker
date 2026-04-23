import React, { useState, useEffect } from 'react';
import { AuthContext } from './AuthContext';

export const AuthProvider = ({ children }) => {
  // roles: null (visitor), 'admin', 'driver'
  const [user, setUser] = useState(() => {
    const savedUser = localStorage.getItem('bus_tracker_user');
    return savedUser ? JSON.parse(savedUser) : null;
  });

  const login = (role, data) => {
    const userData = { role, ...data };
    setUser(userData);
    localStorage.setItem('bus_tracker_user', JSON.stringify(userData));
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('bus_tracker_user');
    localStorage.removeItem('driver_tracking_state'); // Clear tracking state on logout
  };

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
