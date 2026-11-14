import React, { useEffect, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Clock,
  ChevronDown,
  X
} from 'lucide-react';
import { courseAccent } from '../courseColors';

import {
  createAssignment,
  getGoogleCalendarStatus,
  getGoogleCalendarConnectUrl,
  syncGoogleCalendar,
  disconnectGoogleCalendar
} from '../api';
import './Calendar.css';

const STAFF_ROLES = ['teacher', 'ta'];

const syncedText = (count) =>
  `Synced ${count} assignment${count === 1 ? '' : 's'} to Google Calendar.`;

  // Month-cell layout: DAY_TRACK px stand for 24 hours.
const EVENT_HEIGHT = 36;
const EVENT_GAP = 4;
const DAY_TRACK = 120;

// The API sends "2026-10-01T23:59:00"; a freshly created task comes back as
// "2026-10-01 23:59:00". Swapping the space for "T" makes both standard.
const parseDue = (value) => new Date(String(value).replace(' ', 'T'));

const formatTime = (date) =>
  date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

const GoogleLogo = () => (
  <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
  </svg>
);

export default function Calendar({
  assignments = [],
  courses = [],
  onTaskCreated,
  onReopenTask
}) {
  // A done assignment can be clicked (or Enter/Space) to un-mark it, for a check-off
  // made too early or by accident. Returns nothing for assignments that aren't done.
  const reopenProps = (assignment) => {
    if (assignment.status !== 'done' || !onReopenTask) return {};
    const reopen = () => onReopenTask(assignment.id);
    return {
      role: 'button',
      tabIndex: 0,
      title: `${assignment.title}: done. Click to mark as not done.`,
      onClick: reopen,
      onKeyDown: (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault(); // stop Space from scrolling the page
          reopen();
        }
      }
    };
  };

  const [viewDate, setViewDate] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const [showAddTask, setShowAddTask] = useState(false);
  const [title, setTitle] = useState('');
  const [courseId, setCourseId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [forWholeCourse, setForWholeCourse] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  // Google Calendar sync. After the consent page, the backend sends the browser
  // back here with ?google_calendar=connected | denied | error.
  const [oauthResult] = useState(() =>
    new URLSearchParams(window.location.search).get('google_calendar')
  );
  const [google, setGoogle] = useState(null); // null = still loading
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');
  const [syncError, setSyncError] = useState(() => {
    if (oauthResult === 'denied') return 'Google Calendar was not connected.';
    if (oauthResult === 'error') return 'Could not connect Google Calendar. Please try again.';
    return '';
  });

  useEffect(() => {
    // Take ?google_calendar=... out of the address bar so a refresh doesn't repeat it.
    if (oauthResult) {
      window.history.replaceState({}, '', window.location.pathname);
    }

    let cancelled = false;

    (async () => {
      try {
        const status = await getGoogleCalendarStatus();
        if (cancelled) return;
        setGoogle(status);

        // Just connected: push everything once so the new calendar isn't empty.
        if (oauthResult === 'connected' && status.connected) {
          setSyncing(true);
          const { synced } = await syncGoogleCalendar();
          if (!cancelled) setSyncMessage(syncedText(synced));
        }
      } catch (error) {
        if (!cancelled) setSyncError(error.message);
      } finally {
        if (!cancelled) setSyncing(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [oauthResult]);

  const handleConnect = async () => {
    setSyncError('');

    try {
      const { url } = await getGoogleCalendarConnectUrl();
      window.location.assign(url); // leaves the app; Google sends the browser back
    } catch (error) {
      setSyncError(error.message);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    setSyncError('');
    setSyncMessage('');

    try {
      const { synced } = await syncGoogleCalendar();
      setSyncMessage(syncedText(synced));
    } catch (error) {
      setSyncError(error.message);
      // 409 = our Google access was removed or expired: show Connect again.
      if (error.status === 409) {
        setGoogle((current) => ({ ...current, connected: false }));
      }
    } finally {
      setSyncing(false);
    }
  };

  const handleDisconnect = async () => {
    setSyncError('');
    setSyncMessage('');

    try {
      await disconnectGoogleCalendar();
      setGoogle((current) => ({ ...current, connected: false }));
    } catch (error) {
      setSyncError(error.message);
    }
  };

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  const monthName = viewDate.toLocaleString('default', {
    month: 'long',
    year: 'numeric'
  });

  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const calendarCells = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1)
  ];

  while (calendarCells.length % 7 !== 0) {
    calendarCells.push(null);
  }

  const assignmentsForDay = (day) => {
  if (!day) return [];

  const dayAssignments = assignments
    .filter((assignment) => assignment.due_date)
    .map((assignment) => ({ ...assignment, due: parseDue(assignment.due_date) }))
    .filter(
      ({ due }) =>
        due.getFullYear() === year &&
        due.getMonth() === month &&
        due.getDate() === day
    )
    .sort((a, b) => a.due - b.due);

  let cursor = 0; // where the next chip would sit with no extra margin

  return dayAssignments.map((assignment) => {
    const minutes = assignment.due.getHours() * 60 + assignment.due.getMinutes();
    const target = (minutes / 1440) * (DAY_TRACK - EVENT_HEIGHT);
    const marginTop = Math.max(EVENT_GAP, target - cursor);

    cursor += marginTop + EVENT_HEIGHT;
    return { ...assignment, marginTop };
  });
};

  const previousMonth = () => {
    setViewDate(new Date(year, month - 1, 1));
  };

  const nextMonth = () => {
    setViewDate(new Date(year, month + 1, 1));
  };

  // Side list: every assignment, grouped by class (in the order of `courses`), each
  // class soonest due first with no due date last. Each class collapses on its own.
  const byDue = (a, b) => {
    if (!a.due_date || !b.due_date) return !a.due_date - !b.due_date; // missing one goes after
    return parseDue(a.due_date) - parseDue(b.due_date);
  };
  const assignmentGroups = courses
    .map((course) => ({
      course,
      accent: courseAccent(courses, course.id),
      items: assignments.filter((assignment) => assignment.course_id === course.id).sort(byDue)
    }))
    .filter((group) => group.items.length > 0);
  const [collapsedCourses, setCollapsedCourses] = useState({}); // { [courseId]: true } = closed
  const toggleCourse = (id) => setCollapsedCourses((prev) => ({ ...prev, [id]: !prev[id] }));

  const resetForm = () => {
    setTitle('');
    setCourseId('');
    setDueDate('');
    setForWholeCourse(false);
    setFormError('');
  };

  // Only teachers/TAs of the chosen course may post a course-wide assignment.
  const selectedCourseForForm = courses.find((course) => course.id === Number(courseId));
  const canPostForCourse = STAFF_ROLES.includes(selectedCourseForForm?.role);

  const closeModal = () => {
    resetForm();
    setShowAddTask(false);
  };

  const handleCreateTask = async (event) => {
    event.preventDefault();

    if (!title.trim() || !courseId || !dueDate) {
      setFormError('Course, title, and due date are required.');
      return;
    }

    setSaving(true);
    setFormError('');

    try {
      // api.js attaches the login token; without it the backend returns 401.
      // personal: true -> only this user sees it. false -> whole course (staff only).
      const created = await createAssignment({
        course_id: Number(courseId),
        title: title.trim(),
        description: 'Created from BuddyTech Planner',
        due_date: `${dueDate.replace('T', ' ')}:00`,
        personal: !(canPostForCourse && forWholeCourse)
      });

      const selectedCourse = courses.find(
        (course) => course.id === Number(courseId)
      );

      const enrichedTask = {
        ...created,
        course_code: selectedCourse?.course_code || '',
        course_name: selectedCourse?.course_name || ''
      };

      if (onTaskCreated) {
        onTaskCreated(enrichedTask);
      }

      const createdDate = new Date(created.due_date);

      if (!Number.isNaN(createdDate.getTime())) {
        setViewDate(
          new Date(
            createdDate.getFullYear(),
            createdDate.getMonth(),
            1
          )
        );
      }

      closeModal();
    } catch (error) {
      setFormError(error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="calendar-content">
      <div className="calendar-page-header">
        <div>
          <p className="eyebrow">PLANNER</p>

          <h1>My Calendar</h1>

          <p className="page-subtitle">
            Keep track of assignments, deadlines, and study plans.
          </p>
        </div>

        <button
          className="add-task-button"
          type="button"
          onClick={() => setShowAddTask(true)}
        >
          <Plus size={17} />
          Add Task
        </button>
      </div>

      <div className="calendar-layout">
        <section className="month-card">
          <div className="month-toolbar">
            <div className="month-navigation">
              <button type="button" onClick={previousMonth}>
                <ChevronLeft size={18} />
              </button>

              <h2>{monthName}</h2>

              <button type="button" onClick={nextMonth}>
                <ChevronRight size={18} />
              </button>
            </div>

            <div className="view-tabs">
              <button className="selected" type="button">
                Month
              </button>
            </div>
          </div>

          <div className="calendar-legend">
            <span>
              <i className="dot assignment-dot" />
              Tasks
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

          <div className="calendar-grid">
            {calendarCells.map((day, index) => {
              const dayAssignments = assignmentsForDay(day);

              return (
                <div
                  className={`calendar-day ${day ? '' : 'calendar-day-empty'}`}
                  key={index}
                >
                  {day && (
                    <>
                      <span className="day-number">{day}</span>

                      {dayAssignments.map((assignment) => (
                        <div
                          className={assignment.status === 'done' ? 'calendar-event done' : 'calendar-event'}
                          key={assignment.id}
                          style={{
                            marginTop: assignment.marginTop,
                            height: EVENT_HEIGHT,
                            // Its class's colour (Calendar.css .calendar-event reads it).
                            '--course-color': courseAccent(courses, assignment.course_id)
                          }}
                          title={`${assignment.title} (due ${formatTime(assignment.due)})`}
                          {...reopenProps(assignment)}
                        >
                          <strong>{assignment.title}</strong>

                          <span>
                            {formatTime(assignment.due)}
                            {assignment.course_code && ` · ${assignment.course_code}`}
                          </span>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        <aside className="calendar-right-column">
          <section className="side-card">
            <div className="side-card-heading">
              <h3>Tasks</h3>
              <span>{assignments.length} total</span>
            </div>

            {/* Scrolls on its own (Calendar.css .upcoming-list), with no visible scrollbar,
                so the class headers keep the same width when one opens (index.css .no-scrollbar). */}
            <div className="upcoming-list no-scrollbar">
              {assignmentGroups.length === 0 ? (
                <p className="empty-message">
                  No tasks available.
                </p>
              ) : (
                assignmentGroups.map(({ course, accent, items }) => {
                  const open = !collapsedCourses[course.id];
                  return (
                    <section key={course.id} className="course-group" style={{ '--course-color': accent }}>
                      <button
                        type="button"
                        className="course-group-toggle"
                        onClick={() => toggleCourse(course.id)}
                        aria-expanded={open}
                      >
                        <span className="course-group-dot" aria-hidden="true" />
                        <strong>{course.course_code}</strong>
                        <span className="course-group-count">{items.length}</span>
                        <ChevronDown size={16} className={open ? 'expand-chevron open' : 'expand-chevron'} aria-hidden="true" />
                      </button>

                      {open && items.map((assignment) => (
                        <div
                          className={assignment.status === 'done' ? 'upcoming-assignment done' : 'upcoming-assignment'}
                          key={assignment.id}
                          {...reopenProps(assignment)}
                        >
                          <div className="upcoming-icon">
                            <Clock size={16} />
                          </div>

                          <div>
                            <p>{assignment.title}</p>

                            <span>
                              {assignment.due_date
                                ? parseDue(assignment.due_date).toLocaleString([], {
                                    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
                                  })
                                : 'No due date'}
                            </span>
                          </div>
                        </div>
                      ))}
                    </section>
                  );
                })
              )}
            </div>
          </section>

          <section className="side-card">
            <div className="side-card-heading">
              <h3>Calendar Sync</h3>
              <span>{google?.connected ? 'Connected' : 'Not connected'}</span>
            </div>

            <p className="sync-description">
              {google?.connected
                ? 'Your assignments go to a "BuddyTech" calendar in your Google account.'
                : google && !google.configured
                  ? 'Google Calendar sync is not set up on this server yet.'
                  : 'Add your assignments and deadlines to Google Calendar.'}
            </p>

            {syncError && <p className="task-form-error">{syncError}</p>}
            {syncMessage && <p className="sync-description">{syncMessage}</p>}

            {google?.connected ? (
              <>
                <button
                  className="google-calendar-button"
                  type="button"
                  onClick={handleSync}
                  disabled={syncing}
                >
                  {syncing ? 'Syncing...' : 'Sync now'}
                <GoogleLogo />
                </button>

                <button
                  className="task-cancel-button"
                  type="button"
                  onClick={handleDisconnect}
                  disabled={syncing}
                  style={{ width: '100%', marginTop: '8px' }}
                >
                  Disconnect
                </button>
              </>
            ) : (
              <button
                className="google-calendar-button"
                type="button"
                onClick={handleConnect}
                disabled={!google?.configured}
              >
                Connect Google Calendar
                <GoogleLogo />
              </button>
            )}
          </section>
        </aside>
      </div>

      {showAddTask && (
        <div className="task-modal-backdrop">
          <div className="task-modal">
            <div className="task-modal-header">
              <div>
                <p className="eyebrow">NEW ASSIGNMENT</p>
                <h2>Add Task</h2>
              </div>

              <button
                type="button"
                className="task-modal-close"
                onClick={closeModal}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreateTask}>
              <label className="task-field">
                <span>Course</span>

                <select
                  value={courseId}
                  onChange={(event) => {
                    setCourseId(event.target.value);
                    setForWholeCourse(false);
                  }}
                >
                  <option value="">Select a course</option>

                  {courses.map((course) => (
                    <option
                      value={course.id}
                      key={course.id}
                    >
                      {course.course_code} — {course.course_name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="task-field">
                <span>Title</span>

                <input
                  type="text"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Assignment title"
                />
              </label>

              <label className="task-field">
                <span>Due date</span>

                <input
                  type="datetime-local"
                  value={dueDate}
                  onChange={(event) => setDueDate(event.target.value)}
                />
              </label>

              {canPostForCourse && (
                <label className="task-field" style={{ flexDirection: 'row', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="checkbox"
                    checked={forWholeCourse}
                    onChange={(event) => setForWholeCourse(event.target.checked)}
                    style={{ width: 'auto' }}
                  />
                  <span>Post to the whole course (everyone enrolled will see it)</span>
                </label>
              )}

              {formError && (
                <p className="task-form-error">
                  {formError}
                </p>
              )}

              <div className="task-modal-actions">
                <button
                  type="button"
                  className="task-cancel-button"
                  onClick={closeModal}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="task-save-button"
                  disabled={saving}
                >
                  {saving ? 'Saving...' : 'Create Task'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
