import { useEffect, useRef, useState } from 'react';
import { Check, Copy, FolderPlus, X } from 'lucide-react';
import { createSpace, joinSpace } from '../../api';
import { courseAccent } from '../../utils/courseColors';
import './SpaceModal.css';

// The "Join or create a space" popup (opened from the dashboard's Study Spaces panel).
//   Join   - type a space's join code.
//   Create - make a new space; you become its administrator and get a code to share.
//   Share  - the codes of the spaces you're a teacher or TA of, to pass on to classmates.
//            Only shown to teachers and TAs.
//
// Props:
//   courses   from getMyCourses (each has join_code), for the Share tab
//   onClose() close the popup
//   onChanged() a space was joined or created (the dashboard reloads its list)
//   onOpen(course) "Open space" on the finished screen

const EMPTY_FORM = { course_code: '', course_name: '', professor: '', university: '' };
const ADMIN_ROLES = ['teacher', 'ta'];

export default function SpaceModal({ courses, onClose, onChanged, onOpen }) {
  const [tab, setTab] = useState('join'); // 'join' | 'create' | 'share'
  const [code, setCode] = useState('');
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null); // { course, created, already } once it worked
  const [copied, setCopied] = useState('');
  const firstField = useRef(null);

  // Share codes is only for a space's administrators (teacher, TA): students don't get
  // the tab at all. (The backend also sends join_code as null to students.)
  const shareable = courses.filter((course) => ADMIN_ROLES.includes(course.role) && course.join_code);
  const canShare = courses.some((course) => ADMIN_ROLES.includes(course.role));
  const tabs = [['join', 'Join with a code'], ['create', 'Create a space'], ...(canShare ? [['share', 'Share codes']] : [])];

  useEffect(() => { firstField.current?.focus(); }, [tab, result]);
  useEffect(() => {
    const onKey = (event) => { if (event.key === 'Escape' && !busy) onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, busy]);

  const switchTab = (next) => {
    setTab(next);
    setError('');
  };

  const setField = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }));

  const copyCode = async (value) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(value);
      setTimeout(() => setCopied((current) => (current === value ? '' : current)), 1500);
    } catch {
      /* clipboard blocked (e.g. plain http): the code is still on screen to copy by hand */
    }
  };

  const handleJoin = async (event) => {
    event.preventDefault();
    if (code.trim().length < 4) {
      setError("Enter the space's join code.");
      firstField.current?.focus();
      return;
    }
    setBusy(true);
    setError('');
    try {
      const course = await joinSpace(code.trim());
      setResult({ course, created: false, already: course.joined === false });
      onChanged();
    } catch (err) {
      setError(err.message || 'Could not join that space.');
    } finally {
      setBusy(false);
    }
  };

  const handleCreate = async (event) => {
    event.preventDefault();
    if (!form.course_code.trim() || !form.course_name.trim()) {
      setError('A course code and a space name are required.');
      firstField.current?.focus();
      return;
    }
    setBusy(true);
    setError('');
    try {
      const course = await createSpace({
        course_code: form.course_code.trim(),
        course_name: form.course_name.trim(),
        professor: form.professor.trim(),
        university: form.university.trim()
      });
      setResult({ course, created: true, already: false });
      onChanged();
    } catch (err) {
      setError(err.message || 'Could not create the space.');
    } finally {
      setBusy(false);
    }
  };

  // A function that returns JSX, not a component: a component made inside another one is rebuilt on every render.
  const renderCode = (value) => (
    <div className="spm-codebox">
      <code>{value}</code>
      <button type="button" className="spm-copy" onClick={() => copyCode(value)} aria-label={`Copy join code ${value}`}>
        {copied === value ? <><Check size={14} /> Copied</> : <><Copy size={14} /> Copy</>}
      </button>
    </div>
  );

  return (
    <div className="spm-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <div className="spm" role="dialog" aria-modal="true" aria-labelledby="spm-title">
        <div className="spm-head">
          <div className="spm-icon" aria-hidden="true"><FolderPlus size={20} /></div>
          <div>
            <h2 id="spm-title">Join or create a space</h2>
            <p>Study Spaces are where a course (or study group) chats and shares tasks.</p>
          </div>
          <button type="button" className="spm-close" onClick={onClose} disabled={busy} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {result ? (
          <div className="spm-card spm-done">
            <div className="spm-done-check" aria-hidden="true"><Check size={22} /></div>
            <h3>
              {result.created ? 'Space created' : result.already ? "You're already in this space" : 'You joined the space'}
            </h3>
            <p className="spm-done-name"><strong>{result.course.course_code}</strong> {result.course.course_name}</p>
            {result.created && (
              <>
                <p className="spm-help">Share this join code so classmates can join:</p>
                {renderCode(result.course.join_code)}
                <p className="spm-help">You can find it again on the Share tab.</p>
              </>
            )}
            <div className="spm-actions">
              <button type="button" className="spm-secondary" onClick={onClose}>Close</button>
              <button type="button" className="spm-primary" onClick={() => onOpen(result.course)}>Open space</button>
            </div>
          </div>
        ) : (
          <>
            {/* One column per tab shown (2 for students, 3 for teachers and TAs). */}
            <div className="spm-tabs" role="tablist" style={{ gridTemplateColumns: `repeat(${tabs.length}, 1fr)` }}>
              {tabs.map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={tab === id}
                  className="spm-tab"
                  onClick={() => switchTab(id)}
                >
                  {label}
                </button>
              ))}
            </div>

            {tab === 'join' && (
              <form className="spm-card" onSubmit={handleJoin} noValidate>
                <label className="spm-field">
                  <span>Join code</span>
                  <input
                    ref={firstField}
                    type="text"
                    className="spm-code-input"
                    value={code}
                    onChange={(event) => setCode(event.target.value.toUpperCase())}
                    placeholder="e.g. K7M2QX4P"
                    maxLength={20}
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <small>Ask your teacher or a TA for the code.</small>
                </label>
                {error && <p className="spm-error" role="alert">{error}</p>}
                <div className="spm-actions">
                  <button type="button" className="spm-secondary" onClick={onClose} disabled={busy}>Cancel</button>
                  <button type="submit" className="spm-primary" disabled={busy}>{busy ? 'Joining…' : 'Join space'}</button>
                </div>
              </form>
            )}

            {tab === 'create' && (
              <form className="spm-card" onSubmit={handleCreate} noValidate>
                <div className="spm-row">
                  <label className="spm-field">
                    <span>Course code</span>
                    <input ref={firstField} type="text" value={form.course_code} onChange={setField('course_code')} placeholder="CS 3398" maxLength={50} />
                  </label>
                  <label className="spm-field spm-grow">
                    <span>Space name</span>
                    <input type="text" value={form.course_name} onChange={setField('course_name')} placeholder="Software Engineering study group" maxLength={255} />
                  </label>
                </div>
                <div className="spm-row">
                  <label className="spm-field">
                    <span>Professor <small>(optional)</small></span>
                    <input type="text" value={form.professor} onChange={setField('professor')} maxLength={255} />
                  </label>
                  <label className="spm-field">
                    <span>University <small>(optional)</small></span>
                    <input type="text" value={form.university} onChange={setField('university')} maxLength={255} />
                  </label>
                </div>
                <p className="spm-help">You'll be the space's administrator and get a #general channel and a join code to share.</p>
                {error && <p className="spm-error" role="alert">{error}</p>}
                <div className="spm-actions">
                  <button type="button" className="spm-secondary" onClick={onClose} disabled={busy}>Cancel</button>
                  <button type="submit" className="spm-primary" disabled={busy}>{busy ? 'Creating…' : 'Create space'}</button>
                </div>
              </form>
            )}

            {tab === 'share' && canShare && (
              <div className="spm-card">
                {shareable.length === 0 ? (
                  <p className="spm-help">Your spaces' codes will show up here.</p>
                ) : (
                  <ul className="spm-list">
                    {shareable.map((course) => (
                      <li key={course.id} style={{ '--c': courseAccent(courses, course.id) }}>
                        <div className="spm-list-name">
                          <b>{course.course_code}</b>
                          <span>{course.course_name}</span>
                        </div>
                        {renderCode(course.join_code)}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
