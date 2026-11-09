import React, { useState, useEffect, useRef, useCallback } from "react";

import { getMyCourses, getCourseChannels, getChannelMessages, sendChannelMessage, getSuggestedPartners, 
sendFriendRequest, getFriendRequests, respondToFriendRequest, cancelFriendRequest, getFriends, removeFriend,
getConversations, getDirectMessages, sendDirectMessage, getDiscoverGroups, getMyStudyGroups, createStudyGroup,
joinStudyGroup, leaveStudyGroup, getGroupMessages, sendGroupMessage, getGroupInvites, inviteToGroup, respondToGroupInvite,
getCourseMembers, getGroupMembers } from "../api";
import Avatar from "./Avatar";

const PARTNER_POLL_MS = 10000; // how often we poll server so other users' friend requests show up
const POLL_MS = 3000; // how often we re-fetch messages so other users' chats show up
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

const sidebarHeadingStyle = { fontSize: "1rem", fontWeight: "700", color: "#1e293b", margin: "1.5rem 0 0.5rem" };
const sidebarHintStyle = { fontSize: "0.8rem", color: "#94a3b8" };
const sidebarListStyle = { listStyle: "none", padding: 0, margin: 0 };

// Chat-sidebar heading that collapses/expands the section under it.
// Shows how many items are hidden while collapsed.
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
  const [errors, setErrors] = useState({});       // { [source]: message }, one per loader so one can't wipe another's
  const [sendError, setSendError] = useState(null); // { target: chatTitle, text }, only shown in the chat it happened in
  const [activeTab, setActiveTab] = useState("chat");
  const [partnerView, setPartnerView] = useState("connections");
  const bottomRef = useRef(null);
  const messageListRef = useRef(null);           // the scrolling message area
  const lastScrolledTitleRef = useRef(null);     // chat we last auto-scrolled in
  const lastMessageCountRef = useRef(0);
  const connectingRef = useRef(new Set());       // partner ids with a request in flight (a ref, so a fast double click can't slip past)
  const [partnerSearch, setPartnerSearch] = useState("");
  const [partnerCourse, setPartnerCourse] = useState("all");
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

    // Which Chat-tab sidebar sections are collapsed (all open by default).
  const [collapsed, setCollapsed] = useState({ spaces: false, groups: false, dms: false });

  function toggleSection(key) {
    setCollapsed(prev => ({ ...prev, [key]: !prev[key] }));
  }

  // Show a study group's chat in the Chat tab.
  function openGroupChat(groupId) {
    if (chatTarget.type !== "group" || chatTarget.id !== groupId) setGroupChannel("general");
    setChatTarget({ type: "group", id: groupId });
    setActiveTab("chat");
  }

  // "Message" on a connection: open the DM with them in the Chat tab. A chat you've
  // never sent anything in shows in your sidebar right away, and is saved (and
  // appears for them) when you send the first message.
  function openDirectMessage(friend) {
    setStartedDmIds(prev => (prev.includes(friend.id) ? prev : [...prev, friend.id]));
    setChatTarget({ type: "dm", id: friend.id });
    setActiveTab("chat");
  }

  // Course/channel clicks in the Chat sidebar.
  function openChannel(courseId, channelId) {
    setChatTarget({ type: "channel" });
    setSelectedCourseId(courseId);
    setSelectedChannelId(channelId);
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
    if (!userId || activeTab !== "partners" || partnerView !== "suggested") return;
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
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [userId, activeTab, partnerView, loadSuggested, loadRequests]);

  // 5. Load friends and friend requests for the Connections view (incoming requests are listed
  //    there), the Chat tab's Direct Messages and the header member cards, re-checking every PARTNER_POLL_MS.
  useEffect(() => {
    const wantsFriends = activeTab === "chat" || (activeTab === "partners" && partnerView === "connections");
    if (!userId || !wantsFriends) return;
    let cancelled = false;
    async function refresh(showSpinner) {
      if (showSpinner) setListsLoading(true);
      try {
        // On the Chat tab, requests are needed too: the header member cards show Request / Requested.
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
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [userId, activeTab, partnerView, loadFriends, loadRequests]);


  // Load on channel change + poll so messages from other users appear
  // only while a course channel is actually on screen (not a DM, group, or other tab).
  useEffect(() => {
    if (!channelId || activeTab !== "chat" || !showingChannel) return;
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
    const timer = setInterval(refresh, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [channelId, activeTab, showingChannel, loadMessages, setErrorFor]);

  // 6. Load your DM conversations while the Chat tab is open, re-checking every
  //    PARTNER_POLL_MS so a chat someone starts with you shows up in your sidebar.
   useEffect(() => {
    if (!userId || activeTab !== "chat") return;
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
    const timer = setInterval(refresh, PARTNER_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [userId, activeTab, loadConversations, setErrorFor]);

  // 7. Load the open DM from the database and poll it like a course channel,
  //    so the other person's replies appear.
  useEffect(() => {
    if (!activeFriendId) return;
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
    const timer = setInterval(refresh, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [activeFriendId, loadDirectMessages, setErrorFor]);
  
  // 8. Load the groups whose chat you can open (yours + ones you teach) for the
  //    Chat tab's sidebar, re-checking every PARTNER_POLL_MS.
  useEffect(() => {
    const wantsGroups = activeTab === "chat" || (activeTab === "partners" && partnerView === "connections");
    if (!userId || !wantsGroups) return;
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
  }, [userId, activeTab, partnerView, loadMyGroups, setErrorFor]);

  // 9. Load the open group channel from the database and poll it like a course
  //    channel, so other members' messages appear.
  useEffect(() => {
    if (!activeGroupId) return;
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
    const timer = setInterval(refresh, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [activeGroupId, groupChannel, loadGroupMessages, setErrorFor]);

  // 10. Load Discover and your invites while the Study Groups tab is open,
  //     re-checking every PARTNER_POLL_MS so new groups and invites show up.
  useEffect(() => {
    if (!userId || activeTab !== "groups") return;
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
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [userId, activeTab, loadDiscoverGroups, loadGroupInvites]);

  // 11. Load the people in the open space or group for the Chat header, and
  //     re-check every PARTNER_POLL_MS so people joining or leaving show up.
  useEffect(() => {
    if (activeTab !== "chat") return;
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
  }, [activeTab, activeGroupId, showingChannel, courseId, loadGroupMembers, loadCourseMembers]);

  // Auto-scroll when a new message arrives or the channel changes
  //    Always on a chat switch or first load; otherwise only if you're already near the
  //    bottom, so reading older messages doesn't get interrupted.
  useEffect(() => {
    const box = messageListRef.current;
    const switchedChat = lastScrolledTitleRef.current !== chatTitle;
    const firstLoad = lastMessageCountRef.current === 0;
    lastScrolledTitleRef.current = chatTitle;
    lastMessageCountRef.current = visibleMessages.length;
    const nearBottom = !box || box.scrollHeight - box.scrollTop - box.clientHeight < 200;
    if (switchedChat || firstLoad || nearBottom) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [visibleMessages.length, chatTitle]);

   // 4. Send a message. Course channels, study groups and DMs are all saved to the
  //    backend, then re-fetched so what you see == the DB.
  async function handleSendMessage(e) {
    e.preventDefault();
    const content = inputText.trim();
    if (!content || sending || !canSend) return;

    setSending(true);
    try {
      if (activeGroup) {
        await sendGroupMessage(activeGroup.id, groupChannel, content);
        setInputText("");
        // A failed reload isn't a failed send; the poll will catch up.
        await loadGroupMessages(activeGroup.id, groupChannel).catch(() => {});
      } else if (activeFriend) {
        await sendDirectMessage(activeFriend.id, content);
        setInputText("");
        await Promise.all([loadDirectMessages(activeFriend.id), loadConversations()]).catch(() => {});
      } else {
        await sendChannelMessage(channelId, content);
        setInputText("");
        await loadMessages().catch(() => {});
      }
      setSendError(null);
    } catch (err) {
      setSendError({ target: chatTitle, text: `Message not sent: ${err.message}` });
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
        <SectionHeader
          title="Study Spaces"
          count={courses.length}
          collapsed={collapsed.spaces}
          onToggle={() => toggleSection("spaces")}
          first
        />
        {!collapsed.spaces && <>
          {courses.length === 0 && status === "Connected to Backend" && (
            <p style={sidebarHintStyle}>You aren't in any courses yet.</p>
          )}

          <ul style={sidebarListStyle}>
            {courses.map(c => {
              const isOpen = course?.id === c.id;
              return <li key={c.id} style={{
                marginBottom: "0.4rem"
              }}>
                <div onClick={() => openChannel(c.id, null)} style={sidebarItemStyle(isOpen && showingChannel)}>
                  {c.course_code} {c.course_name}
                </div>

                {isOpen && <ul style={{
                  listStyle: "none",
                  padding: "0.3rem 0 0 0.8rem",
                  margin: 0
                }}>
                  {channels.map(ch => <li key={ch.id} onClick={() => openChannel(c.id, ch.id)} style={sidebarChannelStyle(showingChannel && channel?.id === ch.id)}>
                    # {ch.name}
                  </li>)}
                </ul>}
              </li>;
            })}
          </ul>
        </>}

        {/* Study groups you belong to, each with its channels */}
        <SectionHeader
          title="Study Groups"
          count={myGroups.length}
          collapsed={collapsed.groups}
          onToggle={() => toggleSection("groups")}
        />
        {!collapsed.groups && <>
          {myGroups.length === 0 && <p style={sidebarHintStyle}>Join a group from Discover or accept an invite in the Study Groups tab.</p>}
          <ul style={sidebarListStyle}>
            {myGroups.map(g => {
              const isOpen = activeGroup?.id === g.id;
              return <li key={g.id} style={{ marginBottom: "0.4rem" }}>
                <div onClick={() => openGroupChat(g.id)} style={sidebarItemStyle(isOpen)}>
                  {g.name}
                  {g.visibility === "private" && <span style={{ fontWeight: "400", color: "#64748b" }}> 🔒</span>}
                  {g.access === "staff" && <span style={{ fontWeight: "400", color: "#64748b" }}> (teaching)</span>}
                </div>

                {isOpen && <ul style={{ listStyle: "none", padding: "0.3rem 0 0 0.8rem", margin: 0 }}>
                  {GROUP_CHANNELS.map(name => <li key={name} onClick={() => setGroupChannel(name)} style={sidebarChannelStyle(groupChannel === name)}>
                    # {name}
                  </li>)}
                </ul>}
              </li>;
            })}
          </ul>
        </>}

        {/* DMs you've started with your connections */}
        <SectionHeader
          title="Study Chats"
          count={dmFriends.length}
          collapsed={collapsed.dms}
          onToggle={() => toggleSection("dms")}
        />
        {!collapsed.dms && <>
          {dmFriends.length === 0 && <p style={sidebarHintStyle}>Click "Message" on a connection to start a chat.</p>}
          <ul style={sidebarListStyle}>
            {dmFriends.map(f => <li key={f.id} onClick={() => openDirectMessage(f)} style={{
              ...sidebarItemStyle(activeFriend?.id === f.id),
              marginBottom: "0.4rem",
              display: "flex",
              alignItems: "center",
              gap: "0.5rem"
            }}>
              <Avatar name={f.name} userId={f.id} color={f.avatar_color} hasAvatar={f.has_avatar} size={24} />
              <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {f.name}
              </span>
            </li>)}
          </ul>
        </>}
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

        <div style={{
          flex: 1,
          padding: "1rem",
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: "0.75rem"
        }}>
           {canSend && visibleMessages.length === 0 && <p style={{ color: "#94a3b8", fontSize: "0.9rem" }}>
            {activeFriend ? `This is the beginning of your conversation with ${activeFriend.name}.` : "No messages yet. Say hi!"}
          </p>}
          {visibleMessages.map(msg => {
            const mine = msg.user_id === userId;
            const senderName = mine ? user?.name : msg.user_name ?? activeFriend?.name;
            return <div key={msg.id} style={{
              display: "flex",
              alignItems: "flex-end",
              gap: "0.5rem",
              flexDirection: mine ? "row-reverse" : "row",
              alignSelf: mine ? "flex-end" : "flex-start",
              maxWidth: "70%"
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
          <button type="submit" disabled={!canSend || sending} style={{
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
            Find Study Partners
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
              {friends.map(f => (
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
                          You're not in any study groups yet. Join or create one in the Study Groups tab.
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
        </div>
      </div>
    )}

  </div>;
}
