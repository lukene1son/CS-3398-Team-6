import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate } from 'react-router-dom';

import Navbar from './components/Navbar';
import Home from './pages/Home';
import Footer from './components/Footer';
import Login from './components/Login';
import Dashboard from './pages/Dashboard';

const STORAGE_KEY = 'buddytech-user';

// Keep the user logged in across page refreshes
function loadSavedUser() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// Wrapper for Home to pass navigation to Navbar buttons
function HomeWrapper({ isLoggedIn }) {
  const navigate = useNavigate();
  const goToApp = () => navigate(isLoggedIn ? '/dashboard' : '/login');
  return (
    <div className="app-container">
      <Navbar onLoginClick={goToApp} isLoggedIn={isLoggedIn} />
      <Home onGetStarted={goToApp} isLoggedIn={isLoggedIn} />
      <Footer />
    </div>
  );
}

// Wrapper for Login to handle successful sign in
function LoginWrapper({ onLogin }) {
  const navigate = useNavigate();

  const handleSuccessfulLogin = (userData) => {
    onLogin(userData);
    navigate('/dashboard');
  };

  return <Login onLogin={handleSuccessfulLogin} />;
}

export default function App() {
  const [currentUser, setCurrentUser] = useState(loadSavedUser);

  const handleLogin = (user) => {
    setCurrentUser(user);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
    } catch {
      /* storage unavailable; user just won't persist */
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  };

  return (
    <Router>
      <Routes>
        {/* 1. Public Landing Page */}
        <Route path="/" element={<HomeWrapper isLoggedIn={!!currentUser} />} />

        {/* 2. Login Page */}
        <Route
          path="/login"
          element={
            currentUser ? (
              <Navigate to="/dashboard" replace />
            ) : (
              <LoginWrapper onLogin={handleLogin} />
            )
          }
        />

        {/* 3. Student Dashboard */}
        <Route
          path="/dashboard"
          element={
            currentUser ? (
              <Dashboard user={currentUser} onLogout={handleLogout} />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />

        {/* Anything else goes back to the landing page */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}