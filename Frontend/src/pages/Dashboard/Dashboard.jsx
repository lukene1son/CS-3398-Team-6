import { useLocation } from 'react-router-dom';
import React, { useEffect, useState, useRef, useCallback } from 'react';
import { 
  Home, Users, Calendar, Sparkles, BookOpen, Settings,
  Bell,
  Clock, CheckSquare, Square, ChevronDown, LogOut, FolderPlus, MessageSquare, Plus, Paperclip, Link2} from 'lucide-react';
import { getMyAssignments, getMyCourses, updateAssignmentStatus, updateCourseColor,
    getFriendRequests, getGroupInvites, getNotifications, clearAcceptedNotifications,
    respondToFriendRequest, respondToGroupInvite, getActivity, markGroupRead,
    getLoginAttempts, decideLoginAttempt} from '../../api';
import {onSocketEvent} from '../../socket';

import SpacesChat from '../../components/chat/SpacesChat';
import SearchBox from '../../components/search/SearchBox';
import PartnerNotifications from '../../components/chat/PartnerNotifications';
import CalendarView from '../Calendar/Calendar';
import AITools from '../AITools';
import Resources from '../Resources/Resources';
import AssignmentsPage from '../Assignments/Assignments';
import SettingsPage from '../SettingsPage';
import Avatar from '../../components/Avatar';
import AnimatedLogo from '../../animation/AnimatedLogo';
import AddTaskModal from '../../components/tasks/AddTaskModal';
import SpaceModal from '../../components/spaces/SpaceModal';
import { useTaskHoverCard } from '../../components/tasks/useTaskHoverCard';
// One colour per course: the Study Spaces card stripes, Recent Activity placards and Spaces course tabs.
import { courseAccent } from '../../utils/courseColors';
// AI Quick Actions icons: each animates while its row (.ai-action) is hovered.
import './pagesAnimation.css';
import './messagesAnimation.css';
import './bookAnimation.css';
import './questionAnimation.css';

// ---------- AI Quick Actions icons (22px). Still pictures until their row is hovered;
// the motion lives in the matching *Animation.css file. ----------

// Catch me up: pages stacking in from the top right (pagesAnimation.css).
// Page 1 is last in the markup, so the newest page draws on top.
function PagesIcon() {
  return (
    <span className="pages-anim" aria-hidden="true">
      <span className="pages-anim__page pages-anim__page--4" />
      <span className="pages-anim__page pages-anim__page--3" />
      <span className="pages-anim__page pages-anim__page--2" />
      <span className="pages-anim__page pages-anim__page--1" />
    </span>
  );
}

// Summarize notes: a white bubble then a smaller blue reply, each written in (messagesAnimation.css).
function MessagesIcon() {
  return (
    <svg className="messages-anim" viewBox="0 0 24 24" aria-hidden="true">
      <g className="messages-anim__b1">
        <path className="messages-anim__shape1" d="M10.3 2.5H19.7A2.8 2.8 0 0 1 22.5 5.3V9.7A2.8 2.8 0 0 1 19.7 12.5H19.4L20.4 15.4L16.6 12.5H10.3A2.8 2.8 0 0 1 7.5 9.7V5.3A2.8 2.8 0 0 1 10.3 2.5Z" />
        <path className="messages-anim__squig messages-anim__squig--in1 messages-anim__s1a" pathLength="1" d="M10.4 6.3q1-1.4 2 0t2 0t2 0t2 0t1.2-.5" />
        <path className="messages-anim__squig messages-anim__squig--in1 messages-anim__s1b" pathLength="1" d="M10.4 9.2q1-1.4 2 0t2 0t1.4-.4" />
      </g>
      <g className="messages-anim__b2">
        <path className="messages-anim__shape2" d="M4 13.2H11A2.5 2.5 0 0 1 13.5 15.7V18.4A2.5 2.5 0 0 1 11 20.9H6L2.9 23.4L3.5 20.6A2.5 2.5 0 0 1 1.5 18.4V15.7A2.5 2.5 0 0 1 4 13.2Z" />
        <path className="messages-anim__squig messages-anim__squig--in2 messages-anim__s2" pathLength="1" d="M4 17.1q.9-1.3 1.8 0t1.8 0t1.8 0t1.4-.4" />
      </g>
    </svg>
  );
}

// Generate study guide: a book drops in, opens, is written in by a pencil, and flies off
// (bookAnimation.css). The pages are HTML boxes; the writing and pencil are SVG on top.
function BookIcon() {
  return (
    <span className="book-anim" aria-hidden="true">
      <span className="book-anim__book">
        <span className="book-anim__page book-anim__page--left" />
        <span className="book-anim__page book-anim__page--right" />
        <svg className="book-anim__writing" viewBox="0 0 24 24">
          <path className="book-anim__squig book-anim__l1" pathLength="1" d="M5 10.6q.9-1.2 1.8 0t1.8 0t1.8 0" />
          <path className="book-anim__squig book-anim__l2" pathLength="1" d="M5 13.6q.9-1.2 1.8 0t1.8 0" />
          <path className="book-anim__squig book-anim__r1" pathLength="1" d="M13.6 10.6q.9-1.2 1.8 0t1.8 0t1.8 0" />
          <path className="book-anim__squig book-anim__r2" pathLength="1" d="M13.6 13.6q.9-1.2 1.8 0t1.8 0" />
        </svg>
      </span>
      <svg className="book-anim__layer" viewBox="0 0 24 24">
        {/* The pencil's tip is its (0, 0), so its keyframes are where the tip touches. */}
        <g className="book-anim__pencil">
          <path className="book-anim__pencil-body" d="M0 0L.9-2.4L5.4-6.9L6.9-5.4L2.4-.9Z" />
          <path className="book-anim__pencil-body" d="M.9-2.4L2.4-.9" />
        </g>
      </svg>
    </span>
  );
}

