import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import './App.css';

import Navbar from './components/Navbar';
import Home from './pages/Home';
import Footer from './components/Footer';
import Login from './components/Login';
import Dashboard from './pages/Dashboard';

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
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const savedUser = localStorage.getItem('buddytechUser');
      return savedUser ? JSON.parse(savedUser) : null;
    } catch {
      return null;
    }
  });

  const handleLogin = (user) => {
    localStorage.setItem('buddytechUser', JSON.stringify(user));
    setCurrentUser(user);
  };

  const handleLogout = () => {
    localStorage.removeItem('buddytechUser');
    setCurrentUser(null);
  };

  return (
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
      </Routes>
    </Router>
  );
}