import { useEffect, useRef, useState } from "react";
import { login, register, checkLoginAttempt } from "../api";
import GoogleSignInButton from "./GoogleSignInButton";
import CanvasSignInButton from "./CanvasSignInButton";
import "./Login.css";

export default function Login({ onLogin }) {
  const [mode, setMode] = useState("login"); // "login" or "register"
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // A held sign-in waiting for the signed-in device to approve: { attemptId, pollSecret, message }
  const [waiting, setWaiting] = useState(null);

  // Latest onLogin without restarting the polling below when the parent re-renders.
  const onLoginRef = useRef(onLogin);
  useEffect(() => {
    onLoginRef.current = onLogin;
  });

  // While held, ask every 3 seconds whether it was approved (the server allows 30 a minute).
  useEffect(() => {
    if (!waiting) return;
    let stopped = false;
    let timer;
    async function check() {
      try {
        const result = await checkLoginAttempt(waiting);
        // The token can only be collected once, so finish signing in even if we were cancelled meanwhile.
        if (result.status === "approved") {
          setWaiting(null);
          if (onLoginRef.current) onLoginRef.current(result.user);
          return;
        }
        if (stopped) return;
        if (result.status !== "pending") {
          setWaiting(null);
          setError(result.status === "denied"
            ? "This sign-in was denied from the signed-in device."
            : "This sign-in request expired. Please try again.");
          return;
        }
      } catch (err) {
        if (stopped) return;
        if (err.status !== 429) { // 429 = asked too often; just try again next time
          setWaiting(null);
          setError(err.message);
          return;
        }
      }
      timer = setTimeout(check, 3000);
    }
    timer = setTimeout(check, 3000);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [waiting]);

  const isRegister = mode === "register";

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const result = isRegister
        ? await register({ name, email, password })
        : await login({ email, password });
      if (result.pending) setWaiting(result); // signed in elsewhere: wait for approval
      else if (onLogin) onLogin(result);
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
  if (waiting) {
    return (
      <main className="login-page">
        <div className="login-card">
          <h1>BuddyTech</h1>
          <h2>Waiting for approval</h2>
          <p className="subtitle">{waiting.message}</p>
          <p className="subtitle">
            Approve it from the notification bell where you're already signed in, or from the
            email we sent. The request expires in 10 minutes.
          </p>
          <button type="button" className="btn-submit" onClick={() => setWaiting(null)}>
            Cancel
          </button>
        </div>
      </main>
    );
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

         <button type="submit" className="btn-submit" disabled={submitting}>
          {submitting ? "Please wait..." : isRegister ? "Create Account" : "Sign In"}
        </button>
        <div className="login-divider"><span>or</span></div>
         <GoogleSignInButton onLogin={onLogin} onError={setError} onPending={setWaiting} />
        <CanvasSignInButton />
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