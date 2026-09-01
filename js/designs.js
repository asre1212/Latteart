/* ------------------------------------------------------------------
   Latte Motion — design data
   ------------------------------------------------------------------
   Every design is a list of PHASES played back linearly over time.

   Coordinate system (the cup, seen from above):
       x : -1 = left rim,  +1 = right rim
       y : -1 = far rim (top of the screen, away from you)
           +1 = near rim (bottom of the screen, closest to you)

   A phase describes what the pitcher spout does during a slice of time:
     ms      duration in milliseconds
     motion  'steady' | 'drop' | 'hold' | 'wiggle' | 'push' | 'drag'
             | 'lift'  | 'pause' | 'curve'
     path    { from, to, ctrl? }  spout target, quadratic if ctrl is given
     height  [start, end]   centimetres above the milk surface
     flow    [start, end]   0 = closed, 1 = wide open
     tilt    [start, end]   cup tilt in degrees (0 = level)
     wiggle  { amp, hz }    lateral oscillation, amp in cup radii
     paint   [ops]          how the pattern on the surface changes

   Paint ops are keyed by id: a later phase re-using an id animates that
   same layer (that is how a blob gets pushed forward, or a circle is
   pulled into a heart).
------------------------------------------------------------------- */

/* ---------- shared opening: every pour starts the same way ---------- */
function opening(o) {
  o = o || {};
  return [
    {
      label: 'Tilt & break through',
      detail: 'Tilt the cup 40–45°. Thin steady stream from ~8 cm, straight into the centre. You are folding milk under the crema, not drawing yet.',
      ms: o.setup || 8000, motion: 'steady',
      path: { from: { x: 0, y: -0.06 }, to: { x: 0, y: 0.06 } },
      height: [8, 7], flow: [0.34, 0.46], tilt: [43, 38],
      paint: [{ id: 'wash', k: 'wash', r: 0.55 }]
    },
    {
      label: 'Fill to half — stay centred',
      detail: 'Keep it thin and keep it in one spot. The surface should stay glossy brown with no white showing through.',
      ms: o.fill || 5000, motion: 'steady',
      path: { from: { x: 0, y: 0.06 }, to: { x: 0, y: 0 } },
      height: [7, 6], flow: [0.46, 0.52], tilt: [38, 32],
      paint: [{ id: 'wash', k: 'wash', r: 0.95 }]
    },
    {
      label: 'Drop close, open up',
      detail: 'Spout down to 1–2 cm and open the flow. White appears the moment the pitcher gets close — that is the pattern starting.',
      ms: o.drop || 2200, motion: 'drop',
      path: { from: { x: 0, y: 0 }, to: { x: 0, y: o.dropY === undefined ? 0.3 : o.dropY } },
      height: [6, 1.4], flow: [0.52, 0.86], tilt: [32, 28]
    }
  ];
}

/* ---------- generator: n stacked tulip blobs ---------- */
function tulipStack(n, o) {
  o = o || {};
  const blobMs = o.blobMs || 2000, pauseMs = o.pauseMs || 650;
  const step = 0.88 / n, rBase = o.r || 0.62, yNear = o.yNear === undefined ? 0.2 : o.yNear;
  const phases = [];
  for (let i = 0; i < n; i++) {
    const pourY = 0.30 + (0.20 * i) / Math.max(1, n - 1);
    const m = i + 1;
    const paint = [];
    for (let j = 0; j <= i; j++) {
      const age = m - 1 - j;
      paint.push({
        id: 't' + j, k: j === 0 ? 'blob' : 'layer',
        x: 0, y: yNear - age * step,
        r: rBase * (1 - (0.52 * age) / n)
      });
    }
    phases.push({
      label: i === 0 ? 'Blob 1 — hold still' : 'Blob ' + m + ' — push the stack forward',
      detail: i === 0
        ? 'Pour in one spot until a round white blob sits in the cup. Do not move the pitcher.'
        : 'Drop in again just behind the last blob. The new milk pushes everything in front of it away from you — that is what makes the petals.',
      ms: blobMs, motion: i === 0 ? 'hold' : 'push',
      path: { from: { x: 0, y: pourY }, to: { x: 0, y: pourY + 0.03 } },
      height: [1.3, 1.2], flow: [0.86, 0.86], tilt: [28 - i * (26 / n), 26 - (i + 1) * (26 / n)],
      paint: paint
    });
    if (i < n - 1) {
      phases.push({
        label: 'Lift — pause',
        detail: 'Raise the pitcher and cut the flow for a beat. The pause is what separates one petal from the next.',
        ms: pauseMs, motion: 'pause',
        path: { from: { x: 0, y: pourY + 0.03 }, to: { x: 0, y: pourY + 0.12 } },
        height: [1.2, 4], flow: [0.86, 0.12], tilt: [26 - (i + 1) * (26 / n), 26 - (i + 1) * (26 / n)]
      });
    }
  }
  return phases;
}

