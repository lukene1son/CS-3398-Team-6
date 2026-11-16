import { ClipboardCheck, Hand, Star } from 'lucide-react';

// How a course assignment counts, as small tags: "Graded" or "Participation", plus
// "Extra credit". Set by the teacher or TA who posted it (the Add Task popup); personal
// tasks have no grading, so nothing shows for them. Styles: index.css .task-tag.
// Used by the hover card (TaskHoverCard.jsx) and the Assignments page.
export default function TaskTags({ task, className = '' }) {
  const grading = task.grading;
  const extra = Number(task.extra_credit) === 1 || task.extra_credit === true;
  if (!grading && !extra) return null;
  return (
    <span className={`task-tags ${className}`.trim()}>
      {grading === 'graded' && <span className="task-tag graded"><ClipboardCheck size={12} strokeWidth={2.4} aria-hidden="true" />Graded</span>}
      {grading === 'participation' && <span className="task-tag participation"><Hand size={12} strokeWidth={2.4} aria-hidden="true" />Participation</span>}
      {extra && <span className="task-tag extra"><Star size={12} strokeWidth={2.4} aria-hidden="true" />Extra credit</span>}
    </span>
  );
}
