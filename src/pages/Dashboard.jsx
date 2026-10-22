import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Home, Users, Calendar, Sparkles, BookOpen, Settings,
  Search, Bell, FileText, MessageSquare, HelpCircle,
  Clock, CheckSquare, Square, ChevronRight, LogOut, FolderPlus,
  Trash2, CheckCheck
} from 'lucide-react';

import SpacesChat from '../components/SpacesChat';
import AITools from './AITools';
import Resources from './Resources';
import SettingsPage from './SettingsPage';
import { getUserCourses } from '../api';
import './Dashboard.css';

const NAV_ITEMS = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'spaces', label: 'Spaces', icon: Users },
  { id: 'planner', label: 'Planner', icon: Calendar },
  { id: 'ai-tools', label: 'AI Tools', icon: Sparkles },
  { id: 'resources', label: 'Resources', icon: BookOpen },
  { id: 'settings', label: 'Settings', icon: Settings },
];

// "tool" must match an id in AITools.jsx
const QUICK_ACTIONS = [
  { icon: FileText, title: 'Catch me up', sub: 'Summarize discussions and updates', tool: 'summarize' },
  { icon: MessageSquare, title: 'Summarize notes', sub: 'Extract key takeaways from discussions', tool: 'summarize' },
  { icon: BookOpen, title: 'Generate study guide', sub: 'Turn course notes into study outlines', tool: 'explain' },
  { icon: HelpCircle, title: 'Practice questions', sub: 'Generate review questions on demand', tool: 'quiz' },
];

// TODO (backend): replace with GET /api/users/:id/notifications
const INITIAL_NOTIFICATIONS = [
  { id: 1, title: 'New message in CS 3398 #general', body: 'Study Partner: Yeah, I think we just need a basic progress update.', time: '2 min ago', read: false, tab: 'spaces' },
  { id: 2, title: 'Sprint 2 Demo is coming up', body: 'Show current BuddyTech progress.', time: '1 hr ago', read: false, tab: 'planner' },
  { id: 3, title: 'New resource added', body: 'Sprint planning guide was added to CS 3398.', time: 'Yesterday', read: true, tab: 'resources' },
  { id: 4, title: 'Welcome to BuddyTech 👋', body: 'Join a space to start chatting with classmates.', time: '2 days ago', read: true, tab: 'spaces' },
];

// TODO (backend): replace with GET /api/users/:id/assignments (Jack's route already exists)
const INITIAL_TASKS = [
  { id: 1, title: 'Sprint 2 Demo', desc: 'CS 3398 • Show current BuddyTech progress', due: 'Tomorrow', completed: false, color: '#2563eb' },
  { id: 2, title: 'Week 6 Worksheet', desc: 'BIO 1330 • Complete metabolism worksheet', due: 'This Week', completed: false, color: '#8b5cf6' },
  { id: 3, title: 'Account Setup', desc: 'Create account & join your courses', due: 'Completed', completed: true, color: '#10b981' },
];

const CHIP_COLORS = [
  { bg: '#dbeafe', fg: '#1e40af' },
  { bg: '#f3e8ff', fg: '#6b21a8' },
];

const STATUS_LABEL = {
  checking: 'Connecting…',
  online: 'Synced with backend',
  offline: 'Backend offline',
};

