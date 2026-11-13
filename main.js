const { app, BrowserWindow, ipcMain, dialog, clipboard, nativeImage, shell } = require('electron');
const path = require('path');
const fs = require('fs/promises');

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 980,
    minHeight: 680,
    title: 'COOL Code',
    backgroundColor: '#0f1115',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // Open external links in the default browser, never inside the app
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

// Save exported QR code to disk via native dialog
ipcMain.handle('qr:save', async (_e, { buffer, defaultName, ext }) => {
  const filters = {
    png: [{ name: 'PNG Image', extensions: ['png'] }],
    svg: [{ name: 'SVG Vector', extensions: ['svg'] }],
    jpeg: [{ name: 'JPEG Image', extensions: ['jpg', 'jpeg'] }],
    webp: [{ name: 'WebP Image', extensions: ['webp'] }],
    json: [{ name: 'COOL Code Design', extensions: ['json'] }],
  }[ext];
  const { canceled, filePath } = await dialog.showSaveDialog({
    defaultPath: defaultName,
    filters,
  });
  if (canceled || !filePath) return { ok: false };
  await fs.writeFile(filePath, Buffer.from(buffer));
  return { ok: true, filePath };
});

// Open a design JSON file
ipcMain.handle('qr:openDesign', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'COOL Code Design', extensions: ['json'] }],
  });
  if (canceled || !filePaths.length) return null;
  return fs.readFile(filePaths[0], 'utf8');
});

// Copy PNG to clipboard
ipcMain.handle('qr:copy', async (_e, { buffer }) => {
  const img = nativeImage.createFromBuffer(Buffer.from(buffer));
  clipboard.writeImage(img);
  return true;
});

// Scan-checker decoder (ZXing compiled to WebAssembly), handed to the page as bytes
ipcMain.handle('zxing:wasm', async () => {
  const file = path.join(__dirname, 'node_modules', 'zxing-wasm', 'dist', 'reader', 'zxing_reader.wasm');
  return new Uint8Array(await fs.readFile(file));
});

ipcMain.handle('qr:reveal', (_e, filePath) => shell.showItemInFolder(filePath));

// ------------------------------------------------------------------
// Small JSON stores in the user's app-data folder
// ------------------------------------------------------------------
const dataFile = (name) => path.join(app.getPath('userData'), name);
async function readJson(name, fallback) {
  try { return JSON.parse(await fs.readFile(dataFile(name), 'utf8')); } catch { return fallback; }
}
async function writeJson(name, value) {
  await fs.mkdir(app.getPath('userData'), { recursive: true });
  await fs.writeFile(dataFile(name), JSON.stringify(value));
}

// Tracking service address baked into this build. No secrets ship in the app:
// people sign in with their Google Workspace account instead.
let BUILD_DEFAULTS = { serverUrl: '' };
try { BUILD_DEFAULTS = { ...BUILD_DEFAULTS, ...require('./tracking.defaults.json') }; } catch { /* none */ }
delete BUILD_DEFAULTS.key;

async function getSettings() {
  const saved = await readJson('settings.json', {});
  return { serverUrl: (saved.serverUrl || BUILD_DEFAULTS.serverUrl || '').replace(/\/+$/, '') };
}

ipcMain.handle('settings:get', async () => getSettings());
ipcMain.handle('settings:set', async (_e, { serverUrl }) => {
  const cur = await readJson('settings.json', {});
  if (typeof serverUrl === 'string') cur.serverUrl = serverUrl.trim().replace(/\/+$/, '');
  await writeJson('settings.json', cur);
  return true;
});

async function rawApi(serverUrl, payload, headers = {}) {
  if (!serverUrl) return { error: 'No tracking service is set. Open Settings (gear icon).' };
  try {
    const res = await fetch(`${serverUrl}/api`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(20000),
    });
    const body = await res.json().catch(() => ({ error: `Unexpected response (${res.status})` }));
    if (!res.ok && !body.error) body.error = `Request failed (${res.status})`;
    body.__status = res.status;
    return body;
  } catch (err) {
    return { error: err.name === 'TimeoutError' ? 'The tracking service took too long to answer.' : 'Can’t reach the tracking service. Check your internet connection.', __status: 0 };
  }
}

