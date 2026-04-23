import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthProvider';
import { useAuth } from './context/AuthContext';
import { BusesProvider } from './context/BusesProvider';
import Navbar from './components/Navbar';
import UserTracking from './pages/UserTracking';
import Login from './pages/Login';
import DriverDashboard from './pages/DriverDashboard';
import AdminDashboard from './pages/AdminDashboard';
import PassengerCheckIn from './pages/PassengerCheckIn';

const ProtectedRoute = ({ children, allowedRoles }) => {
  const { user } = useAuth();
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/" replace />;
  }
  return children;
};

const AppContent = () => {
  return (
    <>
      <Navbar />
      <div className="container mt-8">
        <Routes>
          <Route path="/" element={<UserTracking />} />
          <Route path="/login" element={<Login />} />
          <Route
            path="/driver"
            element={
              <ProtectedRoute allowedRoles={['driver']}>
                <DriverDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <AdminDashboard />
              </ProtectedRoute>
            }
          />
          <Route path="/checkin/:busId" element={<PassengerCheckIn />} />
        </Routes>
      </div>
    </>
  );
};

function App() {
  return (
    <Router>
      <AuthProvider>
        <BusesProvider>
          <AppContent />
        </BusesProvider>
      </AuthProvider>
    </Router>
  );
}

export default App;
