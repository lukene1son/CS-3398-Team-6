import React, { useEffect, useId, useRef, useState } from 'react';
import './logoAnimation.css';

// The BuddyTech logo, building itself letter by letter (logoAnimation.css) whenever it first
// appears (signing in, loading or refreshing the page), then becoming the plain logo image.
// For anyone who prefers reduced motion, it's just the logo image.
//
// The pieces in public/logo-pieces/ were cut out of buddytech.webp. Each is a full-size
// (1024×512) image holding only its own pixels, and every pixel of the logo is in exactly one
// piece. Every piece is laid out exactly like the original image (.logo-anim__layer), so the
// browser scales them all the same way, and the finished pieces look the same as the original
// they're swapped for at the end.

const IMG_W = 1024, IMG_H = 512;
// Each piece's bounds in the original image's pixels: where its animation pivots or reveals.
const BOX = {
  B: { x: 138, y: 164, w: 128, h: 134 },
  Bbody: { x: 138, y: 238, w: 99, h: 59 },   // the part of the B under the heads
  u: { x: 264, y: 212, w: 82, h: 84 },
  d1: { x: 343, y: 182, w: 86, h: 114 },
  d2: { x: 426, y: 181, w: 86, h: 114 },
  y: { x: 513, y: 211, w: 87, h: 122 },
  Tstem: { x: 617, y: 180, w: 29, h: 116 },
  TarmL: { x: 575, y: 180, w: 42, h: 116 },  // the crossbar left of the stem
  TarmR: { x: 646, y: 180, w: 95, h: 116 },  // the crossbar right of the stem, sweeping toward the cap
  e: { x: 651, y: 211, w: 86, h: 86 },
  cap: { x: 703, y: 155, w: 94, h: 57 },
  c: { x: 735, y: 211, w: 77, h: 86 },
  h: { x: 810, y: 179, w: 86, h: 116 },
};
// The B's see-through heads (circles, in the original image's pixels).
const HOLES = [
  { cx: 174.56, cy: 204.24, r: 17.47 },
  { cx: 219.82, cy: 214.13, r: 14.38 },
];
// After the B, letter by letter. i: when it starts, in steps (logoAnimation.css --step).
const LETTERS = [
  { piece: 'u', i: 1 }, { piece: 'd1', i: 2 }, { piece: 'd2', i: 3 }, { piece: 'y', i: 4 },
  { piece: 'Tstem', i: 5 }, { piece: 'e', i: 6 }, { piece: 'c', i: 7 }, { piece: 'h', i: 8 },
];
const FINAL_SRC = '/buddytech.webp';
const pieceSrc = (name) => `/logo-pieces/${name}.png`;
const ALL_SOURCES = [FINAL_SRC, ...['Bfilled', 'B', 'Bbody', 'TarmL', 'TarmR', 'cap', ...LETTERS.map((l) => l.piece)].map(pieceSrc)];

const pct = (v, total) => `${(v / total) * 100}%`;
// A point inside a piece's box (fx, fy: 0..1 across it), as a transform-origin on its layer.
const originAt = (name, fx, fy) => {
  const b = BOX[name];
  return `${pct(b.x + fx * b.w, IMG_W)} ${pct(b.y + fy * b.h, IMG_H)}`;
};
// clip-path insets showing the layer between x0 and x1 (original image pixels).
const clipBetween = (x0, x1) => `inset(0 ${pct(IMG_W - x1, IMG_W)} 0 ${pct(x0, IMG_W)})`;

