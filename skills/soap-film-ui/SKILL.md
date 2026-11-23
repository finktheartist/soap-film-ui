---
name: soap-film-ui
description: Build, change or wire in a UI control made of soap film (real thin-film interference colour, a fluid simulation stirred by the pointer, bubbles that swell, coalesce, bud and pop), using the Soap Film UI core. Use when asked to add one of the soap-* components to an app, to change how one reacts, or to make a new control in the same style. Covers the core, the colour function and fluid grid every control is built on, the rules the set follows, and the frame-by-frame look that has to happen before calling it done.
---

# Soap Film UI

A Soap Film control is an ordinary control (a slider, a button, a menu) whose moving part is soap: a pane of film in a frame, or a bubble. The colour is real thin-film interference, computed from how thick the film is at each point; the thickness is a small fluid simulation that the pointer stirs. Under the drawing is a real control, so it still works with a keyboard, a screen reader and a form.

This skill is the workflow the set was made by. It comes with three things:

- `core.js`: the shared core. One clock for every control on the page, the synthesized sound (`SoapAudio`), and `Base`, a custom-element base class that builds a WebGL engine at the element's width and rebuilds it when the width changes.
- `starter.html`: the smallest whole example, a bubble button on a wire ring with its own shader and a 32 by 32 thickness grid. Copy it to start a new one.
- `look.mjs`: stops the clock, steps an interaction to chosen moments and saves the frames side by side, so you can read them.

If the job is only to put an existing component into an app, skip to **Wire it in** and **Check it**.

## 1. Decide three things first

1. **The control.** It must still be that control with the film taken away: a real `<button>`, `<input type="range">` or radio group inside, with keys and focus.
2. **The soap phenomenon that is the control's job.** Pick a real behaviour of soap that already does what the control does, so the physics explains the control: a menu where the size of the chosen bubble flows to the next one (mass transfer), a notification stack as a foam whose walls meet at 120 degrees (Plateau's laws), a hold-to-confirm that blows a bubble until it bursts, a refresh whose gap fills with a film the shape of the opening. If it needs explaining, pick again.
3. **Its frame.** Soap needs something to hold it: a track, a ring, a pill, a card edge. The frame is a hairline, not a casing.

## 2. The core and the engine

Load `core.js` and everything is on `window.SoapFilm`:

