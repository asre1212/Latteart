/* Small WebAudio helper: countdown blips, step changes, and optional
   spoken step names. Everything is created lazily on first gesture. */
const Cue = (function () {
  let ctx = null;
  let enabled = true;
  let voice = false;

  function ac() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone(freq, ms, gain, type) {
    if (!enabled) return;
    const a = ac(); if (!a) return;
    const o = a.createOscillator(), g = a.createGain();
    o.type = type || 'sine';
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, a.currentTime);
    g.gain.exponentialRampToValueAtTime(gain || 0.14, a.currentTime + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + ms / 1000);
    o.connect(g).connect(a.destination);
    o.start();
    o.stop(a.currentTime + ms / 1000 + 0.02);
  }

  return {
    unlock: function () { ac(); },
    set: function (o) { if ('sound' in o) enabled = !!o.sound; if ('voice' in o) voice = !!o.voice; },
    tick: function () { tone(660, 120, 0.10); },
    go: function () { tone(880, 220, 0.16); setTimeout(function () { tone(1320, 260, 0.14); }, 110); },
    step: function () { tone(760, 150, 0.12, 'triangle'); },
    strong: function () { tone(520, 220, 0.14, 'triangle'); },
    end: function () {
      tone(660, 200, 0.12);
      setTimeout(function () { tone(880, 200, 0.12); }, 150);
      setTimeout(function () { tone(1174, 420, 0.13); }, 300);
    },
    say: function (text) {
      if (!voice || !('speechSynthesis' in window)) return;
      try {
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.rate = 1.05; u.pitch = 1; u.volume = 1;
        window.speechSynthesis.speak(u);
      } catch (e) { /* speech is a nicety, never a blocker */ }
    },
    hush: function () { if ('speechSynthesis' in window) try { window.speechSynthesis.cancel(); } catch (e) {} }
  };
})();
if (typeof window !== 'undefined') window.Cue = Cue;
