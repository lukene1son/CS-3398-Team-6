import React, { useEffect, useState, useRef, useCallback } from 'react';
import { 
  Home, Users, Calendar, Sparkles, BookOpen, Settings,
  Search, Bell, FileText, MessageSquare, HelpCircle, 
  Clock, CheckSquare, Square, ChevronRight, ChevronDown, LogOut, FolderPlus} from 'lucide-react';
import { getMyAssignments, getMyCourses, updateAssignmentStatus, createAssignment,
    getFriendRequests, getGroupInvites, getNotifications, clearAcceptedNotifications,
    respondToFriendRequest, respondToGroupInvite, getActivity, markGroupRead,
    getLoginAttempts, decideLoginAttempt} from '../api';
import {onSocketEvent} from '../socket';

import SpacesChat from '../components/SpacesChat';
import PartnerNotifications from '../components/PartnerNotifications';
import CalendarView from './Calendar';
import AITools from './AITools';
import Resources from './Resources';
import SettingsPage from './SettingsPage';
import Avatar from '../components/Avatar';

// One string per notification, so we can tell which ones the user has already seen.
function notificationKeys(n) {
  return [
    ...n.friendRequests.map((r) => `request-${r.id}`),
    ...n.groupInvites.map((i) => `invite-${i.id}`),
    ...n.accepted.map((r) => `accepted-${r.id}`),
    ...n.loginAttempts.map((a) => `signin-${a.id}`),
  ];
}

// Unread chat messages the bell knows about: study groups, Study Chats (DMs) and course channels.
const unreadTotal = (n) => n.unreadGroupMessages + n.unreadDirectMessages + n.unreadChannelMessages;

// The number on the bell's pill: one per row in the window. A chat with any
// number of unread messages counts once; so does each partner request,
// group invite, and accepted request.
const notificationCount = (n) =>
  n.unreadGroups.length + n.unreadDirect.length + n.unreadChannels.length +
  n.friendRequests.length + n.groupInvites.length + n.accepted.length + n.loginAttempts.length;

// Every unread chat as { key: unread count }. Keys: "group-3", "dm-7", "channel-2".
function unreadChats(n) {
  return Object.fromEntries([
    ...n.unreadGroups.map((g) => [`group-${g.group_id}`, g.unread]),
    ...n.unreadDirect.map((c) => [`dm-${c.user_id}`, c.unread]),
    ...n.unreadChannels.map((c) => [`channel-${c.channel_id}`, c.unread]),
  ]);
}

// The notifications with one chat taken out (opened from the bell), totals kept in step.
function withoutChat(n, target) {
  const drop = (list, idKey) => list.filter((item) => item[idKey] !== target.id);
  const sum = (list) => list.reduce((total, item) => total + item.unread, 0);
  const groups = target.type === 'group' ? drop(n.unreadGroups, 'group_id') : n.unreadGroups;
  const direct = target.type === 'dm' ? drop(n.unreadDirect, 'user_id') : n.unreadDirect;
  const channels = target.type === 'channel' ? drop(n.unreadChannels, 'channel_id') : n.unreadChannels;
  return {
    ...n,
    unreadGroups: groups, unreadGroupMessages: sum(groups),
    unreadDirect: direct, unreadDirectMessages: sum(direct),
    unreadChannels: channels, unreadChannelMessages: sum(channels),
  };
}

// Which unread chats have been seen in the bell window, and at what unread count:
// { "dm-7": 3, ... }. Kept in this browser per user, so a reload doesn't make
// every old notification count as unseen again (the Spaces dots use it).
const viewedStorageKey = (userId) => `buddytech-viewed-chats-${userId}`;
function loadViewedChats(userId) {
  try { return JSON.parse(localStorage.getItem(viewedStorageKey(userId))) || {}; } catch { return {}; }
}

// Recent Activity times. Message times are real instants (TIMESTAMP columns).
// "just now", "5m ago", "3h ago", then a date.
function timeAgo(value) {
  const minutes = Math.floor((Date.now() - new Date(value).getTime()) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(value).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

// Due dates are wall-clock text: "2026-11-25T14:30:00" from the API, or
// "2026-11-25 14:30:00" for a task just created. Swapping the space for "T" makes
// both standard, and with no "Z" on the end, JavaScript reads them as local time.
// (Same as parseDue in Calendar.jsx.)
const parseDue = (value) => new Date(String(value).replace(' ', 'T'));

// Due dates arrive as wall-clock text ("2026-11-25T14:30:00") and are shown as-is.
function formatDue(value) {
  return new Date(value).toLocaleString([], {
    weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
  });
}

// The sidebar's pages, top to bottom. The highlight slides to the active one.
const NAV_ITEMS = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'spaces', label: 'Spaces', icon: Users },
  { id: 'planner', label: 'Planner', icon: Calendar },
  { id: 'ai', label: 'AI Tools', icon: Sparkles },
  { id: 'resources', label: 'Resources', icon: BookOpen },
  { id: 'settings', label: 'Settings', icon: Settings },
];
const NAV_ROW = 44; // px: height of one sidebar button
const NAV_GAP = 6;  // px: space between buttons

