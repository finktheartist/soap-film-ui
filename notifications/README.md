# Notification stack

A stack of notifications drawn as a foam of soap bubbles. Each notification is a pill of film with an icon, a title, a line and a time, and neighbours press together and flatten along a shared wall, the walls meeting at 120 degrees the way they do in real foam. A new one floats down onto the top and squashes into place. Flick one sideways, or tap it, and it pops: a ring tears open, droplets fly, and the bubbles that were touching it relax and close the gap.

One of eight controls in this repo. Same idea in each (an ordinary control made of soap film, with real thin-film colour and a fluid simulation running on it), different control.

## Run it

```sh
python3 -m http.server 8000     # from the repo folder
# open http://localhost:8000/notifications/
```

`?embed=1` hides the heading and the hint.

## Use it

`notifications.js` is the whole component: one file of about 82 KB with its shaders and simulation inside it, and no dependencies.

```html
<script src="notifications.js"></script>
<soap-notifications></soap-notifications>
```

```js
const el = document.querySelector('soap-notifications');
el.push({ icon: 'chat', title: 'Jo Reyes', body: 'Sent the final prototype', time: 'now' });
el.addEventListener('dismiss', (e) => console.log(e.detail.title));
el.items = [];        // start with none
el.clear();           // pop them all
```

| attribute | what it sets | default |
|---|---|---|
| `label` | what a screen reader calls the list | Notifications |
| `muted` | no sound from this one | off |

- **Up to four.** `push` returns false when the stack is full. `el.count` says how many there are; a `count` event fires when it changes.
- **Five icons are drawn:** calendar, chat, check, download and bell. Any other name gets the bell.
- **Start from `<option>`s** if you like: `<option data-icon="check" data-body="v2.4 deployed" data-time="3m">Build passed</option>`. With none it starts with three samples; set `el.items = []` for an empty stack.
- **Each notification is also a real button** in the shadow root, in a live region: Enter, Delete or Backspace dismisses it.
- **Sound.** It makes soft synthesized foley (no audio files) once the page has had a tap or a key. `muted` silences this one; `SoapFilm.sound = false` silences the page.

## What happens

| you | it |
|---|---|
| a new one | it drops onto the top of the stack, squashes against the one under it and the shared wall forms |
| press and drag sideways | the bubble slides with the pointer and the wall to its neighbours stretches |
| tap, or flick past a threshold | it pops: a tear opens, droplets and small bubbles fly, and the neighbours spring back and close up; dismiss fires |
| drag a little and let go | it snaps back into the foam with a wobble |

## Limits

- **Text is drawn in the canvas,** in the system font. Titles and lines that do not fit the pill are cut short.
- **Needs WebGL2.** Without it the element shows a short note in place of the control. Each one on the page holds its own WebGL context; browsers allow about sixteen at once, so keep it to a dozen or so per page.
- **Drawn for a white page.** The film is drawn over pure white (`#FFFFFF`) and its shadows and hairlines assume it. On a dark or coloured background it looks wrong.
- **Draws at a fixed size and redraws on resize.** It fills the width it is given, up to 640 pixels, with a height that follows. When the width changes the simulation starts again at the new size, keeping the value but not the motion.
- **Not still for reduced motion.** The film is a simulation that is always moving a little; `prefers-reduced-motion` is not honoured yet.
- **Checked in headless Chromium** with real touch and key events. Not tried in Safari or Firefox, on a real phone, or with a screen reader.