// Plays whenever the logo first appears, except for people who've asked their device for reduced motion.
function shouldPlay() {
  return !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

// white: show it white (the navy sidebar); otherwise it's the logo's own BuddyTech blue.
// It fills its container's width, so size it with a wrapper.
// finishPulse: after the cap settles, the whole logo swells and wobbles before it becomes the
// plain logo. false (the dashboard and the login card): it becomes the plain logo as soon as
// the cap has straightened out.
export default function AnimatedLogo({ white = false, finishPulse = true }) {
  // Decided once, when the logo first renders. The sidebar stays put while you switch
  // dashboard tabs, so it doesn't replay then.
  const [playing, setPlaying] = useState(shouldPlay);
  // Every image is loaded and decoded: the animation starts (so no letter arrives late).
  const [ready, setReady] = useState(false);
  // After the cap settles: the whole logo swells ~3% with a slight wobble, then slams back
  // (logoAnimation.css .logo-anim--pulse), then the pieces are swapped for the original image.
  const [pulsing, setPulsing] = useState(false);
  const finalRef = useRef(null);
  const maskId = `logo-heads-${useId().replace(/:/g, '')}`;

  // Load and decode every image before starting, including the original (which waits,
  // hidden, underneath the pieces): at the swap it's ready to show in the same frame.
  useEffect(() => {
    if (!playing) return;
    let cancelled = false;
    const decode = (img) => img.decode().catch(() => {}); // a failed image just shows late
    const loads = ALL_SOURCES.map((src) => { const img = new Image(); img.src = src; return decode(img); });
    if (finalRef.current) loads.push(decode(finalRef.current));
    Promise.all(loads).then(() => { if (!cancelled) setReady(true); });
    return () => { cancelled = true; };
    // Runs once, on first render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const layer = (name, className, style) => (
    <img
      src={pieceSrc(name)}
      alt=""
      aria-hidden="true"
      draggable="false"
      className={`logo-anim__layer ${className}`}
      style={style}
    />
  );

  return (
    <div className={['logo-anim', pulsing && 'logo-anim--pulse', white && 'logo-anim--white'].filter(Boolean).join(' ')}>
      {/* The original logo: underneath, hidden until the pieces finish (always shown when not animating). */}
      <img
        ref={finalRef}
        src={FINAL_SRC}
        alt="BuddyTech"
        draggable="false"
        className="logo-anim__layer logo-anim__final"
        style={playing ? { visibility: 'hidden' } : undefined}
        onError={(e) => { e.target.style.display = 'none'; }}
      />
      {playing && (
        // All the pieces, in one layer the size of the logo box so they can swell together.
        // Held (hidden, paused) until every image is decoded. animationend bubbles up from
        // every piece, so only the stage's own pulse counts.
        <div
          className={ready ? 'logo-anim__stage' : 'logo-anim__stage logo-anim__stage--waiting'}
          aria-hidden="true"
          onAnimationEnd={(e) => {
            if (e.target === e.currentTarget && e.animationName === 'logo-pulse') {
              setPulsing(false);
              setPlaying(false);
            }
          }}
        >
          {/* The B while its heads bobble: filled in, with an SVG mask cutting the heads back
              out as circles that move. Once they've settled it's swapped for the real B. */}
          <svg
            className="logo-anim__layer logo-anim__grow logo-anim__b-masked"
            viewBox={`0 0 ${IMG_W} ${IMG_H}`}
            style={{ '--i': 0, zIndex: 30, transformOrigin: originAt('B', 0, 0.65) }}
          >
            <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width={IMG_W} height={IMG_H}>
              <rect width={IMG_W} height={IMG_H} fill="white" />
              {HOLES.map((hole, k) => (
                <circle
                  key={k}
                  className={k ? 'logo-anim__hole logo-anim__hole--second' : 'logo-anim__hole'}
                  cx={hole.cx}
                  cy={hole.cy}
                  r={hole.r}
                  fill="black"
                />
              ))}
            </mask>
            <image href={pieceSrc('Bfilled')} width={IMG_W} height={IMG_H} mask={`url(#${maskId})`} />
          </svg>
          {layer('B', 'logo-anim__b-real', { zIndex: 30 })}
          {layer('Bbody', 'logo-anim__b-body', { zIndex: 29, transformOrigin: originAt('Bbody', 0.45, 1) })}
          {LETTERS.map(({ piece, i }) => (
            <React.Fragment key={piece}>
              {layer(piece, 'logo-anim__grow', { '--i': i, zIndex: 28 - i, transformOrigin: originAt(piece, 0, 0.65) })}
            </React.Fragment>
          ))}
          {/* The crossbar is revealed outward from the stem's edges. Each arm image also holds
              a copy of the stem's solid pixels and sits just behind the stem (z-index 22 < 23):
              scaled separately, the stem's and arm's edge pixels each come out half see-through
              and would leave a thin gap where they meet; the copy underneath fills it. */}
          {layer('TarmL', 'logo-anim__t-arm-left', {
            zIndex: 22,
            '--clip-from': clipBetween(BOX.Tstem.x, BOX.Tstem.x),
            '--clip-to': clipBetween(BOX.TarmL.x - 1, BOX.Tstem.x + BOX.Tstem.w),
          })}
          {layer('TarmR', 'logo-anim__t-arm-right', {
            zIndex: 22,
            '--clip-from': clipBetween(BOX.TarmR.x, BOX.TarmR.x),
            '--clip-to': clipBetween(BOX.Tstem.x, BOX.TarmR.x + BOX.TarmR.w + 1),
          })}
          {/* Last to move: when it settles, the whole logo pulses. */}
          <img
            src={pieceSrc('cap')}
            alt=""
            aria-hidden="true"
            draggable="false"
            className="logo-anim__layer logo-anim__cap"
            style={{ zIndex: 40, transformOrigin: originAt('cap', 0.5, 1) }}
            onAnimationEnd={(e) => {
              e.stopPropagation(); // the stage only listens for its own pulse
              if (e.animationName !== 'logo-cap-drop') return;
              if (finishPulse) setPulsing(true);
              else setPlaying(false); // straight to the plain logo
            }}
          />
        </div>
      )}
    </div>
  );
}
