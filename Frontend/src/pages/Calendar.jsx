import React, { useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Clock,
  X
} from 'lucide-react';

import { createAssignment } from '../api';
import './Calendar.css';

const STAFF_ROLES = ['teacher', 'ta'];

export default function Calendar({
  assignments = [],
  courses = [],
  onTaskCreated
}) {
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

    return assignments.filter((assignment) => {
      if (!assignment.due_date) return false;

      const due = new Date(assignment.due_date);

      return (
        due.getFullYear() === year &&
        due.getMonth() === month &&
        due.getDate() === day
      );
    });
  };

  const previousMonth = () => {
    setViewDate(new Date(year, month - 1, 1));
  };

  const nextMonth = () => {
    setViewDate(new Date(year, month + 1, 1));
  };

  const upcomingAssignments = [...assignments]
    .filter((assignment) => assignment.due_date)
    .sort((a, b) => new Date(a.due_date) - new Date(b.due_date))
    .slice(0, 5);

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
              Assignments
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
                          className="calendar-event"
                          key={assignment.id}
                        >
                          <strong>{assignment.title}</strong>

                          {assignment.course_code && (
                            <span>{assignment.course_code}</span>
                          )}
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
              <h3>Assignments</h3>
              <span>{assignments.length} total</span>
            </div>

            <div className="upcoming-list">
              {upcomingAssignments.length === 0 ? (
                <p className="empty-message">
                  No assignments available.
                </p>
              ) : (
                upcomingAssignments.map((assignment) => (
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
              External calendar syncing is planned for a future sprint.
            </p>

            <button
              className="google-calendar-button"
              type="button"
              disabled
            >
              Connect Google Calendar
            </button>
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
