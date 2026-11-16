import { useEffect, useRef, useState } from "react";
import { login, register, checkLoginAttempt } from "../api";
import GoogleSignInButton from "./GoogleSignInButton";
import CanvasSignInButton from "./CanvasSignInButton";
import AnimatedLogo from "./AnimatedLogo";
import "./Login.css";

// The logo heading every version of the card. It always sits in the same place in the tree
// (the card's first child), so React keeps the same AnimatedLogo while you switch between
// Sign In, Create Account and Waiting for approval: it builds itself once when the page
// loads or is refreshed, and stays put after that.
function LoginCard({ children }) {
  return (
    <main className="login-page">
      <div className="login-card">
        <h1 className="login-logo">
          <AnimatedLogo finishPulse={false} />
        </h1>
        {children}
      </div>
    </main>
  );
}

// initialMode: which screen to open on ("register" when coming from Get Started).
export default function Login({ onLogin, initialMode = "login" }) {
  const [mode, setMode] = useState(initialMode); // "login" or "register"
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // A wrong email or password: the password's text fades away ("fading"), then the
  // field shakes ("shaking"). Each step's CSS animation ending moves to the next.
  const [passwordFx, setPasswordFx] = useState(null);

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
      setError(err.message); // stays on screen through (and after) the animation
      // 401 = wrong email or password (the server doesn't say which).
      if (!isRegister && err.status === 401) {
        const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
        if (reducedMotion) setPassword("");
        else setPasswordFx("fading");
      }
    } finally {
      setSubmitting(false);
    }
  }

  // The fade has finished: empty the field, then shake it. The shake has finished: done.
  function handlePasswordAnimationEnd(event) {
    if (event.animationName === "password-text-fade") {
      setPassword("");
      setPasswordFx("shaking");
    } else if (event.animationName === "password-shake") {
      setPasswordFx(null);
    }
  }

  function switchMode(event) {
    event.preventDefault();
    setMode(isRegister ? "login" : "register");
    setError("");
  }
  if (waiting) {
    return (
      <LoginCard>
        <div className="login-body">
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
      </LoginCard>
    );
  }

  return (
    <LoginCard>
      <form className="login-body" onSubmit={handleSubmit}>
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
          className={passwordFx ? `password-${passwordFx}` : undefined}
          onAnimationEnd={handlePasswordAnimationEnd}
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
    </LoginCard>
  );
}