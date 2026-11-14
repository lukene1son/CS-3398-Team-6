import React, { useState, useEffect, useCallback } from 'react';
import { getToken, logout, onSessionExpired, getMe } from './api';
import { disconnectSocket } from './socket';
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import './App.css';

import Navbar from './components/Navbar';
import Home from './pages/Home';
import Footer from './components/Footer';
import Login from './components/Login';
import Dashboard from './pages/Dashboard';
import ErrorBoundary from './components/ErrorBoundary';

const STORAGE_KEY = 'buddytech-user';

// True if the JWT hasn't expired. (The browser can't verify the signature;
// the backend still does that on every request.)
function tokenIsLive(token) {
  try {
    const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const { exp } = JSON.parse(atob(part));
    return !exp || exp * 1000 > Date.now();
  } catch {
    return false;
  }
}

// Keep the user logged in across page refreshes
function loadSavedUser() {
    const token = getToken();
    if (!token || !tokenIsLive(token)) return null;
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

  // If the backend rejects the login token (expired or invalid),
  // sign the user out so they land back on the login page.
  useEffect(() => {
    const stopListening = onSessionExpired(() => {
      setCurrentUser(null);
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        /* ignore */
      }
    });
    return stopListening;
  }, []);

  // Close the live connection when the user logs out or their session expires.
  useEffect(() => {
    if (!currentUser?.id) return;
    return () => disconnectSocket();
  }, [currentUser?.id]);

  // Merge changes into the saved user (e.g. new avatar color from Settings).
  const handleUserChange = useCallback((changes) => {
    setCurrentUser((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...changes };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* storage unavailable */
      }
      return next;
    });
  }, []);
    // The login response has no picture or color info, so load it from /api/me.
  useEffect(() => {
    if (!currentUser?.id) return;
    getMe().then(handleUserChange).catch(() => { /* keep what we have */ });
  }, [currentUser?.id, handleUserChange]);

  const handleLogin = (user) => {
    setCurrentUser(user);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
    } catch {
      /* storage unavailable; user just won't persist */
    }
  };

  const handleLogout = () => {
    logout();
    setCurrentUser(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  };

  return (
    <ErrorBoundary>
    <Router>
      <Routes>
        {/* 1. Public Landing Page */}
        <Route path="/" element={currentUser ? <Navigate to="/dashboard" replace /> : <HomeWrapper isLoggedIn={false} />} />

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
               <Dashboard user={currentUser} onLogout={handleLogout} onUserChange={handleUserChange} />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />

        {/* Anything else goes back to the landing page */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
    </ErrorBoundary>
  );
}