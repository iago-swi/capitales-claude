/**
 * Electron main process for the Windows build.
 *
 * The API server runs *inside* this process rather than as a spawned child.
 * That is possible because apps/server is a plain Node module with no browser
 * dependency, and it buys three things: one process to supervise, no port
 * negotiation with a child, and no orphaned server if the window is killed.
 *
 * The same server also serves the built web assets, so the renderer talks to a
 * single origin and the client's relative /api paths work with no proxy and no
 * CORS — exactly as they do behind Vite in development.
 */
import path from 'node:path';
import {
  app,
  BrowserWindow,
  Menu,
  screen,
  shell,
  type BrowserWindowConstructorOptions,
} from 'electron';
import { startHost, type RunningHost } from '@capitales/server';
import capitals from '@capitales/data/capitals.json';
import type { CountryRecord } from '@capitales/core';

const WINDOW_STATE_FILE = 'window-state.json';

/**
 * Below this the two-column survey layout stops making sense; the stylesheet
 * folds to one column at 940px, so the window is never allowed to fight it.
 */
const MIN_WIDTH = 880;
const MIN_HEIGHT = 600;

/** Comfortable size on a laptop, never larger than the screen allows. */
const PREFERRED_WIDTH = 1280;
const PREFERRED_HEIGHT = 800;

/** Breathing room left around the window on first launch. */
const SCREEN_MARGIN = 60;

let host: RunningHost | undefined;
let win: BrowserWindow | undefined;

/**
 * The database lives in the user's app-data directory, never beside the
 * executable. An installed app cannot write next to its own binary, and
 * anything under the install directory is wiped by the next update — which
 * would take the high scores with it.
 */
function databasePath(): string {
  return path.join(app.getPath('userData'), 'capitales.db');
}

function windowStatePath(): string {
  return path.join(app.getPath('userData'), WINDOW_STATE_FILE);
}

interface WindowState {
  width: number;
  height: number;
  x?: number;
  y?: number;
  maximized?: boolean;
}

/**
 * A window that fits the screen it will actually appear on.
 *
 * Everything is clamped to the work area — the desktop minus the taskbar — so
 * neither the default size nor a size remembered from a larger monitor can
 * produce a window taller than the display.
 */
async function readWindowState(): Promise<WindowState> {
  const { width: availW, height: availH } = screen.getPrimaryDisplay().workAreaSize;

  const maxW = Math.max(MIN_WIDTH, availW - SCREEN_MARGIN);
  const maxH = Math.max(MIN_HEIGHT, availH - SCREEN_MARGIN);
  const fit = (value: number, min: number, max: number) =>
    Math.round(Math.min(Math.max(value, min), max));

  const fallback: WindowState = {
    width: fit(PREFERRED_WIDTH, MIN_WIDTH, maxW),
    height: fit(PREFERRED_HEIGHT, MIN_HEIGHT, maxH),
  };

  try {
    const { readFile } = await import('node:fs/promises');
    const raw = await readFile(windowStatePath(), 'utf8');
    const saved = JSON.parse(raw) as Partial<WindowState>;
    return {
      width: fit(saved.width ?? fallback.width, MIN_WIDTH, maxW),
      height: fit(saved.height ?? fallback.height, MIN_HEIGHT, maxH),
      x: saved.x,
      y: saved.y,
      maximized: saved.maximized,
    };
  } catch {
    return fallback;
  }
}

async function saveWindowState(): Promise<void> {
  if (!win || win.isDestroyed()) return;
  const bounds = win.getNormalBounds();
  const state: WindowState = {
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    maximized: win.isMaximized(),
  };
  try {
    const { writeFile } = await import('node:fs/promises');
    await writeFile(windowStatePath(), JSON.stringify(state), 'utf8');
  } catch {
    // Remembering the window is a courtesy, not a feature worth crashing over.
  }
}

function buildMenu(): void {
  const template: Parameters<typeof Menu.buildFromTemplate>[0] = [
    {
      label: 'Capitales',
      submenu: [
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

async function createWindow(): Promise<void> {
  const state = await readWindowState();

  const options: BrowserWindowConstructorOptions = {
    width: state.width,
    height: state.height,
    x: state.x,
    y: state.y,
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    // Matches --abyss so the frame does not flash white before first paint.
    backgroundColor: '#0a1628',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      // The renderer is an ordinary web page talking to localhost over HTTP.
      // It needs no Node access, so it does not get any.
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  };

  win = new BrowserWindow(options);
  if (state.maximized) win.maximize();

  win.once('ready-to-show', () => win?.show());
  win.on('close', () => void saveWindowState());
  win.on('closed', () => {
    win = undefined;
  });

  // Anything that is not this app opens in the real browser, never in-frame.
  win.webContents.setWindowOpenHandler(({ url }: { url: string }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  await win.loadURL(host?.origin ?? 'about:blank');
}

async function boot(): Promise<void> {
  host = await startHost({
    dbPath: databasePath(),
    // Bundled next to the compiled main process by the build step.
    staticDir: path.join(__dirname, 'web'),
    // 0 = let the OS choose. A fixed port would collide with a dev server.
    port: 0,
    seedIfEmpty: capitals as unknown as CountryRecord[],
  });

  buildMenu();
  await createWindow();
}

// One instance only: two windows on one SQLite file is a needless race.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });

  app.whenReady().then(boot).catch((error: unknown) => {
    console.error('failed to start:', error);
    app.quit();
  });

  app.on('window-all-closed', () => {
    app.quit();
  });

  app.on('before-quit', () => {
    void host?.close();
  });
}
