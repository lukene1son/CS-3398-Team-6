import React, { useEffect, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Clock
} from 'lucide-react';

import './Calendar.css';

export default function Calendar() {
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);

  const [viewDate, setViewDate] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

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

      const dueDate = new Date(assignment.due_date);

      return (
        dueDate.getFullYear() === year &&
        dueDate.getMonth() === month &&
        dueDate.getDate() === day
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

        <button className="add-task-button" type="button">
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

          {loading ? (
            <p className="loading-text">Loading calendar...</p>
          ) : (
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
          )}
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
    </main>
  );
}
