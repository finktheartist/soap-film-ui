# Bubble menu

A navigation bar of five bubbles, each with an icon and a label under it. The chosen one is bigger. Pick another and the two join with a neck of soap, and the size flows from the old one into the new one, the old one shrinking while the new one swells, as if the soap were being poured across. If there are bubbles in between, the swell passes through each of them on the way, so the big bubble seems to travel down the bar.

One of eight controls in this repo. Same idea in each (an ordinary control made of soap film, with real thin-film colour and a fluid simulation running on it), different control.

## Run it

```sh
python3 -m http.server 8000     # from the repo folder
# open http://localhost:8000/menu/
```

`?embed=1` hides the heading and the hint.

## Use it

`menu.js` is the whole component: one file of about 78 KB with its shaders and simulation inside it, and no dependencies.

```html
<script src="menu.js"></script>
<soap-menu label="Main" name="tab">
  <option value="home" selected>Home</option>
  <option value="search">Search</option>
  <option value="inbox">Inbox</option>
  <option value="saved">Saved</option>
  <option value="profile">Profile</option>
</soap-menu>
```

```js
const el = document.querySelector('soap-menu');
el.addEventListener('change', () => show(el.value));
el.value = 'inbox';       // the size flows there
el.selectedIndex;         // 0 to 4
```

| attribute | what it sets | default |
|---|---|---|
| `label` | what a screen reader calls the group | Menu |
| `name` | sent with its form, with the chosen value |  |
| `muted` | no sound from this one | off |

- **Always five.** The bar is laid out for five; extra options are ignored and missing ones are filled in.
- **Five icons are drawn:** home, search, inbox, saved and profile. An option whose `value` is one of those gets that icon; otherwise set `data-icon`, or it takes them in order.
- **Real radio inputs** sit in the shadow root: arrow keys move the choice.
- **Sound.** It makes soft synthesized foley (no audio files) once the page has had a tap or a key. `muted` silences this one; `SoapFilm.sound = false` silences the page.

## What happens

| you | it |
|---|---|
| pick a neighbour | a soap bridge forms between them; the old bubble shrinks while the new one swells, keeping the total area; the bridge thins and snaps |
| pick one further away | the swell passes through each bubble in between in turn, with a soft note at each |
| it arrives | the new bubble overshoots and wobbles, with a settling bloop |
| hover | a bubble lifts a little |

## Limits

- **The labels are drawn in the canvas,** in the system font, and are meant to be one short word.
- **Needs WebGL2.** Without it the element shows a short note in place of the control. Each one on the page holds its own WebGL context; browsers allow about sixteen at once, so keep it to a dozen or so per page.
- **Drawn for a white page.** The film is drawn over pure white (`#FFFFFF`) and its shadows and hairlines assume it. On a dark or coloured background it looks wrong.
- **Draws at a fixed size and redraws on resize.** It fills the width it is given, up to 640 pixels, with a height that follows. When the width changes the simulation starts again at the new size, keeping the value but not the motion.
- **Not still for reduced motion.** The film is a simulation that is always moving a little; `prefers-reduced-motion` is not honoured yet.
- **Checked in headless Chromium** with real touch and key events. Not tried in Safari or Firefox, on a real phone, or with a screen reader.