const ACTIVITY_ASSIGNMENT_PREVIEW = 3; // Recent Activity assignments shown before "Show N more"
const ACTIVITY_DAYS_BACK = 2;   // Recent Activity lists assignments due from the start of the day 2 days ago...
const ACTIVITY_DAYS_AHEAD = 7;  // ...through the end of the day 7 days from now
const MESSAGE_PREVIEW = 4; // Recent Activity messages shown before "Show N more"
// One colour per course: the Connected Spaces card stripes and the Recent Activity placards.
const COURSE_ACCENTS = ['#2563eb', '#16a34a', '#d97706', '#db2777'];

export default function Dashboard({ user, onLogout, onUserChange }) {
  const displayName = user?.name || "Student";

  const [tasks, setTasks] = useState([]);
  const [courses, setCourses] = useState([]);
  const [loadError, setLoadError] = useState('');
  const [showNotifications, setShowNotifications] = useState(false);
  
// True while the window plays its fade-out; it stays mounted until that ends.
const [closing, setClosing] = useState(false);

// Temporary sample data until the backend API is available.
const [notifications, setNotifications] = useState({
  friendRequests: [], groupInvites: [], accepted: [], unreadGroups: [], unreadGroupMessages: 0,
  unreadDirect: [], unreadDirectMessages: 0, unreadChannels: [], unreadChannelMessages: 0,
  loginAttempts: []
});
const latestLoad = useRef(0);

// What was in the window the last time the user closed it.
const [seen, setSeen] = useState({ keys: [], unread: 0 });
const bellRef = useRef(null);

// Unread chats seen in the window, by key, at the unread count they had then (see loadViewedChats).
const [viewedChats, setViewedChats] = useState(() => loadViewedChats(user?.id));
useEffect(() => {
  try { localStorage.setItem(viewedStorageKey(user?.id), JSON.stringify(viewedChats)); } catch { /* storage unavailable */ }
}, [user?.id, viewedChats]);

// A chat to open in Spaces (clicked in the bell). A new nonce = a new request.
const [openTarget, setOpenTarget] = useState(null);
const openCount = useRef(0); // nonce source: counts bell clicks

// Load once, then again whenever the server says something changed.
// "connect" also fires after a reconnect, to catch up on anything missed.
useEffect(() => {
  async function loadNotifications() {
    const thisLoad = ++latestLoad.current;
    try {
      const [friendRequests, groupInvites, extra, loginAttempts] = await Promise.all([
        getFriendRequests('incoming'),
        getGroupInvites('incoming'),
        getNotifications(),
        // Its own catch, so a problem here doesn't empty the rest of the bell.
        getLoginAttempts().catch((error) => { console.error('Failed to load sign-in attempts:', error); return []; })
      ]);
      if (thisLoad !== latestLoad.current) return; // a newer load started; drop this one
      const fresh = {
          friendRequests,
          groupInvites,
          accepted: extra.accepted_requests,
          unreadGroups: extra.unread_groups,
          unreadGroupMessages: extra.unread_group_messages,
          unreadDirect: extra.unread_direct,
          unreadDirectMessages: extra.unread_direct_messages,
          unreadChannels: extra.unread_channels,
          unreadChannelMessages: extra.unread_channel_messages,
          loginAttempts
        };
        setNotifications(fresh);
        // Forget seen items that are gone, so a re-sent request or a new message counts as new again.
      const freshKeys = notificationKeys(fresh);
      setSeen((prev) => ({
          keys: prev.keys.filter((key) => freshKeys.includes(key)),
          unread: Math.min(prev.unread, unreadTotal(fresh))
      }));
      // Same for chats: a chat that's been read is forgotten, and one that's partly
      // read keeps the lower count, so any message after that counts as unseen.
      const freshChats = unreadChats(fresh);
      setViewedChats((prev) => Object.fromEntries(Object.entries(prev)
        .filter(([key]) => key in freshChats)
        .map(([key, count]) => [key, Math.min(count, freshChats[key])])));
    } catch (error) {
      console.error('Failed to load notifications:', error);
    }
  }

  loadNotifications();
  const stops = ['friends-changed', 'group-invites-changed', 'group-unread-changed',
    'direct-message', 'dm-unread-changed', 'channel-unread-changed',
    'login-attempt', 'login-attempt-decided', 'connect']
    .map((event) => onSocketEvent(event, loadNotifications));
  return () => stops.forEach((stop) => stop());
}, []);

const handleClearAccepted = async () => {
  try {
    await clearAcceptedNotifications();
    setNotifications((current) => ({ ...current, accepted: [] }));
  } catch (error) {
    console.error(error);
  }
};

// Which row has an accept/decline in flight, e.g. "friendRequests-4" (disables its buttons).
const [busyKey, setBusyKey] = useState(null);

// Accept or decline from the bell. kind is 'friendRequests', 'groupInvites' or 'loginAttempts'.
const handleRespond = async (kind, id, action) => {
  setBusyKey(`${kind}-${id}`);
  try {
    if (kind === 'friendRequests') await respondToFriendRequest(id, action);
    else if (kind === 'loginAttempts') await decideLoginAttempt(id, action === 'accept' ? 'approve' : 'deny');
    else await respondToGroupInvite(id, action);
    // Remove the row right away; the socket event then reloads the real list.
    setNotifications((current) => ({
      ...current,
      [kind]: current[kind].filter((item) => item.id !== id)
    }));
  } catch (error) {
    console.error('Failed to respond:', error);
  } finally {
    setBusyKey(null);
  }
};

// Red dot: something is here that wasn't when the window was last closed.
const hasUnseen =
  notificationKeys(notifications).some((key) => !seen.keys.includes(key)) ||
  unreadTotal(notifications) > seen.unread;
const count = notificationCount(notifications);

// Closing starts the fade-out and marks everything currently in the window as seen.
const closeNotifications = useCallback(() => {
  setClosing(true);
  setSeen({ keys: notificationKeys(notifications), unread: unreadTotal(notifications) });
  setViewedChats(unreadChats(notifications));
}, [notifications]);

// A chat row clicked in the window: close it, take the row out right away (the
// server's events then reload the real list), and open that chat in Spaces.
// Opening a DM or channel marks it read there; a group is marked read here, all
// of its channels, since the row counts them together.
// target: { type: 'dm' | 'group' | 'channel', id, channel?, courseId? }
const openChat = (target) => {
  closeNotifications();
  setNotifications((current) => withoutChat(current, target));
  openCount.current += 1;
  setOpenTarget({ ...target, nonce: openCount.current });
  changeTab('spaces');
  if (target.type === 'group') markGroupRead(target.id).catch((error) => console.error(error));
};

// For the Spaces dots: every unread chat, and whether its notification has been
// seen in the window (with no new messages since).
const chatsUnread = Object.fromEntries(Object.entries(unreadChats(notifications)).map(
  ([key, unread]) => [key, { unread, viewed: (viewedChats[key] ?? 0) >= unread }]));
const groupChannelsUnread = Object.fromEntries(notifications.unreadGroups.map((g) => [g.group_id, g.channels]));
// Per course (for the course row's dot): all its channels' unread together; seen only if every one was.
const coursesUnread = {};
for (const ch of notifications.unreadChannels) {
  const course = (coursesUnread[ch.course_id] ||= { unread: 0, viewed: true });
  course.unread += ch.unread;
  course.viewed = course.viewed && chatsUnread[`channel-${ch.channel_id}`].viewed;
}

// Called by the window when its fade-out has finished.
const finishClose = () => {
  setShowNotifications(false);
  setClosing(false);
};

// While open: close on a click outside the bell + window, or on Escape.
useEffect(() => {
  if (!showNotifications || closing) return;
  function onPointerDown(e) {
    if (bellRef.current && !bellRef.current.contains(e.target)) closeNotifications();
  }
  function onKeyDown(e) {
    if (e.key === 'Escape') closeNotifications();
  }
  document.addEventListener('mousedown', onPointerDown);
  document.addEventListener('keydown', onKeyDown);
  return () => {
    document.removeEventListener('mousedown', onPointerDown);
    document.removeEventListener('keydown', onKeyDown);
  };
}, [showNotifications, closing, closeNotifications]);

  const [newTaskTitle, setNewTaskTitle] = useState('');
  // Tasks playing the check-off animation. They stay on screen until it ends.
  const [leavingIds, setLeavingIds] = useState([]);

  // My Planner: every unfinished task you have, soonest due first; no due date goes last.
  // (Done ones are still on the Planner page.)
  const now = new Date();
  const openTasks = tasks
    .filter((task) => task.status !== 'done')
    .map((task) => ({ ...task, due: task.due_date ? parseDue(task.due_date) : null }))
    .sort((a, b) => {
      if (!a.due || !b.due) return !a.due - !b.due; // true - false = 1: the missing one goes after
      return a.due - b.due;
    });

  const [activeTab, setActiveTab] = useState(() => {
    const savedTab = sessionStorage.getItem('buddytechActiveTab');

    return ['home', 'spaces', 'planner', 'ai', 'resources', 'settings'].includes(savedTab)
      ? savedTab
      : 'home';
  });

  const changeTab = (tab) => {
    sessionStorage.setItem('buddytechActiveTab', tab);
    setActiveTab(tab);
    // Leaving Spaces: forget the bell's last "open this chat", so coming back
    // later doesn't jump to that chat again.
    if (tab !== 'spaces') setOpenTarget(null);
  };

  const activeIndex = NAV_ITEMS.findIndex((item) => item.id === activeTab);

  const handleDashboardLogout = () => {
    sessionStorage.removeItem('buddytechActiveTab');

    if (onLogout) {
      onLogout();
    }
  };

  useEffect(() => {
    async function loadDashboardData() {
      try {
        const [assignments, userCourses] = await Promise.all([
          getMyAssignments(),
          getMyCourses()
        ]);

        setTasks(assignments);
        setCourses(userCourses);
      } catch (error) {
        // Keep tasks/courses as empty arrays so the page still renders.
        console.error('Failed to load dashboard data:', error);
        setLoadError(error.message);
      }
    }

    loadDashboardData();
  }, []);
  // Recent Activity: the newest chats from every kind of space, plus newly posted assignments.
  const [activity, setActivity] = useState({ messages: [], assignments: [] });
  const [showAllMessages, setShowAllMessages] = useState(false);
  const visibleMessages = showAllMessages ? activity.messages : activity.messages.slice(0, MESSAGE_PREVIEW);
  const hiddenMessageCount = activity.messages.length - MESSAGE_PREVIEW;
  // Reload when a DM or study group message arrives. Course channel messages are only
  // pushed to people looking at that channel, so a 60-second refresh covers those.
  
  // Recent Activity assignments: course-wide ones (not personal tasks) due from the start of
  // the day ACTIVITY_DAYS_BACK days ago to the end of the day ACTIVITY_DAYS_AHEAD days from now,
  // soonest first. Done ones stay in place (crossed out), so the list only changes when a
  // new assignment is posted. Built from `tasks`, so check-offs show up instantly.
  const [showAllDueSoon, setShowAllDueSoon] = useState(false);
  const windowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ACTIVITY_DAYS_BACK);
  const windowEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + ACTIVITY_DAYS_AHEAD + 1);
  const dueSoon = tasks
    .filter((task) => task.owner_user_id == null && task.due_date)
    .map((task) => ({ ...task, due: parseDue(task.due_date) }))
    .filter((task) => task.due >= windowStart && task.due < windowEnd)
    .sort((a, b) => a.due - b.due);
  const visibleDueSoon = showAllDueSoon ? dueSoon : dueSoon.slice(0, ACTIVITY_ASSIGNMENT_PREVIEW);
  const hiddenDueSoonCount = dueSoon.length - ACTIVITY_ASSIGNMENT_PREVIEW;

  useEffect(() => {
    let cancelled = false;
    async function loadActivity() {
      try {
        const [data, assignments] = await Promise.all([getActivity(), getMyAssignments()]);
        if (cancelled) return;
        setActivity(data);
        // Pick up assignments posted since the page loaded. Only ids we don't have yet are
        // added, so this never undoes a check-off that's still saving or animating.
        setTasks((current) => {
          const known = new Set(current.map((task) => task.id));
          const added = assignments.filter((assignment) => !known.has(assignment.id));
          return added.length > 0 ? [...current, ...added] : current;
        });
      } catch (error) {
        console.error('Failed to load activity:', error);
      }
    }

    loadActivity();
    const stops = ['direct-message', 'group-unread-changed', 'connect']
      .map((event) => onSocketEvent(event, loadActivity));
    const timer = setInterval(loadActivity, 60000);
    return () => {
      cancelled = true;
      clearInterval(timer);
      stops.forEach((stop) => stop());
    };
  }, []);

  // Checking a task off: start the animation and save at the same time.
  // The task is marked done (which takes it off the list) when the animation ends.
  const completeTask = async (id, previousStatus) => {
    setLeavingIds((ids) => (ids.includes(id) ? ids : [...ids, id]));
    try {
      await updateAssignmentStatus(id, 'done');
    } catch (error) {
      console.error(error);
      // Save failed: stop the animation, or bring the task back if it already left.
      setLeavingIds((ids) => ids.filter((leavingId) => leavingId !== id));
      setTasks((current) => current.map((task) =>
        task.id === id ? { ...task, status: previousStatus } : task
      ));
    }
  };

  // Called when a row's closing animation ends.
  const finishLeaving = (id) => {
    setLeavingIds((ids) => ids.filter((leavingId) => leavingId !== id));
    setTasks((current) => current.map((task) =>
       task.id === id ? { ...task, status: 'done', completed_at: new Date().toISOString() } : task
    ));
  };

  // Un-marking from the Calendar (a premature or accidental check-off): back to 'todo'.
  // Updated on screen first; put back to 'done' if the save fails.
  const reopenTask = async (id) => {
    const before = tasks.find((task) => task.id === id);
    setTasks((current) => current.map((task) =>
      task.id === id ? { ...task, status: 'todo', completed_at: null } : task
    ));
    try {
      await updateAssignmentStatus(id, 'todo');
    } catch (error) {
      console.error(error);
      setTasks((current) => current.map((task) =>
        task.id === id ? { ...task, status: 'done', completed_at: before?.completed_at ?? null } : task
      ));
    }
  };

  const handleAddTask = async (e) => {
    e.preventDefault();

    if (!newTaskTitle.trim()) return;

    const course = courses[0];
    if (!course) return; // user isn't in any course yet

    // Due at the end of today (local time), so a new task doesn't show up already LATE.
    const today = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const dueToday = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())} 23:59:00`;

    try {
      const created = await createAssignment({
        course_id: course.id,
        title: newTaskTitle,
        description: 'Created from BuddyTech dashboard',
        due_date: dueToday
      });

      setTasks((current) => [
        ...current,
        {
          ...created,
          course_code: course.course_code,
          course_name: course.course_name,
          due_date: dueToday
        }
      ]);

      setNewTaskTitle('');
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#f8fafc', fontFamily: 'inherit' }}>
      {/* Sidebar */}
      <aside style={{ width: '240px', flexShrink: 0, background: '#ffffff', borderRight: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', padding: '1.5rem 1rem', position: 'sticky', top: 0, height: '100vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2rem', paddingLeft: '0.5rem' }}>
          <img src="/buddytech.webp" alt="Logo" style={{ height: '32px' }} onError={(e) => e.target.style.display='none'} />
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#1d4ed8' }}>BuddyTech</h2>
        </div>

        <nav style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: NAV_GAP, flex: 1 }}>
          {/* The highlight: one element that slides to the active row. */}
          <span
            aria-hidden="true"
            className="nav-pill"
            style={{ height: NAV_ROW, transform: `translateY(${activeIndex * (NAV_ROW + NAV_GAP)}px)` }}
          />

          {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => changeTab(id)}
              aria-current={activeTab === id ? 'page' : undefined}
              style={{
                position: 'relative', // keeps the button's text above the highlight
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                height: NAV_ROW,
                padding: '0 1rem',
                background: 'transparent',
                color: activeTab === id ? '#1d4ed8' : '#64748b',
                border: 'none',
                borderRadius: '10px',
                fontWeight: activeTab === id ? 600 : 400,
                cursor: 'pointer',
                textAlign: 'left'
              }}
            >
              <Icon size={18} /> {label}
            </button>
          ))}
        </nav>

        {onLogout && (
          <button onClick={handleDashboardLogout} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '0.75rem 1rem', background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}>
            <LogOut size={16} /> Sign Out
          </button>
        )}
      </aside>

      {/* Main Content Area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <header style={{ height: '70px', background: '#ffffff', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 2rem' }}>
          <div style={{ position: 'relative', width: '380px' }}>
            <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
            <input 
              type="text" 
              placeholder="Search your spaces, courses, or study groups..." 
              style={{ width: '100%', padding: '0.6rem 0.6rem 0.6rem 2.4rem', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#f8fafc', fontSize: '0.9rem' }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
            
<div ref={bellRef} style={{ position: 'relative' }}>
  <button
    type="button"
    onClick={() => {
      if (showNotifications && !closing) closeNotifications();
      else { setClosing(false); setShowNotifications(true); }
    }}
    aria-label={hasUnseen && count > 0
      ? `Study partner notifications (${count} new)`
      : 'Study partner notifications'}
    aria-expanded={showNotifications && !closing}
    style={{
      position: 'relative',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'transparent',
      border: 'none',
      cursor: 'pointer',
      padding: '6px',
    }}
  >
    <Bell size={20} color="#64748b" />

    {/* Red pill with the count. Shows when something is new since the window
        was last closed, like the dot did; the number is everything in the window. */}
    {hasUnseen && count > 0 && (
      <span
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: '-3px',
          right: '-6px',
          minWidth: '18px',
          height: '18px',
          padding: '0 5px',
          boxSizing: 'border-box',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#ef4444',
          color: '#ffffff',
          fontSize: '0.7rem',
          fontWeight: 700,
          lineHeight: 1,
          borderRadius: '9px',
          border: '2px solid white',
        }}
      >
        {count > 99 ? '99+' : count}
      </span>
    )}
  </button>

  {showNotifications && (
    <PartnerNotifications
      notifications={notifications}
      onClearAccepted={handleClearAccepted}
      onRespond={handleRespond}
      onOpenChat={openChat}
      busyKey={busyKey}
      closing={closing}
      onClosed={finishClose}
    />
)}
</div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Avatar
                name={displayName}
                userId={user?.id}
                color={user?.avatar_color}
                hasAvatar={user?.has_avatar}
                refreshKey={user?.avatar_refresh}
                size={38}
              />
              <div style={{ fontSize: '0.85rem' }}>
                <p style={{ fontWeight: 600, margin: 0 }}>{displayName}</p>
                <p style={{ color: '#64748b', margin: 0, fontSize: '0.75rem' }}>{user?.email || "Student Account"}</p>
              </div>
            </div>
          </div>
        </header>

        {/* Content Body */}
        {activeTab === 'spaces' ? (
          <div style={{ padding: '2rem', flex: 1 }}>
            <SpacesChat user={user} unread={chatsUnread} groupChannelsUnread={groupChannelsUnread}
              coursesUnread={coursesUnread} openTarget={openTarget} />
          </div>
        ) : activeTab === 'planner' ? (
          <CalendarView
            assignments={tasks}
            courses={courses}
            onTaskCreated={(task) =>
              setTasks((currentTasks) => [...currentTasks, task])
            }
            onReopenTask={reopenTask}
          />
        ) : activeTab === 'ai' ? (
          <div style={{ padding: '2rem', flex: 1 }}>
            <AITools />
          </div>
        ) : activeTab === 'resources' ? (
          <div style={{ padding: '2rem', flex: 1 }}>
            <Resources user={user} />
          </div>
        ) : activeTab === 'settings' ? (
          <div style={{ padding: '2rem', flex: 1 }}>
             <SettingsPage user={user} onUserChange={onUserChange} />
          </div>
        ) : (
        <div style={{ padding: '2rem', display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)', gap: '2rem' }}>
          {/* Main Column */}
          <div>
            <div style={{ marginBottom: '1.5rem' }}>
              <h1 style={{ fontSize: '1.85rem', fontWeight: 800, color: '#0f172a' }}>
                Welcome back, {displayName} 👋
              </h1>
              <p style={{ color: '#64748b', fontSize: '0.95rem' }}>Here is an overview of your active spaces and tasks.</p>
              {loadError && (
                <p role="alert" style={{ color: '#dc2626', fontSize: '0.9rem' }}>Couldn't load your data: {loadError}</p>
              )}
            </div>

            {/* Planner Section */}
            <div style={{ background: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '1.5rem', marginBottom: '2rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                  <Calendar size={18} color="#2563eb" /> My Planner
                </h3>
                <span style={{ fontSize: '0.85rem', color: '#2563eb', fontWeight: 600, cursor: 'pointer' }}>View all tasks →</span>
              </div>

              {/* Quick Add Demo Input */}
              <form onSubmit={handleAddTask} style={{ display: 'flex', gap: '8px', marginBottom: '1rem' }}>
                <input 
                  type="text" 
                  placeholder="+ Add a new assignment or goal..."
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  style={{ flex: 1, padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '0.85rem' }}
                />
                <button type="submit" style={{ padding: '0.5rem 1rem', background: '#2563eb', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600 }}>
                  Add
                </button>
              </form>

              {/* Tasks List: every unfinished task. Each row brings its own 0.75rem gap
                  (it closes with the row), and the -0.75rem cancels the last one. */}
              {openTasks.length === 0 ? (
                <p style={{ color: '#94a3b8', fontSize: '0.9rem', textAlign: 'center', padding: '1rem' }}>No pending tasks.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', marginBottom: '-0.75rem' }}>
                  {openTasks.map((task) => {
                    const leaving = leavingIds.includes(task.id);
                    const late = task.due !== null && task.due < now; // past due and still not done
                    return (
                      <div
                        key={task.id}
                        className={leaving ? 'task-row leaving' : 'task-row'}
                        onAnimationEnd={(event) => {
                          // The title and bubble animations bubble up here too; wait for the last step.
                          if (event.animationName === 'task-collapse') finishLeaving(task.id);
                        }}
                      >
                        <div className="task-row-inner">
                          <div className="task-bubble" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 1rem', background: '#f8fafc', borderRadius: '10px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                              <span
                                onClick={() => completeTask(task.id, task.status)}
                                style={{
                                  cursor: 'pointer',
                                  color: leaving ? '#10b981' : '#94a3b8'
                                }}
                              >
                                {leaving
                                  ? <CheckSquare size={18} />
                                  : <Square size={18} />
                                }
                              </span>
                              <div>
                                <p style={{ fontWeight: 600, margin: 0, color: '#1e293b' }}>
                                  <span className="task-title">{task.title}</span>
                                </p>
                                  <p style={{ fontSize: '0.8rem', color: late ? '#b91c1c' : '#64748b', margin: 0 }}>
                                  {task.course_code} • {task.due ? `Due ${formatDue(task.due)}` : 'No due date'}
                                </p>
                              </div>
                            </div>
                            {late ? (
                            <span style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.05em', color: '#b91c1c', background: '#fee2e2', padding: '0.25rem 0.6rem', borderRadius: '6px' }}>
                              LATE
                            </span>
                          ) : (
                            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: task.color, background: `${task.color}15`, padding: '0.25rem 0.6rem', borderRadius: '6px' }}>
                              {task.status}
                            </span>
                          )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

            </div>

            {/* Neutral Connected Spaces */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                  <Users size={18} color="#2563eb" /> Connected Spaces
                </h3>
                <span style={{ fontSize: '0.85rem', color: '#2563eb', fontWeight: 600, cursor: 'pointer' }}>+ Browse Spaces</span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
                {courses.map((course, index) => (
                  <div
                    key={course.id}
                    style={{
                      background: '#ffffff',
                      padding: '1.25rem',
                      borderRadius: '12px',
                      border: '1px solid #e2e8f0',
                      borderTop: `4px solid ${COURSE_ACCENTS[index % COURSE_ACCENTS.length]}`
                    }}
                  >
                    <h4 style={{ margin: '0 0 0.4rem 0', color: '#1e293b' }}>
                      {course.course_code}
                    </h4>

                    <p
                      style={{
                        fontSize: '0.8rem',
                        color: '#64748b',
                        margin: '0 0 0.8rem 0'
                      }}
                    >
                      {course.course_name}
                    </p>

                    {course.role === 'teacher' || course.role === 'ta' ? (
                      <span
                        style={{
                          fontSize: '0.75rem',
                          background: '#ede9fe',
                          color: '#5b21b6',
                          padding: '3px 8px',
                          borderRadius: '12px',
                          fontWeight: 600
                        }}
                      >
                        Administrator
                      </span>
                    ) : (
                      <span
                        style={{
                          fontSize: '0.75rem',
                          background: '#dbeafe',
                          color: '#1e40af',
                          padding: '3px 8px',
                          borderRadius: '12px',
                          fontWeight: 600
                        }}
                      >
                        Enrolled
                      </span>
                    )}
                  </div>
                ))}

                {/* Empty State / Join Action */}
                <div style={{ background: '#f8fafc', padding: '1.25rem', borderRadius: '12px', border: '2px dashed #cbd5e1', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', cursor: 'pointer' }}>
                  <FolderPlus size={24} color="#94a3b8" style={{ marginBottom: '6px' }} />
                  <p style={{ fontSize: '0.85rem', fontWeight: 600, color: '#64748b', margin: 0 }}>Join or create a space</p>
                  <p style={{ fontSize: '0.75rem', color: '#94a3b8', margin: 0 }}>Syncs with student enrollment</p>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: AI Quick Actions */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            <div style={{ background: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px', margin: 0 }}>
                  <Sparkles size={16} color="#2563eb" /> AI Quick Actions
                </h3>
                <span style={{ fontSize: '0.75rem', background: '#eff6ff', color: '#2563eb', padding: '2px 8px', borderRadius: '12px', fontWeight: 600 }}>AI Assistant</span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                {[
                  { icon: FileText, title: 'Catch me up', sub: 'Summarize discussions and updates' },
                  { icon: MessageSquare, title: 'Summarize notes', sub: 'Extract key takeaways from discussions' },
                  { icon: BookOpen, title: 'Generate study guide', sub: 'Turn course notes into study outlines' },
                  { icon: HelpCircle, title: 'Practice questions', sub: 'Generate review questions on demand' }
                ].map((action, i) => (
                  <div
                    key={i}
                    onClick={() => changeTab('ai')}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem', borderRadius: '10px', border: '1px solid #f1f5f9', cursor: 'pointer' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <action.icon size={18} color="#2563eb" />
                      <div>
                        <p style={{ fontSize: '0.85rem', fontWeight: 600, margin: 0 }}>{action.title}</p>
                        <p style={{ fontSize: '0.75rem', color: '#64748b', margin: 0 }}>{action.sub}</p>
                      </div>
                    </div>
                    <ChevronRight size={16} color="#94a3b8" />
                  </div>
                ))}
              </div>
            </div>

            {/* Recent Activity */}
            <div style={{ background: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px', margin: 0 }}>
                  <Clock size={16} color="#64748b" /> Recent Activity
                </h3>
              </div>

              {dueSoon.length === 0 && activity.messages.length === 0 && (
                <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.85rem' }}>Nothing new yet.</p>
              )}

              {/* Course assignments due from 2 days ago to 7 days ahead, as placards in their
                  course's colour. Done = crossed out and grey; past due and not done = LATE. */}
              {dueSoon.length > 0 && (
                <>
                  <p className="activity-heading">Assignments due soon</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.1rem' }}>
                    {visibleDueSoon.map((assignment) => {
                      const done = assignment.status === 'done';
                      // Done: late only if it was checked off after the due time.
                      // Not done: late once the due time has passed.
                      const finishedAt = assignment.completed_at ? new Date(assignment.completed_at) : null;
                      const late = done ? finishedAt !== null && finishedAt > assignment.due : assignment.due < now;
                      const courseIndex = courses.findIndex((course) => course.id === assignment.course_id);
                      const accent = done ? '#cbd5e1' : COURSE_ACCENTS[Math.max(courseIndex, 0) % COURSE_ACCENTS.length];
                      return (
                        <button
                          key={assignment.id}
                          type="button"
                          className={done ? 'activity-placard done' : 'activity-placard'}
                          onClick={() => changeTab('planner')}
                          style={{ borderLeft: `4px solid ${accent}` }}
                        >
                          <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.7rem', fontWeight: 700, color: done ? '#94a3b8' : accent }}>
                            {assignment.course_code}
                            {late && <span className="late-pill">LATE</span>}
                          </span>
                          {/* Inner span stays inline (flex children don't), so the line follows each wrapped line of text. */}
                          <span style={{ fontWeight: 600, color: done ? '#94a3b8' : '#1e293b' }}>
                            <span className="placard-title">{assignment.title}</span>
                          </span>
                          <span style={{ fontSize: '0.75rem', color: late ? '#b91c1c' : '#64748b' }}>Due {formatDue(assignment.due)}</span>
                        </button>
                      );
                    })}
                  </div>
                  {hiddenDueSoonCount > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowAllDueSoon((shown) => !shown)}
                      aria-expanded={showAllDueSoon}
                      style={{ display: 'flex', alignItems: 'center', gap: '4px', margin: '-0.5rem auto 1.1rem', background: 'none', border: 'none', color: '#2563eb', fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer' }}
                    >
                      {showAllDueSoon ? 'Show fewer' : `Show ${hiddenDueSoonCount} more`}
                      <ChevronDown size={14} className={showAllDueSoon ? 'expand-chevron open' : 'expand-chevron'} />
                    </button>
                  )}
                </>
              )}

              {/* Latest chats from course spaces, study groups and DMs */}
              {activity.messages.length > 0 && (
                <>
                  <p className="activity-heading">Latest messages</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                    {visibleMessages.map((message) => (
                      <button
                        key={`${message.kind}-${message.id}`}
                        type="button"
                        className="activity-message"
                        onClick={() => changeTab('spaces')}
                      >
                        <Avatar
                          name={message.author_name}
                          userId={message.author_id}
                          color={message.author_avatar_color}
                          hasAvatar={message.author_has_avatar}
                          size={30}
                        />
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', fontSize: '0.8rem' }}>
                            <span className="activity-ellipsis">
                              <strong style={{ color: '#1e293b' }}>{message.author_name}</strong>{' '}
                              <span style={{ color: '#64748b' }}>
                                {message.kind === 'direct' ? 'sent you a message' : `in ${message.place}`}
                              </span>
                            </span>
                            <span style={{ color: '#94a3b8', whiteSpace: 'nowrap' }}>{timeAgo(message.created_at)}</span>
                          </span>
                          <span className="activity-ellipsis" style={{ display: 'block', fontSize: '0.8rem', color: '#475569' }}>
                            {message.content}
                          </span>
                        </span>
                      </button>
                    ))}
                    {hiddenMessageCount > 0 && (
                      <button
                        type="button"
                        onClick={() => setShowAllMessages((shown) => !shown)}
                        style={{ alignSelf: 'center', marginTop: '0.35rem', background: 'none', border: 'none', color: '#2563eb', fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer' }}
                      >
                        {showAllMessages ? 'Show fewer' : `Show ${hiddenMessageCount} more`}
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
        )}
      </div>
    </div>
  );
}