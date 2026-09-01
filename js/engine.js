/* ------------------------------------------------------------------
   Engine — turns a design's phase list into a position, height, flow
   and tilt at any moment in time, and draws the guide + timeline.
------------------------------------------------------------------- */
const Engine = (function () {
  const MOTION = {
    steady: { color: '#a97c53', label: 'Steady pour', icon: '↓' },
    drop:   { color: '#e0913c', label: 'Drop close',  icon: '⤓' },
    hold:   { color: '#f2c664', label: 'Hold still',  icon: '●' },
    wiggle: { color: '#3fc7a2', label: 'Zigzag',      icon: '≈' },
    push:   { color: '#4fa3e0', label: 'Push in',     icon: '⇡' },
    drag:   { color: '#ef6b86', label: 'Pull through',icon: '↑' },
    lift:   { color: '#a99ad2', label: 'Lift away',   icon: '⤒' },
    pause:  { color: '#6f7683', label: 'Pause',       icon: '‖' },
    curve:  { color: '#c07ee6', label: 'Curve',       icon: '↝' }
  };

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (t) => t * t * (3 - 2 * t);

  function phaseAt(design, t) {
    const ph = design.phases;
    if (t <= 0) return ph[0];
    for (let i = 0; i < ph.length; i++) if (t < ph[i].end) return ph[i];
    return ph[ph.length - 1];
  }

  /* Full state of the pour at time t (ms). */
  function sample(design, t) {
    t = clamp(t, 0, design.totalMs);
    const p = phaseAt(design, t);
    const raw = clamp((t - p.start) / Math.max(1, p.ms), 0, 1);
    const travelT = p.wiggle ? raw : smooth(raw);
    const base = Pattern.pathPoint(p.path, travelT);
    let x = base.x, y = base.y, wig = 0;

    if (p.wiggle) {
      const nxt = Pattern.pathPoint(p.path, Math.min(1, travelT + 0.03));
      const prv = Pattern.pathPoint(p.path, Math.max(0, travelT - 0.03));
      let dx = nxt.x - prv.x, dy = nxt.y - prv.y;
      const len = Math.hypot(dx, dy);
      if (len < 1e-4) { dx = 0; dy = 1; } else { dx /= len; dy /= len; }
      const px = -dy, py = dx;                    // lateral axis
      const ramp = Math.min(1, raw / 0.12) * Math.min(1, (1 - raw) / 0.1 + 0.2);
      wig = Math.sin((2 * Math.PI * p.wiggle.hz * (t - p.start)) / 1000) * p.wiggle.amp * clamp(ramp, 0, 1);
      x += px * wig;
      y += py * wig;
    }

    const e = smooth(raw);
    return {
      t: t,
      phase: p,
      phaseIndex: p.index,
      phaseP: raw,
      phaseLeftMs: p.end - t,
      x: x, y: y, wiggleOffset: wig,
      height: lerp(p.height[0], p.height[1], e),
      flow: lerp(p.flow[0], p.flow[1], e),
      tilt: lerp(p.tilt[0], p.tilt[1], e),
      motion: p.motion,
      beat: p.wiggle ? p.wiggle.hz : 0
    };
  }

  /* ---------------- guide canvas ---------------- */

  function drawGuide(ctx, w, h, design, t, opts) {
    opts = opts || {};
    ctx.clearRect(0, 0, w, h);
    const R = Math.min(w * 0.42, h * 0.40);
    const cx = w / 2, cy = h / 2;

    Pattern.drawCup(ctx, cx, cy, R);
    Pattern.drawPattern(ctx, cx, cy, R, design, t);

    // faint centre guides
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 8]);
    ctx.beginPath();
    ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy + R);
    ctx.moveTo(cx - R, cy); ctx.lineTo(cx + R, cy);
    ctx.stroke();
    ctx.restore();

    const s = sample(design, t);
    const col = (MOTION[s.motion] || MOTION.steady).color;

    // motion trail — where the spout has been over the last 900 ms
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const N = 34, span = 900;
    for (let i = 0; i < N - 1; i++) {
      const t0 = t - (span * i) / N, t1 = t - (span * (i + 1)) / N;
      if (t1 < 0) break;
      const a = sample(design, t0), b = sample(design, t1);
      const alpha = 0.55 * (1 - i / N);
      ctx.strokeStyle = 'rgba(255,255,255,' + alpha.toFixed(3) + ')';
      ctx.lineWidth = Math.max(1, R * 0.035 * (1 - i / N));
      ctx.beginPath();
      ctx.moveTo(cx + a.x * R, cy + a.y * R);
      ctx.lineTo(cx + b.x * R, cy + b.y * R);
      ctx.stroke();
    }
    ctx.restore();

    // target puck
    const px = cx + s.x * R, py = cy + s.y * R;
    const halo = R * (0.10 + s.height * 0.022);
    ctx.save();
    const g = ctx.createRadialGradient(px, py, halo * 0.2, px, py, halo);
    g.addColorStop(0, 'rgba(255,255,255,0.30)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(px, py, halo, 0, Math.PI * 2); ctx.fill();

    ctx.strokeStyle = col;
    ctx.lineWidth = Math.max(2, R * 0.022);
    ctx.beginPath();
    ctx.arc(px, py, R * (0.055 + s.flow * 0.075), 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(px, py, Math.max(2, R * 0.012 + s.flow * R * 0.03), 0, Math.PI * 2);
    ctx.fill();

    // crosshair arms
    ctx.strokeStyle = 'rgba(255,255,255,0.65)';
    ctx.lineWidth = 1.5;
    const arm = R * 0.16;
    ctx.beginPath();
    ctx.moveTo(px - arm, py); ctx.lineTo(px - arm * 0.45, py);
    ctx.moveTo(px + arm * 0.45, py); ctx.lineTo(px + arm, py);
    ctx.moveTo(px, py - arm); ctx.lineTo(px, py - arm * 0.45);
    ctx.moveTo(px, py + arm * 0.45); ctx.lineTo(px, py + arm);
    ctx.stroke();
    ctx.restore();

    // direction arrow (where the pitcher is heading next)
    const ahead = sample(design, Math.min(design.totalMs, t + 260));
    let ax = ahead.x - s.x, ay = ahead.y - s.y;
    if (s.motion === 'wiggle') { // show travel, not the wiggle itself
      const a2 = Pattern.pathPoint(s.phase.path, clamp(s.phaseP + 0.12, 0, 1));
      const a1 = Pattern.pathPoint(s.phase.path, s.phaseP);
      ax = a2.x - a1.x; ay = a2.y - a1.y;
    }
    const alen = Math.hypot(ax, ay);
    if (alen > 0.012) {
      ax /= alen; ay /= alen;
      ctx.save();
      ctx.translate(px + ax * R * 0.2, py + ay * R * 0.2);
      ctx.rotate(Math.atan2(ay, ax));
      ctx.fillStyle = col;
      const a = R * 0.06;
      ctx.beginPath();
      ctx.moveTo(a, 0); ctx.lineTo(-a * 0.6, a * 0.55); ctx.lineTo(-a * 0.6, -a * 0.55);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }

    // rim orientation labels
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.38)';
    ctx.font = '600 ' + Math.max(9, Math.round(R * 0.075)) + 'px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('FAR RIM', cx, cy - R * 1.16);
    ctx.fillText('TOWARDS YOU', cx, cy + R * 1.22);
    ctx.restore();

    return s;
  }

  /* -------- linear motion map: lateral position over time -------- */

  function drawTrace(ctx, w, h, design, opts) {
    opts = opts || {};
    const t = opts.t;
    const padT = opts.compact ? 6 : 22;
    const padB = opts.compact ? 6 : 18;
    const midY = padT + (h - padT - padB) / 2;
    const half = (h - padT - padB) / 2;

    ctx.clearRect(0, 0, w, h);

    // phase bands
    design.phases.forEach(function (p) {
      const x0 = (p.start / design.totalMs) * w;
      const x1 = (p.end / design.totalMs) * w;
      const m = MOTION[p.motion] || MOTION.steady;
      ctx.fillStyle = m.color + (opts.compact ? '22' : '26');
      ctx.fillRect(x0, padT, Math.max(1, x1 - x0), h - padT - padB);
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      ctx.fillRect(x0, padT, 1, h - padT - padB);
      if (!opts.compact) {
        ctx.fillStyle = m.color;
        ctx.fillRect(x0 + 1, h - padB, Math.max(1, x1 - x0 - 2), 3);
      }
    });

    // centre line
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.setLineDash([3, 5]);
    ctx.beginPath(); ctx.moveTo(0, midY); ctx.lineTo(w, midY); ctx.stroke();
    ctx.setLineDash([]);

    const steps = Math.min(2200, Math.max(320, Math.round(w * 3)));

    // near/far travel (dim)
    ctx.strokeStyle = 'rgba(255,255,255,0.26)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const tt = (i / steps) * design.totalMs;
      const s = sample(design, tt);
      const X = (i / steps) * w, Y = midY + s.y * half * 0.92;
      if (i === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y);
    }
    ctx.stroke();

    // lateral position (bright) — straight when holding, zigzag when wiggling
    ctx.lineWidth = opts.compact ? 1.8 : 2.4;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    let lastColor = null;
    for (let i = 0; i <= steps; i++) {
      const tt = (i / steps) * design.totalMs;
      const s = sample(design, tt);
      const X = (i / steps) * w, Y = midY + s.x * half * 0.92;
      const c = (MOTION[s.motion] || MOTION.steady).color;
      if (c !== lastColor) {
        if (lastColor) { ctx.stroke(); }
        ctx.beginPath(); ctx.moveTo(X, Y);
        ctx.strokeStyle = c; lastColor = c;
      } else ctx.lineTo(X, Y);
    }
    ctx.stroke();

    // playhead
    if (typeof t === 'number') {
      const X = (clamp(t, 0, design.totalMs) / design.totalMs) * w;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(X, padT - 2); ctx.lineTo(X, h - padB + 2); ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(X, padT - 2, 3.5, 0, Math.PI * 2); ctx.fill();
    }

    // seconds ruler
    if (!opts.compact) {
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.font = '10px ui-sans-serif, system-ui, sans-serif';
      ctx.textAlign = 'center';
      const total = design.totalMs / 1000;
      const stepS = total > 24 ? 5 : 2;
      for (let sec = 0; sec <= total; sec += stepS) {
        const X = (sec / total) * w;
        ctx.fillRect(X, padT - 5, 1, 4);
        ctx.fillText(sec + 's', clamp(X, 12, w - 12), padT - 8);
      }
    }
  }

  return { sample: sample, drawGuide: drawGuide, drawTrace: drawTrace, MOTION: MOTION };
})();

if (typeof window !== 'undefined') window.Engine = Engine;
