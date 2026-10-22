import React, { useState, useEffect, useRef, useCallback } from "react";
import { getMyCourses, getCourseChannels, getChannelMessages, sendChannelMessage } from "../api";
const POLL_MS = 3000; // how often we re-fetch messages so other users' chats show up

function formatTime(createdAt) {
  if (!createdAt) return "";
  const d = new Date(createdAt);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  });
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
export default function SpacesChat({
  user
}) {
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
  const [activeTab, setActiveTab] = useState("chat");
  const [partnerView, setPartnerView] = useState("suggested");
  const [requestedPartners, setRequestedPartners] = useState([]);
  const bottomRef = useRef(null);
  const [partnerSearch, setPartnerSearch] = useState("");
  const [partnerCourse, setPartnerCourse] = useState("all");
  const [groupView, setGroupView] = useState("discover");
  const [joinedGroups, setJoinedGroups] = useState([]);
  const [groupInvites, setGroupInvites] = useState(["calcStudy", "architectureReview"]);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupCourse, setNewGroupCourse] = useState("CS 3398");
  const [newGroupTime, setNewGroupTime] = useState("");
  const [createdGroups, setCreatedGroups] = useState([]);
  const [groupSearch, setGroupSearch] = useState("");
  const [groupCourse, setGroupCourse] = useState("all");
  const [openGroup, setOpenGroup] = useState(null);
  const [groupChannel, setGroupChannel] = useState("general");
  const [groupMessage, setGroupMessage] = useState("");
  const [selectedConnection, setSelectedConnection] = useState(null);
  const [directMessage, setDirectMessage] = useState("");
  const [directMessages, setDirectMessages] = useState({});

  const [groupMessages, setGroupMessages] = useState({});

  function openStudyGroup(group) {
    setOpenGroup(group);
    setGroupChannel("general");
    setGroupMessage("");
  }

  function changeGroupView(view) {
    setOpenGroup(null);
    setGroupView(view);
  }

  // Derived selection (falls back to the first item so we never need to
  // call setState just to pick a default)
  const course = courses.find(c => c.id === selectedCourseId) ?? courses[0];
  const channels = course ? channelsByCourse[course.id] ?? [] : [];
  const channel = channels.find(c => c.id === selectedChannelId) ?? channels[0];
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
        setChannelsByCourse(prev => ({
          ...prev,
          [courseId]: data
        }));
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
      setMessagesByChannel(prev => ({
        ...prev,
        [channelId]: data
      }));
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
    bottomRef.current?.scrollIntoView({
      behavior: "smooth"
    });
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
  return <div>
    {/* Spaces Tabs */}
    <div style={{
      display: "flex",
      gap: "0.5rem",
      marginBottom: "1rem",
      borderBottom: "1px solid #e2e8f0"
    }}>
      <button onClick={() => setActiveTab("chat")} style={{
        padding: "0.75rem 1rem",
        border: "none",
        borderBottom: activeTab === "chat" ? "3px solid #2563eb" : "3px solid transparent",
        background: "transparent",
        color: activeTab === "chat" ? "#2563eb" : "#64748b",
        fontWeight: activeTab === "chat" ? "600" : "500",
        cursor: "pointer"
      }}>
        Chat
      </button>

      <button onClick={() => setActiveTab("partners")} style={{
        padding: "0.75rem 1rem",
        border: "none",
        borderBottom: activeTab === "partners" ? "3px solid #2563eb" : "3px solid transparent",
        background: "transparent",
        color: activeTab === "partners" ? "#2563eb" : "#64748b",
        fontWeight: activeTab === "partners" ? "600" : "500",
        cursor: "pointer"
      }}>
        Study Partners
      </button>

      <button onClick={() => setActiveTab("groups")} style={{
        padding: "0.75rem 1rem",
        border: "none",
        borderBottom: activeTab === "groups" ? "3px solid #2563eb" : "3px solid transparent",
        background: "transparent",
        color: activeTab === "groups" ? "#2563eb" : "#64748b",
        fontWeight: activeTab === "groups" ? "600" : "500",
        cursor: "pointer"
      }}>
        Study Groups
      </button>
    </div>
    {/* Chat Tab */}
    {activeTab === "chat" && <div style={{
      display: "flex",
      height: "calc(100vh - 200px)",
      border: "1px solid #e2e8f0",
      borderRadius: "12px",
      overflow: "hidden",
      background: "#fff"
    }}>

      {/* Sidebar: courses, with the open course's channels underneath */}
      <div style={{
        width: "260px",
        borderRight: "1px solid #e2e8f0",
        background: "#f8fafc",
        padding: "1rem",
        overflowY: "auto"
      }}>
        <h3 style={{
          fontSize: "1rem",
          fontWeight: "700",
          color: "#1e293b",
          marginBottom: "0.5rem"
        }}>Study Spaces</h3>
        <p style={{
          fontSize: "0.75rem",
          color: "#64748b",
          marginBottom: "1rem"
        }}>Status: {status}</p>

        {courses.length === 0 && status === "Connected to Backend" && <p style={{
          fontSize: "0.85rem",
          color: "#64748b"
        }}>You aren't in any courses yet.</p>}

        <ul style={{
          listStyle: "none",
          padding: 0,
          margin: 0
        }}>
          {courses.map(c => {
            const isOpen = course?.id === c.id;
            return <li key={c.id} style={{
              marginBottom: "0.4rem"
            }}>
              <div onClick={() => {
                setSelectedCourseId(c.id);
                setSelectedChannelId(null); // default to first channel of that course
              }} style={{
                padding: "0.6rem 0.8rem",
                borderRadius: "8px",
                cursor: "pointer",
                fontSize: "0.9rem",
                fontWeight: isOpen ? "600" : "400",
                background: isOpen ? "#e0e7ff" : "transparent",
                color: isOpen ? "#4338ca" : "#475569"
              }}>
                {c.course_code} {c.course_name}
              </div>

              {isOpen && <ul style={{
                listStyle: "none",
                padding: "0.3rem 0 0 0.8rem",
                margin: 0
              }}>
                {channels.map(ch => <li key={ch.id} onClick={() => setSelectedChannelId(ch.id)} style={{
                  padding: "0.4rem 0.8rem",
                  borderRadius: "6px",
                  cursor: "pointer",
                  fontSize: "0.85rem",
                  background: channel?.id === ch.id ? "#c7d2fe" : "transparent",
                  color: channel?.id === ch.id ? "#3730a3" : "#64748b"
                }}>
                        # {ch.name}
                </li>)}
              </ul>}
            </li>;
          })}
        </ul>
      </div>

      {/* Main chat area */}
      <div style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        minWidth: 0
      }}>
        <div style={{
          padding: "1rem",
          borderBottom: "1px solid #e2e8f0",
          fontWeight: "600",
          color: "#0f172a"
        }}>
          {channel ? `${course.course_code} › #${channel.name}` : "Select a space"}
        </div>

        {error && <div style={{
          padding: "0.5rem 1rem",
          background: "#fef2f2",
          color: "#b91c1c",
          fontSize: "0.8rem"
        }}>{error}</div>}

        <div style={{
          flex: 1,
          padding: "1rem",
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: "0.75rem"
        }}>
          {channel && messages.length === 0 && <p style={{
            color: "#94a3b8",
            fontSize: "0.9rem"
          }}>No messages yet. Say hi!</p>}
          {messages.map(msg => {
            const mine = msg.user_id === userId;
            return <div key={msg.id} style={{
              alignSelf: mine ? "flex-end" : "flex-start",
              maxWidth: "70%",
                        overflowWrap: "anywhere",
              background: mine ? "#2563eb" : "#f1f5f9",
              color: mine ? "#ffffff" : "#0f172a",
              padding: "0.6rem 0.9rem",
              borderRadius: "10px"
            }}>
              <div style={{
                fontSize: "0.75rem",
                opacity: 0.8,
                marginBottom: "0.2rem"
              }}>
                {mine ? "You" : msg.user_name} • {formatTime(msg.created_at)}
              </div>
              <div style={{
                fontSize: "0.95rem",
                overflowWrap: "anywhere"
              }}>{msg.content}</div>
            </div>;
          })}
          <div ref={bottomRef} />
        </div>

        <form onSubmit={handleSendMessage} style={{
          display: "flex",
          padding: "1rem",
          borderTop: "1px solid #e2e8f0",
          gap: "0.5rem"
        }}>
          <input type="text" placeholder={channel ? `Message #${channel.name}...` : "Select a channel"} value={inputText} onChange={e => setInputText(e.target.value)} disabled={!channel} style={{
            flex: 1,
            padding: "0.7rem 1rem",
            border: "1px solid #cbd5e1",
            borderRadius: "8px",
            outline: "none"
          }} />
          <button type="submit" disabled={!channel || sending} style={{
            padding: "0.7rem 1.2rem",
            background: sending ? "#93c5fd" : "#2563eb",
            color: "#fff",
            border: "none",
            borderRadius: "8px",
            fontWeight: "600",
            cursor: sending ? "default" : "pointer"
          }}>
            {sending ? "Sending..." : "Send"}
          </button>
        </form>
      </div>
    </div>}

    {activeTab === "partners" && <div style={{
      display: "flex",
      height: "calc(100vh - 200px)",
      border: "1px solid #e2e8f0",
      borderRadius: "12px",
      overflow: "hidden",
      background: "#fff"
    }}>
      {/* Study Partners Sidebar */}
      <div style={{
        width: "220px",
        borderRight: "1px solid #e2e8f0",
        background: "#f8fafc",
        padding: "1rem"
      }}>
        <h3 style={{
          fontSize: "1rem",
          fontWeight: "700",
          color: "#1e293b",
          marginBottom: "1rem"
        }}>
          Study Partners
        </h3>

        <div style={{
          display: "flex",
          flexDirection: "column",
          gap: "0.4rem"
        }}>
          <button onClick={() => setPartnerView("suggested")} style={{
            textAlign: "left",
            padding: "0.6rem 0.8rem",
            border: "none",
            borderRadius: "8px",
            background: partnerView === "suggested" ? "#e0e7ff" : "transparent",
            color: partnerView === "suggested" ? "#4338ca" : "#64748b",
            fontWeight: partnerView === "suggested" ? "600" : "400",
            cursor: "pointer"
          }}>
            Suggested
          </button>

          <button onClick={() => setPartnerView("connections")} style={{
            textAlign: "left",
            padding: "0.6rem 0.8rem",
            border: "none",
            borderRadius: "8px",
            background: partnerView === "connections" ? "#e0e7ff" : "transparent",
            color: partnerView === "connections" ? "#4338ca" : "#64748b",
            fontWeight: partnerView === "connections" ? "600" : "400",
            cursor: "pointer"
          }}>
            My Connections
          </button>

          <button onClick={() => setPartnerView("requests")} style={{
            textAlign: "left",
            padding: "0.6rem 0.8rem",
            border: "none",
            borderRadius: "8px",
            background: partnerView === "requests" ? "#e0e7ff" : "transparent",
            color: partnerView === "requests" ? "#4338ca" : "#64748b",
            fontWeight: partnerView === "requests" ? "600" : "400",
            cursor: "pointer"
          }}>
            Requests
          </button>
        </div>
      </div>

      {/* Study Partners Main Area */}
      <div style={{
        flex: 1,
        padding: "1.5rem",
        overflowY: "auto"
      }}>
        {partnerView === "suggested" && <>
          <div style={{
            marginBottom: "1.5rem"
          }}>
            <h2 style={{
              color: "#1e293b",
              marginBottom: "0.3rem"
            }}>
              Find Study Partners
            </h2>
            <p style={{
              color: "#64748b",
              fontSize: "0.9rem"
            }}>
              Connect with classmates in your courses.
            </p>
          </div>

          <div style={{
            display: "flex",
            gap: "0.75rem",
            marginBottom: "1.5rem"
          }}>
            <input
              type="text"
              placeholder="Search classmates..."
              value={partnerSearch}
              onChange={(e) => setPartnerSearch(e.target.value)}
              style={{
              flex: 1,
              padding: "0.7rem 1rem",
              border: "1px solid #cbd5e1",
              borderRadius: "8px",
              outline: "none"
            }} />

            <select
              value={partnerCourse}
              onChange={(e) => setPartnerCourse(e.target.value)}
              style={{
                padding: "0.7rem 1rem",
                border: "1px solid #cbd5e1",
                borderRadius: "8px",
                background: "#fff",
                color: "#475569",
              }}
            >
              <option value="all">All Courses</option>
              <option value="CS 3398">CS 3398</option>
              <option value="CS 3360">CS 3360</option>
              <option value="EE 2120">EE 2120</option>
            </select>
          </div>

          <div style={{
            display: "flex",
            flexDirection: "column",
            gap: "0.75rem"
          }}>

            {/* Partner 1 */}
            <div style={{
              display:
                "maya chen".includes(partnerSearch.toLowerCase()) &&
                (partnerCourse === "all" || partnerCourse === "CS 3398")
                  ? "flex"
                  : "none",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "1rem",
              border: "1px solid #e2e8f0",
              borderRadius: "10px"
            }}>
              <div>
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  marginBottom: "0.3rem"
                }}>
                  <span style={{
                    width: "9px",
                    height: "9px",
                    background: "#22c55e",
                    borderRadius: "50%",
                    display: "inline-block"
                  }}></span>
                  <strong style={{
                    color: "#1e293b"
                  }}>Maya Chen</strong>
                </div>

                <div style={{
                  fontSize: "0.85rem",
                  color: "#64748b"
                }}>
                  CS 3398 • Group Study
                </div>

                <div style={{
                  fontSize: "0.8rem",
                  color: "#94a3b8",
                  marginTop: "0.2rem"
                }}>
                  Available Tue / Thu
                </div>
              </div>

              <button
                onClick={() =>
                  setRequestedPartners((prev) =>
                    prev.includes("maya")
                      ? prev.filter((id) => id !== "maya")
                      : [...prev, "maya"]
                  )
                }
                style={{
                  padding: "0.6rem 1rem",
                  background: requestedPartners.includes("maya") ? "#e2e8f0" : "#2563eb",
                  color: requestedPartners.includes("maya") ? "#475569" : "#fff",
                  border: "none",
                  borderRadius: "8px",
                  fontWeight: "600",
                  cursor: "pointer",
                }}
              >
                {requestedPartners.includes("maya") ? "Requested ✓" : "Connect"}
              </button>
            </div>

            {/* Partner 2 */}
            <div style={{
              display:
                "david olajide".includes(partnerSearch.toLowerCase()) &&
                (partnerCourse === "all" || partnerCourse === "CS 3398")
                  ? "flex"
                  : "none",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "1rem",
              border: "1px solid #e2e8f0",
              borderRadius: "10px"
            }}>
              <div>
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  marginBottom: "0.3rem"
                }}>
                  <span style={{
                    width: "9px",
                    height: "9px",
                    background: "#eab308",
                    borderRadius: "50%",
                    display: "inline-block"
                  }}></span>
                  <strong style={{
                    color: "#1e293b"
                  }}>David Olajide</strong>
                </div>

                <div style={{
                  fontSize: "0.85rem",
                  color: "#64748b"
                }}>
                  CS 3398 • Exam Prep
                </div>

                <div style={{
                  fontSize: "0.8rem",
                  color: "#94a3b8",
                  marginTop: "0.2rem"
                }}>
                  Available Wednesday evenings
                </div>
              </div>

              <button
                onClick={() =>
                  setRequestedPartners((prev) =>
                    prev.includes("david")
                      ? prev.filter((id) => id !== "david")
                      : [...prev, "david"]
                  )
                }
                style={{
                  padding: "0.6rem 1rem",
                  background: requestedPartners.includes("david") ? "#e2e8f0" : "#2563eb",
                  color: requestedPartners.includes("david") ? "#475569" : "#fff",
                  border: "none",
                  borderRadius: "8px",
                  fontWeight: "600",
                  cursor: "pointer",
                }}
              >
                {requestedPartners.includes("david") ? "Requested ✓" : "Connect"}
              </button>
            </div>

            {/* Partner 3 */}
            <div style={{
              display:
                "fidel ramirez".includes(partnerSearch.toLowerCase()) &&
                (partnerCourse === "all" || partnerCourse === "CS 3360")
                  ? "flex"
                  : "none",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "1rem",
              border: "1px solid #e2e8f0",
              borderRadius: "10px"
            }}>
              <div>
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  marginBottom: "0.3rem"
                }}>
                  <span style={{
                    width: "9px",
                    height: "9px",
                    background: "#94a3b8",
                    borderRadius: "50%",
                    display: "inline-block"
                  }}></span>
                  <strong style={{
                    color: "#1e293b"
                  }}>Fidel Ramirez</strong>
                </div>

                <div style={{
                  fontSize: "0.85rem",
                  color: "#64748b"
                }}>
                  CS 3360 • Homework Help
                </div>

                <div style={{
                  fontSize: "0.8rem",
                  color: "#94a3b8",
                  marginTop: "0.2rem"
                }}>
                  Available Mon / Wed
                </div>
              </div>

              <button
                onClick={() =>
                  setRequestedPartners((prev) =>
                    prev.includes("fidel")
                      ? prev.filter((id) => id !== "fidel")
                      : [...prev, "fidel"]
                  )
                }
                style={{
                  padding: "0.6rem 1rem",
                  background: requestedPartners.includes("fidel") ? "#e2e8f0" : "#2563eb",
                  color: requestedPartners.includes("fidel") ? "#475569" : "#fff",
                  border: "none",
                  borderRadius: "8px",
                  fontWeight: "600",
                  cursor: "pointer",
                }}
              >
                {requestedPartners.includes("fidel") ? "Requested ✓" : "Connect"}
              </button>
            </div>
          </div>
        </>}

        {partnerView === "connections" && (
          <div>
            <h2 style={{ color: "#1e293b", marginBottom: "0.3rem" }}>
              My Connections
            </h2>

            <p style={{ color: "#64748b", marginBottom: "1rem" }}>
              Students you've connected with for studying.
            </p>

            {selectedConnection && (
              <div style={{ marginBottom: "1.5rem", border: "1px solid #e2e8f0", borderRadius: "10px", overflow: "hidden" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "1rem", borderBottom: "1px solid #e2e8f0", background: "#f8fafc" }}>
                  <div>
                    <strong style={{ color: "#1e293b" }}>
                      {selectedConnection}
                    </strong>
                    <span style={{ color: "#22c55e", marginLeft: "0.5rem" }}>●</span>
                  </div>

                  <button
                    onClick={() => setSelectedConnection(null)}
                    style={{
                      border: "none",
                      background: "transparent",
                      color: "#64748b",
                      cursor: "pointer",
                    }}
                  >
                    Close
                  </button>
                </div>

                <div style={{ minHeight: "220px", padding: "1rem" }}>
                  <p style={{ color: "#94a3b8", fontSize: "0.85rem" }}>
                    This is the beginning of your conversation with {selectedConnection}.
                  </p>

                  {(directMessages[selectedConnection] || []).map((msg) => (
                    <div
                      key={msg.id}
                      style={{
                        marginTop: "0.75rem",
                        marginLeft: "auto",
                        maxWidth: "70%",
                        overflowWrap: "anywhere",
                        padding: "0.6rem 0.9rem",
                        background: "#2563eb",
                        color: "#fff",
                        borderRadius: "10px",
                      }}
                    >
                      {msg.content}
                    </div>
                  ))}
                </div>

                <div style={{ display: "flex", gap: "0.5rem", padding: "1rem", borderTop: "1px solid #e2e8f0" }}>
                  <input
                    type="text"
                    value={directMessage}
                    onChange={(e) => setDirectMessage(e.target.value)}
                    placeholder={`Message ${selectedConnection}...`}
                    style={{
                      flex: 1,
                      padding: "0.7rem 1rem",
                      border: "1px solid #cbd5e1",
                      borderRadius: "8px",
                      outline: "none",
                    }}
                  />

                  <button
                    onClick={() => {
                      const message = directMessage.trim();
                      if (!message) return;

                      setDirectMessages((prev) => ({
                        ...prev,
                        [selectedConnection]: [
                          ...(prev[selectedConnection] || []),
                          {
                            id: Date.now(),
                            content: message,
                          },
                        ],
                      }));

                      setDirectMessage("");
                    }}
                    style={{
                      padding: "0.7rem 1.2rem",
                      background: "#2563eb",
                      color: "#fff",
                      border: "none",
                      borderRadius: "8px",
                      fontWeight: "600",
                      cursor: "pointer",
                    }}
                  >
                    Send
                  </button>
                </div>
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "1rem", border: "1px solid #e2e8f0", borderRadius: "10px" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.3rem" }}>
                    <span style={{ width: "9px", height: "9px", background: "#22c55e", borderRadius: "50%", display: "inline-block" }}></span>
                    <strong style={{ color: "#1e293b" }}>Luke Nelson</strong>
                  </div>

                  <div style={{ fontSize: "0.85rem", color: "#64748b" }}>
                    CS 3398 • Project Work
                  </div>

                  <div style={{ fontSize: "0.8rem", color: "#94a3b8", marginTop: "0.2rem" }}>
                    Available Tue / Thu
                  </div>
                </div>

                <button
                  onClick={() => setSelectedConnection("Luke Nelson")}
                  style={{
                    padding: "0.6rem 1rem",
                    background: "#f1f5f9",
                    color: "#475569",
                    border: "1px solid #cbd5e1",
                    borderRadius: "8px",
                    fontWeight: "600",
                    cursor: "pointer",
                  }}
                >
                  Message
                </button>
              </div>

              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "1rem", border: "1px solid #e2e8f0", borderRadius: "10px" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.3rem" }}>
                    <span style={{ width: "9px", height: "9px", background: "#94a3b8", borderRadius: "50%", display: "inline-block" }}></span>
                    <strong style={{ color: "#1e293b" }}>Jack Wilson</strong>
                  </div>

                  <div style={{ fontSize: "0.85rem", color: "#64748b" }}>
                    CS 3360 • Homework Help
                  </div>

                  <div style={{ fontSize: "0.8rem", color: "#94a3b8", marginTop: "0.2rem" }}>
                    Available Mon / Wed
                  </div>
                </div>

                <button
                  onClick={() => setSelectedConnection("Jack Wilson")}
                  style={{
                    padding: "0.6rem 1rem",
                    background: "#f1f5f9",
                    color: "#475569",
                    border: "1px solid #cbd5e1",
                    borderRadius: "8px",
                    fontWeight: "600",
                    cursor: "pointer",
                  }}
                >
                  Message
                </button>
              </div>
            </div>
          </div>
        )}

        {partnerView === "requests" && (
          <div>
            <h2 style={{ color: "#1e293b", marginBottom: "0.3rem" }}>
              Requests
            </h2>

            <p style={{ color: "#64748b", marginBottom: "1rem" }}>
              Pending study partner requests.
            </p>

            {requestedPartners.length === 0 && (
              <p style={{ color: "#94a3b8", fontSize: "0.9rem" }}>
                You haven't sent any requests yet.
              </p>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {requestedPartners.includes("maya") && (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "1rem", border: "1px solid #e2e8f0", borderRadius: "10px" }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.3rem" }}>
                      <span style={{ width: "9px", height: "9px", background: "#22c55e", borderRadius: "50%", display: "inline-block" }}></span>
                      <strong style={{ color: "#1e293b" }}>Maya Chen</strong>
                    </div>

                    <div style={{ fontSize: "0.85rem", color: "#64748b" }}>
                      CS 3398 • Group Study
                    </div>
                  </div>

                  <span style={{ color: "#64748b", fontSize: "0.85rem", fontWeight: "600" }}>
                    Requested ✓
                  </span>
                </div>
              )}

              {requestedPartners.includes("david") && (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "1rem", border: "1px solid #e2e8f0", borderRadius: "10px" }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.3rem" }}>
                      <span style={{ width: "9px", height: "9px", background: "#eab308", borderRadius: "50%", display: "inline-block" }}></span>
                      <strong style={{ color: "#1e293b" }}>David Olajide</strong>
                    </div>

                    <div style={{ fontSize: "0.85rem", color: "#64748b" }}>
                      CS 3398 • Exam Prep
                    </div>
                  </div>

                  <span style={{ color: "#64748b", fontSize: "0.85rem", fontWeight: "600" }}>
                    Requested ✓
                  </span>
                </div>
              )}

              {requestedPartners.includes("fidel") && (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "1rem", border: "1px solid #e2e8f0", borderRadius: "10px" }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.3rem" }}>
                      <span style={{ width: "9px", height: "9px", background: "#94a3b8", borderRadius: "50%", display: "inline-block" }}></span>
                      <strong style={{ color: "#1e293b" }}>Fidel Ramirez</strong>
                    </div>

                    <div style={{ fontSize: "0.85rem", color: "#64748b" }}>
                      CS 3360 • Homework Help
                    </div>
                  </div>

                  <span style={{ color: "#64748b", fontSize: "0.85rem", fontWeight: "600" }}>
                    Requested ✓
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>}

    {activeTab === "groups" && (
      <div style={{ display: "flex", height: "calc(100vh - 200px)", border: "1px solid #e2e8f0", borderRadius: "12px", overflow: "hidden", background: "#fff" }}>

        {/* Study Groups Sidebar */}
        <div style={{ width: "220px", flexShrink: 0, overflowY: "auto", borderRight: "1px solid #e2e8f0", background: "#f8fafc", padding: "1rem" }}>
          <h3 style={{ fontSize: "1rem", fontWeight: "700", color: "#1e293b", marginBottom: "1rem" }}>
            Study Groups
          </h3>

          <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
            <button
              onClick={() => changeGroupView("discover")}
              style={{
                textAlign: "left",
                padding: "0.6rem 0.8rem",
                border: "none",
                borderRadius: "8px",
                background: groupView === "discover" ? "#e0e7ff" : "transparent",
                color: groupView === "discover" ? "#4338ca" : "#64748b",
                fontWeight: groupView === "discover" ? "600" : "400",
                cursor: "pointer",
              }}
            >
              Discover
            </button>

            <button
              onClick={() => changeGroupView("myGroups")}
              style={{
                textAlign: "left",
                padding: "0.6rem 0.8rem",
                border: "none",
                borderRadius: "8px",
                background: groupView === "myGroups" ? "#e0e7ff" : "transparent",
                color: groupView === "myGroups" ? "#4338ca" : "#64748b",
                fontWeight: groupView === "myGroups" ? "600" : "400",
                cursor: "pointer",
              }}
            >
              My Groups
            </button>

            <button
              onClick={() => changeGroupView("invites")}
              style={{
                textAlign: "left",
                padding: "0.6rem 0.8rem",
                border: "none",
                borderRadius: "8px",
                background: groupView === "invites" ? "#e0e7ff" : "transparent",
                color: groupView === "invites" ? "#4338ca" : "#64748b",
                fontWeight: groupView === "invites" ? "600" : "400",
                cursor: "pointer",
              }}
            >
              Invites
            </button>
          </div>
        </div>

        {/* Study Groups Main Area */}
        <div style={{ flex: 1, minWidth: 0, padding: "1.5rem", overflowY: "auto" }}>
          {openGroup && (
            <div style={{ display: "flex", height: "100%", minHeight: "320px" }}>
              <div style={{ width: "220px", flexShrink: 0, overflowY: "auto", borderRight: "1px solid #e2e8f0", background: "#f8fafc", padding: "1rem" }}>
                <button
                  onClick={() => setOpenGroup(null)}
                  style={{
                    marginBottom: "1rem",
                    border: "none",
                    background: "transparent",
                    color: "#2563eb",
                    cursor: "pointer",
                    fontWeight: "600",
                  }}
                >
                  ← Back to Groups
                </button>

                <h3 style={{ color: "#1e293b", marginBottom: "0.5rem" }}>
                  {openGroup.name}
                </h3>

                <p style={{ fontSize: "0.8rem", color: "#64748b", marginBottom: "1rem" }}>
                  {openGroup.course}
                </p>

                <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                  <div
                    onClick={() => setGroupChannel("general")}
                    style={{
                      padding: "0.5rem 0.7rem",
                      borderRadius: "6px",
                      background: groupChannel === "general" ? "#e0e7ff" : "transparent",
                      color: groupChannel === "general" ? "#4338ca" : "#64748b",
                      fontWeight: groupChannel === "general" ? "600" : "400",
                      cursor: "pointer",
                    }}
                  >
                    # general
                  </div>

                  <div
                    onClick={() => setGroupChannel("homework")}
                    style={{
                      padding: "0.5rem 0.7rem",
                      borderRadius: "6px",
                      background: groupChannel === "homework" ? "#e0e7ff" : "transparent",
                      color: groupChannel === "homework" ? "#4338ca" : "#64748b",
                      fontWeight: groupChannel === "homework" ? "600" : "400",
                      cursor: "pointer",
                    }}
                  >
                    # homework
                  </div>

                  <div
                    onClick={() => setGroupChannel("meetups")}
                    style={{
                      padding: "0.5rem 0.7rem",
                      borderRadius: "6px",
                      background: groupChannel === "meetups" ? "#e0e7ff" : "transparent",
                      color: groupChannel === "meetups" ? "#4338ca" : "#64748b",
                      fontWeight: groupChannel === "meetups" ? "600" : "400",
                      cursor: "pointer",
                    }}
                  >
                    # meetups
                  </div>
                </div>
              </div>

              <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column" }}>
                <div style={{ padding: "1rem", borderBottom: "1px solid #e2e8f0", fontWeight: "600", color: "#1e293b" }}>
                  # {groupChannel}
                </div>

                <div style={{ flex: 1, minHeight: 0, padding: "1rem", overflowY: "auto" }}>
                  <p style={{ color: "#64748b" }}>
                    Welcome to {openGroup.name}.
                  </p>

                  {(groupMessages[openGroup.id]?.[groupChannel] || []).map((msg) => (
                    <div
                      key={msg.id}
                      style={{
                        marginTop: "0.75rem",
                        padding: "0.6rem 0.9rem",
                        background: "#2563eb",
                        color: "#fff",
                        borderRadius: "10px",
                        maxWidth: "70%",
                        overflowWrap: "anywhere",
                        marginLeft: "auto",
                      }}
                    >
                      <div style={{ fontSize: "0.75rem", opacity: 0.8, marginBottom: "0.2rem" }}>
                        You
                      </div>

                      <div style={{ fontSize: "0.95rem" }}>
                        {msg.content}
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{ display: "flex", gap: "0.5rem", padding: "1rem", borderTop: "1px solid #e2e8f0" }}>
                  <input
                    type="text"
                    placeholder={`Message #${groupChannel}...`}
                    value={groupMessage}
                    onChange={(e) => setGroupMessage(e.target.value)}
                    style={{
                      flex: 1,
                      padding: "0.7rem 1rem",
                      border: "1px solid #cbd5e1",
                      borderRadius: "8px",
                      outline: "none",
                    }}
                  />

                  <button
                    onClick={() => {
                      const message = groupMessage.trim();
                      if (!message) return;

                      setGroupMessages((prev) => ({
                        ...prev,
                        [openGroup.id]: {
                          ...prev[openGroup.id],
                          [groupChannel]: [
                            ...(prev[openGroup.id]?.[groupChannel] || []),
                            {
                              id: Date.now(),
                              content: message,
                            },
                          ],
                        },
                      }));

                      setGroupMessage("");
                    }}
                    style={{
                      padding: "0.7rem 1.2rem",
                      background: "#2563eb",
                      color: "#fff",
                      border: "none",
                      borderRadius: "8px",
                      fontWeight: "600",
                      cursor: "pointer",
                    }}
                  >
                    Send
                  </button>
                </div>
              </div>
            </div>
          )}

          {!openGroup && groupView === "discover" && (
            <>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem" }}>
                <div>
                  <h2 style={{ color: "#1e293b", marginBottom: "0.3rem" }}>
                    Discover Study Groups
                  </h2>

                  <p style={{ color: "#64748b", fontSize: "0.9rem" }}>
                    Join groups created by students in your courses.
                  </p>
                </div>

                <button
                  onClick={() => setShowCreateGroup(true)}
                  style={{
                    padding: "0.7rem 1rem",
                    background: "#2563eb",
                    color: "#fff",
                    border: "none",
                    borderRadius: "8px",
                    fontWeight: "600",
                    cursor: "pointer",
                  }}
                >
                  + Create Group
                </button>
              </div>

              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", marginBottom: "1.5rem" }}>
                <input
                  type="text"
                  placeholder="Search study groups..."
                  value={groupSearch}
                  onChange={(e) => setGroupSearch(e.target.value)}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    padding: "0.7rem 1rem",
                    border: "1px solid #cbd5e1",
                    borderRadius: "8px",
                    outline: "none",
                  }}
                />

                <select
                  value={groupCourse}
                  onChange={(e) => setGroupCourse(e.target.value)}
                  style={{
                    padding: "0.7rem 1rem",
                    border: "1px solid #cbd5e1",
                    borderRadius: "8px",
                    background: "#fff",
                    color: "#475569",
                  }}
                >
                  <option value="all">All Courses</option>
                  <option value="CS 3398">CS 3398</option>
                  <option value="CS 3360">CS 3360</option>
                </select>
              </div>

              {showCreateGroup && (
                <div
                  style={{
                    marginBottom: "1.5rem",
                    padding: "1rem",
                    border: "1px solid #e2e8f0",
                    borderRadius: "10px",
                    background: "#f8fafc",
                  }}
                >
                  <h3 style={{ color: "#1e293b", marginBottom: "1rem" }}>
                    Create Study Group
                  </h3>

                  <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                    <input
                      type="text"
                      placeholder="Group name"
                      value={newGroupName}
                      onChange={(e) => setNewGroupName(e.target.value)}
                      style={{
                        padding: "0.7rem 1rem",
                        border: "1px solid #cbd5e1",
                        borderRadius: "8px",
                        outline: "none",
                      }}
                    />

                    <select
                      value={newGroupCourse}
                      onChange={(e) => setNewGroupCourse(e.target.value)}
                      style={{
                        padding: "0.7rem 1rem",
                        border: "1px solid #cbd5e1",
                        borderRadius: "8px",
                        background: "#fff",
                        color: "#475569",
                      }}
                    >
                      <option value="CS 3398">CS 3398</option>
                      <option value="CS 3360">CS 3360</option>
                      <option value="EE 2120">EE 2120</option>
                    </select>

                    <input
                      type="text"
                      placeholder="Meeting time, ex: Wednesday at 6 PM"
                      value={newGroupTime}
                      onChange={(e) => setNewGroupTime(e.target.value)}
                      style={{
                        padding: "0.7rem 1rem",
                        border: "1px solid #cbd5e1",
                        borderRadius: "8px",
                        outline: "none",
                      }}
                    />

                    <div style={{ display: "flex", gap: "0.5rem" }}>
                      <button
                        onClick={() => {
                          if (!newGroupName.trim()) return;

                          const newGroup = {
                            id: Date.now(),
                            name: newGroupName.trim(),
                            course: newGroupCourse,
                            time: newGroupTime.trim() || "Meeting time not set",
                          };

                          setCreatedGroups((prev) => [...prev, newGroup]);

                          setShowCreateGroup(false);
                          setNewGroupName("");
                          setNewGroupTime("");
                        }}
                        style={{
                          padding: "0.6rem 1rem",
                          background: "#2563eb",
                          color: "#fff",
                          border: "none",
                          borderRadius: "8px",
                          fontWeight: "600",
                          cursor: "pointer",
                        }}
                      >
                        Create
                      </button>

                      <button
                        onClick={() => setShowCreateGroup(false)}
                        style={{
                          padding: "0.6rem 1rem",
                          background: "#f1f5f9",
                          color: "#475569",
                          border: "1px solid #cbd5e1",
                          borderRadius: "8px",
                          fontWeight: "600",
                          cursor: "pointer",
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>

                <div style={{ display:
                  "cs 3398 exam prep".includes(groupSearch.toLowerCase()) &&
                  (groupCourse === "all" || groupCourse === "CS 3398")
                    ? "flex"
                    : "none", alignItems: "center", justifyContent: "space-between", padding: "1rem", border: "1px solid #e2e8f0", borderRadius: "10px" }}>
                  <div>
                    <strong style={{ color: "#1e293b" }}>
                      CS 3398 Exam Prep
                    </strong>

                    <div style={{ fontSize: "0.85rem", color: "#64748b", marginTop: "0.3rem" }}>
                      CS 3398 • 5 members
                    </div>

                    <div style={{ fontSize: "0.8rem", color: "#94a3b8", marginTop: "0.2rem" }}>
                      Wednesday at 6:00 PM
                    </div>
                  </div>

                  <button
                    onClick={() =>
                      setJoinedGroups((prev) =>
                        prev.includes("examPrep")
                          ? prev.filter((id) => id !== "examPrep")
                          : [...prev, "examPrep"]
                      )
                    }
                    style={{
                      padding: "0.6rem 1rem",
                      background: joinedGroups.includes("examPrep") ? "#e2e8f0" : "#2563eb",
                      color: joinedGroups.includes("examPrep") ? "#475569" : "#fff",
                      border: "none",
                      borderRadius: "8px",
                      fontWeight: "600",
                      cursor: "pointer",
                    }}
                  >
                    {joinedGroups.includes("examPrep") ? "Joined ✓" : "Join"}
                  </button>
                </div>

                <div style={{ display:
                  "software engineering project group".includes(groupSearch.toLowerCase()) &&
                  (groupCourse === "all" || groupCourse === "CS 3398")
                    ? "flex"
                    : "none", alignItems: "center", justifyContent: "space-between", padding: "1rem", border: "1px solid #e2e8f0", borderRadius: "10px" }}>
                  <div>
                    <strong style={{ color: "#1e293b" }}>
                      Software Engineering Project Group
                    </strong>

                    <div style={{ fontSize: "0.85rem", color: "#64748b", marginTop: "0.3rem" }}>
                      CS 3398 • 4 members
                    </div>

                    <div style={{ fontSize: "0.8rem", color: "#94a3b8", marginTop: "0.2rem" }}>
                      Thursday at 4:00 PM
                    </div>
                  </div>

                  <button
                    onClick={() =>
                      setJoinedGroups((prev) =>
                        prev.includes("projectGroup")
                          ? prev.filter((id) => id !== "projectGroup")
                          : [...prev, "projectGroup"]
                      )
                    }
                    style={{
                      padding: "0.6rem 1rem",
                      background: joinedGroups.includes("projectGroup") ? "#e2e8f0" : "#2563eb",
                      color: joinedGroups.includes("projectGroup") ? "#475569" : "#fff",
                      border: "none",
                      borderRadius: "8px",
                      fontWeight: "600",
                      cursor: "pointer",
                    }}
                  >
                    {joinedGroups.includes("projectGroup") ? "Joined ✓" : "Join"}
                  </button>
                </div>

                <div style={{ display:
                  "homework help".includes(groupSearch.toLowerCase()) &&
                  (groupCourse === "all" || groupCourse === "CS 3360")
                    ? "flex"
                    : "none", alignItems: "center", justifyContent: "space-between", padding: "1rem", border: "1px solid #e2e8f0", borderRadius: "10px" }}>
                  <div>
                    <strong style={{ color: "#1e293b" }}>
                      Homework Help
                    </strong>

                    <div style={{ fontSize: "0.85rem", color: "#64748b", marginTop: "0.3rem" }}>
                      CS 3360 • 7 members
                    </div>

                    <div style={{ fontSize: "0.8rem", color: "#94a3b8", marginTop: "0.2rem" }}>
                      Monday at 7:30 PM
                    </div>
                  </div>

                  <button
                    onClick={() =>
                      setJoinedGroups((prev) =>
                        prev.includes("homeworkHelp")
                          ? prev.filter((id) => id !== "homeworkHelp")
                          : [...prev, "homeworkHelp"]
                      )
                    }
                    style={{
                      padding: "0.6rem 1rem",
                      background: joinedGroups.includes("homeworkHelp") ? "#e2e8f0" : "#2563eb",
                      color: joinedGroups.includes("homeworkHelp") ? "#475569" : "#fff",
                      border: "none",
                      borderRadius: "8px",
                      fontWeight: "600",
                      cursor: "pointer",
                    }}
                  >
                    {joinedGroups.includes("homeworkHelp") ? "Joined ✓" : "Join"}
                  </button>
                </div>

              </div>
            </>
          )}

          {!openGroup && groupView === "myGroups" && (
            <div>
              <h2 style={{ color: "#1e293b", marginBottom: "0.3rem" }}>
                My Groups
              </h2>

              <p style={{ color: "#64748b", marginBottom: "1rem" }}>
                Study groups you've joined.
              </p>

              {joinedGroups.length === 0 && createdGroups.length === 0 && (
                <p style={{ color: "#94a3b8", fontSize: "0.9rem" }}>
                  You haven't joined any study groups yet.
                </p>
              )}

              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                {joinedGroups.includes("examPrep") && (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "1rem", border: "1px solid #e2e8f0", borderRadius: "10px" }}>
                    <div>
                      <strong style={{ color: "#1e293b" }}>
                        CS 3398 Exam Prep
                      </strong>

                      <div style={{ fontSize: "0.85rem", color: "#64748b", marginTop: "0.3rem" }}>
                        CS 3398 • 5 members
                      </div>

                      <div style={{ fontSize: "0.8rem", color: "#94a3b8", marginTop: "0.2rem" }}>
                        Wednesday at 6:00 PM
                      </div>
                    </div>

                    <button
                      onClick={() =>
                        openStudyGroup({
                          id: "examPrep",
                          name: "CS 3398 Exam Prep",
                          course: "CS 3398",
                        })
                      }
                      style={{
                        padding: "0.6rem 1rem",
                        background: "#f1f5f9",
                        color: "#475569",
                        border: "1px solid #cbd5e1",
                        borderRadius: "8px",
                        fontWeight: "600",
                        cursor: "pointer",
                      }}
                    >
                      Open Group
                    </button>
                  </div>
                )}

                {joinedGroups.includes("projectGroup") && (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "1rem", border: "1px solid #e2e8f0", borderRadius: "10px" }}>
                    <div>
                      <strong style={{ color: "#1e293b" }}>
                        Software Engineering Project Group
                      </strong>

                      <div style={{ fontSize: "0.85rem", color: "#64748b", marginTop: "0.3rem" }}>
                        CS 3398 • 4 members
                      </div>

                      <div style={{ fontSize: "0.8rem", color: "#94a3b8", marginTop: "0.2rem" }}>
                        Thursday at 4:00 PM
                      </div>
                    </div>

                    <button
                      onClick={() =>
                        openStudyGroup({
                          id: "projectGroup",
                          name: "Software Engineering Project Group",
                          course: "CS 3398",
                        })
                      }
                      style={{
                        padding: "0.6rem 1rem",
                        background: "#f1f5f9",
                        color: "#475569",
                        border: "1px solid #cbd5e1",
                        borderRadius: "8px",
                        fontWeight: "600",
                        cursor: "pointer",
                      }}
                    >
                      Open Group
                    </button>
                  </div>
                )}

                {joinedGroups.includes("homeworkHelp") && (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "1rem", border: "1px solid #e2e8f0", borderRadius: "10px" }}>
                    <div>
                      <strong style={{ color: "#1e293b" }}>
                        Homework Help
                      </strong>

                      <div style={{ fontSize: "0.85rem", color: "#64748b", marginTop: "0.3rem" }}>
                        CS 3360 • 7 members
                      </div>

                      <div style={{ fontSize: "0.8rem", color: "#94a3b8", marginTop: "0.2rem" }}>
                        Monday at 7:30 PM
                      </div>
                    </div>

                    <button
                      onClick={() =>
                        openStudyGroup({
                          id: "homeworkHelp",
                          name: "Homework Help",
                          course: "CS 3360",
                        })
                      }
                      style={{
                        padding: "0.6rem 1rem",
                        background: "#f1f5f9",
                        color: "#475569",
                        border: "1px solid #cbd5e1",
                        borderRadius: "8px",
                        fontWeight: "600",
                        cursor: "pointer",
                      }}
                    >
                      Open Group
                    </button>
                  </div>
                )}

                {joinedGroups.includes("calcStudy") && (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "1rem", border: "1px solid #e2e8f0", borderRadius: "10px" }}>
                    <div>
                      <strong style={{ color: "#1e293b" }}>
                        Calculus Study Session
                      </strong>

                      <div style={{ fontSize: "0.85rem", color: "#64748b", marginTop: "0.3rem" }}>
                        MATH 2472 • 6 members
                      </div>

                      <div style={{ fontSize: "0.8rem", color: "#94a3b8", marginTop: "0.2rem" }}>
                        Joined from invite
                      </div>
                    </div>

                    <button
                      onClick={() =>
                        openStudyGroup({
                          id: "calcStudy",
                          name: "Calculus Study Session",
                          course: "MATH 2472",
                        })
                      }
                      style={{
                        padding: "0.6rem 1rem",
                        background: "#f1f5f9",
                        color: "#475569",
                        border: "1px solid #cbd5e1",
                        borderRadius: "8px",
                        fontWeight: "600",
                        cursor: "pointer",
                      }}
                    >
                      Open Group
                    </button>
                  </div>
                )}

                {joinedGroups.includes("architectureReview") && (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "1rem", border: "1px solid #e2e8f0", borderRadius: "10px" }}>
                    <div>
                      <strong style={{ color: "#1e293b" }}>
                        Computer Architecture Review
                      </strong>

                      <div style={{ fontSize: "0.85rem", color: "#64748b", marginTop: "0.3rem" }}>
                        CS 3339 • 4 members
                      </div>

                      <div style={{ fontSize: "0.8rem", color: "#94a3b8", marginTop: "0.2rem" }}>
                        Joined from invite
                      </div>
                    </div>

                    <button
                      onClick={() =>
                        openStudyGroup({
                          id: "architectureReview",
                          name: "Computer Architecture Review",
                          course: "CS 3339",
                        })
                      }
                      style={{
                        padding: "0.6rem 1rem",
                        background: "#f1f5f9",
                        color: "#475569",
                        border: "1px solid #cbd5e1",
                        borderRadius: "8px",
                        fontWeight: "600",
                        cursor: "pointer",
                      }}
                    >
                      Open Group
                    </button>
                  </div>
                )}

                {createdGroups.map((group) => (
                  <div
                    key={group.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "1rem",
                      border: "1px solid #e2e8f0",
                      borderRadius: "10px",
                    }}
                  >
                    <div>
                      <strong style={{ color: "#1e293b" }}>
                        {group.name}
                      </strong>

                      <div
                        style={{
                          fontSize: "0.85rem",
                          color: "#64748b",
                          marginTop: "0.3rem",
                        }}
                      >
                        {group.course} • Created by you
                      </div>

                      <div
                        style={{
                          fontSize: "0.8rem",
                          color: "#94a3b8",
                          marginTop: "0.2rem",
                        }}
                      >
                        {group.time}
                      </div>
                    </div>

                    <button
                      onClick={() =>
                        openStudyGroup({
                          id: group.id,
                          name: group.name,
                          course: group.course,
                        })
                        
                      }
                      style={{
                        padding: "0.6rem 1rem",
                        background: "#f1f5f9",
                        color: "#475569",
                        border: "1px solid #cbd5e1",
                        borderRadius: "8px",
                        fontWeight: "600",
                        cursor: "pointer",
                      }}
                    >
                      Open Group
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!openGroup && groupView === "invites" && (
            <div>
              <h2 style={{ color: "#1e293b", marginBottom: "0.3rem" }}>
                Invites
              </h2>

              <p style={{ color: "#64748b", marginBottom: "1rem" }}>
                Study group invitations sent to you.
              </p>

              {groupInvites.length === 0 && (
                <p style={{ color: "#94a3b8", fontSize: "0.9rem" }}>
                  You don't have any pending invites.
                </p>
              )}

              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                {groupInvites.includes("calcStudy") && (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "1rem", border: "1px solid #e2e8f0", borderRadius: "10px" }}>
                    <div>
                      <strong style={{ color: "#1e293b" }}>
                        Calculus Study Session
                      </strong>

                      <div style={{ fontSize: "0.85rem", color: "#64748b", marginTop: "0.3rem" }}>
                        MATH 2472 • 6 members
                      </div>

                      <div style={{ fontSize: "0.8rem", color: "#94a3b8", marginTop: "0.2rem" }}>
                        Invited by Maya Chen
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: "0.5rem" }}>
                      <button
                        onClick={() => {
                          setGroupInvites((prev) => prev.filter((id) => id !== "calcStudy"));
                          setJoinedGroups((prev) =>
                            prev.includes("calcStudy") ? prev : [...prev, "calcStudy"]
                          );
                        }}
                        style={{
                          padding: "0.6rem 1rem",
                          background: "#2563eb",
                          color: "#fff",
                          border: "none",
                          borderRadius: "8px",
                          fontWeight: "600",
                          cursor: "pointer",
                        }}
                      >
                        Accept
                      </button>

                      <button
                        onClick={() =>
                          setGroupInvites((prev) =>
                            prev.filter((id) => id !== "calcStudy")
                          )
                        }
                        style={{
                          padding: "0.6rem 1rem",
                          background: "#f1f5f9",
                          color: "#475569",
                          border: "1px solid #cbd5e1",
                          borderRadius: "8px",
                          fontWeight: "600",
                          cursor: "pointer",
                        }}
                      >
                        Decline
                      </button>
                    </div>
                  </div>
                )}

                {groupInvites.includes("architectureReview") && (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "1rem", border: "1px solid #e2e8f0", borderRadius: "10px" }}>
                    <div>
                      <strong style={{ color: "#1e293b" }}>
                        Computer Architecture Review
                      </strong>

                      <div style={{ fontSize: "0.85rem", color: "#64748b", marginTop: "0.3rem" }}>
                        CS 3339 • 4 members
                      </div>

                      <div style={{ fontSize: "0.8rem", color: "#94a3b8", marginTop: "0.2rem" }}>
                        Invited by David Olajide
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: "0.5rem" }}>
                      <button
                        onClick={() => {
                          setGroupInvites((prev) =>
                            prev.filter((id) => id !== "architectureReview")
                          );
                          setJoinedGroups((prev) =>
                            prev.includes("architectureReview")
                              ? prev
                              : [...prev, "architectureReview"]
                          );
                        }}
                        style={{
                          padding: "0.6rem 1rem",
                          background: "#2563eb",
                          color: "#fff",
                          border: "none",
                          borderRadius: "8px",
                          fontWeight: "600",
                          cursor: "pointer",
                        }}
                      >
                        Accept
                      </button>

                      <button
                        onClick={() =>
                          setGroupInvites((prev) =>
                            prev.filter((id) => id !== "architectureReview")
                          )
                        }
                        style={{
                          padding: "0.6rem 1rem",
                          background: "#f1f5f9",
                          color: "#475569",
                          border: "1px solid #cbd5e1",
                          borderRadius: "8px",
                          fontWeight: "600",
                          cursor: "pointer",
                        }}
                      >
                        Decline
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    )}

  </div>;
}
