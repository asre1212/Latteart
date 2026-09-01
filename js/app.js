/* ------------------------------------------------------------------
   Latte Motion — app shell: routing, screens, and the guided pour loop
------------------------------------------------------------------- */
(function () {
  'use strict';

  const $ = function (id) { return document.getElementById(id); };
  const DIFF = ['', 'Beginner', 'Beginner+', 'Intermediate', 'Advanced', 'Expert'];

  /* ---------------- settings ---------------- */
  const DEFAULTS = { sound: true, voice: false, haptics: true, wake: true, speed: 1, countdown: 3 };
  let S = Object.assign({}, DEFAULTS);
  try {
    const saved = JSON.parse(localStorage.getItem('lm.settings') || '{}');
    S = Object.assign(S, saved);
  } catch (e) { /* first run, or storage blocked */ }
  function saveSettings() {
    try { localStorage.setItem('lm.settings', JSON.stringify(S)); } catch (e) {}
    Cue.set(S);
  }
  Cue.set(S);

  /* ---------------- canvas helper ---------------- */
  function fit(canvas) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const r = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
    if (canvas._w !== w || canvas._h !== h || canvas._d !== dpr) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas._w = w; canvas._h = h; canvas._d = dpr;
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx: ctx, w: w, h: h };
  }

  /* ---------------- home ---------------- */
  function buildHome() {
    const grid = $('grid');
    grid.innerHTML = '';
    DESIGNS.forEach(function (d) {
      const card = document.createElement('a');
      card.className = 'card';
      card.href = '#/d/' + d.id;
      card.innerHTML =
        '<div class="card-art"><canvas></canvas></div>' +
        '<div class="card-body">' +
          '<h3>' + d.name + '</h3>' +
          '<p>' + d.tagline + '</p>' +
          '<div class="card-meta"><span class="dots" aria-label="' + DIFF[d.difficulty] + '">' +
            '<i></i><i></i><i></i><i></i><i></i></span>' +
            '<span>' + Math.round(d.totalMs / 1000) + 's</span></div>' +
        '</div>';
      const dots = card.querySelectorAll('.dots i');
      for (let i = 0; i < dots.length; i++) if (i < d.difficulty) dots[i].classList.add('on');
      grid.appendChild(card);
      const c = card.querySelector('canvas');
      requestAnimationFrame(function () {
        const f = fit(c);
        Pattern.drawFinished(f.ctx, f.w / 2, f.h / 2, Math.min(f.w, f.h) * 0.42, d);
      });
    });
  }

  /* ---------------- detail ---------------- */
  let detailDesign = null;

  function buildDetail(d) {
    detailDesign = d;
    $('dFamily').textContent = d.family;
    $('dName').textContent = d.name;
    $('dTagline').textContent = d.tagline;
    $('dDifficulty').textContent = DIFF[d.difficulty];
    $('dTime').textContent = Math.round(d.totalMs / 1000) + ' second pour';
    $('dSteps').textContent = d.phases.length + ' steps';
    $('dAbout').textContent = d.about;

    const steps = $('dSteps2');
    steps.innerHTML = '';
    d.phases.forEach(function (p) {
      const m = Engine.MOTION[p.motion] || Engine.MOTION.steady;
      const li = document.createElement('li');
      li.innerHTML =
        '<div class="step-time"><b>' + (p.start / 1000).toFixed(1) + 's</b><span>' + (p.ms / 1000).toFixed(1) + 's</span></div>' +
        '<div class="step-body">' +
          '<div class="step-title"><span class="motion-chip" style="--mc:' + m.color + '">' + m.icon + ' ' + m.label + '</span>' +
          '<h4>' + p.label + '</h4></div>' +
          '<p>' + p.detail + '</p>' +
          '<div class="step-facts">' +
            '<span>' + p.height[0] + '→' + p.height[1] + ' cm high</span>' +
            '<span>flow ' + Math.round(p.flow[0] * 100) + '→' + Math.round(p.flow[1] * 100) + '%</span>' +
            '<span>cup ' + Math.round(p.tilt[0]) + '°→' + Math.round(p.tilt[1]) + '°</span>' +
            (p.wiggle ? '<span class="hot">' + p.wiggle.hz + ' wiggles/sec</span>' : '') +
          '</div>' +
        '</div>';
      steps.appendChild(li);
    });

    const tips = $('dTips');
    tips.innerHTML = '';
    d.tips.forEach(function (t) {
      const li = document.createElement('li');
      li.textContent = t;
      tips.appendChild(li);
    });

    const legend = $('dLegend');
    legend.innerHTML = '';
    const seen = {};
    d.phases.forEach(function (p) {
      if (seen[p.motion]) return;
      seen[p.motion] = 1;
      const m = Engine.MOTION[p.motion];
      const el = document.createElement('span');
      el.className = 'legend-item';
      el.innerHTML = '<i style="background:' + m.color + '"></i>' + m.label;
      legend.appendChild(el);
    });

    drawDetailCanvases();
  }

  function drawDetailCanvases() {
    if (!detailDesign) return;
    const a = fit($('detailCanvas'));
    Pattern.drawFinished(a.ctx, a.w / 2, a.h / 2, Math.min(a.w, a.h) * 0.42, detailDesign);
    const b = fit($('mapCanvas'));
    Engine.drawTrace(b.ctx, b.w, b.h, detailDesign, {});
  }

  /* ---------------- guided pour ---------------- */
  const run = {
    design: null,
    t: 0,
    playing: false,
    raf: 0,
    last: 0,
    phase: -1,
    state: 'idle',      // idle | counting | pouring | done
    countUntil: 0,
    wakeLock: null
  };

  function startRun(d) {
    run.design = d;
    run.t = 0;
    run.phase = -1;
    run.state = 'counting';
    run.countUntil = performance.now() + S.countdown * 1000;
    run.playing = true;
    run.last = performance.now();
    $('finished').classList.add('hidden');
    $('countdown').classList.remove('hidden');
    $('playBtn').textContent = 'Pause';
    Cue.unlock();
    requestWakeLock();
    loop(performance.now());
  }

  function stopRun() {
    run.playing = false;
    cancelAnimationFrame(run.raf);
    run.raf = 0;
    Cue.hush();
    releaseWakeLock();
  }

  function requestWakeLock() {
    if (!S.wake || !('wakeLock' in navigator)) return;
    navigator.wakeLock.request('screen').then(function (l) {
      run.wakeLock = l;
      l.addEventListener('release', function () { run.wakeLock = null; });
    }).catch(function () { /* denied or unsupported — not fatal */ });
  }
  function releaseWakeLock() {
    if (run.wakeLock) { try { run.wakeLock.release(); } catch (e) {} run.wakeLock = null; }
  }
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && run.state === 'pouring' && run.playing) requestWakeLock();
  });

  let lastCount = -1;

  function loop(now) {
    run.raf = requestAnimationFrame(loop);
    const dt = Math.min(120, now - run.last);
    run.last = now;

    if (run.state === 'counting') {
      const left = run.countUntil - now;
      const n = Math.ceil(left / 1000);
      if (n !== lastCount) {
        lastCount = n;
        $('countNum').textContent = n > 0 ? n : 'POUR';
        if (n > 0) { Cue.tick(); buzz(20); }
        else { Cue.go(); buzz([40, 40, 90]); }
      }
      if (left <= -450) {
        run.state = 'pouring';
        lastCount = -1;
        $('countdown').classList.add('hidden');
      }
      drawFrame();
      return;
    }

    if (run.state === 'pouring' && run.playing) {
      run.t += dt * S.speed;
      if (run.t >= run.design.totalMs) {
        run.t = run.design.totalMs;
        run.state = 'done';
        run.playing = false;
        Cue.end();
        buzz([60, 60, 60, 60, 160]);
        $('finished').classList.remove('hidden');
        $('playBtn').textContent = 'Replay';
        releaseWakeLock();
      }
    }
    drawFrame();
  }

  function buzz(pattern) {
    if (!S.haptics || !navigator.vibrate) return;
    try { navigator.vibrate(pattern); } catch (e) {}
  }

  function drawFrame() {
    const d = run.design;
    if (!d) return;
    const g = fit($('guideCanvas'));
    const s = Engine.drawGuide(g.ctx, g.w, g.h, d, run.t, {});

    const strip = fit($('stripCanvas'));
    Engine.drawTrace(strip.ctx, strip.w, strip.h, d, { t: run.t, compact: true });

    const m = Engine.MOTION[s.motion] || Engine.MOTION.steady;
    if (s.phaseIndex !== run.phase) {
      run.phase = s.phaseIndex;
      $('cueLabel').textContent = s.phase.label;
      $('cueDetail').textContent = s.phase.detail;
      $('cueChip').textContent = m.icon + '  ' + m.label;
      $('cueChip').style.setProperty('--mc', m.color);
      document.documentElement.style.setProperty('--accent-live', m.color);
      const next = d.phases[s.phaseIndex + 1];
      $('nextUp').textContent = next ? 'Next: ' + next.label : 'Last step';
      if (run.state === 'pouring') {
        Cue.step(); buzz(35); Cue.say(s.phase.label);
      }
    }

    $('cuePhaseLeft').textContent = (Math.max(0, s.phaseLeftMs) / 1000).toFixed(1);
    $('cueTotal').textContent = (run.t / 1000).toFixed(1) + ' / ' + (d.totalMs / 1000).toFixed(1) + 's';

    const hPct = Math.max(0, Math.min(1, s.height / 9));
    $('heightFill').style.height = (hPct * 100).toFixed(1) + '%';
    $('heightMark').style.bottom = (hPct * 100).toFixed(1) + '%';
    $('heightVal').textContent = s.height.toFixed(1) + ' cm';

    $('flowFill').style.height = (s.flow * 100).toFixed(1) + '%';
    $('flowVal').textContent = s.flow < 0.06 ? 'off' : Math.round(s.flow * 100) + '%';

    $('tiltGroup').setAttribute('transform', 'rotate(' + (-s.tilt).toFixed(1) + ' 30 22)');
    $('tiltVal').textContent = Math.round(s.tilt) + '°';

    const beat = $('beat');
    if (s.beat) {
      beat.classList.add('on');
      const ph = (run.t / 1000) * s.beat;
      const k = Math.floor(ph % 3);
      const kids = beat.children;
      for (let i = 0; i < kids.length; i++) kids[i].className = i === k ? 'lit' : '';
      beat.style.setProperty('--mc', m.color);
    } else beat.classList.remove('on');
  }

  /* ---------------- routing ---------------- */
  const screens = { home: $('screen-home'), detail: $('screen-detail'), guide: $('screen-guide') };

  function show(name) {
    Object.keys(screens).forEach(function (k) { screens[k].classList.toggle('hidden', k !== name); });
    document.body.classList.toggle('in-guide', name === 'guide');
    $('backBtn').hidden = name === 'home';
    window.scrollTo(0, 0);
  }

  function route() {
    const h = location.hash || '#/';
    const parts = h.replace(/^#\/?/, '').split('/');
    stopRun();

    if (parts[0] === 'd' && parts[1]) {
      const d = DESIGNS.find(function (x) { return x.id === parts[1]; });
      if (d) {
        buildDetail(d);
        show('detail');
        requestAnimationFrame(drawDetailCanvases);   // canvases need a laid-out box
        return;
      }
    }
    if (parts[0] === 'pour' && parts[1]) {
      const d = DESIGNS.find(function (x) { return x.id === parts[1]; });
      if (d) {
        show('guide');
        $('finishedText').textContent = d.name + ' — compare what is in the cup with the target and note which step drifted.';
        requestAnimationFrame(function () { startRun(d); });
        return;
      }
    }
    show('home');
  }

  window.addEventListener('hashchange', route);

  /* ---------------- controls ---------------- */
  $('backBtn').addEventListener('click', function () {
    if (screens.guide.classList.contains('hidden')) location.hash = '#/';
    else location.hash = '#/d/' + (run.design ? run.design.id : '');
  });
  $('startBtn').addEventListener('click', function () {
    Cue.unlock();
    location.hash = '#/pour/' + detailDesign.id;
  });
  $('exitBtn').addEventListener('click', function () { location.hash = '#/d/' + run.design.id; });
  $('doneBtn').addEventListener('click', function () { location.hash = '#/'; });
  $('againBtn').addEventListener('click', function () { startRun(run.design); });
  $('restartBtn').addEventListener('click', function () { startRun(run.design); });
  $('playBtn').addEventListener('click', function () {
    if (run.state === 'done') { startRun(run.design); return; }
    run.playing = !run.playing;
    run.last = performance.now();
    $('playBtn').textContent = run.playing ? 'Pause' : 'Resume';
    if (!run.playing) Cue.hush();
  });
  const SPEEDS = [0.6, 0.8, 1, 1.25];
  $('speedBtn').addEventListener('click', function () {
    const i = SPEEDS.indexOf(S.speed);
    S.speed = SPEEDS[(i + 1) % SPEEDS.length];
    saveSettings();
    syncSettingsUI();
  });

  // scrub the timeline strip by dragging
  (function () {
    const strip = $('stripCanvas');
    let dragging = false;
    function seek(ev) {
      const r = strip.getBoundingClientRect();
      const cx = (ev.touches ? ev.touches[0].clientX : ev.clientX) - r.left;
      run.t = Math.max(0, Math.min(1, cx / r.width)) * run.design.totalMs;
      if (run.state === 'done' && run.t < run.design.totalMs) {
        run.state = 'pouring'; $('finished').classList.add('hidden');
      }
      drawFrame();
    }
    strip.addEventListener('pointerdown', function (e) {
      if (!run.design || run.state === 'counting') return;
      dragging = true; run.playing = false; $('playBtn').textContent = 'Resume';
      strip.setPointerCapture(e.pointerId); seek(e);
    });
    strip.addEventListener('pointermove', function (e) { if (dragging) seek(e); });
    strip.addEventListener('pointerup', function () { dragging = false; });
    strip.addEventListener('pointercancel', function () { dragging = false; });
  })();

  document.addEventListener('keydown', function (e) {
    if (screens.guide.classList.contains('hidden')) return;
    if (e.code === 'Space') { e.preventDefault(); $('playBtn').click(); }
    if (e.key === 'r') $('restartBtn').click();
    if (e.key === 'Escape') $('exitBtn').click();
  });

  /* ---------------- settings sheet ---------------- */
  function openSheet(open) {
    $('settingsSheet').classList.toggle('hidden', !open);
    $('sheetBackdrop').classList.toggle('hidden', !open);
  }
  $('settingsBtn').addEventListener('click', function () { openSheet(true); });
  $('closeSheet').addEventListener('click', function () { openSheet(false); });
  $('sheetBackdrop').addEventListener('click', function () { openSheet(false); });

  function syncSettingsUI() {
    $('optSound').checked = S.sound;
    $('optVoice').checked = S.voice;
    $('optHaptics').checked = S.haptics;
    $('optWake').checked = S.wake;
    $('optSpeed').value = String(S.speed);
    $('optCountdown').value = String(S.countdown);
    $('speedBtn').textContent = S.speed + '×';
  }
  [['optSound', 'sound'], ['optVoice', 'voice'], ['optHaptics', 'haptics'], ['optWake', 'wake']].forEach(function (pair) {
    $(pair[0]).addEventListener('change', function (e) {
      S[pair[1]] = e.target.checked; saveSettings(); syncSettingsUI();
      if (pair[1] === 'sound' && e.target.checked) { Cue.unlock(); Cue.tick(); }
    });
  });
  $('optSpeed').addEventListener('change', function (e) { S.speed = parseFloat(e.target.value); saveSettings(); syncSettingsUI(); });
  $('optCountdown').addEventListener('change', function (e) { S.countdown = parseInt(e.target.value, 10); saveSettings(); });

  /* ---------------- toast ---------------- */
  let toastTimer = 0;
  function toast(msg, actionLabel, action) {
    clearTimeout(toastTimer);
    $('toastText').textContent = msg;
    const btn = $('toastAction');
    if (actionLabel) {
      btn.hidden = false; btn.textContent = actionLabel;
      btn.onclick = function () { $('toast').classList.add('hidden'); action(); };
    } else btn.hidden = true;
    $('toast').classList.remove('hidden');
    if (!actionLabel) toastTimer = setTimeout(function () { $('toast').classList.add('hidden'); }, 3200);
  }

  /* ---------------- install prompt ---------------- */
  let deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferredPrompt = e;
    $('installBtn').hidden = false;
  });
  $('installBtn').addEventListener('click', function () {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    deferredPrompt.userChoice.finally(function () { deferredPrompt = null; $('installBtn').hidden = true; });
  });

  /* ---------------- service worker + updates ---------------- */
  let waitingWorker = null;

  function offerUpdate(worker) {
    waitingWorker = worker;
    toast('A new version of Latte Motion is ready.', 'Reload', function () {
      worker.postMessage({ type: 'SKIP_WAITING' });
    });
  }

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('./sw.js').then(function (reg) {
        if (reg.waiting && navigator.serviceWorker.controller) offerUpdate(reg.waiting);
        reg.addEventListener('updatefound', function () {
          const nw = reg.installing;
          if (!nw) return;
          nw.addEventListener('statechange', function () {
            if (nw.state === 'installed' && navigator.serviceWorker.controller) offerUpdate(nw);
          });
        });
        // look for a new build on launch and every 30 minutes
        reg.update().catch(function () {});
        setInterval(function () { reg.update().catch(function () {}); }, 30 * 60 * 1000);
        $('updateBtn').addEventListener('click', function () {
          reg.update().then(function () {
            setTimeout(function () {
              if (!waitingWorker) toast('You are on the latest version (' + APP_VERSION + ').');
            }, 900);
          }).catch(function () { toast('Could not reach the network.'); });
        });
      }).catch(function () { /* offline install, or unsupported */ });

      let refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', function () {
        if (refreshing) return;
        refreshing = true;
        location.reload();
      });
    });
  } else {
    $('updateBtn').addEventListener('click', function () { toast('Offline support is not available in this browser.'); });
  }

  /* ---------------- boot ---------------- */
  $('verChip').textContent = 'v' + APP_VERSION;
  $('verText').textContent = 'v' + APP_VERSION;
  syncSettingsUI();
  buildHome();
  route();

  let resizeTimer = 0;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      if (!screens.home.classList.contains('hidden')) buildHome();
      if (!screens.detail.classList.contains('hidden')) drawDetailCanvases();
      if (!screens.guide.classList.contains('hidden')) drawFrame();
    }, 150);
  });
})();
