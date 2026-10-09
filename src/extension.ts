import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { spawn, execFile, ChildProcess } from 'child_process';
import { settingsHtml, theme, SETTABLE, COMMANDS } from './settingsView';

let timer: NodeJS.Timeout | undefined;
let panel: vscode.WebviewPanel | undefined;
let overlay: ChildProcess | undefined;
let statusItem: vscode.StatusBarItem;
/** The sidebar panel, while it's open. */
let view: vscode.WebviewView | undefined;
/** When the next reminder is due (ms since epoch). */
let nextAt = 0;
/** Why reminders are on hold (screen share, call, …), shown in the status bar; '' when not paused. */
let pausedFor = '';
/** While busy, look again this often (minutes) and show the reminder as soon as you're free. */
const BUSY_RETRY_MINUTES = 1;
/** Only one VS Code window runs the reminder; this one does while true. */
let leader = false;
/** Where the data shared by all VS Code windows lives (history, pause, which window reminds). */
let storageDir = '';
/** The pause last seen, so the reminding window notices when another window pauses or resumes. */
let lastPause = 0;

const cfg = () => vscode.workspace.getConfiguration('waterReminder');
/** A local calendar day as YYYY-MM-DD (not UTC, so the count starts over at your midnight). */
const dayKey = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const userName = () => cfg().get<string>('userName', '').trim();
const goal = () => cfg().get<number>('dailyGoal', 8);
/** Glasses as litres, e.g. 3 → "0.75". */
const litres = (glasses: number) => String(+((glasses * cfg().get<number>('glassSizeMl', 250)) / 1000).toFixed(2));
const clock = (t: number) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

type Day = { glasses: number; missed: number };

/** A small JSON file in the extension's storage, shared by every VS Code window. */
function readJson<T>(name: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(path.join(storageDir, name), 'utf8'));
  } catch {
    return fallback;
  }
}
function writeJson(name: string, value: unknown) {
  fs.mkdirSync(storageDir, { recursive: true });
  fs.writeFileSync(path.join(storageDir, name), JSON.stringify(value));
}

/** Glasses drunk and reminders left unanswered, per day. */
const history = () => readJson<Record<string, Partial<Day>>>('history.json', {});
const day = (key = dayKey()): Day => ({ glasses: 0, missed: 0, ...history()[key] });
function setDay(change: Partial<Day>) {
  const all = history();
  all[dayKey()] = { ...day(), ...change };
  writeJson('history.json', all);
}

/** Moves the counts kept by older versions (one globalState key per UTC day) into history.json. */
function migrateCounts(context: vscode.ExtensionContext) {
  if (fs.existsSync(path.join(storageDir, 'history.json'))) return;
  const all: Record<string, Partial<Day>> = {};
  for (const key of context.globalState.keys()) {
    const m = /^glasses-(\d{4}-\d{2}-\d{2})$/.exec(key);
    if (m) all[m[1]] = { glasses: context.globalState.get<number>(key, 0), missed: 0 };
  }
  writeJson('history.json', all);
}

/** Reminders are paused until this time (ms since epoch); 0 when not paused. */
const pausedUntil = () => readJson<{ until: number }>('pause.json', { until: 0 }).until;
const setPause = (until: number) => writeJson('pause.json', { until });

/** Minutes until quiet hours are over at time `t`, or 0 if reminders may show then. */
function quietMinutesLeft(t = Date.now()): number {
  if (!cfg().get<boolean>('quietHours', true)) return 0;
  const from = cfg().get<number>('quietHoursStart', 22);
  const to = cfg().get<number>('quietHoursEnd', 8);
  const now = new Date(t);
  const h = now.getHours() + now.getMinutes() / 60;
  const quiet = from < to ? h >= from && h < to : from > to && (h >= from || h < to);
  if (!quiet) return 0;
  const end = new Date(now);
  end.setHours(to, 0, 0, 0);
  if (end.getTime() <= t) end.setDate(end.getDate() + 1);
  return (end.getTime() - t) / 60_000;
}

/** The first time at or after `t` when a reminder may show: not paused and not in quiet hours. */
const nextAllowed = (t: number) => {
  t = Math.max(t, pausedUntil());
  return t + quietMinutesLeft(t) * 60_000;
};

/** Why reminders are held back on purpose (pause or quiet hours), or ''. */
function holdReason(): string {
  if (pausedUntil() > Date.now()) return `paused until ${clock(pausedUntil())}`;
  if (quietMinutesLeft() > 0) return `quiet hours until ${clock(Date.now() + quietMinutesLeft() * 60_000)}`;
  return '';
}

/** The reminding window: its process id, when it last checked in, and its countdown. */
type Leader = { pid: number; at: number; nextAt: number; pausedFor: string };
const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e: any) {
    return e.code === 'EPERM';
  }
};
/** A window that hasn't checked in for 3 minutes is gone (or its process id was reused). */
const fresh = (l?: Leader) => !!l && Date.now() - l.at < 3 * 60_000 && alive(l.pid);
const writeLeader = () => leader && writeJson('leader.json', { pid: process.pid, at: Date.now(), nextAt, pausedFor });

