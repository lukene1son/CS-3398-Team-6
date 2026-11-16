import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Users, GraduationCap, Laptop, Sparkles } from 'lucide-react';
import './Landing.css';
import AsciiBackground from './AsciiBackground';
import { useHeroSeam } from './heroSeam';
import { useFeatureCardsEntrance } from './featureCardsPin';
import { useStudyScene } from './studyScene';
import { useStaircaseReveal } from './staircaseReveal';

// ---------- Below the hero ----------
// The feature cards and steps, each with one of the hero art's colours (teal, amber, violet).
const FEATURES = [
  { icon: Users, title: 'Peer Matching', color: '#5eead4',
    text: 'Connect with classmates and peers working on similar assignments and programming challenges.' },
  { icon: GraduationCap, title: 'Tutoring & Mentorship', color: '#fcd34d',
    text: "Learn from upperclassmen and mentors who have already conquered the classes you're taking." },
  { icon: Laptop, title: 'Study Groups', color: '#c4b5fd',
    text: 'Form focused study cohorts for computer science, software engineering, and lab assignments.' },
];
const STEPS = [
  { title: 'Join your course spaces', color: '#0d9488',
    text: 'Every course has its own space with channels for homework help, exam prep, and general chat.' },
  { title: 'Chat and stay organized', color: '#7c3aed',
    text: 'Talk with classmates in real time and track assignments in your planner.' },
  { title: 'Study smarter with AI', color: '#d97706',
    text: 'Summarize notes, generate practice questions, and get concepts explained on demand.' },
];
// The faint ASCII texture across the call to action: a fixed pattern of the art's characters.
// It's written out twice, one copy under the other, so it can drift up by exactly one copy
// and loop with no seam (Landing.css .gradient-cta-ascii).
const CTA_GLYPHS = '/\\|_-=+()<>.:*';
const CTA_BLOCK = Array.from({ length: 40 }, (_, r) =>
  Array.from({ length: 170 }, (_, c) => CTA_GLYPHS[(r * 7 + c * 3 + ((c * r) % 5)) % CTA_GLYPHS.length]).join('')
).join('\n');
const CTA_ASCII = `${CTA_BLOCK}\n${CTA_BLOCK}`;

// ---------- The hero's entrance ----------
// Whenever this page opens (load, refresh, or after signing out):
//   1. the heading is typed out;
//   2. when it's done, the badge grows out from behind it (Landing.css .hero-badge-in) and,
//      a moment later, the subtitle starts typing;
//   3. when the subtitle is done, "Find a Tech Buddy" drops into the centre, then "Explore
//      Features" slides out from behind it and they settle side by side (.hero-actions-in).
// The "How BuddyTech Works" heading and the line under it are typed out the same way, the
// first time the heading is fully on screen; after that they stay typed (until a refresh).
//
// Each typed line is a list of parts, so a part can have its own class (the blue "BuddyTech"),
// and has its own pace (ms): per character, after a comma or period, and a breath every
// fourth word. Headings are typed a little slower, the longer lines under them a little faster.
const HEADING_PACE = { char: 38, punctuation: 175, breath: 105 };
const SUBTITLE_PACE = { char: 20, punctuation: 95, breath: 55 };
// The hero's subtitle is long, so it's typed a bit quicker still.
const HERO_SUBTITLE_PACE = { char: 15, punctuation: 75, breath: 42 };
const HERO_LINES = [
  { pace: HEADING_PACE, parts: [{ text: 'Learn, Build, and Connect with ' }, { text: 'BuddyTech', className: 'hero-highlight' }] },
  { pace: HERO_SUBTITLE_PACE, parts: [{ text: 'Find peer mentors, collaborate on technical coursework, and master your software skills together.' }] },
];
const HOW_LINES = [
  { pace: HEADING_PACE, parts: [{ text: 'How BuddyTech Works' }] },
  { pace: SUBTITLE_PACE, parts: [{ text: 'Three steps from "I\'m stuck" to "I\'ve got this."' }] },
];
const lineText = (line) => line.parts.map((part) => part.text).join('');
const HERO_START_MS = 200;     // the hero heading starts typing this long after the page opens
const HOW_START_MS = 150;      // "How BuddyTech Works" this long after it comes into view
const SUBTITLE_PAUSE_MS = 250; // and the line under a heading this long after the heading finishes

// How long to wait after character i - 1 before typing character i.
function typingDelay(pace, text, i) {
  const prev = text[i - 1];
  if (prev === ',' || prev === '.') return pace.punctuation;
  if (prev === ' ') {
    const words = text.slice(0, i).trim().split(/\s+/).length;
    if (words % 4 === 0) return pace.breath;
  }
  return pace.char;
}

