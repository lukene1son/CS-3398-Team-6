import { useEffect } from 'react';

// A 3D scene behind the white part of the landing page (the steps and the call to action):
//   - paper planes (notes passed between study buddies) gliding behind the steps, banking as
//     they turn and leaving dotted trails, veering away from the mouse;
//   - books falling and tumbling in the margins on either side of the content, pushed and
//     spun a little by the mouse, tilting toward it, and nudged by scrolling.
// One Three.js canvas (loaded only when needed), drawn only while it's on screen. On screens
// too narrow for margins there are no books. For reduced motion (still: true) it's drawn once,
// as a still arrangement.

const BLUE = 0x0f52ba; // BuddyTech blue
const COVERS = [BLUE, BLUE, 0x2aa3a3, 0x6366f1, 0x0d9488, 0xd97706, 0x7c3aed, 0x1e3a8a];
const PLANE_INK = [BLUE, 0x2aa3a3, 0x6366f1, 0xd97706];
const PAGE_BG = 0xf8fafc;       // the page behind it (.bridge): farther things fade into it
const CONTENT_HALF = 520;       // half the content's width (the call to action is 1000px)
const MIN_MARGIN = 90;          // narrower margins than this: no books
const BOOKS = 20, TRAIL_MAX = 70, TRAIL_GAP = 11;

const rand = (a, b) => a + Math.random() * (b - a);

