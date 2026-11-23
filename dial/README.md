# Rotary dial

A rotary knob that is a disc of soap film in a ring, with the value written in the middle and the label under it. Grab the bead on the rim and turn. The film is a fluid simulation spun by your hand, so it twists into a spiral vortex that winds tighter the faster you turn and keeps turning a little after you stop. Each step ticks. At either end it bounces off a soft stop and the whole disc wobbles.

One of eight controls in this repo. Same idea in each (an ordinary control made of soap film, with real thin-film colour and a fluid simulation running on it), different control.

## Run it

```sh
python3 -m http.server 8000     # from the repo folder
# open http://localhost:8000/dial/
```

`?embed=1` hides the heading and the hint.

## Use it

`dial.js` is the whole component: one file of about 63 KB with its shaders and simulation inside it, and no dependencies.

```html
<script src="dial.js"></script>
<soap-dial value="28" label="Volume"></soap-dial>
```

```js
const el = document.querySelector('soap-dial');
el.addEventListener('input', () => setVolume(el.value));
el.addEventListener('change', () => save(el.value));
el.value = 75;        // it turns there
```

| attribute | what it sets | default |
|---|---|---|
| `value` | where it starts | 28% of the way |
| `min`, `max`, `step` | like a range input's | 0, 100, 1 |
| `label` | written under the number, and what a screen reader calls it | Volume |
| `name` | sent with its form |  |
| `disabled` | ignores the pointer and the keys | off |
| `muted` | no sound from this one | off |

- **Turn it by the rim.** Press on the knob and go round; the scroll wheel turns it a step at a time.
- **A real `<input type="range">`** lies under the drawing for the keyboard and the screen reader: arrow keys, Home and End.
- **Sound.** It makes soft synthesized foley (no audio files) once the page has had a tap or a key. `muted` silences this one; `SoapFilm.sound = false` silences the page.

## What happens

| you | it |
|---|---|
| grab | the bead on the rim lifts and the film tightens |
| turn | the film spins into a spiral vortex that follows the speed of your hand; it ticks at every 4% |
| let go | the spin runs on and slows; the vortex unwinds into drifting bands |
| hit an end | a rubbery bounce, a ring wave across the disc, and the spin reverses a little |

## Limits

- **The touch takes the whole drawing,** so a finger on it does not scroll the page. Leave room round it on a phone.
- **The label is drawn in capitals** in the system font; keep it to one short word.
- **Needs WebGL2.** Without it the element shows a short note in place of the control. Each one on the page holds its own WebGL context; browsers allow about sixteen at once, so keep it to a dozen or so per page.
- **Drawn for a white page.** The film is drawn over pure white (`#FFFFFF`) and its shadows and hairlines assume it. On a dark or coloured background it looks wrong.
- **Draws at a fixed size and redraws on resize.** It fills the width it is given, up to 640 pixels, with a height that follows. When the width changes the simulation starts again at the new size, keeping the value but not the motion.
- **Not still for reduced motion.** The film is a simulation that is always moving a little; `prefers-reduced-motion` is not honoured yet.
- **Checked in headless Chromium** with real touch and key events. Not tried in Safari or Firefox, on a real phone, or with a screen reader.
