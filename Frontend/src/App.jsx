import React, { useState, useEffect, useCallback } from 'react';
import { getToken, logout, onSessionExpired, getMe } from './api';
import { disconnectSocket } from './socket';
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import './App.css';

import Navbar from './components/layout/Navbar';
import Home from './pages/Landing/Home';
import Footer from './components/layout/Footer';
import Login from './components/auth/Login';
import CanvasContinue from './components/auth/CanvasContinue';
import Dashboard from './pages/Dashboard/Dashboard';
import ErrorBoundary from './components/layout/ErrorBoundary';

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
  // "Get Started" (and the hero's "Find a Tech Buddy"): straight to Create Account.
  const goToSignUp = () => navigate(isLoggedIn ? '/dashboard' : '/login', { state: { mode: 'register' } });
  return (
    <div className="app-container">
      <Navbar onLoginClick={goToApp} onGetStartedClick={goToSignUp} isLoggedIn={isLoggedIn} />
      <Home onGetStarted={goToSignUp} isLoggedIn={isLoggedIn} />
      <Footer />
    </div>
  );
}

// Wrapper for Login to handle successful sign in
function LoginWrapper({ currentUser, onLogin }) {
  // Opened from "Get Started": start on Create Account instead of Sign In.
  const routeState = useLocation().state;
  const initialMode = routeState?.mode === 'register' ? 'register' : 'login';

  if (currentUser) {
    return <Navigate to={routeState?.returnToCanvas ? '/canvas/continue' : '/dashboard'} replace />;
  }
  return <Login onLogin={onLogin} initialMode={initialMode} />;
}

export default function App() {
  const [currentUser, setCurrentUser] = useState(loadSavedUser);
  // Where /dashboard sends you once you're signed out: the landing page after Sign Out,
  // otherwise (an expired session, or opening /dashboard while signed out) the login page.
  const [signedOutTo, setSignedOutTo] = useState('/login');

  // If the backend rejects the login token (expired or invalid),
  // sign the user out so they land back on the login page.
  useEffect(() => {
    const stopListening = onSessionExpired(() => {
      setSignedOutTo('/login');
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
    setSignedOutTo('/login');
    setCurrentUser(user);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
    } catch {
      /* storage unavailable; user just won't persist */
    }
  };

  // Sign Out: lands on the landing page. Both updates render together, so /dashboard's
  // redirect already points at "/" when it sees there's no user. (Calling navigate() here
  // wouldn't work: React Router applies navigations as a lower-priority transition, so
  // /dashboard's own redirect to /login would run first and win.)
  const handleLogout = () => {
    logout();
    setSignedOutTo('/');
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
          element={<LoginWrapper currentUser={currentUser} onLogin={handleLogin} />}
        />

        {/* A verified Canvas launch resumes here after normal BuddyTech sign-in. */}
        <Route path="/canvas/continue" element={
          currentUser ? <CanvasContinue key={currentUser.id} user={currentUser} />
            : <Navigate to="/login" replace state={{ returnToCanvas: true }} />
        } />

        {/* 3. Student Dashboard */}
        <Route
          path="/dashboard"
          element={
            currentUser ? (
               <Dashboard user={currentUser} onLogout={handleLogout} onUserChange={handleUserChange} />
            ) : (
              <Navigate to={signedOutTo} replace />
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