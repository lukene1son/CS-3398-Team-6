import { useState } from "react";
import "./Login.css";

export default function Login({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  function handleSubmit(event) {
    event.preventDefault();
    
    // Convert email (e.g. "alex_smith@txstate.edu") into a readable display name ("Alex")
    let derivedName = "Student";
    if (email) {
      const usernamePart = email.split('@')[0];
      const firstName = usernamePart.split(/[._-]/)[0];
      derivedName = firstName.charAt(0).toUpperCase() + firstName.slice(1);
    }

    if (onLogin) {
      onLogin({
        name: derivedName,
        email: email,
        major: "Computer Science Major" // generic placeholder for your class demo
      });
    }
  }

  return (
    <main className="login-page">
      <form className="login-card" onSubmit={handleSubmit}>
        <h1>BuddyTech</h1>
        <p className="subtitle">Your space to study together.</p>

        <h2>Welcome back</h2>

        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          placeholder="Enter your student email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />

        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          placeholder="Enter your password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />

        <button type="submit">Sign In</button>

        <p className="signup-text">
          Don't have an account? <a href="#signup">Create Account</a>
        </p>
      </form>
    </main>
  );
}