import { useState } from "react";
import { changePassword, logoutOtherDevices } from "../../api";

// The Security card on the Settings page:
//   Change password         PUT  /api/me/password           (also signs out your other devices)
//   Sign out other devices  POST /api/me/logout-everywhere  (the "this wasn't me" button)
// It's its own form, so it sits outside the Settings page's Save form (forms can't nest).

const card = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "1.25rem", marginBottom: "1rem" };
const input = { padding: "0.6rem 0.8rem", border: "1px solid #cbd5e1", borderRadius: "8px", outline: "none", width: "100%", boxSizing: "border-box" };
const label = { fontSize: "0.85rem", color: "#475569" };
const button = { padding: "0.6rem 1.2rem", background: "#2563eb", color: "#fff", border: "none", borderRadius: "8px", fontWeight: 600, cursor: "pointer" };
const MIN_LENGTH = 8; // matches the backend

const tone = (m) => (m.startsWith("Could not") ? "#b91c1c" : "#15803d");

export default function SecuritySettings() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pwMessage, setPwMessage] = useState("");

  const [confirmingSignOut, setConfirmingSignOut] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutMessage, setSignOutMessage] = useState("");

  async function handlePassword(e) {
    e.preventDefault();
    if (next.length < MIN_LENGTH) return setPwMessage(`Could not change: new password must be at least ${MIN_LENGTH} characters`);
    if (next !== confirm) return setPwMessage("Could not change: the new passwords don't match");
    if (next === current) return setPwMessage("Could not change: the new password is the same as the current one");
    setSaving(true);
    setPwMessage("");
    try {
      await changePassword(current, next);
      setCurrent(""); setNext(""); setConfirm("");
      setPwMessage("Password changed ✓ Your other devices were signed out.");
    } catch (err) {
      setPwMessage(`Could not change: ${err.message}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleSignOutOthers() {
    setSigningOut(true);
    setSignOutMessage("");
    try {
      const { signedOut } = await logoutOtherDevices();
      setSignOutMessage(signedOut > 0
        ? `Signed out ${signedOut} other ${signedOut === 1 ? "device" : "devices"} ✓`
        : "No other devices were signed in ✓");
      setConfirmingSignOut(false); // done: back to the plain button
    } catch (err) {
      // Keep the confirmation open, with the error under it, so "Yes, sign them out"
      // can simply be clicked again (no reopening, and the error stays visible).
      setSignOutMessage(`Could not sign out: ${err.message}`);
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <div style={{ maxWidth: "600px" }}>
      <form onSubmit={handlePassword} style={card}>
        <h3 style={{ marginTop: 0 }}>Change password</h3>
        <label style={label} htmlFor="pw-current">Current password</label>
        <input id="pw-current" style={{ ...input, marginBottom: "0.75rem" }} type={show ? "text" : "password"} autoComplete="current-password"
          value={current} onChange={(e) => { setCurrent(e.target.value); setPwMessage(""); }} required />
        <label style={label} htmlFor="pw-new">New password <span style={{ color: "#94a3b8" }}>(at least {MIN_LENGTH} characters)</span></label>
        <input id="pw-new" style={{ ...input, marginBottom: "0.75rem" }} type={show ? "text" : "password"} autoComplete="new-password"
          value={next} onChange={(e) => { setNext(e.target.value); setPwMessage(""); }} required />
        <label style={label} htmlFor="pw-confirm">Confirm new password</label>
        <input id="pw-confirm" style={{ ...input, marginBottom: "0.75rem" }} type={show ? "text" : "password"} autoComplete="new-password"
          value={confirm} onChange={(e) => { setConfirm(e.target.value); setPwMessage(""); }} required />
        <label style={{ display: "flex", gap: "0.5rem", marginBottom: "0.9rem", fontSize: "0.9rem" }}>
          <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} />
          Show passwords
        </label>
        <button type="submit" disabled={saving || !current || !next || !confirm} style={{ ...button, opacity: saving || !current || !next || !confirm ? 0.6 : 1 }}>
          {saving ? "Changing..." : "Change password"}
        </button>
        {pwMessage && <p role="status" style={{ margin: "0.75rem 0 0", fontSize: "0.9rem", color: tone(pwMessage) }}>{pwMessage}</p>}
        <p style={{ margin: "0.75rem 0 0", fontSize: "0.8rem", color: "#64748b" }}>
          Changing your password signs you out everywhere else. Accounts that sign in with Google have no password to change.
        </p>
      </form>

      <div style={card}>
        <h3 style={{ marginTop: 0 }}>Sign out other devices</h3>
        <p style={{ margin: "0 0 0.75rem", fontSize: "0.9rem", color: "#475569" }}>
          Use this if you signed in on a shared computer or see a sign-in that wasn't you. You stay signed in here.
        </p>
        {confirmingSignOut ? (
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: "0.9rem" }}>Sign out every other device?</span>
            <button type="button" onClick={handleSignOutOthers} disabled={signingOut} style={{ ...button, background: "#b91c1c" }}>
              {signingOut ? "Signing out..." : "Yes, sign them out"}
            </button>
            <button type="button" onClick={() => setConfirmingSignOut(false)} disabled={signingOut}
              style={{ ...button, background: "#f1f5f9", color: "#334155" }}>Cancel</button>
          </div>
        ) : (
          <button type="button" onClick={() => { setConfirmingSignOut(true); setSignOutMessage(""); }} style={{ ...button, background: "#fff", color: "#b91c1c", border: "1px solid #fca5a5" }}>
            Sign out other devices
          </button>
        )}
        {signOutMessage && <p role="status" style={{ margin: "0.75rem 0 0", fontSize: "0.9rem", color: tone(signOutMessage) }}>{signOutMessage}</p>}
      </div>
    </div>
  );
}
