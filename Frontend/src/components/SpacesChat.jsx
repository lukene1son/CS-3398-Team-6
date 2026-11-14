import React, { useState, useEffect, useRef, useCallback } from "react";
import { getMyCourses, getCourseChannels, getChannelMessages, sendChannelMessage, getSuggestedPartners, 
sendFriendRequest, getFriendRequests, respondToFriendRequest, cancelFriendRequest, getFriends, removeFriend,
getConversations, getDirectMessages, sendDirectMessage, getDiscoverGroups, getMyStudyGroups, createStudyGroup,
joinStudyGroup, leaveStudyGroup, getGroupMessages, sendGroupMessage, getGroupInvites, inviteToGroup, respondToGroupInvite,
getCourseMembers, getGroupMembers } from "../api";
import { Users, Search } from "lucide-react";
import Avatar from "./Avatar";
import { onSocketEvent, watchRoom } from "../socket";
import { courseAccent } from "../courseColors";

// The sidebar's two views. The white pill slides to the active one (index.css .segment-pill).
const SIDEBAR_VIEWS = [
  { id: "spaces", label: "Study Spaces" },
  { id: "partners", label: "Study Partners" },
];
// The Study Partners view's pages (shown in the main area).
const PARTNER_VIEWS = [
  { id: "connections", label: "My Connections", icon: Users },
  { id: "suggested", label: "Find Study Partners", icon: Search },
];

const PARTNER_POLL_MS = 10000; // how often we poll server so other users' friend requests show up
const POLL_MS = 60000; // safety net only; live updates come over the socket (socket.js)
const partnerCardStyle = { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "1rem", border: "1px solid #e2e8f0", borderRadius: "10px" };
const primaryButtonStyle = { padding: "0.6rem 1rem", background: "#2563eb", color: "#fff", border: "none", borderRadius: "8px", fontWeight: "600", cursor: "pointer" };
const secondaryButtonStyle = { padding: "0.6rem 1rem", background: "#f1f5f9", color: "#475569", border: "1px solid #cbd5e1", borderRadius: "8px", fontWeight: "600", cursor: "pointer" };
const privateBadgeStyle = { marginLeft: "0.4rem", fontSize: "0.75rem", fontWeight: "500", color: "#64748b" };

const GROUP_CHANNELS = ["general", "homework", "meetups"];

// Chat-tab sidebar styles, matching the existing course and channel rows.
function sidebarItemStyle(active) {
  return {
    padding: "0.6rem 0.8rem",
    borderRadius: "8px",
    cursor: "pointer",
    fontSize: "0.9rem",
    fontWeight: active ? "600" : "400",
    background: active ? "#e0e7ff" : "transparent",
    color: active ? "#4338ca" : "#475569",
  };
}
function sidebarChannelStyle(active) {
  return {
    padding: "0.4rem 0.8rem",
    borderRadius: "6px",
    cursor: "pointer",
    fontSize: "0.85rem",
    background: active ? "#c7d2fe" : "transparent",
    color: active ? "#3730a3" : "#64748b",
  };
}

// Added to a sidebar row that can show an <UnreadDot>: the dot sits at the right end.
const dotRowStyle = { display: "flex", alignItems: "center", gap: "0.5rem" };

const sidebarHeadingStyle ={ fontSize: "1rem", fontWeight: "700", color: "#1e293b", margin: "1.5rem 0 0.5rem" };
const sidebarHintStyle = { fontSize: "0.8rem", color: "#94a3b8" };
const sidebarListStyle = { listStyle: "none", padding: 0, margin: 0 };

// Chat-sidebar heading that collapses/expands the section under it.
// Shows how many items are hidden while collapsed.
// Red unread dot for a sidebar row (same look as the bell's old dot). `info` is
// { unread, viewed } or missing (nothing unread: no dot). The ring around it
// (index.css .unread-ping) keeps pulsing until the notification has been seen
// in the bell window, then only pulses 3 times each time the dot appears.
function UnreadDot({ info, hidden = false }) {
  if (!info || info.unread <= 0 || hidden) return null;
  return (
    <span
      className={`unread-ping ${info.viewed ? "pulse-few" : "pulse"}`}
      title={`${info.unread} unread`}
      aria-label={`${info.unread} unread message${info.unread === 1 ? "" : "s"}`}
      style={{
        marginLeft: "auto",
        flexShrink: 0,
        width: "9px",
        height: "9px",
        background: "#ef4444",
        borderRadius: "50%",
        border: "2px solid white",
      }}
    />
  );
}

function SectionHeader({ title, count, collapsed, onToggle, first = false }) {
  return (
    <h3 style={{ ...sidebarHeadingStyle, ...(first ? { marginTop: 0 } : {}) }}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!collapsed}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.4rem",
          width: "100%",
          padding: 0,
          background: "none",
          border: "none",
          font: "inherit",
          color: "inherit",
          textAlign: "left",
          cursor: "pointer",
        }}
      >
        <span aria-hidden="true" style={{ width: "0.8rem", fontSize: "0.8rem", color: "#64748b" }}>
          {collapsed ? "▸" : "▾"}
        </span>
        <span style={{ flex: 1 }}>{title}</span>
        {collapsed && count > 0 && (
          <span style={{ fontSize: "0.75rem", fontWeight: "600", color: "#475569", background: "#e2e8f0", borderRadius: "999px", padding: "0.05rem 0.5rem" }}>
            {count}
          </span>
        )}
      </button>
    </h3>
  );
}

const MEMBER_STRIP_MAX = 6; // pictures shown before the "…" button (the Chat header passes 15)
const ROLE_LABELS = { teacher: "Teacher", ta: "TA" };

