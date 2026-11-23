# Slider

A range slider in a glass track whose filled part is a pane of soap film, held on a thin wand that is the handle. The film is a fluid simulation, so dragging stirs it: the pane stretches and its edges bow, and the colours shear and swirl with how fast you move. Let go and small bubbles bloom in the corners of the pane and along its leading edge, swell, and one by one coalesce back into it until it is a single smooth pane again.

One of eight controls in this repo. Same idea in each (an ordinary control made of soap film, with real thin-film colour and a fluid simulation running on it), different control.

## Run it

```sh
python3 -m http.server 8000     # from the repo folder
# open http://localhost:8000/slider/
```

`?embed=1` hides the heading and the hint.

## Use it

`slider.js` is the whole component: one file of about 95 KB with its shaders and simulation inside it, and no dependencies.

```html
<script src="slider.js"></script>
<soap-slider value="40" label="Volume"></soap-slider>
```

```js
const el = document.querySelector('soap-slider');
el.addEventListener('input', () => setVolume(el.value));   // while it moves
el.addEventListener('change', () => save(el.value));      // when it is let go
el.value = 80;        // from code or the keys it glides there
```

| attribute | what it sets | default |
|---|---|---|
| `value` | where it starts | half way |
| `min`, `max`, `step` | like a range input's | 0, 100, 1 |
| `label` | what a screen reader calls it | Slider |
| `name` | sent with its form |  |
| `disabled` | ignores the pointer and the keys | off |
| `muted` | no sound from this one | off |

- **The number is not drawn.** The slider is the pane and the track; show the value beside it if the page needs it.
- **A finger only counts once it has moved sideways,** so the page still scrolls past it on a phone.
- **A real `<input type="range">`** lies under the drawing for the keyboard and the screen reader: arrow keys, Home and End.
- **Sound.** It makes soft synthesized foley (no audio files) once the page has had a tap or a key. `muted` silences this one; `SoapFilm.sound = false` silences the page.

## What happens

| you | it |
|---|---|
| press | the edge of the pane jumps to the pointer with a soft tap |
| drag | the pane stretches after it, its long edges bowing in and out; the film shears with the speed; a soft glide sound rises and falls with it |
| let go | the pane rings, then bubbles appear in its corners and at its edge a few at a time, swell and fuse back into it over two or three seconds |
| move again | any bubbles still on the edges are gulped back at once |

## Limits

- **Chunky.** The track is about 60% of the element's width and a quarter of it tall, with white round it for the edge bubbles. Put it where a big control is welcome.
- **Needs WebGL2.** Without it the element shows a short note in place of the control. Each one on the page holds its own WebGL context; browsers allow about sixteen at once, so keep it to a dozen or so per page.
- **Drawn for a white page.** The film is drawn over pure white (`#FFFFFF`) and its shadows and hairlines assume it. On a dark or coloured background it looks wrong.
- **Draws at a fixed size and redraws on resize.** It fills the width it is given, up to 640 pixels, with a height that follows. When the width changes the simulation starts again at the new size, keeping the value but not the motion.
- **Not still for reduced motion.** The film is a simulation that is always moving a little; `prefers-reduced-motion` is not honoured yet.
- **Checked in headless Chromium** with real touch and key events. Not tried in Safari or Firefox, on a real phone, or with a screen reader.
