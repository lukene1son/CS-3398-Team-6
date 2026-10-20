import React, { useState, useEffect, useRef, useCallback } from "react";

import {
  getMyCourses,
  getCourseChannels,
  getChannelMessages,
  sendChannelMessage,
} from "../api";

const POLL_MS = 3000; // how often we re-fetch messages so other users' chats show up

function formatTime(createdAt) {
  if (!createdAt) return "";
  const d = new Date(createdAt);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/**
 * Spaces = the logged-in user's courses. Each course has channels. Each channel has messages.
 *
 * All calls go through api.js, which attaches the login token. The backend
 * decides who you are from that token, so:
 *   GET  /api/me/courses                 -> only courses you're a member of
 *   GET  /api/courses/:id/channels       -> 403 if you're not in the course
 *   GET  /api/channels/:id/messages      -> 403 if you're not in the course
 *   POST /api/channels/:id/messages      { content }  (author = you, from the token)
 *
 * Props:
 *   user - the logged-in user from /api/me or /api/auth/login ({ id, name, email })
 */
export default function SpacesChat({ user }) {
  const userId = user?.id;

  const [courses, setCourses] = useState([]);
  const [channelsByCourse, setChannelsByCourse] = useState({});
  const [messagesByChannel, setMessagesByChannel] = useState({});

  const [selectedCourseId, setSelectedCourseId] = useState(null);
  const [selectedChannelId, setSelectedChannelId] = useState(null);

  const [inputText, setInputText] = useState("");
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState("Connecting...");
  const [error, setError] = useState("");

  const bottomRef = useRef(null);

  // Derived selection (falls back to the first item so we never need to
  // call setState just to pick a default)
  const course = courses.find((c) => c.id === selectedCourseId) ?? courses[0];
  const channels = course ? channelsByCourse[course.id] ?? [] : [];
  const channel = channels.find((c) => c.id === selectedChannelId) ?? channels[0];
  const messages = channel ? messagesByChannel[channel.id] ?? [] : [];

  // 1. Load the user's courses ("spaces")
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    async function loadCourses() {
      try {
        const data = await getMyCourses();
        if (cancelled) return;
        setCourses(data);
        setStatus("Connected to Backend");
        setError("");
      } catch (err) {
        if (cancelled) return;
        setStatus("Backend offline");
        setError(err.message);
      }
    }
    loadCourses();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // 2. Load channels whenever the selected course changes
  const courseId = course?.id;
  useEffect(() => {
    if (!courseId) return;
    let cancelled = false;
    async function loadChannels() {
      try {
        const data = await getCourseChannels(courseId);
        if (cancelled) return;
        setChannelsByCourse((prev) => ({ ...prev, [courseId]: data }));
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
    }
    loadChannels();
    return () => {
      cancelled = true;
    };
  }, [courseId]);

  // 3. Fetch messages for the open channel
  const channelId = channel?.id;
  const loadMessages = useCallback(async () => {
    if (!channelId) return;
    try {
      const data = await getChannelMessages(channelId);
      setMessagesByChannel((prev) => ({ ...prev, [channelId]: data }));
      setStatus("Connected to Backend");
      setError("");
    } catch (err) {
      setStatus("Backend offline");
      setError(err.message);
    }
  }, [channelId]);

  // Load on channel change + poll so messages from other users appear
  useEffect(() => {
    if (!channelId) return;
    loadMessages();
    const timer = setInterval(loadMessages, POLL_MS);
    return () => clearInterval(timer);
  }, [channelId, loadMessages]);

  // Auto-scroll when a new message arrives or the channel changes
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, channelId]);

  // 4. Send a message to the backend, then re-fetch so what you see == the DB
  async function handleSendMessage(e) {
    e.preventDefault();
    const content = inputText.trim();
    if (!content || !channelId || sending) return;

    setSending(true);
    try {
      await sendChannelMessage(channelId, content);
      setInputText("");
      await loadMessages();
    } catch (err) {
      setError(`Message not sent: ${err.message}`);
    } finally {
      setSending(false);
    }
  }

  return (
    <div style={{ display: "flex", height: "calc(100vh - 140px)", border: "1px solid #e2e8f0", borderRadius: "12px", overflow: "hidden", background: "#fff" }}>
      {/* Sidebar: courses, with the open course's channels underneath */}
      <div style={{ width: "260px", borderRight: "1px solid #e2e8f0", background: "#f8fafc", padding: "1rem", overflowY: "auto" }}>
        <h3 style={{ fontSize: "1rem", fontWeight: "700", color: "#1e293b", marginBottom: "0.5rem" }}>Study Spaces</h3>
        <p style={{ fontSize: "0.75rem", color: "#64748b", marginBottom: "1rem" }}>Status: {status}</p>

        {courses.length === 0 && status === "Connected to Backend" && (
          <p style={{ fontSize: "0.85rem", color: "#64748b" }}>You aren't in any courses yet.</p>
        )}

        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {courses.map((c) => {
            const isOpen = course?.id === c.id;
            return (
              <li key={c.id} style={{ marginBottom: "0.4rem" }}>
                <div
                  onClick={() => {
                    setSelectedCourseId(c.id);
                    setSelectedChannelId(null); // default to first channel of that course
                  }}
                  style={{
                    padding: "0.6rem 0.8rem",
                    borderRadius: "8px",
                    cursor: "pointer",
                    fontSize: "0.9rem",
                    fontWeight: isOpen ? "600" : "400",
                    background: isOpen ? "#e0e7ff" : "transparent",
                    color: isOpen ? "#4338ca" : "#475569",
                  }}
                >
                  {c.course_code} {c.course_name}
                </div>

                {isOpen && (
                  <ul style={{ listStyle: "none", padding: "0.3rem 0 0 0.8rem", margin: 0 }}>
                    {channels.map((ch) => (
                      <li
                        key={ch.id}
                        onClick={() => setSelectedChannelId(ch.id)}
                        style={{
                          padding: "0.4rem 0.8rem",
                          borderRadius: "6px",
                          cursor: "pointer",
                          fontSize: "0.85rem",
                          background: channel?.id === ch.id ? "#c7d2fe" : "transparent",
                          color: channel?.id === ch.id ? "#3730a3" : "#64748b",
                        }}
                      >
                        # {ch.name}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      {/* Main chat area */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <div style={{ padding: "1rem", borderBottom: "1px solid #e2e8f0", fontWeight: "600", color: "#0f172a" }}>
          {channel ? `${course.course_code} › #${channel.name}` : "Select a space"}
        </div>

        {error && (
          <div style={{ padding: "0.5rem 1rem", background: "#fef2f2", color: "#b91c1c", fontSize: "0.8rem" }}>{error}</div>
        )}

        <div style={{ flex: 1, padding: "1rem", overflowY: "auto", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {channel && messages.length === 0 && (
            <p style={{ color: "#94a3b8", fontSize: "0.9rem" }}>No messages yet. Say hi!</p>
          )}
          {messages.map((msg) => {
            const mine = msg.user_id === userId;
            return (
              <div
                key={msg.id}
                style={{
                  alignSelf: mine ? "flex-end" : "flex-start",
                  maxWidth: "70%",
                  background: mine ? "#2563eb" : "#f1f5f9",
                  color: mine ? "#ffffff" : "#0f172a",
                  padding: "0.6rem 0.9rem",
                  borderRadius: "10px",
                }}
              >
                <div style={{ fontSize: "0.75rem", opacity: 0.8, marginBottom: "0.2rem" }}>
                  {mine ? "You" : msg.user_name} • {formatTime(msg.created_at)}
                </div>
                <div style={{ fontSize: "0.95rem", overflowWrap: "anywhere" }}>{msg.content}</div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>

        <form onSubmit={handleSendMessage} style={{ display: "flex", padding: "1rem", borderTop: "1px solid #e2e8f0", gap: "0.5rem" }}>
          <input
            type="text"
            placeholder={channel ? `Message #${channel.name}...` : "Select a channel"}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            disabled={!channel}
            style={{ flex: 1, padding: "0.7rem 1rem", border: "1px solid #cbd5e1", borderRadius: "8px", outline: "none" }}
          />
          <button
            type="submit"
            disabled={!channel || sending}
            style={{
              padding: "0.7rem 1.2rem",
              background: sending ? "#93c5fd" : "#2563eb",
              color: "#fff",
              border: "none",
              borderRadius: "8px",
              fontWeight: "600",
              cursor: sending ? "default" : "pointer",
            }}
          >
            {sending ? "Sending..." : "Send"}
          </button>
        </form>
      </div>
    </div>
  );
}