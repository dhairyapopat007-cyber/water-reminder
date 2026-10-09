/** Colour themes, shared by the sidebar panel and the reminder pop-up. */
export const THEMES: Record<string, {
  label: string; bg: string; card: string; chip: string; border: string; text: string; muted: string;
  accent: string; heading: string; glow: string; bubble: [string, string]; bubbleBorder: string; yes: string;
}> = {
  darkOcean: {
    label: 'Dark Ocean', bg: '#0d1626', card: '#131f33', chip: '#0b1424', border: '#24344d', text: '#e6edf7',
    muted: '#8a9bb5', accent: '#7fb2ff', heading: '#fff4b2', glow: 'rgba(255,174,49,.65)',
    bubble: ['rgba(23,46,73,.92)', 'rgba(9,20,37,.88)'], bubbleBorder: 'rgba(255,255,255,.18)', yes: '#2e9bff',
  },
  lightBreeze: {
    label: 'Light Breeze', bg: '#eef5fb', card: '#ffffff', chip: '#f3f8fc', border: '#c9dbea', text: '#16324a',
    muted: '#5d7890', accent: '#1e88e5', heading: '#0b3954', glow: 'rgba(30,136,229,.25)',
    bubble: ['rgba(255,255,255,.96)', 'rgba(222,238,250,.94)'], bubbleBorder: 'rgba(11,57,84,.18)', yes: '#1e88e5',
  },
  deepOcean: {
    label: 'Deep Ocean', bg: '#060b1c', card: '#0c1430', chip: '#081027', border: '#1b2a55', text: '#dce6ff',
    muted: '#7d8fbf', accent: '#5b8cff', heading: '#9ad8ff', glow: 'rgba(91,140,255,.7)',
    bubble: ['rgba(12,24,64,.95)', 'rgba(3,8,26,.92)'], bubbleBorder: 'rgba(120,160,255,.25)', yes: '#3f6fff',
  },
  forestGreen: {
    label: 'Forest Green', bg: '#0d1a13', card: '#13261b', chip: '#0b1710', border: '#24432f', text: '#e3f3e8',
    muted: '#86a893', accent: '#5fd08f', heading: '#e6ffcf', glow: 'rgba(120,220,120,.55)',
    bubble: ['rgba(24,58,40,.93)', 'rgba(10,30,20,.9)'], bubbleBorder: 'rgba(160,230,180,.22)', yes: '#2fa86a',
  },
};
export const theme = (id: string) => THEMES[id] ?? THEMES.darkOcean;

/** Settings the sidebar may change (anything else it sends is ignored). */
export const SETTABLE = [
  'userName', 'theme', 'viewMode', 'intervalMinutes', 'snoozeMinutes', 'noReplySeconds', 'dailyGoal', 'glassSizeMl',
  'characterGender', 'characterStyle', 'popupStyle', 'overlayPosition', 'pauseWhenBusy', 'pauseWhenAway',
  'quietHours', 'quietHoursStart', 'quietHoursEnd', 'character',
];
/** Commands the sidebar's buttons may run. */
export const COMMANDS = [
  'waterReminder.showNow', 'waterReminder.resetCount', 'waterReminder.chooseCharacter', 'waterReminder.logGlass',
  'waterReminder.pause', 'waterReminder.resume',
];

const opts = (key: string, items: [string | number, string][], cls = '') =>
  `<div class="opts ${cls}">${items
    .map(([v, l]) => `<button class="opt" data-key="${key}" data-value="${v}"${typeof v === 'number' ? ' data-num' : ''}>${l}</button>`)
    .join('')}</div>`;

/** A drop-down of the hours of the day (00:00 … 23:00). */
const hours = (key: string) =>
  `<select data-key="${key}">${Array.from({ length: 24 }, (_, h) => `<option value="${h}">${String(h).padStart(2, '0')}:00</option>`).join('')}</select>`;