/**
 * Runs every minute in every window. The reminding window checks in; the others show its countdown
 * and take over if it closed. Also keeps the status bar current (today's count starts over at midnight).
 */
function heartbeat(context: vscode.ExtensionContext, schedule: (m: number) => void) {
  const l = readJson<Leader | undefined>('leader.json', undefined);
  if (leader && l && l.pid !== process.pid && fresh(l)) {
    // another window claimed it at the same moment: let that one remind
    leader = false;
    if (timer) clearTimeout(timer);
  }
  if (leader) {
    const p = pausedUntil();
    if (p !== lastPause) {
      // paused or resumed (maybe in another window)
      lastPause = p;
      schedule(p > Date.now() ? 0 : interval());
    } else if (nextAt && Date.now() > nextAt + 60_000 && !overlay && !panel) {
      // the timer was stalled by sleep/suspend: catch up now
      schedule(0);
    } else writeLeader();
  } else if (!fresh(l)) {
    leader = true;
    lastPause = pausedUntil();
    // Take over the closed window's countdown; after a restart, start a new one.
    const recent = l && Date.now() - l.at < 3 * 60_000;
    schedule(recent ? Math.max(0.5, (l.nextAt - Date.now()) / 60_000) : interval());
  } else {
    nextAt = l!.nextAt;
    pausedFor = l!.pausedFor;
  }
  updateStatus(context);
}
const interval = () => cfg().get<number>('intervalMinutes', 15);

const gender = () => cfg().get<string>('characterGender', '');
const compact = () => cfg().get<string>('viewMode', 'normal') === 'compact';

/**
 * Lets you pick the built-in character: him or her. Picking one also drops a custom image/model,
 * since that would be shown instead. Returns false if dismissed.
 */
async function askGender(): Promise<boolean> {
  const items: (vscode.QuickPickItem & { value: string })[] = [
    { value: 'male', label: '$(person) Male', description: 'Realistic man', detail: 'Red henley, dark jeans, motion-captured moves (cartoon: Aqua Runner)' },
    { value: 'female', label: '$(person) Female', description: 'Realistic woman', detail: 'Blonde ponytail, pink shirt, jeans, motion-captured moves (cartoon: Lily)' },
  ];
  const picked = await vscode.window.showQuickPick(items, {
    title: '💧 Water Reminder: who should remind you?',
    placeHolder: 'Choose your character: Male or Female',
    ignoreFocusOut: true,
  });
  if (!picked) return false;
  await cfg().update('characterGender', picked.value, vscode.ConfigurationTarget.Global);
  if (cfg().get<string>('character', '')) await cfg().update('character', undefined, vscode.ConfigurationTarget.Global);
  return true;
}

/** Asks for the user's name and saves it to the global setting. Returns false if dismissed. */
async function askName(): Promise<boolean> {
  const name = await vscode.window.showInputBox({
    title: '💧 Water Reminder',
    prompt: "What's your name? I'll use it when I remind you to drink water.",
    placeHolder: 'Your name',
    value: userName(),
    ignoreFocusOut: true,
    validateInput: v => (v.trim() ? null : 'Please enter your name'),
  });
  if (!name?.trim()) return false;
  await cfg().update('userName', name.trim(), vscode.ConfigurationTarget.Global);
  vscode.window.showInformationMessage(
    `Thanks, ${name.trim()}! I'll remind you to drink water every ${interval()} minutes. 💧`
  );
  return true;
}

