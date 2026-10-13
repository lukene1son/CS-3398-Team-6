import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Home,
  Users,
  Calendar as CalendarIcon,
  Sparkles,
  BookOpen,
  Settings,
  Search,
  Bell,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Plus,
  Clock
} from 'lucide-react';

import './Calendar.css';

export default function Calendar({ user, onLogout }) {
  const navigate = useNavigate();

  const displayName = user?.name || 'Student';
  const userInitial = displayName.charAt(0).toUpperCase();

  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadAssignments() {
      try {
        const response = await fetch('/api/users/1/assignments');

        if (!response.ok) {
          throw new Error('Failed to load assignments');
        }

        const data = await response.json();
        setAssignments(data);
      } catch (error) {
        console.error('Failed to load calendar assignments:', error);
      } finally {
        setLoading(false);
      }
    }

    loadAssignments();
  }, []);

  const days = Array.from({ length: 31 }, (_, index) => index + 1);

  const assignmentsForDay = (day) => {
    return assignments.filter((assignment) => {
      if (!assignment.due_date) return false;

      const dueDate = new Date(assignment.due_date);

      return (
        dueDate.getFullYear() === 2026 &&
        dueDate.getMonth() === 9 &&
        dueDate.getDate() === day
      );
    });
  };

  return (
    <div className="calendar-shell">
      {/* Sidebar */}
      <aside className="calendar-sidebar">
        <div className="sidebar-brand">
          <img
            src="/buddytech.webp"
            alt="BuddyTech"
            className="sidebar-logo"
          />

          <h2>BuddyTech</h2>
        </div>

        <nav className="sidebar-nav">
          <button
            className="sidebar-link"
            onClick={() => navigate('/dashboard')}
          >
            <Home size={18} />
            Home
          </button>

          <button className="sidebar-link">
            <Users size={18} />
            Spaces
          </button>

          <button className="sidebar-link active">
            <CalendarIcon size={18} />
            Planner
          </button>

          <button className="sidebar-link">
            <Sparkles size={18} />
            AI Tools
          </button>

          <button className="sidebar-link">
            <BookOpen size={18} />
            Resources
          </button>

          <button className="sidebar-link">
            <Settings size={18} />
            Settings
          </button>
        </nav>

        {onLogout && (
          <button className="logout-button" onClick={onLogout}>
            <LogOut size={16} />
            Sign Out
          </button>
        )}
      </aside>

      {/* Main */}
      <div className="calendar-main">
        {/* Top Header */}
        <header className="calendar-topbar">
          <div className="search-wrapper">
            <Search size={18} />

            <input
              type="text"
              placeholder="Search your spaces, courses, or study groups..."
            />
          </div>

          <div className="user-area">
            <Bell size={20} />

            <div className="user-avatar">
              {userInitial}
            </div>

            <div className="user-details">
              <p>{displayName}</p>
              <span>{user?.email || 'Student Account'}</span>
            </div>
          </div>
        </header>

        {/* Page */}
        <main className="calendar-content">
          <div className="calendar-page-header">
            <div>
              <p className="eyebrow">PLANNER</p>

              <h1>My Calendar</h1>

              <p className="page-subtitle">
                Keep track of assignments, deadlines, and study plans.
              </p>
            </div>

            <button className="add-task-button">
              <Plus size={17} />
              Add Task
            </button>
          </div>

          <div className="calendar-layout">
            {/* Calendar */}
            <section className="month-card">
              <div className="month-toolbar">
                <div className="month-navigation">
                  <button>
                    <ChevronLeft size={18} />
                  </button>

                  <h2>October 2026</h2>

                  <button>
                    <ChevronRight size={18} />
                  </button>
                </div>

                <div className="view-tabs">
                  <button className="selected">Month</button>
                  <button>Week</button>
                  <button>Day</button>
                </div>
              </div>

              <div className="calendar-legend">
                <span>
                  <i className="dot assignment-dot" />
                  Assignments
                </span>

                <span>
                  <i className="dot study-dot" />
                  Study Sessions
                </span>

                <span>
                  <i className="dot class-dot" />
                  Classes
                </span>
              </div>

              <div className="weekday-row">
                <span>Sun</span>
                <span>Mon</span>
                <span>Tue</span>
                <span>Wed</span>
                <span>Thu</span>
                <span>Fri</span>
                <span>Sat</span>
              </div>

              {loading ? (
                <p className="loading-text">Loading calendar...</p>
              ) : (
                <div className="calendar-grid">
                  {days.map((day) => {
                    const dayAssignments = assignmentsForDay(day);

                    return (
                      <div className="calendar-day" key={day}>
                        <span className="day-number">
                          {day}
                        </span>

                        {dayAssignments.map((assignment) => (
                          <div
                            className="calendar-event"
                            key={assignment.id}
                          >
                            <strong>{assignment.title}</strong>

                            {assignment.course_code && (
                              <span>
                                {assignment.course_code}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Right Column */}
            <aside className="calendar-right-column">
              <section className="side-card">
                <div className="side-card-heading">
                  <h3>Upcoming Assignments</h3>
                  <span>View all</span>
                </div>

                <div className="upcoming-list">
                  {assignments.length === 0 ? (
                    <p className="empty-message">
                      No upcoming assignments.
                    </p>
                  ) : (
                    assignments.slice(0, 5).map((assignment) => (
                      <div
                        className="upcoming-assignment"
                        key={assignment.id}
                      >
                        <div className="upcoming-icon">
                          <Clock size={16} />
                        </div>

                        <div>
                          <p>{assignment.title}</p>

                          <span>
                            {assignment.course_code || 'BuddyTech'}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </section>

              <section className="side-card">
                <div className="side-card-heading">
                  <h3>Calendar Sync</h3>
                  <span>Future feature</span>
                </div>

                <p className="sync-description">
                  Keep your BuddyTech planner connected with another calendar.
                </p>

                <button className="google-calendar-button">
                  Connect Google Calendar
                </button>

                <div className="sync-divider">
                  <span>or</span>
                </div>

                <input
                  className="calendar-link-input"
                  type="text"
                  placeholder="Paste calendar URL"
                />

                <p className="advanced-note">
                  External calendar syncing is planned for a future sprint.
                </p>
              </section>
            </aside>
          </div>
        </main>
      </div>
    </div>
  );
}