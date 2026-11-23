# Hold to send

A press-and-hold button for things you should not do by accident, such as sending or approving. A soap film is stretched across the pill, already wobbling. Press and hold and you blow it up: the film bulges above the button and grows into a bubble while the label counts the percentage. Hold to the end and the bubble pops in a spray of droplets and the label changes to Sent. Let go early and the bubble sinks back into the film.

One of eight controls in this repo. Same idea in each (an ordinary control made of soap film, with real thin-film colour and a fluid simulation running on it), different control.

## Run it

```sh
python3 -m http.server 8000     # from the repo folder
# open http://localhost:8000/hold-button/
```

`?embed=1` hides the heading and the hint.

## Use it

`hold-button.js` is the whole component: one file of about 88 KB with its shaders and simulation inside it, and no dependencies.

```html
<script src="hold-button.js"></script>
<soap-hold-button label="Hold to send" done-label="Sent"></soap-hold-button>
```

```js
const el = document.querySelector('soap-hold-button');
el.addEventListener('confirm', () => send());
el.reset();           // back to the start, ready to hold again
el.sent;              // true once it has popped
```

| attribute | what it sets | default |
|---|---|---|
| `label` | the label while it is waiting, and its accessible name | Hold to send (or the text inside) |
| `done-label` | the label after it pops | Sent |
| `duration` | seconds of holding to confirm | 1.85 |
| `type` | `submit` submits its form when confirmed | button |
| `disabled` | like a button's | off |
| `muted` | no sound from this one | off |

- **It is a real `<button>`** in the shadow root, so it takes focus. Space and Enter hold it while they are down.
- **Only the pill takes the press.** The space above it is where the bubble grows, and a press there does nothing.
- **After it pops it stays Sent** until the next press, which starts it over, or until `el.reset()`.
- **Sound.** It makes soft synthesized foley (no audio files) once the page has had a tap or a key. `muted` silences this one; `SoapFilm.sound = false` silences the page.

## What happens

| you | it |
|---|---|
| press and hold | the film bows up off the pill and inflates into a bubble that grows over the button; it hums with tension; the label shows the percentage |
| let go early | the bubble sinks back into the film with a wobble |
| hold to the end | the bubble pops: a ring tears open across it, droplets spray out and fall, small bubbles float away; confirm fires |
| after | a tick and the done label sit in the pill |

## Limits

- **The labels are drawn in the canvas,** in the system font. Keep them short; about twenty characters fit at full width.
- **Needs WebGL2.** Without it the element shows a short note in place of the control. Each one on the page holds its own WebGL context; browsers allow about sixteen at once, so keep it to a dozen or so per page.
- **Drawn for a white page.** The film is drawn over pure white (`#FFFFFF`) and its shadows and hairlines assume it. On a dark or coloured background it looks wrong.
- **Draws at a fixed size and redraws on resize.** It fills the width it is given, up to 640 pixels, with a height that follows. When the width changes the simulation starts again at the new size, keeping the value but not the motion.
- **Not still for reduced motion.** The film is a simulation that is always moving a little; `prefers-reduced-motion` is not honoured yet.
- **Checked in headless Chromium** with real touch and key events. Not tried in Safari or Firefox, on a real phone, or with a screen reader.