// containerRef: the white part (.bridge-light); the canvas goes in it, behind its content.
export function useStudyScene({ containerRef, still }) {
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let disposed = false, cleanup = () => {};
    import('three')
      .then((THREE) => { if (!disposed) cleanup = start(THREE); })
      // Without it the page is simply plain white there; say why in the console.
      .catch((err) => console.warn('Landing page 3D scene unavailable:', err));
    return () => { disposed = true; cleanup(); };

    function start(THREE) {
      const canvas = document.createElement('canvas');
      canvas.className = 'study-scene';
      canvas.setAttribute('aria-hidden', 'true');
      container.prepend(canvas);
      const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(35, 1, 10, 6000);
      scene.fog = new THREE.Fog(PAGE_BG, 1, 2);
      scene.add(new THREE.HemisphereLight(0xffffff, 0xc7d2fe, 1.6));
      const sun = new THREE.DirectionalLight(0xffffff, 1.7);
      sun.position.set(-0.6, 1, 0.9);
      scene.add(sun);

      // ---------- Books ----------
      const booksGroup = new THREE.Group();
      scene.add(booksGroup);
      const unitBox = new THREE.BoxGeometry(1, 1, 1);
      const pagesMat = new THREE.MeshLambertMaterial({ color: 0xfdf8ec });
      const bandMat = new THREE.MeshLambertMaterial({ color: 0xf8fafc });
      const coverMats = new Map();
      const coverMat = (c) => { if (!coverMats.has(c)) coverMats.set(c, new THREE.MeshLambertMaterial({ color: c })); return coverMats.get(c); };
      function makeBook(side) {
        const w = rand(46, 74), h = w * rand(1.3, 1.45), d = w * rand(0.2, 0.34);
        const cover = coverMat(COVERS[Math.floor(Math.random() * COVERS.length)]);
        const g = new THREE.Group();
        const t = Math.max(2, w * 0.045); // cover thickness
        const part = (mat, sx, sy, sz, x, y, z) => {
          const m = new THREE.Mesh(unitBox, mat); m.scale.set(sx, sy, sz); m.position.set(x, y, z); g.add(m);
        };
        part(cover, w, h, t, 0, 0, d / 2 - t / 2);                    // front cover
        part(cover, w, h, t, 0, 0, -d / 2 + t / 2);                   // back cover
        part(cover, t, h, d, -w / 2 + t / 2, 0, 0);                   // spine
        part(pagesMat, w - t * 1.6, h - t * 2, d - t * 2, t * 0.3, 0, 0); // pages
        part(bandMat, t * 1.05, h * 0.12, d * 0.7, -w / 2 + t / 2, h * 0.22, 0); // spine band
        part(bandMat, w * 0.55, h * 0.06, t * 0.4, w * 0.05, h * 0.25, d / 2 + t * 0.05); // title strip
        booksGroup.add(g);
        return { g, size: h, side, x: 0, y: 0, z: 0, home: 0, vx: 0, vy: 0,
          fall: rand(28, 58), sway: rand(10, 26), swayF: rand(0.25, 0.6), phase: rand(0, 6.3),
          spin: new THREE.Vector3(rand(-0.5, 0.5), rand(-0.6, 0.6), rand(-0.35, 0.35)), kick: new THREE.Vector3() };
      }

      // ---------- Paper planes ----------
      const planesGroup = new THREE.Group();
      scene.add(planesGroup);
      const planeGeo = (() => {
        // Nose forward (+x); wings out along z, tips lifted a little; a keel below.
        const N = [1, 0, 0], C = [-1, 0.02, 0], L = [-1, 0.16, 0.78], R = [-1, 0.16, -0.78], K = [-0.85, -0.32, 0];
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute([N, C, L, N, R, C, N, K, C, N, C, K].flat(), 3));
        g.computeVertexNormals();
        return g;
      })();
      const planeEdges = new THREE.EdgesGeometry(planeGeo);
      const planeMat = new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide });
      const planes = PLANE_INK.map((ink) => {
        const outer = new THREE.Group(), inner = new THREE.Group();
        inner.add(new THREE.Mesh(planeGeo, planeMat),
          new THREE.LineSegments(planeEdges, new THREE.LineBasicMaterial({ color: ink, transparent: true, opacity: 0.85 })));
        inner.scale.setScalar(rand(17, 22));
        outer.add(inner);
        planesGroup.add(outer);
        // Its trail: dots dropped along the way, fading with age.
        const tg = new THREE.BufferGeometry();
        tg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRAIL_MAX * 3), 3));
        tg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(TRAIL_MAX * 4), 4));
        const trail = new THREE.Points(tg, new THREE.PointsMaterial({ size: 3.2, sizeAttenuation: false, vertexColors: true, transparent: true, depthWrite: false }));
        planesGroup.add(trail);
        return { outer, inner, trail, dots: [], ink: new THREE.Color(ink), x: 0, y: 0, z: rand(-60, 40),
          heading: rand(0, 6.3), turn: 0, speed: rand(95, 130), wander: rand(0, 100), sinceDot: 0 };
      });

      // ---------- Layout: 1 world unit = 1 CSS pixel at depth 0, origin in the middle ----------
      let W = 1, H = 1;
      const books = [];
      for (let i = 0; i < BOOKS; i++) books.push(makeBook(i % 2 ? 1 : -1));
      function keepInMargin(b) {
        const inner = Math.min(CONTENT_HALF, W / 2 - 40), outer = W / 2 - 20;
        const lo = inner + b.size * 0.45, hi = Math.max(lo + 1, outer - b.size * 0.3);
        b.home = b.side * rand(lo, hi);
      }
      function respawn(b, anywhere) {
        keepInMargin(b);
        b.x = b.home;
        b.y = anywhere ? rand(-H / 2, H / 2) : H / 2 + b.size + rand(0, 160);
        b.z = rand(-280, 60); b.vx = 0; b.vy = 0;
        b.g.rotation.set(rand(0, 6.3), rand(0, 6.3), rand(0, 6.3));
        b.g.position.set(b.x, b.y, b.z);
      }
      function placePlanes() {
        const span = Math.min(W / 3, CONTENT_HALF);
        planes.forEach((p, k) => {
          p.x = rand(-span, span);
          p.y = H / 2 - 260 - k * Math.max(80, (H - 400) / planes.length);
          p.dots.length = 0;
          p.outer.position.set(p.x, p.y, p.z);
          p.outer.rotation.set(0, 0, p.heading);
          p.inner.rotation.x = -0.95;
        });
      }
      function layout() {
        W = container.clientWidth; H = container.clientHeight;
        renderer.setSize(W, H, false);
        camera.aspect = W / H;
        const camZ = (H / 2) / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
        camera.position.set(0, 0, camZ);
        camera.far = camZ + 2000;
        camera.updateProjectionMatrix();
        scene.fog.near = camZ - 60; scene.fog.far = camZ + 520;
        booksGroup.visible = W / 2 - CONTENT_HALF >= MIN_MARGIN;
        books.forEach((b) => respawn(b, true));
        placePlanes();
      }
      layout();

      const dispose = () => {
        unitBox.dispose(); pagesMat.dispose(); bandMat.dispose(); coverMats.forEach((m) => m.dispose());
        planeGeo.dispose(); planeEdges.dispose(); planeMat.dispose();
        planes.forEach((p) => { p.trail.geometry.dispose(); p.trail.material.dispose(); p.inner.children[1].material.dispose(); });
        renderer.dispose(); renderer.forceContextLoss();
        canvas.remove();
      };

      // Reduced motion: a still arrangement, redrawn if the size changes.
      if (still) {
        renderer.render(scene, camera);
        const resize = new ResizeObserver(() => { layout(); renderer.render(scene, camera); });
        resize.observe(container);
        return () => { resize.disconnect(); dispose(); };
      }

      // ---------- The mouse and scrolling ----------
      const mouse = { x: 0, y: 0, nx: 0, ny: 0, inside: false };
      const onMove = (e) => {
        const r = container.getBoundingClientRect();
        mouse.x = e.clientX - r.left - W / 2; mouse.y = -(e.clientY - r.top - H / 2);
        mouse.inside = e.clientY >= r.top && e.clientY <= r.bottom;
        mouse.nx = e.clientX / window.innerWidth - 0.5; mouse.ny = e.clientY / window.innerHeight - 0.5;
      };
      let lastScroll = window.scrollY, scrollKick = 0;
      const onScroll = () => { scrollKick += window.scrollY - lastScroll; lastScroll = window.scrollY; };
      window.addEventListener('pointermove', onMove, { passive: true });
      window.addEventListener('scroll', onScroll, { passive: true });

      function stepBooks(dt, t) {
        // The whole set leans a little toward the mouse.
        booksGroup.rotation.y += ((mouse.nx * 0.14) - booksGroup.rotation.y) * Math.min(1, dt * 3);
        booksGroup.rotation.x += ((mouse.ny * 0.08) - booksGroup.rotation.x) * Math.min(1, dt * 3);
        const kick = Math.max(-40, Math.min(40, scrollKick));
        for (const b of books) {
          // Pushed (gently) away from the mouse and spun, and lagging a touch behind scrolling.
          if (mouse.inside) {
            const dx = b.x - mouse.x, dy = b.y - mouse.y, d = Math.hypot(dx, dy);
            if (d < 190 && d > 0.1) {
              const f = (1 - d / 190) ** 2 * 900 * dt;
              b.vx += (dx / d) * f; b.vy += (dy / d) * f;
              b.kick.x += (dy / d) * f * 0.004; b.kick.y += (-dx / d) * f * 0.004;
            }
          }
          b.vy += kick * 1.1;
          // Easing back to its side; the pushes die away.
          b.vx += (b.home - b.x) * 0.6 * dt;
          b.vx *= Math.exp(-2.2 * dt); b.vy *= Math.exp(-2.2 * dt);
          b.kick.multiplyScalar(Math.exp(-1.5 * dt));
          b.x += (b.vx + Math.cos(t * b.swayF + b.phase) * b.sway * b.swayF) * dt;
          b.y += (b.vy - b.fall) * dt;
          b.g.position.set(b.x, b.y, b.z);
          b.g.rotation.x += (b.spin.x + b.kick.x) * dt;
          b.g.rotation.y += (b.spin.y + b.kick.y) * dt;
          b.g.rotation.z += b.spin.z * dt;
          if (b.y < -H / 2 - b.size * 1.5) respawn(b, false);
          if (b.y > H / 2 + b.size * 3) b.y = H / 2 + b.size * 3;
        }
      }

      function stepPlanes(dt, t) {
        // They keep to the middle (the content's width and a little more): the edges are the books'.
        const bx = Math.min(W / 2 - 70, CONTENT_HALF + 80), by = H / 2 - 60;
        for (const p of planes) {
          // Wander; steer back from the edges and away from the mouse.
          let want = Math.sin(t * 0.37 + p.wander) * 0.9 + Math.sin(t * 0.91 + p.wander * 2) * 0.5;
          const ax = p.x + Math.cos(p.heading) * 160, ay = p.y + Math.sin(p.heading) * 160;
          let sx = 0, sy = 0;
          if (ax > bx) sx -= ax - bx;
          if (ax < -bx) sx += -bx - ax;
          if (ay > by) sy -= ay - by;
          if (ay < -by) sy += -by - ay;
          if (mouse.inside) {
            const dx = p.x - mouse.x, dy = p.y - mouse.y, d = Math.hypot(dx, dy);
            if (d < 200 && d > 0.1) { sx += (dx / d) * (200 - d) * 1.2; sy += (dy / d) * (200 - d) * 1.2; }
          }
          if (sx || sy) {
            let diff = Math.atan2(sy, sx) - p.heading;
            diff = Math.atan2(Math.sin(diff), Math.cos(diff));
            want += Math.max(-2.2, Math.min(2.2, diff * 2.4));
          }
          p.turn += (want - p.turn) * Math.min(1, dt * 2);
          p.heading += p.turn * dt;
          const step = p.speed * dt;
          p.x += Math.cos(p.heading) * step; p.y += Math.sin(p.heading) * step;
          p.outer.position.set(p.x, p.y, p.z);
          p.outer.rotation.set(0, 0, p.heading);
          // Rolled to show its top, banking into the turn.
          p.inner.rotation.x = -0.95 - Math.max(-0.7, Math.min(0.7, p.turn * 0.45));
          // A dot every TRAIL_GAP px, fading by age.
          p.sinceDot += step;
          if (p.sinceDot >= TRAIL_GAP) {
            p.sinceDot = 0;
            p.dots.unshift({ x: p.x - Math.cos(p.heading) * 18, y: p.y - Math.sin(p.heading) * 18, z: p.z });
            if (p.dots.length > TRAIL_MAX) p.dots.pop();
          }
          const pos = p.trail.geometry.attributes.position.array, col = p.trail.geometry.attributes.color.array;
          for (let i = 0; i < TRAIL_MAX; i++) {
            const dot = p.dots[i];
            if (dot) { pos[i * 3] = dot.x; pos[i * 3 + 1] = dot.y; pos[i * 3 + 2] = dot.z; }
            col[i * 4] = p.ink.r; col[i * 4 + 1] = p.ink.g; col[i * 4 + 2] = p.ink.b;
            col[i * 4 + 3] = dot ? (1 - i / TRAIL_MAX) ** 1.5 * 0.55 : 0;
          }
          p.trail.geometry.attributes.position.needsUpdate = true;
          p.trail.geometry.attributes.color.needsUpdate = true;
        }
      }

      // ---------- Run, only while it's on screen ----------
      let running = false, raf = 0, last = 0;
      function frame(now) {
        if (!running) { raf = 0; return; }
        raf = requestAnimationFrame(frame);
        const dt = Math.min(0.05, (now - last) / 1000); last = now;
        const t = now / 1000;
        if (booksGroup.visible) stepBooks(dt, t);
        stepPlanes(dt, t);
        scrollKick = 0;
        renderer.render(scene, camera);
      }
      const seen = new IntersectionObserver(([e]) => {
        if (e.isIntersecting && !running) { running = true; last = performance.now(); raf = requestAnimationFrame(frame); }
        if (!e.isIntersecting) running = false;
      });
      seen.observe(container);
      let lastW = W, lastH = H;
      const resize = new ResizeObserver(() => {
        if (container.clientWidth === lastW && container.clientHeight === lastH) return;
        lastW = container.clientWidth; lastH = container.clientHeight;
        layout();
      });
      resize.observe(container);

      return () => {
        running = false; cancelAnimationFrame(raf);
        seen.disconnect(); resize.disconnect();
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('scroll', onScroll);
        dispose();
      };
    }
  }, [containerRef, still]);
}
