# Water Reminder

A VS Code extension: on first run it asks your name, then every 15 minutes (configurable) a character pops up and asks "Hey, <name>, did you drink water?"

## Run

```bash
npm install
code .        # then press F5
```

In the Extension Development Host window, open the Command Palette and run **Water Reminder: Show Now** to test it immediately.

## Characters

**Realistic (default).** Real 3D people from the [Microsoft Rocketbox](https://github.com/microsoft/Microsoft-Rocketbox) avatar library (MIT, see `media/realistic/LICENSE-Rocketbox.md`), animated with its motion-captured clips: she or he runs in, brakes hard (water splashes out), stands holding the bottle upright in the right hand, and on YES drinks from it with you for a couple of seconds (cap at the lips, the water level drops), lowers the bottle (it vanishes), waves bye empty-handed and walks off; on NO hangs the head and walks away slowly.

- **Female:** blonde young woman with a ponytail, pink shirt and jeans (Rocketbox Female_Adult_01), with soft makeup (rose lips, winged liner, defined brows, blush).
- **Male:** man in a red henley and dark jeans.

The files are converted from Rocketbox FBX with FBX2glTF (textures resized to 1024 px). Set `waterReminder.characterStyle` to `cartoon` for the hand-made characters below.

### Cartoon

On first run it asks your **name**, then **Male or Female**:

- **Male: Aqua Runner.** Curly hair, orange sweatband, round glasses, deep-teal zip hoodie with a water-drop badge, navy joggers with stripes, orange sneakers.
- **Female: Lily.** Glam look: slim oval face, cat-eye almond eyes with winged liner and lashes, defined arched brows, full glossy rose-red lips, cheekbone blush and a beauty mark. Long side-swept waves (dark chocolate with caramel highlights) over one shoulder, tucked behind the other ear with a gold stud. Black long-sleeve top tucked into white high-waist trousers with a gold button and rolled cuffs, white loafers, and a small white handbag.

Switch any time with **Water Reminder: Choose Male or Female Character** (setting `waterReminder.characterGender`).

## What the character does

- **Arrives:** runs in fast, trips and hops on one leg, and water sloshes out of the bottle into puddles. Then he shows you the bottle (still dripping) and asks.
- **NO:** sad face and a tear, then he walks off slowly and fades away (you're reminded again after `snoozeMinutes`).
- **No answer:** after `noReplySeconds` (default 60) it counts as NO: same sad goodbye, and you're reminded again after `snoozeMinutes`. It's also counted as a *missed* reminder (shown in the panel and the status bar tooltip).
- **YES:** Cheers! The character drinks from the bottle with you (the water level drops), lowers it and it vanishes, waves bye bye empty-handed, then walks off.

**Stays out of the way during meetings (Linux):** the reminder doesn't pop up while your screen is being shared, the microphone or camera is in use (a call or meeting, even when muted), or GNOME's Do Not Disturb is on. It waits, shows a ⏸ in the status bar, and pops up as soon as you're free. If a screen share or call starts while it's on screen, it disappears right away. Turn this off with `waterReminder.pauseWhenBusy`. *Show Now* / clicking the status bar always shows it.

**Waits while you're away (Linux, GNOME):** no pop-ups while the screen is locked or you haven't touched the keyboard or mouse for `awayMinutes` (default 5); it shows once you're back. Setting: `pauseWhenAway`.

**Quiet hours:** no reminders from `quietHoursStart` to `quietHoursEnd` (default 22:00 to 08:00). Turn off with `quietHours`.

**Pause:** **Water Reminder: Pause Reminders…** (or the panel / status bar tooltip) pauses for 30 minutes to 4 hours, or until tomorrow morning. **Resume Reminders** turns them back on.

**Several VS Code windows:** only one window reminds you; the others show the same count and countdown. If that window closes, another one takes over within a minute.

A custom image or `.glb` character does the same moves as a whole body (no limb poses).

## Settings panel

Click the 💧 icon in the Activity Bar (or run **Water Reminder: Open Settings Panel**). It shows today's glasses (and litres, from `glassSizeMl`), missed reminders, the time to the next reminder, **Remind me now**, **+1 glass** and **Pause**, this week's glasses with your goal streak, and under **⚙ Show Settings** everything you can change: your name, theme (Dark Ocean, Light Breeze, Deep Ocean, Forest Green), view mode (Normal / Compact), reminder interval, how soon to ask again after *No*, how long to wait for an answer, daily goal, glass size, quiet hours, character, pop-up style and position, and pausing during meetings or while you're away. Changes are previewed in the panel and kept as a draft: press **Save & Reload** to write them to the `waterReminder.*` settings and reload VS Code so they take effect (the theme and view mode also change the pop-up's colours and size), or **Discard** to drop them. The 💧 count in the status bar also opens the panel; hover it for quick links.

## Customize

- **Character:** see *Your own 3D character* below. Without one, a built-in 3D avatar is drawn with three.js (falls back to `media/character.svg` without WebGL). A `media/character.gif`/`.png` (transparent background) replaces the built-in avatar.

## Your own character image (quickest)

Generate a Pixar-style picture of yourself with an AI image tool (ChatGPT, Gemini, …): attach a selfie and use a prompt like:

> 3D Pixar-style cartoon avatar of the person in this photo, full body from head to sneakers, standing front-facing, friendly smile. Styled hair, short trimmed beard, light-blue denim jacket over a dark grey t-shirt, dark grey slim jeans, white sneakers. Holding a clear water bottle out in his right hand at chest height, left arm relaxed at his side. Soft studio lighting, transparent background, PNG.

If the tool can't do transparency, remove the background (e.g. remove.bg). Then run **Water Reminder: Choose Character (image or 3D model)** and pick the PNG. It floats over your screen with a gentle bob.

## Your own 3D character (.glb)

For a polished, Pixar-quality look, use a real rigged 3D model:

1. **Get a front-facing, full-body picture** of the character (plain background, arms a little away from the body). Put the water bottle in his hand in the picture so it ends up in the model.
2. **Turn it into a 3D model** with an image-to-3D tool, e.g. [Meshy](https://www.meshy.ai) (*Image to 3D*) or [Tripo](https://www.tripo3d.ai). Use the tool's **auto-rig / animate** step and add an *Idle* animation (and optionally a *Wave*).
3. **Download it as `.glb`** (without Draco compression).
4. In VS Code run **Water Reminder: Choose Character (image or 3D model)** and pick the file.

The model is scaled and framed automatically, lit with studio lighting, and its animations play: a clip named *wave/greet/hello/cheer/drink* plays once, then *idle* loops. If it faces away, set `waterReminder.characterModelTurn` to `180`.
- **Floating pop-up (Linux):** by default the character floats on top of your screen in a transparent window (bottom-left). Needs `python3-gi` and WebKit2GTK 4.1 (`sudo apt install python3-gi gir1.2-webkit2-4.1`); otherwise it falls back to an editor tab. Settings: `popupStyle` (`overlay` / `tab`), `overlayPosition`. Press Esc to dismiss (= remind me later).
- **Name:** asked on first run; change it any time with **Water Reminder: Change My Name**.
- **Settings** (`waterReminder.*`): `userName`, `character`, `characterModelTurn`, `intervalMinutes` (default 15), `snoozeMinutes`, `noReplySeconds`, `dailyGoal`, `glassSizeMl`, `quietHours`, `quietHoursStart`, `quietHoursEnd`, `pauseWhenBusy`, `pauseWhenAway`, `awayMinutes`.
- The status bar shows today's count (💧 3/8; ⏸ while on hold). Click it to open the panel. The count starts over at your local midnight.
- History (glasses and missed reminders per day) is kept in the extension's global storage as `history.json`.

## Package

```bash
npm i -g @vscode/vsce
vsce package     # produces water-reminder-<version>.vsix
code --install-extension water-reminder-<version>.vsix
```

Bump `version` in `package.json` for every build so the install replaces the old one.

## Development

`media/vendor/three.bundle.js` is three.js r160 + GLTFLoader, RoomEnvironment and the meshopt decoder, bundled as a plain script:

```bash
npm install --no-save three@0.160.0 esbuild
npx esbuild vendor-src/three-bundle.js --bundle --minify --format=iife --legal-comments=eof --outfile=media/vendor/three.bundle.js
```
