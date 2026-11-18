import React, { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Clock,
  ChevronDown,
  ArrowDown
} from 'lucide-react';
import { courseAccent } from '../../utils/courseColors';
import { easeScrollBy } from '../../animation/smoothScroll';
import { useTaskHoverCard } from '../../components/tasks/useTaskHoverCard';
import AddTaskModal from '../../components/tasks/AddTaskModal';

import {
  getGoogleCalendarStatus,
  getGoogleCalendarConnectUrl,
  syncGoogleCalendar,
  disconnectGoogleCalendar
} from '../../api';
import './Calendar.css';

// The side Tasks list's grow-in: rows after this many all start together.
const TASK_GROW_MAX_STEP = 8;
const syncedText = (count) =>
  `Synced ${count} assignment${count === 1 ? '' : 's'} to Google Calendar.`;

// Month-cell layout: DAY_TRACK px stand for 24 hours, so a task sits about where its due
// time falls in the day. Sized for the shorter cells that let the whole month fit in the
// window (Calendar.css, wide screens); a day with more tasks than fit scrolls in its cell.
const EVENT_HEIGHT = 34;
const EVENT_GAP = 4;
const DAY_TRACK = 72;
// A day with this many tasks or more stacks them like folders in a file cabinet (only each
// one's title strip shows); hovering the day spreads them out (Calendar.css .day-stack).
const STACK_FROM = 3;

// Scrolling over the month changes it: down goes back a month, up goes forward. The scroll
// pulls the month (and its name) sideways against growing resistance (pullCurve); past
// MONTH_SCROLL_RELEASE px it lets go and the neighbouring month slides the rest of the way
// in. Stopping early springs it back. See the month gesture in the component.
const MONTH_SCROLL_RELEASE = 400; // px of wheel scrolling to change month (about 4 mouse notches)
const MONTH_PULL_MAX = 0.2;       // how far the month has moved at the release point (share of its width)
const MONTH_PULL_STIFFNESS = 1.8; // how quickly the resistance builds (higher: stiffer sooner)
const MONTH_RETURN_AFTER = 160;   // ms with no scrolling before an unfinished pull springs back
const MONTH_QUIET_UNLOCK = 220;   // ms with no scrolling after a change before the next one can start,
                                  // so the rest of one swipe (trackpad momentum) moves only one month
const MONTH_RELEASE_MS = 280;     // the slide into the new month
const MONTH_RETURN_MS = 300;      // the spring back
const MONTH_HEIGHT_MS = 250;      // narrow screens: the card easing to a 5- or 6-week month's height
// 0..1 scrolled toward the release point -> 0..1 of MONTH_PULL_MAX: quick at first, then
// each bit of scrolling moves it less (the tension).
const pullCurve = (p) =>
  (1 - Math.exp(-MONTH_PULL_STIFFNESS * p)) / (1 - Math.exp(-MONTH_PULL_STIFFNESS));
