import React, { useState, useEffect, useEffectEvent, useRef, useCallback } from "react";
import { getCourseChannels, getChannelMessages, sendChannelMessage, getSuggestedPartners,
sendFriendRequest, getFriendRequests, respondToFriendRequest, cancelFriendRequest, getFriends, removeFriend,
getConversations, getDirectMessages, sendDirectMessage, getDiscoverGroups, getMyStudyGroups, createStudyGroup,
joinStudyGroup, leaveStudyGroup, getGroupMessages, sendGroupMessage, getGroupInvites, inviteToGroup, respondToGroupInvite,
getCourseMembers, getGroupMembers } from "../../api";
import { Search, ArrowDown, Check, X, Plus, MessageSquare } from "lucide-react";
import Avatar from "../Avatar";
import { onSocketEvent, watchRoom } from "../../socket";
import { courseAccent } from "../../utils/courseColors";
import { easeScrollBy } from "../../animation/smoothScroll";
import "./StudyPartners.css";

// The sidebar's two views. The white pill slides to the active one (index.css .segment-pill).
const SIDEBAR_VIEWS = [
  { id: "spaces", label: "Study Spaces" },
  { id: "partners", label: "Study Partners" },
];

const PARTNER_POLL_MS = 10000; // how often we poll server so other users' friend requests show up
const POLL_MS = 60000; // safety net only; live updates come over the socket (socket.js)
// Sections sit on rounded grey panels, like Home's (Dashboard.jsx PANEL), so the white
// items inside them stand out. PANEL is for the main area's lists; SIDEBAR_PANEL is a
// tighter one for each sidebar section.
const PANEL = { background: "#e3e8ef", borderRadius: "18px", padding: "1.25rem", marginBottom: "1.5rem" };
const SIDEBAR_PANEL = { background: "#e3e8ef", borderRadius: "14px", padding: "0.75rem", marginTop: "0.9rem" };
// White items on a panel get a soft shadow instead of a border, which would blur into the grey.
const ON_PANEL_SHADOW = "0 1px 2px rgba(15, 23, 42, 0.06)";
// Section headings inside a main-area panel.
const partnerCardStyle = { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "1rem", background: "#fff", borderRadius: "10px", boxShadow: ON_PANEL_SHADOW };
const primaryButtonStyle = { padding: "0.6rem 1rem", background: "#2563eb", color: "#fff", border: "none", borderRadius: "8px", fontWeight: "600", cursor: "pointer" };
const secondaryButtonStyle = { padding: "0.6rem 1rem", background: "#f1f5f9", color: "#475569", border: "1px solid #cbd5e1", borderRadius: "8px", fontWeight: "600", cursor: "pointer" };
const COMPACT_CHAT_KEY = "buddytechCompactChat";
const privateBadgeStyle = { marginLeft: "0.4rem", fontSize: "0.75rem", fontWeight: "500", color: "#64748b" };

const GROUP_CHANNELS = ["general", "homework", "meetups"];
const GROUP_CHANNEL_ROW = 30; // px: height of one channel row under an open study group
const COURSE_CHANNEL_ROW = 30; // px: height of one Course Chats row
const COURSE_CHANNEL_GAP = 3;  // px: space between Course Chats rows
// A chat-sidebar row that grows in when its section opens, top down, like Home's Current
// Tasks (index.css .grow-in-row / -cell / -item): the row opens from no height while its
// content grows from tiny and see-through. `step` is its place in the section's list; rows
// after GROW_MAX_STEP start together, so a long list's last ones don't keep appearing.
// `gap` is the space above it after the first row (--grow-gap); `style` goes on the row.
// minmax(0, 1fr) + minWidth 0: the grid column is the sidebar's width, not as wide as a
// row's longest one-line text (.sp-text is nowrap), so names still cut off with "…" and
// the buttons at the end stay in view.
const GROW_MAX_STEP = 8;
// Each sidebar row's grow-in, a bit quicker than Home's (index.css --grow-time, 0.3s).
const SIDEBAR_GROW_TIME = "0.22s";
function GrowIn({ as: Row = "div", step, gap = 0, style, children }) {
  return (
    <Row className="grow-in-row" style={{ "--grow-step": Math.min(step, GROW_MAX_STEP), "--grow-gap": gap, "--grow-time": SIDEBAR_GROW_TIME, gridTemplateColumns: "minmax(0, 1fr)", ...style }}>
      <div className="grow-in-cell" style={{ minWidth: 0 }}>
        <div className="grow-in-item">{children}</div>
      </div>
    </Row>
  );
}
// Each sidebar view's collapsible sections, top to bottom (the order the intro opens them).
// All of them close when you switch to the view.
const SIDEBAR_SECTIONS = {
  spaces: ["channels", "groups", "suggestedGroups"],
  partners: ["requests", "dms", "suggestedPartners"],
};
// A sidebar list's highlight: one white pill that skates to the open row (index.css
// .sidebar-row-pill), like the main nav's. The list must be position: relative and its
// rows a fixed `row` px tall, `gap` px apart. index -1 (none open) fades it out.
function RowPill({ index, row, gap }) {
  return <span aria-hidden="true" className="sidebar-row-pill" style={{
    height: row,
    transform: `translateY(${Math.max(index, 0) * (row + gap)}px)`,
    opacity: index === -1 ? 0 : 1
  }} />;
}

// A row in a list with a RowPill: fixed height, clear (the pill shows the open one), and
// positioned so its text sits above the pill.
const pillRowStyle = (row, gap) => ({ height: row, boxSizing: "border-box", marginBottom: gap, background: "transparent", boxShadow: "none", position: "relative" });

// Chat-tab sidebar rows, on the grey section panels. The open one is white with a soft
// shadow (like the Study Spaces / Study Partners toggle's pill).
function sidebarItemStyle(active) {
  return {
    padding: "0.6rem 0.8rem",
    borderRadius: "8px",
    cursor: "pointer",
    fontSize: "0.9rem",
    fontWeight: active ? "600" : "400",
    background: active ? "#ffffff" : "transparent",
    boxShadow: active ? ON_PANEL_SHADOW : "none",
    color: active ? "#1d4ed8" : "#475569",
  };
}
// Channel rows. Their highlight is a separate white pill that skates between them
// (index.css .sidebar-row-pill / .group-channel-pill), so the row itself stays clear.
function sidebarChannelStyle(active) {
  return {
    padding: "0.4rem 0.8rem",
    borderRadius: "6px",
    cursor: "pointer",
    fontSize: "0.85rem",
    fontWeight: active ? "600" : "400",
    background: "transparent",
    color: active ? "#1d4ed8" : "#64748b",
  };
}

// Added to a sidebar row that can show an <UnreadDot>: the dot sits at the right end.
const dotRowStyle = { display: "flex", alignItems: "center", gap: "0.5rem" };

// The heading at the top of a sidebar panel (SectionHeader).
const sidebarHeadingStyle ={ fontSize: "0.95rem", fontWeight: "700", color: "#1e293b", margin: "0 0 0.55rem" };
const sidebarHintStyle = { fontSize: "0.8rem", color: "#64748b", margin: "0 0 0.5rem" };
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

