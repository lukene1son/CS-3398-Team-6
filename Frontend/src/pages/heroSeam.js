import { useEffect } from 'react';

// The seam between the landing page's hero and the dark features section below it:
//   - the falling characters (public/ascii/rain.*): a second pre-rendered 10-second loop, on
//     black, blended with mix-blend-mode: screen (black = see-through). It's drawn in the
//     ASCII art's own pixels, so it's sized and placed exactly like the art: its columns line
//     up under the art's columns, and it starts RAIN_OVERLAP art-px inside the art's faded
//     bottom edge. Where the leaves at the sides curl up higher, drops start right under
//     them in two small extra strips ([data-rain-tip] videos, TIP_* rows), kept to the
//     sides so nothing is drawn over the hero's buttons;
//   - the soft glow that follows the art's light band along the top of the section, and the
//     drifting colour blobs leaning toward it.
// Everything follows the art video's playback time, so they stay in step with what's shown.

// The art video, in art pixels (the drawing's rows 0–81, so its bottom edge is the knees).
const ART_W = 1470, ART_H = 820;
// The rain video, in art pixels (rendered at 2× for sharpness).
const RAIN_H = 450, RAIN_OVERLAP = 70;
// The side strips: the 150 art-px (15 rows) just above the main rain's top edge. Each
// strip's left edge and width (art px) are on its element (data-x, data-w, Home.jsx).
const TIP_TOP = RAIN_OVERLAP + 150, TIP_H = 150;
// The drawing's grid, and its loop. The light band is strongest where
// 0.75·column/COLS + 0.25·row/ROWS = the loop position (AsciiBackground's pre-render).
const LOOP_S = 10, COLS = 210, ROWS = 98, CELL_W = 7, BOTTOM_ROW = 81;
const FPS = 30; // the glow and the sync check run at the video's own frame rate

// stageRef: the hero; artRef / rainRef: the two <video>s; glowRef: the glow; fxRef: the
// element holding the blobs ([data-blob]). enabled: false for reduced motion (no videos).
export function useHeroSeam({ stageRef, artRef, rainRef, glowRef, fxRef, enabled }) {
  useEffect(() => {
    if (!enabled) return;
    const stage = stageRef.current, art = artRef.current, rain = rainRef.current;
    const glow = glowRef.current, fx = fxRef.current;
    if (!stage || !art || !rain) return;
    // The side strips (same loop, cut from the same frames as the main rain).
    const tips = [...rain.parentElement.querySelectorAll('[data-rain-tip]')];
    const rains = [rain, ...tips];
    art.muted = true; // muted videos may autoplay; set the property too, to be sure
    rains.forEach((v) => { v.muted = true; });

    // The art is shown with object-fit: cover pinned to the bottom: scaled by s, centred
    // sideways. The rain gets the same scale and sideways offset, so their columns match.
    let fit = { s: 1, ox: 0 };
    function place() {
      const w = stage.clientWidth, h = stage.clientHeight;
      const s = Math.max(w / ART_W, h / ART_H);
      fit = { s, ox: (w - ART_W * s) / 2 };
      Object.assign(rain.style, {
        left: `${fit.ox}px`,
        top: `${-RAIN_OVERLAP * s}px`,
        width: `${ART_W * s}px`,
        height: `${RAIN_H * s}px`,
      });
      tips.forEach((tip) => Object.assign(tip.style, {
        left: `${fit.ox + Number(tip.dataset.x) * s}px`,
        top: `${-TIP_TOP * s}px`,
        width: `${Number(tip.dataset.w) * s}px`,
        height: `${TIP_H * s}px`,
      }));
    }
    place();
    const resize = new ResizeObserver(place);
    resize.observe(stage);

    // The rain is cut from the same loop as the art; nudge it back if it drifts more than
    // a frame or so (comparing around the loop point, where one wraps before the other).
    function sync() {
      rains.forEach((v) => {
        let d = v.currentTime - art.currentTime;
        if (Math.abs(d) > LOOP_S / 2) d -= Math.sign(d) * LOOP_S;
        if (Math.abs(d) > 0.05) v.currentTime = art.currentTime;
      });
    }

    // Where the light band crosses the art's visible bottom row (x from the hero's left).
    const blobs = fx ? [...fx.querySelectorAll('[data-blob]')] : [];
    function updateGlow() {
      const phase = (art.currentTime % LOOP_S) / LOOP_S;
      const along = (((phase - 0.25 * BOTTOM_ROW / ROWS) % 1) + 1) % 1; // 0..1 across the bottom
      const col = (along / 0.75) * COLS;
      const strength = col >= -5 && col <= COLS + 5 ? 1 : 0;           // off the bottom: no glow
      const x = fit.ox + (col + 0.5) * CELL_W * fit.s;
      if (glow) {
        glow.style.setProperty('--sweep-x', `${x}px`);
        glow.style.setProperty('--sweep-a', String(strength));
      }
      // Each blob leans just slightly toward the band (≤4px), swelling 1.5% and brightening 6%
      // at most: kept subtle, so the art, the falling characters and the ripple are what moves.
      // All positions are read first, then all styles written (no layout thrashing).
      const left = stage.getBoundingClientRect().left;
      const centres = blobs.map((el) => { const r = el.getBoundingClientRect(); return r.left - left + r.width / 2; });
      blobs.forEach((el, k) => {
        const pull = Math.max(-1, Math.min(1, (x - centres[k]) / 600));
        const near = strength * Math.exp(-(((x - centres[k]) / 500) ** 2));
        el.style.transform = `translateX(${(pull * 4 * strength).toFixed(1)}px) scale(${(1 + near * 0.015).toFixed(3)})`;
        el.style.filter = `blur(70px) brightness(${(1 + near * 0.06).toFixed(2)})`;
      });
    }

    // Only run (and play the videos) while the hero or the rain is on screen.
    const visible = new Set();
    const watch = new IntersectionObserver((entries) => {
      entries.forEach((e) => (e.isIntersecting ? visible.add(e.target) : visible.delete(e.target)));
      if (visible.size) { art.play().catch(() => {}); rains.forEach((v) => v.play().catch(() => {})); }
      else { art.pause(); rains.forEach((v) => v.pause()); }
    });
    watch.observe(stage);
    watch.observe(rain);

    let frameId = 0, last = 0;
    function tick(now) {
      if (visible.size && now - last >= 1000 / FPS) {
        last = now;
        sync();
        updateGlow();
      }
      frameId = requestAnimationFrame(tick);
    }
    frameId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frameId);
      resize.disconnect();
      watch.disconnect();
    };
  }, [enabled, stageRef, artRef, rainRef, glowRef, fxRef]);
}
