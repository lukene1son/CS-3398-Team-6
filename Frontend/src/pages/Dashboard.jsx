import React, { useEffect, useState } from 'react';
import { 
  Home, Users, Calendar, Sparkles, BookOpen, Settings,
  Search, Bell, FileText, MessageSquare, HelpCircle, 
  Clock, CheckSquare, Square, ChevronRight, LogOut, FolderPlus
} from 'lucide-react';

export default function Dashboard({ user, onLogout }) {
  const displayName = user?.name || "Student";
  const userInitial = displayName.charAt(0).toUpperCase();

  const [tasks, setTasks] = useState([]);
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);

  const [newTaskTitle, setNewTaskTitle] = useState('');

  useEffect(() => {
    async function loadDashboardData() {
      try {
        const [assignmentRes, courseRes] = await Promise.all([
          fetch('/api/users/1/assignments'),
          fetch('/api/users/1/courses')
        ]);

        const assignments = await assignmentRes.json();
        const userCourses = await courseRes.json();

        setTasks(assignments);
        setCourses(userCourses);
      } catch (error) {
        console.error('Failed to load dashboard data:', error);
      } finally {
        setLoading(false);
      }
    }

    loadDashboardData();
  }, []);

  const toggleTask = async (id, currentStatus) => {
    const newStatus = currentStatus === 'done' ? 'todo' : 'done';

    try {
      const response = await fetch(`/api/assignments/${id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          status: newStatus
        })
      });

      if (!response.ok) {
        throw new Error('Failed to update assignment');
      }

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

    try {
      const response = await fetch('/api/assignments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          course_id: 1,
          title: newTaskTitle,
          description: 'Created from BuddyTech dashboard',
          due_date: '2026-10-01 23:59:00'
        })
      });

      if (!response.ok) {
        throw new Error('Failed to create assignment');
      }

      const created = await response.json();

      setTasks([
        ...tasks,
        {
          ...created,
          course_id: 1,
          course_code: 'CS 3398',
          course_name: 'Software Engineering',
          description: 'Created from BuddyTech dashboard',
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
      <aside style={{ width: '240px', background: '#ffffff', borderRight: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', padding: '1.5rem 1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2rem', paddingLeft: '0.5rem' }}>
          <img src="/buddytech.webp" alt="Logo" style={{ height: '32px' }} onError={(e) => e.target.style.display='none'} />
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#1d4ed8' }}>BuddyTech</h2>
        </div>

        <nav style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', flex: 1 }}>
          <button style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '0.75rem 1rem', background: '#eff6ff', color: '#1d4ed8', border: 'none', borderRadius: '10px', fontWeight: 600, cursor: 'pointer', textAlign: 'left' }}>
            <Home size={18} /> Home
          </button>
          <button style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '0.75rem 1rem', background: 'transparent', color: '#64748b', border: 'none', borderRadius: '10px', cursor: 'pointer', textAlign: 'left' }}>
            <Users size={18} /> Spaces
          </button>
          <button style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '0.75rem 1rem', background: 'transparent', color: '#64748b', border: 'none', borderRadius: '10px', cursor: 'pointer', textAlign: 'left' }}>
            <Calendar size={18} /> Planner
          </button>
          <button style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '0.75rem 1rem', background: 'transparent', color: '#64748b', border: 'none', borderRadius: '10px', cursor: 'pointer', textAlign: 'left' }}>
            <Sparkles size={18} /> AI Tools
          </button>
          <button style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '0.75rem 1rem', background: 'transparent', color: '#64748b', border: 'none', borderRadius: '10px', cursor: 'pointer', textAlign: 'left' }}>
            <BookOpen size={18} /> Resources
          </button>
          <button style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '0.75rem 1rem', background: 'transparent', color: '#64748b', border: 'none', borderRadius: '10px', cursor: 'pointer', textAlign: 'left' }}>
            <Settings size={18} /> Settings
          </button>
        </nav>

        {onLogout && (
          <button onClick={onLogout} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '0.75rem 1rem', background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}>
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
            <Bell size={20} style={{ color: '#64748b', cursor: 'pointer' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: '38px', height: '38px', borderRadius: '50%', background: '#2563eb', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>
                {userInitial}
              </div>
              <div style={{ fontSize: '0.85rem' }}>
                <p style={{ fontWeight: 600, margin: 0 }}>{displayName}</p>
                <p style={{ color: '#64748b', margin: 0, fontSize: '0.75rem' }}>{user?.email || "Student Account"}</p>
              </div>
            </div>
          </div>
        </header>

        {/* Content Body */}
        <div style={{ padding: '2rem', display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '2rem' }}>
          {/* Main Column */}
          <div>
            <div style={{ marginBottom: '1.5rem' }}>
              <h1 style={{ fontSize: '1.85rem', fontWeight: 800, color: '#0f172a' }}>
                Welcome back, {displayName} 👋
              </h1>
              <p style={{ color: '#64748b', fontSize: '0.95rem' }}>Here is an overview of your active spaces and tasks.</p>
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

              {/* Tasks List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {tasks.length === 0 ? (
                  <p style={{ color: '#94a3b8', fontSize: '0.9rem', textAlign: 'center', padding: '1rem' }}>No pending tasks.</p>
                ) : (
                  tasks.map(task => (
                    <div key={task.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 1rem', background: '#f8fafc', borderRadius: '10px' }}>
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
                      <span style={{ fontSize: '0.8rem', fontWeight: 600, color: task.color, background: `${task.color}15`, padding: '0.25rem 0.6rem', borderRadius: '6px' }}>
                        {task.status}
                      </span>
                    </div>
                  ))
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
                {courses.map(course => (
                  <div
                    key={course.id}
                    style={{
                      background: '#ffffff',
                      padding: '1.25rem',
                      borderRadius: '12px',
                      border: '1px solid #e2e8f0'
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
                  <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem', borderRadius: '10px', border: '1px solid #f1f5f9', cursor: 'pointer' }}>
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

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', fontSize: '0.85rem' }}>
                <div>
                  <p style={{ margin: 0, fontWeight: 600 }}>Space Discussion Activity</p>
                  <p style={{ margin: 0, color: '#64748b', fontSize: '0.75rem' }}>New responses in connected space • Recent</p>
                </div>
                <div>
                  <p style={{ margin: 0, fontWeight: 600 }}>Upcoming Schedule Sync</p>
                  <p style={{ margin: 0, color: '#64748b', fontSize: '0.75rem' }}>Assignments synced from course schedule</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}