/* ---------- generator: the finishing pull-through ---------- */
function pullThrough(o) {
  o = o || {};
  return {
    label: o.label || 'Lift & pull straight through',
    detail: o.detail || 'Raise to 3–4 cm, thin the stream right down and draw one straight line from the near rim through the middle of the pattern to the far rim. Slow and dead straight.',
    ms: o.ms || 2200, motion: 'drag',
    path: { from: o.from || { x: 0, y: 0.55 }, to: o.to || { x: 0, y: -0.72 } },
    height: [1.3, 4], flow: [0.5, 0.18], tilt: [4, 0],
    paint: o.paint || []
  };
}

const STOP = {
  label: 'Lift away — done',
  detail: 'Cut the flow and lift clear in one move. Do not dribble on the finished art.',
  ms: 1200, motion: 'lift',
  path: { from: { x: 0, y: -0.7 }, to: { x: 0, y: -0.55 } },
  height: [4, 9], flow: [0.16, 0], tilt: [0, 0]
};

const DESIGNS = [];

/* 1 ─ Monk's Head ------------------------------------------------- */
DESIGNS.push({
  id: 'monks-head', name: "Monk's Head", tagline: 'One clean white circle',
  difficulty: 1, family: 'Free pour · foundation',
  about: 'The first pour anyone learns. No wiggle, no drag — just a still pitcher and a cup that comes level at the right moment. If your dot is round and centred, your milk is good.',
  tips: [
    'A wobbly dot is almost always a wobbly pitcher hand, not bad milk.',
    'The cup levelling out is what lets the white spread — level too early and the milk sinks.',
    'Aim slightly nearer to you than centre; the dot drifts away as it grows.'
  ],
  phases: [].concat(opening({}), [
    {
      label: 'Hold dead still — grow the dot',
      detail: 'Spout almost touching the surface, one fixed spot, flow wide open. Watch the white circle open up and stay there.',
      ms: 4500, motion: 'hold',
      path: { from: { x: 0, y: 0.3 }, to: { x: 0, y: 0.26 } },
      height: [1.4, 1], flow: [0.86, 0.9], tilt: [28, 12],
      paint: [{ id: 'd', k: 'blob', x: 0, y: 0.16, r: 0.6 }]
    },
    {
      label: 'Level the cup — let it spread',
      detail: 'Bring the cup level as you keep pouring. The dot swells out to fill the surface.',
      ms: 3000, motion: 'hold',
      path: { from: { x: 0, y: 0.26 }, to: { x: 0, y: 0.14 } },
      height: [1, 1], flow: [0.9, 0.84], tilt: [12, 0],
      paint: [{ id: 'd', k: 'blob', x: 0, y: 0.04, r: 0.76 }]
    },
    {
      label: 'Lift away — done',
      detail: 'Close the flow and lift straight up. Leave it alone.',
      ms: 1400, motion: 'lift',
      path: { from: { x: 0, y: 0.14 }, to: { x: 0, y: 0.05 } },
      height: [1, 8], flow: [0.7, 0], tilt: [0, 0],
      paint: [{ id: 'd', k: 'blob', x: 0, y: 0, r: 0.78 }]
    }
  ])
});