// ------------------------------------------------------------------
// Google sign-in (OAuth 2.0 for desktop apps: system browser + loopback + PKCE)
// The refresh token is encrypted with the OS keychain (safeStorage).
// ------------------------------------------------------------------
const crypto = require('crypto');
const http = require('http');
const { safeStorage } = require('electron');

let session = null;       // { user, refreshToken }
let idToken = null;       // { token, exp }
let signInAbort = null;

const b64url = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function saveSession() {
  if (!session) { await fs.rm(dataFile('session.bin'), { force: true }); return; }
  const raw = JSON.stringify(session);
  const enc = safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(raw) : Buffer.from(raw);
  await fs.mkdir(app.getPath('userData'), { recursive: true });
  await fs.writeFile(dataFile('session.bin'), enc);
}
async function loadSession() {
  try {
    const buf = await fs.readFile(dataFile('session.bin'));
    session = JSON.parse(safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(buf) : buf.toString());
  } catch { session = null; }
}

function acceptTokens(r) {
  idToken = { token: r.id_token, exp: Date.now() + (Number(r.expires_in) || 3600) * 1000 };
  session = { user: r.user, refreshToken: r.refresh_token || session?.refreshToken || null };
}

async function getIdToken() {
  if (idToken && idToken.exp - Date.now() > 120000) return idToken.token;
  if (!session?.refreshToken) return null;
  const { serverUrl } = await getSettings();
  const r = await rawApi(serverUrl, { action: 'auth_refresh', refresh_token: session.refreshToken });
  if (r.error) {
    if (r.__status === 401 || r.__status === 403) { session = null; idToken = null; await saveSession(); }
    throw Object.assign(new Error(r.error), { status: r.__status });
  }
  acceptTokens(r);
  await saveSession();
  return idToken.token;
}

let authDomain = '';
ipcMain.handle('auth:status', async () => {
  if (!authDomain) {
    const { serverUrl } = await getSettings();
    const cfg = await rawApi(serverUrl, { action: 'auth_config' });
    authDomain = cfg.domain || '';
  }
  if (!session) await loadSession();
  if (!session) return { signedIn: false, domain: authDomain, googleReady: await googleReady() };
  if (session.mode === 'key') {
    // Re-check the key and refresh the person's details
    const { serverUrl } = await getSettings();
    const r = await rawApi(serverUrl, { action: 'me' }, { 'x-cool-key': session.key });
    if (r.ok) { session.user = r.user; await saveSession(); return { signedIn: true, user: r.user, domain: authDomain }; }
    if (r.__status === 401) { session = null; await saveSession(); return { signedIn: false, error: 'That access key no longer works.', domain: authDomain }; }
    return { signedIn: true, user: session.user, offline: true, domain: authDomain };
  }
  try {
    await getIdToken();
    return { signedIn: true, user: session.user, domain: authDomain };
  } catch (e) {
    // Offline: keep the person signed in with their last known identity
    if (session) return { signedIn: true, user: session.user, offline: true };
    return { signedIn: false, error: e.message };
  }
});

async function googleReady() {
  const { serverUrl } = await getSettings();
  const cfg = await rawApi(serverUrl, { action: 'auth_config' });
  return !!cfg.ready;
}

ipcMain.handle('auth:cancel', () => { signInAbort?.(); });

// Interim sign-in with a personal access key (until Google sign-in is switched on)
ipcMain.handle('auth:signInWithKey', async (_e, key) => {
  key = String(key || '').trim();
  if (key.length < 20) return { error: 'That doesn’t look like a COOL Code access key.' };
  const { serverUrl } = await getSettings();
  const r = await rawApi(serverUrl, { action: 'me' }, { 'x-cool-key': key });
  if (!r.ok) return { error: r.__status === 401 ? 'That access key isn’t valid.' : (r.error || 'Couldn’t check the key.') };
  session = { mode: 'key', key, user: r.user };
  idToken = null;
  await saveSession();
  return { user: r.user };
});