export async function activate(context: vscode.ExtensionContext) {
  storageDir = context.globalStorageUri.fsPath;
  migrateCounts(context);
  statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusItem.command = 'waterReminder.openSettings';
  updateStatus(context);
  statusItem.show();

  // Only the reminding window keeps a timer; the others follow it in heartbeat().
  const schedule = (minutes: number) => {
    if (!leader) return;
    if (timer) clearTimeout(timer);
    // Skip over a pause and quiet hours.
    nextAt = nextAllowed(Date.now() + minutes * 60_000);
    writeLeader();
    updateStatus(context);
    timer = setTimeout(async () => {
      if (!leader) return;
      // paused, or quiet hours began, since this was scheduled
      if (nextAllowed(Date.now()) > Date.now() + 1000) return schedule(0);
      // Never pop up over a screen share, a meeting or while you're away: wait until it's over.
      pausedFor = await busyReason();
      writeLeader();
      updateStatus(context);
      if (pausedFor) schedule(BUSY_RETRY_MINUTES);
      else showReminder(context, schedule, false);
    }, nextAt - Date.now());
  };
  const tick = setInterval(() => heartbeat(context, schedule), 60_000);

  context.subscriptions.push(
    statusItem,
    { dispose: () => clearInterval(tick) },
    vscode.commands.registerCommand('waterReminder.showNow', () => showReminder(context, schedule)),
    vscode.commands.registerCommand('waterReminder.resetCount', () => {
      setDay({ glasses: 0 });
      updateStatus(context);
    }),
    vscode.commands.registerCommand('waterReminder.pause', async () => {
      const morning = new Date();
      morning.setDate(morning.getDate() + 1);
      morning.setHours(cfg().get<number>('quietHoursEnd', 8), 0, 0, 0);
      const picked = await vscode.window.showQuickPick(
        [
          { label: '30 minutes', until: Date.now() + 30 * 60_000 },
          { label: '1 hour', until: Date.now() + 60 * 60_000 },
          { label: '2 hours', until: Date.now() + 120 * 60_000 },
          { label: '4 hours', until: Date.now() + 240 * 60_000 },
          { label: 'Until tomorrow morning', description: clock(morning.getTime()), until: morning.getTime() },
        ],
        { title: '💧 Water Reminder: pause reminders for…' }
      );
      if (!picked) return;
      setPause(picked.until);
      heartbeat(context, schedule);
      vscode.window.showInformationMessage(`💧 Reminders paused until ${clock(picked.until)}.`);
    }),
    vscode.commands.registerCommand('waterReminder.resume', () => {
      setPause(0);
      heartbeat(context, schedule);
      vscode.window.showInformationMessage(`💧 Reminders are back on: next one in ${interval()} minutes.`);
    }),
    vscode.commands.registerCommand('waterReminder.logGlass', () => logGlass(context)),
    vscode.commands.registerCommand('waterReminder.openSettings', () => vscode.commands.executeCommand('waterReminder.panel.focus')),
    vscode.window.registerWebviewViewProvider('waterReminder.panel', {
      resolveWebviewView(v) {
        view = v;
        v.webview.options = { enableScripts: true };
        v.webview.html = settingsHtml(v.webview.cspSource);
        v.webview.onDidReceiveMessage(msg => onPanelMessage(context, msg));
        v.onDidChangeVisibility(() => postState(context));
        v.onDidDispose(() => (view = undefined));
      },
    }),
    vscode.commands.registerCommand('waterReminder.setName', askName),
    vscode.commands.registerCommand('waterReminder.chooseCharacter', () => chooseCharacter(context, schedule)),
    vscode.commands.registerCommand('waterReminder.chooseGender', async () => {
      if (!(await askGender())) return;
      const show = await vscode.window.showInformationMessage(
        `Your reminder is now the ${gender() === 'female' ? 'woman 👩' : 'man 👨'}.`, 'Show now'
      );
      if (show) showReminder(context, schedule);
    }),
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('waterReminder')) updateStatus(context);
      // Only a new interval or new quiet hours restart the countdown; renaming yourself shouldn't.
      if (['intervalMinutes', 'quietHours', 'quietHoursStart', 'quietHoursEnd'].some(k => e.affectsConfiguration(`waterReminder.${k}`))) {
        schedule(interval());
      }
    }),
    { dispose: () => timer && clearTimeout(timer) }
  );

  // First run: your name, then Male or Female.
  if (!userName()) await askName();
  if (!gender()) await askGender();
  // Become the reminding window unless another one already is.
  heartbeat(context, schedule);
}

/** Adds a glass to today's count and cheers you on. */
async function logGlass(context: vscode.ExtensionContext) {
  const count = day().glasses + 1;
  setDay({ glasses: count });
  updateStatus(context);
  const amount = `${count} glass${count === 1 ? '' : 'es'} (${litres(count)} L)`;
  vscode.window.showInformationMessage(
    count >= goal() ? `🎉 Goal reached! ${amount} today.` : `Nice! 💧 ${count}/${goal()} glasses today (${litres(count)} of ${litres(goal())} L).`
  );
}

/** A message from the sidebar panel: save its changes, run a command, or ask for the current state. */
async function onPanelMessage(context: vscode.ExtensionContext, msg: any) {
  if (msg?.type === 'ready') return postState(context);
  if (msg?.type === 'cmd' && COMMANDS.includes(msg.command)) return vscode.commands.executeCommand(msg.command);
  if (msg?.type !== 'save' || typeof msg.changes !== 'object') return;
  const global = vscode.ConfigurationTarget.Global;
  const keys = Object.keys(msg.changes).filter(k => SETTABLE.includes(k));
  for (const key of keys) {
    let value = msg.changes[key];
    if (typeof value === 'string') value = value.trim();
    if (key === 'userName' && !value) continue;
    await cfg().update(key, value === '' ? undefined : value, global);
  }
  // Picking a built-in character drops a custom image/model, which would be shown instead.
  if (keys.some(k => k === 'characterGender' || k === 'characterStyle') && !keys.includes('character') && cfg().get<string>('character', '')) {
    await cfg().update('character', undefined, global);
  }
  // Reload so every part (pop-up, timer, panel) starts fresh with the new settings.
  if (keys.length) await vscode.commands.executeCommand('workbench.action.reloadWindow');
}