/* 2 ─ Heart ------------------------------------------------------- */
DESIGNS.push({
  id: 'heart', name: 'Heart', tagline: 'Circle, then one straight cut',
  difficulty: 1, family: 'Free pour · foundation',
  about: "A Monk's Head with a line drawn through it. The whole design lives or dies on the last two seconds: lift, thin the stream, and pull one straight line through the middle.",
  tips: [
    'Cut through slightly faster than feels natural — a slow cut makes a fat, blunt heart.',
    'Finish the line past the far rim, not in the middle of the circle.',
    'If the point bends, your pull was not straight — follow the guide line, not the cup.'
  ],
  phases: [].concat(opening({}), [
    {
      label: 'Hold still — grow the circle',
      detail: 'One fixed spot near you, flow open. Let a fat white circle build.',
      ms: 4800, motion: 'hold',
      path: { from: { x: 0, y: 0.32 }, to: { x: 0, y: 0.28 } },
      height: [1.4, 1], flow: [0.86, 0.9], tilt: [28, 12],
      paint: [{ id: 'h', k: 'blob', x: 0, y: 0.14, r: 0.6 }]
    },
    {
      label: 'Level the cup — swell it out',
      detail: 'Cup comes level, circle grows to nearly fill the surface. Do not move sideways.',
      ms: 2400, motion: 'hold',
      path: { from: { x: 0, y: 0.28 }, to: { x: 0, y: 0.2 } },
      height: [1, 1], flow: [0.9, 0.82], tilt: [12, 0],
      paint: [{ id: 'h', k: 'blob', x: 0, y: 0.06, r: 0.8 }]
    },
    {
      label: 'Lift & cut straight through',
      detail: 'Raise to 3–4 cm, thin stream, and draw one straight line from the near rim through the centre and out over the far rim.',
      ms: 2000, motion: 'drag',
      path: { from: { x: 0, y: 0.5 }, to: { x: 0, y: -0.72 } },
      height: [1, 4], flow: [0.5, 0.2], tilt: [0, 0],
      paint: [
        { id: 'h', k: 'heart', x: 0, y: 0.04, r: 0.8 },
        { id: 'stem', k: 'stroke', pts: [[0, 0.5], [0, -0.7]], w: 0.055 }
      ]
    },
    STOP
  ])
});

/* 3 ─ Nested Heart ------------------------------------------------ */
DESIGNS.push({
  id: 'nested-heart', name: 'Nested Heart', tagline: 'Three rings, one cut',
  difficulty: 2, family: 'Free pour · stacked',
  about: 'Three circles poured inside each other with a pause between them, then cut through all three at once. The pauses are the design — pour them without stopping and you get one fat dot.',
  tips: [
    'Each pause is about half a second: lift, flow off, drop back in.',
    'Every new circle goes slightly nearer to you than the last.',
    'One cut takes all three rings into hearts — do not cut between rings.'
  ],
  phases: [].concat(opening({}), [
    {
      label: 'Ring 1 — hold still',
      detail: 'Big outer circle first. Fixed spot, wide flow.',
      ms: 3800, motion: 'hold',
      path: { from: { x: 0, y: 0.3 }, to: { x: 0, y: 0.26 } },
      height: [1.4, 1], flow: [0.86, 0.9], tilt: [28, 14],
      paint: [{ id: 'r1', k: 'blob', x: 0, y: 0.04, r: 0.8 }]
    },
    {
      label: 'Lift — pause',
      detail: 'Flow off for a beat. This is what draws the crema line between the rings.',
      ms: 700, motion: 'pause',
      path: { from: { x: 0, y: 0.26 }, to: { x: 0, y: 0.24 } },
      height: [1, 4], flow: [0.9, 0.1], tilt: [14, 12]
    },
    {
      label: 'Ring 2 — inside the first',
      detail: 'Drop back in at the same spot. The second circle opens up inside the first.',
      ms: 2400, motion: 'hold',
      path: { from: { x: 0, y: 0.24 }, to: { x: 0, y: 0.22 } },
      height: [1.2, 1], flow: [0.84, 0.86], tilt: [12, 8],
      paint: [{ id: 'r2', k: 'blob', x: 0, y: 0.02, r: 0.56, edge: true }]
    },
    {
      label: 'Lift — pause',
      detail: 'Off again, one beat.',
      ms: 600, motion: 'pause',
      path: { from: { x: 0, y: 0.22 }, to: { x: 0, y: 0.2 } },
      height: [1, 4], flow: [0.86, 0.1], tilt: [8, 6]
    },
    {
      label: 'Ring 3 — the small one',
      detail: 'One last short pour for the inner ring. Keep it centred.',
      ms: 1800, motion: 'hold',
      path: { from: { x: 0, y: 0.2 }, to: { x: 0, y: 0.18 } },
      height: [1.2, 1], flow: [0.8, 0.8], tilt: [6, 0],
      paint: [{ id: 'r3', k: 'blob', x: 0, y: 0, r: 0.32, edge: true }]
    },
    {
      label: 'Lift & cut through all three',
      detail: 'Thin the stream and pull one straight line through the middle — every ring turns into a heart at the same time.',
      ms: 2100, motion: 'drag',
      path: { from: { x: 0, y: 0.55 }, to: { x: 0, y: -0.74 } },
      height: [1, 4], flow: [0.48, 0.18], tilt: [0, 0],
      paint: [
        { id: 'r1', k: 'heart', x: 0, y: 0.04, r: 0.8 },
        { id: 'r2', k: 'heart', x: 0, y: 0.02, r: 0.56, edge: true },
        { id: 'r3', k: 'heart', x: 0, y: 0, r: 0.32, edge: true },
        { id: 'stem', k: 'stroke', pts: [[0, 0.55], [0, -0.72]], w: 0.05 }
      ]
    },
    STOP
  ])
});