const easeOutQuart = (t) => 1 - (1 - t) ** 4;
const easeOutBack = (t) => {
  const s = 1.4; // a slight bounce past the resting spot
  const u = t - 1;
  return u * u * ((s + 1) * u + s) + 1;
};
const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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
  onCompleteTask,
  onReopenTask,
  onOpenAssignment
}) {
  // Hovering a task (in the month grid or the Tasks list) shows its summary card.
  const hoverCard = useTaskHoverCard({ courses, onOpen: onOpenAssignment });

  // Clicking a task (or Enter/Space on it) checks it off, or un-marks it if it's done.
  // Plus the hover card's handlers, so one spread gives a task element both.
  const taskProps = (assignment) => {
    const done = assignment.status === 'done';
    // Closes the card first: it would still describe the task as it was before the click.
    const toggle = () => {
      hoverCard.close();
      (done ? onReopenTask : onCompleteTask)?.(assignment.id);
    };
    return {
      ...hoverCard.bind(assignment),
      role: 'button',
      tabIndex: 0,
      'aria-label': `${assignment.title}: ${done ? 'done. Click to mark as not done.' : 'click to mark as done.'}`,
      onClick: toggle,
      onKeyDown: (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault(); // stop Space from scrolling the page
          toggle();
        }
      }
    };
  };

  const [viewDate, setViewDate] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  // The Add Task popup, the same one the dashboard opens (components/AddTaskModal.jsx).
  const [showAddTask, setShowAddTask] = useState(false);

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
  const today = new Date();

  const monthLabel = (y, m) =>
    new Date(y, m, 1).toLocaleString('default', { month: 'long', year: 'numeric' });
  const monthName = monthLabel(year, month);
  // The months either side, shown sliding in while you scroll between months.
  const prevMonth = new Date(year, month - 1, 1);
  const nextMonth = new Date(year, month + 1, 1);

  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // A month's day cells, a week to a row: null for the blanks before the 1st and after the last day.
  const cellsFor = (y, m) => {
    const cells = [
      ...Array(new Date(y, m, 1).getDay()).fill(null),
      ...Array.from({ length: new Date(y, m + 1, 0).getDate() }, (_, index) => index + 1)
    ];
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  };

  // Every task with a due date, with it parsed (`due`).
  const datedAssignments = assignments
    .filter((assignment) => assignment.due_date)
    .map((assignment) => ({ ...assignment, due: parseDue(assignment.due_date) }));

  const assignmentsForDay = (y, m, day) => {
  if (!day) return [];

  const dayAssignments = datedAssignments
    .filter(
      ({ due }) =>
        due.getFullYear() === y &&
        due.getMonth() === m &&
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

  // Side list: the shown month's tasks, grouped by class (in the class's colour, as on the
  // calendar), each class soonest due first. Each class collapses on its own. Tasks with no
  // due date aren't in any month, so they're not listed here.
  const monthTasks = datedAssignments
    .filter(({ due }) => due.getFullYear() === year && due.getMonth() === month)
    .sort((a, b) => a.due - b.due);
  // Inside a class, its tasks are split by the month's weeks (the calendar's rows, Sunday to
  // Saturday, cut to this month's days), each run under a gray "Week 2 · Nov 8 – 14" label.
  const shortDate = (day) => new Date(year, month, day).toLocaleDateString([], { month: 'short', day: 'numeric' });
  const weekOfMonth = (date) => Math.floor((date.getDate() - 1 + firstWeekday) / 7); // 0 = first row
  const weekLabel = (n) => {
    const start = n === 0 ? 1 : n * 7 - firstWeekday + 1;
    const end = Math.min(daysInMonth, (n + 1) * 7 - firstWeekday);
    return `Week ${n + 1} · ${start === end ? shortDate(start) : `${shortDate(start)} – ${end}`}`;
  };
  const assignmentGroups = courses
    .map((course) => {
      const weeks = [];
      monthTasks
        .filter((assignment) => assignment.course_id === course.id)
        .forEach((assignment) => {
          const n = weekOfMonth(assignment.due);
          if (weeks.at(-1)?.n !== n) weeks.push({ n, label: weekLabel(n), items: [] });
          weeks.at(-1).items.push(assignment);
        });
      return {
        course,
        accent: courseAccent(courses, course.id),
        weeks,
        count: weeks.reduce((total, week) => total + week.items.length, 0)
      };
    })
    .filter((group) => group.count > 0);
  // { [courseId]: true } = closed; 'reopened' = opened again after closing, so its rows grow
  // in from the top of the class, not after every row above it (see the side list).
  const [collapsedCourses, setCollapsedCourses] = useState({});
  const toggleCourse = (id) =>
    setCollapsedCourses((prev) => ({ ...prev, [id]: prev[id] === true ? 'reopened' : true }));

  // "Scroll for more": shown while the side list has more below what's in view.
  // Checked on scroll, and whenever the list's contents change (tasks load, a class opens or
  // closes, another month is shown).
  const taskListRef = useRef(null);
  const [moreBelow, setMoreBelow] = useState(false);
  const checkMoreBelow = useCallback(() => {
    const list = taskListRef.current;
    setMoreBelow(Boolean(list) && list.scrollHeight - list.scrollTop - list.clientHeight > 4);
  }, []);
  useEffect(() => {
    checkMoreBelow();
    window.addEventListener('resize', checkMoreBelow);
    return () => window.removeEventListener('resize', checkMoreBelow);
  }, [checkMoreBelow, assignments, collapsedCourses, viewDate]);
  // Another month: its list starts at the top.
  useEffect(() => {
    if (taskListRef.current) taskListRef.current.scrollTop = 0;
  }, [viewDate]);

  // ---- The month gesture (see MONTH_SCROLL_RELEASE) ----
  // While it plays, the shown month sits on a track between the months either side
  // (`peeking`: only rendered then). Each frame moves the track and the "Month Year" label
  // straight in the DOM (paintMonths), not through React. `frac` is how far they've moved,
  // in widths: + = right (toward the previous month), - = left (toward the next).
  const monthCardRef = useRef(null);
  const sliderRef = useRef(null);     // clips the months; on narrow screens its height eases after a change
  const trackRef = useRef(null);      // the shown month and its neighbours: the part that moves
  const labelTrackRef = useRef(null); // the same for the month's name
  const stepMonthRef = useRef(null);  // the arrows and arrow keys: (-1 | 1) => slide to that month
  const scrollToToday = useRef(false);
  const [peeking, setPeeking] = useState(false);
  const gesture = useRef({
    phase: 'idle',        // 'idle' | 'pull' | 'return' (springing back) | 'release' (sliding to the next month)
    pull: 0,              // px scrolled this gesture: + toward the next month, - toward the previous
    frac: 0,
    tween: null,          // a timed move: { from, to, start, ms, ease, done }
    lastWheel: -Infinity, // when the last scroll arrived (performance.now())
    locked: false,        // after a change: ignore scrolling until it goes quiet
    frame: 0,             // the pending animation frame
    settle: false,        // a change is committing: put the track back once the new month is drawn
    fromHeight: null      // the slider's height before the change
  });

  // The track and label at `frac`; at 0, cleared, so nothing is left transformed at rest.
  // The label's names fade with distance from the middle.
  const paintMonths = useCallback((frac) => {
    const transform = frac === 0 ? '' : `translateX(${frac * 100}%)`;
    if (trackRef.current) trackRef.current.style.transform = transform;
    const labels = labelTrackRef.current;
    if (!labels) return;
    labels.style.transform = transform;
    labels.querySelectorAll('[data-offset]').forEach((label) => {
      const pos = Number(label.dataset.offset) + frac;
      label.style.opacity = frac === 0 ? '' : String(Math.max(0, 1 - Math.abs(pos) * 1.15));
    });
  }, []);

  useEffect(() => {
    const card = monthCardRef.current;
    const g = gesture.current;
    if (!card) return undefined;

    const startLoop = () => {
      if (!g.frame) g.frame = requestAnimationFrame(frame);
    };

    // Slide to the month `dir` away (-1 back, 1 forward), from wherever the pull left it.
    // When the slide ends, the new month is committed and the layout effect below puts the
    // track back at 0 in the same paint, so nothing jumps.
    const release = (dir) => {
      if (g.phase === 'release') return;
      g.phase = 'release';
      g.locked = true;
      g.tween = null;
      const finish = () => {
        g.phase = 'idle';
        g.pull = 0;
        g.settle = true;
        g.fromHeight = sliderRef.current?.offsetHeight ?? null;
        setPeeking(false);
        setViewDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + dir, 1));
      };
      if (prefersReducedMotion()) {
        finish();
        return;
      }
      setPeeking(true);
      g.tween = { from: g.frac, to: -dir, start: performance.now(), ms: MONTH_RELEASE_MS, ease: easeOutQuart, done: finish };
      startLoop();
    };
    stepMonthRef.current = release;

    const springBack = () => {
      g.phase = 'return';
      g.pull = 0;
      g.tween = {
        from: g.frac, to: 0, start: performance.now(), ms: MONTH_RETURN_MS, ease: easeOutBack,
        done: () => {
          g.phase = 'idle';
          g.frac = 0;
          paintMonths(0);
          setPeeking(false);
        }
      };
    };

    function frame(now) {
      g.frame = 0;
      if (g.tween) {
        const t = Math.min(1, (now - g.tween.start) / g.tween.ms);
        g.frac = g.tween.from + (g.tween.to - g.tween.from) * g.tween.ease(t);
        paintMonths(g.frac);
        if (t >= 1) {
          const { done } = g.tween;
          g.tween = null;
          done();
        }
      } else if (g.phase === 'pull') {
        // Follows the pull through pullCurve, eased a little so a mouse's separate notches glide.
        const target = prefersReducedMotion()
          ? 0
          : -Math.sign(g.pull) * MONTH_PULL_MAX * pullCurve(Math.abs(g.pull) / MONTH_SCROLL_RELEASE);
        g.frac += (target - g.frac) * 0.3;
        paintMonths(g.frac);
        if (now - g.lastWheel > MONTH_RETURN_AFTER) springBack();
      }
      if (g.locked && g.phase === 'idle' && now - g.lastWheel > MONTH_QUIET_UNLOCK) g.locked = false;
      if (g.tween || g.phase !== 'idle' || g.locked) startLoop();
    }

    const onWheel = (event) => {
      if (event.ctrlKey || event.defaultPrevented) return;          // pinch-zoom stays with the browser
      if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;  // sideways scrolling too
      if (g.phase === 'idle' && !g.locked) {
        // Only while the whole month is in view: otherwise the page needs the wheel to scroll.
        const rect = card.getBoundingClientRect();
        if (rect.top < -1 || rect.bottom > window.innerHeight + 1) return;
        // A day too full for its cell scrolls inside it, as before.
        const day = event.target.closest?.('.calendar-day');
        if (day && day.scrollHeight > day.clientHeight + 1) return;
      }
      // Taken: smoothScroll.js skips a wheel event that's already been handled.
      event.preventDefault();
      g.lastWheel = performance.now();
      if (g.locked || g.phase === 'release') return; // the rest of a swipe that already changed month
      const px = event.deltaY * (event.deltaMode === 1 ? 40 : event.deltaMode === 2 ? 800 : 1);
      if (!px) return;
      if (g.phase === 'return') g.tween = null;       // caught mid spring-back: pull from there
      if (g.phase === 'idle') setPeeking(true);
      g.phase = 'pull';
      g.pull -= px;                                   // down (+deltaY) pulls toward the previous month
      if (Math.abs(g.pull) >= MONTH_SCROLL_RELEASE) release(Math.sign(g.pull));
      else startLoop();
    };

    card.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      card.removeEventListener('wheel', onWheel);
      cancelAnimationFrame(g.frame);
      g.frame = 0;
    };
  }, [paintMonths]);

  // A change committed: the new month is drawn where the old one was, so put the track back
  // at 0 before this paint. On narrow screens a 5- and 6-week month differ in height: ease
  // the card between them.
  useLayoutEffect(() => {
    const g = gesture.current;
    if (!g.settle) return;
    g.settle = false;
    g.frac = 0;
    paintMonths(0);
    const slider = sliderRef.current;
    const toHeight = slider?.offsetHeight;
    if (slider && g.fromHeight && toHeight !== g.fromHeight && !prefersReducedMotion()) {
      slider.animate([{ height: `${g.fromHeight}px` }, { height: `${toHeight}px` }],
        { duration: MONTH_HEIGHT_MS, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
    }
  }, [viewDate, paintMonths]);

  useLayoutEffect(() => {
    if (!scrollToToday.current) return;
    scrollToToday.current = false;
    trackRef.current?.querySelector(':scope > .calendar-grid [aria-current="date"]')
      ?.scrollIntoView({ block: 'nearest' });
  }, [viewDate]);

  const backToToday = () => {
    const g = gesture.current;
    cancelAnimationFrame(g.frame);
    Object.assign(g, { phase: 'idle', frame: 0, tween: null, pull: 0, frac: 0, locked: false, settle: false });
    paintMonths(0);
    setPeeking(false);
    scrollToToday.current = true;
    const now = new Date();
    setViewDate(new Date(now.getFullYear(), now.getMonth(), 1));
  };

  const stepMonth = (dir) => stepMonthRef.current?.(dir);
  // Most of a list-height down, so the last row in view is still showing at the top.
  // Eases like every wheel scroll on the site (smoothScroll.js).
  const scrollTasksDown = () => {
    const list = taskListRef.current;
    if (list) easeScrollBy(list, list.clientHeight * 0.8);
  };

  // The popup has created the task (its files may still be uploading): add it to the
  // Planner, and turn to the month it's due in so it's on screen.
  const handleTaskCreated = (created, course) => {
    onTaskCreated?.({ ...created, course_code: course.course_code, course_name: course.course_name });
    const due = parseDue(created.due_date);
    if (!Number.isNaN(due.getTime())) setViewDate(new Date(due.getFullYear(), due.getMonth(), 1));
  };

  // One month's grid (y, m: its year and 0-based month).
  const renderMonthGrid = (y, m) => {
    const cells = cellsFor(y, m);
    return (
          <div className="calendar-grid">
            {cells.map((day, index) => {
              const dayAssignments = assignmentsForDay(y, m, day);
              const stacked = dayAssignments.length >= STACK_FROM;
              // The bottom two weeks spread their stack upward, so the card's edge doesn't cut it off.
              const spreadUp = Math.floor(index / 7) >= cells.length / 7 - 2;

              // One task in the month grid. extraStyle: its spot in the day (by due time, or by
              // its place in a stack).
              const renderEvent = (assignment, extraStyle) => (
                <div
                  className={assignment.status === 'done' ? 'calendar-event done' : 'calendar-event'}
                  key={assignment.id}
                  style={{
                    ...extraStyle,
                    height: EVENT_HEIGHT,
                    // Its class's colour (Calendar.css .calendar-event reads it).
                    '--course-color': courseAccent(courses, assignment.course_id)
                  }}
                  {...taskProps(assignment)}
                >
                  <strong><em className="task-strike">{assignment.title}</em></strong>

                  <span>
                    {formatTime(assignment.due)}
                    {assignment.course_code && ` · ${assignment.course_code}`}
                  </span>
                </div>
              );

              return (
                <div
                  // no-scrollbar: if a day ever overflows its cell, it scrolls with no scrollbar showing.
                  className={`calendar-day no-scrollbar${stacked ? ' stacked' : ''}${day ? '' : ' calendar-day-empty'}`}
                  key={index}
                >
                  {day && (
                    <>
                      <span
                        className="day-number"
                        aria-current={y === today.getFullYear() && m === today.getMonth() && day === today.getDate() ? 'date' : undefined}
                      >{day}</span>

                      {stacked ? (
                        // --n tasks, each told its place (--i); Calendar.css lays them out.
                        <div className={spreadUp ? 'day-stack up' : 'day-stack'} style={{ '--n': dayAssignments.length }}>
                          {dayAssignments.map((assignment, i) => renderEvent(assignment, { '--i': i }))}
                        </div>
                      ) : (
                        dayAssignments.map((assignment) => renderEvent(assignment, { marginTop: assignment.marginTop }))
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
    );
  };

  return (
    <main className="calendar-content">
      <div className="calendar-layout">
        {/* Scrolling over it changes month (the month gesture above). */}
        <section className="month-card" ref={monthCardRef}>
          <div className="month-toolbar">
            <div className="month-navigation">
              <button type="button" onClick={() => stepMonth(-1)} aria-label="Previous month">
                <ChevronLeft size={18} />
              </button>

              {/* The name slides with the month: its neighbours sit either side (only while
                  scrolling between months), and this window shows the one in the middle. */}
              <div className="month-label">
                <div className="month-label-track" ref={labelTrackRef}>
                  <h2 data-offset="0" aria-live="polite">{monthName}</h2>
                  {peeking && <>
                    <h2 className="month-label-peek prev" data-offset="-1" aria-hidden="true">
                      {monthLabel(prevMonth.getFullYear(), prevMonth.getMonth())}
                    </h2>
                    <h2 className="month-label-peek next" data-offset="1" aria-hidden="true">
                      {monthLabel(nextMonth.getFullYear(), nextMonth.getMonth())}
                    </h2>
                  </>}
                </div>
              </div>

              <button type="button" onClick={() => stepMonth(1)} aria-label="Next month">
                <ChevronRight size={18} />
              </button>
            </div>

            <div className="month-actions">
              <button className="today-button" type="button" onClick={backToToday}>Back to today</button>
              <button className="add-task-button" type="button" onClick={() => setShowAddTask(true)}>
                <Plus size={15} strokeWidth={2.6} />
                Add task
              </button>
            </div>
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

          {/* The month, and while scrolling between months its neighbours either side
              (.month-peek, not focusable). The track moves; the slider clips it. */}
          <div className="month-slider" ref={sliderRef}>
            <div className="month-track" ref={trackRef}>
              {renderMonthGrid(year, month)}
              {peeking && <>
                <div className="month-peek prev" aria-hidden="true" inert>
                  {renderMonthGrid(prevMonth.getFullYear(), prevMonth.getMonth())}
                </div>
                <div className="month-peek next" aria-hidden="true" inert>
                  {renderMonthGrid(nextMonth.getFullYear(), nextMonth.getMonth())}
                </div>
              </>}
            </div>
          </div>
        </section>

        <aside className="calendar-right-column">
          <section className="side-card tasks-card">
            <div className="side-card-heading">
              <h3>Tasks</h3>
              <span>{monthTasks.length} this month</span>
            </div>

            {/* Scrolls on its own (Calendar.css .upcoming-list), with a thin scrollbar. Each
                class's header stays pinned at the top while its tasks scroll under it. While
                there's more below, a frosted "Scroll for more" button floats over the bottom. */}
            <div className="upcoming-list-wrap">
            {/* onAnimationEnd: the rows grow in from no height, so the list only becomes
                scrollable as they finish; check again then. */}
            <div className="upcoming-list thin-scroll" ref={taskListRef} onScroll={checkMoreBelow} onAnimationEnd={checkMoreBelow}>
              {assignmentGroups.length === 0 ? (
                <p className="empty-message">
                  Nothing due this month.
                </p>
              ) : (
                assignmentGroups.map(({ course, accent, weeks, count }, groupIndex) => {
                  const open = collapsedCourses[course.id] !== true;
                  // Rows before each of this class's (week labels count as rows), for the
                  // grow-in's top-down order. A class opened again by its header counts from
                  // 0, so its rows don't wait behind every class above it.
                  let step = collapsedCourses[course.id] === 'reopened'
                    ? 0
                    : assignmentGroups.slice(0, groupIndex)
                      .reduce((total, group) => total + group.count + group.weeks.length, 0);
                  const growStyle = () =>
                    ({ '--grow-step': Math.min(step++, TASK_GROW_MAX_STEP), '--grow-gap': 0 });
                  return (
                    <section key={course.id} className="course-group" style={{ '--course-color': accent }}>
                      <button
                        type="button"
                        className="course-group-toggle"
                        onClick={() => toggleCourse(course.id)}
                        aria-expanded={open}
                      >
                        <span className="course-group-name">
                          <strong>{course.course_code}</strong>
                          {course.course_name && <span>{course.course_name}</span>}
                        </span>
                        <span className="course-group-count">{count}</span>
                        <ChevronDown size={16} className={open ? 'expand-chevron open' : 'expand-chevron'} aria-hidden="true" />
                      </button>

                      {/* Each label and task grows in like Home's lists (index.css .grow-in-row):
                          its row opens from no height while it grows from tiny and see-through,
                          top down. The wait is capped at TASK_GROW_MAX_STEP rows, so ones far
                          down the list (out of view) don't keep growing in long after the rest. */}
                      {open && weeks.map(({ n, label, items }) => (
                        <Fragment key={`${year}-${month}-${n}`}>
                          <div className="grow-in-row" style={growStyle()}>
                            <div className="grow-in-cell">
                              <p className="task-week-label grow-in-item">{label}</p>
                            </div>
                          </div>

                          {items.map((assignment) => (
                            <div
                              key={assignment.id}
                              className="grow-in-row"
                              style={growStyle()}
                            >
                            <div className="grow-in-cell">
                            <div
                              className={assignment.status === 'done' ? 'upcoming-assignment done grow-in-item' : 'upcoming-assignment grow-in-item'}
                              {...taskProps(assignment)}
                            >
                              <div className="upcoming-icon">
                                <Clock size={16} />
                              </div>

                              <div>
                                <p><em className="task-strike">{assignment.title}</em></p>

                                <span>
                                  {assignment.due.toLocaleString([], {
                                    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
                                  })}
                                </span>
                              </div>
                            </div>
                            </div>
                            </div>
                          ))}
                        </Fragment>
                      ))}
                    </section>
                  );
                })
              )}
            </div>
            {/* Always on the page, faded in and out (Calendar.css .scroll-more-fade.shown), not
                added and removed: adding or removing its blur changed how the browser drew
                the list's text, so the tasks looked bolder at some moments than others. */}
            <div className={moreBelow ? 'scroll-more-fade shown' : 'scroll-more-fade'}>
              <button
                type="button"
                className="scroll-more-button"
                onClick={scrollTasksDown}
                tabIndex={moreBelow ? 0 : -1}
                aria-hidden={!moreBelow}
              >
                Scroll for more <ArrowDown size={12} strokeWidth={2.5} aria-hidden="true" />
              </button>
            </div>
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

      {hoverCard.card}

      {showAddTask && (
        <AddTaskModal courses={courses} onClose={() => setShowAddTask(false)} onCreated={handleTaskCreated} />
      )}
    </main>
  );
}