/** Sends the settings, today's count and the countdown to the sidebar panel. */
function postState(context: vscode.ExtensionContext) {
  if (!view?.visible) return;
  const c = cfg();
  const today = day();
  view.webview.postMessage({
    type: 'state',
    state: {
      userName: userName(),
      theme: c.get<string>('theme', 'darkOcean'),
      viewMode: c.get<string>('viewMode', 'normal'),
      intervalMinutes: interval(),
      snoozeMinutes: c.get<number>('snoozeMinutes', 10),
      noReplySeconds: c.get<number>('noReplySeconds', 60),
      dailyGoal: goal(),
      glassSizeMl: c.get<number>('glassSizeMl', 250),
      characterGender: gender() || 'male',
      characterStyle: c.get<string>('characterStyle', 'realistic'),
      popupStyle: c.get<string>('popupStyle', 'overlay'),
      overlayPosition: c.get<string>('overlayPosition', 'bottom-left'),
      pauseWhenBusy: c.get<boolean>('pauseWhenBusy', true),
      pauseWhenAway: c.get<boolean>('pauseWhenAway', true),
      quietHours: c.get<boolean>('quietHours', true),
      quietHoursStart: c.get<number>('quietHoursStart', 22),
      quietHoursEnd: c.get<number>('quietHoursEnd', 8),
      character: path.basename(c.get<string>('character', '')),
      count: today.glasses,
      missed: today.missed,
      litres: litres(today.glasses),
      goalLitres: litres(goal()),
      paused: pausedUntil() > Date.now(),
      week: week(),
      streak: streak(),
      nextAt,
      pausedFor: pausedFor || holdReason(),
    },
  });
}

/** The last 7 days, oldest first. */
function week() {
  const all = history();
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - 6 + i);
    return { label: d.toLocaleDateString([], { weekday: 'short' }), glasses: 0, missed: 0, ...all[dayKey(d)] };
  });
}

/** Days in a row the goal was reached, up to today (today counts once it's reached). */
function streak(): number {
  const all = history();
  const d = new Date();
  let n = (all[dayKey(d)]?.glasses ?? 0) >= goal() ? 1 : 0;
  for (;;) {
    d.setDate(d.getDate() - 1);
    if ((all[dayKey(d)]?.glasses ?? 0) < goal()) return n;
    n++;
  }
}

function updateStatus(context: vscode.ExtensionContext) {
  const { glasses, missed } = day();
  const hold = pausedFor || holdReason();
  statusItem.text = `💧 ${glasses}/${goal()}${hold ? ' ⏸' : ''}`;
  const pauseLink = pausedUntil() > Date.now()
    ? '[Resume](command:waterReminder.resume)'
    : '[Pause](command:waterReminder.pause)';
  const tip = new vscode.MarkdownString(
    `**💧 Water Reminder**${hold ? `: on hold (${hold}); it will pop up once that's over` : ''}\n\n` +
      `${litres(glasses)} of ${litres(goal())} L today${missed ? ` · ${missed} reminder${missed === 1 ? '' : 's'} missed` : ''}\n\n` +
      `[Remind me now](command:waterReminder.showNow) · [+1 glass](command:waterReminder.logGlass) · ${pauseLink} · [Settings](command:waterReminder.openSettings)\n\n` +
      'Click to open the panel.'
  );
  tip.isTrusted = {
    enabledCommands: ['waterReminder.showNow', 'waterReminder.logGlass', 'waterReminder.pause', 'waterReminder.resume', 'waterReminder.openSettings'],
  };
  statusItem.tooltip = tip;
  postState(context);
}

/** Runs a host program (outside the VS Code snap) and returns its stdout, or '' if it fails. */
function run(cmd: string, args: string[]): Promise<string> {
  return new Promise(resolve =>
    execFile(cmd, args, { env: hostEnv(), timeout: 3000, maxBuffer: 16 << 20 }, (err, out) => resolve(err ? '' : out))
  );
}

/** True if any process has a webcam (/dev/video*) open, e.g. Zoom or a browser in a video call. */
async function cameraOpen(): Promise<boolean> {
  const pids = (await fs.promises.readdir('/proc')).filter(d => /^\d+$/.test(d));
  for (const pid of pids) {
    let fds: string[];
    try {
      fds = await fs.promises.readdir(`/proc/${pid}/fd`);
    } catch {
      continue;
    }
    for (const fd of fds) {
      try {
        if ((await fs.promises.readlink(`/proc/${pid}/fd/${fd}`)).startsWith('/dev/video')) return true;
      } catch {
        // the fd closed meanwhile
      }
    }
  }
  return false;
}