/* 4 ─ Tulip (3 stack) --------------------------------------------- */
DESIGNS.push({
  id: 'tulip-3', name: 'Tulip', tagline: 'Three blobs, pushed forward',
  difficulty: 2, family: 'Free pour · stacked',
  about: 'The classic three-stack. Pour a blob, pause, pour another one behind it so the first gets pushed away, repeat, then cut through the lot. Rhythm matters more than speed.',
  tips: [
    'Blob – pause – blob – pause – blob – cut. Count it out loud the first few times.',
    'Each blob goes a little nearer to you, never on top of the last one.',
    'If the petals merge, your pauses are too short or your flow is too gentle.'
  ],
  phases: [].concat(
    opening({}),
    tulipStack(3, { blobMs: 2200, pauseMs: 700, r: 0.62 }),
    [
      pullThrough({
        paint: [
          { id: 't0', k: 'heart', x: 0, y: -0.42, r: 0.34 },
          { id: 'stem', k: 'stroke', pts: [[0, 0.55], [0, -0.7]], w: 0.05 }
        ]
      }),
      STOP
    ]
  )
});

/* 5 ─ Six-stack Tulip --------------------------------------------- */
DESIGNS.push({
  id: 'tulip-6', name: 'Six-Stack Tulip', tagline: 'Fast rhythm, tight petals',
  difficulty: 4, family: 'Free pour · stacked',
  about: 'Same move as the three-stack but twice as many petals in the same amount of milk — so every blob is shorter, every pause is snappier, and you have very little room for error.',
  tips: [
    'Short bursts: about a second on, a third of a second off.',
    'Pour less milk into the base so you have enough left for six pushes.',
    'Keep the stack on one straight line — a crooked stack cannot be saved by the cut.'
  ],
  phases: [].concat(
    opening({ setup: 7000, fill: 4000 }),
    tulipStack(6, { blobMs: 1250, pauseMs: 420, r: 0.66 }),
    [
      pullThrough({
        ms: 2000,
        paint: [
          { id: 't0', k: 'heart', x: 0, y: -0.5, r: 0.26 },
          { id: 'stem', k: 'stroke', pts: [[0, 0.58], [0, -0.72]], w: 0.045 }
        ]
      }),
      STOP
    ]
  )
});