export default function Dashboard({ user, onLogout }) {
  const displayName = user?.name || 'Student';
  const userInitial = displayName.charAt(0).toUpperCase();
  const userId = user?.id ?? 1;

  const [activeTab, setActiveTab] = useState('home');
  const [aiTool, setAiTool] = useState(null);

  const [tasks, setTasks] = useState(INITIAL_TASKS);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [filter, setFilter] = useState('all');

  const [courses, setCourses] = useState([]);
  const [backendStatus, setBackendStatus] = useState('checking');

  const [notifications, setNotifications] = useState(INITIAL_NOTIFICATIONS);
  const [notifOpen, setNotifOpen] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);

  const [toast, setToast] = useState('');
  const toastTimer = useRef(null);
  const bellRef = useRef(null);
  const searchRef = useRef(null);

  // Computed once so the greeting doesn't change mid-session
  const [hour] = useState(() => new Date().getHours());
  const [todayLabel] = useState(() =>
    new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })
  );
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  // Load the user's real courses (also tells us if the backend is reachable)
  useEffect(() => {
    let cancelled = false;
    async function loadCourses() {
      try {
        const data = await getUserCourses(userId);
        if (cancelled) return;
        setCourses(data);
        setBackendStatus('online');
      } catch {
        if (!cancelled) setBackendStatus('offline');
      }
    }
    loadCourses();
    return () => { cancelled = true; };
  }, [userId]);

  // Close popovers when clicking outside or pressing Escape
  useEffect(() => {
    function handlePointerDown(e) {
      if (bellRef.current && !bellRef.current.contains(e.target)) setNotifOpen(false);
      if (searchRef.current && !searchRef.current.contains(e.target)) setSearchOpen(false);
    }
    function handleKey(e) {
      if (e.key === 'Escape') {
        setNotifOpen(false);
        setSearchOpen(false);
      }
    }
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKey);
    };
  }, []);

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  /* ---------- helpers ---------- */
  function showToast(message) {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2200);
  }

  function goTo(tab) {
    setAiTool(null);
    setActiveTab(tab);
    setNotifOpen(false);
    setSearchOpen(false);
  }

  function openAITool(tool) {
    setActiveTab('ai-tools');
    setAiTool(tool);
  }

  /* ---------- tasks ---------- */
  const toggleTask = (id) => {
    setTasks(tasks.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t)));
  };

  const deleteTask = (id) => {
    setTasks(tasks.filter((t) => t.id !== id));
    showToast('Task removed');
  };

  const handleAddTask = (e) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;
    setTasks([
      ...tasks,
      { id: Date.now(), title: newTaskTitle.trim(), desc: 'Added by you', due: 'Active', completed: false, color: '#0f766e' },
    ]);
    setNewTaskTitle('');
    showToast('Task added ✓');
  };

  const doneCount = tasks.filter((t) => t.completed).length;
  const activeCount = tasks.length - doneCount;
  const pct = tasks.length ? Math.round((doneCount / tasks.length) * 100) : 0;
  const filteredTasks = tasks.filter((t) =>
    filter === 'all' ? true : filter === 'done' ? t.completed : !t.completed
  );

  /* ---------- notifications ---------- */
  const unreadCount = notifications.filter((n) => !n.read).length;

  const markAllRead = () => setNotifications(notifications.map((n) => ({ ...n, read: true })));

  const openNotification = (n) => {
    setNotifications(notifications.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
    goTo(n.tab);
  };

  /* ---------- search ---------- */
  const query = searchQuery.trim().toLowerCase();
  const searchResults = useMemo(() => {
    if (!query) return [];
    const out = [];
    NAV_ITEMS.forEach((n) => {
      if (n.label.toLowerCase().includes(query)) {
        out.push({ key: `nav-${n.id}`, label: n.label, sub: 'Go to page', tab: n.id, icon: n.icon });
      }
    });
    courses.forEach((c) => {
      if (`${c.course_code} ${c.course_name}`.toLowerCase().includes(query)) {
        out.push({ key: `course-${c.id}`, label: `${c.course_code} ${c.course_name}`, sub: 'Study space', tab: 'spaces', icon: Users });
      }
    });
    tasks.forEach((t) => {
      if (t.title.toLowerCase().includes(query)) {
        out.push({ key: `task-${t.id}`, label: t.title, sub: 'Planner task', tab: 'planner', icon: Calendar });
      }
    });
    return out.slice(0, 6);
  }, [query, courses, tasks]);

  const pickResult = (r) => {
    goTo(r.tab);
    setSearchQuery('');
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (searchResults[0]) pickResult(searchResults[0]);
  };

  /* ---------- reusable pieces (called as functions, not components, so inputs keep focus) ---------- */
  const renderAddForm = () => (
    <form onSubmit={handleAddTask} className="add-task-form">
      <input
        type="text"
        placeholder="+ Add a new assignment or goal..."
        value={newTaskTitle}
        onChange={(e) => setNewTaskTitle(e.target.value)}
        aria-label="New task title"
      />
      <button type="submit" className="btn-blue">Add</button>
    </form>
  );

  const renderTaskList = (list, emptyText) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {list.length === 0 ? (
        <p className="empty-text">{emptyText}</p>
      ) : (
        list.map((task) => (
          <div key={task.id} className="task-row">
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
              <button
                type="button"
                className="task-check"
                style={{ color: task.completed ? '#10b981' : '#94a3b8' }}
                onClick={() => toggleTask(task.id)}
                aria-label={task.completed ? `Mark "${task.title}" as not done` : `Mark "${task.title}" as done`}
              >
                {task.completed ? <CheckSquare size={18} /> : <Square size={18} />}
              </button>
              <div style={{ minWidth: 0 }}>
                <p className="task-title" style={{ textDecoration: task.completed ? 'line-through' : 'none', color: task.completed ? '#94a3b8' : '#1e293b' }}>
                  {task.title}
                </p>
                <p className="task-desc">{task.desc}</p>
              </div>
            </div>
            <div className="task-right">
              <span className="due-chip" style={{ color: task.color, background: `${task.color}15` }}>{task.due}</span>
              <button type="button" className="task-delete" onClick={() => deleteTask(task.id)} aria-label={`Delete ${task.title}`}>
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );

  /* ---------- screens ---------- */
  const renderPlannerPage = () => (
    <div style={{ maxWidth: '800px' }}>
      <h1 className="page-title">My Planner</h1>
      <p className="page-sub">Track assignments, quizzes, and personal goals in one place.</p>

      <div className="card" style={{ marginTop: '1.5rem' }}>
        <div className="progress-head">
          <span>{doneCount} of {tasks.length} complete</span>
          <span>{pct}%</span>
        </div>
        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${pct}%` }} />
        </div>

        <div className="filter-row">
          {[
            { id: 'all', label: `All (${tasks.length})` },
            { id: 'active', label: `Active (${activeCount})` },
            { id: 'done', label: `Done (${doneCount})` },
          ].map((f) => (
            <button
              key={f.id}
              type="button"
              className={`filter-pill ${filter === f.id ? 'active' : ''}`}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>

        {renderAddForm()}
        {renderTaskList(filteredTasks, filter === 'done' ? 'Nothing completed yet.' : 'No tasks here. Add one above!')}
      </div>
    </div>
  );

  const renderHome = () => {
    const spaceCards =
      courses.length > 0
        ? courses.slice(0, 4).map((c, i) => ({
            key: c.id,
            title: `${c.course_code} ${c.course_name}`,
            sub: c.professor ? `Prof. ${c.professor} • Active community` : 'Enrolled course • Active community',
            chip: 'Open chat',
            ...CHIP_COLORS[i % CHIP_COLORS.length],
          }))
        : [
            { key: 'p1', title: 'Course Space 01', sub: 'Enrolled Course • Active Community', chip: 'Click to Chat', ...CHIP_COLORS[0] },
            { key: 'p2', title: 'Collaborative Study Group', sub: 'Peer Learning Group • Open to Members', chip: 'Click to Chat', ...CHIP_COLORS[1] },
          ];

    return (
      <div className="dash-grid">
        {/* Main column */}
        <div>
          <div style={{ marginBottom: '1.5rem' }}>
            <h1 className="page-title">{greeting}, {displayName} 👋</h1>
            <p className="page-sub">
              {todayLabel} • You have {activeCount} active task{activeCount === 1 ? '' : 's'}
              {unreadCount > 0 && ` and ${unreadCount} new notification${unreadCount === 1 ? '' : 's'}`}.
            </p>
          </div>

          {/* Planner preview */}
          <div className="card" style={{ marginBottom: '2rem' }}>
            <div className="section-head">
              <h3><Calendar size={18} color="#2563eb" /> My Planner</h3>
              <button type="button" className="text-link" onClick={() => goTo('planner')}>View all tasks →</button>
            </div>
            {renderAddForm()}
            {renderTaskList(tasks.slice(0, 4), 'No pending tasks.')}
            {tasks.length > 4 && (
              <button type="button" className="text-link" style={{ marginTop: '0.75rem' }} onClick={() => goTo('planner')}>
                +{tasks.length - 4} more
              </button>
            )}
          </div>

          {/* Connected spaces */}
          <div>
            <div className="section-head" style={{ marginBottom: '1rem' }}>
              <h3><Users size={18} color="#2563eb" /> Connected Spaces</h3>
              <button type="button" className="text-link" onClick={() => goTo('spaces')}>+ Open Spaces Chat →</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
              {spaceCards.map((s) => (
                <div key={s.key} className="card card-hover" style={{ padding: '1.25rem', borderRadius: '12px' }} onClick={() => goTo('spaces')}>
                  <h4 style={{ margin: '0 0 0.4rem 0', color: '#1e293b' }}>{s.title}</h4>
                  <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '0 0 0.8rem 0' }}>{s.sub}</p>
                  <span className="chip" style={{ background: s.bg, color: s.fg }}>{s.chip}</span>
                </div>
              ))}

              <div
                className="card-hover"
                onClick={() => goTo('spaces')}
                style={{ background: '#f8fafc', padding: '1.25rem', borderRadius: '12px', border: '2px dashed #cbd5e1', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}
              >
                <FolderPlus size={24} color="#94a3b8" style={{ marginBottom: '6px' }} />
                <p style={{ fontSize: '0.85rem', fontWeight: 600, color: '#64748b', margin: 0 }}>Join or create a space</p>
                <p style={{ fontSize: '0.75rem', color: '#94a3b8', margin: 0 }}>Syncs with student enrollment</p>
              </div>
            </div>
          </div>
        </div>

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          <div className="card">
            <div className="section-head" style={{ marginBottom: '1rem' }}>
              <h3 style={{ fontSize: '1rem' }}><Sparkles size={16} color="#2563eb" /> AI Quick Actions</h3>
              <span className="chip" style={{ background: '#eff6ff', color: '#2563eb' }}>AI Assistant</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              {QUICK_ACTIONS.map((action) => (
                <button key={action.title} type="button" className="action-row" onClick={() => openAITool(action.tool)}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <action.icon size={18} color="#2563eb" />
                    <div>
                      <p style={{ fontSize: '0.85rem', fontWeight: 600, margin: 0, color: '#1e293b' }}>{action.title}</p>
                      <p style={{ fontSize: '0.75rem', color: '#64748b', margin: 0 }}>{action.sub}</p>
                    </div>
                  </div>
                  <ChevronRight size={16} color="#94a3b8" />
                </button>
              ))}
            </div>
          </div>

          <div className="card">
            <div className="section-head" style={{ marginBottom: '1rem' }}>
              <h3 style={{ fontSize: '1rem' }}><Clock size={16} color="#64748b" /> Recent Activity</h3>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.85rem' }}>
              <button type="button" className="activity-row" onClick={() => goTo('spaces')}>
                <p style={{ margin: 0, fontWeight: 600, color: '#1e293b' }}>Space Discussion Activity</p>
                <p style={{ margin: 0, color: '#64748b', fontSize: '0.75rem' }}>New responses in connected space • Recent</p>
              </button>
              <button type="button" className="activity-row" onClick={() => goTo('planner')}>
                <p style={{ margin: 0, fontWeight: 600, color: '#1e293b' }}>Upcoming Schedule Sync</p>
                <p style={{ margin: 0, color: '#64748b', fontSize: '0.75rem' }}>Assignments synced from course schedule</p>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="dash-root">
      {/* Sidebar */}
      <aside className="dash-sidebar" aria-label="Main navigation">
        <div className="dash-brand">
          <img src="/buddytech.webp" alt="" style={{ height: '32px' }} onError={(e) => { e.target.style.display = 'none'; }} />
          <h2 className="brand-text">BuddyTech</h2>
        </div>

        <nav className="dash-nav">
          {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              className={`nav-item ${activeTab === id ? 'active' : ''}`}
              onClick={() => goTo(id)}
              aria-current={activeTab === id ? 'page' : undefined}
              title={label}
            >
              <Icon size={18} /> <span className="nav-label">{label}</span>
            </button>
          ))}
        </nav>

        {onLogout && (
          <button type="button" className="signout-btn" onClick={onLogout} title="Sign Out">
            <LogOut size={16} /> <span className="nav-label">Sign Out</span>
          </button>
        )}
      </aside>

      {/* Main */}
      <div className="dash-main">
        <header className="dash-header">
          {/* Search */}
          <div className="search-wrap" ref={searchRef}>
            <form onSubmit={handleSearchSubmit} role="search">
              <Search size={18} className="search-icon" />
              <input
                type="text"
                className="search-input"
                placeholder="Search your spaces, courses, or tasks..."
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setSearchOpen(true); }}
                onFocus={() => setSearchOpen(true)}
                aria-label="Search"
              />
            </form>

            {searchOpen && query && (
              <div className="popover popover-left">
                {searchResults.length === 0 ? (
                  <p className="popover-empty">No matches for “{searchQuery.trim()}”</p>
                ) : (
                  searchResults.map((r) => (
                    <button key={r.key} type="button" className="result-row" onClick={() => pickResult(r)}>
                      <r.icon size={16} color="#2563eb" />
                      <div>
                        <p className="result-title">{r.label}</p>
                        <p className="result-sub">{r.sub}</p>
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          <div className="header-right">
            <span className={`status-pill ${backendStatus}`} title="Shows whether the frontend can reach the backend API">
              <span className="status-dot" /> {STATUS_LABEL[backendStatus]}
            </span>

            {/* Notifications */}
            <div className="bell-wrap" ref={bellRef}>
              <button
                type="button"
                className="icon-btn"
                onClick={() => { setNotifOpen(!notifOpen); setSearchOpen(false); }}
                aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`}
                aria-expanded={notifOpen}
              >
                <Bell size={20} />
                {unreadCount > 0 && <span className="badge-dot">{unreadCount}</span>}
              </button>

              {notifOpen && (
                <div className="popover popover-right">
                  <div className="popover-head">
                    <span>Notifications</span>
                    <button type="button" className="link-action" onClick={markAllRead} disabled={unreadCount === 0}>
                      <CheckCheck size={14} /> Mark all read
                    </button>
                  </div>

                  {notifications.length === 0 ? (
                    <p className="popover-empty">You’re all caught up 🎉</p>
                  ) : (
                    <div style={{ maxHeight: '360px', overflowY: 'auto' }}>
                      {notifications.map((n) => (
                        <button key={n.id} type="button" className={`result-row ${n.read ? '' : 'unread'}`} onClick={() => openNotification(n)} style={{ alignItems: 'flex-start' }}>
                          <span className="unread-dot" style={{ visibility: n.read ? 'hidden' : 'visible', marginTop: '6px' }} />
                          <div style={{ minWidth: 0 }}>
                            <p className="result-title">{n.title}</p>
                            <p className="result-sub">{n.body}</p>
                            <p className="result-sub" style={{ color: '#94a3b8', marginTop: '2px' }}>{n.time}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}

                  <div style={{ padding: '0.6rem 1rem', borderTop: '1px solid #f1f5f9', textAlign: 'center' }}>
                    <button type="button" className="link-action" onClick={() => goTo('settings')}>Notification settings</button>
                  </div>
                </div>
              )}
            </div>

            <div className="user-chip">
              <div className="avatar">{userInitial}</div>
              <div className="user-meta" style={{ fontSize: '0.85rem' }}>
                <p style={{ fontWeight: 600, margin: 0 }}>{displayName}</p>
                <p style={{ color: '#64748b', margin: 0, fontSize: '0.75rem' }}>{user?.email || 'Student Account'}</p>
              </div>
            </div>
          </div>
        </header>

        {/* key={activeTab} replays the fade-in whenever you switch tabs */}
        <main className="dash-content fade-in" key={activeTab}>
          {activeTab === 'home' && renderHome()}
          {activeTab === 'spaces' && <SpacesChat user={user} />}
          {activeTab === 'planner' && renderPlannerPage()}
          {activeTab === 'ai-tools' && <AITools key={aiTool ?? 'default'} initialTool={aiTool} />}
          {activeTab === 'resources' && <Resources user={user} />}
          {activeTab === 'settings' && <SettingsPage user={user} />}
        </main>
      </div>

      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}