/** 'screen is locked' or 'you're away' (no keyboard or mouse for `awayMinutes`) on GNOME, else ''. */
async function awayReason(): Promise<string> {
  if (process.platform !== 'linux' || !cfg().get<boolean>('pauseWhenAway', true)) return '';
  const call = (dest: string, obj: string, method: string) =>
    run('gdbus', ['call', '--session', '--dest', dest, '--object-path', obj, '--method', `${dest}.${method}`]);
  const [locked, idle] = await Promise.all([
    call('org.gnome.ScreenSaver', '/org/gnome/ScreenSaver', 'GetActive'),
    call('org.gnome.Mutter.IdleMonitor', '/org/gnome/Mutter/IdleMonitor/Core', 'GetIdletime'),
  ]);
  if (locked.includes('true')) return 'screen is locked';
  // "(uint64 6019,)": milliseconds since the last key press or mouse move
  const idleMs = Number(/uint64 (\d+)/.exec(idle)?.[1] ?? 0);
  const awayMinutes = cfg().get<number>('awayMinutes', 5);
  if (awayMinutes > 0 && idleMs >= awayMinutes * 60_000) return "you're away";
  return '';
}

/**
 * Why the reminder shouldn't pop up right now, or '' if it can (Linux only).
 * Screen sharing (any app, via the GNOME/PipeWire screencast), a microphone or camera in use
 * (a call or meeting, even when muted), or GNOME's Do Not Disturb; or you're away (see awayReason).
 */
async function busyReason(): Promise<string> {
  const away = await awayReason();
  if (away) return away;
  if (process.platform !== 'linux' || !cfg().get<boolean>('pauseWhenBusy', true)) return '';
  const [dump, banners, camera] = await Promise.all([
    run('pw-dump', []),
    run('gsettings', ['get', 'org.gnome.desktop.notifications', 'show-banners']),
    cameraOpen().catch(() => false),
  ]);
  if (banners.trim() === 'false') return 'Do Not Disturb is on';
  let nodes: any[] = [];
  try {
    nodes = JSON.parse(dump);
  } catch {
    // PipeWire not available
  }
  for (const n of nodes) {
    if (n?.type !== 'PipeWire:Interface:Node') continue;
    const p = n.info?.props ?? {};
    const cls: string = p['media.class'] ?? '';
    if (p['media.name'] === 'meta-screen-cast-src' || cls === 'Stream/Output/Video') return 'screen sharing';
    if (cls === 'Stream/Input/Video') return 'screen sharing or camera in use';
    if (cls === 'Stream/Input/Audio') return 'microphone in use (call or meeting)';
    if (cls === 'Video/Source' && n.info?.state === 'running') return 'camera in use';
  }
  return camera ? 'camera in use' : '';
}

type Realistic = { model: string; clips: Record<string, string>; starts: Record<string, number> };
type Assets = { img: string; three?: string; avatar?: string; model?: string; turn?: number; look?: string; realistic?: Realistic };

/** Motion clips shipped for each realistic character (media/realistic/<gender>/<clip>.glb). */
const REALISTIC_CLIPS = ['run', 'stop', 'idle', 'drink', 'wave', 'sad', 'walk'];
/** Seconds into each clip where its gesture peaks (the reminder's acts are short, so the lead-in is skipped). */
const REALISTIC_STARTS: Record<string, Record<string, number>> = {
  female: { wave: 0.7, drink: 2.2 },
  male: { wave: 0.3, drink: 3.6 },
};

/** The character file chosen in settings (an image or a .glb/.gltf model), if it exists. */
function userCharacter(): vscode.Uri | undefined {
  const p = cfg().get<string>('character', '').trim();
  return p && fs.existsSync(p) ? vscode.Uri.file(p) : undefined;
}
const isModel = (u: vscode.Uri) => /\.(glb|gltf)$/i.test(u.fsPath);

async function chooseCharacter(context: vscode.ExtensionContext, schedule: (m: number) => void) {
  const picked = await vscode.window.showOpenDialog({
    title: 'Choose your character',
    canSelectMany: false,
    filters: { 'Image or 3D model': ['png', 'webp', 'gif', 'glb', 'gltf'] },
  });
  if (!picked?.length) return;
  await cfg().update('character', picked[0].fsPath, vscode.ConfigurationTarget.Global);
  const show = await vscode.window.showInformationMessage(`Character set to ${path.basename(picked[0].fsPath)}.`, 'Show now');
  if (show) showReminder(context, schedule);
}

/**
 * Picks what the pop-up shows: your chosen image or .glb model, else a media/character.gif|png,
 * else the built-in 3D avatar (falling back to the SVG without WebGL).
 */
function pageAssets(context: vscode.ExtensionContext, toUri: (u: vscode.Uri) => string): Assets {
  const mine = userCharacter();
  if (mine && !isModel(mine)) return { img: toUri(mine) };
  const img = characterFile(context);
  if (!mine && !img.fsPath.endsWith('.svg')) return { img: toUri(img) };
  const media = (...p: string[]) => toUri(vscode.Uri.joinPath(context.extensionUri, 'media', ...p));
  return {
    img: media('character.svg'),
    three: media('vendor', 'three.bundle.js'),
    avatar: media('avatar3d.js'),
    model: mine && toUri(mine),
    turn: cfg().get<number>('characterModelTurn', 0),
    look: gender() || 'male',
    realistic: !mine && cfg().get<string>('characterStyle', 'realistic') === 'realistic' ? realisticAssets(context, media) : undefined,
  };
}