/** The sidebar panel: today's progress, quick actions and every setting. State arrives by postMessage. */
export function settingsHtml(cspSource: string): string {
  return /* html */ `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; script-src 'unsafe-inline';">
<style>
  :root { --bg:#0d1626; --card:#131f33; --chip:#0b1424; --border:#24344d; --text:#e6edf7; --muted:#8a9bb5; --accent:#7fb2ff; --yes:#2e9bff; }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 12px; background: var(--bg); color: var(--text);
    font-family: var(--vscode-font-family, system-ui, sans-serif); font-size: 13px; transition: background .25s, color .25s;
  }
  .card { background: var(--card); border: 1px solid var(--border); border-radius: 14px; padding: 14px; margin-bottom: 12px; }
  .hero { text-align: center; }
  .hero h2 { margin: 0 0 2px; font-size: 15px; }
  .count { font-size: 30px; font-weight: 700; color: var(--accent); margin: 6px 0 2px; }
  .count small { font-size: 14px; color: var(--muted); font-weight: 500; }
  .bar { height: 8px; border-radius: 6px; background: var(--chip); border: 1px solid var(--border); overflow: hidden; margin: 8px 0; }
  .bar i { display: block; height: 100%; width: 0; background: linear-gradient(90deg, var(--yes), var(--accent)); transition: width .4s; }
  .next { color: var(--muted); font-size: 12px; }
  .actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 12px; }
  button {
    font: inherit; color: var(--text); background: var(--chip); border: 1px solid var(--border);
    border-radius: 10px; padding: 9px 8px; cursor: pointer; font-weight: 600; transition: border-color .15s, background .15s, transform .1s;
  }
  button:hover { border-color: var(--accent); }
  button:active { transform: scale(.97); }
  button.primary { background: var(--yes); border-color: var(--yes); color: #fff; }
  .toggle {
    width: 100%; padding: 12px; font-size: 14px; color: var(--accent);
    background: color-mix(in srgb, var(--accent) 16%, var(--card)); border-color: color-mix(in srgb, var(--accent) 40%, var(--border));
  }
  .label { margin: 16px 0 8px; font-size: 11px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); }
  .label:first-child { margin-top: 0; }
  .opts { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .opts.chips { display: flex; flex-wrap: wrap; }
  .opts.chips .opt { padding: 7px 11px; }
  .opts.three { grid-template-columns: 1fr 1fr 1fr; }
  .opt.active { border-color: var(--accent); color: var(--accent); background: color-mix(in srgb, var(--accent) 16%, var(--chip)); }
  .opts.chips .opt.active { border-color: #e0b44c; color: color-mix(in srgb, #e8b84a 62%, var(--text)); background: color-mix(in srgb, #e0b44c 14%, var(--chip)); }
  .stepper { display: grid; grid-template-columns: 44px 1fr 44px; gap: 8px; }
  .stepper div {
    display: flex; align-items: center; justify-content: center; font-size: 16px; font-weight: 600;
    background: var(--chip); border: 1px solid var(--border); border-radius: 10px;
  }
  .stepper button { font-size: 18px; padding: 6px; }
  input[type=text] {
    width: 100%; font: inherit; color: var(--text); background: var(--chip); border: 1px solid var(--border);
    border-radius: 10px; padding: 9px 10px; outline: none;
  }
  input[type=text]:focus { border-color: var(--accent); }
  select {
    flex: 1; font: inherit; color: var(--text); background: var(--chip); border: 1px solid var(--border);
    border-radius: 10px; padding: 8px; outline: none;
  }
  select:disabled { opacity: .45; }
  .week { display: grid; grid-template-columns: repeat(7, 1fr); gap: 6px; align-items: end; height: 92px; }
  .week div { display: flex; flex-direction: column; align-items: center; justify-content: flex-end; height: 100%; gap: 3px; }
  .week i { width: 100%; max-width: 22px; min-height: 3px; border-radius: 5px 5px 2px 2px; background: var(--border); }
  .week i.met { background: linear-gradient(180deg, var(--accent), var(--yes)); }
  .week b { font-size: 11px; font-weight: 600; }
  .week span { font-size: 10px; color: var(--muted); }
  .week div.today span { color: var(--accent); font-weight: 700; }
  .row { display: flex; gap: 8px; align-items: center; }
  .row > :first-child { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .switch { display: flex; align-items: center; justify-content: space-between; gap: 10px; cursor: pointer; }
  .switch span { color: var(--muted); font-size: 12px; }
  .switch input { width: 18px; height: 18px; accent-color: var(--accent); flex: none; }
  .hint { color: var(--muted); font-size: 11px; margin-top: 6px; }
  #settings[hidden], #savebar[hidden] { display: none; }
  #savebar {
    position: sticky; bottom: 0; margin: 0 -12px -12px; padding: 10px 12px 12px;
    background: color-mix(in srgb, var(--bg) 88%, transparent); backdrop-filter: blur(6px); border-top: 1px solid var(--border);
  }
  #savebar .hint { margin: 0 0 8px; text-align: center; }
  #savebar .actions { margin-top: 0; }
  button:disabled { opacity: .45; cursor: default; border-color: var(--border); transform: none; }
  /* compact: tighter panel */
  body.compact { padding: 8px; font-size: 12px; }
  body.compact .card { padding: 10px; border-radius: 10px; margin-bottom: 8px; }
  body.compact .count { font-size: 22px; }
  body.compact button { padding: 6px; }
  body.compact .label { margin: 12px 0 6px; }
</style>
</head>
<body>
  <div class="card hero">
    <h2 id="hello">💧 Hydration</h2>
    <div class="count"><span id="count">0</span> <small>/ <span id="goal">8</span> glasses</small></div>
    <div class="next" id="litres"></div>
    <div class="bar"><i id="fill"></i></div>
    <div class="next" id="next"></div>
    <div class="actions">
      <button class="primary" data-cmd="waterReminder.showNow">Remind me now</button>
      <button data-cmd="waterReminder.logGlass">+1 glass</button>
    </div>
    <div class="actions" style="grid-template-columns:1fr">
      <button id="pause"></button>
    </div>
  </div>

  <div class="card">
    <div class="row" style="margin-bottom:10px"><b>This week</b><span class="next" id="streak"></span></div>
    <div class="week" id="week"></div>
  </div>

  <button class="toggle" id="toggle"></button>

  <div class="card" id="settings" style="margin-top:12px">
    <div class="label">Your name</div>
    <input type="text" id="name" maxlength="40" placeholder="Your name">

    <div class="label">Theme</div>
    ${opts('theme', Object.entries(THEMES).map(([id, t]) => [id, t.label]))}

    <div class="label">View mode</div>
    ${opts('viewMode', [['normal', '🖥 Normal'], ['compact', '📦 Compact']])}
    <div class="hint">Compact makes this panel and the pop-up character smaller.</div>

    <div class="label">Reminder interval</div>
    ${opts('intervalMinutes', [5, 15, 30, 45, 60, 90, 120].map(m => [m, `${m}m`] as [number, string]), 'chips')}

    <div class="label">After "No", remind again in</div>
    ${opts('snoozeMinutes', [5, 10, 15, 30].map(m => [m, `${m}m`] as [number, string]), 'chips')}

    <div class="label">No answer? Count it as "No" after</div>
    ${opts('noReplySeconds', [[30, '30s'], [60, '1m'], [120, '2m'], [300, '5m'], [0, 'Never']], 'chips')}

    <div class="label">Daily goal</div>
    <div class="stepper"><button id="goalDown">−</button><div id="goalText">8 glasses</div><button id="goalUp">+</button></div>

    <div class="label">Glass size</div>
    ${opts('glassSizeMl', [150, 200, 250, 300, 500].map(ml => [ml, `${ml} ml`] as [number, string]), 'chips')}

    <div class="label">Quiet hours</div>
    <label class="switch"><span>No reminders at night</span><input type="checkbox" id="quiet"></label>
    <div class="row" style="margin-top:8px">${hours('quietHoursStart')}<span class="next">to</span>${hours('quietHoursEnd')}</div>

    <div class="label">Character</div>
    ${opts('characterGender', [['male', '👨 Male'], ['female', '👩 Female']])}
    <div style="height:8px"></div>
    ${opts('characterStyle', [['realistic', 'Realistic 3D'], ['cartoon', 'Cartoon']])}
    <div class="row" style="margin-top:8px">
      <span class="hint" id="custom" style="margin:0"></span>
      <button id="clearChar" hidden>Remove</button>
      <button data-cmd="waterReminder.chooseCharacter">Own image…</button>
    </div>

    <div class="label">Pop-up</div>
    ${opts('popupStyle', [['overlay', 'Floating'], ['tab', 'Editor tab']])}
    <div style="height:8px"></div>
    ${opts('overlayPosition', [['bottom-left', 'Left'], ['center', 'Center'], ['bottom-right', 'Right']], 'three')}

    <div class="label">Meetings</div>
    <label class="switch"><span>Don't pop up while sharing the screen, in a call, or on Do Not Disturb</span><input type="checkbox" id="busy"></label>
    <div style="height:8px"></div>
    <label class="switch"><span>Wait while I'm away (screen locked or no activity for 5 min)</span><input type="checkbox" id="away"></label>
  </div>

  <div id="savebar">
    <div class="hint" id="pending"></div>
    <div class="actions">
      <button id="discard">Discard</button>
      <button class="primary" id="save">Save &amp; Reload</button>
    </div>
  </div>

<script>
  const vscode = acquireVsCodeApi();
  const $ = id => document.getElementById(id);
  const THEMES = ${JSON.stringify(THEMES).replace(/</g, '\\u003c')};
  /** saved: the settings as they are now; draft: your unsaved changes; s: what the panel shows (both merged). */
  let saved = null, s = null;
  const prev = vscode.getState() || {};
  let open = prev.open !== false;
  let draft = prev.draft || {};

  const remember = () => vscode.setState({ open, draft });
  function set(key, value) {
    if (key === 'userName' && !value) delete draft[key];
    else if (saved[key] === value) delete draft[key];
    else draft[key] = value;
    remember();
    render();
  }

  function render() {
    if (!saved) return;
    s = Object.assign({}, saved, draft);
    const n = Object.keys(draft).length;
    $('pending').textContent = n ? n + (n === 1 ? ' unsaved change' : ' unsaved changes') + ' · Save reloads VS Code' : 'No unsaved changes';
    $('save').disabled = $('discard').disabled = !n;
    $('savebar').hidden = !open;
    const t = THEMES[s.theme] || THEMES.darkOcean;
    for (const k of ['bg', 'card', 'chip', 'border', 'text', 'muted', 'accent', 'yes'])
      document.documentElement.style.setProperty('--' + k, t[k]);
    document.body.classList.toggle('compact', s.viewMode === 'compact');

    $('hello').textContent = s.userName ? '💧 Hi, ' + s.userName : '💧 Hydration';
    $('count').textContent = s.count;
    $('goal').textContent = s.dailyGoal;
    $('fill').style.width = Math.min(100, (s.count / s.dailyGoal) * 100) + '%';
    $('goalText').textContent = s.dailyGoal + (s.dailyGoal === 1 ? ' glass' : ' glasses');
    // litres follow the glass size and goal you're previewing
    const L = n => String(+(n * s.glassSizeMl / 1000).toFixed(2));
    $('litres').textContent = L(s.count) + ' of ' + L(s.dailyGoal) + ' L' + (s.missed ? ' · ' + s.missed + ' missed' : '');
    $('pause').textContent = s.paused ? '▶ Resume reminders' : '⏸ Pause reminders…';
    $('pause').dataset.cmd = s.paused ? 'waterReminder.resume' : 'waterReminder.pause';
    $('away').checked = s.pauseWhenAway;
    $('quiet').checked = s.quietHours;
    for (const sel of document.querySelectorAll('select[data-key]')) {
      sel.value = String(s[sel.dataset.key]);
      sel.disabled = !s.quietHours;
    }
    const top = Math.max(s.dailyGoal, ...s.week.map(d => d.glasses));
    $('week').innerHTML = s.week.map((d, i) =>
      '<div' + (i === 6 ? ' class="today"' : '') + ' title="' + d.glasses + ' glasses' + (d.missed ? ', ' + d.missed + ' missed' : '') + '">' +
      '<b>' + d.glasses + '</b><i' + (d.glasses >= s.dailyGoal ? ' class="met"' : '') + ' style="height:' + Math.round(d.glasses / top * 60) + 'px"></i>' +
      '<span>' + d.label + '</span></div>').join('');
    $('streak').textContent = s.streak ? '🔥 ' + s.streak + '-day streak' : 'Reach your goal to start a streak';
    if (document.activeElement !== $('name')) $('name').value = s.userName;
    $('busy').checked = s.pauseWhenBusy;
    $('custom').textContent = s.character ? 'Using ' + s.character : 'Or use your own picture / 3D model';
    $('clearChar').hidden = !s.character;

    for (const b of document.querySelectorAll('.opt'))
      b.classList.toggle('active', String(s[b.dataset.key]) === b.dataset.value);
    tick();
  }

  function tick() {
    if (!s) return;
    if (s.pausedFor) { $('next').textContent = '⏸ On hold: ' + s.pausedFor; return; }
    const min = Math.max(0, Math.ceil((s.nextAt - Date.now()) / 60000));
    $('next').textContent = s.nextAt ? (min <= 1 ? 'Next reminder in under a minute' : 'Next reminder in ' + min + ' min') : '';
  }
  setInterval(tick, 15000);

  function showSettings() {
    $('settings').hidden = !open;
    $('savebar').hidden = !open;
    $('toggle').textContent = open ? '⚙ Hide Settings' : '⚙ Show Settings';
    remember();
  }
  $('toggle').onclick = () => { open = !open; showSettings(); };
  showSettings();

  document.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.cmd) vscode.postMessage({ type: 'cmd', command: b.dataset.cmd });
    else if (b.dataset.key) set(b.dataset.key, 'num' in b.dataset ? Number(b.dataset.value) : b.dataset.value);
  });
  $('name').addEventListener('input', () => set('userName', $('name').value.trim()));
  $('name').addEventListener('keydown', e => e.key === 'Enter' && $('name').blur());
  $('goalDown').onclick = () => s.dailyGoal > 1 && set('dailyGoal', s.dailyGoal - 1);
  $('goalUp').onclick = () => s.dailyGoal < 30 && set('dailyGoal', s.dailyGoal + 1);
  $('busy').onchange = e => set('pauseWhenBusy', e.target.checked);
  $('away').onchange = e => set('pauseWhenAway', e.target.checked);
  $('quiet').onchange = e => set('quietHours', e.target.checked);
  for (const sel of document.querySelectorAll('select[data-key]')) sel.onchange = () => set(sel.dataset.key, Number(sel.value));
  $('clearChar').onclick = () => set('character', '');
  $('discard').onclick = () => { draft = {}; remember(); $('name').value = saved.userName; render(); };
  $('save').onclick = () => {
    $('save').disabled = $('discard').disabled = true;
    $('pending').textContent = 'Saving… VS Code will reload';
    vscode.postMessage({ type: 'save', changes: draft });
    draft = {};
    remember();
  };

  window.addEventListener('message', e => {
    if (e.data.type !== 'state') return;
    saved = e.data.state;
    // drop draft entries that now match what's saved (e.g. changed in the Settings screen)
    for (const k of Object.keys(draft)) if (saved[k] === draft[k]) delete draft[k];
    render();
  });
  vscode.postMessage({ type: 'ready' });
</script>
</body>
</html>`;
}
