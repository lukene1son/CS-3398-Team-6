import { useEffect } from 'react';

// The "Why Choose BuddyTech?" cards' entrance. Nothing shows while you scroll toward them:
// once you've scrolled far enough that the cards' final spot is entirely on screen (its
// bottom edge in view), it plays by itself, once, and they stay:
//
//   reveal  "Peer Matching" slides down out from behind the text above, fading in from
//           under the text's bottom edge (Landing.css .glass-grid--armed: the mask);
//   split   partway through, it starts sliding left to its place, revealing "Tutoring &
//           Mentorship", while "Study Groups" slides out from behind it to the right:
//           slowly at first, speeding up into place.
//
// The cards fade from very faint to fully shown over the whole entrance. Only when the three
// cards sit side by side: stacked on a phone they're taller than the screen, so they just
// show normally there (and for reduced motion: enabled = false).

const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2);
const easeOut = (t) => 1 - (1 - t) ** 3; // quick, then gently into place
const easeIn = (t) => t * t;             // slow start, fastest as it arrives
const clamp01 = (x) => Math.max(0, Math.min(1, x));

// The timeline (ms from the start): the reveal, then the split, which starts partway through it.
const REVEAL_MS = 700;
const SPLIT_START_MS = 320, SPLIT_END_MS = 1100;
const TOTAL_MS = SPLIT_END_MS;
// How faint the cards are when they first start to appear (they reach full opacity at the end).
const START_OPACITY = 0.08;

// gridRef: the grid of three cards.
export function useFeatureCardsEntrance({ gridRef, enabled }) {
  useEffect(() => {
    if (!enabled) return;
    const grid = gridRef.current;
    if (!grid) return;
    const cards = [...grid.children];
    if (cards.length !== 3) return;

    let armed = false, playing = false, done = false, frame = 0, start = 0;
    let stack = [];  // per card: how far its place is from the middle card's (where they stack)
    let rise = 0;    // how far up the cards start: "Peer Matching" just behind the text

    function clear() {
      cards.forEach((c) => { c.style.transform = ''; c.style.opacity = ''; });
    }

    // Where each card's place is, from the layout (offsetLeft/Top ignore transforms), and
    // whether the entrance applies (side by side).
    function measure() {
      if (done) return;
      const [a, b, c] = cards;
      armed = a.offsetTop === b.offsetTop && b.offsetTop === c.offsetTop;
      grid.classList.toggle('glass-grid--armed', armed);
      if (!armed) { clear(); return; }
      stack = cards.map((card) => ({ x: b.offsetLeft - card.offsetLeft, y: b.offsetTop - card.offsetTop }));
      // The grid's box reaches up to the text's bottom edge (Landing.css), and while armed
      // it's the cards' offsetParent: start with the cards' bottom on its top edge, so
      // they're entirely behind the text.
      rise = -(b.offsetTop + b.offsetHeight);
      if (!playing) draw(0);
      check();
    }

    // The entrance at t ms in.
    function draw(t) {
      const reveal = easeOut(clamp01(t / REVEAL_MS));
      const split = easeIn(clamp01((t - SPLIT_START_MS) / (SPLIT_END_MS - SPLIT_START_MS)));
      const fade = START_OPACITY + (1 - START_OPACITY) * easeInOut(clamp01(t / TOTAL_MS));
      const away = 1 - split; // 1: on the stack, 0: in its own place
      const dy = rise * (1 - reveal);
      cards.forEach((card, k) => {
        card.style.transform = `translate(${(stack[k].x * away).toFixed(1)}px, ${(stack[k].y * away + dy).toFixed(1)}px)`;
        // The two behind fade in as they slide out from behind "Peer Matching", so while
        // they still overlap it they're too faint to show through the glass.
        const emerge = k === 0 ? 1 : clamp01(split * 1.6);
        card.style.opacity = (fade * emerge).toFixed(3);
      });
    }

    function tick(now) {
      const t = now - start;
      if (t >= TOTAL_MS) {
        frame = 0; playing = false; done = true;
        clear(); // in place: normal styles (and the hover lift) take over
        grid.classList.remove('glass-grid--armed');
        detach();
        return;
      }
      draw(t);
      frame = requestAnimationFrame(tick);
    }

    // Plays once the bottom of the cards' final spot is on screen.
    function check() {
      if (!armed || playing || done) return;
      if (grid.getBoundingClientRect().bottom <= window.innerHeight) {
        playing = true;
        start = performance.now();
        frame = requestAnimationFrame(tick);
      }
    }

    const onScroll = () => check();
    function detach() {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', measure);
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', measure);
    measure();

    return () => {
      detach();
      cancelAnimationFrame(frame);
      grid.classList.remove('glass-grid--armed');
      clear();
    };
  }, [enabled, gridRef]);
}
