import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import TaskHoverCard from './TaskHoverCard';

// Open/close logic for the task hover card (TaskHoverCard.jsx explains what it shows
// and how it behaves). Returns bind(task), the handlers for a task element; card, to
// render once on the page; and close().
const OPEN_DELAY = 200; // ms of hovering before it opens

export function useTaskHoverCard({ courses = [], onOpen } = {}) {
  const [shown, setShown] = useState(null); // { task, anchor } (kept while it fades out)
  const [visible, setVisible] = useState(false);
  const openTimer = useRef(0);
  const cardRef = useRef(null);
  const visibleRef = useRef(false); // read in event handlers only

  const close = useCallback(() => {
    clearTimeout(openTimer.current);
    visibleRef.current = false;
    setVisible(false);
  }, []);

  const open = useCallback((task, anchor) => {
    visibleRef.current = true;
    setShown({ task, anchor });
    setVisible(true);
  }, []);

  useEffect(() => {
    if (!visible) return undefined;
    const onKey = (event) => { if (event.key === 'Escape') close(); };
    // capture: a scroll inside any box (the Planner's Tasks list) closes it too.
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    document.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [visible, close]);

  useEffect(() => () => clearTimeout(openTimer.current), []);

  const intoCard = (node) => node instanceof Node && Boolean(cardRef.current?.contains(node));

  const bind = (task) => ({
    onPointerEnter: (event) => {
      const anchor = event.currentTarget;
      clearTimeout(openTimer.current);
      if (visibleRef.current) open(task, anchor);
      else openTimer.current = setTimeout(() => open(task, anchor), OPEN_DELAY);
    },
    onPointerLeave: (event) => {
      clearTimeout(openTimer.current);
      if (!intoCard(event.relatedTarget)) close();
    },
    onFocus: (event) => open(task, event.currentTarget),
    onBlur: (event) => { if (!intoCard(event.relatedTarget)) close(); },
  });

  const onCardLeave = (event) => {
    if (!(event.relatedTarget instanceof Node && shown?.anchor.contains(event.relatedTarget))) close();
  };

  const handleOpen = onOpen && ((task) => { close(); onOpen(task); });

  const card = shown && createPortal(
    <TaskHoverCard
      task={shown.task}
      anchor={shown.anchor}
      visible={visible}
      courses={courses}
      onOpen={handleOpen}
      cardRef={cardRef}
      onLeave={onCardLeave}
    />,
    document.body
  );

  // close: for a page to call when the task changes under the card (checked off, say).
  return { bind, card, close };
}