/* 6 ─ Rosetta ----------------------------------------------------- */
DESIGNS.push({
  id: 'rosetta', name: 'Rosetta', tagline: 'Zigzag away, drag back through',
  difficulty: 3, family: 'Free pour · wiggle',
  about: 'The one everybody wants. Anchor at the far side, wiggle steadily side to side while you crawl the pitcher back towards yourself, then lift and pull a single line through the stem.',
  tips: [
    'Wiggle from the wrist, not the elbow, and keep the amplitude even — the leaves copy your hand exactly.',
    'Travel backwards slower than you think. Most collapsed rosettas are a pitcher that ran home too fast.',
    'Stop wiggling before you pull through, otherwise the stem is wavy.'
  ],
  phases: [].concat(opening({ dropY: -0.3 }), [
    {
      label: 'Sink in at the far side',
      detail: 'Get the spout right down at the far rim and let a small white pad appear. This is the anchor the leaves hang from.',
      ms: 1600, motion: 'hold',
      path: { from: { x: 0, y: -0.3 }, to: { x: 0, y: -0.44 } },
      height: [1.4, 1], flow: [0.86, 0.9], tilt: [28, 24],
      paint: [{ id: 'anchor', k: 'blob', x: 0, y: -0.46, r: 0.26 }]
    },
    {
      label: 'Start the wiggle — stay put',
      detail: 'Begin a steady side-to-side wiggle without travelling yet. Two or three beats to set the rhythm.',
      ms: 1400, motion: 'wiggle',
      path: { from: { x: 0, y: -0.44 }, to: { x: 0, y: -0.42 } },
      wiggle: { amp: 0.2, hz: 5.5 },
      height: [1, 1], flow: [0.9, 0.9], tilt: [24, 22],
      paint: [{ id: 'ros0', k: 'rosetta', from: { x: 0, y: -0.46 }, to: { x: 0, y: -0.34 }, w: 0.75, leaves: 3 }]
    },
    {
      label: 'Wiggle & crawl back to you',
      detail: 'Keep the same wiggle going and let the pitcher drift slowly towards the near rim. Leaves fan out behind you as you go. Cup comes level on the way.',
      ms: 5600, motion: 'wiggle',
      path: { from: { x: 0, y: -0.42 }, to: { x: 0, y: 0.42 } },
      wiggle: { amp: 0.26, hz: 5.5 },
      height: [1, 1], flow: [0.9, 0.86], tilt: [22, 0],
      paint: [{ id: 'ros', k: 'rosetta', from: { x: 0, y: -0.44 }, to: { x: 0, y: 0.44 }, w: 1.5, leaves: 9 }]
    },
    {
      label: 'Lift & pull the stem through',
      detail: 'Stop wiggling. Lift, thin the stream, and draw one straight line from the near rim all the way through to the far rim.',
      ms: 2100, motion: 'drag',
      path: { from: { x: 0, y: 0.55 }, to: { x: 0, y: -0.74 } },
      height: [1, 4], flow: [0.5, 0.18], tilt: [0, 0],
      paint: [{ id: 'stem', k: 'stroke', pts: [[0, 0.55], [0, -0.72]], w: 0.05 }]
    },
    STOP
  ])
});

/* 7 ─ Inverted Rosetta -------------------------------------------- */
DESIGNS.push({
  id: 'inverted-rosetta', name: 'Inverted Rosetta', tagline: 'Wiggle away, cut back',
  difficulty: 4, family: 'Free pour · wiggle',
  about: 'A rosetta poured backwards. You start near yourself and push the wiggle away, so the leaves point at you, then cut back through from the far rim. Harder because you are pouring into your own pattern.',
  tips: [
    'Push away slowly and keep the pitcher low — pushing forward drowns leaves fast.',
    'The cut comes back towards you: far rim to near rim, one straight line.',
    'Slightly wetter milk helps; this design needs the pattern to stay put.'
  ],
  phases: [].concat(opening({ dropY: 0.36 }), [
    {
      label: 'Anchor near you',
      detail: 'Sink the spout in close to the near rim and let a small pad of white form.',
      ms: 1600, motion: 'hold',
      path: { from: { x: 0, y: 0.36 }, to: { x: 0, y: 0.4 } },
      height: [1.4, 1], flow: [0.86, 0.9], tilt: [28, 22],
      paint: [{ id: 'anchor', k: 'blob', x: 0, y: 0.42, r: 0.26 }]
    },
    {
      label: 'Wiggle & push away from you',
      detail: 'Steady side-to-side wiggle while the pitcher creeps towards the far rim. The leaves stack up pointing back at you.',
      ms: 5600, motion: 'wiggle',
      path: { from: { x: 0, y: 0.4 }, to: { x: 0, y: -0.36 } },
      wiggle: { amp: 0.26, hz: 5.5 },
      height: [1, 1], flow: [0.9, 0.86], tilt: [22, 0],
      paint: [{ id: 'ros', k: 'rosetta', from: { x: 0, y: 0.44 }, to: { x: 0, y: -0.4 }, w: 1.5, leaves: 9 }]
    },
    {
      label: 'Lift & cut back towards you',
      detail: 'Stop the wiggle, lift, thin out, and draw the stem from the far rim straight back to the near rim.',
      ms: 2100, motion: 'drag',
      path: { from: { x: 0, y: -0.6 }, to: { x: 0, y: 0.7 } },
      height: [1, 4], flow: [0.5, 0.18], tilt: [0, 0],
      paint: [{ id: 'stem', k: 'stroke', pts: [[0, -0.6], [0, 0.68]], w: 0.05 }]
    },
    STOP
  ])
});

