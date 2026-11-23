# Pull to refresh

A card with a short list in it, like an inbox, which you pull down to refresh. As the list comes down a gap opens under the header, and the gap fills with a sheet of soap film exactly the shape of the opening, stretched flush from wall to wall. Pull far enough and let go and it locks open: the film swells and its colours swirl in two vortices while the page loads. When the page is done it pops across the whole rectangle, the gap closes, and the new rows slide in at the top.

One of eight controls in this repo. Same idea in each (an ordinary control made of soap film, with real thin-film colour and a fluid simulation running on it), different control.

## Run it

```sh
python3 -m http.server 8000     # from the repo folder
# open http://localhost:8000/pull-refresh/
```

`?embed=1` hides the heading and the hint.

## Use it

`pull-refresh.js` is the whole component: one file of about 92 KB with its shaders and simulation inside it, and no dependencies.

```html
<script src="pull-refresh.js"></script>
<soap-pull-refresh></soap-pull-refresh>
```

```js
const el = document.querySelector('soap-pull-refresh');
el.items = [{ initials: 'JR', name: 'Jo Reyes', preview: 'Sent the specs', time: '2m' }];
el.addEventListener('refresh', (e) => {
  // the film stays open until this settles; resolve with the new rows, newest first
  e.detail.waitUntil(fetch('/api/new').then((r) => r.json()));
});
el.refresh();         // the same as a pull, from code
```

| attribute | what it sets | default |
|---|---|---|
| `duration` | the shortest time the film stays open, in seconds | 1.35 |
| `muted` | no sound from this one | off |

- **The list is drawn in the canvas,** not your own HTML. Each row is a set of initials in a circle, a name, a line of preview and a time. Up to five rows show; a sixth pushes the last off.
- **Waiting:** if nothing calls `waitUntil`, the film pops after `duration` and no rows are added. While a promise is pending the film holds at nearly full.
- **A real `<button>`** labelled Refresh sits in the shadow root for the keyboard: Enter or Space runs a refresh.
- **`refreshed`** fires after the pop, with `{ row }`, the first new row or null.
- **Sound.** It makes soft synthesized foley (no audio files) once the page has had a tap or a key. `muted` silences this one; `SoapFilm.sound = false` silences the page.

## What happens

| you | it |
|---|---|
| pull down | the list follows the finger, damped past the threshold; the gap fills with a flat film that bows with sideways movement; tension rises in the sound |
| let go short | the gap glides shut and squeezes the film back into the hairline |
| let go past the threshold | the film locks open, swells taller and swirls; refresh fires |
| when done | a tear runs across the whole film, droplets fall, the gap closes with a ripple along the hairline, and the new rows slide in with a flash |

## Limits

- **Its own scroll only.** It is a card of its own, about 340 by 320 pixels, not a wrapper for your page; the pull is on the list inside it.
- **Text is drawn in the system font** and long names or previews are cut short.
- **Needs WebGL2.** Without it the element shows a short note in place of the control. Each one on the page holds its own WebGL context; browsers allow about sixteen at once, so keep it to a dozen or so per page.
- **Drawn for a white page.** The film is drawn over pure white (`#FFFFFF`) and its shadows and hairlines assume it. On a dark or coloured background it looks wrong.
- **Draws at a fixed size and redraws on resize.** It fills the width it is given, up to 640 pixels, with a height that follows. When the width changes the simulation starts again at the new size, keeping the value but not the motion.
- **Not still for reduced motion.** The film is a simulation that is always moving a little; `prefers-reduced-motion` is not honoured yet.
- **Checked in headless Chromium** with real touch and key events. Not tried in Safari or Firefox, on a real phone, or with a screen reader.
