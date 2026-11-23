# Tag bubbles

Up to four tags, each a soap bubble with a coloured dot and a label. Drag one into another and, as they touch, a soap bridge forms and they coalesce into one bigger bubble that holds both labels, stacked. Keep going and you can gather all four. Grab one label in a group and pull, and the group stretches and tears, the tag pinching off as its own bubble again with a couple of droplets left behind. Double-clicking a group splits off its last tag.

One of eight controls in this repo. Same idea in each (an ordinary control made of soap film, with real thin-film colour and a fluid simulation running on it), different control.

## Run it

```sh
python3 -m http.server 8000     # from the repo folder
# open http://localhost:8000/tags/
```

`?embed=1` hides the heading and the hint.

## Use it

`tags.js` is the whole component: one file of about 84 KB with its shaders and simulation inside it, and no dependencies.

```html
<script src="tags.js"></script>
<soap-tags label="Labels" name="tags">
  <option value="design">Design</option>
  <option value="urgent" data-color="#EE5A6F">Urgent</option>
  <option value="audio">Audio</option>
  <option value="saved">Saved</option>
</soap-tags>
```

```js
const el = document.querySelector('soap-tags');
el.addEventListener('change', () => console.log(el.groups));   // [['design', 'urgent'], ['audio'], ['saved']]
el.merge('audio', 'design');  // from code
el.split('design');
```

| attribute | what it sets | default |
|---|---|---|
| `label` | what a screen reader calls the group | Tags |
| `name` | sent with its form, as `design+urgent,audio,saved` |  |
| `muted` | no sound from this one | off |

- **Up to four tags.** Each option's `value` is its id and its text is the label; `data-color` sets its dot.
- **From the keyboard** each tag is a button: Enter joins its bubble to the next group along, and Delete or Backspace pulls it out of its group.
- **`el.groups`** is the grouping, an array of arrays of values; `el.value` is the same thing as a string.
- **Sound.** It makes soft synthesized foley (no audio files) once the page has had a tap or a key. `muted` silences this one; `SoapFilm.sound = false` silences the page.

## What happens

| you | it |
|---|---|
| drag a tag | it follows the pointer, wobbling; nearing another, a soap bridge reaches across |
| drop it into another | they coalesce: one bigger bubble swells with both labels and bounces; change fires |
| pull a label out of a group | the group stretches, a neck forms and pinches off, and the tag springs away as its own bubble with droplets; change fires |
| let go of a single tag | it drifts back towards where it rests |

## Limits

- **The grouping starts over when the width changes,** because the bubbles are laid out for the size they are drawn at.
- **Labels are drawn in the canvas,** in the system font, and are meant to be one short word.
- **Needs WebGL2.** Without it the element shows a short note in place of the control. Each one on the page holds its own WebGL context; browsers allow about sixteen at once, so keep it to a dozen or so per page.
- **Drawn for a white page.** The film is drawn over pure white (`#FFFFFF`) and its shadows and hairlines assume it. On a dark or coloured background it looks wrong.
- **Draws at a fixed size and redraws on resize.** It fills the width it is given, up to 640 pixels, with a height that follows. When the width changes the simulation starts again at the new size, keeping the value but not the motion.
- **Not still for reduced motion.** The film is a simulation that is always moving a little; `prefers-reduced-motion` is not honoured yet.
- **Checked in headless Chromium** with real touch and key events. Not tried in Safari or Firefox, on a real phone, or with a screen reader.