/* 8 ─ Wave Heart -------------------------------------------------- */
DESIGNS.push({
  id: 'wave-heart', name: 'Wave Heart', tagline: 'Wiggle on the spot, then cut',
  difficulty: 3, family: 'Free pour · wiggle',
  about: 'A heart with ribs. You wiggle without travelling, so each pass of the pitcher lays a ridge in front of the last one, then a single cut turns the whole stack into a rippled heart.',
  tips: [
    'Do not travel. The pattern moves forward on its own as milk piles in.',
    'Bigger, slower wiggles give fewer, fatter ribs; small and fast gives a tight ripple.',
    'Come level early — you need surface area for the ripples to spread onto.'
  ],
  phases: [].concat(opening({}), [
    {
      label: 'Sink in near you',
      detail: 'Spout right down at the near side, flow open, and let a white pad appear before you move anything.',
      ms: 1600, motion: 'hold',
      path: { from: { x: 0, y: 0.3 }, to: { x: 0, y: 0.34 } },
      height: [1.4, 1], flow: [0.86, 0.9], tilt: [28, 20],
      paint: [{ id: 'w0', k: 'blob', x: 0, y: 0.2, r: 0.34 }]
    },
    {
      label: 'Wiggle on the spot',
      detail: 'Side to side, same spot, steady beat. Each pass pushes a ridge of white away from you.',
      ms: 4200, motion: 'wiggle',
      path: { from: { x: 0, y: 0.34 }, to: { x: 0, y: 0.3 } },
      wiggle: { amp: 0.22, hz: 6.5 },
      height: [1, 1], flow: [0.9, 0.9], tilt: [20, 6],
      paint: [{ id: 'wv', k: 'rosetta', from: { x: 0, y: -0.34 }, to: { x: 0, y: 0.26 }, w: 1.35, leaves: 6 }]
    },
    {
      label: 'Level & widen the wiggle',
      detail: 'Cup level, wiggle a touch wider so the last ribs reach the rim.',
      ms: 2000, motion: 'wiggle',
      path: { from: { x: 0, y: 0.3 }, to: { x: 0, y: 0.32 } },
      wiggle: { amp: 0.3, hz: 6 },
      height: [1, 1], flow: [0.9, 0.86], tilt: [6, 0],
      paint: [{ id: 'wv2', k: 'rosetta', from: { x: 0, y: 0.1 }, to: { x: 0, y: 0.4 }, w: 1.3, leaves: 3 }]
    },
    {
      label: 'Lift & cut through',
      detail: 'Stop wiggling, lift, thin out, one straight line from the near rim out over the far side.',
      ms: 2000, motion: 'drag',
      path: { from: { x: 0, y: 0.6 }, to: { x: 0, y: -0.74 } },
      height: [1, 4], flow: [0.5, 0.18], tilt: [0, 0],
      paint: [
        { id: 'wvh', k: 'heart', x: 0, y: 0, r: 0.92, z: -1 },
        { id: 'stem', k: 'stroke', pts: [[0, 0.6], [0, -0.72]], w: 0.05 }
      ]
    },
    STOP
  ])
});