// Practice questions: a circle and question mark that draw, rock, and rewind (questionAnimation.css).
// The circle's two arcs have sweep-flag 1, so it runs clockwise from the top.
function QuestionIcon() {
  return (
    <svg className="question-anim" viewBox="0 0 24 24" aria-hidden="true">
      <path className="question-anim__ring" pathLength="1" d="M12 3A9 9 0 1 1 12 21A9 9 0 1 1 12 3" />
      <g className="question-anim__mark">
        <path className="question-anim__hook" pathLength="1" d="M9.5 9a2.5 2.5 0 0 1 4.9.8c0 1.7-2.4 2.2-2.4 3.7" />
        <circle className="question-anim__dot" cx="12" cy="16.9" r="1.1" />
      </g>
    </svg>
  );
}

// Posted (course-wide) assignments marked done, out of all posted ones, for one course or
// (courseId omitted) every course combined. Personal tasks aren't "posted", so they don't count.
function assignmentProgress(tasks, courseId) {
  const posted = tasks.filter((task) =>
    task.owner_user_id == null && (courseId === undefined || task.course_id === courseId));
  const done = posted.filter((task) => task.status === 'done').length;
  return { done, total: posted.length, percent: posted.length ? Math.round((done / posted.length) * 100) : 0 };
}

// A progress bar on a see-through track, for the blue/purple progress band.
//   fill:    the bar's colour (white by default; a course colour for the course bars)
//   outline: a white ring round the track, so a course colour close to the gradient still stands out
//   grow:    the bar grows in from empty when the page opens (index.css .progress-bar__fill--grow)
// The width also eases when an assignment is checked off (index.css .progress-bar__fill).
function ProgressBar({ done, total, percent, height, label, fill = '#ffffff', outline = false, grow = false }) {
  return (
    <span
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      aria-valuetext={`${done} of ${total} tasks done`}
      style={{
        display: 'block', width: '100%', height, boxSizing: 'border-box',
        background: 'rgba(255, 255, 255, 0.28)', borderRadius: 999, overflow: 'hidden',
        border: outline ? '2.5px solid #ffffff' : 'none'
      }}
    >
      <span
        className={grow ? 'progress-bar__fill progress-bar__fill--grow' : 'progress-bar__fill'}
        style={{ display: 'block', height: '100%', width: `${percent}%`, background: fill, borderRadius: 999 }}
      />
    </span>
  );
}

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
// Each has its own icon colour; on the active page's pill the icon turns white.
const NAV_ITEMS = [
  { id: 'home', label: 'Home', icon: Home, color: '#2563eb' },
  { id: 'spaces', label: 'Chat', icon: Users, color: '#c4b5fd' }, // the 'spaces' tab: course chats, groups, DMs
  { id: 'assignments', label: 'Tasks', icon: CheckSquare, color: '#86efac' }, // the Assignments page
  { id: 'planner', label: 'Planner', icon: Calendar, color: '#93c5fd' },
  { id: 'ai', label: 'AI Tools', icon: Sparkles, color: '#5eead4' },
  { id: 'resources', label: 'Resources', icon: BookOpen, color: '#fcd34d' },
  { id: 'settings', label: 'Settings', icon: Settings, color: '#94a3b8' },
];
const SIDEBAR_NAVY = '#0f172a'; // the main sidebar's background
const NAV_TEXT = '#cbd5e1';     // a page's label when it isn't the active one
const NAV_ROW = 44; // px: height of one sidebar button
const NAV_GAP = 6;  // px: space between buttons

const ACTIVITY_ASSIGNMENT_PREVIEW = 4; // Recent Activity assignments shown before "Show N more"
const ACTIVITY_DAYS_BACK = 2;   // Recent Activity lists assignments due from the start of the day 2 days ago...
const ACTIVITY_DAYS_AHEAD = 7;  // ...through the end of the day 7 days from now
// Whichever of Current Tasks and Recent Activity comes out shorter is stretched to line up
// their bottoms (see Home's two-column grid); its "Show N more" centres in the extra grey.
const MESSAGE_PREVIEW = 5; // Latest Messages shown before "Show N more"
const ASSIGNMENT_PREVIEW = 7; // Current Tasks shown before "Show N more"

// A row's place in Home's top-down grow-in (index.css, --grow-step). The first `preview`
// rows go in order after `after` earlier rows; rows opened by "Show N more" count from 0
// again, so they don't wait behind the ones already showing.
function growStep(index, preview, after = 0) {
  return index < preview ? after + index : index - preview;
}

// Home's sections (Study Spaces, Current Tasks, AI Quick Actions, Recent Activity) sit on
// rounded grey panels, so the white items inside them stand out from the page.
const PANEL = { background: '#e3e8ef', borderRadius: '18px', padding: '1.25rem' };
// White items on a panel get a soft shadow instead of a border, which would blur into the grey.
const ON_PANEL_SHADOW = '0 1px 2px rgba(15, 23, 42, 0.06)';
// A Current Tasks row's file or link icon, shown when it has at least one: the hover card's
// icon and colours (blue paperclip, purple link) on a small tile. The hover card gives the counts.
const ATTACHMENT_STYLES = {
  file: { Icon: Paperclip, color: '#2563eb', background: '#dbeafe', label: 'Has files' },
  link: { Icon: Link2, color: '#7c3aed', background: '#ede9fe', label: 'Has links' }
};
function AttachmentBadge({ kind, count }) {
  if (!(Number(count) > 0)) return null;
  const { Icon, color, background, label } = ATTACHMENT_STYLES[kind];
  return (
    <span title={label} aria-label={label} style={{ display: 'grid', placeItems: 'center', flexShrink: 0, width: 26, height: 26, borderRadius: 7, background, color }}>
      <Icon size={15} strokeWidth={2.2} aria-hidden="true" />
    </span>
  );
}
// The two pills under the Current Tasks heading (Add task, View all tasks): one height.
const TASK_HEADER_BUTTON = {
  display: 'inline-flex', alignItems: 'center', height: 34, border: 'none', borderRadius: 999,
  font: 'inherit', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap'
};
// px: the Home heading's picture. With its 3px gradient ring and 3px white gap it is 80px
// across, reaching almost down to the Study Spaces heading below it.
const WELCOME_AVATAR = 68;
const STALE_LATE_DAYS = 14;   // unfinished work this many days late drops off Home (it stays on the Planner page)

