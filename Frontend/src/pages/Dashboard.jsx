import React, { useEffect, useState, useRef, useCallback } from 'react';
import { 
  Home, Users, Calendar, Sparkles, BookOpen, Settings,
  Search, Bell, FileText, MessageSquare, HelpCircle, 
  Clock, CheckSquare, Square, ChevronRight, LogOut, FolderPlus
} from 'lucide-react';
import { getMyAssignments, getMyCourses, updateAssignmentStatus, createAssignment,
    getFriendRequests, getGroupInvites, getNotifications, clearAcceptedNotifications,
    respondToFriendRequest, respondToGroupInvite, getActivity} from '../api';
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
  ];
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

// Home page look: soft card shadows, coloured status pills, course colour stripes.
const CARD_SHADOW = '0 1px 2px rgba(15, 23, 42, 0.04), 0 6px 20px rgba(15, 23, 42, 0.06)';
const cardStyle = {
  background: '#ffffff',
  borderRadius: '16px',
  border: '1px solid #eef2f7',
  boxShadow: CARD_SHADOW,
  padding: '1.5rem'
};
const STATUS_PILLS = {
  done: { label: 'Done', color: '#15803d', background: '#dcfce7' },
  in_progress: { label: 'In progress', color: '#b45309', background: '#fef3c7' },
  todo: { label: 'To do', color: '#475569', background: '#f1f5f9' }
};
const PLANNER_PREVIEW = 5; // tasks shown before "Show N more"
const MESSAGE_PREVIEW = 4; // Recent Activity messages shown before "Show N more"
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
  friendRequests: [], groupInvites: [], accepted: [], unreadGroups: [], unreadGroupMessages: 0
});
const latestLoad = useRef(0);

// What was in the window the last time the user closed it.
const [seen, setSeen] = useState({ keys: [], unread: 0 });
const bellRef = useRef(null);

