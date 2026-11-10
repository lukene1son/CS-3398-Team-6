import React, { useState, useEffect, useRef } from "react";
import { Pencil } from "lucide-react";
import { getSettings, saveSettings, uploadAvatar, deleteAvatar, saveAvatarColor, forgetUserAvatar, USE_MOCK } from "../api";

import Avatar from "../components/Avatar";
import { AVATAR_COLORS, AVATAR_COLOR_NAMES, avatarColor } from "../avatarColors";

const card = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "1.25rem", marginBottom: "1rem" };
const input = { padding: "0.6rem 0.8rem", border: "1px solid #cbd5e1", borderRadius: "8px", outline: "none", width: "100%" };
const AVATAR_SIZE = 72;
const MAX_AVATAR_BYTES = 3 * 1024 * 1024; // matches the backend limit

export default function SettingsPage({ user, onUserChange }) {
  const userId = user?.id;

  const [form, setForm] = useState(null); // null = still loading
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [uploading, setUploading] = useState(false);
  const [avatarMessage, setAvatarMessage] = useState("");
  const fileInputRef = useRef(null);

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

  // Uploads right away when a file is picked (separate from the Save button).
  async function handleAvatarChange(e) {
    const file = e.target.files[0];
    e.target.value = ""; // lets the same file be picked again
    if (!file) return;
    if (file.size > MAX_AVATAR_BYTES) {
      setAvatarMessage("Could not upload: image is too large (3 MB max)");
      return;
    }
    setUploading(true);
    setAvatarMessage("");
    try {
      await uploadAvatar(file);
      forgetUserAvatar(userId);
      onUserChange?.({ has_avatar: true, avatar_refresh: Date.now() });
      setAvatarMessage("Picture updated ✓");
    } catch (err) {
      setAvatarMessage(`Could not upload: ${err.message}`);
    } finally {
      setUploading(false);
    }
  }

  function pickAvatar() {
    fileInputRef.current?.click();
  }

  // Saves right away when a color is clicked (separate from the Save button).
  async function pickColor(color) {
    const previous = form.avatar_color;
    setForm((prev) => ({ ...prev, avatar_color: color }));
    setAvatarMessage("");
    try {
      await saveAvatarColor(color);
      onUserChange?.({ avatar_color: color });
    } catch (err) {
      setForm((prev) => ({ ...prev, avatar_color: previous }));
      setAvatarMessage(`Could not save color: ${err.message}`);
    }
  }

  async function handleRemoveAvatar() {
    setAvatarMessage("");
    try {
      await deleteAvatar();
      forgetUserAvatar(userId);
      onUserChange?.({ has_avatar: false });
      setAvatarMessage("Picture removed ✓");
    } catch (err) {
      setAvatarMessage(`Could not remove picture: ${err.message}`);
    }
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const saved = await saveSettings(userId, form);
      onUserChange?.({ name: saved.display_name });
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
        <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "0.75rem" }}>
          <div style={{ position: "relative", width: AVATAR_SIZE, height: AVATAR_SIZE, flexShrink: 0 }}>
            <Avatar
              name={form.display_name || user?.name}
              userId={userId}
              color={form.avatar_color}
              hasAvatar={user?.has_avatar}
              refreshKey={user?.avatar_refresh}
              size={AVATAR_SIZE}
            />
            <button
              type="button"
              onClick={pickAvatar}
              disabled={uploading}
              aria-label="Change profile picture"
              title="Change profile picture"
              style={{
                position: "absolute",
                right: 0,
                bottom: 0,
                width: 24,
                height: 24,
                padding: 0,
                borderRadius: "50%",
                background: "#fff",
                border: "1px solid #cbd5e1",
                color: "#475569",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
              }}
            >
              <Pencil size={12} />
            </button>
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 style={{ marginTop: 0 }}>Profile</h3>
            <label style={{ fontSize: "0.85rem", color: "#475569" }}>Display name</label>
            <input style={input} value={form.display_name}  onChange={(e) => update("display_name", e.target.value)} />
          </div>
        </div>

        <div style={{ marginBottom: "0.75rem" }}>
          <div role="radiogroup" aria-label="Avatar color" style={{ display: "flex", gap: "0.4rem" }}>
            {AVATAR_COLORS.map((c, i) => {
              const selected = avatarColor(userId, form.avatar_color) === c;
              return (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-label={AVATAR_COLOR_NAMES[i]}
                  title={AVATAR_COLOR_NAMES[i]}
                  onClick={() => { if (!selected) pickColor(c); }}
                  style={{
                    width: 32,
                    height: 14,
                    padding: 0,
                    borderRadius: 6,
                    background: c,
                    border: "2px solid #fff",
                    boxShadow: selected ? `0 0 0 2px ${c}` : "0 0 0 1px #cbd5e1",
                    cursor: "pointer",
                  }}
                />
              );
            })}
          </div>
          {Boolean(user?.has_avatar) && (
            <p style={{ margin: "0.4rem 0 0", fontSize: "0.8rem", color: "#64748b" }}>
              Your color shows when you don't have a profile picture.{" "}
              <button type="button" onClick={handleRemoveAvatar} style={{ background: "none", border: "none", padding: 0, color: "#2563eb", cursor: "pointer", fontSize: "inherit" }}>
                Remove picture
              </button>
            </p>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          onChange={handleAvatarChange}
          style={{ display: "none" }}
        />
        {(uploading || avatarMessage) && (
          <p style={{ margin: "0 0 0.75rem", fontSize: "0.9rem", color: avatarMessage.startsWith("Could not") ? "#b91c1c" : "#15803d" }}>
            {uploading ? "Uploading..." : avatarMessage}
          </p>
        )}
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
