import { useEffect, useRef, useState } from 'react';
import { ClipboardCheck, CheckSquare, FileText, Folder, Hand, Link2, Lock, Star, Upload, Users, X } from 'lucide-react';
import { addAssignmentLink, createAssignment, uploadAssignmentFile } from '../api';
import { courseAccent } from '../courseColors';
import './AddTaskModal.css';

// The Add Task popup (opened from the dashboard's Current Tasks panel).
// Everyone: course, title, due date, a one-line summary. A teacher or TA of the chosen
// course can also post it to the whole course, which adds how it counts (graded or
// participation, and extra credit), the long details, and files and links (saved in
// Resources, in a folder named after the assignment).
//
// Props: courses (from getMyCourses, with each one's role), onClose(), and
// onCreated(assignment, course) once the task exists.

const STAFF_ROLES = ['teacher', 'ta'];
const MAX_DETAILS = 20000;
const MAX_FILE_BYTES = 20 * 1024 * 1024; // the backend's limit

const pad = (n) => String(n).padStart(2, '0');
// End of the day `days` from today, local time, as a datetime-local value.
function dueIn(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T23:59`;
}
const fileSize = (bytes) => (bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);
// Only http(s) links (the backend checks too).
function cleanUrl(value) {
  try {
    const url = new URL(value.trim());
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

export default function AddTaskModal({ courses, onClose, onCreated }) {
  const [courseId, setCourseId] = useState(courses[0]?.id ?? null);
  const [audience, setAudience] = useState('me'); // 'me' | 'course'
  const [title, setTitle] = useState('');
  const [due, setDue] = useState(dueIn(0));
  const [summary, setSummary] = useState('');
  const [details, setDetails] = useState('');
  const [grading, setGrading] = useState('graded'); // 'graded' | 'participation'
  const [extraCredit, setExtraCredit] = useState(false);
  const [attachments, setAttachments] = useState([]); // { kind: 'file', file } | { kind: 'link', url, title }
  const [linkUrl, setLinkUrl] = useState('');
  const [linkTitle, setLinkTitle] = useState('');
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState('');
  const [titleMissing, setTitleMissing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [finished, setFinished] = useState(false); // created, but some uploads failed
  const titleRef = useRef(null);

  const course = courses.find((c) => c.id === courseId);
  const canPost = STAFF_ROLES.includes(course?.role);
  const toCourse = canPost && audience === 'course';

  useEffect(() => { titleRef.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (event) => { if (event.key === 'Escape' && !saving) onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, saving]);

  const addFiles = (fileList) => {
    const files = [...fileList];
    const tooBig = files.filter((file) => file.size > MAX_FILE_BYTES);
    setError(tooBig.length ? `${tooBig.map((f) => f.name).join(', ')}: files can be up to 20 MB.` : '');
    const ok = files.filter((file) => file.size <= MAX_FILE_BYTES);
    setAttachments((current) => [...current, ...ok.map((file) => ({ kind: 'file', file }))]);
  };

  const addLink = () => {
    const url = cleanUrl(linkUrl);
    if (!url) {
      setError('Links need to start with http:// or https://');
      return;
    }
    setError('');
    setAttachments((current) => [...current, { kind: 'link', url: url.href, title: linkTitle.trim() || url.hostname }]);
    setLinkUrl('');
    setLinkTitle('');
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (finished) return onClose();
    if (!title.trim()) {
      setTitleMissing(true);
      titleRef.current?.focus();
      return;
    }
    if (!course || !due) {
      setError('Pick a course and a due date.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const created = await createAssignment({
        course_id: course.id,
        title: title.trim(),
        description: summary.trim() || null,
        details: toCourse ? details.trim() || null : null,
        ...(toCourse && { grading, extra_credit: extraCredit }),
        due_date: `${due.replace('T', ' ')}:00`,
        personal: !toCourse,
      });
      onCreated(created, course);

      // The assignment needs its id before anything can be attached, so uploads come
      // after. One failing doesn't stop the rest; the task is already posted either way.
      const failed = [];
      if (toCourse) {
        for (const item of attachments) {
          try {
            if (item.kind === 'file') await uploadAssignmentFile(created.id, item.file);
            else await addAssignmentLink(created.id, { title: item.title, url: item.url });
          } catch {
            failed.push(item.kind === 'file' ? item.file.name : item.title);
          }
        }
      }
      if (failed.length === 0) return onClose();
      setFinished(true);
      setError(`The assignment was posted, but these didn't upload: ${failed.join(', ')}. You can add them from Resources.`);
    } catch (err) {
      setError(err.message || 'Could not create the task.');
    } finally {
      setSaving(false);
    }
  };

  const submitLabel = finished ? 'Close' : saving ? 'Saving…' : toCourse ? `Post to ${course.course_code}` : 'Add task';

  return (
    <div className="atm-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose(); }}>
      <form className="atm" role="dialog" aria-modal="true" aria-labelledby="atm-title" onSubmit={handleSubmit} noValidate>
        <div className="atm-head">
          <div className="atm-icon" aria-hidden="true"><CheckSquare size={20} /></div>
          <div>
            <h2 id="atm-title">{toCourse ? 'Post an assignment' : 'Add a task'}</h2>
            <p>{canPost ? 'For yourself, or posted to a whole course.' : 'A private to-do for one of your courses.'}</p>
          </div>
          <button type="button" className="atm-close" onClick={onClose} disabled={saving} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <section className="atm-card">
          <p className="atm-card-title">Course</p>
          <div className="atm-chips" role="group" aria-label="Course">
            {courses.map((c) => {
              const accent = courseAccent(courses, c.id);
              return (
                <button
                  type="button"
                  key={c.id}
                  className="atm-chip"
                  style={{ '--c': accent }}
                  aria-pressed={c.id === courseId}
                  onClick={() => setCourseId(c.id)}
                >
                  <b style={{ background: accent }}>{c.course_code.split(' ')[0]}</b>
                  {c.course_code} · {c.course_name}
                </button>
              );
            })}
          </div>
          {canPost && (
            <div className="atm-seg" role="group" aria-label="Who sees it">
              <button type="button" aria-pressed={audience === 'me'} onClick={() => setAudience('me')}>
                <Lock size={18} />
                <span><strong>Just me</strong><small>A private to-do</small></span>
              </button>
              <button type="button" aria-pressed={audience === 'course'} onClick={() => setAudience('course')}>
                <Users size={18} />
                <span><strong>Whole course</strong><small>Everyone in {course.course_code}</small></span>
              </button>
            </div>
          )}
        </section>

        <section className="atm-card">
          <p className="atm-card-title">Task</p>
          <label className="atm-field">
            <span>Title</span>
            <input
              ref={titleRef}
              type="text"
              maxLength={255}
              value={title}
              className={titleMissing ? 'atm-invalid' : undefined}
              placeholder={toCourse ? 'e.g. Sprint 3 retrospective' : 'e.g. Review lecture 9 notes'}
              onChange={(event) => { setTitle(event.target.value); setTitleMissing(false); }}
            />
          </label>
          {titleMissing && <p className="atm-error">Give the task a title.</p>}
          <div className="atm-field">
            <span>Due</span>
            <div className="atm-due">
              <input type="datetime-local" value={due} onChange={(event) => setDue(event.target.value)} aria-label="Due date and time" />
              <button type="button" className="atm-quick" onClick={() => setDue(dueIn(0))}>Today</button>
              <button type="button" className="atm-quick" onClick={() => setDue(dueIn(1))}>Tomorrow</button>
              <button type="button" className="atm-quick" onClick={() => setDue(dueIn(7))}>Next week</button>
            </div>
          </div>
          <label className="atm-field">
            <span>Summary <small>(shown in task lists)</small></span>
            <input type="text" maxLength={5000} value={summary} placeholder="One line about what this is" onChange={(event) => setSummary(event.target.value)} />
          </label>
        </section>

        {toCourse && (
          <>
            <section className="atm-card">
              <p className="atm-card-title">How it counts</p>
              <div className="atm-seg" role="group" aria-label="How it counts">
                <button type="button" aria-pressed={grading === 'graded'} onClick={() => setGrading('graded')}>
                  <ClipboardCheck size={18} />
                  <span><strong>Graded</strong><small>Scored, counts toward the grade</small></span>
                </button>
                <button type="button" aria-pressed={grading === 'participation'} onClick={() => setGrading('participation')}>
                  <Hand size={18} />
                  <span><strong>Participation</strong><small>Credit for taking part</small></span>
                </button>
              </div>
              <label className={extraCredit ? 'atm-extra on' : 'atm-extra'}>
                <input type="checkbox" checked={extraCredit} onChange={(event) => setExtraCredit(event.target.checked)} />
                <Star size={16} aria-hidden="true" />
                <span><strong>Extra credit</strong><small>Optional, for bonus points</small></span>
              </label>
            </section>

            <section className="atm-card">
              <p className="atm-card-title">Details <span className="atm-tag">Students see this when they open it</span></p>
              <textarea
                rows={5}
                maxLength={MAX_DETAILS}
                value={details}
                aria-label="Details"
                placeholder="What the assignment involves, steps, what to hand in, how it's graded…"
                onChange={(event) => setDetails(event.target.value)}
              />
              <span className="atm-counter">{details.length.toLocaleString()} / {MAX_DETAILS.toLocaleString()}</span>
            </section>

            <section className="atm-card">
              <p className="atm-card-title">Files &amp; links <span className="atm-tag">Optional</span></p>
              <label
                className={dragging ? 'atm-drop over' : 'atm-drop'}
                onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={(event) => { event.preventDefault(); setDragging(false); addFiles(event.dataTransfer.files); }}
              >
                <input type="file" multiple onChange={(event) => { addFiles(event.target.files); event.target.value = ''; }} />
                <Upload size={22} aria-hidden="true" />
                <div>Drop files here or <strong>browse</strong></div>
                <small>PDF, Office, images, zip or code · up to 20 MB each</small>
              </label>
              <div className="atm-link-row">
                <input type="url" value={linkUrl} placeholder="https://…" aria-label="Link address" onChange={(event) => setLinkUrl(event.target.value)} />
                <input type="text" value={linkTitle} placeholder="Link name" aria-label="Link name" maxLength={200} onChange={(event) => setLinkTitle(event.target.value)} />
                <button type="button" onClick={addLink}>Add link</button>
              </div>
              {attachments.length > 0 && (
                <ul className="atm-attached">
                  {attachments.map((item, index) => {
                    const name = item.kind === 'file' ? item.file.name : item.title;
                    return (
                      <li key={`${name}-${index}`}>
                        <span className={item.kind === 'link' ? 'atm-ico link' : 'atm-ico'}>
                          {item.kind === 'file' ? <FileText size={16} /> : <Link2 size={16} />}
                        </span>
                        <span className="atm-name">{name}</span>
                        <span className="atm-meta">{item.kind === 'file' ? fileSize(item.file.size) : new URL(item.url).hostname}</span>
                        <button
                          type="button"
                          aria-label={`Remove ${name}`}
                          onClick={() => setAttachments((current) => current.filter((_, i) => i !== index))}
                        >
                          <X size={14} />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
              <p className="atm-folder">
                <Folder size={14} aria-hidden="true" />
                Also saved in Resources → <b>{course.course_code}</b> → <b>{title.trim() || 'this assignment'}</b>
              </p>
            </section>
          </>
        )}

        {error && <p className="atm-error" role="alert">{error}</p>}

        <div className="atm-foot">
          <span className="atm-who">
            {toCourse ? <Users size={14} /> : <Lock size={14} />}
            {toCourse ? `Everyone in ${course.course_code} will see this` : 'Only you will see this'}
          </span>
          {!finished && <button type="button" className="atm-ghost" onClick={onClose} disabled={saving}>Cancel</button>}
          <button type="submit" className="atm-primary" disabled={saving}>{submitLabel}</button>
        </div>
      </form>
    </div>
  );
}