- **`SoapFilm.Base`.** Extend it and give it `static size = (w) => height`, `create(mount, { width, height, dpr, audio })` that returns your engine, `overlay()` (the real control's HTML, with `class="sr"` so it is invisible but focusable) and `wire()` (listeners). Optional: `static touch` (the touch-action, `none` by default), `static css`, `beforeStep(dt)`, `save()` and `restore(state)` to carry a value across a rebuild, and `focusTarget()`. `this.local(event)` gives the pointer in the engine's CSS pixels; `this.emit(type, detail)` fires a bubbling, composed event; `this.audio` is the sound, which stays quiet when the element is `muted` or `SoapFilm.sound` is false.
- **The engine** is a plain class with `wrap` (its root element), `gl` (its WebGL2 context), `step(dt)` and `render()`. The core calls both once a frame while the element is on screen.
- **The clock.** `SoapFilm.clock.manual = true` stops it; `SoapFilm.clock.advance(1 / 60)` steps every control by hand; `SoapFilm.clock.resume()` starts it again.
- **The sound.** `SoapAudio` is synthesized Web Audio: `playPop`, `playTap`, `playFizz`, `playPinchOff`, `playRefilm`, `playTagMerge`, `playDialTick` and more, plus two continuous voices, `updateGlide(speed)` and `updateTension(depth)`, which you set every frame and set to 0 when nothing is moving.

### The colour

Every control uses the same idea (see `film()` in `starter.html`): reflectance at six wavelengths through a layer of soap (n = 1.333) `dNm` nanometres thick, seen at angle `cosTheta`, mixed to RGB and pushed a little more saturated. Thickness between about 150 and 700 nm gives the bright bands; under about 30 nm the film goes black, just before it bursts. Light it with a Fresnel rim and one hard highlight, and keep the middle of a flat pane nearly clear.

### The fluid

A grid of 32 to 80 cells a side holds thickness, and in the full controls velocity, pressure and curl too: advect, add forces from the pointer (a shear along the drag, a vortex where it turns, a jet where it blows), project, diffuse a little, and let gravity drain the top thinner. Upload thickness as a texture every frame and sample it in the shader. It runs on the CPU and costs well under a millisecond at 64 by 64.

## 3. The rules

These are the corrections that came up while the set was built.

- **Stylized forms, realistic effects.** Puffed, volumetric bubbles with a bold coloured rim and one crisp highlight, exaggerated enough to read at a glance. A physically exact flat film is nearly invisible.
- **Effects arrive when the motion stops,** not all the time. The slider's edge bubbles bloom when you let go and are gulped back the moment it moves. At rest before anyone touches it, the film is whole.
- **Small things round big things.** Where bubbles gather, put smaller foam cells and tiny bubbles round them.
- **Frameless.** The frame is a hairline of glass or wire. A heavy case makes it look like a product render.
- **The film is the shape of its frame from the first pixel.** A gap that opens fills with a flat film exactly its shape, not a bubble that later grows to fit.
- **Fill the frame before it pops.** A bubble that is going to burst swells to the edges of what holds it first.
- **Keep the soap.** When one bubble grows another shrinks: area in 2D, volume for 3D buds. The eye notices when soap comes from nowhere.
- **Pops tear, they do not fade.** A hole opens from one point and races outward with a bright beaded rim (a Culick rupture), droplets fly and fall, a few small bubbles float off.
- **Pure white page.** Shadows, hairlines and the clear middle of each pane are tuned for `#FFFFFF`.
- **Clamp every `pow()` base** with `max(1e-4, x)` in GLSL. A negative or zero base is undefined, and strict drivers and SwiftShader draw a blank control instead of an error.
- **The real control is underneath.** Pointer input goes to the canvas through your hit-tests; the keyboard and screen readers get the native element in the shadow root.

## 4. Look before you say it is done

A control that runs without errors has told you nothing about how it moves.

1. Serve the folder and run `look.mjs` with a script of actions and the moments to photograph:

   ```sh
   node look.mjs http://localhost:8000/starter.html soap-bubble-button sheet.png "0.3:e.setHolding(true); 0.8:e.setHolding(false)" "0.6,0.85,0.95,1.1,2,3"
   ```

   `el` is the element and `e` its engine. It needs `playwright-core` and Chromium.
2. Read each frame: does the effect arrive when it should, is the pop a tear, is anything clipped by the canvas edge.
3. Fix what you see and look again. Expect several rounds.

Headless Chromium on software WebGL (SwiftShader) is slow and can lose its context part-way through a long run; use a GPU (`--ignore-gpu-blocklist --enable-gpu`) where there is one, and check `gl.isContextLost()` at the end.

## 5. Wire it in

- **One file per component.** Each carries a copy of the core and its engine; the first one loaded sets `window.SoapFilm` and the rest reuse it. In the repo, edit `core.js` or `src/` and run `node tools/build.mjs`.
- **Load it with a plain script tag,** not as a module, and do not split or rewrite it.
- **Attributes for state, events for what happened:** `input` and `change` for value controls (which also work in forms), `confirm`, `refresh`, `action`, `dismiss`, as each README says.
- **Put it on white,** give it the width it should fill, up to 640 pixels; it sets its own height.
- **Do not edit the shader or the simulation to restyle someone else's component.** Say what needs to look different.

## 6. Check it

Use it the way a person would, in a real browser, and report each separately.

- **Pointer and touch:** real presses and drags sent through the DevTools protocol, not calls into the code. `tools/test.mjs` in the repo does this for every component.
- **Keyboard:** Tab to it, then the keys that should work it.
- **Two widths:** a desktop width and 390 pixels, with no sideways scroll.
- **Forms:** if it has a value, `new FormData(form)` should contain it.
- **WebGL:** every context still alive at the end.

## 7. Say what is true

- **What it does now.**
- **What you checked, and how.** "Stepped frame by frame with look.mjs" is not "watched it at real speed". Say which.
- **What is still weak.**
