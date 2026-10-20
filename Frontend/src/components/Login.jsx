import { useState } from "react";
import { login, register } from "../api";
import "./Login.css";

export default function Login({ onLogin }) {
  const [mode, setMode] = useState("login"); // "login" or "register"
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const isRegister = mode === "register";

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const user = isRegister
        ? await register({ name, email, password })
        : await login({ email, password });
      if (onLogin) onLogin(user);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  function switchMode(event) {
    event.preventDefault();
    setMode(isRegister ? "login" : "register");
    setError("");
  }

  return (
    <main className="login-page">
      <form className="login-card" onSubmit={handleSubmit}>
        <h1>BuddyTech</h1>
        <p className="subtitle">Your space to study together.</p>

        <h2>{isRegister ? "Create your account" : "Welcome back"}</h2>

        {isRegister && (
          <>
            <label htmlFor="name">Name</label>
            <input
              id="name"
              type="text"
              placeholder="Your name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
            />
          </>
        )}

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
          placeholder={isRegister ? "At least 8 characters" : "Enter your password"}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          minLength={isRegister ? 8 : undefined}
          required
        />

        {error && (
          <p role="alert" style={{ color: "#dc2626", margin: "0.5rem 0" }}>{error}</p>
        )}

        <button type="submit" disabled={submitting}>
          {submitting ? "Please wait..." : isRegister ? "Create Account" : "Sign In"}
        </button>

        <p className="signup-text">
          {isRegister ? "Already have an account? " : "Don't have an account? "}
          <a href="#" onClick={switchMode}>
            {isRegister ? "Sign In" : "Create Account"}
          </a>
        </p>
      </form>
    </main>
  );
}