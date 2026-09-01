/* ------------------------------------------------------------------
   Pattern renderer — draws the cup and the milk pattern as it forms.
   Everything is expressed in cup units (-1..1) and scaled by R.

   How real latte art reads, and what that means here:
     * the milk is one continuous white area, not a pile of outlined
       shapes — so leaves and petals are filled first and only the
       separations between them are drawn, as thin crema lines;
     * nothing has an outline against the crema — the edge of the
       pattern is just white meeting brown;
     * poured edges are never perfectly circular, so blobs and hearts
       carry a small deterministic wobble;
     * a wiggle lands alternate sides, so leaf tips stagger left/right.
------------------------------------------------------------------- */
const Pattern = (function () {
  const MILK = '#fdfaf2';
  const CREMA_LINE = 'rgba(96,58,32,0.92)';   // separation between layers
  const CREMA_RING = 'rgba(72,42,23,0.95)';   // wider gap, e.g. nested rings

  /* --- heart outline, normalised to fit a unit circle --- */
  const HEART = (function () {
    const pts = [];
    const N = 160;
    for (let i = 0; i < N; i++) {
      const th = (i / N) * Math.PI * 2;
      const x = 16 * Math.pow(Math.sin(th), 3);
      const y = 13 * Math.cos(th) - 5 * Math.cos(2 * th) - 2 * Math.cos(3 * th) - Math.cos(4 * th);
      pts.push([x, -y]); // flip: tip points to the far rim (screen up)
    }
    let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
    pts.forEach(function (p) {
      minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]);
      minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]);
    });
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    const s = 2 / Math.max(maxX - minX, maxY - minY);
    return pts.map(function (p) { return [(p[0] - cx) * s, (p[1] - cy) * s]; });
  })();

  const ease = function (p) { return 1 - Math.pow(1 - p, 2.2); };
  const clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };

  /* Poured edges wander a little. Deterministic, so a shape looks the
     same every frame instead of shimmering. */
  function wobble(th, seed) {
    return 1
      + 0.022 * Math.sin(3 * th + seed)
      + 0.014 * Math.sin(5 * th - seed * 1.7)
      + 0.008 * Math.sin(8 * th + seed * 0.6);
  }
  function seedOf(x, y, r) { return (x * 12.9898 + y * 78.233 + r * 37.719) % 6.283; }

  /* Resolve which layers exist at time t, newest definition per id wins. */
  function layersAt(design, t) {
    const map = new Map();
    for (let i = 0; i < design.phases.length; i++) {
      const ph = design.phases[i];
      if (ph.start > t || !ph.paint) continue;
      const p = clamp((t - ph.start) / Math.max(1, ph.ms), 0, 1);
      for (let j = 0; j < ph.paint.length; j++) {
        const op = ph.paint[j];
        const id = op.id || 'p' + i + '_' + j;
        const prev = map.get(id);
        map.set(id, { op: op, p: p, from: prev ? prev.op : null });
      }
    }
    return map;
  }

  /* ---------- primitive shapes (cup units) ---------- */

  function toPx(cx, cy, R, x, y) { return [cx + x * R, cy + y * R]; }

  function blobPath(ctx, cx, cy, R, x, y, r) {
    const seed = seedOf(x, y, r);
    const N = 72;
    ctx.beginPath();
    for (let i = 0; i <= N; i++) {
      const th = (i / N) * Math.PI * 2;
      const rr = r * wobble(th, seed);
      const P = toPx(cx, cy, R, x + Math.cos(th) * rr, y + Math.sin(th) * rr * 0.98);
      if (i === 0) ctx.moveTo(P[0], P[1]); else ctx.lineTo(P[0], P[1]);
    }
    ctx.closePath();
  }

  function heartPath(ctx, cx, cy, R, x, y, r, morph) {
    const m = clamp(morph, 0, 1);
    const seed = seedOf(x, y, r);
    ctx.beginPath();
    for (let i = 0; i <= HEART.length; i++) {
      const idx = i % HEART.length;
      const th = (idx / HEART.length) * Math.PI * 2;
      const hx = HEART[idx][0], hy = HEART[idx][1];
      const cxp = Math.sin(th), cyp = -Math.cos(th);
      const w = wobble(th, seed);
      const px = (cxp + (hx - cxp) * m) * r * w;
      const py = (cyp + (hy - cyp) * m) * r * w;
      const P = toPx(cx, cy, R, x + px, y + py);
      if (i === 0) ctx.moveTo(P[0], P[1]); else ctx.lineTo(P[0], P[1]);
    }
    ctx.closePath();
  }

  /* A tulip petal: wide, low, bowed away from you, round on your side. */
  function petalPath(ctx, cx, cy, R, x, y, r, topOnly) {
    const P = toPx(cx, cy, R, x, y);
    const rx = r * R, ry = r * R * 0.66;
    ctx.beginPath();
    ctx.moveTo(P[0] - rx, P[1]);
    ctx.quadraticCurveTo(P[0], P[1] - ry * 1.9, P[0] + rx, P[1]);
    if (topOnly) return;
    ctx.quadraticCurveTo(P[0] + rx * 0.98, P[1] + ry * 1.25, P[0], P[1] + ry * 1.3);
    ctx.quadraticCurveTo(P[0] - rx * 0.98, P[1] + ry * 1.25, P[0] - rx, P[1]);
    ctx.closePath();
  }

  function pathPoint(op, t) {
    const a = op.from, b = op.to, c = op.ctrl;
    if (!c) return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    const u = 1 - t;
    return {
      x: u * u * a.x + 2 * u * t * c.x + t * t * b.x,
      y: u * u * a.y + 2 * u * t * c.y + t * t * b.y
    };
  }

  /* A rosetta / ripple stack.

     Built the way one actually reads in the cup: the milk is one
     continuous leaf whose outline is scalloped by the tips of each
     wiggle, and the layers show only as thin crema crescents inside it.
     Leaf tips stagger left/right because a wiggle lands alternate
     sides, and the whole shape tapers to a point where the pour
     finished. */
  function rosetta(ctx, cx, cy, R, op, p) {
    const n = op.leaves || 8;
    const shown = Math.max(2, Math.ceil(n * ease(p)));

    const leaves = [];
    for (let i = 0; i < shown; i++) {
      const t = n === 1 ? 0 : i / (n - 1);
      const c = pathPoint(op, t);
      const a = pathPoint(op, Math.max(0, t - 0.03));
      const b = pathPoint(op, Math.min(1, t + 0.03));
      let dx = b.x - a.x, dy = b.y - a.y;
      const dl = Math.hypot(dx, dy) || 1; dx /= dl; dy /= dl;   // travel
      const px = -dy, py = dx;                                   // lateral
      // widest a third of the way in, then tapering to the tip the
      // pull-through will pinch; a wing peaks later and stays fuller
      const prof = op.prof === 'mid'
        ? Math.pow(Math.sin(Math.PI * (0.22 + 0.62 * t)), 0.5) * (1 - 0.18 * t)
        : op.prof === 'reverse'                       // pinched where the pour began
          ? Math.pow(Math.sin(Math.PI * (0.2 + 0.7 * (1 - t))), 0.5) * (1 - 0.42 * (1 - t))
          : Math.pow(Math.sin(Math.PI * (0.2 + 0.7 * t)), 0.5) * (1 - 0.42 * t);
      const hw = (op.w || 0.8) * 0.5 * Math.max(0.06, prof);
      const side = i % 2 ? 1 : -1;                               // way the wiggle just went
      const sweep = hw * 0.42;                                   // tips trail behind
      const cxp = c.x + px * side * hw * 0.05;
      const cyp = c.y + py * side * hw * 0.05;

      leaves.push({
        c: { x: cxp, y: cyp },
        dx: dx, dy: dy, px: px, py: py, hw: hw,
        L: { x: cxp - px * hw * (1 - 0.08 * side) - dx * sweep, y: cyp - py * hw * (1 - 0.08 * side) - dy * sweep },
        R: { x: cxp + px * hw * (1 + 0.08 * side) - dx * sweep, y: cyp + py * hw * (1 + 0.08 * side) - dy * sweep }
      });
    }

    const first = leaves[0], last = leaves[leaves.length - 1];
    const P = function (q) { return toPx(cx, cy, R, q.x, q.y); };

    /* outline: down the left tips, round the finishing point, back up
       the right tips, and closed off over the far end */
    ctx.beginPath();
    let q = P(first.L);
    ctx.moveTo(q[0], q[1]);
    for (let i = 1; i < leaves.length; i++) {
      const a = leaves[i - 1].L, b = leaves[i].L;
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const inward = 0.18;                                       // scallop between tips
      const ctl = { x: mid.x + leaves[i].px * (leaves[i].hw * inward), y: mid.y + leaves[i].py * (leaves[i].hw * inward) };
      const c1 = toPx(cx, cy, R, ctl.x, ctl.y), b1 = P(b);
      ctx.quadraticCurveTo(c1[0], c1[1], b1[0], b1[1]);
    }
    // a narrow end finishes in a point, a wide one in a smooth round cap
    let maxHw = 0;
    leaves.forEach(function (l) { maxHw = Math.max(maxHw, l.hw); });
    if (last.hw > maxHw * 0.72) {
      const cap = toPx(cx, cy, R, last.c.x + last.dx * last.hw * 1.15, last.c.y + last.dy * last.hw * 1.15);
      ctx.quadraticCurveTo(cap[0], cap[1], P(last.R)[0], P(last.R)[1]);
    } else {
      const nl = toPx(cx, cy, R, last.c.x - last.px * last.hw * 0.22 + last.dx * last.hw * 0.85,
                                  last.c.y - last.py * last.hw * 0.22 + last.dy * last.hw * 0.85);
      const nr = toPx(cx, cy, R, last.c.x + last.px * last.hw * 0.22 + last.dx * last.hw * 0.85,
                                  last.c.y + last.py * last.hw * 0.22 + last.dy * last.hw * 0.85);
      const np = toPx(cx, cy, R, last.c.x + last.dx * last.hw * 1.2, last.c.y + last.dy * last.hw * 1.2);
      ctx.quadraticCurveTo(nl[0], nl[1], np[0], np[1]);
      ctx.quadraticCurveTo(nr[0], nr[1], P(last.R)[0], P(last.R)[1]);
    }
    for (let i = leaves.length - 2; i >= 0; i--) {
      const a = leaves[i + 1].R, b = leaves[i].R;
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const ctl = { x: mid.x - leaves[i].px * (leaves[i].hw * 0.18), y: mid.y - leaves[i].py * (leaves[i].hw * 0.18) };
      const c1 = toPx(cx, cy, R, ctl.x, ctl.y), b1 = P(b);
      ctx.quadraticCurveTo(c1[0], c1[1], b1[0], b1[1]);
    }
    // far end: the back of the very first leaf
    const back = toPx(cx, cy, R, first.c.x - first.dx * first.hw * 1.1, first.c.y - first.dy * first.hw * 1.1);
    ctx.quadraticCurveTo(back[0], back[1], P(first.L)[0], P(first.L)[1]);
    ctx.closePath();
    ctx.fillStyle = MILK;
    ctx.fill();

    // seams: one crescent per wiggle, bowed back against the travel
    ctx.save();
    ctx.clip();
    ctx.strokeStyle = CREMA_LINE;
    ctx.lineWidth = Math.max(1, R * 0.013);
    ctx.lineCap = 'round';
    for (let i = 1; i < leaves.length; i++) {
      const l = leaves[i];
      const a = P(l.L), b = P(l.R);
      const ctl = toPx(cx, cy, R, l.c.x - l.dx * l.hw * 0.95, l.c.y - l.dy * l.hw * 0.95);
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.quadraticCurveTo(ctl[0], ctl[1], b[0], b[1]);
      ctx.stroke();
    }
    ctx.restore();
  }

  /* A drawn line of milk: the pull-through, a swan's neck, a beak.
     `taper` narrows it from start to end the way a thinning stream does. */
  function stroke(ctx, cx, cy, R, op, p) {
    const pts = op.pts.map(function (q) { return toPx(cx, cy, R, q[0], q[1]); });
    const prog = ease(clamp(p, 0, 1));
    const steps = 48;
    const last = Math.max(1, Math.round(steps * prog));
    const at = function (t) {
      if (op.curve && pts.length === 3) {
        const u = 1 - t;
        return [
          u * u * pts[0][0] + 2 * u * t * pts[1][0] + t * t * pts[2][0],
          u * u * pts[0][1] + 2 * u * t * pts[1][1] + t * t * pts[2][1]
        ];
      }
      const a = pts[0], b = pts[pts.length - 1];
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    };

    ctx.save();
    ctx.fillStyle = MILK;
    ctx.strokeStyle = MILK;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (!op.taper) {
      ctx.lineWidth = Math.max(1.5, (op.w || 0.04) * R);
      ctx.beginPath();
      for (let i = 0; i <= last; i++) {
        const q = at(i / steps);
        if (i === 0) ctx.moveTo(q[0], q[1]); else ctx.lineTo(q[0], q[1]);
      }
      ctx.stroke();
      ctx.restore();
      return;
    }

    const w0 = op.taper[0] * R, w1 = op.taper[1] * R;
    const left = [], right = [];
    for (let i = 0; i <= last; i++) {
      const t = i / steps;
      const q = at(t);
      const q2 = at(Math.min(1, t + 0.02));
      const q0 = at(Math.max(0, t - 0.02));
      let dx = q2[0] - q0[0], dy = q2[1] - q0[1];
      const dl = Math.hypot(dx, dy) || 1; dx /= dl; dy /= dl;
      const hw = (w0 + (w1 - w0) * t) / 2;
      left.push([q[0] - dy * hw, q[1] + dx * hw]);
      right.push([q[0] + dy * hw, q[1] - dx * hw]);
    }
    ctx.beginPath();
    left.forEach(function (q, i) { i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); });
    for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i][0], right[i][1]);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawLayer(ctx, cx, cy, R, entry) {
    const op = entry.op, p = entry.p;
    ctx.save();
    switch (op.k) {
      case 'wash': {
        const P = toPx(cx, cy, R, 0, 0);
        const rr = (op.r || 0.8) * R * (0.4 + 0.6 * p);
        const g = ctx.createRadialGradient(P[0], P[1], rr * 0.1, P[0], P[1], rr);
        g.addColorStop(0, 'rgba(255,239,216,0.30)');
        g.addColorStop(1, 'rgba(255,239,216,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(P[0], P[1], rr, 0, Math.PI * 2); ctx.fill();
        break;
      }
      case 'blob': {
        const prev = entry.from;
        const r0 = prev && (prev.k === 'blob' || prev.k === 'layer') ? prev.r : 0;
        const x0 = prev ? prev.x : op.x, y0 = prev ? prev.y : op.y;
        const e = ease(p);
        const r = r0 + (op.r - r0) * e;
        const x = x0 + (op.x - x0) * e, y = y0 + (op.y - y0) * e;
        if (op.edge) {
          blobPath(ctx, cx, cy, R, x, y, r);
          ctx.strokeStyle = CREMA_RING;
          ctx.lineWidth = Math.max(2, R * 0.032);
          ctx.stroke();
        }
        blobPath(ctx, cx, cy, R, x, y, r);
        ctx.fillStyle = MILK;
        ctx.fill();
        break;
      }
      case 'layer': {
        const prev = entry.from;
        const r0 = prev ? prev.r : 0;
        const x0 = prev ? prev.x : op.x, y0 = prev ? prev.y : op.y;
        const e = ease(p);
        const r = r0 + (op.r - r0) * e;
        const x = x0 + (op.x - x0) * e, y = y0 + (op.y - y0) * e;
        petalPath(ctx, cx, cy, R, x, y, r);
        ctx.fillStyle = MILK;
        ctx.fill();
        petalPath(ctx, cx, cy, R, x, y, r, true);   // only the far edge is a seam
        ctx.strokeStyle = CREMA_LINE;
        ctx.lineWidth = Math.max(1, R * 0.013);
        ctx.stroke();
        break;
      }
      case 'heart': {
        const prev = entry.from;
        const r0 = prev && prev.r ? prev.r : op.r;
        const r = r0 + (op.r - r0) * p;
        if (op.edge) {
          heartPath(ctx, cx, cy, R, op.x, op.y, r, p);
          ctx.strokeStyle = CREMA_RING;
          ctx.lineWidth = Math.max(2, R * 0.032);
          ctx.stroke();
        }
        heartPath(ctx, cx, cy, R, op.x, op.y, r, p);
        ctx.fillStyle = MILK;
        ctx.fill();
        break;
      }
      case 'rosetta': rosetta(ctx, cx, cy, R, op, p); break;
      case 'stroke': stroke(ctx, cx, cy, R, op, p); break;
    }
    ctx.restore();
  }

  /* ---------- public ---------- */

  function drawCup(ctx, cx, cy, R) {
    ctx.save();
    // ceramic rim
    ctx.beginPath();
    ctx.arc(cx, cy, R * 1.085, 0, Math.PI * 2);
    const rim = ctx.createLinearGradient(cx - R, cy - R, cx + R, cy + R);
    rim.addColorStop(0, '#ffffff');
    rim.addColorStop(0.5, '#e6e1da');
    rim.addColorStop(1, '#c9c2b8');
    ctx.fillStyle = rim;
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = R * 0.18;
    ctx.shadowOffsetY = R * 0.04;
    ctx.fill();
    ctx.shadowColor = 'transparent';
    // crema
    const g = ctx.createRadialGradient(cx - R * 0.25, cy - R * 0.3, R * 0.1, cx, cy, R);
    g.addColorStop(0, '#a46c40');
    g.addColorStop(0.55, '#7e4f2c');
    g.addColorStop(1, '#4a2c18');
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.restore();
  }

  function drawPattern(ctx, cx, cy, R, design, t) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R * 0.995, 0, Math.PI * 2);
    ctx.clip();
    const list = [];
    layersAt(design, t).forEach(function (entry) { list.push(entry); });
    list.sort(function (a, b) { return (a.op.z || 0) - (b.op.z || 0); });
    list.forEach(function (entry) { drawLayer(ctx, cx, cy, R, entry); });
    ctx.restore();
  }

  function drawFinished(ctx, cx, cy, R, design) {
    drawCup(ctx, cx, cy, R);
    drawPattern(ctx, cx, cy, R, design, design.totalMs);
  }

  return {
    drawCup: drawCup,
    drawPattern: drawPattern,
    drawFinished: drawFinished,
    pathPoint: pathPoint
  };
})();

if (typeof window !== 'undefined') window.Pattern = Pattern;