// The row of profile pictures for a space or group (Chat header, Discover and invite cards).
// Shows the first few people; the "…" button opens a list of everyone else.
// If renderCard is given, clicking a person shows their options card:
//   - a picture in the strip opens the card in a popover under the strip;
//   - a name in the "…" list opens the card right under that name, and the list stays open.
// Both close when you click anywhere outside the strip (or press Escape).
function MemberStrip({ members, max = MEMBER_STRIP_MAX, renderCard }) {
  const [listOpen, setListOpen] = useState(false);
  // { id, from: "strip" | "list" } - whose card is open, and where it was opened from.
  const [selected, setSelected] = useState(null);
  const rootRef = useRef(null);

  // Close the list and any open card on a click outside the strip, or on Escape.
  const anythingOpen = listOpen || selected !== null;
  useEffect(() => {
    if (!anythingOpen) return;
    function onPointerDown(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) {
        setListOpen(false);
        setSelected(null);
      }
    }
    function onKeyDown(e) {
      if (e.key === "Escape") {
        setListOpen(false);
        setSelected(null);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [anythingOpen]);

  if (!members || members.length === 0) return null;

  const shown = members.slice(0, max);
  const hidden = members.slice(max);
  const selectedMember = renderCard && selected ? members.find(m => m.id === selected.id) ?? null : null;
  const labelFor = (m) => (ROLE_LABELS[m.role] ? `${m.name} (${ROLE_LABELS[m.role]})` : m.name);
  const closeCard = () => setSelected(null);

  // A picture in the strip: closes the "…" list and opens that person's card under the strip.
  function selectFromStrip(id) {
    setListOpen(false);
    setSelected(prev => (prev?.id === id && prev.from === "strip" ? null : { id, from: "strip" }));
  }

  // A name in the "…" list: the list stays open and the card opens under that name.
  function selectFromList(id) {
    setSelected(prev => (prev?.id === id && prev.from === "list" ? null : { id, from: "list" }));
  }

  const popoverStyle = {
    position: "absolute",
    top: "calc(100% + 0.5rem)",
    left: 0,
    zIndex: 10,
    background: "#fff",
    border: "1px solid #e2e8f0",
    borderRadius: "10px",
    boxShadow: "0 8px 24px rgba(15, 23, 42, 0.12)",
    fontWeight: "400",
  };

  return (
    <div ref={rootRef} style={{ position: "relative", display: "flex", alignItems: "center", flexWrap: "wrap", rowGap: "0.3rem" }}>
      {shown.map((m, i) => {
        const isSelected = selected?.id === m.id && selected.from === "strip";
        const ring = {
          display: "inline-flex",
          marginLeft: i === 0 ? 0 : "-6px",
          borderRadius: "50%",
          boxShadow: isSelected ? "0 0 0 2px #2563eb" : "0 0 0 2px #fff",
        };
        const pic = <Avatar name={m.name} userId={m.id} color={m.avatar_color} hasAvatar={m.has_avatar} size={28} />;
        return renderCard ? (
          <button
            key={m.id}
            type="button"
            onClick={() => selectFromStrip(m.id)}
            title={labelFor(m)}
            aria-label={labelFor(m)}
            aria-expanded={isSelected}
            style={{ ...ring, padding: 0, border: "none", background: "none", cursor: "pointer" }}
          >
            {pic}
          </button>
        ) : (
          <span key={m.id} title={labelFor(m)} style={ring}>
            {pic}
          </span>
        );
      })}

      {hidden.length > 0 && (
        <button
          type="button"
          onClick={() => {
            setSelected(null);
            setListOpen(o => !o);
          }}
          aria-expanded={listOpen}
          aria-label={`Show ${hidden.length} more`}
          title={`${hidden.length} more`}
          style={{
            marginLeft: "-6px",
            width: 28,
            height: 28,
            borderRadius: "50%",
            border: "none",
            boxShadow: "0 0 0 2px #fff",
            background: listOpen ? "#c7d2fe" : "#e2e8f0",
            color: "#475569",
            fontSize: "0.85rem",
            fontWeight: "700",
            lineHeight: 1,
            cursor: "pointer",
          }}
        >
          …
        </button>
      )}

      {listOpen && (
        <div style={{ ...popoverStyle, width: "16rem", maxHeight: "22rem", overflowY: "auto", padding: "0.5rem" }}>
          <div style={{ fontSize: "0.75rem", fontWeight: "600", color: "#64748b", padding: "0.25rem 0.4rem 0.5rem" }}>
            {hidden.length} more
          </div>
          {hidden.map(m => {
            const isSelected = selected?.id === m.id && selected.from === "list";
            const rowStyle = { display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.35rem 0.4rem", color: "#1e293b", fontSize: "0.9rem" };
            const row = <>
              <Avatar name={m.name} userId={m.id} color={m.avatar_color} hasAvatar={m.has_avatar} size={24} />
              <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {m.name}
              </span>
              {ROLE_LABELS[m.role] && (
                <span style={{ fontSize: "0.7rem", fontWeight: "600", color: "#4338ca", background: "#e0e7ff", borderRadius: "999px", padding: "0.05rem 0.45rem" }}>
                  {ROLE_LABELS[m.role]}
                </span>
              )}
            </>;
            if (!renderCard) {
              return (
                <div key={m.id} style={rowStyle}>
                  {row}
                </div>
              );
            }
            return (
              <div key={m.id}>
                <button
                  type="button"
                  onClick={() => selectFromList(m.id)}
                  aria-expanded={isSelected}
                  style={{
                    ...rowStyle,
                    width: "100%",
                    border: "none",
                    borderRadius: "6px",
                    background: isSelected ? "#eef2ff" : "none",
                    font: "inherit",
                    textAlign: "left",
                    cursor: "pointer",
                  }}
                >
                  {row}
                </button>
                {isSelected && selectedMember && (
                  <div style={{ margin: "0.25rem 0.25rem 0.5rem", padding: "0.75rem", border: "1px solid #e2e8f0", borderRadius: "8px", background: "#f8fafc" }}>
                    {renderCard(selectedMember, closeCard)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {selectedMember && selected.from === "strip" && (
        <div style={{ ...popoverStyle, width: "16rem", padding: "0.75rem" }}>
          {renderCard(selectedMember, closeCard)}
        </div>
      )}
    </div>
  );
}

function formatTime(createdAt) {
  if (!createdAt) return "";
  const d = new Date(createdAt);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  });
}

// An assignment's due Date, e.g. "Fri, Nov 13, 2:30 PM" (same format as Home's formatDue).
function formatDue(due) {
  return due.toLocaleString([], {
    weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit"
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
 *   unread, groupChannelsUnread - unread chats for the sidebar's red dots (Dashboard loads them)
 *   openTarget - a chat to open, clicked in the bell's window (a new nonce = open it)
 */
export default function SpacesChat({
  user,
  unread = {},              // from Dashboard: { "dm-7": { unread, viewed }, "group-3": ..., "channel-2": ... }
  groupChannelsUnread = {}, // from Dashboard: { [groupId]: { general: 2, homework: 1 } }
  coursesUnread = {},       // from Dashboard: { [courseId]: { unread, viewed } }, all its channels together
  openTarget = null,        // from Dashboard: a chat clicked in the bell, { type, id, channel?, courseId?, nonce }
  assignments = [],         // from Dashboard: Home's Current Assignments (unfinished, soonest first, `due` is a Date or null)
  onOpenPlanner,            // from Dashboard: switch to the Planner page
}) {
  const userId = user?.id;
  const [courses, setCourses] = useState([]);
  const [channelsByCourse, setChannelsByCourse] = useState({});
  const [messagesByChannel, setMessagesByChannel] = useState({});
  const [selectedCourseId, setSelectedCourseId] = useState(null);
  const [selectedChannelId, setSelectedChannelId] = useState(null);
  const [inputText, setInputText] = useState("");
  const [pendingMessages, setPendingMessages] = useState([]);
  const pendingCount = useRef(0); // makes each tempId unique
  const [status, setStatus] = useState("Connecting...");
  const [errors, setErrors] = useState({});       // { [source]: message }, one per loader so one can't wipe another's
  const [sendError, setSendError] = useState(null); // { target: chatTitle, text }, only shown in the chat it happened in
  // Which list the sidebar shows, and what the main area shows:
  //   sidebarView: "spaces" (the open course's channels + groups) | "partners" (connections + DMs)
  //   mainView:    "chat" (a channel, group or DM) | "partners" (Connections / Find Study Partners)
  //                | "groups" (Discover / Invites)
  const [sidebarView, setSidebarView] = useState("spaces");
  const [mainView, setMainView] = useState("chat");

  const [partnerView, setPartnerView] = useState("connections");
  const bottomRef = useRef(null);
  const messageListRef = useRef(null);           // the scrolling message area
  const redrawTimerRef = useRef(null);           // handleMessageListScroll's "scrolling stopped" timer
  const redrawFlipRef = useRef(false);           // which of its two invisible backgrounds is on
  const lastScrolledTitleRef = useRef(null);     // chat we last auto-scrolled in
  const lastMessageCountRef = useRef(0);
  const connectingRef = useRef(new Set());       // partner ids with a request in flight (a ref, so a fast double click can't slip past)
  const [partnerSearch, setPartnerSearch] = useState("");
  const [partnerCourse, setPartnerCourse] = useState("all");
  const [connectionSearch, setConnectionSearch] = useState("");
  const [suggestedPartners, setSuggestedPartners] = useState([]);
  const [partnersLoading, setPartnersLoading] = useState(false);
  const [partnersError, setPartnersError] = useState("");
  const [connectStatus, setConnectStatus] = useState({});
  const [friends, setFriends] = useState([]);
  const [incomingRequests, setIncomingRequests] = useState([]);
  const [outgoingRequests, setOutgoingRequests] = useState([]);
  const [listsLoading, setListsLoading] = useState(false);
  const [listsError, setListsError] = useState("");
  const [busyRequestId, setBusyRequestId] = useState(null); // disables buttons while a click is in flight
  const [removingFriendId, setRemovingFriendId] = useState(null); // remove-connection in flight
  const [groupView, setGroupView] = useState("discover");
  const [groupInvites, setGroupInvites] = useState([]);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupCourse, setNewGroupCourse] = useState("");
  const [newGroupTime, setNewGroupTime] = useState("");
  const [newGroupVisibility, setNewGroupVisibility] = useState("public");
  const [groupsNotice, setGroupsNotice] = useState("");  // e.g. "Private group created..."
  const [leavingGroup, setLeavingGroup] = useState(false); // header Leave button in flight
  const [groupSearch, setGroupSearch] = useState("");
  const [groupCourse, setGroupCourse] = useState("all");
  const [groupChannel, setGroupChannel] = useState("general");
  const [directMessages, setDirectMessages] = useState({});
  const [conversations, setConversations] = useState([]);
  const [startedDmIds, setStartedDmIds] = useState([]);
  const [groupMessages, setGroupMessages] = useState({});
  const [myGroups, setMyGroups] = useState([]);             // chatable: yours + ones you teach
  const [discoverGroups, setDiscoverGroups] = useState([]); // every group in your courses
  const [groupsError, setGroupsError] = useState("");
  const [busyGroupId, setBusyGroupId] = useState(null);     // join/leave in flight
  const [busyInviteId, setBusyInviteId] = useState(null);   // accept/decline in flight
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [groupInvite, setGroupInvite] = useState({ friendId: null, groupId: "" }); // whose picker is open + chosen group
  const [connectionNotice, setConnectionNotice] = useState(null);                // { friendId, ok, text }
  const [membersByCourse, setMembersByCourse] = useState({});
  const [membersByGroup, setMembersByGroup] = useState({});

  // What the Chat tab is showing: a course channel, a study group, or a DM.
  //   { type: "channel" } | { type: "group", id } | { type: "dm", id: friendUserId }
  const [chatTarget, setChatTarget] = useState({ type: "channel" });
  
  // Set (or clear, with "") the Chat-tab error for one source.
  const setErrorFor = useCallback((source, message) => {
    setErrors(prev => (prev[source] || "") === message ? prev : { ...prev, [source]: message });
  }, []);

  // Which sidebar sections are collapsed (all open by default).
  const [collapsed, setCollapsed] = useState({ channels: false, groups: false, assignments: false, dms: false });

  function toggleSection(key) {
    setCollapsed(prev => ({ ...prev, [key]: !prev[key] }));
  }

  // Show a study group's chat, under its course's tab.
  function openGroupChat(groupId) {
    if (chatTarget.type !== "group" || chatTarget.id !== groupId) setGroupChannel("general");
    const group = myGroups.find(g => g.id === groupId);
    if (group) setSelectedCourseId(group.course_id);
    setChatTarget({ type: "group", id: groupId });
    setSidebarView("spaces");
    setMainView("chat");
  }

  // "Message" on a connection: open the DM with them. A chat you've never sent
  // anything in shows in your sidebar right away, and is saved (and appears for
  // them) when you send the first message.
  function openDirectMessage(friend) {
    setStartedDmIds(prev => (prev.includes(friend.id) ? prev : [...prev, friend.id]));
    setChatTarget({ type: "dm", id: friend.id });
    setSidebarView("partners");
    setMainView("chat");
  }

  // A course channel (channelId null = the course's first channel).
  function openChannel(courseId, channelId) {
    setChatTarget({ type: "channel" });
    setSelectedCourseId(courseId);
    setSelectedChannelId(channelId);
    setMainView("chat");
  }

  // A course tab along the top (or a Study Spaces card on Home).
  function openCourse(courseId) {
    setSidebarView("spaces");
    openChannel(courseId, null);
  }

  // The Study Spaces / Study Partners toggle. Spaces goes back to the open course's
  // channel; Partners keeps an open DM, otherwise shows My Connections.
  function changeSidebarView(view) {
    if (view === sidebarView) return;
    setSidebarView(view);
    if (view === "spaces") {
      setChatTarget({ type: "channel" });
      setMainView("chat");
    } else if (!activeFriend) {
      setMainView("partners");
    }
  }

  // My Connections / Find Study Partners in the Study Partners sidebar.
  function openPartnerView(view) {
    setPartnerView(view);
    setMainView("partners");
  }

  // "Find or join a group" under a course: Discover, filtered to that course.
  function openGroupFinder(forCourse) {
    setGroupView("discover");
    setGroupCourse(forCourse.course_code);
    setMainView("groups");
  }

  // A chat clicked in the bell's window: open it once per click (each has a new nonce).
  // Done during render rather than in an effect, so the right chat is on screen in the
  // very first paint, even when Spaces is opening because of this click. Opening it
  // loads its messages, which marks it read on the server and clears its dot.
  const [handledOpen, setHandledOpen] = useState(null);
  if (openTarget && openTarget.nonce !== handledOpen) {
    setHandledOpen(openTarget.nonce);
    if (openTarget.type === "dm") {
      openDirectMessage({ id: openTarget.id });
    } else if (openTarget.type === "group") {
      openGroupChat(openTarget.id);
      setGroupChannel(openTarget.channel || "general"); // its newest unread channel
    } else if (openTarget.type === "channel") {
      setSidebarView("spaces");
      openChannel(openTarget.courseId, openTarget.id);
    } else if (openTarget.type === "course") {
      openCourse(openTarget.id); // a Study Spaces card on Home
    }
  }

  const loadSuggested = useCallback(async () => {
    setSuggestedPartners(await getSuggestedPartners());
  }, []);

  async function handleConnect(partnerId, showError = setPartnersError) {
    if (connectingRef.current.has(partnerId)) return;
    connectingRef.current.add(partnerId);
    setConnectStatus(prev => ({ ...prev, [partnerId]: "sending" }));
    try {
      await sendFriendRequest(partnerId);
      showError("");
    } catch (err) {
      // 409 = a request or friendship already exists; the reload below shows which.
      // Anything else (like a 429 rate limit) is a real error the user should see.
      if (err.status !== 409) showError(err.message);
    } finally {
      connectingRef.current.delete(partnerId);
      setConnectStatus(prev => {
        const next = { ...prev };
        delete next[partnerId];
        return next;
      });
      await Promise.all([loadSuggested(), loadRequests()]).catch(() => {});
    }
  }


  const loadFriends = useCallback(async () => {
    setFriends(await getFriends());
  }, []);

  const loadConversations = useCallback(async () => {
    setConversations(await getConversations());
  }, []);

  const loadDirectMessages = useCallback(async (friendId) => {
    const data = await getDirectMessages(friendId);
    setDirectMessages(prev => ({ ...prev, [friendId]: data }));
  }, []);

  const loadRequests = useCallback(async () => {
    const [incoming, outgoing] = await Promise.all([
      getFriendRequests("incoming"),
      getFriendRequests("outgoing"),
    ]);
    setIncomingRequests(incoming);
    setOutgoingRequests(outgoing);
  }, []);

  const loadMyGroups = useCallback(async () => {
    setMyGroups(await getMyStudyGroups());
  }, []);

  const loadDiscoverGroups = useCallback(async () => {
    setDiscoverGroups(await getDiscoverGroups());
  }, []);

  const loadGroupInvites = useCallback(async () => {
    setGroupInvites(await getGroupInvites("incoming"));
  }, []);

  const loadGroupMessages = useCallback(async (groupId, channel) => {
    const data = await getGroupMessages(groupId, channel);
    setGroupMessages(prev => ({ ...prev, [groupId]: { ...prev[groupId], [channel]: data } }));
  }, []);

  const loadCourseMembers = useCallback(async (id) => {
    const data = await getCourseMembers(id);
    setMembersByCourse(prev => ({ ...prev, [id]: data }));
  }, []);

  const loadGroupMembers = useCallback(async (id) => {
    const data = await getGroupMembers(id);
    setMembersByGroup(prev => ({ ...prev, [id]: data }));
  }, []);

  // Join a group from Discover, then refresh everything that shows it.
  // (Joining also settles any pending invite to that group, so invites reload too.)
  // Leaving happens from the group's chat header (handleLeaveGroup).
  async function handleJoinGroup(group) {
    if (group.is_member) return;
    setBusyGroupId(group.id);
    try {
      await joinStudyGroup(group.id);
      setGroupsError("");
    } catch (err) {
      setGroupsError(err.message);
    } finally {
      await Promise.all([loadDiscoverGroups(), loadMyGroups(), loadGroupInvites()]).catch(() => {});
      setBusyGroupId(null);
    }
  }

  async function handleCreateGroup() {
    const name = newGroupName.trim();
    const courseId = Number(newGroupCourse) || studentCourses[0]?.id;
    if (!name || !courseId || creatingGroup) return;
    setCreatingGroup(true);
    try {
      await createStudyGroup({ course_id: courseId, name, meeting_time: newGroupTime.trim(), visibility: newGroupVisibility });
      setGroupsNotice(newGroupVisibility === "private"
        ? `Private group "${name}" created. It won't show in Discover; invite people from Connections or a member's card.`
        : "");
      setShowCreateGroup(false);
      setNewGroupName("");
      setNewGroupTime("");
      setNewGroupVisibility("public");
      setGroupsError("");
      await Promise.all([loadDiscoverGroups(), loadMyGroups()]).catch(() => {});
    } catch (err) {
      setGroupsError(`Group not created: ${err.message}`);
    } finally {
      setCreatingGroup(false);
    }
  }

  // Accept / decline an invite, then refresh invites, Discover and your groups.
  async function handleInviteResponse(inviteId, action) {
    setBusyInviteId(inviteId);
    try {
      await respondToGroupInvite(inviteId, action);
      setGroupsError("");
    } catch (err) {
      setGroupsError(err.message);
    } finally {
      await Promise.all([loadGroupInvites(), loadDiscoverGroups(), loadMyGroups()]).catch(() => {});
      setBusyInviteId(null);
    }
  }

  // "Leave group" in the Chat header. Only members (not teachers/TAs) see the button.
  // If you're the last member the backend deletes the group.
  async function handleLeaveGroup() {
    if (!activeGroup || activeGroup.access !== "member" || leavingGroup) return;
    const memberCount = (membersByGroup[activeGroup.id] ?? []).length;
    let warning = `Leave ${activeGroup.name}?`;
    if (memberCount <= 1) {
      warning += "\n\nYou're the last member, so the group and all its messages will be deleted.";
    } else if (activeGroup.visibility === "private") {
      warning += "\n\nThis group is private, so you'll need a new invite to rejoin.";
    }
    if (!window.confirm(warning)) return;

    setLeavingGroup(true);
    try {
      await leaveStudyGroup(activeGroup.id);
      setErrorFor("leaveGroup", "");
    } catch (err) {
      setErrorFor("leaveGroup", `Couldn't leave group: ${err.message}`);
    } finally {
      // Once myGroups no longer has this group, activeGroup becomes null and the
      // Chat tab falls back to the course channel on its own.
      await Promise.all([loadMyGroups(), loadDiscoverGroups()]).catch(() => {});
      setLeavingGroup(false);
    }
  }

  function toggleGroupInvite(friend) {
    setConnectionNotice(null);
    setGroupInvite(prev => (
      prev.friendId === friend.id ? { friendId: null, groupId: "" } : { friendId: friend.id, groupId: "" }
    ));
  }

  // Send the invite chosen in a Connections card's picker.
  async function handleConnectionInvite(e, friend) {
    e.preventDefault();
    const groupId = Number(groupInvite.groupId);
    if (!groupId || inviting) return;
    const group = myGroups.find(g => g.id === groupId);
    setInviting(true);
    try {
      await inviteToGroup(groupId, friend.id);
      setConnectionNotice({ friendId: friend.id, ok: true, text: `Invited ${friend.name} to ${group?.name ?? "the group"}.` });
      setGroupInvite({ friendId: null, groupId: "" });
    } catch (err) {
      setConnectionNotice({ friendId: friend.id, ok: false, text: `Invite not sent: ${err.message}` });
    } finally {
      setInviting(false);
    }
  }

  // The card that opens when you click someone's picture in the Chat header.
  // It offers the same options as the Connections tab, based on where you stand:
  // connected -> Message / Invite to group; not connected -> Request / Requested / Accept.
  function renderMemberCard(member, close) {
    const isMe = member.id === userId;
    const friend = friends.find(f => f.id === member.id);
    const sent = outgoingRequests.find(r => r.other_user_id === member.id);
    const received = incomingRequests.find(r => r.other_user_id === member.id);
    const sending = connectStatus[member.id] === "sending";
    const pickerOpen = Boolean(friend) && groupInvite.friendId === member.id;
    const notice = connectionNotice?.friendId === member.id ? connectionNotice : null;
    const smallButton = { padding: "0.45rem 0.8rem" };

    return <>
      <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: isMe ? 0 : "0.75rem" }}>
        <Avatar name={member.name} userId={member.id} color={member.avatar_color} hasAvatar={member.has_avatar} size={36} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: "600", color: "#1e293b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {member.name}
          </div>
          <div style={{ fontSize: "0.75rem", color: "#64748b" }}>
            {isMe ? "This is you" : ROLE_LABELS[member.role] ?? "Student"}
          </div>
        </div>
      </div>

      {!isMe && friend && (
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <button
            onClick={() => {
              close();
              openDirectMessage(friend);
            }}
            style={{ ...primaryButtonStyle, ...smallButton }}
          >
            Message
          </button>
          <button onClick={() => toggleGroupInvite(friend)} style={{ ...secondaryButtonStyle, ...smallButton }}>
            {pickerOpen ? "Close" : "Invite to group"}
          </button>
        </div>
      )}

      {pickerOpen && (
        <form
          onSubmit={(e) => handleConnectionInvite(e, friend)}
          style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginTop: "0.6rem" }}
        >
          {myGroups.length === 0 ? (
            <span style={{ fontSize: "0.8rem", color: "#94a3b8" }}>
              You're not in any study groups yet.
            </span>
          ) : (
            <>
              <select
                value={groupInvite.groupId}
                onChange={(e) => setGroupInvite(prev => ({ ...prev, groupId: e.target.value }))}
                style={{ padding: "0.45rem 0.6rem", border: "1px solid #cbd5e1", borderRadius: "8px", background: "#fff", color: "#475569" }}
              >
                <option value="">Choose a study group...</option>
                {myGroups.map(g => (
                  <option key={g.id} value={g.id}>{g.name} ({g.course_code})</option>
                ))}
              </select>
              <button
                type="submit"
                disabled={!groupInvite.groupId || inviting}
                style={{ ...primaryButtonStyle, ...smallButton }}
              >
                {inviting ? "Sending..." : "Send invite"}
              </button>
            </>
          )}
        </form>
      )}

      {!isMe && !friend && (
        received ? (
          <button
            onClick={() => handleRequestAction(received.id, "accept", (msg) => setErrorFor("request", msg))}
            disabled={busyRequestId === received.id}
            style={{ ...primaryButtonStyle, ...smallButton }}
          >
            Accept request
          </button>
        ) : sent ? (
          <button disabled style={{ ...secondaryButtonStyle, ...smallButton, cursor: "default" }}>
            Requested ✓
          </button>
        ) : (
          <button
            onClick={() => handleConnect(member.id, (msg) => setErrorFor("request", msg))}
            disabled={sending}
            style={{ ...primaryButtonStyle, ...smallButton }}
          >
            {sending ? "Sending..." : "Request"}
          </button>
        )
      )}

      {notice && (
        <div style={{
          marginTop: "0.6rem",
          padding: "0.45rem 0.6rem",
          borderRadius: "6px",
          fontSize: "0.8rem",
          background: notice.ok ? "#f0fdf4" : "#fef2f2",
          color: notice.ok ? "#166534" : "#b91c1c"
        }}>
          {notice.text}
        </div>
      )}
    </>;
  }

  // Accept / decline a request sent to you, or cancel one you sent, then refresh
  // requests, suggestions and connections (an accept makes them a connection).
  // Show errors on the tab the request is on: Connections (requests for you) or Find Study Partners (sent).
  async function handleRequestAction(requestId, action, showError = partnerView === "connections" ? setListsError : setPartnersError) {
    setBusyRequestId(requestId);
    try {
      if (action === "cancel") await cancelFriendRequest(requestId);
      else await respondToFriendRequest(requestId, action);
      showError("");
    } catch (err) {
      showError(err.message);
    } finally {
      // Reload either way: on a 404 (they cancelled first) the stale row disappears.
      await Promise.all([loadSuggested(), loadRequests(), loadFriends()]).catch(() => {});
      setBusyRequestId(null);
    }
  }

  async function handleRemoveFriend(friend) {
    if (removingFriendId) return;
    if (!window.confirm(`Remove ${friend.name} from your connections?`)) return;
    setRemovingFriendId(friend.id);
    try {
      await removeFriend(friend.id);
      await loadFriends();
      setListsError("");
    } catch (err) {
      setListsError(err.message);
    } finally {
      setRemovingFriendId(null);
    }
  }

  function changeGroupView(view) {
    setGroupView(view);
  }

  // Derived selection (falls back to the first item so we never need to
  // call setState just to pick a default)
  const course = courses.find(c => c.id === selectedCourseId) ?? courses[0];
  const channels = course ? channelsByCourse[course.id] ?? [] : [];
  const channel = channels.find(c => c.id === selectedChannelId) ?? channels[0];
  const messages = channel ? messagesByChannel[channel.id] ?? [] : [];
  const studentCourses = courses.filter(c => c.role === "student");
  // My Connections, narrowed by its search box.
  const shownFriends = friends.filter(f =>
      f.name.toLowerCase().includes(connectionSearch.trim().toLowerCase())
    );

  // DMs in the sidebar: saved conversations (newest first, including ones the other
  // person started), then ones you've opened but haven't sent anything in yet.
  // Only current connections are listed.
  const dmFriends = [
    ...conversations.map(c => friends.find(f => f.id === c.id)).filter(Boolean),
    ...friends.filter(f => startedDmIds.includes(f.id) && !conversations.some(c => c.id === f.id)),
  ];

  // If the chosen group/DM no longer exists (left the group, removed the friend),
  // these come out null and the Chat tab falls back to the course channel.
  const activeGroup = chatTarget.type === "group" ? myGroups.find(g => g.id === chatTarget.id) ?? null : null;
  const activeGroupId = activeGroup?.id;
  const activeFriend = chatTarget.type === "dm" ? friends.find(f => f.id === chatTarget.id) ?? null : null;
  const activeFriendId = activeFriend?.id;
  const showingChannel = !activeGroup && !activeFriend;

  // A group opened before its course was known (from the bell, before myGroups
  // loaded): switch to its course's tab once it is. Guarded so it can't loop.
  if (activeGroup && course && activeGroup.course_id !== course.id &&
      courses.some(c => c.id === activeGroup.course_id)) {
    setSelectedCourseId(activeGroup.course_id);
  }

  // The open course's groups and current assignments, for the Study Spaces sidebar.
  const courseGroups = course ? myGroups.filter(g => g.course_id === course.id) : [];
  const courseAssignments = course ? assignments.filter(a => a.course_id === course.id) : [];

  const chatTitle =
    activeGroup ? `${activeGroup.name} › #${groupChannel}` :
    activeFriend ? activeFriend.name :
    channel ? `${course.course_code} › #${channel.name}` :
    "Select a space";
  const chatPlaceholder =
    activeGroup ? `Message #${groupChannel}...` :
    activeFriend ? `Message ${activeFriend.name}...` :
    channel ? `Message #${channel.name}...` :
    "Select a channel";
  const visibleMessages =
    activeGroup ? groupMessages[activeGroup.id]?.[groupChannel] ?? [] :
    activeFriend ? directMessages[activeFriend.id] ?? [] :
    messages;
  const canSend = Boolean(activeGroup || activeFriend || channel);
   const chatKey =
    activeGroup ? `group-${activeGroup.id}-${groupChannel}` :
    activeFriend ? `dm-${activeFriend.id}` :
    channel ? `channel-${channel.id}` : null;
  // A sent message stays here until the reload brings back the saved copy; once that
  // copy is in the list (same id), the temporary one is hidden so it never shows twice.
  const loadedIds = new Set(visibleMessages.map(msg => msg.id));
  const shownMessages = [
    ...visibleMessages,
    ...pendingMessages
      .filter(p => p.chat === chatKey && !loadedIds.has(p.savedId))
      .map(p => ({ id: p.tempId, user_id: userId, content: p.content, created_at: p.created_at,
        avatar_color: user?.avatar_color, has_avatar: user?.has_avatar, pending: true })),
  ];
  // Chat-tab banner: sidebar errors always, plus the errors for whatever chat is open.
  const visibleErrors = [
    errors.courses,
    errors.channels,
    errors.conversations,
    errors.groups,
    errors.request,
    errors.leaveGroup,
    showingChannel ? errors.channel : "",
    activeFriend ? errors.dm : "",
    activeGroup ? errors.groupMessages : "",
    sendError?.target === chatTitle ? sendError.text : "",
  ].filter(Boolean);

  const headerMembers =
    activeGroup ? membersByGroup[activeGroup.id] ?? [] :
    showingChannel && course ? membersByCourse[course.id] ?? [] :
    [];

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
        setErrorFor("courses", "");
      } catch (err) {
        if (cancelled) return;
        setStatus("Backend offline");
        setErrorFor("courses", err.message);
      }
    }
    loadCourses();
    return () => {
      cancelled = true;
    };
  }, [userId, setErrorFor]);

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
        setErrorFor("channels", "");
      } catch (err) {
        if (!cancelled) setErrorFor("channels", err.message);
      }
    }
    loadChannels();
    return () => {
      cancelled = true;
    };
  }, [courseId, setErrorFor]);

  // 3. Fetch messages for the open channel
  const channelId = channel?.id;
  const loadMessages = useCallback(async () => {
    if (!channelId) return;
    const data = await getChannelMessages(channelId);
    setMessagesByChannel(prev => ({
      ...prev,
      [channelId]: data
    }));
  }, [channelId]);


    // 4. Load the Find Study Partners view (pending requests + suggestions) when it's
  //    opened, and re-check every PARTNER_POLL_MS so the other person's actions show up
  useEffect(() => {
    if (!userId || mainView !== "partners" || partnerView !== "suggested") return;
    let cancelled = false;
    async function refresh(showSpinner) {
      if (showSpinner) setPartnersLoading(true);
      try {
        await Promise.all([loadSuggested(), loadRequests()]);
        if (!cancelled) setPartnersError("");
      } catch (err) {
        if (!cancelled) setPartnersError(err.message);
      } finally {
        if (!cancelled && showSpinner) setPartnersLoading(false);
      }
    }
    refresh(true);
    const timer = setInterval(() => refresh(false), PARTNER_POLL_MS);
    const stopListening = onSocketEvent("friends-changed", () => refresh(false));
    const stopReconnect = onSocketEvent("connect", () => refresh(false));
    return () => {
      cancelled = true;
      clearInterval(timer);
      stopListening();
      stopReconnect();
    };
  }, [userId, mainView, partnerView, loadSuggested, loadRequests]);

  // 5. Load friends and friend requests for the Connections view (incoming requests are listed
  //    there), the sidebar's Study Chats and the header member cards, re-checking every PARTNER_POLL_MS.
  //    Always on: every view of Spaces uses one of those.
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    async function refresh(showSpinner) {
      if (showSpinner) setListsLoading(true);
      try {
        // Requests are needed too: the header member cards show Request / Requested.
        await Promise.all([loadFriends(), loadRequests()]);
        if (!cancelled) setListsError("");
      } catch (err) {
        if (!cancelled) setListsError(err.message);
      } finally {
        if (!cancelled && showSpinner) setListsLoading(false);
      }
    }
    refresh(true);
    const timer = setInterval(() => refresh(false), PARTNER_POLL_MS);
    const stopListening = onSocketEvent("friends-changed", () => refresh(false));
    const stopReconnect = onSocketEvent("connect", () => refresh(false));
    return () => {
      cancelled = true;
      clearInterval(timer);
      stopListening();
      stopReconnect();
    };
  }, [userId, loadFriends, loadRequests]);


  // Load on channel change + poll so messages from other users appear
  // only while a course channel is actually on screen (not a DM, group, or other view).
  useEffect(() => {
    if (!channelId || mainView !== "chat" || !showingChannel) return;
    let cancelled = false;
    async function refresh() {
      try {
        await loadMessages();
        if (cancelled) return;
        setStatus("Connected to Backend");
        setErrorFor("channel", "");
      } catch (err) {
        if (cancelled) return;
        setStatus("Backend offline");
        setErrorFor("channel", err.message);
      }
    }
    refresh();
    const stopWatching = watchRoom({ type: "channel", id: channelId }, refresh);
    const stopListening = onSocketEvent("channel-message", (msg) => {
      if (Number(msg.channel_id) === Number(channelId)) refresh();
    });
    const timer = setInterval(refresh, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
      stopWatching();
      stopListening();
    };
  }, [channelId, mainView, showingChannel, loadMessages, setErrorFor]);

  // 6. Load your DM conversations (the Study Partners sidebar), re-checking every
  //    PARTNER_POLL_MS so a chat someone starts with you shows up in your sidebar.
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    async function refresh() {
      try {
        await loadConversations();
        if (!cancelled) setErrorFor("conversations", "");
      } catch (err) {
        if (!cancelled) setErrorFor("conversations", `Couldn't load direct messages: ${err.message}`);
      }
    }
    refresh();
    const stopListening = onSocketEvent("direct-message", refresh);
    const stopFriends = onSocketEvent("friends-changed", refresh);
    const stopReconnect = onSocketEvent("connect", refresh);
    const timer = setInterval(refresh, PARTNER_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
      stopListening();
      stopReconnect();
      stopFriends();
    };
  }, [userId, loadConversations, setErrorFor]);

  // 7. Load the open DM from the database and poll it like a course channel,
  //    so the other person's replies appear.
  useEffect(() => {
    // Only while it's on screen: loading marks it read, so it mustn't run behind another view.
    if (!activeFriendId || mainView !== "chat") return;
    let cancelled = false;
    async function refresh() {
      try {
        await loadDirectMessages(activeFriendId);
        if (!cancelled) setErrorFor("dm", "");
      } catch (err) {
        if (!cancelled) setErrorFor("dm", `Couldn't load messages: ${err.message}`);
      }
    }
    refresh();
    const stopListening = onSocketEvent("direct-message", (msg) => {
      const otherId = Number(msg.sender_id) === Number(userId) ? msg.receiver_id : msg.sender_id;
      if (Number(otherId) === Number(activeFriendId)) refresh();
    });
    const stopReconnect = onSocketEvent("connect", refresh);
    const timer = setInterval(refresh, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
      stopListening();
      stopReconnect();
    };
  }, [userId, activeFriendId, mainView, loadDirectMessages, setErrorFor]);
  
  // 8. Load the groups whose chat you can open (yours + ones you teach) for the
  //    Study Spaces sidebar and the Invite-to-group pickers, re-checking every PARTNER_POLL_MS.
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    async function refresh() {
      try {
        await loadMyGroups();
        if (!cancelled) setErrorFor("groups", "");
      } catch (err) {
        if (!cancelled) setErrorFor("groups", `Couldn't load study groups: ${err.message}`);
      }
    }
    refresh();
    const timer = setInterval(refresh, PARTNER_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [userId, loadMyGroups, setErrorFor]);

  // 9. Load the open group channel from the database and poll it like a course
  //    channel, so other members' messages appear.
  useEffect(() => {
    // Only while it's on screen: loading marks it read, so it mustn't run behind another view.
    if (!activeGroupId || mainView !== "chat") return;
    let cancelled = false;
    async function refresh() {
      try {
        await loadGroupMessages(activeGroupId, groupChannel);
        if (!cancelled) setErrorFor("groupMessages", "");
      } catch (err) {
        if (!cancelled) setErrorFor("groupMessages", `Couldn't load messages: ${err.message}`);
      }
    }
    refresh();
    const stopWatching = watchRoom({ type: "group", id: activeGroupId }, refresh);
    const stopListening = onSocketEvent("group-message", (msg) => {
      if (Number(msg.group_id) === Number(activeGroupId) && msg.channel === groupChannel) refresh();
    });
    const timer = setInterval(refresh, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
      stopWatching();
      stopListening();
    };
  }, [activeGroupId, groupChannel, mainView, loadGroupMessages, setErrorFor]);

  // 10. Load Discover and your invites while the groups view is open,
  //     re-checking every PARTNER_POLL_MS so new groups and invites show up.
  useEffect(() => {
    if (!userId || mainView !== "groups") return;
    let cancelled = false;
    async function refresh() {
      try {
        await Promise.all([loadDiscoverGroups(), loadGroupInvites()]);
        if (!cancelled) setGroupsError("");
      } catch (err) {
        if (!cancelled) setGroupsError(err.message);
      }
    }
    refresh();
    const timer = setInterval(refresh, PARTNER_POLL_MS);
    const stopListening = onSocketEvent("group-invites-changed", refresh);
    const stopReconnect = onSocketEvent("connect", refresh);
    return () => {
      cancelled = true;
      clearInterval(timer);
      stopListening();
      stopReconnect();
    };
  }, [userId, mainView, loadDiscoverGroups, loadGroupInvites]);

  // 11. Load the people in the open space or group for the Chat header, and
  //     re-check every PARTNER_POLL_MS so people joining or leaving show up.
  useEffect(() => {
    if (mainView !== "chat") return;
    const load =
      activeGroupId ? () => loadGroupMembers(activeGroupId) :
      showingChannel && courseId ? () => loadCourseMembers(courseId) :
      null;
    if (!load) return;
    let cancelled = false;
    async function refresh() {
      try {
        await load();
      } catch (err) {
        // The strip is extra info, so don't cover the chat with an error banner.
        if (!cancelled) console.error("Couldn't load members:", err);
      }
    }
    refresh();
    const timer = setInterval(refresh, PARTNER_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [mainView, activeGroupId, showingChannel, courseId, loadGroupMembers, loadCourseMembers]);

  // Auto-scroll when a new message arrives or the channel changes
  //    Always on a chat switch or first load; otherwise only if you're already near the
  //    bottom, so reading older messages doesn't get interrupted.
  useEffect(() => {
    const box = messageListRef.current;
    const switchedChat = lastScrolledTitleRef.current !== chatTitle;
    const firstLoad = lastMessageCountRef.current === 0;
    lastScrolledTitleRef.current = chatTitle;
    lastMessageCountRef.current = shownMessages.length;
    const nearBottom = !box || box.scrollHeight - box.scrollTop - box.clientHeight < 200;
    if (switchedChat || firstLoad || nearBottom) {
      // "instant", not "smooth": an animated scroll while animated profile pictures (GIFs)
      // are playing leaves the ones in this list frozen or flickering in Chromium until
      // something redraws the list. "instant" also overrides Landing.css's scroll-behavior.
      bottomRef.current?.scrollIntoView({ behavior: "instant" });
    }
  }, [shownMessages.length, chatTitle]);

  // Chromium workaround: after the message list scrolls, an animated profile picture
  // (GIF) in it can freeze or flicker until the list is redrawn. Shortly after scrolling
  // stops, flip an invisible background value on the list, which forces that redraw.
  function handleMessageListScroll() {
    clearTimeout(redrawTimerRef.current);
    redrawTimerRef.current = setTimeout(() => {
      const box = messageListRef.current;
      if (!box) return;
      redrawFlipRef.current = !redrawFlipRef.current;
      box.style.backgroundColor = redrawFlipRef.current ? "rgba(0, 0, 0, 0.004)" : "rgba(0, 0, 0, 0)";
    }, 150);
  }

  // 4. Send a message. It shows right away (faded) and the box clears, so sending feels
  //    instant even on a slow connection. Then it's saved, and the chat re-fetched so
  //    what you see == the DB. If saving fails, it disappears and the text comes back.
  async function handleSendMessage(e) {
    e.preventDefault();
    const content = inputText.trim();
    if (!content || !canSend) return;

    // This chat, as it is now (the user may switch chats before the save finishes).
    const group = activeGroup, friend = activeFriend, groupCh = groupChannel, chId = channelId;
    const chat = chatKey, target = chatTitle;
    const tempId = `pending-${++pendingCount.current}`;
    const drop = () => setPendingMessages(prev => prev.filter(p => p.tempId !== tempId));

    setPendingMessages(prev => [...prev, { tempId, chat, content, created_at: new Date().toISOString() }]);
    setInputText("");
    setSendError(null);
    try {
      const saved = group ? await sendGroupMessage(group.id, groupCh, content)
        : friend ? await sendDirectMessage(friend.id, content)
        : await sendChannelMessage(chId, content);
      setPendingMessages(prev => prev.map(p => p.tempId === tempId ? { ...p, savedId: saved.id } : p));
    } catch (err) {
      drop();
      setInputText(current => current || content); // don't overwrite something new they've typed
      setSendError({ target, text: `Message not sent: ${err.message}` });
      return;
    }
    // A failed reload isn't a failed send; the poll will catch up.
    if (group) await loadGroupMessages(group.id, groupCh).catch(() => {});
    else if (friend) await Promise.all([loadDirectMessages(friend.id), loadConversations()]).catch(() => {});
    else await loadMessages().catch(() => {});
    drop();
  }

  return <div style={{
    display: "flex",
    flexDirection: "column",
    height: "calc(100vh - 200px)",
    border: "1px solid #e2e8f0",
    borderRadius: "12px",
    overflow: "hidden",
    background: "#fff"
  }}>
    {/* Course tabs (Chrome-style). The open course's tab is raised and shows its full
        name; each is outlined in its course colour (courseColors.js). index.css .course-tab */}
    <nav aria-label="Your study spaces" className="course-tabs">
      {courses.map(c => {
        const active = sidebarView === "spaces" && c.id === course?.id;
        const accent = courseAccent(courses, c.id);
        return <button
          key={c.id}
          type="button"
          className={active ? "course-tab active" : "course-tab"}
          aria-current={active ? "page" : undefined}
          onClick={() => openCourse(c.id)}
          style={{ borderTopColor: active ? accent : `${accent}80` }} // 80 = 50% opacity
        >
          <span className="course-tab-dot" style={{ background: accent }} />
          <strong>{c.course_code}</strong>
          {active && <span className="course-tab-name">{c.course_name}</span>}
          {/* The open course's channels have their own dots in the sidebar. */}
          <UnreadDot info={coursesUnread[c.id]} hidden={active} />
        </button>;
      })}
    </nav>

    <div style={{ flex: 1, display: "flex", minHeight: 0 }}>

      {/* Sidebar: the Study Spaces / Study Partners toggle, then that view's list */}
      <div className="no-scrollbar" style={{
        width: "270px",
        flexShrink: 0,
        borderRight: "1px solid #e2e8f0",
        background: "#f8fafc",
        padding: "1rem",
        overflowY: "auto"
      }}>
        <div className="segment" role="tablist" aria-label="Sidebar view">
          {/* The white pill: one element that slides to the active button (like the main nav's .nav-pill). */}
          <span
            aria-hidden="true"
            className="segment-pill"
            style={{ transform: sidebarView === "partners" ? "translateX(calc(100% + 4px))" : "none" }}
          />
          {SIDEBAR_VIEWS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={sidebarView === id}
              className={sidebarView === id ? "segment-btn active" : "segment-btn"}
              onClick={() => changeSidebarView(id)}
            >
              {/* Reserves the bold width, so the text doesn't shift when it turns bold. */}
              <span className="spaces-tab-label" data-label={label}>{label}</span>
            </button>
          ))}
        </div>

        {/* Study Spaces: the open course's channels and your study groups in it */}
        {sidebarView === "spaces" && <>
          {courses.length === 0 && status === "Connected to Backend" && (
            <p style={{ ...sidebarHintStyle, marginTop: "1rem" }}>You aren't in any courses yet.</p>
          )}

          {course && <>
            <SectionHeader
              title="Course Chats"
              count={channels.length}
              collapsed={collapsed.channels}
              onToggle={() => toggleSection("channels")}
            />
            {!collapsed.channels && <ul style={sidebarListStyle}>
              {channels.map(ch => {
                const isShowing = mainView === "chat" && showingChannel && channel?.id === ch.id;
                return <li key={ch.id} onClick={() => openChannel(course.id, ch.id)} style={{ ...sidebarChannelStyle(isShowing), ...dotRowStyle, marginBottom: "0.2rem" }}>
                  <span># {ch.name}</span>
                  {/* No dot on the channel you're reading: it's marked read as it loads. */}
                  <UnreadDot info={unread[`channel-${ch.id}`]} hidden={isShowing} />
                </li>;
              })}
            </ul>}

            <SectionHeader
              title="Study Groups"
              count={courseGroups.length}
              collapsed={collapsed.groups}
              onToggle={() => toggleSection("groups")}
            />
            {!collapsed.groups && <>
              {courseGroups.length === 0 && (
                <p style={sidebarHintStyle}>You're not in any {course.course_code} study groups yet.</p>
              )}
              <ul style={sidebarListStyle}>
                {courseGroups.map(g => {
                  const isOpen = mainView === "chat" && activeGroup?.id === g.id;
                  const groupInfo = unread[`group-${g.id}`];
                  return <li key={g.id} style={{ marginBottom: "0.4rem" }}>
                    <div onClick={() => openGroupChat(g.id)} style={{ ...sidebarItemStyle(isOpen), ...dotRowStyle }}>
                      <span>
                        {g.name}
                        {g.visibility === "private" && <span style={{ fontWeight: "400", color: "#64748b" }}> 🔒</span>}
                        {g.access === "staff" && <span style={{ fontWeight: "400", color: "#64748b" }}> (teaching)</span>}
                      </span>
                      {/* Closed group: one dot for all its channels. Open: each channel has its own. */}
                      <UnreadDot info={groupInfo} hidden={isOpen} />
                    </div>

                    {isOpen && <ul style={{ listStyle: "none", padding: "0.3rem 0 0 0.8rem", margin: 0 }}>
                      {GROUP_CHANNELS.map(name => {
                        const count = groupChannelsUnread[g.id]?.[name] ?? 0;
                        return <li key={name} onClick={() => setGroupChannel(name)} style={{ ...sidebarChannelStyle(groupChannel === name), ...dotRowStyle }}>
                          <span># {name}</span>
                          <UnreadDot info={count > 0 ? { unread: count, viewed: groupInfo?.viewed ?? false } : null}
                            hidden={groupChannel === name} />
                        </li>;
                      })}
                    </ul>}
                  </li>;
                })}
              </ul>
              <button
                type="button"
                onClick={() => openGroupFinder(course)}
                style={{
                  width: "100%",
                  marginTop: "0.4rem",
                  padding: "0.55rem 0.6rem",
                  background: mainView === "groups" ? "#e0e7ff" : "transparent",
                  border: "1.5px dashed #cbd5e1",
                  borderRadius: "8px",
                  color: "#1d4ed8",
                  fontWeight: "600",
                  fontSize: "0.8rem",
                  cursor: "pointer"
                }}
              >
                Find or join a {course.course_code} group
              </button>
            </>}

            {/* This course's unfinished assignments: the same list as Home's Current
                Assignments, in a box that scrolls on its own. A click opens the Planner. */}
            <SectionHeader
              title="Current Assignments"
              count={courseAssignments.length}
              collapsed={collapsed.assignments}
              onToggle={() => toggleSection("assignments")}
            />
            {!collapsed.assignments && (courseAssignments.length === 0 ? (
              <p style={sidebarHintStyle}>No current {course.course_code} assignments.</p>
            ) : (
              <ul style={{ ...sidebarListStyle, maxHeight: "260px", overflowY: "auto", scrollbarWidth: "thin", paddingRight: "2px" }}>
                {courseAssignments.map(a => {
                  const late = a.due !== null && a.due < new Date();
                  return <li key={a.id} style={{ marginBottom: "0.4rem" }}>
                    <button
                      type="button"
                      onClick={onOpenPlanner}
                      title="Open in Planner"
                      style={{
                        width: "100%",
                        display: "flex",
                        flexDirection: "column",
                        gap: "0.15rem",
                        padding: "0.5rem 0.65rem",
                        background: "#fff",
                        border: "1px solid #e2e8f0",
                        borderLeft: `3px solid ${courseAccent(courses, course.id)}`,
                        borderRadius: "8px",
                        font: "inherit",
                        textAlign: "left",
                        cursor: "pointer"
                      }}
                    >
                      <span style={{ fontSize: "0.85rem", fontWeight: "600", color: "#1e293b" }}>{a.title}</span>
                      <span style={{ fontSize: "0.75rem", color: late ? "#b91c1c" : "#64748b" }}>
                        {late && <strong>LATE · </strong>}
                        {a.due ? `Due ${formatDue(a.due)}` : "No due date"}
                      </span>
                    </button>
                  </li>;
                })}
              </ul>
            ))}
          </>}
        </>}

        {/* Study Partners: connections, finding partners, and your direct messages */}
        {sidebarView === "partners" && <>
          <ul style={{ ...sidebarListStyle, marginTop: "1rem" }}>
            {PARTNER_VIEWS.map(({ id, label, icon: Icon }) => {
              const isOpen = mainView === "partners" && partnerView === id;
              // Requests sent to you are answered on My Connections.
              const badge = id === "connections" ? incomingRequests.length : 0;
              return <li key={id} onClick={() => openPartnerView(id)} style={{ ...sidebarItemStyle(isOpen), ...dotRowStyle, marginBottom: "0.2rem" }}>
                <Icon size={16} aria-hidden="true" style={{ flexShrink: 0 }} />
                <span>{label}</span>
                {badge > 0 && (
                  <span
                    aria-label={`${badge} partner request${badge === 1 ? "" : "s"}`}
                    style={{ marginLeft: "auto", fontSize: "0.7rem", fontWeight: "700", color: "#fff", background: "#2563eb", borderRadius: "999px", padding: "0.05rem 0.45rem" }}
                  >
                    {badge}
                  </span>
                )}
              </li>;
            })}
          </ul>

          <SectionHeader
            title="Study Chats"
            count={dmFriends.length}
            collapsed={collapsed.dms}
            onToggle={() => toggleSection("dms")}
          />
          {!collapsed.dms && <>
            {dmFriends.length === 0 && <p style={sidebarHintStyle}>Click "Message" on a connection to start a chat.</p>}
            <ul style={sidebarListStyle}>
              {dmFriends.map(f => {
                const isOpen = mainView === "chat" && activeFriend?.id === f.id;
                return <li key={f.id} onClick={() => openDirectMessage(f)} style={{
                  ...sidebarItemStyle(isOpen),
                  marginBottom: "0.4rem",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem"
                }}>
                  <Avatar name={f.name} userId={f.id} color={f.avatar_color} hasAvatar={f.has_avatar} size={24} />
                  <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {f.name}
                  </span>
                  {/* While they've sent messages you haven't opened. Hidden for the open
                      chat, which is being read right now. */}
                  <UnreadDot info={unread[`dm-${f.id}`]} hidden={isOpen} />
                </li>;
              })}
            </ul>
          </>}
        </>}
      </div>

      {/* Main chat area */}
      {mainView === "chat" && <div style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        minWidth: 0
      }}>
        <div style={{
          padding: "1rem",
          borderBottom: "1px solid #e2e8f0",
          fontWeight: "600",
          color: "#0f172a",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "0.75rem",
          flexWrap: "wrap"
        }}>
          {activeFriend ? (
            <span style={{ display: "inline-flex", alignItems: "center", gap: "0.6rem" }}>
              <Avatar name={activeFriend.name} userId={activeFriend.id} color={activeFriend.avatar_color} hasAvatar={activeFriend.has_avatar} size={32} />
              {chatTitle}
            </span>
          ) : (
            <span style={{ display: "inline-flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap", minWidth: 0 }}>
              <span>
                {chatTitle}
                {activeGroup?.visibility === "private" && <span title="Private group"> 🔒</span>}
                {activeGroup?.access === "staff" && (
                  <span style={{ fontWeight: "400", color: "#64748b", fontSize: "0.85rem" }}> · Teaching</span>
                )}
              </span>
              <MemberStrip key={chatTitle} members={headerMembers} max={15} renderCard={renderMemberCard} />
            </span>
          )}
          {activeGroup?.access === "member" && (
            <button
              onClick={handleLeaveGroup}
              disabled={leavingGroup}
              style={{ ...secondaryButtonStyle, padding: "0.45rem 0.8rem", marginLeft: "auto" }}
            >
              {leavingGroup ? "Leaving..." : "Leave group"}
            </button>
          )}
        </div>

        {visibleErrors.length > 0 && <div style={{
          padding: "0.5rem 1rem",
          background: "#fef2f2",
          color: "#b91c1c",
          fontSize: "0.8rem"
        }}>{visibleErrors.map(text => <div key={text}>{text}</div>)}</div>}

        <div ref={messageListRef} onScroll={handleMessageListScroll} className="no-scrollbar" style={{
          flex: 1,
          padding: "1rem",
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: "0.75rem"
        }}>
           {canSend && shownMessages.length === 0 && <p style={{ color: "#94a3b8", fontSize: "0.9rem" }}>
            {activeFriend ? `This is the beginning of your conversation with ${activeFriend.name}.` : "No messages yet. Say hi!"}
          </p>}
          {shownMessages.map(msg => {
            const mine = msg.user_id === userId;
            const senderName = mine ? user?.name : msg.user_name ?? activeFriend?.name;
            return <div key={msg.id} style={{
              display: "flex",
              alignItems: "flex-end",
              gap: "0.5rem",
              flexDirection: mine ? "row-reverse" : "row",
              alignSelf: mine ? "flex-end" : "flex-start",
              maxWidth: "70%",
              opacity: msg.pending ? 0.6 : 1 // still being saved
            }}>
              <Avatar name={senderName} userId={msg.user_id} color={msg.avatar_color} hasAvatar={msg.has_avatar} />
              <div style={{
                minWidth: 0,
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
                  {mine ? "You" : senderName} • {formatTime(msg.created_at)}
                </div>
                <div style={{
                  fontSize: "0.95rem",
                  overflowWrap: "anywhere"
                }}>{msg.content}</div>
              </div>
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
          <input type="text" placeholder={chatPlaceholder} value={inputText} onChange={e => setInputText(e.target.value)} disabled={!canSend} style={{
            flex: 1,
            padding: "0.7rem 1rem",
            border: "1px solid #cbd5e1",
            borderRadius: "8px",
            outline: "none"
          }} />
          <button type="submit" disabled={!canSend} style={{
            padding: "0.7rem 1.2rem",
            background: "#2563eb",
            color: "#fff",
            border: "none",
            borderRadius: "8px",
            fontWeight: "600",
            cursor: "pointer"
          }}>
            Send
          </button>
        </form>
      </div>}

      {/* Study Partners Main Area */}
      {mainView === "partners" && <div style={{
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
           {partnersError && (
            <p style={{ color: "#dc2626", fontSize: "0.9rem", marginBottom: "1rem" 
}}>{partnersError}</p>
          )}

          {outgoingRequests.length > 0 && (
            <div style={{ marginBottom: "1.5rem" }}>
              <h3 style={{ color: "#1e293b", fontSize: "1rem", margin: "0 0 0.75rem" }}>
                Requested Study Partners
              </h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                {outgoingRequests.map(r => (
                  <div key={r.id} style={partnerCardStyle}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", minWidth: 0 }}>
                      <Avatar name={r.other_user_name} userId={r.other_user_id} color={r.other_user_avatar_color} hasAvatar={r.other_user_has_avatar} size={36} />
                      <div style={{ minWidth: 0 }}>
                        <strong style={{ color: "#1e293b" }}>{r.other_user_name}</strong>
                        <div style={{ fontSize: "0.8rem", color: "#94a3b8", marginTop: "0.2rem" }}>
                          Requested {new Date(r.created_at).toLocaleDateString()}
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => handleRequestAction(r.id, "cancel")}
                      disabled={busyRequestId === r.id}
                      style={secondaryButtonStyle}
                    >
                      Cancel
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <h3 style={{ color: "#1e293b", fontSize: "1rem", margin: "0 0 0.75rem" }}>
            Suggested Study Partners
          </h3>


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
              {courses.map(c => (
                <option key={c.id} value={c.course_code}>{c.course_code}</option>
              ))}
            </select>
          </div>

          <div style={{
            display: "flex",
            flexDirection: "column",
            gap: "0.75rem"
          }}>

                      {partnersLoading && (
              <p style={{ color: "#94a3b8", fontSize: "0.9rem" }}>Loading classmates...</p>
            )}

            {!partnersLoading && !partnersError && suggestedPartners.length === 0 && (
              <p style={{ color: "#94a3b8", fontSize: "0.9rem" }}>
                No suggestions right now. Classmates from your courses will show up here.
              </p>
            )}

            {suggestedPartners
              .filter(p =>
                p.name.toLowerCase().includes(partnerSearch.toLowerCase()) &&
                (partnerCourse === "all" || p.shared_courses.includes(partnerCourse))
              )
              .map(p => {
                const sending = connectStatus[p.id] === "sending";
                return (
                  <div key={p.id} style={partnerCardStyle}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", minWidth: 0 }}>
                      <Avatar name={p.name} userId={p.id} color={p.avatar_color} hasAvatar={p.has_avatar} size={36} />
                      <div style={{ minWidth: 0 }}>
                        <strong style={{ color: "#1e293b" }}>{p.name}</strong>
                        <div style={{ fontSize: "0.85rem", color: "#64748b", marginTop: "0.3rem" }}>
                          {p.shared_courses.join(" • ")}
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => handleConnect(p.id)}
                      disabled={sending}
                      style={{
                        ...primaryButtonStyle,
                        background: sending ? "#e2e8f0" : "#2563eb",
                        color: sending ? "#475569" : "#fff",
                        cursor: sending ? "default" : "pointer",
                      }}
                    >
                      {sending ? "Sending..." : "Request"}
                    </button>
                  </div>
                );
              })}
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
            {friends.length > 0 && (
              <input
                type="text"
                placeholder="Search connections..."
                value={connectionSearch}
                onChange={(e) => setConnectionSearch(e.target.value)}
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  marginBottom: "1rem",
                  padding: "0.7rem 1rem",
                  border: "1px solid #cbd5e1",
                  borderRadius: "8px",
                  outline: "none"
                }}
              />
            )}

            {friends.length > 0 && shownFriends.length === 0 && (
              <p style={{ color: "#94a3b8", fontSize: "0.9rem" }}>
                No connections match "{connectionSearch}".
              </p>
            )}

            {listsLoading && (
              <p style={{ color: "#94a3b8", fontSize: "0.9rem" }}>Loading connections...</p>
            )}

            {listsError && (
              <p style={{ color: "#dc2626", fontSize: "0.9rem" }}>{listsError}</p>
            )}

            {!listsLoading && !listsError && friends.length === 0 && (
              <p style={{ color: "#94a3b8", fontSize: "0.9rem" }}>
                No connections yet. Send a request from "Find Study Partners" to get started.
              </p>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {shownFriends.map(f => (
                <div key={f.id} style={{ border: "1px solid #e2e8f0", borderRadius: "10px" }}>
                  <div style={{ ...partnerCardStyle, border: "none" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", minWidth: 0 }}>
                      <Avatar name={f.name} userId={f.id} color={f.avatar_color} hasAvatar={f.has_avatar} size={36} />
                      <div style={{ minWidth: 0 }}>
                        <strong style={{ color: "#1e293b" }}>{f.name}</strong>
                        {f.friends_since && (
                          <div style={{ fontSize: "0.8rem", color: "#94a3b8", marginTop: "0.2rem" }}>
                            Connected since {new Date(f.friends_since).toLocaleDateString()}
                          </div>
                        )}
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", justifyContent: "flex-end" }}>
                      <button onClick={() => openDirectMessage(f)} style={secondaryButtonStyle}>
                        Message
                      </button>
                      <button onClick={() => toggleGroupInvite(f)} style={secondaryButtonStyle}>
                        {groupInvite.friendId === f.id ? "Close" : "Invite to group"}
                      </button>
                      <button
                        onClick={() => handleRemoveFriend(f)}
                        disabled={removingFriendId === f.id}
                        style={{ ...secondaryButtonStyle, color: "#dc2626" }}
                      >
                        {removingFriendId === f.id ? "Removing..." : "Remove"}
                      </button>
                    </div>
                  </div>

                  {groupInvite.friendId === f.id && (
                    <form
                      onSubmit={(e) => handleConnectionInvite(e, f)}
                      style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap", padding: "0 1rem 1rem" }}
                    >
                      {myGroups.length === 0 ? (
                        <span style={{ fontSize: "0.85rem", color: "#94a3b8" }}>
                          You're not in any study groups yet. Find one with "Find or join a group" under Study Spaces.
                        </span>
                      ) : (
                        <>
                          <select
                            value={groupInvite.groupId}
                            onChange={(e) => setGroupInvite(prev => ({ ...prev, groupId: e.target.value }))}
                            style={{ flex: 1, minWidth: "12rem", padding: "0.5rem 0.75rem", border: "1px solid #cbd5e1", borderRadius: "8px", background: "#fff", color: "#475569" }}
                          >
                            <option value="">Choose a study group...</option>
                            {myGroups.map(g => (
                              <option key={g.id} value={g.id}>{g.name} ({g.course_code})</option>
                            ))}
                          </select>
                          <button
                            type="submit"
                            disabled={!groupInvite.groupId || inviting}
                            style={{ ...primaryButtonStyle, padding: "0.5rem 0.9rem" }}
                          >
                            {inviting ? "Sending..." : "Send invite"}
                          </button>
                        </>
                      )}
                    </form>
                  )}

                  {connectionNotice?.friendId === f.id && (
                    <div style={{
                      margin: "0 1rem 1rem",
                      padding: "0.5rem 0.75rem",
                      borderRadius: "6px",
                      fontSize: "0.8rem",
                      background: connectionNotice.ok ? "#f0fdf4" : "#fef2f2",
                      color: connectionNotice.ok ? "#166534" : "#b91c1c"
                    }}>
                      {connectionNotice.text}
                    </div>
                  )}
                </div>
              ))}
            </div>
          {incomingRequests.length > 0 && (
              <div style={{ marginTop: "2rem" }}>
                <h3 style={{ color: "#1e293b", fontSize: "1rem", margin: "0 0 0.75rem" }}>
                  Study Partner Invites
                </h3>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                  {incomingRequests.map(r => (
                    <div key={r.id} style={partnerCardStyle}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", minWidth: 0 }}>
                        <Avatar name={r.other_user_name} userId={r.other_user_id} color={r.other_user_avatar_color} hasAvatar={r.other_user_has_avatar} size={36} />
                        <div style={{ minWidth: 0 }}>
                          <strong style={{ color: "#1e293b" }}>{r.other_user_name}</strong>
                          <div style={{ fontSize: "0.8rem", color: "#94a3b8", marginTop: "0.2rem" }}>
                            Sent {new Date(r.created_at).toLocaleDateString()}
                          </div>
                        </div>
                      </div>

                      <div style={{ display: "flex", gap: "0.5rem" }}>
                        <button
                          onClick={() => handleRequestAction(r.id, "accept")}
                          disabled={busyRequestId === r.id}
                          style={primaryButtonStyle}
                        >
                          Accept
                        </button>
                        <button
                          onClick={() => handleRequestAction(r.id, "decline")}
                          disabled={busyRequestId === r.id}
                          style={secondaryButtonStyle}
                        >
                          Decline
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>}

      {/* Study Groups Main Area: Discover and Invites */}
      {mainView === "groups" && <div style={{ flex: 1, minWidth: 0, padding: "1.5rem", overflowY: "auto" }}>
          {/* Discover / Invites (this used to be the Study Groups tab's sidebar) */}
          <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.25rem" }}>
            {[["discover", "Discover"], ["invites", "Invites"]].map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => changeGroupView(id)}
                aria-pressed={groupView === id}
                style={{
                  padding: "0.45rem 0.9rem",
                  border: "1px solid",
                  borderColor: groupView === id ? "#c7d2fe" : "#e2e8f0",
                  borderRadius: "999px",
                  background: groupView === id ? "#e0e7ff" : "#fff",
                  color: groupView === id ? "#4338ca" : "#64748b",
                  fontWeight: groupView === id ? "600" : "400",
                  cursor: "pointer"
                }}
              >
                {label}{id === "invites" && groupInvites.length > 0 ? ` (${groupInvites.length})` : ""}
              </button>
            ))}
          </div>
          {groupsError && (
            <p style={{ color: "#dc2626", fontSize: "0.9rem", marginBottom: "1rem" }}>{groupsError}</p>
          )}
          {groupsNotice && (
            <p style={{ color: "#15803d", fontSize: "0.9rem", marginBottom: "1rem" }}>{groupsNotice}</p>
          )}
          {groupView === "discover" && (
            <>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem" }}>
                <div>
                  <h2 style={{ color: "#1e293b", marginBottom: "0.3rem" }}>
                    Discover Study Groups
                  </h2>

                  <p style={{ color: "#64748b", fontSize: "0.9rem" }}>
                    Join public groups created by students in your courses.
                  </p>
                </div>

                {studentCourses.length > 0 && (
                  <button
                    onClick={() => { setShowCreateGroup(true); setGroupsNotice(""); }}
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
                )}
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
                  {courses.map(c => (
                    <option key={c.id} value={c.course_code}>{c.course_code}</option>
                  ))}
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
                      value={newGroupCourse || studentCourses[0]?.id || ""}
                      onChange={(e) => setNewGroupCourse(e.target.value)}
                      style={{
                        padding: "0.7rem 1rem",
                        border: "1px solid #cbd5e1",
                        borderRadius: "8px",
                        background: "#fff",
                        color: "#475569",
                      }}
                    >
                      {studentCourses.map(c => (
                        <option key={c.id} value={c.id}>{c.course_code} {c.course_name}</option>
                      ))}
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

                    <div>
                      <div style={{ display: "flex", gap: "0.5rem" }}>
                        {["public", "private"].map(v => (
                          <button
                            key={v}
                            type="button"
                            onClick={() => setNewGroupVisibility(v)}
                            style={{
                              padding: "0.5rem 1rem",
                              border: "1px solid #cbd5e1",
                              borderRadius: "8px",
                              cursor: "pointer",
                              background: newGroupVisibility === v ? "#e0e7ff" : "#fff",
                              color: newGroupVisibility === v ? "#4338ca" : "#64748b",
                              fontWeight: newGroupVisibility === v ? "600" : "400",
                            }}
                          >
                            {v === "public" ? "Public" : "🔒 Private"}
                          </button>
                        ))}
                      </div>
                      <p style={{ fontSize: "0.8rem", color: "#64748b", marginTop: "0.4rem" }}>
                        {newGroupVisibility === "public"
                          ? "Anyone in this space can find and join it in Discover."
                          : "Invite only. It won't appear in Discover. Invite people from Connections or a member's card."}
                      </p>
                    </div>

                    <div style={{ display: "flex", gap: "0.5rem" }}>
                      <button
                        onClick={handleCreateGroup}
                        disabled={creatingGroup || !newGroupName.trim()}
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
                        {creatingGroup ? "Creating..." : "Create"}
                      </button>

                      <button
                        onClick={() => { setShowCreateGroup(false); setNewGroupVisibility("public"); }}
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
                {discoverGroups.length === 0 && (
                  <p style={{ color: "#94a3b8", fontSize: "0.9rem" }}>
                    No public study groups in your courses yet. Create the first one!
                  </p>
                )}

                {discoverGroups
                  .filter(g =>
                    g.name.toLowerCase().includes(groupSearch.toLowerCase()) &&
                    (groupCourse === "all" || g.course_code === groupCourse)
                  )
                  .map(g => (
                    <div key={g.id} style={partnerCardStyle}>
                      <div>
                        <strong style={{ color: "#1e293b" }}>
                          {g.name}
                        </strong>

                        <div style={{ fontSize: "0.85rem", color: "#64748b", marginTop: "0.3rem" }}>
                          {g.course_code} • {g.member_count} {g.member_count === 1 ? "member" : "members"}
                        </div>

                        <div style={{ fontSize: "0.8rem", color: "#94a3b8", marginTop: "0.2rem" }}>
                          {g.meeting_time || "Meeting time not set"}
                        </div>
                        {g.members?.length > 0 && (
                          <div style={{ marginTop: "0.5rem" }}>
                            <MemberStrip members={g.members} />
                          </div>
                        )}
                      </div>

                      {g.my_role === "student" ? (
                        g.is_member ? (
                          <span
                            title="Leave from the group's chat"
                            style={{ fontSize: "0.85rem", fontWeight: "600", color: "#475569" }}
                          >
                            Joined ✓
                          </span>
                        ) : (
                          <button
                            onClick={() => handleJoinGroup(g)}
                            disabled={busyGroupId === g.id}
                            style={primaryButtonStyle}
                          >
                            {busyGroupId === g.id ? "Joining..." : "Join"}
                          </button>
                        )
                      ) : (
                        <span style={{ fontSize: "0.85rem", fontWeight: "600", color: "#64748b" }}>
                          Teaching
                        </span>
                      )}
                    </div>
                  ))}
              </div> 
            </>
          )}

          {groupView === "invites" && (
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
                {groupInvites.map(inv => (
                  <div key={inv.id} style={partnerCardStyle}>
                    <div>
                      <strong style={{ color: "#1e293b" }}>
                        {inv.group_name}
                        {inv.visibility === "private" && <span style={privateBadgeStyle}>🔒 Private</span>}
                      </strong>

                      <div style={{ fontSize: "0.85rem", color: "#64748b", marginTop: "0.3rem" }}>
                        {inv.course_code} • {inv.member_count} {inv.member_count === 1 ? "member" : "members"}
                      </div>

                      <div style={{ fontSize: "0.8rem", color: "#94a3b8", marginTop: "0.2rem" }}>
                        Invited by {inv.inviter_name}
                      </div>
                      {inv.members?.length > 0 && (
                        <div style={{ marginTop: "0.5rem" }}>
                          <MemberStrip members={inv.members} />
                        </div>
                      )}
                    </div>

                    <div style={{ display: "flex", gap: "0.5rem" }}>
                      <button
                        onClick={() => handleInviteResponse(inv.id, "accept")}
                        disabled={busyInviteId === inv.id}
                        style={primaryButtonStyle}
                      >
                        Accept
                      </button>

                      <button
                        onClick={() => handleInviteResponse(inv.id, "decline")}
                        disabled={busyInviteId === inv.id}
                        style={secondaryButtonStyle}
                      >
                        Decline
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>}
    </div>
  </div>;
}