// When (ms after the group starts) each character of each line appears: schedule[s][i].
// Each line starts where the one before it finished (plus SUBTITLE_PAUSE_MS).
function typingSchedule(lines, startMs) {
  const schedule = [];
  let t = startMs - SUBTITLE_PAUSE_MS;
  lines.forEach((line) => {
    const text = lineText(line);
    t += SUBTITLE_PAUSE_MS;
    const times = [t];
    for (let i = 1; i < text.length; i++) { t += typingDelay(line.pace, text, i); times.push(t); }
    schedule.push(times);
  });
  return schedule;
}
const HERO_SCHEDULE = typingSchedule(HERO_LINES, HERO_START_MS);
const HOW_SCHEDULE = typingSchedule(HOW_LINES, HOW_START_MS);

const prefersReducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

// How many characters of each line have been typed so far, once `started` (all of them for
// reduced motion). Worked out from the clock, not by counting timer ticks: the ASCII
// background keeps the page busy, so timers fire late, and late ticks would add up. A late
// update just catches up. Once typed, it stays typed.
function useTypedCounts(schedule, started) {
  const [counts, setCounts] = useState(() => schedule.map((times) => (prefersReducedMotion() ? times.length : 0)));
  useEffect(() => {
    if (!started || counts.every((n, s) => n >= schedule[s].length)) return;
    const start = performance.now();
    let timer;
    function tick() {
      const elapsed = performance.now() - start;
      const next = schedule.map((times) => { let n = 0; while (n < times.length && times[n] <= elapsed) n++; return n; });
      setCounts(next);
      // Wake for whichever line types its next character first.
      const due = next.map((n, s) => (n < schedule[s].length ? schedule[s][n] : Infinity));
      const soonest = Math.min(...due);
      if (soonest !== Infinity) timer = setTimeout(tick, soonest - elapsed);
    }
    timer = setTimeout(tick, schedule[0][0]);
    return () => clearTimeout(timer);
    // Runs once, when it starts: the clock, not `counts`, drives it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started]);
  return counts;
}

// Becomes true the first time `ref`'s element is fully on screen, and stays true.
function useSeenOnce(ref) {
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (seen || !el) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setSeen(true); observer.disconnect(); }
    }, { threshold: 1 });
    observer.observe(el);
    return () => observer.disconnect();
  }, [seen, ref]);
  return seen;
}

// One line, `count` characters in. The rest is already there but invisible, so the
// lines never move or rewrap as it types. The cursor is a zero-width mark after the last
// typed character (Landing.css .typing-cursor). Screen readers get the whole text at once.
// cursorFromStart: show the cursor before the first character too (a group's first line,
// once that group has started).
function TypedText({ line, count, cursorFromStart = false }) {
  const parts = line.parts;
  const full = lineText(line);
  // The cursor shows while this line is typing, then disappears.
  const cursorOn = count < full.length && (count > 0 || cursorFromStart);

  // Where each part starts within the section, and how many of its characters are typed.
  const partStart = parts.map((_, k) => parts.slice(0, k).reduce((sum, part) => sum + part.text.length, 0));
  const partTyped = parts.map((part, k) => Math.max(0, Math.min(part.text.length, count - partStart[k])));
  // The cursor goes in the first part typing hasn't finished (or the last part).
  const unfinished = parts.findIndex((part, k) => partTyped[k] < part.text.length);
  const cursorPart = !cursorOn ? -1 : unfinished === -1 ? parts.length - 1 : unfinished;

  return (
    <>
      <span className="typing-sr">{full}</span>
      <span aria-hidden="true">
        {parts.map((part, k) => {
          const n = partTyped[k];
          const cursorHere = k === cursorPart;
          return (
            <span key={k} className={part.className}>
              {part.text.slice(0, n)}
              {cursorHere && <span className="typing-cursor" />}
              <span className="typing-hidden">{part.text.slice(n)}</span>
            </span>
          );
        })}
      </span>
    </>
  );
}

// The frosted cards wobble slowly while hovered (Landing.css .glass-card--wobble). Stopping the
// animation would snap a tilted card straight, so on leaving, the tilt it's at is held for a
// moment and then eased back to 0 (the card's `rotate` transition).
function startWobble(e) {
  const card = e.currentTarget;
  card.style.rotate = '';
  card.classList.add('glass-card--wobble');
}
function stopWobble(e) {
  const card = e.currentTarget;
  const tilt = getComputedStyle(card).rotate; // where the wobble has it right now
  card.classList.remove('glass-card--wobble');
  card.style.rotate = tilt === 'none' ? '' : tilt;
  // Two frames later (once that's applied), let go: it eases back to straight.
  requestAnimationFrame(() => requestAnimationFrame(() => { card.style.rotate = ''; }));
}

