import { useLayoutEffect } from 'react';
import { ArrowRight, Clock, Link2, Lock, Paperclip } from 'lucide-react';
import { courseAccent } from '../../utils/courseColors';
import TaskTags from './TaskTags';
import './TaskHoverCard.css';

// The small card that fades in beside a task you hover (Dashboard, Planner, Spaces):
// course, when it's due, title, how it counts (graded / participation, extra credit),
// summary, and how many files and links it has.
//
// Shown by useTaskHoverCard (useTaskHoverCard.jsx), which a page uses once:
//   const hoverCard = useTaskHoverCard({ courses, onOpen });
//   <div {...hoverCard.bind(task)}>...</div>      on every task element
//   {hoverCard.card}                               once, anywhere
// onOpen(task) is the "See full description" button (hidden when not given).
//
// Opens after 0.2s of hovering (so sweeping across a list doesn't flash cards),
// at once when another card is already showing. Closes as soon as the pointer leaves
// both the task and the card, and on Escape, scrolling, or resizing. Focus opens it too.

const GAP = 10; // px between the task and the card
const EDGE = 12; // px kept clear of the window's edges

const parseDue = (value) => new Date(String(value).replace(' ', 'T'));
const time = (date) => date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

// "Due today, 2:30 PM" / "Due tomorrow, ..." / "Due Wed, ..." / "Due Nov 28, ..." / "Was due ...".
function dueText(task) {
  if (task.status === 'done') return { text: 'Done', late: false };
  const due = task.due instanceof Date ? task.due : task.due_date ? parseDue(task.due_date) : null;
  if (!due || Number.isNaN(due.getTime())) return { text: 'No due date', late: false };
  const now = new Date();
  const days = Math.round((new Date(due).setHours(0, 0, 0, 0) - new Date(now).setHours(0, 0, 0, 0)) / 86400000);
  const day = days === 0 ? 'today'
    : days === 1 ? 'tomorrow'
      : days > 1 && days < 7 ? due.toLocaleDateString([], { weekday: 'short' })
        : due.toLocaleDateString([], { month: 'short', day: 'numeric' });
  const late = due < now;
  return { text: `${late ? 'Was due' : 'Due'} ${day}, ${time(due)}`, late };
}

export default function TaskHoverCard({ task, anchor, visible, courses, onOpen, cardRef, onLeave }) {
  const accent = courseAccent(courses, task.course_id);
  const course = courses.find((c) => c.id === task.course_id);
  const due = dueText(task);
  const personal = task.owner_user_id != null;
  const files = Number(task.file_count) || 0;
  const links = Number(task.link_count) || 0;

  // Beside the task: right if it fits, else left, else below. Set on the element directly
  // (it needs the card's own size, known only once it's on the page).
  useLayoutEffect(() => {
    const card = cardRef.current;
    if (!card || !anchor.isConnected) return;
    const r = anchor.getBoundingClientRect();
    const w = card.offsetWidth;
    const h = card.offsetHeight;
    let side;
    let x;
    let y;
    if (r.right + GAP + w <= window.innerWidth - EDGE) { side = 'right'; x = r.right + GAP; }
    else if (r.left - GAP - w >= EDGE) { side = 'left'; x = r.left - GAP - w; }
    else { side = 'below'; x = Math.min(Math.max(r.left, EDGE), window.innerWidth - w - EDGE); }
    if (side === 'below') {
      y = r.bottom + GAP;
      card.style.setProperty('--thc-arrow', `${Math.max(14, Math.min(w - 24, r.left + 24 - x))}px`);
    } else {
      y = Math.min(Math.max(r.top + r.height / 2 - 26, EDGE), window.innerHeight - h - EDGE);
      card.style.setProperty('--thc-arrow', `${Math.max(12, Math.min(h - 24, r.top + r.height / 2 - y - 5))}px`);
    }
    card.dataset.side = side;
    card.style.left = `${x}px`;
    card.style.top = `${y}px`;
  }, [anchor, task, cardRef]);

  return (
    <div
      ref={cardRef}
      className={visible ? 'thc show' : 'thc'}
      role="tooltip"
      style={{ '--thc-c': accent }}
      onPointerLeave={onLeave}
    >
      <div className="thc-top">
        <span className="thc-course"><b aria-hidden="true" />{task.course_code || course?.course_code}</span>
        <span className={due.late ? 'thc-due late' : 'thc-due'}><Clock size={12} strokeWidth={2.4} />{due.text}</span>
      </div>
      <p className="thc-title">{task.title}</p>
      <TaskTags task={task} className="thc-tags" />
      <p className={task.description ? 'thc-summary' : 'thc-summary none'}>{task.description || 'No summary added.'}</p>
      <div className="thc-attach">
        {personal ? (
          <span className="thc-private"><Lock size={13} />Only you can see this</span>
        ) : files || links ? (
          <>
            {files > 0 && <span className="thc-files"><Paperclip size={14} />{files} file{files === 1 ? '' : 's'}</span>}
            {links > 0 && <span className="thc-links"><Link2 size={14} />{links} link{links === 1 ? '' : 's'}</span>}
          </>
        ) : (
          <span className="thc-none"><Paperclip size={14} />No files or links</span>
        )}
      </div>
      {onOpen && (
        <button type="button" className="thc-full" onClick={() => onOpen(task)}>
          See full description <ArrowRight size={14} strokeWidth={2.4} />
        </button>
      )}
    </div>
  );
}
