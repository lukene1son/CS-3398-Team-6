import React, { useState, useEffect } from "react";

const BACKEND_URL = "http://localhost:3000"; // Jack's backend server port

export default function SpacesChat() {
  const spacesList = [
    "CS-3398 Software Engineering",
    "CS-3358 Data Structures",
    "Study Group - Algorithms",
    "General Campus Chat"
  ];

  const [selectedSpace, setSelectedSpace] = useState(spacesList[0]);
  
  const [messagesBySpace, setMessagesBySpace] = useState({
    "CS-3398 Software Engineering": [
      { id: 1, sender: "Fidel", text: "Working on the login screen update!", time: "10:14 AM" },
      { id: 2, sender: "Biraj", text: "Backend endpoints for courses and assignments are ready.", time: "10:16 AM" },
      { id: 3, sender: "Jack", text: "Auth routes and database schema seeded.", time: "10:18 AM" }
    ],
    "CS-3358 Data Structures": [
      { id: 101, sender: "Biraj", text: "Has anyone started the Binary Search Tree lab?", time: "09:30 AM" }
    ],
    "Study Group - Algorithms": [
      { id: 201, sender: "Jack", text: "Meeting at Alkek 3rd floor at 4 PM today.", time: "11:00 AM" }
    ],
    "General Campus Chat": [
      { id: 301, sender: "Student", text: "Welcome to BuddyTech campus spaces!", time: "08:00 AM" }
    ]
  });

  const [inputText, setInputText] = useState("");
  const [backendSyncStatus, setBackendSyncStatus] = useState("Offline (Local Mock Mode)");

  // 1. GET: Fetch space messages from backend API if implemented
  useEffect(() => {
    async function fetchMessages() {
      try {
        const res = await fetch(`${BACKEND_URL}/api/spaces/${encodeURIComponent(selectedSpace)}/messages`);
        if (res.ok) {
          const data = await res.json();
          setMessagesBySpace(prev => ({ ...prev, [selectedSpace]: data }));
          setBackendSyncStatus("Connected to Backend");
        } else {
          setBackendSyncStatus("Offline (Local Mock Mode)");
        }
      } catch (err) {
        // Backend not running or endpoint not yet created
        setBackendSyncStatus("Offline (Local Mock Mode)");
      }
    }

    fetchMessages();
  }, [selectedSpace]);

  // 2. POST: Transmit message to backend API, keep local UI instant
  async function handleSendMessage(e) {
    e.preventDefault();
    if (!inputText.trim()) return;

    const newMessage = {
      id: Date.now(),
      sender: "You",
      text: inputText,
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    };

    // Instant local state update
    setMessagesBySpace(prev => ({
      ...prev,
      [selectedSpace]: [...(prev[selectedSpace] || []), newMessage]
    }));

    setInputText("");

    // Backend sync attempt
    try {
      await fetch(`${BACKEND_URL}/api/spaces/${encodeURIComponent(selectedSpace)}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newMessage)
      });
    } catch (err) {
      // Backend route pending from teammates
    }
  }

  const currentMessages = messagesBySpace[selectedSpace] || [];

  return (
    <div style={{ display: "flex", height: "calc(100vh - 140px)", border: "1px solid #e2e8f0", borderRadius: "12px", overflow: "hidden", background: "#fff" }}>
      {/* Channels Sidebar */}
      <div style={{ width: "260px", borderRight: "1px solid #e2e8f0", background: "#f8fafc", padding: "1rem" }}>
        <h3 style={{ fontSize: "1rem", fontWeight: "700", color: "#1e293b", marginBottom: "0.5rem" }}>Study Spaces</h3>
        <p style={{ fontSize: "0.75rem", color: "#64748b", marginBottom: "1rem" }}>Status: {backendSyncStatus}</p>
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {spacesList.map(space => (
            <li
              key={space}
              onClick={() => setSelectedSpace(space)}
              style={{
                padding: "0.6rem 0.8rem",
                borderRadius: "8px",
                cursor: "pointer",
                marginBottom: "0.4rem",
                fontSize: "0.9rem",
                fontWeight: selectedSpace === space ? "600" : "400",
                background: selectedSpace === space ? "#e0e7ff" : "transparent",
                color: selectedSpace === space ? "#4338ca" : "#475569"
              }}
            >
              # {space}
            </li>
          ))}
        </ul>
      </div>

      {/* Main Chat Area */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "1rem", borderBottom: "1px solid #e2e8f0", fontWeight: "600", color: "#0f172a" }}>
          #{selectedSpace}
        </div>

        <div style={{ flex: 1, padding: "1rem", overflowY: "auto", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {currentMessages.map(msg => (
            <div
              key={msg.id}
              style={{
                alignSelf: msg.sender === "You" ? "flex-end" : "flex-start",
                maxWidth: "70%",
                background: msg.sender === "You" ? "#2563eb" : "#f1f5f9",
                color: msg.sender === "You" ? "#ffffff" : "#0f172a",
                padding: "0.6rem 0.9rem",
                borderRadius: "10px"
              }}
            >
              <div style={{ fontSize: "0.75rem", opacity: 0.8, marginBottom: "0.2rem" }}>
                {msg.sender} • {msg.time}
              </div>
              <div style={{ fontSize: "0.95rem" }}>{msg.text}</div>
            </div>
          ))}
        </div>

        <form onSubmit={handleSendMessage} style={{ display: "flex", padding: "1rem", borderTop: "1px solid #e2e8f0", gap: "0.5rem" }}>
          <input
            type="text"
            placeholder={`Message #${selectedSpace}...`}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            style={{
              flex: 1,
              padding: "0.7rem 1rem",
              border: "1px solid #cbd5e1",
              borderRadius: "8px",
              outline: "none"
            }}
          />
          <button
            type="submit"
            style={{
              padding: "0.7rem 1.2rem",
              background: "#2563eb",
              color: "#fff",
              border: "none",
              borderRadius: "8px",
              fontWeight: "600",
              cursor: "pointer"
            }}
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}