/** The realistic character for the chosen gender, if its files are installed. */
function realisticAssets(context: vscode.ExtensionContext, media: (...p: string[]) => string): Realistic | undefined {
  const g = gender() || 'male';
  if (!fs.existsSync(vscode.Uri.joinPath(context.extensionUri, 'media', 'realistic', g, 'avatar.glb').fsPath)) return undefined;
  const clips: Record<string, string> = {};
  for (const c of REALISTIC_CLIPS) clips[c] = media('realistic', g, `${c}.glb`);
  return { model: media('realistic', g, 'avatar.glb'), clips, starts: REALISTIC_STARTS[g] ?? {} };
}

/** Uses media/character.gif or .png if you add one, otherwise the bundled SVG. */
function characterFile(context: vscode.ExtensionContext): vscode.Uri {
  for (const name of ['character.gif', 'character.png', 'character.svg']) {
    const uri = vscode.Uri.joinPath(context.extensionUri, 'media', name);
    if (fs.existsSync(uri.fsPath)) return uri;
  }
  return vscode.Uri.joinPath(context.extensionUri, 'media', 'character.svg');
}

/** `manual`: you asked for it (command / status bar), so it shows even if you're busy. */
function showReminder(context: vscode.ExtensionContext, schedule: (m: number) => void, manual = true) {
  let answered = false;
  let watch: NodeJS.Timeout | undefined;
  const onAnswer = async (type: string) => {
    if (answered) return;
    answered = true;
    clearInterval(watch);
    if (type === 'busy') {
      // hidden because a screen share or meeting started: try again once it's over
      schedule(BUSY_RETRY_MINUTES);
    } else if (type === 'yes') {
      await logGlass(context);
      schedule(interval());
    } else {
      // no answer in time counts as No, and as a missed reminder
      if (type === 'timeout') {
        setDay({ missed: day().missed + 1 });
        updateStatus(context);
      }
      schedule(cfg().get<number>('snoozeMinutes', 10));
    }
  };

  if (overlay) return;
  if (panel) {
    panel.reveal();
    return;
  }
  let hide: () => void;
  if (cfg().get<string>('popupStyle', 'overlay') === 'overlay' && process.platform === 'linux') {
    hide = showOverlay(context, onAnswer, () => (hide = showPanel(context, onAnswer)));
  } else {
    hide = showPanel(context, onAnswer);
  }

  // If a screen share or meeting starts while it's up, take it down at once.
  // One you opened yourself while already busy stays.
  const busyAtStart = manual ? busyReason() : Promise.resolve('');
  watch = setInterval(async () => {
    const [before, now] = await Promise.all([busyAtStart, busyReason()]);
    if (now && !before && !answered) {
      pausedFor = now;
      updateStatus(context);
      hide();
    }
  }, 2000);
}

/**
 * VS Code installed as a snap leaks its bundled GTK/libc paths into child processes,
 * which crashes the system python3. Drop those and restore the values the snap saved.
 */
function hostEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  if (!env.SNAP) return env;
  for (const [k, v] of Object.entries(process.env)) {
    if (k !== 'PATH' && v?.includes('/snap/')) delete env[k];
  }
  for (const [k, v] of Object.entries(process.env)) {
    if (!k.endsWith('_VSCODE_SNAP_ORIG')) continue;
    const orig = k.slice(0, -'_VSCODE_SNAP_ORIG'.length);
    if (v) env[orig] = v;
    else delete env[orig];
    delete env[k];
  }
  return env;
}

/** Floating transparent window on the desktop; calls `fallback` if it can't be shown. Returns a function that hides it. */
function showOverlay(context: vscode.ExtensionContext, onAnswer: (t: string) => void, fallback: () => void): () => void {
  const script = vscode.Uri.joinPath(context.extensionUri, 'overlay', 'overlay.py').fsPath;
  const proc = spawn('python3', [script], { stdio: ['pipe', 'pipe', 'pipe'], env: hostEnv() });
  overlay = proc;

  let out = '';
  let err = '';
  let done = false;
  let hidden = false;
  const finish = (failed: boolean) => {
    if (done) return;
    done = true;
    overlay = undefined;
    const reply = out.trim().split('\n').pop();
    if (hidden) onAnswer('busy');
    else if (reply === 'yes' || reply === 'later' || reply === 'timeout') onAnswer(reply);
    else if (failed) {
      console.error(`Water Reminder overlay unavailable, using a tab instead: ${err}`);
      fallback();
    } else onAnswer('later');
  };

  proc.stdout.on('data', d => (out += d));
  proc.stderr.on('data', d => (err += d));
  proc.on('error', e => {
    err += String(e);
    finish(true);
  });
  proc.on('close', code => finish(code !== 0));
  proc.stdin.end(
    JSON.stringify({
      html: getHtml(pageAssets(context, u => u.toString()), userName() || 'friend', { overlay: true }),
      baseUri: vscode.Uri.joinPath(context.extensionUri, 'media').toString() + '/',
      width: compact() ? 290 : 360,
      height: compact() ? 410 : 530,
      position: cfg().get<string>('overlayPosition', 'bottom-left'),
    })
  );
  return () => {
    hidden = true;
    proc.kill();
  };
}