/* 9 ─ Winged Tulip ------------------------------------------------ */
DESIGNS.push({
  id: 'winged-tulip', name: 'Winged Tulip', tagline: 'Rosetta first, then stack on top',
  difficulty: 5, family: 'Combination',
  about: 'A rosetta poured only halfway, then two tulip blobs pushed into the back of it. You are running two techniques on one cup of milk, so budget the pour: short base, short wiggle, quick stack.',
  tips: [
    'Wiggle for about half the cup, then stop while you still have milk left.',
    'Each blob after the wiggle goes right up against the last leaf, not on top of it.',
    'One cut at the end goes through the blobs and the rosetta together.'
  ],
  phases: [].concat(opening({ setup: 7000, fill: 4000, dropY: -0.3 }), [
    {
      label: 'Anchor at the far side',
      detail: 'Sink in at the far rim and let a small pad form.',
      ms: 1400, motion: 'hold',
      path: { from: { x: 0, y: -0.3 }, to: { x: 0, y: -0.44 } },
      height: [1.4, 1], flow: [0.86, 0.9], tilt: [28, 24],
      paint: [{ id: 'anchor', k: 'blob', x: 0, y: -0.46, r: 0.24 }]
    },
    {
      label: 'Wiggle back — half the cup only',
      detail: 'Steady wiggle drifting towards you, but stop level with the middle. Leave the near half of the cup empty for the stack.',
      ms: 3800, motion: 'wiggle',
      path: { from: { x: 0, y: -0.44 }, to: { x: 0, y: 0.02 } },
      wiggle: { amp: 0.26, hz: 5.5 },
      height: [1, 1], flow: [0.9, 0.88], tilt: [24, 8],
      paint: [{ id: 'ros', k: 'rosetta', from: { x: 0, y: -0.46 }, to: { x: 0, y: 0.04 }, w: 1.35, leaves: 7 }]
    },
    {
      label: 'Lift — pause',
      detail: 'Off for a beat. Reset the hand for the stack.',
      ms: 550, motion: 'pause',
      path: { from: { x: 0, y: 0.02 }, to: { x: 0, y: 0.2 } },
      height: [1, 4], flow: [0.88, 0.1], tilt: [8, 6]
    },
    {
      label: 'Blob 1 — push into the rosetta',
      detail: 'Drop in behind the last leaf. The blob pushes the rosetta forward and gives the tulip its first petal.',
      ms: 1800, motion: 'push',
      path: { from: { x: 0, y: 0.24 }, to: { x: 0, y: 0.26 } },
      height: [1.2, 1], flow: [0.86, 0.86], tilt: [6, 3],
      paint: [{ id: 'p1', k: 'layer', x: 0, y: 0.18, r: 0.6 }]
    },
    {
      label: 'Lift — pause',
      detail: 'Off again, one beat.',
      ms: 500, motion: 'pause',
      path: { from: { x: 0, y: 0.26 }, to: { x: 0, y: 0.38 } },
      height: [1, 4], flow: [0.86, 0.1], tilt: [3, 2]
    },
    {
      label: 'Blob 2 — the last petal',
      detail: 'One more short push right at the near rim, then stop.',
      ms: 1500, motion: 'push',
      path: { from: { x: 0, y: 0.4 }, to: { x: 0, y: 0.42 } },
      height: [1.2, 1], flow: [0.84, 0.84], tilt: [2, 0],
      paint: [
        { id: 'p1', k: 'layer', x: 0, y: 0.1, r: 0.52 },
        { id: 'p2', k: 'layer', x: 0, y: 0.36, r: 0.64 }
      ]
    },
    pullThrough({
      ms: 2000,
      detail: 'Thin stream, one straight line from the near rim, through both blobs, through the rosetta, out over the far side.',
      from: { x: 0, y: 0.62 }, to: { x: 0, y: -0.74 },
      paint: [{ id: 'stem', k: 'stroke', pts: [[0, 0.62], [0, -0.72]], w: 0.05 }]
    }),
    STOP
  ])
});

