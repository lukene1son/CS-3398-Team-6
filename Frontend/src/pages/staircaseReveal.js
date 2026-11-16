import { useEffect } from 'react';

// The "How BuddyTech Works" steps appear one after another as you scroll, each growing
// quickly out from behind the one before it (step 1 from behind the "Three steps…" line),
// like the study group channels in Spaces. A little scroll brings in a whole step (it plays
// on its own, quickly, rather than following the scroll); scrolling back up sends it back.
// While shown, each one slowly rocks a few degrees (Landing.css .stair--in).
//
// listRef: the <ol> of steps; leadRef: the line above them.

// Scrolling down, step k comes in once the top of the list is IN_AT px above the bottom of
// the screen, plus STEP_EVERY px more for each step before it. Scrolling back up, it leaves
// sooner: OUT_EARLY px before that, while it's still well up on the screen, so you see it
// tuck away. (In between, it stays as it is: which way you last scrolled decides.)
const IN_AT = 240, STEP_EVERY = 100, OUT_EARLY = 120;
// When one scroll moves several steps at once (a quick fling), they go one after another,
// this far apart: in order coming in, last-first going out (each behind the one before).
const STAGGER_S = 0.12;

export function useStaircaseReveal({ listRef, leadRef, enabled }) {
  useEffect(() => {
    if (!enabled) return;
    const list = listRef.current, lead = leadRef.current;
    if (!list || !lead) return;
    const steps = [...list.children];
    list.classList.add('staircase--armed'); // from here, steps are hidden until they come in

    // Where each step comes in from: the step before it (step 1: the line above), as an
    // offset from its own place. The steps' offsetTop/Left are from the list (it's positioned)
    // and ignore transforms, so this is the layout whatever's mid-animation.
    function measure() {
      const leadBottom = lead.getBoundingClientRect().bottom - list.getBoundingClientRect().top; // neither is transformed
      steps.forEach((step, k) => {
        const prev = steps[k - 1];
        const fromX = prev ? prev.offsetLeft - step.offsetLeft : 0;
        const fromY = prev ? prev.offsetTop - step.offsetTop : leadBottom - step.offsetTop;
        step.style.setProperty('--from-x', `${fromX}px`);
        step.style.setProperty('--from-y', `${fromY}px`);
      });
      update();
    }

    let frame = 0, lastY = window.scrollY;
    function update() {
      frame = 0;
      const scrolledIn = window.innerHeight - list.getBoundingClientRect().top;
      const up = window.scrollY < lastY;
      lastY = window.scrollY;
      const shouldBeIn = (step, k) => {
        const inAt = IN_AT + k * STEP_EVERY;
        if (up) return step.classList.contains('stair--in') && scrolledIn > inAt + OUT_EARLY; // only leaving
        return step.classList.contains('stair--in') || scrolledIn > inAt;                     // only coming in
      };
      const changing = steps.filter((step, k) => shouldBeIn(step, k) !== step.classList.contains('stair--in'));
      if (!changing.length) return;
      const goingIn = !changing[0].classList.contains('stair--in');
      if (!goingIn) changing.reverse(); // the last step tucks away first
      changing.forEach((step, i) => {
        step.style.setProperty('--stagger', `${i * STAGGER_S}s`);
        step.classList.toggle('stair--in', goingIn);
      });
    }

    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', measure);
    measure();

    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', measure);
      cancelAnimationFrame(frame);
      list.classList.remove('staircase--armed');
      steps.forEach((step) => { step.classList.remove('stair--in'); step.style.removeProperty('--stagger'); });
    };
  }, [enabled, listRef, leadRef]);
}