export default function Home({ onGetStarted, isLoggedIn }) {
  const [headingTyped, subtitleTyped] = useTypedCounts(HERO_SCHEDULE, true);
  // (The page's scrollbar is hidden site-wide, in index.css.)

  // The hero's art and falling characters are looping videos; the glow below follows them
  // (heroSeam.js). For reduced motion: a still frame, no rain, no moving glow.
  const [reducedMotion] = useState(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
  const stageRef = useRef(null), artRef = useRef(null), rainRef = useRef(null), glowRef = useRef(null), fxRef = useRef(null);
  useHeroSeam({ stageRef, artRef, rainRef, glowRef, fxRef, enabled: !reducedMotion });

  // The "Why Choose BuddyTech?" cards wait behind the text above them, then play their
  // entrance once their spot is on screen (featureCardsPin.js). Off for reduced motion.
  const cardsRef = useRef(null), howHeadRef = useRef(null);
  useFeatureCardsEntrance({ gridRef: cardsRef, enabled: !reducedMotion });

  // Behind the white part of the page: paper planes gliding behind the steps, and books
  // falling in the margins, nudged by the mouse and scrolling (studyScene.js). For reduced
  // motion: a still arrangement.
  const lightRef = useRef(null);
  useStudyScene({ containerRef: lightRef, still: reducedMotion });

  // The "How BuddyTech Works" steps grow out from behind each other as you scroll, then
  // slowly rock while shown (staircaseReveal.js). Off for reduced motion.
  const stepsRef = useRef(null), stepsLeadRef = useRef(null);
  useStaircaseReveal({ listRef: stepsRef, leadRef: stepsLeadRef, enabled: !reducedMotion });
  // Its heading and the line under it type out the first time the heading is fully in view.
  const howSeen = useSeenOnce(howHeadRef);
  const [howHeadingTyped, howLeadTyped] = useTypedCounts(HOW_SCHEDULE, howSeen);

  const badgeIn = headingTyped >= HERO_SCHEDULE[0].length;    // the heading is done
  const actionsIn = subtitleTyped >= HERO_SCHEDULE[1].length; // the subtitle is done
  const scrollToFeatures = () => {
    document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' });
  };

  // Where the buttons start their entrance, from where they end up (so it's right however
  // they're laid out, side by side or stacked on a phone):
  //   --enter-x on "Find a Tech Buddy": how far right of its spot the centre is.
  //   --enter-x/-y on "Explore Features": how far it is from there to its own spot,
  //   so it can start hidden behind "Find a Tech Buddy" and slide out.
  // Measured before the buttons animate (their animation's own movement would throw the
  // measurement off): on first render, and again once the web fonts have loaded, since
  // those change the buttons' widths.
  const actionsRef = useRef(null), findRef = useRef(null), exploreRef = useRef(null);
  useLayoutEffect(() => {
    function measure() {
      const box = actionsRef.current, findEl = findRef.current, exploreEl = exploreRef.current;
      if (!box || !findEl || !exploreEl || box.classList.contains('hero-actions-in')) return;
      const area = box.getBoundingClientRect();
      const find = findEl.getBoundingClientRect();
      const explore = exploreEl.getBoundingClientRect();
      const centreX = area.left + area.width / 2;
      const findX = find.left + find.width / 2, findY = find.top + find.height / 2;
      findEl.style.setProperty('--enter-x', `${centreX - findX}px`);
      exploreEl.style.setProperty('--enter-x', `${centreX - (explore.left + explore.width / 2)}px`);
      exploreEl.style.setProperty('--enter-y', `${findY - (explore.top + explore.height / 2)}px`);
    }
    measure();
    document.fonts?.ready.then(measure);
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  return (
    <main>
      {/* The hero: a dark band, full width, with the animated ASCII students behind its
          content and a dark wash between them so the text stays readable (Landing.css). */}
      <section className="hero-stage" ref={stageRef}>
        <AsciiBackground ref={artRef} className="hero-ascii" reducedMotion={reducedMotion} />
        <div className="hero-wash" aria-hidden="true" />
        {/* The art's bottom edge melts into the colour of the section below. */}
        <div className="hero-bottom-fade" aria-hidden="true" />
      <div className="hero">
        {/* Hidden (but holding its place) until the heading is typed, then grows out from behind it. */}
        <span className={badgeIn ? 'badge hero-badge hero-badge-in' : 'badge hero-badge'}>
          <Sparkles size={14} />
          Empowering Student Collaboration
        </span>
        <h1 className="hero-heading">
          <TypedText line={HERO_LINES[0]} count={headingTyped} cursorFromStart />
        </h1>
        <p>
          <TypedText line={HERO_LINES[1]} count={subtitleTyped} />
        </p>
        {/* Hidden (but holding their place) until the subtitle is typed. */}
        <div ref={actionsRef} className={actionsIn ? 'hero-actions hero-actions-in' : 'hero-actions'}>
          <button ref={findRef} className="btn-primary hero-find" onClick={onGetStarted}>
            {isLoggedIn ? 'Go to Dashboard' : 'Find a Tech Buddy'}
          </button>
          <button ref={exploreRef} className="btn-outline hero-explore" onClick={scrollToFeatures}>Explore Features</button>
        </div>
      </div>
      </section>

      {/* Below the hero: the dark hero melts down into a light finish (Landing.css "gradient
          bridge"). Soft glowing blobs in the ASCII art's colours drift behind frosted-glass
          feature cards; the steps are a staggered staircase; the call to action is a shifting
          colour gradient with faint ASCII text. */}
      <div className="bridge">
        {/* The falling characters, across the seam: they start inside the art's faded bottom
            edge and fall into the section below (sized and placed by heroSeam.js). */}
        {!reducedMotion && (
          <>
            <video ref={rainRef} className="seam-rain" autoPlay muted loop playsInline preload="auto"
              disablePictureInPicture aria-hidden="true">
              <source src="/ascii/rain.webm" type="video/webm" />
              <source src="/ascii/rain.mp4" type="video/mp4" />
            </video>
            {/* Where the leaves at the art's sides curl up, drops start higher than the main
                rain's top edge. Those starts are two small strips, one per side, so nothing is
                drawn over the hero's buttons (a blended video over the frosted "Explore
                Features" made it flicker). data-x / data-w: the strip's place in art pixels. */}
            <video className="seam-rain" data-rain-tip data-x="0" data-w="378" autoPlay muted loop playsInline
              preload="auto" disablePictureInPicture aria-hidden="true">
              <source src="/ascii/rain-left.webm" type="video/webm" />
              <source src="/ascii/rain-left.mp4" type="video/mp4" />
            </video>
            <video className="seam-rain" data-rain-tip data-x="1260" data-w="210" autoPlay muted loop playsInline
              preload="auto" disablePictureInPicture aria-hidden="true">
              <source src="/ascii/rain-right.webm" type="video/webm" />
              <source src="/ascii/rain-right.mp4" type="video/mp4" />
            </video>
          </>
        )}
        <div className="bridge-dark">
          {/* The glows: a soft light following the art's light band, and drifting colour
              blobs that lean toward it. Faded out along the top so colour rises out of the dark. */}
          <div className="bridge-fx" ref={fxRef} aria-hidden="true">
            <div className="sweep-glow" ref={glowRef} />
            <span className="bridge-blob bridge-blob--teal" data-blob><span className="bridge-blob-inner" /></span>
            <span className="bridge-blob bridge-blob--violet" data-blob><span className="bridge-blob-inner" /></span>
            <span className="bridge-blob bridge-blob--amber" data-blob><span className="bridge-blob-inner" /></span>
          </div>
          {/* Darkens the bottom and lower sides into the art's colour, before the cut to the light page. */}
          <div className="bridge-vignette" aria-hidden="true" />

          <section className="bridge-section" id="features">
            <div className="bridge-head">
              <h2>Why Choose BuddyTech?</h2>
              <p>Everything you need to level up your technical learning experience.</p>
            </div>
            {/* Wait behind the text until their spot is on screen, then play their entrance
                once (featureCardsPin.js, Landing.css .glass-grid--armed). */}
            <div ref={cardsRef} className="glass-grid">
              {FEATURES.map(({ icon: Icon, title, text, color }) => (
                <div key={title} className="glass-card" style={{ '--c': color }}
                  onMouseEnter={startWobble} onMouseLeave={stopWobble}>
                  <div className="glass-icon"><Icon size={24} /></div>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* The white part: a 3D scene behind it (studyScene.js puts its canvas in here). */}
        <div className="bridge-light" ref={lightRef}>
        <section className="bridge-section bridge-section--light" id="about">
          <div className="bridge-head">
            <h2 ref={howHeadRef}><TypedText line={HOW_LINES[0]} count={howHeadingTyped} cursorFromStart={howSeen} /></h2>
            <p ref={stepsLeadRef}><TypedText line={HOW_LINES[1]} count={howLeadTyped} /></p>
          </div>
          <ol className="staircase" ref={stepsRef}>
            {STEPS.map(({ title, text, color }, i) => (
              <li key={title} className="stair" style={{ '--c': color }}>
                <span className="stair-number" aria-hidden="true">{i + 1}</span>
                <div>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="bridge-section bridge-section--light bridge-section--cta" id="community">
          <div className="gradient-cta">
            <pre className="gradient-cta-ascii" aria-hidden="true">{CTA_ASCII}</pre>
            <h2>Ready to find your study buddy?</h2>
            <p>Join your classmates on BuddyTech and make your next assignment a team effort.</p>
            <button className="gradient-cta-button" onClick={onGetStarted}>
              {isLoggedIn ? 'Go to Dashboard' : 'Get Started'}
            </button>
          </div>
        </section>
        </div>
      </div>
    </main>
  );
}