import { useEffect, useState } from 'react';
import { Check, Clock, FileText, Folder, Link2, MessageSquare, Paperclip, Plus } from 'lucide-react';
import { getAssignment, downloadResourceFile, viewResourceFile, VIEWABLE_TYPES } from '../api';
import { courseAccent } from '../courseColors';
import AddTaskModal from '../components/AddTaskModal';
import TaskTags from '../components/TaskTags';
import './Assignments.css';

// The Assignments page: every assignment and personal task across your courses. A list on the
// left (filter by course and by status, grouped by when it's due) and the chosen task on
// the right: how it counts, its summary and the teacher's details, its files and links,
// and Mark as done. Opened from the main sidebar, the Dashboard's "View all tasks", and
// every hover card's "See full description" (focus = { id, nonce } selects that task).
//
// Props: tasks and courses (Dashboard's lists), onCompleteTask(id) / onReopenTask(id),
// onTaskCreated(task) for the Add task popup, onOpenCourseChat(courseId).

const FILTERS = [
  ['all', 'All'],
  ['upcoming', 'Upcoming'],
  ['late', 'Late'],
  ['done', 'Done'],
];
const DAY = 86400000;
// The list's grow-in (like the Planner's Tasks list): cards after this many start together,
// so ones far down (out of view) don't keep appearing long after the rest.
const GROW_MAX_STEP = 8;
const parseDue = (value) => (value ? new Date(String(value).replace(' ', 'T')) : null);
const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const dueLong = (date) => date.toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const dueShort = (date) => date.toLocaleDateString([], { weekday: 'short', day: 'numeric' });
const formatSize = (bytes) => (bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round((bytes || 0) / 1024))} KB`);
const shortDate = (value) => new Date(value).toLocaleDateString([], { month: 'short', day: 'numeric' });

// Which group a task goes in. Not done: Late, This week (through Saturday), Next week, Later,
// No due date. Done ones go last.
function groupOf(task, now) {
  if (task.status === 'done') return 'done';
  if (!task.due) return 'none';
  if (task.due < now) return 'late';
  const days = Math.round((startOfDay(task.due) - startOfDay(now)) / DAY);
  const leftThisWeek = 6 - now.getDay();
  if (days <= leftThisWeek) return 'week';
  if (days <= leftThisWeek + 7) return 'next';
  return 'later';
}
const GROUPS = [
  ['late', 'Late'],
  ['week', 'This week'],
  ['next', 'Next week'],
  ['later', 'Later'],
  ['none', 'No due date'],
  ['done', 'Done'],
];

export default function Assignments({ tasks = [], courses = [], onCompleteTask, onReopenTask, onTaskCreated, onOpenCourseChat, focus }) {
  const [courseFilter, setCourseFilter] = useState('all'); // 'all' or a course id
  const [filter, setFilter] = useState('all');
  const [selectedId, setSelectedId] = useState(null);
  const [fullById, setFullById] = useState({}); // id -> { details, resources } from GET /api/assignments/:id
  const [showAddTask, setShowAddTask] = useState(false);
  const [error, setError] = useState('');
  const [busyFile, setBusyFile] = useState(null);

  // "See full description" on a hover card: show all tasks, with that one selected.
  const [handledFocus, setHandledFocus] = useState(null);
  if (focus && focus.nonce !== handledFocus) {
    setHandledFocus(focus.nonce);
    setSelectedId(focus.id);
    setCourseFilter('all');
    setFilter('all');
  }

  const now = new Date();
  const all = tasks.map((task) => ({ ...task, due: parseDue(task.due_date) }));
  const inCourse = all.filter((task) => courseFilter === 'all' || task.course_id === courseFilter);
  const withGroup = inCourse.map((task) => ({ ...task, group: groupOf(task, now) }));
  const shown = withGroup.filter((task) =>
    filter === 'all' ? true
      : filter === 'done' ? task.group === 'done'
        : filter === 'late' ? task.group === 'late'
          : task.group !== 'done'
  );
  // Soonest first; late ones most recently due first, done ones most recently due first.
  const byDue = (a, b, newestFirst) => {
    if (!a.due || !b.due) return !a.due - !b.due;
    return newestFirst ? b.due - a.due : a.due - b.due;
  };
  const groups = GROUPS
    .map(([key, label]) => ({
      key,
      label,
      items: shown.filter((task) => task.group === key).sort((a, b) => byDue(a, b, key === 'late' || key === 'done')),
    }))
    .filter((group) => group.items.length > 0);
  const ordered = groups.flatMap((group) => group.items);
  const stepOf = new Map(ordered.map((task, index) => [task.id, Math.min(index, GROW_MAX_STEP)]));

  // The selected task, else the first one in the list (the soonest not-done task).
  const selected = all.find((task) => task.id === selectedId) ?? ordered[0] ?? null;
  const full = selected ? fullById[selected.id] : undefined;

  // The selected task's details and files, fetched once each.
  const selectedKey = selected?.id;
  const haveFull = full !== undefined;
  useEffect(() => {
    if (!selectedKey || haveFull) return;
    let cancelled = false;
    getAssignment(selectedKey)
      .then((data) => { if (!cancelled) setFullById((prev) => ({ ...prev, [selectedKey]: data })); })
      .catch((err) => { if (!cancelled) setFullById((prev) => ({ ...prev, [selectedKey]: { error: err.message } })); });
    return () => { cancelled = true; };
  }, [selectedKey, haveFull]);

  const counts = {
    upcoming: withGroup.filter((task) => !['late', 'done'].includes(task.group)).length,
    late: withGroup.filter((task) => task.group === 'late').length,
    done: withGroup.filter((task) => task.group === 'done').length,
  };

  const toggle = (task) => (task.status === 'done' ? onReopenTask : onCompleteTask)?.(task.id);

  async function download(resource) {
    setBusyFile(resource.id);
    try {
      await downloadResourceFile(resource);
      setError('');
    } catch (err) {
      setError(`Couldn't download "${resource.title}": ${err.message}`);
    } finally {
      setBusyFile(null);
    }
  }

  // Not async on purpose: the tab must open during the click, before anything awaits.
  function view(resource) {
    const tab = window.open('', '_blank');
    if (!tab) {
      setError('Your browser blocked the new tab. Allow pop-ups for this site, or use Download.');
      return;
    }
    tab.opener = null;
    tab.document.title = resource.title;
    tab.document.body.textContent = 'Loading...';
    setBusyFile(resource.id);
    viewResourceFile(resource, tab)
      .then(() => setError(''))
      .catch((err) => { tab.close(); setError(`Couldn't open "${resource.title}": ${err.message}`); })
      .finally(() => setBusyFile(null));
  }

  const renderItem = (task) => {
    const accent = courseAccent(courses, task.course_id);
    const done = task.status === 'done';
    const late = task.group === 'late';
    const files = Number(task.file_count) > 0;
    const links = Number(task.link_count) > 0;
    // index.css .grow-in-row / -cell / -item: the row opens from no height while the card
    // grows from tiny and see-through, top down. A card that joins later (a filter change)
    // grows in when it appears.
    return (
      <div key={task.id} className="grow-in-row" style={{ '--grow-step': stepOf.get(task.id) ?? 0, '--grow-gap': 0 }}>
      <div className="grow-in-cell">
      <button
        type="button"
        className={`tp-item grow-in-item${done ? ' done' : late ? ' late' : ''}${selected?.id === task.id ? ' on' : ''}`}
        style={{ '--c': accent }}
        onClick={() => setSelectedId(task.id)}
        aria-current={selected?.id === task.id ? 'true' : undefined}
      >
        <span className="tp-check" aria-hidden="true">{done && <Check size={11} strokeWidth={3.4} />}</span>
        <span className="tp-title-row">
          <strong><span className="tp-strike">{task.title}</span></strong>
          {files && <span className="tp-att f" title="Has files"><Paperclip size={12} strokeWidth={2.4} /></span>}
          {links && <span className="tp-att l" title="Has links"><Link2 size={12} strokeWidth={2.4} /></span>}
        </span>
        {done ? <span className="tp-when done">Done</span>
          : late ? <span className="tp-when late">LATE</span>
            : <span className="tp-when">{task.due ? dueShort(task.due) : 'No date'}</span>}
        <span className="tp-meta">
          <span className="tp-code">{task.course_code}</span>
          <span className="tp-sum">{task.description || 'No summary'}</span>
          {task.owner_user_id != null && <span className="tp-me">Only you</span>}
        </span>
      </button>
      </div>
      </div>
    );
  };

  const selectedAccent = selected ? courseAccent(courses, selected.course_id) : undefined;
  const selectedCourse = selected ? courses.find((c) => c.id === selected.course_id) : null;
  const resources = full?.resources ?? [];
  const fileRows = resources.filter((r) => r.type === 'file');
  const linkRows = resources.filter((r) => r.type === 'link');
  const personal = selected?.owner_user_id != null;
  const selectedLate = selected && selected.status !== 'done' && selected.due && selected.due < now;

  return (
    <div className="tp-page">
      {/* No page title (the sidebar already says Assignments): the counts on the left,
          Add task on the right, then the filters. */}
      <div className="tp-head">
        <div className="tp-stats">
          <span className="tp-stat"><b>{counts.upcoming}</b> upcoming</span>
          <span className="tp-stat late"><b>{counts.late}</b> late</span>
          <span className="tp-stat done"><b>{counts.done}</b> done</span>
        </div>
        <button type="button" className="add-task-button" onClick={() => setShowAddTask(true)} disabled={courses.length === 0}>
          <Plus size={15} strokeWidth={2.6} /> Add task
        </button>
      </div>

      <div className="tp-bar">
        <div className="tp-chips" role="group" aria-label="Course">
          <button type="button" className="tp-chip all" style={{ '--c': '#0f172a' }} aria-pressed={courseFilter === 'all'} onClick={() => setCourseFilter('all')}>
            All courses
          </button>
          {courses.map((course) => {
            const accent = courseAccent(courses, course.id);
            return (
              <button type="button" key={course.id} className="tp-chip" style={{ '--c': accent }} aria-pressed={courseFilter === course.id} onClick={() => setCourseFilter(course.id)}>
                <b style={{ background: accent }}>{course.course_code.split(' ')[0]}</b>{course.course_code}
              </button>
            );
          })}
        </div>
        <div className="tp-filters" role="group" aria-label="Show">
          {FILTERS.map(([key, label]) => (
            <button type="button" key={key} aria-pressed={filter === key} onClick={() => setFilter(key)}>{label}</button>
          ))}
        </div>
      </div>

      {error && <div className="tp-error" role="alert">{error}</div>}

      <div className="tp-panes">
        <div className="tp-list thin-scroll">
          {groups.length === 0 ? (
            <p className="tp-empty">{tasks.length === 0 ? 'No tasks yet.' : 'Nothing here.'}</p>
          ) : groups.map((group) => (
            <div key={group.key} className="tp-group">
              <p className={group.key === 'late' ? 'tp-group-label late' : 'tp-group-label'}>{group.label}</p>
              {group.items.map(renderItem)}
            </div>
          ))}
        </div>

        {selected && (
          <article className="tp-detail" style={{ '--c': selectedAccent }} aria-live="polite">
            <div className="tp-d-top">
              <span className="tp-cchip"><i aria-hidden="true" />{selected.course_code}{selectedCourse?.course_name && ` · ${selectedCourse.course_name}`}</span>
              <span className={selectedLate ? 'tp-d-due late' : 'tp-d-due'}>
                <Clock size={13} strokeWidth={2.4} />
                {selected.status === 'done' ? 'Done'
                  : selected.due ? `${selectedLate ? 'Was due' : 'Due'} ${dueLong(selected.due)}` : 'No due date'}
              </span>
            </div>
            <div>
              <h2>{selected.title}</h2>
              <TaskTags task={selected} className="tp-d-tags" />
              {personal && <p className="tp-d-by">Your personal task · Only you can see this</p>}
            </div>
            <div className="tp-d-actions">
              <button type="button" className={selected.status === 'done' ? 'tp-btn-done is-done' : 'tp-btn-done'} onClick={() => toggle(selected)}>
                <Check size={14} strokeWidth={3} />{selected.status === 'done' ? 'Done · Mark as not done' : 'Mark as done'}
              </button>
              {onOpenCourseChat && (
                <button type="button" className="tp-btn-ghost" onClick={() => onOpenCourseChat(selected.course_id)}>
                  <MessageSquare size={14} />Open {selected.course_code} chat
                </button>
              )}
            </div>

            <section className="tp-d-sec">
              <h3>Summary</h3>
              {selected.description ? <p className="tp-d-summary">{selected.description}</p> : <p className="tp-d-none">No summary added.</p>}
            </section>

            {!personal && (
              <>
                <section className="tp-d-sec">
                  <h3>Details</h3>
                  {full === undefined ? <p className="tp-d-none">Loading…</p>
                    : full.error ? <p className="tp-d-none">Couldn't load the details: {full.error}</p>
                      : full.details ? <p className="tp-d-details">{full.details}</p>
                        : <p className="tp-d-none">Your teacher hasn't added more details.</p>}
                </section>

                <section className="tp-d-sec">
                  <h3>Files &amp; links{resources.length > 0 && ` · ${resources.length}`}</h3>
                  {full === undefined ? <p className="tp-d-none">Loading…</p> : resources.length === 0 ? (
                    <p className="tp-d-none">No files or links.</p>
                  ) : (
                    <>
                      <ul className="tp-files">
                        {fileRows.map((r) => (
                          <li key={r.id}>
                            <span className="tp-f-ico" aria-hidden="true"><FileText size={16} /></span>
                            <span className="tp-f-text"><strong>{r.title}</strong><span>{r.file_name} · {formatSize(r.size_bytes)} · Added {shortDate(r.created_at)} by {r.uploaded_by_name}</span></span>
                            {VIEWABLE_TYPES.includes(r.mime_type) && (
                              <button type="button" className="tp-f-btn" onClick={() => view(r)} disabled={busyFile === r.id}>View</button>
                            )}
                            <button type="button" className="tp-f-btn primary" onClick={() => download(r)} disabled={busyFile === r.id}>
                              {busyFile === r.id ? '…' : 'Download'}
                            </button>
                          </li>
                        ))}
                        {linkRows.map((r) => (
                          <li key={r.id}>
                            <span className="tp-f-ico link" aria-hidden="true"><Link2 size={16} /></span>
                            <span className="tp-f-text"><strong>{r.title}</strong><span>{r.url}</span></span>
                            <a className="tp-f-btn" href={r.url} target="_blank" rel="noopener noreferrer">Open</a>
                          </li>
                        ))}
                      </ul>
                      <p className="tp-d-folder"><Folder size={13} aria-hidden="true" />Also in Resources → <b>{selected.course_code}</b> → <b>{selected.title}</b></p>
                    </>
                  )}
                </section>
              </>
            )}
          </article>
        )}
      </div>

      {showAddTask && (
        <AddTaskModal
          courses={courses}
          onClose={() => setShowAddTask(false)}
          onCreated={(created, course) => {
            onTaskCreated?.({ ...created, course_code: course.course_code, course_name: course.course_name });
            setSelectedId(created.id);
          }}
        />
      )}
    </div>
  );
}
