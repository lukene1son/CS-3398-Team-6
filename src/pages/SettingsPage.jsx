import React, { useState, useEffect } from "react";
import { getSettings, saveSettings, USE_MOCK } from "../api";

const card = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "1.25rem", marginBottom: "1rem" };
const input = { padding: "0.6rem 0.8rem", border: "1px solid #cbd5e1", borderRadius: "8px", outline: "none", width: "100%" };

export default function SettingsPage({ user }) {
  const userId = user?.id ?? 1;

  const [form, setForm] = useState(null); // null = still loading
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await getSettings(userId);
        if (!cancelled) setForm({ ...data, display_name: data.display_name || user?.name || "" });
      } catch (err) {
        if (!cancelled) setMessage(err.message);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [userId, user?.name]);

  function update(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setMessage("");
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await saveSettings(userId, form);
      setMessage("Saved ✓");
    } catch (err) {
      setMessage(`Could not save: ${err.message}`);
    } finally {
      setSaving(false);
    }
  }

  if (!form) return <p style={{ color: "#94a3b8" }}>{message || "Loading settings..."}</p>;

  return (
    <form onSubmit={handleSave} style={{ maxWidth: "600px" }}>
      <h1 style={{ fontSize: "1.6rem", fontWeight: 800, color: "#0f172a", marginBottom: "0.25rem" }}>Settings</h1>
      <p style={{ color: "#64748b", marginBottom: "1rem" }}>
        Manage your profile and notifications.
        {USE_MOCK.settings && " (Saved in this browser only until the settings API is ready.)"}
      </p>

      <div style={card}>
        <h3 style={{ marginTop: 0 }}>Profile</h3>
        <label style={{ fontSize: "0.85rem", color: "#475569" }}>Display name</label>
        <input style={{ ...input, marginBottom: "0.75rem" }} value={form.display_name} onChange={(e) => update("display_name", e.target.value)} />
        <label style={{ fontSize: "0.85rem", color: "#475569" }}>Email</label>
        <input style={{ ...input, background: "#f1f5f9" }} value={user?.email || ""} disabled />
      </div>

      <div style={card}>
        <h3 style={{ marginTop: 0 }}>Notifications</h3>
        <label style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem" }}>
          <input type="checkbox" checked={form.email_notifications} onChange={(e) => update("email_notifications", e.target.checked)} />
          Email me about new messages
        </label>
        <label style={{ display: "flex", gap: "0.5rem" }}>
          <input type="checkbox" checked={form.assignment_reminders} onChange={(e) => update("assignment_reminders", e.target.checked)} />
          Remind me before assignments are due
        </label>
      </div>

      <button type="submit" disabled={saving} style={{ padding: "0.7rem 1.4rem", background: "#2563eb", color: "#fff", border: "none", borderRadius: "8px", fontWeight: 600, cursor: "pointer" }}>
        {saving ? "Saving..." : "Save changes"}
      </button>
      {message && <span style={{ marginLeft: "1rem", fontSize: "0.9rem", color: message.startsWith("Could not") ? "#b91c1c" : "#15803d" }}>{message}</span>}
    </form>
  );
}