/** Editor tab fallback (other platforms, or when the overlay can't start). Returns a function that hides it. */
function showPanel(context: vscode.ExtensionContext, onAnswer: (t: string) => void): () => void {
  panel = vscode.window.createWebviewPanel(
    'waterReminder',
    '💧 Hydration Check',
    { viewColumn: vscode.ViewColumn.Active, preserveFocus: false },
    {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(context.extensionUri, 'media'),
        ...(userCharacter() ? [vscode.Uri.file(path.dirname(userCharacter()!.fsPath))] : []),
      ],
    }
  );

  const webview = panel.webview;
  webview.html = getHtml(pageAssets(context, u => webview.asWebviewUri(u).toString()), userName() || 'friend', { csp: panel.webview.cspSource });

  let answered = false;
  panel.webview.onDidReceiveMessage(msg => {
    answered = true;
    onAnswer(msg.type);
    panel?.dispose();
  });

  panel.onDidDispose(() => {
    panel = undefined;
    // Closing the tab without answering counts as "remind me later".
    if (!answered) onAnswer('later');
  });
  return () => {
    answered = true;
    onAnswer('busy');
    panel?.dispose();
  };
}

function getHtml(assets: Assets, name: string, opts: { csp?: string; overlay?: boolean }): string {
  const safeName = name.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
  const t = theme(cfg().get<string>('theme', 'darkOcean'));
  const small = compact();
  const csp = opts.csp
    ? `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${opts.csp} data: blob:; connect-src ${opts.csp} data: blob:; style-src 'unsafe-inline'; script-src ${opts.csp} 'unsafe-inline';">`
    : '';
  return /* html */ `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
${csp}
<style>
  html, body { height: 100%; margin: 0; }
  body {
    display: flex; flex-direction: column; align-items: center; justify-content: ${opts.overlay ? 'flex-end' : 'center'};
    background: ${opts.overlay ? 'transparent' : 'var(--vscode-editor-background)'};
    font-family: system-ui, sans-serif; overflow: hidden; user-select: none;
  }
  .prompt {
    padding: ${small ? '10px 14px 9px' : '14px 18px 12px'}; border: 1px solid ${t.bubbleBorder}; border-radius: 20px;
    background: linear-gradient(145deg, ${t.bubble[0]}, ${t.bubble[1]});
    box-shadow: 0 12px 32px rgba(0,0,0,.36), inset 0 1px rgba(255,255,255,.1);
    backdrop-filter: blur(8px); opacity: 0; transform: translateY(-12px) scale(.92); pointer-events: none;
    transition: opacity .32s ease, transform .32s cubic-bezier(.2, 1.5, .4, 1);
  }
  body.ready .prompt { opacity: 1; transform: none; pointer-events: auto; }
  h1 {
    margin: 0 0 9px; text-align: center; font-size: ${small ? 16 : 21}px; line-height: 1.2; color: ${t.heading};
    text-shadow: 0 2px 10px ${t.glow};
  }
  .btns { display: flex; justify-content: center; gap: 10px; }
  button {
    padding: 8px 17px; border-radius: 9px; border: 1px solid #ccc; background: #fff; color: #333;
    font-size: 13px; cursor: pointer; transition: transform .1s, box-shadow .1s; box-shadow: 0 2px 8px rgba(0,0,0,.25);
  }
  button:hover { transform: translateY(-1px) scale(1.03); box-shadow: 0 5px 12px rgba(0,0,0,.3); }
  button.yes { background: ${t.yes}; color: #fff; border-color: ${t.yes}; font-weight: 600; }
  body.acting .btns { display: none; }
  /* wide stage so the character can run in from the side */
  .char {
    height: ${opts.overlay ? (small ? '220px' : '300px') : small ? '40vh' : '58vh'}; width: ${opts.overlay ? '100%' : small ? 'min(100%, 52vh)' : 'min(100%, 75vh)'};
    display: flex; justify-content: center; flex: 0 0 auto;
    animation: runIn 1.4s ease-out both;
  }
  .char img { height: 100%; animation: bob 2.2s ease-in-out 1.4s infinite; }
  .char.is3d { animation: none; }
  /* the same acts for a flat image character (the 3D one is animated by avatar3d.js) */
  .char.give { animation: none; transform: scale(1.18) translateY(-4%); transition: transform .5s cubic-bezier(.2, 1.4, .4, 1); }
  .char.wave { animation: none; transform: scale(1.05); transition: transform .4s; }
  .char.wave img { animation: wave .3s ease-in-out infinite alternate; }
  .char.goodbye {
    animation: none; transform: translateX(140%); opacity: 0;
    transition: transform 1.4s ease-in, opacity 1.4s ease-in;
  }
  .char.sad { animation: none; filter: grayscale(.6) brightness(.85); transform: rotate(-4deg) translateY(3%); transition: all .8s; }
  .char.leave {
    animation: none; filter: grayscale(.6) brightness(.85); transform: translateX(-140%); opacity: 0;
    transition: transform 3s linear, opacity 3s ease-in;
  }
  .char.sad img, .char.leave img { animation: bob 1.4s ease-in-out infinite; }
  @keyframes runIn {
    0% { transform: translateX(-130%) }
    55% { transform: translateX(10%) rotate(10deg) }
    65% { transform: translateX(4%) rotate(-12deg) }
    75% { transform: translateX(0) rotate(7deg) }
    87% { transform: rotate(-3deg) }
    100% { transform: none }
  }
  @keyframes bob { 50% { transform: translateY(-10px) rotate(-1.5deg) } }
  @keyframes wave { from { transform: rotate(-6deg) } to { transform: rotate(6deg) } }
</style>
</head>
<body>
  <div class="prompt">
    <h1 id="msg">Hey, ${safeName}<br>Did you drink water?</h1>
    <div class="btns">
      <button class="yes" onclick="send('yes')">YES</button>
      <button onclick="send('later')" title="Remind me later">NO</button>
    </div>
  </div>
  <div class="char" id="char"><img src="${assets.img}" alt="character holding a water bottle"></div>
  ${assets.three ? `<script src="${assets.three}"></script><script src="${assets.avatar}"></script>` : ''}
  <script>
    const vscode = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : null;
    const box = document.getElementById('char');
    let noReply;
    const ready = () => {
      document.body.classList.add('ready');
      // No click in time: same goodbye as NO (reported as a missed reminder).
      if (lines.noReplySeconds > 0 && !noReply) noReply = setTimeout(() => send('timeout'), lines.noReplySeconds * 1000);
    };
    const lines = ${JSON.stringify({
      drinkText: `Cheers, ${name}! Let’s both drink 💧`,
      sadText: 'Okay… I’ll come back later 😢',
      byeText: 'Bye bye! 👋',
      noReplySeconds: cfg().get<number>('noReplySeconds', 60),
    }).replace(/</g, '\\u003c')};
    // The image character only enters once its run-in animation is done.
    const imgReady = () => setTimeout(ready, 1400);
    let is3d = false;
    try {
      // Swap the flat drawing for the 3D avatar when WebGL is available.
      if (window.mountAvatar) {
        box.querySelector('img').style.display = 'none';
        is3d = mountAvatar(box, Object.assign(${JSON.stringify({ model: assets.model, turn: assets.turn, look: assets.look, realistic: assets.realistic }).replace(/</g, "\\u003c")}, lines), ready);
        if (is3d) box.classList.add('is3d');
        else { box.querySelector('img').style.display = ''; imgReady(); }
      } else {
        imgReady();
      }
    } catch (e) {
      box.querySelector('img').style.display = '';
      imgReady();
    }

    const msg = document.getElementById('msg');
    function say(text) {
      if (!text) return document.body.classList.remove('ready');
      msg.textContent = text;
      msg.animate([{ transform: 'scale(.7)' }, { transform: 'scale(1)' }], { duration: 300, easing: 'cubic-bezier(.2, 1.6, .4, 1)' });
    }
    /** Image character: the same acts as the 3D one, done with CSS classes. */
    function imgReact(type, done) {
      const steps = type === 'yes'
        ? [[0, 'give', lines.drinkText], [2800, 'wave', lines.byeText], [4300, 'goodbye'], [5800]]
        : [[0, 'sad', lines.sadText], [1000, 'leave'], [4200]];
      for (const [ms, cls, text] of steps) setTimeout(() => {
        if (!cls) return done();
        box.className = 'char ' + cls;
        if (text) say(text);
      }, ms);
    }

    let sent = false;
    function send(type) {
      if (sent) return;
      sent = true;
      clearTimeout(noReply);
      document.body.classList.add('acting');
      // Report the answer only after the goodbye: the overlay window closes as soon as it gets it.
      const done = () => {
        say('');
        setTimeout(() => vscode
          ? vscode.postMessage({ type })
          : window.webkit.messageHandlers.reply.postMessage(type), 300);
      };
      if (is3d && window.avatarReact) avatarReact(type, { say, done });
      else imgReact(type, done);
    }
  </script>
</body>
</html>`;
}

export function deactivate() {
  if (timer) clearTimeout(timer);
  overlay?.kill();
}
