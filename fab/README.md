# Action button

A floating action button that is one plump soap bubble with a plus on it. Tap it and it divides like a cell: four smaller bubbles bud out of it in turn, each stretching a neck of soap before it pinches off and springs into orbit, while the centre shrinks, because the soap in the four came out of it. The plus turns into a cross. Tap an action and that bubble pops in a mist, with a small confirmation under it. Tap the cross and the rest rush back in and fuse into one bubble again.

One of eight controls in this repo. Same idea in each (an ordinary control made of soap film, with real thin-film colour and a fluid simulation running on it), different control.

## Run it

```sh
python3 -m http.server 8000     # from the repo folder
# open http://localhost:8000/fab/
```

`?embed=1` hides the heading and the hint.

## Use it

`fab.js` is the whole component: one file of about 89 KB with its shaders and simulation inside it, and no dependencies.

```html
<script src="fab.js"></script>
<soap-fab label="Create">
  <option value="camera">Camera</option>
  <option value="note" data-done="New note">Note</option>
  <option value="mic">Mic</option>
  <option value="link" data-done="Link copied">Link</option>
</soap-fab>
```

```js
const el = document.querySelector('soap-fab');
el.addEventListener('action', (e) => run(e.detail.value));
el.addEventListener('toggle', (e) => console.log(e.detail.open));
el.open = true;       // bud from code
```

| attribute | what it sets | default |
|---|---|---|
| `label` | the centre button's accessible name | Actions |
| `muted` | no sound from this one | off |

- **Four actions, four icons:** camera, note, mic and link. An option whose `value` is one of those gets that icon; otherwise set `data-icon`, or it takes them in order.
- **`data-done`** is the word that shows under an action when it pops. It defaults to the label.
- **Real buttons** sit in the shadow root: the centre one with `aria-expanded`, and one per action once it is open. Escape fuses them back.
- **Sound.** It makes soft synthesized foley (no audio files) once the page has had a tap or a key. `muted` silences this one; `SoapFilm.sound = false` silences the page.

## What happens

| you | it |
|---|---|
| tap the centre | it squashes, then four buds stretch out on necks one after another and pinch off with a pop each, while the centre shrinks and its plus turns to a cross |
| tap an action | that bud charges up and pops in a mist, with its word under it; action fires |
| tap the cross | the buds rush back, touch, and fuse into the centre with a warm swell |
| all the time | the buds bob gently in orbit |

## Limits

- **Laid out round a centre near the bottom of its box,** with the buds above. It is a drawing of its own, not pinned to the corner of the page; place it there with CSS.
- **Needs WebGL2.** Without it the element shows a short note in place of the control. Each one on the page holds its own WebGL context; browsers allow about sixteen at once, so keep it to a dozen or so per page.
- **Drawn for a white page.** The film is drawn over pure white (`#FFFFFF`) and its shadows and hairlines assume it. On a dark or coloured background it looks wrong.
- **Draws at a fixed size and redraws on resize.** It fills the width it is given, up to 640 pixels, with a height that follows. When the width changes the simulation starts again at the new size, keeping the value but not the motion.
- **Not still for reduced motion.** The film is a simulation that is always moving a little; `prefers-reduced-motion` is not honoured yet.
- **Checked in headless Chromium** with real touch and key events. Not tried in Safari or Firefox, on a real phone, or with a screen reader.