// Load once, then again whenever the server says something changed.
// "connect" also fires after a reconnect, to catch up on anything missed.
useEffect(() => {
  async function loadNotifications() {
    const thisLoad = ++latestLoad.current;
    try {
      const [friendRequests, groupInvites, extra] = await Promise.all([
        getFriendRequests('incoming'),
        getGroupInvites('incoming'),
        getNotifications()
      ]);
      if (thisLoad !== latestLoad.current) return; // a newer load started; drop this one
      const fresh = {
          friendRequests,
          groupInvites,
          accepted: extra.accepted_requests,
          unreadGroups: extra.unread_groups,
          unreadGroupMessages: extra.unread_group_messages
        };
        setNotifications(fresh);
        // Forget seen items that are gone, so a re-sent request or a new message counts as new again.
      const freshKeys = notificationKeys(fresh);
      setSeen((prev) => ({
          keys: prev.keys.filter((key) => freshKeys.includes(key)),
          unread: Math.min(prev.unread, fresh.unreadGroupMessages)
      }));
    } catch (error) {
      console.error('Failed to load notifications:', error);
    }
  }

  loadNotifications();
  const stops = ['friends-changed', 'group-invites-changed', 'group-unread-changed', 'connect']
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

// Accept or decline from the bell. kind is 'friendRequests' or 'groupInvites'.
const handleRespond = async (kind, id, action) => {
  setBusyKey(`${kind}-${id}`);
  try {
    if (kind === 'friendRequests') await respondToFriendRequest(id, action);
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
  notifications.unreadGroupMessages > seen.unread;

// Closing starts the fade-out and marks everything currently in the window as seen.
const closeNotifications = useCallback(() => {
  setClosing(true);
  setSeen({ keys: notificationKeys(notifications), unread: notifications.unreadGroupMessages });
}, [notifications]);

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
  const [showAllTasks, setShowAllTasks] = useState(false);

  // Progress banner and planner preview, worked out from tasks on every render.
  const doneCount = tasks.filter((task) => task.status === 'done').length;
  const progress = tasks.length ? Math.round((doneCount / tasks.length) * 100) : 0;
  const visibleTasks = showAllTasks ? tasks : tasks.slice(0, PLANNER_PREVIEW);
  const hiddenCount = tasks.length - PLANNER_PREVIEW;

  const [activeTab, setActiveTab] = useState(() => {
    const savedTab = sessionStorage.getItem('buddytechActiveTab');

    return ['home', 'spaces', 'planner', 'ai', 'resources', 'settings'].includes(savedTab)
      ? savedTab
      : 'home';
  });

  const changeTab = (tab) => {
    sessionStorage.setItem('buddytechActiveTab', tab);
    setActiveTab(tab);
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
  useEffect(() => {
    let cancelled = false;
    async function loadActivity() {
      try {
        const data = await getActivity();
        if (!cancelled) setActivity(data);
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

  const toggleTask = async (id, currentStatus) => {
    const newStatus = currentStatus === 'done' ? 'todo' : 'done';

    try {
      await updateAssignmentStatus(id, newStatus);

      setTasks(tasks.map(task =>
        task.id === id
          ? { ...task, status: newStatus }
          : task
      ));
    } catch (error) {
      console.error(error);
    }
  };

  const handleAddTask = async (e) => {
    e.preventDefault();

    if (!newTaskTitle.trim()) return;

    const course = courses[0];
    if (!course) return; // user isn't in any course yet

    try {
      const created = await createAssignment({
        course_id: course.id,
        title: newTaskTitle,
        description: 'Created from BuddyTech dashboard',
        due_date: '2026-10-01 23:59:00'
      });

      setTasks([
        ...tasks,
        {
          ...created,
          course_code: course.course_code,
          course_name: course.course_name,
          due_date: '2026-10-01T23:59:00.000Z'
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
    aria-label="Study partner notifications"
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

    {hasUnseen && (
      <span
        style={{
          position: 'absolute',
          top: '1px',
          right: '1px',
          width: '9px',
          height: '9px',
          background: '#ef4444',
          borderRadius: '50%',
          border: '2px solid white',
        }}
      />
    )}
  </button>

  {showNotifications && (
    <PartnerNotifications
      notifications={notifications}
      onClearAccepted={handleClearAccepted}
      onRespond={handleRespond}
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
            <SpacesChat user={user} />
          </div>
        ) : activeTab === 'planner' ? (
          <CalendarView
            assignments={tasks}
            courses={courses}
            onTaskCreated={(task) =>
              setTasks((currentTasks) => [...currentTasks, task])
            }
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
            {/* Welcome banner with overall progress */}
            <div className="dash-hero">
              <h1 style={{ fontSize: '1.6rem', fontWeight: 800, color: '#ffffff', margin: 0 }}>
                Welcome back, {displayName} 👋
              </h1>
              <p style={{ color: 'rgba(255, 255, 255, 0.85)', fontSize: '0.95rem', margin: '0.35rem 0 0' }}>
                Here is an overview of your active spaces and tasks.
              </p>

              {tasks.length > 0 && (
                <div style={{ marginTop: '1rem' }}>
                  <div style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.4rem', color: 'rgba(255, 255, 255, 0.9)' }}>
                    {doneCount} of {tasks.length} tasks done · {progress}%
                  </div>
                  <div
                    className="dash-progress"
                    role="progressbar"
                    aria-label="Tasks completed"
                    aria-valuenow={progress}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  >
                    <div className="dash-progress-fill" style={{ width: `${progress}%` }} />
                  </div>
                </div>
              )}
            </div>

            {loadError && (
              <p role="alert" style={{ color: '#dc2626', fontSize: '0.9rem', margin: '0 0 1.5rem' }}>Couldn't load your data: {loadError}</p>
            )}

            {/* Planner Section */}
            <div style={{ ...cardStyle, marginBottom: '2rem' }}>
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

              {/* Tasks List: the first few, with a button for the rest */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {tasks.length === 0 ? (
                  <p style={{ color: '#94a3b8', fontSize: '0.9rem', textAlign: 'center', padding: '1rem' }}>No pending tasks.</p>
                ) : (
                  visibleTasks.map(task => {
                    const pill = STATUS_PILLS[task.status] || STATUS_PILLS.todo;
                    return (
                      <div key={task.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 1rem', background: '#ffffff', border: '1px solid #f1f5f9', borderRadius: '10px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <span
                            onClick={() => toggleTask(task.id, task.status)}
                            style={{
                              cursor: 'pointer',
                              color: task.status === 'done' ? '#10b981' : '#94a3b8'
                            }}
                          >
                            {task.status === 'done'
                              ? <CheckSquare size={18} />
                              : <Square size={18} />
                            }
                          </span>
                          <div>
                            <p style={{ fontWeight: 600, margin: 0, textDecoration: task.status === 'done' ? 'line-through' : 'none', color: task.status === 'done' ? '#94a3b8' : '#1e293b' }}>
                              {task.title}
                            </p>
                            <p style={{ fontSize: '0.8rem', color: '#64748b', margin: 0 }}>{task.course_code} • {task.description}</p>
                          </div>
                        </div>
                        <span style={{ fontSize: '0.8rem', fontWeight: 600, color: pill.color, background: pill.background, padding: '0.3rem 0.7rem', borderRadius: '999px', whiteSpace: 'nowrap' }}>
                          {pill.label}
                        </span>
                      </div>
                    );
                  })
                )}

                {hiddenCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowAllTasks((shown) => !shown)}
                    style={{ alignSelf: 'center', marginTop: '0.25rem', background: 'none', border: 'none', color: '#2563eb', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' }}
                  >
                    {showAllTasks ? 'Show fewer' : `Show ${hiddenCount} more`}
                  </button>
                )}
              </div>
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
                      border: '1px solid #eef2f7',
                      borderTop: `4px solid ${COURSE_ACCENTS[index % COURSE_ACCENTS.length]}`,
                      boxShadow: CARD_SHADOW
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
           <div style={cardStyle}>
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
            <div style={cardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px', margin: 0 }}>
                  <Clock size={16} color="#64748b" /> Recent Activity
                </h3>
              </div>

              {activity.assignments.length === 0 && activity.messages.length === 0 && (
                <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.85rem' }}>Nothing new yet.</p>
              )}

              {/* Newly posted assignments, as placards in their course's colour */}
              {activity.assignments.length > 0 && (
                <>
                  <p className="activity-heading">New assignments</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.1rem' }}>
                    {activity.assignments.map((assignment) => {
                      const courseIndex = courses.findIndex((course) => course.id === assignment.course_id);
                      const accent = COURSE_ACCENTS[Math.max(courseIndex, 0) % COURSE_ACCENTS.length];
                      return (
                        <button
                          key={assignment.id}
                          type="button"
                          className="activity-placard"
                          onClick={() => changeTab('planner')}
                          style={{ borderLeft: `4px solid ${accent}` }}
                        >
                          <span style={{ fontSize: '0.7rem', fontWeight: 700, color: accent }}>{assignment.course_code}</span>
                          <span style={{ fontWeight: 600, color: '#1e293b' }}>{assignment.title}</span>
                          {assignment.due_date && (
                            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Due {formatDue(assignment.due_date)}</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
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