function SectionHeader({ title, count, collapsed, onToggle }) {
  return (
    // Collapsed: nothing under it, so no space below (the panel's padding is enough).
    <h3 style={{ ...sidebarHeadingStyle, ...(collapsed ? { marginBottom: 0 } : {}) }}>
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
        {/* One ▸ that turns to point down when open, like an open study group's (index.css .group-fold-arrow). */}
        <span aria-hidden="true" style={{ width: "0.8rem", fontSize: "0.8rem", color: "#64748b" }}>
          <span className={collapsed ? "group-fold-arrow" : "group-fold-arrow open"}>▸</span>
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

// A study group's icon: its initials on a rounded square in the course colour, with the
// green "someone's online" dot (Study Spaces sidebar, like a study partner's picture).
function GroupIcon({ name, color, online = false }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join("").toUpperCase();
  return (
    <span className="sp-group-icon" style={{ background: color }} aria-hidden="true">
      {initials}
      {online && <i title="Someone's online" />}
    </span>
  );
}

// A course code as a small chip in its course's colour (Study Partners sidebar and profile).
function CourseChip({ code, courses }) {
  const course = courses.find(c => c.course_code === code);
  return <span className="sp-chip" style={{ "--c": course ? courseAccent(courses, course.id) : "#64748b" }}>{code}</span>;
}

// When a chat's last message was sent, short: "2:41 PM" today, "Tue" this week, else "Nov 3".
function shortWhen(value) {
  if (!value) return "";
  const date = new Date(value);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (now - date < 6 * 86400000) return date.toLocaleDateString([], { weekday: "short" });
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
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
  courses,
  coursesError,
  onTaskFromMessage,
  unread = {},              // from Dashboard: { "dm-7": { unread, viewed }, "group-3": ..., "channel-2": ... }
  groupChannelsUnread = {}, // from Dashboard: { [groupId]: { general: 2, homework: 1 } }
  coursesUnread = {},       // from Dashboard: { [courseId]: { unread, viewed } }, all its channels together
  openTarget = null,        // from Dashboard: a chat clicked in the bell, { type, id, channel?, courseId?, nonce }
}) {
  const userId = user?.id;
  const [compactChat, setCompactChat] = useState(() => {
    try { return localStorage.getItem(COMPACT_CHAT_KEY) === "true"; } catch { return false; }
  });
  const [channelsByCourse, setChannelsByCourse] = useState({});
  const [messagesByChannel, setMessagesByChannel] = useState({});
  const [selectedCourseId, setSelectedCourseId] = useState(null);
  const [selectedChannelId, setSelectedChannelId] = useState(null);
  const [inputText, setInputText] = useState("");
  const [pendingMessages, setPendingMessages] = useState([]);
  const pendingCount = useRef(0); // makes each tempId unique
  const [errors, setErrors] = useState({});       // { [source]: message }, one per loader so one can't wipe another's
  const [sendError, setSendError] = useState(null); // { target: chatTitle, text }, only shown in the chat it happened in
  // Which list the sidebar shows, and what the main area shows:
  //   sidebarView: "spaces" (the open course's channels + groups) | "partners" (connections + DMs)
  //   mainView:    "chat" (a channel, group or DM) | "partners" (Connections / Find Study Partners)
  //                | "groups" (Discover / Invites)
  const [sidebarView, setSidebarView] = useState("spaces");
  const [mainView, setMainView] = useState("chat");

  // Study Partners: the person picked in the sidebar who you're not chatting with (a request,
  // someone you sent one to, or someone you may know). Their page shows in the main area.
  const [personId, setPersonId] = useState(null);
  const bottomRef = useRef(null);
  const messageListRef = useRef(null);           // the scrolling message area
  const redrawTimerRef = useRef(null);           // handleMessageListScroll's "scrolling stopped" timer
  const redrawFlipRef = useRef(false);           // which of its two invisible backgrounds is on
  const lastScrolledTitleRef = useRef(null);     // chat we last auto-scrolled in
  const lastMessageCountRef = useRef(0);
  // The first message that arrived while you were scrolled up (null: none waiting).
  // Shows the floating "New message" button.
  const [firstNewMessageId, setFirstNewMessageId] = useState(null);
  const connectingRef = useRef(new Set());       // partner ids with a request in flight (a ref, so a fast double click can't slip past)
  const [peopleSearch, setPeopleSearch] = useState(""); // the Study Partners sidebar's search box
  const [suggestedPartners, setSuggestedPartners] = useState([]);
  const [partnersLoading, setPartnersLoading] = useState(false);
  const [partnersError, setPartnersError] = useState("");
  const [connectStatus, setConnectStatus] = useState({});
  const [friends, setFriends] = useState([]);
  const [incomingRequests, setIncomingRequests] = useState([]);
  const [outgoingRequests, setOutgoingRequests] = useState([]);
  const [listsError, setListsError] = useState("");
  const [busyRequestId, setBusyRequestId] = useState(null); // disables buttons while a click is in flight
  const [removingFriendId, setRemovingFriendId] = useState(null); // remove-connection in flight
  const [groupView, setGroupView] = useState("discover");
  const [groupInvites, setGroupInvites] = useState([]);
  // "Active now": { [userId]: true | false } for people whose presence you're allowed to see
  // (study partners, and members of your study groups). Filled from the friends list, your
  // groups and a group's member list as they load, then kept live by "presence-changed".
  const [presence, setPresence] = useState({});
  const isOnline = (id) => Boolean(presence[id]);
  const mergePresence = useCallback((entries) => {
    if (entries.length > 0) setPresence(prev => ({ ...prev, ...Object.fromEntries(entries) }));
  }, []);
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

  // Which sidebar sections are collapsed. All start closed; the intro effect (below the
  // course lists) opens the shown view's one after another.
  const [collapsed, setCollapsed] = useState({
    channels: true, groups: true, suggestedGroups: true,  // Study Spaces
    requests: true, dms: true, suggestedPartners: true,   // Study Partners
  });

  function toggleSection(key) {
    setCollapsed(prev => ({ ...prev, [key]: !prev[key] }));
  }

  // Switch the sidebar between Study Spaces and Study Partners. Switching closes the new
  // view's sections so the intro plays again; staying on the same view changes nothing.
  function showSidebarView(view) {
    if (view !== sidebarView) {
      setCollapsed(prev => ({ ...prev, ...Object.fromEntries(SIDEBAR_SECTIONS[view].map(key => [key, true])) }));
    }
    setSidebarView(view);
  }

  // The open study group's channel list (#general, #homework, #meetups) folded into its row,
  // which then reads "Group → #channel". Kept when switching groups.
  const [groupChannelsCollapsed, setGroupChannelsCollapsed] = useState(false);

  // Show a study group's chat, under its course's tab.
  function openGroupChat(groupId) {
    if (chatTarget.type !== "group" || chatTarget.id !== groupId) setGroupChannel("general");
    const group = myGroups.find(g => g.id === groupId);
    if (group) setSelectedCourseId(group.course_id);
    setChatTarget({ type: "group", id: groupId });
    showSidebarView("spaces");
    setMainView("chat");
  }

  // Open the DM with a connection (every connection is listed under Chats, so a chat you
  // haven't sent anything in yet is there already; it's saved when you send the first message).
  function openDirectMessage(friend) {
    setChatTarget({ type: "dm", id: friend.id });
    showSidebarView("partners");
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
    showSidebarView("spaces");
    openChannel(courseId, null);
  }

  // The Study Spaces / Study Partners toggle. Spaces goes back to the open course's
  // channel; Partners keeps an open DM, otherwise shows the picked person (or a hint).
  function changeSidebarView(view) {
    if (view === sidebarView) return;
    showSidebarView(view);
    if (view === "spaces") {
      setChatTarget({ type: "channel" });
      setMainView("chat");
    } else if (!activeFriend) {
      setMainView("partners");
    }
  }

  // Someone in the Study Partners sidebar you're not chatting with: show their page.
  function openPerson(id) {
    setPersonId(id);
    setMainView("partners");
  }

  // A suggested study group's name in the sidebar: Discover, filtered to that course.
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
      showSidebarView("spaces");
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
    const data = await getFriends();
    setFriends(data);
    mergePresence(data.filter(f => f.online !== undefined).map(f => [f.id, Boolean(f.online)]));
  }, [mergePresence]);

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
    const data = await getMyStudyGroups();
    setMyGroups(data);
    // member_ids / online_ids come only for groups you're a member of.
    mergePresence(data.flatMap(g => (g.member_ids ?? []).map(id => [id, (g.online_ids ?? []).includes(id)])));
  }, [mergePresence]);

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
    // `online` is only sent to the group's members.
    mergePresence(data.filter(m => m.online !== undefined).map(m => [m.id, Boolean(m.online)]));
  }, [mergePresence]);

  // Join a group from Discover, then refresh everything that shows it.
  // (Joining also settles any pending invite to that group, so invites reload too.)
  // Leaving happens from the group's chat header (handleLeaveGroup).
  // Returns whether it worked.
  async function handleJoinGroup(group) {
    if (group.is_member) return false;
    setBusyGroupId(group.id);
    let ok = false;
    try {
      await joinStudyGroup(group.id);
      setGroupsError("");
      ok = true;
    } catch (err) {
      setGroupsError(err.message);
    } finally {
      await Promise.all([loadDiscoverGroups(), loadMyGroups(), loadGroupInvites()]).catch(() => {});
      setBusyGroupId(null);
    }
    return ok;
  }

  // The + on a sidebar suggestion: join, then open the group's chat.
  async function joinSuggestedGroup(group) {
    if (await handleJoinGroup(group)) openGroupChat(group.id);
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
  // Returns whether it worked.
  async function handleInviteResponse(inviteId, action) {
    setBusyInviteId(inviteId);
    let ok = false;
    try {
      await respondToGroupInvite(inviteId, action);
      setGroupsError("");
      ok = true;
    } catch (err) {
      setGroupsError(err.message);
    } finally {
      await Promise.all([loadGroupInvites(), loadDiscoverGroups(), loadMyGroups()]).catch(() => {});
      setBusyInviteId(null);
    }
    return ok;
  }

  // An invite's ✓ in the sidebar: join, then open the group's chat.
  async function acceptGroupInvite(invite) {
    if (await handleInviteResponse(invite.id, "accept")) openGroupChat(invite.group_id);
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

  // The profile panel (beside a DM, or on someone's page): who they are, the courses and
  // study groups you share, and what you can do from where you stand with them.
  function renderProfile(person) {
    const pickerOpen = person.kind === "friend" && groupInvite.friendId === person.id;
    const notice = connectionNotice?.friendId === person.id ? connectionNotice : null;
    const sending = connectStatus[person.id] === "sending" || busyRequestId === person.requestId;
    const groups = person.shared_groups ?? [];
    const standing = person.kind === "friend"
      ? person.friends_since ? `Study partner since ${new Date(person.friends_since).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}` : "Study partner"
      : person.kind === "incoming" ? "Wants to study with you"
        : person.kind === "outgoing" ? "Request sent"
          : "In your courses";
    return (
      <aside className="sp-profile" aria-label={`About ${person.name}`}>
        <div className="sp-profile-top">
          <Avatar name={person.name} userId={person.id} color={person.avatar_color} hasAvatar={person.has_avatar} size={64}
            online={person.kind === "friend" && isOnline(person.id)} />
          <strong>{person.name}</strong>
          {person.kind === "friend" && isOnline(person.id) && <span className="sp-active">Active now</span>}
          <span>{standing}</span>
        </div>

        <div className="sp-p-sec">
          <h4>Courses you share</h4>
          {(person.shared_courses ?? []).length > 0
            ? <div className="sp-chips">{person.shared_courses.map(code => <CourseChip key={code} code={code} courses={courses} />)}</div>
            : <p className="sp-p-none">None right now</p>}
        </div>

        {person.kind === "friend" && (
          <div className="sp-p-sec">
            <h4>Study groups together</h4>
            {/* A group opens its chat (you're in all of these), under its course's tab in Study Spaces. */}
            {groups.length === 0 ? <p className="sp-p-none">None yet</p> : groups.map(g => {
              const groupCourse = courses.find(c => c.course_code === g.course_code);
              return (
                <button key={g.id} type="button" className="sp-group sp-group-link" onClick={() => openGroupChat(g.id)}
                  aria-label={`Open the ${g.name} chat`} title={`Open the ${g.name} chat`}
                  style={{ "--c": groupCourse ? courseAccent(courses, groupCourse.id) : "#64748b" }}>
                  <i aria-hidden="true" />{g.name}<small>{g.course_code}</small>
                </button>
              );
            })}
          </div>
        )}

        <div className="sp-actions">
          {person.kind === "friend" && <>
            <button type="button" className="sp-btn ghost" onClick={() => toggleGroupInvite(person)}>
              {pickerOpen ? "Close" : "Invite to a study group"}
            </button>
            {pickerOpen && (
              <form className="sp-invite" onSubmit={(e) => handleConnectionInvite(e, person)}>
                {myGroups.length === 0 ? (
                  <p className="sp-p-none">You're not in any study groups yet.</p>
                ) : <>
                  <select
                    value={groupInvite.groupId}
                    onChange={(e) => setGroupInvite(prev => ({ ...prev, groupId: e.target.value }))}
                    aria-label="Study group"
                  >
                    <option value="">Choose a study group...</option>
                    {myGroups.map(g => <option key={g.id} value={g.id}>{g.name} ({g.course_code})</option>)}
                  </select>
                  <button type="submit" className="sp-btn primary" disabled={!groupInvite.groupId || inviting}>
                    {inviting ? "Sending..." : "Send invite"}
                  </button>
                </>}
              </form>
            )}
            <button type="button" className="sp-btn danger" onClick={() => handleRemoveFriend(person)} disabled={removingFriendId === person.id}>
              {removingFriendId === person.id ? "Removing..." : "Remove connection"}
            </button>
          </>}
          {person.kind === "incoming" && <>
            <button type="button" className="sp-btn primary" onClick={() => acceptRequest(person)} disabled={sending}>Accept request</button>
            <button type="button" className="sp-btn ghost" onClick={() => declineRequest(person)} disabled={sending}>Decline</button>
          </>}
          {person.kind === "outgoing" && <>
            <button type="button" className="sp-btn done" disabled>Requested</button>
            <button type="button" className="sp-btn ghost" onClick={() => handleRequestAction(person.requestId, "cancel")} disabled={sending}>Cancel request</button>
          </>}
          {person.kind === "suggested" && (
            <button type="button" className="sp-btn primary" onClick={() => handleConnect(person.id)} disabled={sending}>
              {sending ? "Sending..." : "Request to study together"}
            </button>
          )}
          {notice && <p className={notice.ok ? "sp-notice ok" : "sp-notice bad"}>{notice.text}</p>}
        </div>
      </aside>
    );
  }

  // Accept / decline a request sent to you, or cancel one you sent, then refresh
  // requests, suggestions and connections (an accept makes them a connection).
  // Errors show at the top of the Study Partners sidebar. Returns whether it worked.
  async function handleRequestAction(requestId, action, showError = setPartnersError) {
    setBusyRequestId(requestId);
    let ok = false;
    try {
      if (action === "cancel") await cancelFriendRequest(requestId);
      else await respondToFriendRequest(requestId, action);
      showError("");
      ok = true;
    } catch (err) {
      showError(err.message);
    } finally {
      // Reload either way: on a 404 (they cancelled first) the stale row disappears.
      await Promise.all([loadSuggested(), loadRequests(), loadFriends()]).catch(() => {});
      setBusyRequestId(null);
    }
    return ok;
  }

  // A Suggested Partners row's button: send a request, or take back the one you sent.
  function toggleRequestTo(person) {
    if (person.kind === "outgoing") handleRequestAction(person.requestId, "cancel");
    else handleConnect(person.id);
  }

  // Accept: they become a connection, so open your chat with them.
  async function acceptRequest(person) {
    if (await handleRequestAction(person.requestId, "accept")) openDirectMessage({ id: person.id });
  }

  // Decline: they leave the list (and their page, if it's open).
  async function declineRequest(person) {
    if (await handleRequestAction(person.requestId, "decline") && personId === person.id) {
      setPersonId(null);
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

  // ---- Study Partners sidebar: one list, filtered by its search box ----
  // Everyone in it as one shape: { id, name, avatar_color, has_avatar, kind, shared_courses,
  // shared_groups?, friends_since?, requestId? }. kind: "friend" | "incoming" (asked you) |
  // "outgoing" (you asked) | "suggested". null if they're in none of the lists any more.
  const fromRequest = (r, kind) => ({
    id: r.other_user_id, name: r.other_user_name, avatar_color: r.other_user_avatar_color,
    has_avatar: r.other_user_has_avatar, kind, requestId: r.id, shared_courses: r.shared_courses ?? [],
  });
  function personFrom(id) {
    const friend = friends.find(f => f.id === id);
    if (friend) return { ...friend, kind: "friend" };
    const incoming = incomingRequests.find(r => r.other_user_id === id);
    if (incoming) return fromRequest(incoming, "incoming");
    const outgoing = outgoingRequests.find(r => r.other_user_id === id);
    if (outgoing) return fromRequest(outgoing, "outgoing");
    const suggested = suggestedPartners.find(sp => sp.id === id);
    return suggested ? { ...suggested, kind: "suggested" } : null;
  }
  const peopleQuery = peopleSearch.trim().toLowerCase();
  const matchesQuery = (name) => name.toLowerCase().includes(peopleQuery);
  const requestPeople = incomingRequests.map(r => fromRequest(r, "incoming")).filter(x => matchesQuery(x.name));
  // Chats: every connection. Ones you've talked with first (newest message first, as in
  // conversations), then the rest by name.
  const conversationById = new Map(conversations.map(c => [c.id, c]));
  const chatPeople = [
    ...conversations.map(c => friends.find(f => f.id === c.id)).filter(Boolean),
    ...friends.filter(f => !conversationById.has(f.id)),
  ].filter(f => matchesQuery(f.name));
  // Suggested Partners: ones you've asked (still waiting) and suggestions, in one list by name,
  // so a row stays put when its button flips between + (request) and ✓ (cancel the request).
  const mayKnowPeople = [
    ...outgoingRequests.map(r => fromRequest(r, "outgoing")),
    ...suggestedPartners.map(sp => ({ ...sp, kind: "suggested" })),
  ].filter(x => matchesQuery(x.name))
    .sort((a, b) => a.name.localeCompare(b.name));

  // If the chosen group/DM no longer exists (left the group, removed the friend),
  // these come out null and the Chat tab falls back to the course channel.
  const activeGroup = chatTarget.type === "group" ? myGroups.find(g => g.id === chatTarget.id) ?? null : null;
  const activeGroupId = activeGroup?.id;
  const activeFriend = chatTarget.type === "dm" ? friends.find(f => f.id === chatTarget.id) ?? null : null;
  const activeFriendId = activeFriend?.id;
  const showingChannel = !activeGroup && !activeFriend;
  const selectedPerson = mainView === "partners" && personId ? personFrom(personId) : null;

  // A group opened before its course was known (from the bell, before myGroups
  // loaded): switch to its course's tab once it is. Guarded so it can't loop.
  if (activeGroup && course && activeGroup.course_id !== course.id &&
      courses.some(c => c.id === activeGroup.course_id)) {
    setSelectedCourseId(activeGroup.course_id);
  }

  // The open course's groups, for the Study Spaces sidebar. (Its assignments are on the
  // Assignments page, in the main sidebar.)
  const courseGroups = course ? myGroups.filter(g => g.course_id === course.id) : [];
  const courseInvites = course ? groupInvites.filter(inv => inv.course_code === course.course_code) : [];
  // Public groups in this course you could join: not yours, not one you teach (already listed),
  // and not one you're invited to (it's an invite above).
  const courseSuggestions = course
    ? discoverGroups.filter(g =>
        g.course_id === course.id && !g.is_member &&
        !myGroups.some(mine => mine.id === g.id) &&
        !courseInvites.some(inv => inv.group_id === g.id))
    : [];
  // Intro: the shown view's sections (closed by showSidebarView) open top to bottom, 170ms
  // apart, and each one's rows grow in (GrowIn, like Home's Current Tasks).
  // Study Spaces waits for a course, so there's something to show. At once with reduced motion.
  // Timers are cleared on cleanup, so StrictMode's re-run just restarts it.
  const introReady = sidebarView !== "spaces" || Boolean(course);
  useEffect(() => {
    if (!introReady) return;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const opening = SIDEBAR_SECTIONS[sidebarView];
    const timers = opening.map((key, i) =>
      setTimeout(() => setCollapsed(prev => ({ ...prev, [key]: false })), reduced ? 0 : 120 + i * 170));
    return () => timers.forEach(clearTimeout);
  }, [sidebarView, introReady]);

  // How many of a group's other members have the app open (0 for groups you only teach).
  const groupOnlineCount = (g) => (g.member_ids ?? []).filter(isOnline).length;

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
    coursesError,
    errors.channels,
    errors.conversations,
    errors.groups,
    errors.groupInvites,
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

  // 2. Load channels whenever the selected course changes
  const courseId = course?.id;

  // A space you're in was deleted by its teacher (spaces.js sends "course-deleted" to every
  // member). Drop it right away. If it was the one on screen, or one of its study groups
  // was open, go back to the first remaining space's channel. Refs, so the listener
  // always sees what's on screen now without re-subscribing on every render.
  const shownCourseIdRef = useRef(courseId);
  shownCourseIdRef.current = courseId;
  const myGroupsRef = useRef(myGroups);
  myGroupsRef.current = myGroups;
  useEffect(() => {
    if (!userId) return;
    return onSocketEvent("course-deleted", ({ courseId: deletedId }) => {
      const deletedGroupIds = myGroupsRef.current.filter(g => g.course_id === deletedId).map(g => g.id);
      setCourses(prev => prev.filter(c => c.id !== deletedId));
      setMyGroups(prev => prev.filter(g => g.course_id !== deletedId));
      setChatTarget(prev => (prev.type === "group" && deletedGroupIds.includes(prev.id) ? { type: "channel" } : prev));
      if (shownCourseIdRef.current === deletedId) {
        setSelectedCourseId(null);  // null = the first course in the list
        setSelectedChannelId(null); // null = that course's first channel
      }
      // Discover and Invites can list the deleted space's groups too.
      loadDiscoverGroups().catch(() => {});
      loadGroupInvites().catch(() => {});
    });
  }, [userId, loadDiscoverGroups, loadGroupInvites]);
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


  // 4. Load suggestions (and requests) while the Study Partners side of the sidebar is
  //    open, and re-check every PARTNER_POLL_MS so the other person's actions show up
  useEffect(() => {
    if (!userId || sidebarView !== "partners") return;
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
  }, [userId, sidebarView, loadSuggested, loadRequests]);

  // 5. Load friends and friend requests for the Study Partners sidebar (Requests, Chats) and
  //    the header member cards, re-checking every PARTNER_POLL_MS.
  //    Always on: every view of Spaces uses one of those.
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    async function refresh() {
      try {
        // Requests are needed too: the header member cards show Request / Requested.
        await Promise.all([loadFriends(), loadRequests()]);
        if (!cancelled) setListsError("");
      } catch (err) {
        if (!cancelled) setListsError(err.message);
      }
    }
    refresh();
    const timer = setInterval(refresh, PARTNER_POLL_MS);
    const stopListening = onSocketEvent("friends-changed", refresh);
    const stopReconnect = onSocketEvent("connect", refresh);
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
        setErrorFor("channel", "");
      } catch (err) {
        if (cancelled) return;
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

  // 5b. "Active now": someone's first tab opened or last one closed. realtime.js only sends
  //     this to their study partners and their study groups' members. The friends and groups
  //     reloads also re-check it.
  useEffect(() => {
    if (!userId) return;
    return onSocketEvent("presence-changed", ({ userId: who, online }) => {
      setPresence(prev => ({ ...prev, [who]: Boolean(online) }));
    });
  }, [userId]);

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

  // 10a. Your group invites, always (the Study Groups sidebar answers them), re-checking every
  //      PARTNER_POLL_MS and right away when one arrives.
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    async function refresh() {
      try {
        await loadGroupInvites();
        if (!cancelled) setErrorFor("groupInvites", "");
      } catch (err) {
        if (!cancelled) setErrorFor("groupInvites", `Couldn't load group invites: ${err.message}`);
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
  }, [userId, loadGroupInvites, setErrorFor]);

  // 10b. Load Discover (the groups view, and the sidebar's "Suggested Groups"),
  //      re-checking every PARTNER_POLL_MS so new groups show up.
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    async function refresh() {
      try {
        await loadDiscoverGroups();
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
  }, [userId, loadDiscoverGroups]);

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
  //    When it doesn't scroll (you're reading further up), the first message that arrived
  //    is remembered, and a floating "New message ↓" button takes you to it.
  // It runs only when the number of messages or the chat changes (shownMessages is a new
  // array every render, so depending on it would re-run this, and scroll, on every render);
  // the effect event reads the latest messages without being a dependency.
  const onMessagesChanged = useEffectEvent(() => {
    const box = messageListRef.current;
    const switchedChat = lastScrolledTitleRef.current !== chatTitle;
    const previousCount = lastMessageCountRef.current;
    const firstLoad = previousCount === 0;
    lastScrolledTitleRef.current = chatTitle;
    lastMessageCountRef.current = shownMessages.length;
    const nearBottom = !box || box.scrollHeight - box.scrollTop - box.clientHeight < 200;
    if (switchedChat || firstLoad || nearBottom) {
      // "instant", not "smooth": an animated scroll while animated profile pictures (GIFs)
      // are playing leaves the ones in this list frozen or flickering in Chromium until
      // something redraws the list. "instant" also overrides Landing.css's scroll-behavior.
      bottomRef.current?.scrollIntoView({ behavior: "instant" });
      setFirstNewMessageId(null);
    } else if (shownMessages.length > previousCount) {
      // Keep the earliest one if several arrive before you go down to read them.
      const firstNew = shownMessages[previousCount];
      setFirstNewMessageId(current => current ?? firstNew?.id ?? null);
    }
  });
  useEffect(() => {
    onMessagesChanged();
  }, [shownMessages.length, chatTitle]);

  // The floating "New message" button: a quick eased glide down (smoothScroll.js, the same
  // spring as wheel scrolling, ~0.45s whatever the distance) to the bottom, or, if more
  // arrived than fit on screen, to where the first new one (marked data-msg-id) is at the top.
  // The target never goes past the bottom, so the glide settles there gently instead of
  // stopping dead at the edge. Reduced motion: easeScrollBy jumps instead. The list's
  // onScroll redraw (handleMessageListScroll) still runs once the glide stops.
  function jumpToNewMessage() {
    const box = messageListRef.current;
    if (!box) return;
    const target = box.querySelector(`[data-msg-id="${firstNewMessageId}"]`);
    const toBottom = box.scrollHeight - box.clientHeight - box.scrollTop;
    const toTarget = target ? target.getBoundingClientRect().top - box.getBoundingClientRect().top : toBottom;
    easeScrollBy(box, Math.min(toTarget, toBottom));
    setFirstNewMessageId(null);
  }

  // Chromium workaround: after the message list scrolls, an animated profile picture
  // (GIF) in it can freeze or flicker until the list is redrawn. Shortly after scrolling
  // stops, flip an invisible background value on the list, which forces that redraw.
  function handleMessageListScroll() {
    // Scrolled down to the end yourself: the new messages are on screen, so the button goes.
    const list = messageListRef.current;
    if (firstNewMessageId !== null && list && list.scrollHeight - list.scrollTop - list.clientHeight < 40) {
      setFirstNewMessageId(null);
    }
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
    // Fills everything under the dashboard's 70px top bar, edge to edge: no gap, border or
    // rounded corners (the top bar's line, the nav sidebar and the window's edges frame it).
    // min-height: a short window scrolls the page rather than squashing the chat.
    height: "calc(100vh - 70px)",
    minHeight: "480px",
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
      {/* thin-scroll: the same thin scrollbar as the Planner's Tasks list (index.css). */}
      <div className="thin-scroll" style={{
        width: "270px",
        flexShrink: 0,
        borderRight: "1px solid #e2e8f0",
        background: "#f8fafc",
        padding: "1rem 0.6rem 1rem 1rem"
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
          {courses.length === 0 && coursesError === "" && (
            <p style={{ ...sidebarHintStyle, marginTop: "1rem" }}>You aren't in any courses yet.</p>
          )}

          {course && <>
            {/* Each section on its own grey panel (SIDEBAR_PANEL). */}
            <section style={SIDEBAR_PANEL}>
            <SectionHeader
              title="Course Chats"
              count={channels.length}
              collapsed={collapsed.channels}
              onToggle={() => toggleSection("channels")}
            />
            {!collapsed.channels && <ul style={{ ...sidebarListStyle, position: "relative" }}>
              {/* The highlight skates to the open channel; faded out while you're in a group or DM. */}
              <RowPill
                index={mainView === "chat" && showingChannel ? channels.findIndex(ch => ch.id === channel?.id) : -1}
                row={COURSE_CHANNEL_ROW} gap={COURSE_CHANNEL_GAP} />
              {channels.map((ch, i) => {
                const isShowing = mainView === "chat" && showingChannel && channel?.id === ch.id;
                // The gap below each row is on the <li> so it opens with the row; the row itself
                // keeps the pill's fixed height and sits above the pill (position: relative).
                return <GrowIn key={ch.id} as="li" step={i} style={{ marginBottom: COURSE_CHANNEL_GAP, position: "relative" }}>
                  <div onClick={() => openChannel(course.id, ch.id)} style={{
                    ...sidebarChannelStyle(isShowing), ...dotRowStyle,
                    ...pillRowStyle(COURSE_CHANNEL_ROW, 0), padding: "0 0.8rem"
                  }}>
                    <span># {ch.name}</span>
                    {/* No dot on the channel you're reading: it's marked read as it loads. */}
                    <UnreadDot info={unread[`channel-${ch.id}`]} hidden={isShowing} />
                  </div>
                </GrowIn>;
              })}
            </ul>}
            </section>

            <section style={SIDEBAR_PANEL}>
            <SectionHeader
              title="Study Groups"
              count={courseGroups.length}
              collapsed={collapsed.groups}
              onToggle={() => toggleSection("groups")}
            />
            {!collapsed.groups && <>
              {/* In order, like Study Partners: invites to this course's groups (answered right here),
                  the groups you're in, then public groups you might join (a name opens the full list).
                  Invites and suggestions show no online status; that's only for groups you're in. */}
              {courseInvites.map((inv, i) => (
                // The 6px below each invite (.sp-request) moved onto its grow-in row.
                <GrowIn key={inv.id} step={i} style={{ marginBottom: 6 }}>
                <div className="sp-row sp-request" style={{ marginBottom: 0 }}>
                  <GroupIcon name={inv.group_name} color={courseAccent(courses, course.id)} />
                  <span className="sp-text">
                    <strong>{inv.group_name}{inv.visibility === "private" && " 🔒"}</strong>
                    <span>Invited by {inv.inviter_name}</span>
                  </span>
                  <button type="button" className="sp-icon-btn yes" onClick={() => acceptGroupInvite(inv)}
                    disabled={busyInviteId === inv.id} aria-label={`Join ${inv.group_name}`} title="Join">
                    <Check size={15} strokeWidth={2.8} />
                  </button>
                  <button type="button" className="sp-icon-btn no" onClick={() => handleInviteResponse(inv.id, "decline")}
                    disabled={busyInviteId === inv.id} aria-label={`Decline the invite to ${inv.group_name}`} title="Decline">
                    <X size={14} strokeWidth={2.6} />
                  </button>
                </div>
                </GrowIn>
              ))}
              {courseGroups.length === 0 && courseInvites.length === 0 && (
                <GrowIn step={0}><p style={sidebarHintStyle}>You're not in any {course.course_code} study groups yet.</p></GrowIn>
              )}
              <ul style={sidebarListStyle}>
                {courseGroups.map((g, i) => {
                  const isOpen = mainView === "chat" && activeGroup?.id === g.id;
                  const groupInfo = unread[`group-${g.id}`];
                  const folded = isOpen && groupChannelsCollapsed;
                  // Folded: unread in the channels you can't see (the one you're reading is marked read).
                  const hiddenUnread = folded
                    ? GROUP_CHANNELS.filter(name => name !== groupChannel)
                        .reduce((sum, name) => sum + (groupChannelsUnread[g.id]?.[name] ?? 0), 0)
                    : 0;
                  // Grows in after the invites above it.
                  return <GrowIn key={g.id} as="li" step={courseInvites.length + i} style={{ marginBottom: "0.4rem" }}>
                    {/* position + zIndex: the open row sits in front of its channels, so the first
                        one can slide down from behind it (index.css .group-channel). */}
                    <div onClick={() => openGroupChat(g.id)} style={{ ...sidebarItemStyle(isOpen), ...dotRowStyle, position: "relative", zIndex: GROUP_CHANNELS.length + 1 }}>
                      {/* Open group only: fold/unfold its channel list. One ▸ that turns to point
                          down when open (index.css .group-fold-arrow). */}
                      {isOpen && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setGroupChannelsCollapsed(c => !c); }}
                          aria-expanded={!groupChannelsCollapsed}
                          aria-label={groupChannelsCollapsed ? `Show ${g.name} channels` : `Hide ${g.name} channels`}
                          style={{ flexShrink: 0, width: "1rem", padding: 0, background: "none", border: "none", fontSize: "0.8rem", color: "inherit", cursor: "pointer" }}
                        >
                          <span aria-hidden="true" className={groupChannelsCollapsed ? "group-fold-arrow" : "group-fold-arrow open"}>▸</span>
                        </button>
                      )}
                      {/* The group's icon (its initials in the course colour), with a green dot while
                          anyone else in it has the app open (members only; staff get no presence). */}
                      <GroupIcon name={g.name} color={courseAccent(courses, g.course_id)} online={groupOnlineCount(g) > 0} />
                      {/* Folded: one line, "Group › #channel" (like the chat's title bar), cut off with "…". */}
                      <span style={{ flex: 1, minWidth: 0, ...(folded ? { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } : {}) }}>
                        {g.name}
                        {g.visibility === "private" && <span style={{ fontWeight: "400", color: "#64748b" }}> 🔒</span>}
                        {g.access === "staff" && <span style={{ fontWeight: "400", color: "#64748b" }}> (teaching)</span>}
                        {folded && <span style={{ fontWeight: "400" }}> › #{groupChannel}</span>}
                        {!folded && g.member_ids && (
                          <span style={{ display: "block", fontSize: "0.72rem", fontWeight: "400", color: "#64748b" }}>
                            {g.member_ids.length + 1} member{g.member_ids.length === 0 ? "" : "s"}
                            {groupOnlineCount(g) > 0 && ` · ${groupOnlineCount(g)} online`}
                          </span>
                        )}
                      </span>
                      {/* Closed group: one dot for all its channels. Open: each channel has its own,
                          unless the list is folded, then one for the channels it hides. */}
                      {folded
                        ? <UnreadDot info={hiddenUnread > 0 ? { unread: hiddenUnread, viewed: groupInfo?.viewed ?? false } : null} />
                        : <UnreadDot info={groupInfo} hidden={isOpen} />}
                    </div>

                    {/* Unfolding: one channel at a time, each grows out from behind the one above
                        it while the list's height opens (index.css .group-channels). */}
                    {isOpen && !groupChannelsCollapsed && <ul className="group-channels" style={{ position: "relative", listStyle: "none", padding: "0.3rem 0 0 0.8rem", margin: 0 }}>
                      {/* The highlight: one pill that skates to the open channel, like the main nav's
                          .nav-pill. The outer span moves it (index.css .group-channel-pill); the inner
                          one plays the unfold animation with its channel's row. */}
                      {(() => {
                        const activeIndex = GROUP_CHANNELS.indexOf(groupChannel);
                        return <span aria-hidden="true" className="group-channel-pill"
                          style={{ height: GROUP_CHANNEL_ROW, transform: `translateY(${activeIndex * GROUP_CHANNEL_ROW}px)` }}>
                          <span className="group-channel" style={{ display: "block", height: "100%", background: "#ffffff", boxShadow: ON_PANEL_SHADOW, borderRadius: "6px", animationDelay: `${activeIndex * 100}ms` }} />
                        </span>;
                      })()}
                      {GROUP_CHANNELS.map((name, i) => {
                        const count = groupChannelsUnread[g.id]?.[name] ?? 0;
                        const active = groupChannel === name;
                        return <li key={name} className="group-channel" onClick={() => setGroupChannel(name)} style={{
                          ...sidebarChannelStyle(active), ...dotRowStyle,
                          // Fixed height (no gaps), so the pill moves one row per GROUP_CHANNEL_ROW px.
                          // Transparent: the pill behind shows the open channel. position keeps the text above it.
                          height: GROUP_CHANNEL_ROW, boxSizing: "border-box", padding: "0 0.8rem",
                          background: "transparent", position: "relative",
                          animationDelay: `${i * 100}ms`
                        }}>
                          <span># {name}</span>
                          <UnreadDot info={count > 0 ? { unread: count, viewed: groupInfo?.viewed ?? false } : null}
                            hidden={groupChannel === name} />
                        </li>;
                      })}
                    </ul>}
                  </GrowIn>;
                })}
              </ul>

              {courseSuggestions.length > 0 && <>
                <div style={{ marginTop: "0.75rem" }}>
                  <SectionHeader
                    title="Suggested Groups"
                    count={courseSuggestions.length}
                    collapsed={collapsed.suggestedGroups}
                    onToggle={() => toggleSection("suggestedGroups")}
                  />
                </div>
                {!collapsed.suggestedGroups && courseSuggestions.map((g, i) => (
                  <GrowIn key={g.id} step={i}>
                  <div className="sp-row">
                    <GroupIcon name={g.name} color={courseAccent(courses, g.course_id)} />
                    <button type="button" className="sp-name-btn sp-text" onClick={() => openGroupFinder(course)}>
                      <strong>{g.name}</strong>
                      <span>
                        {g.member_count} member{Number(g.member_count) === 1 ? "" : "s"}
                        {g.meeting_time && ` · ${g.meeting_time}`}
                      </span>
                    </button>
                    <button type="button" className="sp-icon-btn add" onClick={() => joinSuggestedGroup(g)}
                      disabled={busyGroupId === g.id} aria-label={`Join ${g.name}`} title="Join">
                      <Plus size={15} strokeWidth={2.8} />
                    </button>
                  </div>
                  </GrowIn>
                ))}
              </>}

            </>}
            </section>
          </>}
        </>}

        {/* Study Partners: one list, like an inbox. Requests (accept or decline right here),
            Chats (every connection, with the last message), then Suggested Partners (+ to
            send a request, the check to take it back). A name opens their chat or their page. */}
        {sidebarView === "partners" && <>
          <label className="sp-search">
            <Search size={15} aria-hidden="true" />
            <input
              value={peopleSearch}
              onChange={(e) => setPeopleSearch(e.target.value)}
              placeholder="Search people..."
              aria-label="Search people"
            />
          </label>
          {(listsError || partnersError) && <p className="sp-error" role="alert">{partnersError || listsError}</p>}

          {requestPeople.length > 0 && (
            <section style={SIDEBAR_PANEL}>
              <SectionHeader
                title="Requests"
                count={requestPeople.length}
                collapsed={collapsed.requests}
                onToggle={() => toggleSection("requests")}
              />
              {/* The 6px between requests (.sp-request) moved onto their grow-in rows (--grow-gap). */}
              {!collapsed.requests && requestPeople.map((person, i) => (
                <GrowIn key={person.id} step={i} gap="6px">
                <div className={`sp-row sp-request${mainView === "partners" && personId === person.id ? " on" : ""}`}
                  style={{ marginBottom: 0 }}>
                  <Avatar name={person.name} userId={person.id} color={person.avatar_color} hasAvatar={person.has_avatar} size={32} />
                  <button type="button" className="sp-name-btn sp-text" onClick={() => openPerson(person.id)}>
                    <strong>{person.name}</strong>
                    <span>{person.shared_courses.join(" · ") || "Wants to study with you"}</span>
                  </button>
                  <button type="button" className="sp-icon-btn yes" onClick={() => acceptRequest(person)}
                    disabled={busyRequestId === person.requestId} aria-label={`Accept ${person.name}`} title="Accept">
                    <Check size={15} strokeWidth={2.8} />
                  </button>
                  <button type="button" className="sp-icon-btn no" onClick={() => declineRequest(person)}
                    disabled={busyRequestId === person.requestId} aria-label={`Decline ${person.name}`} title="Decline">
                    <X size={14} strokeWidth={2.6} />
                  </button>
                </div>
                </GrowIn>
              ))}
            </section>
          )}

          <section style={SIDEBAR_PANEL}>
            <SectionHeader
              title="Chats"
              count={chatPeople.length}
              collapsed={collapsed.dms}
              onToggle={() => toggleSection("dms")}
            />
            {!collapsed.dms && (chatPeople.length === 0 ? (
              <GrowIn step={0}><p className="sp-hint">
                {friends.length === 0 ? "Request someone below to start studying together." : "No chats match your search."}
              </p></GrowIn>
            ) : chatPeople.map((f, i) => {
              const isOpen = mainView === "chat" && activeFriend?.id === f.id;
              const conv = conversationById.get(f.id);
              return (
                <GrowIn key={f.id} step={i}>
                <button type="button" className={isOpen ? "sp-row on" : "sp-row"} onClick={() => openDirectMessage(f)}>
                  <Avatar name={f.name} userId={f.id} color={f.avatar_color} hasAvatar={f.has_avatar} size={34} online={isOnline(f.id)} />
                  <span className="sp-text">
                    <strong>{f.name}</strong>
                    <span>{conv ? `${Number(conv.last_from_me) ? "You: " : ""}${conv.last_message}` : "No messages yet"}</span>
                  </span>
                  {conv && <span className="sp-when">{shortWhen(conv.last_message_at)}</span>}
                  {/* While they've sent messages you haven't opened. Hidden for the open
                      chat, which is being read right now. */}
                  <UnreadDot info={unread[`dm-${f.id}`]} hidden={isOpen} />
                </button>
                </GrowIn>
              );
            }))}
          </section>

          <section style={SIDEBAR_PANEL}>
            <SectionHeader
              title="Suggested Partners"
              count={mayKnowPeople.length}
              collapsed={collapsed.suggestedPartners}
              onToggle={() => toggleSection("suggestedPartners")}
            />
            {!collapsed.suggestedPartners && partnersLoading && mayKnowPeople.length === 0 && <GrowIn step={0}><p className="sp-hint">Loading classmates...</p></GrowIn>}
            {!collapsed.suggestedPartners && !partnersLoading && mayKnowPeople.length === 0 && (
              <GrowIn step={0}><p className="sp-hint">{peopleQuery ? "Nobody matches your search." : "Classmates from your courses show up here."}</p></GrowIn>
            )}
            {!collapsed.suggestedPartners && mayKnowPeople.map((person, i) => {
              const asked = person.kind === "outgoing";
              const sending = connectStatus[person.id] === "sending" || busyRequestId === person.requestId;
              return (
                <GrowIn key={person.id} step={i}>
                <div className={mainView === "partners" && personId === person.id ? "sp-row on" : "sp-row"}>
                  <Avatar name={person.name} userId={person.id} color={person.avatar_color} hasAvatar={person.has_avatar} size={32} />
                  <button type="button" className="sp-name-btn sp-text" onClick={() => openPerson(person.id)}>
                    <strong>{person.name}</strong>
                    <span className="sp-chips">{person.shared_courses.map(code => <CourseChip key={code} code={code} courses={courses} />)}</span>
                  </button>
                  <button
                    type="button"
                    className={asked ? "sp-icon-btn yes" : "sp-icon-btn add"}
                    onClick={() => toggleRequestTo(person)}
                    disabled={sending}
                    aria-label={asked ? `Requested. Cancel your request to ${person.name}` : `Request ${person.name} as a study partner`}
                    title={asked ? "Requested (click to cancel)" : "Request"}
                  >
                    {asked ? <Check size={15} strokeWidth={2.8} /> : <Plus size={15} strokeWidth={2.8} />}
                  </button>
                </div>
                </GrowIn>
              );
            })}
          </section>
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
              <Avatar name={activeFriend.name} userId={activeFriend.id} color={activeFriend.avatar_color} hasAvatar={activeFriend.has_avatar} size={32}
                online={isOnline(activeFriend.id)} />
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
              {/* Members only: how many of the others are online, green dot if any, grey if none. */}
              {activeGroup?.access === "member" && (() => {
                const online = headerMembers.filter(m => m.id !== userId && isOnline(m.id)).length;
                return (
                  <span className="sp-online-count" title={online ? `${online} online now` : "Nobody else online"}>
                    <i aria-hidden="true" className={online ? "on" : ""} />{online} online
                  </span>
                );
              })()}
            </span>
          )}
          <label style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", marginLeft: "auto", fontSize: "0.85rem", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={compactChat}
              onChange={(event) => {
                const checked = event.target.checked;
                setCompactChat(checked);
                try { localStorage.setItem(COMPACT_CHAT_KEY, String(checked)); } catch { /* storage unavailable */ }
              }}
            />
            Compact view
          </label>
          {activeGroup?.access === "member" && (
            <button
              onClick={handleLeaveGroup}
              disabled={leavingGroup}
              style={{ ...secondaryButtonStyle, padding: "0.45rem 0.8rem" }}
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

        {/* position: relative holds the floating "New message" button over the list's bottom edge,
            outside the scrolling part so it stays put while you scroll. */}
        <div style={{ position: "relative", flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        <div ref={messageListRef} onScroll={handleMessageListScroll} className="no-scrollbar" style={{
          flex: 1,
          padding: "1rem",
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: compactChat ? "0.35rem" : "0.75rem"
        }}>
           {canSend && shownMessages.length === 0 && <p style={{ color: "#94a3b8", fontSize: "0.9rem" }}>
            {activeFriend ? `This is the beginning of your conversation with ${activeFriend.name}.` : "No messages yet. Say hi!"}
          </p>}
          {shownMessages.map(msg => {
            const mine = msg.user_id === userId;
            const senderName = mine ? user?.name : msg.user_name ?? activeFriend?.name;
            return <div key={msg.id} data-msg-id={msg.id} style={{
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
                // Other people's bubbles: slate-200, a step darker than slate-100, so they
                // stand out more from the white chat background.
                background: mine ? "#2563eb" : "#e2e8f0",
                color: mine ? "#ffffff" : "#0f172a",
                padding: compactChat ? "0.3rem 0.65rem" : "0.6rem 0.9rem",
                borderRadius: "10px"
              }}>
                <div style={{
                  fontSize: "0.75rem",
                  opacity: 0.8,
                  marginBottom: "0.2rem"
                }}>
                  {mine ? "You" : senderName}
                  {/* Course staff (user_role is only set for them): a small Teacher / TA badge. */}
                  {(msg.user_role === "teacher" || msg.user_role === "ta") && (
                    <span style={{
                      display: "inline-block",
                      marginLeft: "0.4rem",
                      padding: "0.05rem 0.4rem",
                      borderRadius: "999px",
                      fontSize: "0.62rem",
                      fontWeight: 700,
                      letterSpacing: "0.05em",
                      textTransform: "uppercase",
                      verticalAlign: "1px",
                      // On your own blue bubble: see-through white. On others': purple for
                      // teachers, blue for TAs.
                      ...(mine
                        ? { background: "rgba(255, 255, 255, 0.25)", color: "#ffffff" }
                        : msg.user_role === "teacher"
                          ? { background: "#ede9fe", color: "#6d28d9" }
                          : { background: "#dbeafe", color: "#1d4ed8" })
                    }}>
                      {msg.user_role === "teacher" ? "Teacher" : "TA"}
                    </span>
                  )}
                  {" "}• {formatTime(msg.created_at)}
                </div>
                <div style={{
                  fontSize: "0.95rem",
                  overflowWrap: "anywhere"
                }}>{msg.content}</div>
                {!msg.pending && courses.length > 0 && (activeFriend || activeGroup || channelId) && onTaskFromMessage && (
                  <button
                    type="button"
                    style={{ marginTop: "0.3rem", padding: 0, border: 0, background: "none", color: "inherit", fontSize: "0.75rem", textDecoration: "underline", cursor: "pointer" }}
                    onClick={() => onTaskFromMessage({
                      content: msg.content,
                      courseId: activeFriend ? undefined : activeGroup?.course_id ?? course?.id,
                      source: activeFriend ? `chat:dm:${activeFriend.id}`
                        : activeGroup ? `chat:group:${activeGroup.id}:${groupChannel}`
                        : `chat:channel:${channelId}:${course.id}`,
                    })}
                  >
                    Create task
                  </button>
                )}
              </div>
            </div>;
          })}
          <div ref={bottomRef} />
        </div>
          {/* Messages came in while you were reading further up (the list has no scrollbar,
              so this is how you'd know). Click to go to the first of them. index.css .new-message-btn */}
          {(() => {
            const firstIndex = shownMessages.findIndex(m => m.id === firstNewMessageId);
            if (firstIndex === -1) return null;
            const count = shownMessages.length - firstIndex;
            return <button type="button" className="new-message-btn" onClick={jumpToNewMessage}>
              {count === 1 ? "New message" : `${count} new messages`}
              <ArrowDown size={14} aria-hidden="true" />
            </button>;
          })()}
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

      {/* Beside an open DM: who you're talking with and what you share. */}
      {mainView === "chat" && activeFriend && renderProfile(personFrom(activeFriend.id) ?? { ...activeFriend, kind: "friend" })}

      {/* Study Partners: the page of someone you're not chatting with, or a hint. */}
      {mainView === "partners" && (selectedPerson ? <>
        <div className="sp-person">
          <div>
            <Avatar name={selectedPerson.name} userId={selectedPerson.id} color={selectedPerson.avatar_color} hasAvatar={selectedPerson.has_avatar} size={72} />
            <strong>{selectedPerson.name}</strong>
            {selectedPerson.kind === "friend" ? (
              <>
                You're study partners now.
                <button type="button" className="sp-btn primary" style={{ width: "auto", padding: "0 16px" }} onClick={() => openDirectMessage(selectedPerson)}>
                  <MessageSquare size={14} /> Message {selectedPerson.name.split(" ")[0]}
                </button>
              </>
            ) : selectedPerson.kind === "incoming"
              ? "Accept their request to start chatting."
              : selectedPerson.kind === "outgoing"
                ? "Your request is waiting for them. Once they accept, your chat opens here."
                : "Send a request. Once they accept, your chat opens here."}
          </div>
        </div>
        {renderProfile(selectedPerson)}
      </> : (
        <div className="sp-person">
          <div>
            <strong>Study Partners</strong>
            Pick a chat, a request, or someone you may know in the list on the left.
          </div>
        </div>
      ))}

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

              {/* The search, the create form and the groups on a grey panel (PANEL), cards white on it. */}
              <section style={PANEL}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", marginBottom: "1rem" }}>
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
                    marginBottom: "1rem",
                    padding: "1rem",
                    borderRadius: "10px",
                    background: "#fff",
                    boxShadow: ON_PANEL_SHADOW,
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
              </section>
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

              {/* The invites on a grey panel (PANEL), cards white on it. */}
              <section style={PANEL}>
              {groupInvites.length === 0 && (
                <p style={{ color: "#64748b", fontSize: "0.9rem", margin: 0 }}>
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
              </section>
            </div>
          )}
        </div>}
    </div>
  </div>;
}
