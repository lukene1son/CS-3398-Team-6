import { useState } from "react";
import { Link } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import { registerUser } from "../api";
import "./Login.css";

export default function Login({ onLogin }) {
  const [mode, setMode] = useState("signin"); // "signin" | "signup"
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const isSignup = mode === "signup";

  function switchMode(nextMode) {
    setMode(nextMode);
    setError("");
    setNotice("");
    setPassword("");
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setNotice("");

    if (isSignup) {
      if (password.length < 8) {
        setError("Password must be at least 8 characters.");
        return;
      }
      setLoading(true);
      try {
        // Real backend call: creates a row in the users table
        await registerUser({ name: name.trim(), email: email.trim(), password });
        switchMode("signin");
        setNotice("Account created! Sign in to continue.");
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
      return;
    }

    // Sign in. NOTE: there is no backend login route yet, so for now we just
    // turn the email into a display name (e.g. "alex_smith@txstate.edu" -> "Alex").
    // TODO: replace with POST /api/auth/login once the backend adds it.
    let derivedName = "Student";
    if (email) {
      const usernamePart = email.split("@")[0];
      const firstName = usernamePart.split(/[._-]/)[0];
      derivedName = firstName.charAt(0).toUpperCase() + firstName.slice(1);
    }

    if (onLogin) {
      onLogin({
        name: derivedName,
        email: email,
        major: "Computer Science Major", // generic placeholder for the class demo
      });
    }
  }

  return (
    <main className="login-page">
      <form className="login-card" onSubmit={handleSubmit}>
        <Link to="/" className="back-link">← Back to home</Link>

        <div className="login-brand">
          <img src="/buddytech.webp" alt="" onError={(e) => { e.target.style.display = "none"; }} />
          <h1>BuddyTech</h1>
        </div>
        <p className="subtitle">Your space to study together.</p>

        <h2>{isSignup ? "Create your account" : "Welcome back"}</h2>

        {notice && <div className="form-message success" role="status">{notice}</div>}
        {error && <div className="form-message error" role="alert">{error}</div>}

        {isSignup && (
          <>
            <label htmlFor="name">Full name</label>
            <input
              id="name"
              type="text"
              placeholder="Enter your name"
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
        <div className="password-field">
          <input
            id="password"
            type={showPassword ? "text" : "password"}
            placeholder={isSignup ? "At least 8 characters" : "Enter your password"}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
          <button
            type="button"
            className="password-toggle"
            onClick={() => setShowPassword(!showPassword)}
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>

        <button type="submit" className="btn-submit" disabled={loading}>
          {loading ? "Creating account..." : isSignup ? "Create Account" : "Sign In"}
        </button>

        <p className="signup-text">
          {isSignup ? "Already have an account? " : "Don't have an account? "}
          <button type="button" className="link-btn" onClick={() => switchMode(isSignup ? "signin" : "signup")}>
            {isSignup ? "Sign In" : "Create Account"}
          </button>
        </p>
      </form>
    </main>
  );
}