/* 10 ─ Swan ------------------------------------------------------- */
DESIGNS.push({
  id: 'swan', name: 'Swan', tagline: 'Curved wing, body, then the neck',
  difficulty: 5, family: 'Combination · advanced',
  about: 'A rosetta bent into a curve for the wing, a blob for the body, and then a thin high stream drawn as an S for the neck and head. The neck is a completely different pour from everything before it — high pitcher, almost closed.',
  tips: [
    'Curve the wiggle by moving your whole forearm along an arc; the wrist keeps its rhythm.',
    'Save milk. The neck needs a thin, controlled stream and it comes last.',
    'Draw the neck high and slow, and finish the head with a tiny flick.'
  ],
  phases: [].concat(opening({ setup: 7000, fill: 4500, dropY: -0.24 }), [
    {
      label: 'Anchor the wing (far left)',
      detail: 'Sink in towards the far left of the cup — the wing starts out here, not in the middle.',
      ms: 1500, motion: 'hold',
      path: { from: { x: 0, y: -0.24 }, to: { x: -0.5, y: -0.3 } },
      height: [1.4, 1], flow: [0.86, 0.9], tilt: [28, 24],
      paint: [{ id: 'anchor', k: 'blob', x: -0.5, y: -0.32, r: 0.22 }]
    },
    {
      label: 'Wiggle along a curve — the wing',
      detail: 'Wiggle steadily while sweeping the pitcher along a curve: out to the left, then round towards you and back to the middle. Leaves fan into a wing.',
      ms: 4600, motion: 'wiggle',
      path: { from: { x: -0.5, y: -0.3 }, to: { x: 0.02, y: 0.34 }, ctrl: { x: -0.66, y: 0.26 } },
      wiggle: { amp: 0.17, hz: 6.5 },
      height: [1, 1], flow: [0.9, 0.88], tilt: [24, 4],
      paint: [{ id: 'wing', k: 'rosetta', from: { x: -0.52, y: -0.3 }, to: { x: 0.0, y: 0.34 }, ctrl: { x: -0.72, y: 0.24 }, w: 1.0, leaves: 12 }]
    },
    {
      label: 'Body — hold still',
      detail: 'Stop the wiggle and hold in one spot near you to fill in the body.',
      ms: 1800, motion: 'hold',
      path: { from: { x: 0.02, y: 0.34 }, to: { x: 0.06, y: 0.4 } },
      height: [1, 1], flow: [0.88, 0.86], tilt: [4, 0],
      paint: [{ id: 'body', k: 'blob', x: 0.06, y: 0.3, r: 0.4 }]
    },
    {
      label: 'Cut through the wing',
      detail: 'Thin the stream and pull one line from the body back out along the wing to close it up.',
      ms: 1600, motion: 'drag',
      path: { from: { x: 0.1, y: 0.5 }, to: { x: -0.56, y: -0.42 } },
      height: [1, 3.5], flow: [0.45, 0.2], tilt: [0, 0],
      paint: [{ id: 'wcut', k: 'stroke', pts: [[0.1, 0.5], [-0.54, -0.4]], w: 0.045 }]
    },
    {
      label: 'Neck — high, thin, slow S',
      detail: 'Lift to 4–5 cm and almost close the flow. Draw the neck: up out of the body, curving right and back towards the far rim.',
      ms: 2600, motion: 'curve',
      path: { from: { x: 0.12, y: 0.3 }, to: { x: 0.46, y: -0.44 }, ctrl: { x: 0.66, y: 0.12 } },
      height: [4, 4], flow: [0.14, 0.12], tilt: [0, 0],
      paint: [{ id: 'neck', k: 'stroke', pts: [[0.12, 0.3], [0.66, 0.12], [0.46, -0.44]], w: 0.035, curve: true }]
    },
    {
      label: 'Head & beak',
      detail: 'Tiny dot at the top of the neck, then a quick flick out to the left for the beak.',
      ms: 1100, motion: 'hold',
      path: { from: { x: 0.46, y: -0.44 }, to: { x: 0.3, y: -0.52 } },
      height: [4, 3], flow: [0.2, 0.1], tilt: [0, 0],
      paint: [
        { id: 'head', k: 'blob', x: 0.45, y: -0.46, r: 0.09 },
        { id: 'beak', k: 'stroke', pts: [[0.42, -0.5], [0.26, -0.56]], w: 0.03 }
      ]
    },
    STOP
  ])
});

/* ---------- derived data ---------- */
DESIGNS.forEach(function (d) {
  let t = 0;
  d.phases.forEach(function (p, i) {
    p.index = i; p.start = t; t += p.ms; p.end = t;
  });
  d.totalMs = t;
});

if (typeof window !== 'undefined') window.DESIGNS = DESIGNS;
