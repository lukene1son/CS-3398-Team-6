import { useEffect, useRef, useState } from "react";
import { getGoogleSignInConfig, loginWithGoogle } from "../api";

// Google's script, loaded once per page however many times this component mounts.
let scriptPromise = null;
function loadGoogleScript() {
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.onload = resolve;
      script.onerror = () => {
        scriptPromise = null; // let a later mount try again
        reject(new Error("Couldn't load Google sign-in. Check your connection."));
      };
      document.head.append(script);
    });
  }
  return scriptPromise;
}

// Google's docs say initialize() should be called only once, so remember that we did.
// Its callback forwards to whichever button is currently on screen.
let initializedFor = null;
let handleCredential = () => {};

// "Sign in with Google". Google draws the button itself (logo, text, colours),
// which keeps it within their branding rules. Hidden if the server has no client ID.
export default function GoogleSignInButton({ onLogin, onError, onPending }) {
  const buttonRef = useRef(null);
  const callbacks = useRef({ onLogin, onError, onPending });
  const [unavailable, setUnavailable] = useState(false);

  // Keep the latest callbacks without re-rendering Google's button every time they change.
  useEffect(() => {
    callbacks.current = { onLogin, onError, onPending };
  });

  useEffect(() => {
    let cancelled = false;

    handleCredential = async (response) => {
      try {
        const result = await loginWithGoogle(response.credential);
        if (result.pending) callbacks.current.onPending(result); // held: wait for approval
        else callbacks.current.onLogin(result);
      } catch (err) {
        callbacks.current.onError(err.message);
      }
    };

    (async () => {
      try {
        const { clientId } = await getGoogleSignInConfig();
        if (!clientId) {
          if (!cancelled) setUnavailable(true);
          return;
        }
        await loadGoogleScript();
        if (cancelled || !buttonRef.current) return;

        if (initializedFor !== clientId) {
          window.google.accounts.id.initialize({
            client_id: clientId,
            callback: (response) => handleCredential(response),
          });
          initializedFor = clientId;
        }
        window.google.accounts.id.renderButton(buttonRef.current, {
          type: "standard",
          theme: "outline",
          size: "large",
          text: "signin_with",
          shape: "rectangular",
          logo_alignment: "left",
          width: "318", // pixels, as a string; Google's maximum is 400
        });
      } catch (err) {
        if (!cancelled) callbacks.current.onError(err.message);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (unavailable) return null;
  return <div ref={buttonRef} style={{ display: "flex", justifyContent: "center", minHeight: 44 }} />;
}