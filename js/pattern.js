/* ------------------------------------------------------------------
   Pattern renderer — draws the cup and the milk pattern as it forms.
   Everything is expressed in cup units (-1..1) and scaled by R.
------------------------------------------------------------------- */
const Pattern = (function () {
  const MILK = '#fdfaf2';
  const MILK_SOFT = 'rgba(253,250,242,0.92)';
  const CREMA_EDGE = 'rgba(74,44,25,0.85)';

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

  function blobPath(ctx, cx, cy, R, x, y, r, squash) {
    const P = toPx(cx, cy, R, x, y);
    ctx.beginPath();
    ctx.ellipse(P[0], P[1], r * R, r * R * (squash || 1), 0, 0, Math.PI * 2);
  }

  function heartPath(ctx, cx, cy, R, x, y, r, morph) {
    const m = clamp(morph, 0, 1);
    ctx.beginPath();
    for (let i = 0; i <= HEART.length; i++) {
      const idx = i % HEART.length;
      const th = (idx / HEART.length) * Math.PI * 2;
      const hx = HEART[idx][0], hy = HEART[idx][1];
      const cxp = Math.sin(th), cyp = -Math.cos(th);
      const px = (cxp + (hx - cxp) * m) * r;
      const py = (cyp + (hy - cyp) * m) * r;
      const P = toPx(cx, cy, R, x + px, y + py);
      if (i === 0) ctx.moveTo(P[0], P[1]); else ctx.lineTo(P[0], P[1]);
    }
    ctx.closePath();
  }

  /* a pushed-forward tulip layer: round at the near side, fanned at the far side */
  function layerPath(ctx, cx, cy, R, x, y, r) {
    const P = toPx(cx, cy, R, x, y);
    const rx = r * R, ry = r * R * 0.78;
    ctx.beginPath();
    ctx.moveTo(P[0] - rx, P[1] - ry * 0.05);
    ctx.quadraticCurveTo(P[0] - rx * 0.72, P[1] - ry * 0.95, P[0], P[1] - ry * 0.72);
    ctx.quadraticCurveTo(P[0] + rx * 0.72, P[1] - ry * 0.95, P[0] + rx, P[1] - ry * 0.05);
    ctx.quadraticCurveTo(P[0] + rx * 0.95, P[1] + ry, P[0], P[1] + ry);
    ctx.quadraticCurveTo(P[0] - rx * 0.95, P[1] + ry, P[0] - rx, P[1] - ry * 0.05);
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

  /* A rosetta / ripple stack: fat overlapping leaves laid along a path.
     Leaves are drawn oldest first, each one bowing backwards against the
     direction of travel, so only its leading crescent stays visible. */
  function rosetta(ctx, cx, cy, R, op, p) {
    const n = op.leaves || 8;
    const shown = Math.max(1, Math.ceil(n * ease(p)));
    let len = 0, prev = pathPoint(op, 0);
    for (let i = 1; i <= 12; i++) {
      const q = pathPoint(op, i / 12);
      len += Math.hypot(q.x - prev.x, q.y - prev.y);
      prev = q;
    }
    const spacing = len / Math.max(1, n - 1);
    const body = Math.max(spacing * 2.4, 0.16);

    for (let i = 0; i < shown; i++) {
      const t = n === 1 ? 0 : i / (n - 1);
      const c = pathPoint(op, t);
      const a = pathPoint(op, Math.max(0, t - 0.03));
      const b = pathPoint(op, Math.min(1, t + 0.03));
      let dx = b.x - a.x, dy = b.y - a.y;
      const dl = Math.hypot(dx, dy) || 1; dx /= dl; dy /= dl;   // travel
      const bx = -dx, by = -dy;                                  // backwards
      const px = -dy, py = dx;                                   // lateral
      const prof = Math.pow(Math.sin(Math.PI * (0.16 + 0.74 * t)), 0.65) * (1 - 0.42 * t);
      const hw = (op.w || 0.8) * 0.5 * Math.max(0.12, prof);
      const sweep = hw * 0.45;

      const L  = toPx(cx, cy, R, c.x - px * hw + bx * sweep, c.y - py * hw + by * sweep);
      const Rt = toPx(cx, cy, R, c.x + px * hw + bx * sweep, c.y + py * hw + by * sweep);
      const CO = toPx(cx, cy, R, c.x + bx * hw * 0.8, c.y + by * hw * 0.8);
      const CI = toPx(cx, cy, R, c.x + dx * body * 1.2, c.y + dy * body * 1.2);

      ctx.beginPath();
      ctx.moveTo(L[0], L[1]);
      ctx.quadraticCurveTo(CO[0], CO[1], Rt[0], Rt[1]);
      ctx.quadraticCurveTo(CI[0], CI[1], L[0], L[1]);
      ctx.closePath();
      ctx.fillStyle = MILK;
      ctx.strokeStyle = CREMA_EDGE;
      ctx.lineWidth = Math.max(1, R * 0.014);
      ctx.fill();
      ctx.stroke();
    }
  }

  function stroke(ctx, cx, cy, R, op, p) {
    const pts = op.pts.map(function (q) { return toPx(cx, cy, R, q[0], q[1]); });
    const prog = ease(clamp(p, 0, 1));
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = MILK;
    ctx.lineWidth = Math.max(1.5, (op.w || 0.04) * R);
    ctx.beginPath();
    if (op.curve && pts.length === 3) {
      // sample the quadratic so it can be revealed progressively
      const steps = 40, last = Math.max(1, Math.round(steps * prog));
      for (let i = 0; i <= last; i++) {
        const t = i / steps, u = 1 - t;
        const x = u * u * pts[0][0] + 2 * u * t * pts[1][0] + t * t * pts[2][0];
        const y = u * u * pts[0][1] + 2 * u * t * pts[1][1] + t * t * pts[2][1];
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
    } else {
      const a = pts[0], b = pts[pts.length - 1];
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(a[0] + (b[0] - a[0]) * prog, a[1] + (b[1] - a[1]) * prog);
    }
    ctx.stroke();
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
          ctx.strokeStyle = CREMA_EDGE;
          ctx.lineWidth = Math.max(2, R * 0.035);
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
        layerPath(ctx, cx, cy, R, x, y, r);
        ctx.strokeStyle = CREMA_EDGE;
        ctx.lineWidth = Math.max(1.5, R * 0.018);
        ctx.fillStyle = MILK;
        ctx.fill(); ctx.stroke();
        break;
      }
      case 'heart': {
        const prev = entry.from;
        const r0 = prev && prev.r ? prev.r : op.r;
        const r = r0 + (op.r - r0) * p;
        if (op.edge) {
          heartPath(ctx, cx, cy, R, op.x, op.y, r, p);
          ctx.strokeStyle = CREMA_EDGE;
          ctx.lineWidth = Math.max(2, R * 0.035);
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
