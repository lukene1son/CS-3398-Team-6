// Eased scrolling for the whole site (main.jsx turns it on once).
//
// Each scrollable box (or the page) follows a target position through a spring. A
// mouse-wheel step only moves the target; the spring keeps whatever speed it already has
// and pulls toward the new target. So scrolling starts gently, settles gently, and the
// speed never jumps when wheel steps (or a trackpad's many small ones) arrive mid-glide.
// The spring is critically damped: it settles as fast as it can without overshooting.
//
// At the top or bottom: the target may sit a little past the edge (up to EDGE_OVERSHOOT),
// so the scroll keeps its speed all the way to the edge instead of slowing into it. When
// it reaches the edge it stops there, losing all its momentum. Wheel steps that arrive
// while it's still gliding stay with the glide (never handed back to the browser, whose
// own instant scroll would jump the rest of the way to the edge).
//
// Left to the browser: pinch-zoom (ctrl + wheel), sideways scrolling, reduced motion,
// anything inside an element marked data-native-scroll, and a wheel step that has nowhere
// to go while nothing is gliding (so it can scroll the box or page around it, as normal).
// If something else moves a box while it's gliding (dragging its scrollbar, the keyboard,
// or code like a chat jumping to its newest message), the glide stops and lets that win.

// How quickly it follows: about 0.45s to settle after a single wheel step.
const STIFFNESS = 13; // the spring's natural frequency, per second
const STEP = 1 / 240; // seconds per physics step (frames are split into these, so it's
                      // the same on 60Hz and 144Hz screens)
const MAX_FRAME = 0.05; // a frame longer than this (tab was hidden, a stall) counts as 50ms
// How far past the top or bottom the target may go (px): enough that the scroll is still
// moving at a natural speed when it reaches the edge, not so much that it slams into it.
const EDGE_OVERSHOOT = 120;

const glides = new WeakMap(); // scroll box -> { pos, vel, target, last, time, frame }

const maxScroll = (box) => Math.max(0, box.scrollHeight - box.clientHeight);
const clamp = (value, box) => Math.max(0, Math.min(maxScroll(box), value));
const clampTarget = (value, box) => Math.max(-EDGE_OVERSHOOT, Math.min(maxScroll(box) + EDGE_OVERSHOOT, value));
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// 'instant' so a CSS scroll-behavior: smooth (the landing page sets one on <html>) doesn't
// start its own animation on every frame of ours.
const setTop = (box, top) => box.scrollTo({ top, behavior: 'instant' });

function frame(box, now) {
  const glide = glides.get(box);
  if (!glide) return;

  // Moved by something else since our last frame: stop and leave it there.
  if (Math.abs(box.scrollTop - glide.last) > 3) {
    glides.delete(box);
    return;
  }

  // Critically damped spring, stepped in small fixed slices so it's smooth and stable
  // at any frame rate. The target is re-clamped each frame in case the content's
  // height changed (rows loading or growing in).
  glide.target = clampTarget(glide.target, box);
  let time = Math.min((now - glide.time) / 1000, MAX_FRAME);
  glide.time = now;
  while (time > 0) {
    const h = Math.min(STEP, time);
    const pull = STIFFNESS * STIFFNESS * (glide.target - glide.pos) - 2 * STIFFNESS * glide.vel;
    glide.vel += pull * h;
    glide.pos += glide.vel * h;
    time -= h;
  }
  // Reached the top or bottom: stop right at the edge, with no momentum left.
  const max = maxScroll(box);
  if (glide.pos <= 0 && glide.vel < 0 || glide.pos >= max && glide.vel > 0) {
    setTop(box, glide.vel < 0 ? 0 : max);
    glides.delete(box);
    return;
  }

  // Close enough and nearly still: land exactly on the target and stop.
  if (Math.abs(glide.target - glide.pos) < 0.5 && Math.abs(glide.vel) < 10) {
    setTop(box, glide.target);
    glides.delete(box);
    return;
  }
  setTop(box, glide.pos);
  glide.last = box.scrollTop;
  glide.frame = requestAnimationFrame((t) => frame(box, t));
}

/**
 * Glides `box` (an element, or document.scrollingElement for the page) down by `delta` px
 * (up if negative). Returns false if it can't move that way, true if it's gliding.
 */
export function easeScrollBy(box, delta) {
  if (!box) return false;
  if (reducedMotion()) {
    box.scrollBy({ top: delta, behavior: 'instant' });
    return true;
  }
  const gliding = glides.get(box);
  if (gliding) {
    gliding.target = clampTarget(gliding.target + delta, box);
    return true;
  }
  const from = box.scrollTop;
  if (Math.abs(clamp(from + delta, box) - from) < 1) return false; // already at that edge
  const target = clampTarget(from + delta, box);
  const glide = { pos: from, vel: 0, target, last: from, time: performance.now(), frame: 0 };
  glides.set(box, glide);
  glide.frame = requestAnimationFrame((t) => frame(box, t));
  return true;
}

// Should `box` take a wheel step of `delta` px? Yes while it's gliding (the step joins the
// glide, even if it's already headed for the edge), otherwise only if it can move that way.
function canMove(box, delta) {
  if (glides.has(box)) return true;
  const at = box.scrollTop;
  return delta > 0 ? at < maxScroll(box) - 1 : at > 0;
}

// The innermost box under the pointer that scrolls up and down and can still move that
// way, else the page itself. null when nothing can move (or the pointer is over a
// data-native-scroll area).
function scrollBoxFor(node, delta) {
  for (let el = node; el && el !== document.body && el !== document.documentElement; el = el.parentElement) {
    if (el.hasAttribute('data-native-scroll')) return null;
    const { overflowY } = getComputedStyle(el);
    const scrolls = overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay';
    if (scrolls && maxScroll(el) > 1 && canMove(el, delta)) return el;
  }
  const page = document.scrollingElement;
  return page && canMove(page, delta) ? page : null;
}

function onWheel(event) {
  if (event.defaultPrevented || event.ctrlKey) return;
  if (Math.abs(event.deltaX) > Math.abs(event.deltaY) || event.deltaY === 0) return;
  if (reducedMotion()) return;
  const target = event.target instanceof Element ? event.target : event.target?.parentElement;
  if (!target) return;
  const box = scrollBoxFor(target, event.deltaY);
  if (!box) return;
  // deltaMode: 0 = pixels, 1 = lines, 2 = pages.
  const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? box.clientHeight : 1;
  if (easeScrollBy(box, event.deltaY * unit)) event.preventDefault();
}

let installed = false;

/** Turns eased wheel scrolling on for the whole page (once). */
export function installSmoothWheel() {
  if (installed) return;
  installed = true;
  // Not passive, so it can stop the browser's own (un-eased) scroll.
  window.addEventListener('wheel', onWheel, { passive: false });
}
