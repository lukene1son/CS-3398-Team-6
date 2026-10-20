import React, { useState, useEffect } from 'react';
import { getMe, getToken, logout, onSessionExpired } from './api';
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import './App.css';

import Navbar from './components/Navbar';
import Home from './pages/Home';
import Footer from './components/Footer';
import Login from './components/Login';
import Dashboard from './pages/Dashboard';
import ErrorBoundary from './components/ErrorBoundary';

// Wrapper for Home to pass navigation to Navbar buttons
function HomeWrapper() {
  const navigate = useNavigate();
  return (
    <div className="app-container">
      <Navbar onLoginClick={() => navigate('/login')} />
      <Home onGetStarted={() => navigate('/login')} />
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
  const [currentUser, setCurrentUser] = useState(null);
  const [checkingSession, setCheckingSession] = useState(() => !!getToken());

  // If a token is saved from a previous visit, ask the backend who it belongs to.
  useEffect(() => {
    if (!getToken()) return;
    getMe()
      .then(setCurrentUser)
      .catch(() => logout())
      .finally(() => setCheckingSession(false));
  }, []);

  // If the backend says our token is no longer valid, drop back to the login page.
  useEffect(() => onSessionExpired(() => setCurrentUser(null)), []);

  function handleLogin(user) {
    setCurrentUser(user);
  }

  function handleLogout() {
    logout();
    setCurrentUser(null);
  }

  if (checkingSession) return null; // could show a spinner here

  return (
    <ErrorBoundary>
    <Router>
      <Routes>
        {/* 1. Public Landing Page */}
        <Route path="/" element={<HomeWrapper />} />

        {/* 2. Login Page (Fidel's component) */}
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

        {/* 3. Student Dashboard (Maya Chen screen) */}
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
        {/* Anything else goes back to the landing page instead of rendering nothing */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
    </ErrorBoundary>
  );
}