// Study Spaces cards: at most 3 per row, sharing the left column's width (about 235px
// each on a 1440px screen). The 180px floor drops them to 2, then 1, on narrow screens.
const SPACE_GRID = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(max(180px, calc((100% - 2rem) / 3)), 1fr))',
  gap: '1rem'
};

function ClassColorControl({ course, accent, onSaved }) {
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const color = draft ?? accent.toLowerCase();

  async function save(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const saved = await updateCourseColor(course.id, color);
      onSaved(course.id, saved.color);
      setDraft(null);
    } catch (error) {
      setError(error.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="class-color" onSubmit={save}>
      <label>
        Class color
        <input
          aria-label={`Class color for ${course.course_code}`}
          type="color"
          value={color}
          disabled={saving}
          onChange={(event) => setDraft(event.target.value)}
        />
      </label>
      <button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
      {error && <p role="alert">Couldn’t save class color. {error}</p>}
    </form>
  );
}

export default function Dashboard({ user, onLogout, onUserChange }) {
  const canvasCourseId = useLocation().state?.canvasCourseId;
  const displayName = user?.name || "Student";

  const [tasks, setTasks] = useState([]);
  const [courses, setCourses] = useState([]);
  const [coursesError, setCoursesError] = useState(null);
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

// The bell's ring animation: bumped when a reload finds more notifications than the
// last one did. It's the bell icon's key, so each bump restarts the animation.
// lastNotificationCount is null until the first load, so opening the page doesn't ring.
const [bellRing, setBellRing] = useState(0);
const lastNotificationCount = useRef(null);

// What was in the window the last time the user closed it.
const [seen, setSeen] = useState({ keys: [], unread: 0 });
const bellRef = useRef(null);

// Unread chats seen in the window, by key, at the unread count they had then (see loadViewedChats).
const [viewedChats, setViewedChats] = useState(() => loadViewedChats(user?.id));
useEffect(() => {
  try { localStorage.setItem(viewedStorageKey(user?.id), JSON.stringify(viewedChats)); } catch { /* storage unavailable */ }
}, [user?.id, viewedChats]);

// A chat to open in Spaces (clicked in the bell). A new nonce = a new request.
const [openTarget, setOpenTarget] = useState(() => (
  Number.isSafeInteger(canvasCourseId) && canvasCourseId > 0
    ? { type: 'course', id: canvasCourseId, nonce: 0 }
    : null
));
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
        // Something new came in: ring the bell.
        const freshCount = notificationCount(fresh);
        if (lastNotificationCount.current !== null && freshCount > lastNotificationCount.current) {
          setBellRing((n) => n + 1);
        }
        lastNotificationCount.current = freshCount;
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

// A Study Spaces card on Home: open the Spaces tab on that course.
const openSpace = (courseId) => {
  openCount.current += 1;
  setOpenTarget({ type: 'course', id: courseId, nonce: openCount.current });
  changeTab('spaces');
};

// A Recent Activity message: open the chat it was sent in. The ids come from
// /api/me/activity (target_id, course_id, group_channel); without them (an older
// backend still running) it just opens Spaces.
const openActivityMessage = (message) => {
  const target =
    message.target_id == null ? null :
    message.kind === 'space' ? { type: 'channel', id: message.target_id, courseId: message.course_id } :
    message.kind === 'group' ? { type: 'group', id: message.target_id, channel: message.group_channel } :
    message.kind === 'direct' ? { type: 'dm', id: message.target_id } :
    null;
  if (target) {
    openCount.current += 1;
    setOpenTarget({ ...target, nonce: openCount.current });
  }
  changeTab('spaces');
};

// A search result message: same as a Recent Activity message, but search reports the
// kind as channel / group / dm, so map it to the names above first.
const openSearchMessage = (message) => {
  const kind = message.kind === 'channel' ? 'space' : message.kind === 'dm' ? 'direct' : 'group';
  openActivityMessage({
    kind,
    target_id: message.target_id,
    course_id: message.course_id,
    group_channel: message.channel
  });
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

  const [taskDraft, setTaskDraft] = useState(null);
  // The "Join or create a space" popup. After a join or create, reload the course list
  // so the new space's card appears behind the popup.
  const [showSpaceModal, setShowSpaceModal] = useState(false);
  const refreshCourses = useCallback(() => {
    getMyCourses()
      .then((userCourses) => {
        setCourses(userCourses);
        setCoursesError('');
      })
      .catch((error) => setCoursesError(error.message));
  }, []);

  const handleCourseColorSaved = (courseId, color) => {
    setCourses((current) => current.map((course) =>
      course.id === courseId ? { ...course, color } : course
    ));
  };
  // Tasks playing the check-off animation. They stay on screen until it ends.
  const [leavingIds, setLeavingIds] = useState([]);

  // Current Tasks: every unfinished task you have, soonest due first; no due date goes last.
  // Ones more than STALE_LATE_DAYS late are left off. (Both those and done ones are still on the Planner page.)
  const now = new Date();
  const staleBefore = new Date(now.getTime() - STALE_LATE_DAYS * 24 * 60 * 60 * 1000);
  const openTasks = tasks
    .filter((task) => task.status !== 'done')
    .map((task) => ({ ...task, due: task.due_date ? parseDue(task.due_date) : null }))
    .filter((task) => task.due === null || task.due >= staleBefore)
    .sort((a, b) => {
      if (!a.due || !b.due) return !a.due - !b.due; // true - false = 1: the missing one goes after
      return a.due - b.due;
    });
  // The first ASSIGNMENT_PREVIEW, until "Show N more" opens the rest.
  const [showAllTasks, setShowAllTasks] = useState(false);
  const visibleTasks = showAllTasks ? openTasks : openTasks.slice(0, ASSIGNMENT_PREVIEW);
  const hiddenTaskCount = openTasks.length - ASSIGNMENT_PREVIEW;

  const [activeTab, setActiveTab] = useState(() => {
    if (Number.isSafeInteger(canvasCourseId) && canvasCourseId > 0) return 'spaces';
    const savedTab = sessionStorage.getItem('buddytechActiveTab');

    return ['home', 'spaces', 'assignments', 'planner', 'ai', 'resources', 'settings'].includes(savedTab)
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

    // App sends you to the landing page (App.jsx handleLogout).
    if (onLogout) {
      onLogout();
    }
  };

  useEffect(() => {
    async function loadDashboardData() {
      try {
        setTasks(await getMyAssignments());
      } catch (error) {
        // Keep tasks as an empty array so the page still renders.
        console.error('Failed to load dashboard data:', error);
        setLoadError(error.message);
      }
    }

    loadDashboardData();
    refreshCourses();
  }, [refreshCourses]);
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

  // Checking off or un-marking from the Planner (a click on the task). No row animation
  // there, so it changes on screen at once, and goes back if the save fails.
  const setTaskDone = async (id, done) => {
    const before = tasks.find((task) => task.id === id);
    setTasks((current) => current.map((task) =>
      task.id === id
        ? { ...task, status: done ? 'done' : 'todo', completed_at: done ? new Date().toISOString() : null }
        : task
    ));
    try {
      await updateAssignmentStatus(id, done ? 'done' : 'todo');
    } catch (error) {
      console.error(error);
      setTasks((current) => current.map((task) =>
        task.id === id ? { ...task, status: before?.status ?? 'todo', completed_at: before?.completed_at ?? null } : task
      ));
    }
  };

  // The hover cards' "See full description": the Assignments page, with that task selected
  // (a new nonce each time, so the same task can be opened twice in a row).
  const [assignmentFocus, setAssignmentFocus] = useState(null);
  const openAssignment = (task) => {
    openCount.current += 1;
    setAssignmentFocus({ id: task.id, nonce: openCount.current });
    changeTab('assignments');
  };
  const hoverCard = useTaskHoverCard({ courses, onOpen: openAssignment });

  // Called by the Add Task popup once the task exists (before its files finish uploading).
  const handleTaskCreated = (created, course) => {
    setTasks((current) => [
      ...current,
      { ...created, course_code: course.course_code, course_name: course.course_name }
    ]);
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#f8fafc', fontFamily: 'inherit' }}>
      {activeTab === 'home' && hoverCard.card}
      {taskDraft && (
        <AddTaskModal courses={courses} draft={taskDraft} onClose={() => setTaskDraft(null)} onCreated={handleTaskCreated} />
      )}
      {showSpaceModal && (
        <SpaceModal
          courses={courses}
          onClose={() => setShowSpaceModal(false)}
          onChanged={refreshCourses}
          onOpen={(course) => { setShowSpaceModal(false); openSpace(course.id); }}
        />
      )}
      {/* Sidebar */}
      {/* Navy sidebar (SIDEBAR_NAVY); the nav pill is BuddyTech blue (index.css .nav-pill). */}
      {/* overflowX hidden: nothing in the sidebar may ever scroll it sideways. */}
      <aside style={{ width: '240px', flexShrink: 0, overflowX: 'hidden', background: SIDEBAR_NAVY, borderRight: 'none', display: 'flex', flexDirection: 'column', padding: '1.5rem 1rem', position: 'sticky', top: 0, height: '100vh', overflowY: 'auto' }}>
        {/* The logo, as wide as the nav bubbles below it, its left edge lined up with the Home
            bubble. Builds itself letter by letter when the page loads (AnimatedLogo.jsx). */}
        <div style={{ marginBottom: '2rem' }}>
          <AnimatedLogo white finishPulse={false} />
        </div>

        <nav style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: NAV_GAP, flex: 1 }}>
          {/* The highlight: one element that slides to the active row. */}
          <span
            aria-hidden="true"
            className="nav-pill"
            style={{ height: NAV_ROW, transform: `translateY(${activeIndex * (NAV_ROW + NAV_GAP)}px)` }}
          />

          {NAV_ITEMS.map(({ id, label, icon: Icon, color }) => {
            const active = activeTab === id;
            // Spaces: a red dot while any chat has unread messages (same red as the bell's count).
            const dot = id === 'spaces' && unreadTotal(notifications) > 0;
            return (
              <button
                key={id}
                type="button"
                onClick={() => changeTab(id)}
                aria-current={active ? 'page' : undefined}
                aria-label={dot ? `${label} (unread messages)` : undefined}
                style={{
                  position: 'relative', // keeps the button's text above the highlight
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  height: NAV_ROW,
                  padding: '0 1rem',
                  background: 'transparent',
                  color: active ? '#ffffff' : NAV_TEXT, // white and bold once the pill is on it
                  border: 'none',
                  borderRadius: '10px',
                  fontWeight: active ? 700 : 400,
                  cursor: 'pointer',
                  textAlign: 'left'
                }}
              >
                <Icon size={18} color={active ? '#ffffff' : color} /> {label}
                {dot && (
                  <span aria-hidden="true" style={{ marginLeft: 'auto', width: 8, height: 8, borderRadius: '50%', background: '#ef4444' }} />
                )}
              </button>
            );
          })}
        </nav>

        {/* Profile chip: picture, name and email, just above Sign Out. Long text is cut off with "…".
            A pill like the Recent Activity message bubbles (index.css .activity-message): 8px
            round the avatar, extra right padding so the text clears the round end. Light grey,
            since a white pill wouldn't show on the white sidebar. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '8px 18px 8px 8px', marginBottom: '0.75rem', background: '#f1f5f9', borderRadius: '999px', boxShadow: ON_PANEL_SHADOW }}>
          <Avatar
            name={displayName}
            userId={user?.id}
            color={user?.avatar_color}
            hasAvatar={user?.has_avatar}
            refreshKey={user?.avatar_refresh}
            size={38}
          />
          <div style={{ fontSize: '0.85rem', minWidth: 0 }}>
            <p style={{ fontWeight: 600, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayName}</p>
            <p title={user?.email} style={{ color: '#64748b', margin: 0, fontSize: '0.75rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.email || "Student Account"}</p>
          </div>
        </div>

        {onLogout && (
          <button onClick={handleDashboardLogout} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '0.75rem 1rem', background: '#dc2626', color: '#ffffff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}>
            <LogOut size={16} color="#ffffff" /> Sign Out
          </button>
        )}
      </aside>

      {/* Main Content Area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <header style={{ height: '70px', background: '#ffffff', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 2rem' }}>
          <SearchBox courses={courses} onOpenSpace={openSpace} onOpenAssignment={openAssignment} onOpenMessage={openSearchMessage} />

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
    {/* A new key restarts the ring animation (index.css .bell-icon.ring). */}
    <span key={bellRing} className={bellRing > 0 ? 'bell-icon ring' : 'bell-icon'}>
      <Bell size={20} color="#64748b" />
    </span>

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
          </div>
        </header>

        {/* Content Body */}
        {activeTab === 'spaces' ? (
          // No padding: Spaces fills the whole area under the top bar (SpacesChat sizes itself).
          <div style={{ flex: 1 }}>
            <SpacesChat user={user} courses={courses} coursesError={coursesError}
              onTaskFromMessage={setTaskDraft}
              unread={chatsUnread} groupChannelsUnread={groupChannelsUnread}
              coursesUnread={coursesUnread} openTarget={openTarget}
              />
          </div>
        ) : activeTab === 'assignments' ? (
          <AssignmentsPage
            tasks={tasks}
            courses={courses}
            focus={assignmentFocus}
            onCompleteTask={(id) => setTaskDone(id, true)}
            onReopenTask={(id) => setTaskDone(id, false)}
            onTaskCreated={(task) => setTasks((currentTasks) => [...currentTasks, task])}
            onOpenCourseChat={openSpace}
            onOpenSourceChat={openChat}
          />
        ) : activeTab === 'planner' ? (
          <CalendarView
            assignments={tasks}
            courses={courses}
            onTaskCreated={(task) =>
              setTasks((currentTasks) => [...currentTasks, task])
            }
            onCompleteTask={(id) => setTaskDone(id, true)}
            onReopenTask={(id) => setTaskDone(id, false)}
            onOpenAssignment={openAssignment}
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
        // Two columns: on the left, the welcome panel (welcome, then the progress band), the
        // Study Spaces panel (heading and cards) and Current Tasks; on the right, AI Quick
        // Actions, Latest Messages and Recent Activity, their top level with the welcome panel's.
        // While no list is expanded, both columns stretch to the taller one's height and the
        // bottom panels (Current Tasks, Recent Activity) grow to fill it, so their bottoms
        // line up. Once a "Show N more" is open, each column is just as tall as its content,
        // so the other panel doesn't grow a big empty space to match.
        <div style={{ padding: '2rem 2rem 4rem', display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)', columnGap: '2rem', alignItems: showAllTasks || showAllDueSoon || showAllMessages ? 'start' : 'stretch' }}>
          {/* Left column */}
          <div style={{ gridColumn: 1, gridRow: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
           {/* Welcome panel: the welcome, then the progress band. */}
           <div style={{ ...PANEL, marginBottom: '1.5rem' }}>
          <div style={{ marginBottom: '1rem' }}>
            {/* Picture on the left in a ring (the progress band's blue-to-purple gradient, then
                a white gap), the text beside it, centred on it. */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <span
                aria-hidden="true"
                style={{ display: 'flex', flexShrink: 0, padding: 3, borderRadius: '50%', background: 'linear-gradient(135deg, #2563eb, #7c3aed)', boxShadow: '0 2px 6px rgba(15, 23, 42, 0.12)' }}
              >
                <span style={{ display: 'flex', padding: 3, borderRadius: '50%', background: '#ffffff' }}>
                  <Avatar
                    name={displayName}
                    userId={user?.id}
                    color={user?.avatar_color}
                    hasAvatar={user?.has_avatar}
                    refreshKey={user?.avatar_refresh}
                    size={WELCOME_AVATAR}
                  />
                </span>
              </span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: 0 }}>
                <h1 style={{ fontSize: '1.85rem', fontWeight: 800, color: '#0f172a', lineHeight: 1.15, margin: 0 }}>
                  Welcome back, {displayName}{' '}
                  {/* Waves once when Home opens (index.css .welcome-wave). ✋, not 👋: the 👋
                      emoji has motion lines drawn into it, which would swing with the hand.
                      Each SVG draws two arcs of our own, at the fingertips (top right) and the
                      heel of the hand (bottom left), like 👋's; they ripple out with each swing. */}
                  <span className="welcome-wave-wrap" aria-hidden="true">
                    <span className="welcome-wave">✋</span>
                    {['right', 'left'].map((side) => (
                      <svg key={side} className={`welcome-wave-lines welcome-wave-lines--${side}`} viewBox="0 0 16 20" fill="none" stroke="#3b82f6" strokeWidth="2.2" strokeLinecap="round">
                        <path className="welcome-wave-line" d="M2 5 Q6.5 10 2 15" />
                        <path className="welcome-wave-line welcome-wave-line--outer" d="M7 2 Q13.5 10 7 18" />
                      </svg>
                    ))}
                  </span>
                </h1>
                <p style={{ color: '#64748b', fontSize: '0.95rem', lineHeight: 1.4, margin: 0 }}>Here is an overview of your active spaces and tasks.</p>
              </div>
            </div>
            {(loadError || coursesError) && (
              <p role="alert" style={{ color: '#dc2626', fontSize: '0.9rem' }}>Couldn't load your data: {loadError || coursesError}</p>
            )}
          </div>

            {/* Progress band: overall progress, then one bar per course. The course bars use
                the cards' grid (SPACE_GRID), so each lines up with its course's card in the
                Study Spaces panel below. Padding matches the cards' (1rem), so each bar starts
                where its card's text does. */}
            {(() => {
              const overall = assignmentProgress(tasks);
              return (
                <section
                  // Re-made once the assignments arrive, so the course bars' grow-in plays
                  // with the real numbers (not from 0 to 0 while still loading).
                  key={tasks.length > 0 ? 'loaded' : 'loading'}
                  aria-label="Assignment progress"
                  style={{ padding: '1rem 0', borderRadius: '14px', background: 'linear-gradient(90deg, #2563eb, #7c3aed)', color: '#ffffff', display: 'flex', flexDirection: 'column', gap: '0.9rem' }}
                >
                  <div style={{ padding: '0 1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '0.75rem', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '0.9rem', fontWeight: 700 }}>Overall progress</span>
                      <span style={{ fontSize: '0.8rem', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                        {overall.done} of {overall.total} tasks done · {overall.percent}%
                      </span>
                    </div>
                    <ProgressBar {...overall} height={10} grow label="Overall progress" />
                  </div>

                  <div style={SPACE_GRID}>
                    {courses.map((course) => {
                      const progress = assignmentProgress(tasks, course.id);
                      return (
                        <div key={course.id} style={{ minWidth: 0, padding: '0 1rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', fontWeight: 700, minWidth: 0 }}>
                              {/* A lighter version of the course colour, so it shows up on the gradient. */}
                              <span aria-hidden="true" style={{ width: 9, height: 9, flexShrink: 0, borderRadius: '50%', background: `color-mix(in srgb, ${courseAccent(courses, course.id)} 45%, #ffffff)`, boxShadow: '0 0 0 2px #ffffff' }} />
                              <span className="space-ellipsis">{course.course_code}</span>
                            </span>
                            <span style={{ fontSize: '0.7rem', fontWeight: 600, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                              {progress.total ? `${progress.done}/${progress.total} done` : 'No assignments'}
                            </span>
                          </div>
                          {/* In the course's colour, outlined in white, growing in when the page opens. */}
                          <ProgressBar {...progress} height={10} fill={courseAccent(courses, course.id)} outline grow label={`${course.course_code} tasks done`} />
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            })()}
           </div>

           {/* Study Spaces panel: the heading, then one card per course; clicking a card opens
               that course in Spaces. */}
           <div style={{ ...PANEL, marginBottom: '1.5rem' }}>
            {/* The heading is as wide as the card grid, so "+ Join or create" sits over the third card. */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 id="study-spaces-heading" style={{ fontSize: '1.1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                <Users size={18} color="#2563eb" /> Study Spaces
              </h3>
              <button
                type="button"
                onClick={() => setShowSpaceModal(true)}
                style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', fontSize: '0.85rem', color: '#2563eb', fontWeight: 600, cursor: 'pointer' }}
              >
                + Join or create
              </button>
            </div>
            <section aria-labelledby="study-spaces-heading">
              <div style={SPACE_GRID}>
              {courses.map((course) => {
                const accent = courseAccent(courses, course.id);
                const staff = course.role === 'teacher' || course.role === 'ta';
                const unread = coursesUnread[course.id]?.unread ?? 0;
                const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
                return (
                  <div key={course.id} style={{ minWidth: 0 }}>
                    <button
                      type="button"
                      className="space-card"
                      onClick={() => openSpace(course.id)}
                      style={{
                        minWidth: 0, width: '100%', display: 'flex', flexDirection: 'column', gap: '0.4rem',
                        padding: '0.6rem 1rem', background: '#ffffff', textAlign: 'left', font: 'inherit', cursor: 'pointer',
                        border: 'none', borderTop: `4px solid ${accent}`, borderRadius: '12px', boxShadow: ON_PANEL_SHADOW
                      }}
                    >
                      {/* Line 1: code and name */}
                      <span style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', minWidth: 0, width: '100%' }}>
                        <strong style={{ fontSize: '1rem', color: '#1e293b', whiteSpace: 'nowrap' }}>{course.course_code}</strong>
                        <span className="space-ellipsis" style={{ fontSize: '0.8rem', color: '#64748b' }}>{course.course_name}</span>
                      </span>
                      {/* Line 2: counts */}
                      <span className="space-ellipsis" style={{ width: '100%', fontSize: '0.75rem', color: '#475569' }}>
                        {plural(course.channel_count, 'channel')} · {plural(course.group_count, 'group')} · {plural(course.member_count, 'member')}
                      </span>
                      {/* Line 3: badges; wraps if a course collects more than fit */}
                      <span style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                        <span className="space-badge" style={staff
                          ? { background: '#ede9fe', color: '#5b21b6' }
                          : { background: '#dbeafe', color: '#1e40af' }}>
                          {staff ? 'Administrator' : 'Enrolled'}
                        </span>
                        {unread > 0 && (
                          <span className="space-badge" style={{ background: accent, color: '#ffffff', fontWeight: 700 }}>
                            {unread > 99 ? '99+' : unread} new
                          </span>
                        )}
                      </span>
                    </button>
                    {course.role === 'student' && (
                      <ClassColorControl course={course} accent={accent} onSaved={handleCourseColorSaved} />
                    )}
                  </div>
                );
              })}

                {/* The grid's next slot, so it's the same size as a card: beside the courses
                    when a row has room, on a new row after every third course. */}
                <button type="button" onClick={() => setShowSpaceModal(true)} style={{
                  minWidth: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                  padding: '0.6rem 0.9rem', background: 'rgba(255, 255, 255, 0.55)', border: '2px dashed #94a3b8', borderRadius: '12px',
                  color: '#475569', font: 'inherit', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer'
                }}>
                  <FolderPlus size={18} color="#64748b" /> Join or create a space
                </button>
              </div>
            </section>
           </div>

            {/* Current Tasks panel: grows to line up with Recent Activity's bottom (see above).
                Its old 2rem gap below is now the page's bottom padding, so both columns end evenly.
                A flex column, so "Show N more" can take the space left at the bottom. */}
            <div style={{ ...PANEL, flex: 1, display: 'flex', flexDirection: 'column' }}>
              {/* "Current Tasks" on the left; Add task (opens the popup) and View all tasks side by
                  side on the right, on the heading's line. The pills share one height
                  (TASK_HEADER_BUTTON). Wraps under the heading on narrow screens. */}
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '0.6rem', marginBottom: '1.25rem' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                  <Calendar size={18} color="#2563eb" /> Current Tasks
                </h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <button
                  type="button"
                  className="add-task-button"
                  onClick={() => setTaskDraft({})}
                  disabled={courses.length === 0}
                  title={courses.length === 0 ? 'Join a Study Space to add tasks' : undefined}
                >
                  <Plus size={15} strokeWidth={2.6} /> Add task
                </button>
                <button
                  type="button"
                  onClick={() => changeTab('assignments')}
                  style={{ ...TASK_HEADER_BUTTON, padding: '0 0.95rem', background: '#ffffff', color: '#2563eb', boxShadow: ON_PANEL_SHADOW }}
                >
                  View all tasks →
                </button>
                </div>
              </div>
              {/* Tasks List: unfinished tasks, the first ASSIGNMENT_PREVIEW until expanded. Each row
                  brings its own 0.75rem gap (it closes with the row), and the -0.75rem cancels the last one. */}
              {openTasks.length === 0 ? (
                <p style={{ color: '#94a3b8', fontSize: '0.9rem', textAlign: 'center', padding: '1rem' }}>No pending tasks.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', marginBottom: '-0.75rem' }}>
                  {visibleTasks.map((task, index) => {
                    const leaving = leavingIds.includes(task.id);
                    const late = task.due !== null && task.due < now; // past due and still not done
                    // Its class's colour: a stripe down the left, and the checkbox and course code.
                    const accent = courseAccent(courses, task.course_id);
                    return (
                      <div
                        key={task.id}
                        className={leaving ? 'task-row leaving' : 'task-row'}
                        style={{ '--grow-step': growStep(index, ASSIGNMENT_PREVIEW) }}
                        onAnimationEnd={(event) => {
                          // The title and bubble animations bubble up here too; wait for the last step.
                          if (event.animationName === 'task-collapse') finishLeaving(task.id);
                        }}
                      >
                        <div className="task-row-inner">
                          <div className="task-bubble" {...hoverCard.bind(task)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 1rem', background: '#ffffff', borderLeft: `4px solid ${accent}`, borderRadius: '10px', boxShadow: ON_PANEL_SHADOW }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                              <span
                                onClick={() => {
                                  hoverCard.close(); // the row is about to slide away under it
                                  completeTask(task.id, task.status);
                                }}
                                style={{
                                  cursor: 'pointer',
                                  color: leaving ? '#10b981' : accent
                                }}
                              >
                                {leaving
                                  ? <CheckSquare size={18} />
                                  : <Square size={18} />
                                }
                              </span>
                              <div>
                                {/* The title, then its file and link icons (if it has any) beside it. */}
                                <p style={{ fontWeight: 600, margin: 0, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
                                  <span className="task-title">{task.title}</span>
                                  <AttachmentBadge kind="file" count={task.file_count} />
                                  <AttachmentBadge kind="link" count={task.link_count} />
                                </p>
                                  <p style={{ fontSize: '0.8rem', color: late ? '#b91c1c' : '#64748b', margin: 0 }}>
                                  <span style={{ color: accent, fontWeight: 700 }}>{task.course_code}</span> • {task.due ? `Due ${formatDue(task.due)}` : 'No due date'}
                                </p>
                              </div>
                            </div>
                            {late ? (
                            <span style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.05em', color: '#b91c1c', background: '#fee2e2', padding: '0.25rem 0.6rem', borderRadius: '6px' }}>
                              LATE
                            </span>
                          ) : (
                            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: accent, background: `${accent}1f`, padding: '0.25rem 0.6rem', borderRadius: '6px' }}>
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

              {/* Same "Show N more" dropdown as Recent Activity, centred in the grey left below
                  the tasks: the box takes the leftover height and centres the button in it.
                  Its 1.25rem top padding matches the panel's bottom padding, so the space
                  above and below the button come out equal. */}
              {hiddenTaskCount > 0 && (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', paddingTop: '1.25rem' }}>
                  <button
                    type="button"
                    onClick={() => setShowAllTasks((shown) => !shown)}
                    aria-expanded={showAllTasks}
                    style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'none', border: 'none', color: '#2563eb', fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer' }}
                  >
                    {showAllTasks ? 'Show fewer' : `Show ${hiddenTaskCount} more`}
                    <ChevronDown size={14} className={showAllTasks ? 'expand-chevron open' : 'expand-chevron'} />
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Right column: the AI Quick Actions and Recent Activity panels, level with the welcome panel */}
          <div style={{ gridColumn: 2, gridRow: 1, display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div style={PANEL}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px', margin: 0 }}>
                  <Sparkles size={16} color="#2563eb" /> AI Quick Actions
                </h3>
                <span style={{ fontSize: '0.75rem', background: '#ffffff', color: '#2563eb', padding: '2px 8px', borderRadius: '12px', fontWeight: 600 }}>AI Assistant</span>
              </div>

              {/* Two compact tiles per row. Each shows its icon and title; the longer
                  description is the tile's tooltip. */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0.6rem' }}>
                {[
                  { icon: PagesIcon, title: 'Catch me up', sub: 'Summarize discussions and updates' },
                  { icon: MessagesIcon, title: 'Summarize notes', sub: 'Extract key takeaways from discussions' },
                  { icon: BookIcon, title: 'Generate study guide', sub: 'Turn course notes into study outlines' },
                  { icon: QuestionIcon, title: 'Practice questions', sub: 'Generate review questions on demand' }
                ].map((action, i) => (
                  <div
                    key={i}
                    className="ai-action" // hovering plays its icon's animation (*Animation.css)
                    onClick={() => changeTab('ai')}
                    title={action.sub}
                    style={{ minWidth: 0, minHeight: '64px', boxSizing: 'border-box', display: 'flex', alignItems: 'center', gap: '10px', padding: '0.9rem 0.75rem', borderRadius: '10px', boxShadow: ON_PANEL_SHADOW, cursor: 'pointer' }}
                  >
                    <action.icon />
                    <p style={{ fontSize: '0.85rem', fontWeight: 600, margin: 0, lineHeight: 1.25, minWidth: 0 }}>{action.title}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Latest Messages panel: the newest chats from course spaces, study groups and DMs,
                above Recent Activity so they're easy to spot. */}
            <div style={PANEL}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px', margin: 0 }}>
                  <MessageSquare size={16} color="#64748b" /> Latest Messages
                </h3>
              </div>
              {activity.messages.length === 0 ? (
                <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.85rem' }}>No messages yet.</p>
              ) : (
                <>
                  {/* Grow-in rows (index.css .grow-in-row), first in the column's sequence;
                      Recent Activity's placards carry on after them. */}
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {visibleMessages.map((message, index) => (
                      <div
                        key={`${message.kind}-${message.id}`}
                        className="grow-in-row"
                        style={{ '--grow-step': growStep(index, MESSAGE_PREVIEW) }}
                      >
                      <div className="grow-in-cell">
                      <button
                        type="button"
                        className="activity-message grow-in-item"
                        onClick={() => openActivityMessage(message)}
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
                      </div>
                      </div>
                    ))}
                    {hiddenMessageCount > 0 && (
                      <button
                        type="button"
                        onClick={() => setShowAllMessages((shown) => !shown)}
                        style={{ alignSelf: 'center', marginTop: '0.85rem', background: 'none', border: 'none', color: '#2563eb', fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer' }}
                      >
                        {showAllMessages ? 'Show fewer' : `Show ${hiddenMessageCount} more`}
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Recent Activity panel: grows to line up with Current Tasks' bottom (see above).
                A flex column, so "Show N more" can take the space left at the bottom. */}
            <div style={{ ...PANEL, flex: 1, display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px', margin: 0 }}>
                  <Clock size={16} color="#64748b" /> Recent Activity
                </h3>
              </div>

              {dueSoon.length === 0 && (
                <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.85rem' }}>Nothing due soon.</p>
              )}

              {/* Course assignments due from 2 days ago to 7 days ahead, as placards in their
                  course's colour. Done = crossed out and grey; past due and not done = LATE. */}
              {dueSoon.length > 0 && (
                <>
                  {/* Each placard in a grow-in row (index.css .grow-in-row), which also makes the
                      0.5rem gaps between them. They carry on the sequence after the messages
                      showing in Latest Messages above (at most MESSAGE_PREVIEW of them). */}
                  <div>
                    {visibleDueSoon.map((assignment, index) => {
                      const done = assignment.status === 'done';
                      // Done: late only if it was checked off after the due time.
                      // Not done: late once the due time has passed.
                      const finishedAt = assignment.completed_at ? new Date(assignment.completed_at) : null;
                      const late = done ? finishedAt !== null && finishedAt > assignment.due : assignment.due < now;
                      const accent = done ? '#cbd5e1' : courseAccent(courses, assignment.course_id);
                      return (
                        <div key={assignment.id} className="grow-in-row" style={{ '--grow-step': growStep(index, ACTIVITY_ASSIGNMENT_PREVIEW, Math.min(activity.messages.length, MESSAGE_PREVIEW)) }}>
                        <div className="grow-in-cell">
                        <button
                          type="button"
                          className={done ? 'activity-placard done grow-in-item' : 'activity-placard grow-in-item'}
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
                        </div>
                        </div>
                      );
                    })}
                  </div>
                  {/* Centred in the grey left below the placards, like Current Tasks' one: the
                      box takes the leftover height and centres the button in it, and its
                      1.25rem top padding matches the panel's bottom padding. */}
                  {hiddenDueSoonCount > 0 && (
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', paddingTop: '1.25rem' }}>
                      <button
                        type="button"
                        onClick={() => setShowAllDueSoon((shown) => !shown)}
                        aria-expanded={showAllDueSoon}
                        style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'none', border: 'none', color: '#2563eb', fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer' }}
                      >
                        {showAllDueSoon ? 'Show fewer' : `Show ${hiddenDueSoonCount} more`}
                        <ChevronDown size={14} className={showAllDueSoon ? 'expand-chevron open' : 'expand-chevron'} />
                      </button>
                    </div>
                  )}
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
