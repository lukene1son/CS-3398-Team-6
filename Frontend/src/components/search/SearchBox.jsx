import { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, CheckSquare, Loader2, MessageSquare, Search, X } from 'lucide-react';
import { search } from '../../api';
import './SearchBox.css';

// The header search bar. Searches, as you type:
//   Spaces    your courses (matched here, no request)
//   Tasks     your assignments        (GET /api/me/search)
//   Messages  chats you can read      (GET /api/me/search)
// A date like 2026-11-20 finds tasks due that day. Pick a result to jump to it.
//
// Props: courses, onOpenSpace(courseId), onOpenAssignment(task), onOpenMessage(message)

const MIN_CHARS = 2;
const DEBOUNCE_MS = 350;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const snippet = (text, max = 90) => {
  const flat = String(text ?? '').replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
};
const dueLabel = (value) => {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

export default function SearchBox({ courses, onOpenSpace, onOpenAssignment, onOpenMessage }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [remote, setRemote] = useState({ key: '', messages: [], assignments: [], error: '' });
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);
  const rootRef = useRef(null);

  const text = query.trim();
  const isDate = DATE_RE.test(text);
  const searchable = isDate || text.length >= MIN_CHARS;
  const loading = searchable && remote.key !== text;

  // Debounced request. A newer query makes an older response stale (remote.key no longer matches).
  useEffect(() => {
    if (!searchable) return undefined;
    let cancelled = false;
    const timer = setTimeout(() => {
      (isDate ? search('', text) : search(text))
        .then((data) => {
          if (!cancelled) setRemote({ key: text, messages: data.messages || [], assignments: data.assignments || [], error: '' });
        })
        .catch((err) => {
          if (!cancelled) setRemote({ key: text, messages: [], assignments: [], error: err.message || 'Search failed' });
        });
    }, DEBOUNCE_MS);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [text, searchable, isDate]);

  const spaces = useMemo(() => {
    if (!searchable || isDate) return [];
    const words = text.toLowerCase().split(/\s+/);
    return courses
      .filter((c) => {
        const hay = `${c.course_code} ${c.course_name} ${c.professor || ''}`.toLowerCase();
        return words.every((w) => hay.includes(w));
      })
      .slice(0, 5);
  }, [courses, text, searchable, isDate]);

  const fresh = remote.key === text;
  const tasks = fresh ? remote.assignments : [];
  const messages = fresh ? remote.messages : [];

  // One flat list so the arrow keys walk across the groups.
  const items = [
    ...spaces.map((c) => ({ id: `s${c.id}`, run: () => onOpenSpace(c.id) })),
    ...tasks.map((t) => ({ id: `t${t.id}`, run: () => onOpenAssignment(t) })),
    ...messages.map((m) => ({ id: `m${m.kind}${m.id}`, run: () => onOpenMessage(m) }))
  ];

  useEffect(() => { setActive(0); }, [text, remote.key]);

  useEffect(() => {
    const onDown = (event) => { if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  // "/" focuses the search bar (unless you're typing somewhere).
  useEffect(() => {
    const onKey = (event) => {
      const tag = event.target.tagName;
      if (event.key === '/' && !event.metaKey && !event.ctrlKey && tag !== 'INPUT' && tag !== 'TEXTAREA' && !event.target.isContentEditable) {
        event.preventDefault();
        inputRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const pick = (item) => {
    item.run();
    setOpen(false);
    setQuery('');
    inputRef.current?.blur();
  };

  const onKeyDown = (event) => {
    if (event.key === 'Escape') {
      if (open) setOpen(false); else { setQuery(''); inputRef.current?.blur(); }
    } else if (event.key === 'ArrowDown' && items.length) {
      event.preventDefault(); setOpen(true); setActive((i) => (i + 1) % items.length);
    } else if (event.key === 'ArrowUp' && items.length) {
      event.preventDefault(); setActive((i) => (i - 1 + items.length) % items.length);
    } else if (event.key === 'Enter' && open && items[active]) {
      event.preventDefault(); pick(items[active]);
    }
  };

  const showPanel = open && text.length > 0;
  const empty = searchable && fresh && !remote.error && items.length === 0;
  let index = -1;
  const optionProps = (item) => {
    index += 1;
    const i = index;
    return {
      id: `sb-${item.id}`, role: 'option', 'aria-selected': i === active,
      className: `sb-item${i === active ? ' is-active' : ''}`,
      onMouseEnter: () => setActive(i),
      onMouseDown: (event) => event.preventDefault(), // keep focus in the input until the click lands
      onClick: () => pick(items[i])
    };
  };

  return (
    <div className="sb" ref={rootRef}>
      <Search size={18} className="sb-icon" aria-hidden="true" />
      <input
        ref={inputRef}
        type="text"
        className="sb-input"
        value={query}
        placeholder="Search spaces, tasks and messages…  ( / )"
        onChange={(event) => { setQuery(event.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        role="combobox"
        aria-expanded={showPanel}
        aria-controls="sb-list"
        aria-autocomplete="list"
        aria-activedescendant={showPanel && items[active] ? `sb-${items[active].id}` : undefined}
        aria-label="Search"
        autoComplete="off"
      />
      {loading && <Loader2 size={16} className="sb-spin" aria-hidden="true" />}
      {!loading && query && (
        <button type="button" className="sb-clear" aria-label="Clear search" onClick={() => { setQuery(''); inputRef.current?.focus(); }}>
          <X size={14} />
        </button>
      )}

      {showPanel && (
        <div className="sb-panel" id="sb-list" role="listbox">
          {!searchable && <p className="sb-note">Type at least {MIN_CHARS} letters, or a date like 2026-11-20.</p>}
          {remote.error && fresh && <p className="sb-note sb-err">{remote.error}</p>}
          {loading && items.length === 0 && searchable && <p className="sb-note">Searching…</p>}
          {empty && <p className="sb-note">No results for “{text}”.</p>}

          {spaces.length > 0 && <div className="sb-group">Spaces</div>}
          {spaces.map((c) => {
            const item = items.find((x) => x.id === `s${c.id}`);
            return (
              <div key={item.id} {...optionProps(item)}>
                <BookOpen size={16} />
                <span className="sb-main"><b>{c.course_code}</b> {c.course_name}</span>
              </div>
            );
          })}

          {tasks.length > 0 && <div className="sb-group">Tasks</div>}
          {tasks.map((t) => {
            const item = items.find((x) => x.id === `t${t.id}`);
            return (
              <div key={item.id} {...optionProps(item)}>
                <CheckSquare size={16} />
                <span className="sb-main">{t.title} <small>{t.course_code}</small></span>
                <span className="sb-meta">{dueLabel(t.due_date)}</span>
              </div>
            );
          })}

          {messages.length > 0 && <div className="sb-group">Messages</div>}
          {messages.map((m) => {
            const item = items.find((x) => x.id === `m${m.kind}${m.id}`);
            return (
              <div key={item.id} {...optionProps(item)}>
                <MessageSquare size={16} />
                <span className="sb-main">
                  {snippet(m.content)}
                  <small>{m.author_name} · {m.place}</small>
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