ipcMain.handle('auth:signIn', async () => {
  const { serverUrl } = await getSettings();
  const cfg = await rawApi(serverUrl, { action: 'auth_config' });
  if (cfg.error) return { error: cfg.error };
  if (!cfg.ready) return { error: 'Google sign-in isn’t switched on for COOL Code yet. Ask your COOL Code admin.' };

  const verifier = b64url(crypto.randomBytes(48));
  const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
  const state = b64url(crypto.randomBytes(16));

  let server;
  try {
    const result = await new Promise((resolve, reject) => {
      server = http.createServer((req, res) => {
        const u = new URL(req.url, 'http://127.0.0.1');
        if (u.pathname !== '/') { res.writeHead(404); res.end(); return; }
        const done = (ok, msg) => {
          res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
          res.end(`<!doctype html><meta charset="utf-8"><title>COOL Code</title>
<body style="font-family:-apple-system,system-ui,sans-serif;background:#0f1115;color:#e8eaf0;display:grid;place-items:center;height:100vh;margin:0">
<div style="text-align:center"><div style="font-size:42px">${ok ? '✓' : '✕'}</div><h2>${msg}</h2><p style="color:#8b92a5">You can close this tab and go back to COOL Code.</p></div>`);
        };
        if (u.searchParams.get('state') !== state) { done(false, 'Sign-in link didn’t match'); return reject(new Error('Sign-in was interrupted. Please try again.')); }
        if (u.searchParams.get('error')) { done(false, 'Sign-in cancelled'); return reject(new Error('Sign-in was cancelled.')); }
        done(true, 'Signed in to COOL Code');
        resolve(u.searchParams.get('code'));
      });
      server.listen(0, '127.0.0.1', () => {
        const redirect = `http://127.0.0.1:${server.address().port}`;
        server.redirect = redirect;
        const auth = new URL('https://accounts.google.com/o/oauth2/v2/auth');
        auth.search = new URLSearchParams({
          client_id: cfg.client_id,
          redirect_uri: redirect,
          response_type: 'code',
          scope: 'openid email profile',
          code_challenge: challenge,
          code_challenge_method: 'S256',
          state,
          hd: cfg.domain,                 // pre-selects Workspace accounts on the domain
          access_type: 'offline',
          prompt: 'select_account consent',
        }).toString();
        shell.openExternal(auth.toString());
      });
      const timer = setTimeout(() => reject(new Error('Sign-in timed out. Please try again.')), 5 * 60 * 1000);
      signInAbort = () => { clearTimeout(timer); reject(new Error('cancelled')); };
    });
    const r = await rawApi(serverUrl, { action: 'auth_exchange', code: result, code_verifier: verifier, redirect_uri: server.redirect });
    if (r.error) return { error: r.error };
    acceptTokens(r);
    await saveSession();
    BrowserWindow.getAllWindows()[0]?.focus();
    return { user: session.user };
  } catch (e) {
    return { error: e.message === 'cancelled' ? null : e.message };
  } finally {
    signInAbort = null;
    server?.close();
  }
});

ipcMain.handle('auth:signOut', async () => {
  session = null; idToken = null;
  await saveSession();
  return true;
});

// Calls the tracking API as the signed-in person
ipcMain.handle('api:call', async (_e, payload, override) => {
  const { serverUrl } = { ...(await getSettings()), ...(override || {}) };
  if (!session) await loadSession();
  if (session?.mode === 'key') {
    const r = await rawApi(serverUrl, payload, { 'x-cool-key': session.key });
    if (r.__status === 401) r.auth = true;
    delete r.__status;
    return r;
  }
  let token;
  try { token = await getIdToken(); } catch (e) { return { error: e.message, auth: e.status === 401 || e.status === 403 }; }
  if (!token) return { error: 'Please sign in with Google.', auth: true };
  const r = await rawApi(serverUrl, payload, { 'x-google-id-token': token });
  if (r.__status === 401) r.auth = true;
  delete r.__status;
  return r;
});

ipcMain.handle('open:external', (_e, url) => {
  if (/^https?:\/\//i.test(url)) shell.openExternal(url);
});

// ------------------------------------------------------------------
// Logo library
// ------------------------------------------------------------------
ipcMain.handle('logos:list', () => readJson('logos.json', []));
ipcMain.handle('logos:add', async (_e, { dataUrl, name }) => {
  const list = await readJson('logos.json', []);
  const existing = list.find((l) => l.dataUrl === dataUrl);
  if (existing) return list;
  list.unshift({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name: name || 'Logo', dataUrl });
  await writeJson('logos.json', list.slice(0, 40));
  return list.slice(0, 40);
});
ipcMain.handle('logos:remove', async (_e, id) => {
  const list = (await readJson('logos.json', [])).filter((l) => l.id !== id);
  await writeJson('logos.json', list);
  return list;
});

app.whenReady().then(() => {
  createWindow();
  require('./updater').init();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
