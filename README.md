# Latte Motion

A no-install, works-offline PWA that shows **the pitcher motion for latte art laid out linearly over time**.
Start the timer, hold your pitcher over the phone, and follow the moving target: when to hold a
straight line, when to zigzag, when to pause, and when to lift and pull through.

Current version: **v1.1.0**

## What it does

* **10 classic designs**, each broken into timed steps — Monk's Head, Heart, Nested Heart, Tulip,
  Six-Stack Tulip, Rosetta, Inverted Rosetta, Wave Heart, Winged Tulip and Swan.
* **A guided pour.** Countdown, then a live target moving across a top-down view of the cup at the
  real speed of the pour. The trail behind the target shows the motion you should be making —
  dead straight for a hold, a saw-tooth for a wiggle.
* **Every variable, live.** Pitcher height in centimetres, flow rate, cup tilt, and a wiggle-tempo
  metronome, all changing second by second the way they do in a real pour.
* **A linear motion map.** A timeline of the whole pour: bright line = side-to-side position,
  dim line = how far the pitcher is from you, coloured bands = the type of move. Flat means hold,
  saw-tooth means zigzag. Scrub it during a pour to replay any moment.
* **The pattern forms as you go**, so you can see whether what is in your cup matches where the
  guide thinks you are.
* **Practice speeds** (0.6× to 1.25×), optional sound cues, spoken step names, and vibration on
  every step change. The screen stays awake while you pour.

## Using it

1. Steam your milk first — none of the timings help if the milk is not right.
2. Pick a design, read the steps, hit **Start guided pour**.
3. Put the phone flat on the bench, cup in your other hand, pitcher over the screen.
4. Follow the target: the ring shows where the spout should be, its size shows the flow, and the
   left gauge shows how high to hold the pitcher.

Timings assume a 5–6 oz cup with a double shot and about 150 ml of textured milk.
The designs are guides, not physics: the pattern preview is a stylised target, not a simulation.

## Running it

Any static file server works — there is no build step.

```bash
python3 -m http.server 8080     # then open http://localhost:8080
```

Service workers need `https://` or `localhost`.

## Project layout

```
index.html                 app shell / all screens
css/styles.css             styling
js/version.js              single source of truth for the version
js/designs.js              the 10 designs: phases, timings, motion, paint ops
js/pattern.js              draws the cup and the milk pattern
js/engine.js               samples position/height/flow/tilt at any time; draws guide + timeline
js/audio.js                sound and speech cues
js/app.js                  routing, the pour loop, settings, update handling
sw.js                      offline cache + versioned updates
tools/make-icons.mjs       regenerates the PNG icons (no dependencies)
tools/bump-version.mjs     bumps the version everywhere at once
```

## Adding a design

Add an entry to `DESIGNS` in `js/designs.js`. A design is a list of phases; each phase says how long
it lasts, where the spout goes (`path`, in cup coordinates where `y = -1` is the far rim and
`y = +1` is the rim nearest you), how high and how fast to pour, whether to wiggle, and what the
milk does (`paint`). Paint ops sharing an `id` across phases animate the same layer — that is how a
blob gets pushed forward, or a circle is pulled into a heart.

## Releasing an update

```bash
node tools/bump-version.mjs minor    # or patch / major / an explicit 1.2.3
```

That rewrites `js/version.js`, `sw.js`, `manifest.webmanifest` and this file. The service worker
caches under the new version name, drops the old cache, and the app shows a **Reload** prompt to
anyone with the old build open. Always bump the version when you change app files — otherwise
installed copies keep serving the cached build.

## Hosting on GitHub Pages

`.github/workflows/pages.yml` publishes `main` on every push.

One manual step is needed the first time: **Settings → Pages → Build and deployment → Source:
GitHub Actions**. The workflow asks `configure-pages` to enable Pages itself, but creating a Pages
site needs admin rights that the workflow token does not have, so the first run fails with
`Create Pages site failed: Resource not accessible by integration` until the switch is flipped by
hand. After that, re-run the workflow (Actions → Deploy to GitHub Pages → Run workflow) and the
site goes live at `https://<user>.github.io/Latteart/`.

The app uses relative paths throughout, so it works from a project subpath without changes.
