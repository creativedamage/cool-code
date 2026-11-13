// COOL Code — self-updater using GitHub Releases.
//
// macOS: downloads the new .zip, unpacks it with `ditto`, and swaps the app
// in place after COOL Code quits, then reopens it. (Apple's built-in updater
// needs a paid Developer ID certificate, so we do the swap ourselves.)
// Windows: downloads the new installer and runs it.
const { app, ipcMain, BrowserWindow, shell } = require('electron');
const path = require('path');
const fs = require('fs/promises');
const fssync = require('fs');
const { spawn } = require('child_process');

const pkg = require('./package.json');
const REPO = (pkg.build?.publish?.owner && pkg.build?.publish?.repo)
  ? `${pkg.build.publish.owner}/${pkg.build.publish.repo}`
  : 'creativedamage/cool-code';

let latest = null;        // { version, notes, url, asset }
let downloaded = null;    // path to the downloaded/extracted update
let busy = false;

const send = (ch, data) => BrowserWindow.getAllWindows().forEach((w) => w.webContents.send(ch, data));

function newer(a, b) {
  const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return true;
    if ((pa[i] || 0) < (pb[i] || 0)) return false;
  }
  return false;
}

function assetFor(assets) {
  if (process.platform === 'darwin') {
    const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
    return assets.find((a) => new RegExp(`mac-${arch}\\.zip$`).test(a.name));
  }
  if (process.platform === 'win32') return assets.find((a) => /Setup.*\.exe$/i.test(a.name));
  return null;
}

async function check({ manual = false } = {}) {
  if (busy) return { status: 'busy' };
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: { accept: 'application/vnd.github+json', 'user-agent': 'COOL-Code-updater' },
      signal: AbortSignal.timeout(15000),
    });
    if (res.status === 404) return { status: 'none' };          // no releases yet
    if (!res.ok) throw new Error(`GitHub answered ${res.status}`);
    const rel = await res.json();
    const version = String(rel.tag_name || '').replace(/^v/, '');
    const asset = assetFor(rel.assets || []);
    if (!version || !newer(version, app.getVersion()) || !asset) {
      return { status: 'current', version: app.getVersion() };
    }
    latest = { version, notes: rel.body || '', url: rel.html_url, asset };
    send('update:available', { version, notes: latest.notes, canInstall: app.isPackaged });
    return { status: 'available', version };
  } catch (e) {
    if (manual) return { status: 'error', error: 'Couldn’t check for updates. ' + e.message };
    return { status: 'error' };
  }
}

async function download() {
  const dir = path.join(app.getPath('userData'), 'updates');
  await fs.rm(dir, { recursive: true, force: true });
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, latest.asset.name);
  const res = await fetch(latest.asset.browser_download_url, { headers: { 'user-agent': 'COOL-Code-updater' } });
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  const total = Number(res.headers.get('content-length')) || latest.asset.size || 0;
  const out = fssync.createWriteStream(file);
  let got = 0, lastPct = -1;
  for await (const chunk of res.body) {
    got += chunk.length;
    if (!out.write(chunk)) await new Promise((r) => out.once('drain', r));
    const pct = total ? Math.floor((got / total) * 100) : 0;
    if (pct !== lastPct) { lastPct = pct; send('update:progress', { pct }); }
  }
  await new Promise((r, j) => out.end((e) => (e ? j(e) : r())));
  return { dir, file };
}

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: 'ignore' });
    p.on('error', reject);
    p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited with ${code}`))));
  });
}

async function install() {
  if (!latest) return { error: 'No update to install.' };
  if (!app.isPackaged) { shell.openExternal(latest.url); return { ok: true }; }
  busy = true;
  try {
    const { dir, file } = await download();

    if (process.platform === 'win32') {
      await shell.openPath(file);            // the installer replaces the old version
      setTimeout(() => app.quit(), 1500);
      return { ok: true };
    }

    // macOS
    const staged = path.join(dir, 'staged');
    await run('/usr/bin/ditto', ['-x', '-k', file, staged]);
    const newApp = path.join(staged, (await fs.readdir(staged)).find((n) => n.endsWith('.app')));
    const currentApp = path.resolve(process.execPath, '..', '..', '..');   // …/COOL Code.app
    if (!currentApp.endsWith('.app')) throw new Error('Couldn’t find the installed app.');
    try {
      await fs.access(path.dirname(currentApp), fssync.constants.W_OK);
    } catch {
      throw new Error(`COOL Code can’t replace itself in “${path.dirname(currentApp)}”. Move it to your Applications folder and try again.`);
    }

    const script = path.join(dir, 'swap.sh');
    await fs.writeFile(script, `#!/bin/bash
# Wait for COOL Code to quit, swap in the new version, reopen it.
while kill -0 ${process.pid} 2>/dev/null; do sleep 0.3; done
backup="${currentApp}.old"
rm -rf "$backup"
mv "${currentApp}" "$backup" && /usr/bin/ditto "${newApp}" "${currentApp}" && rm -rf "$backup" || { rm -rf "${currentApp}"; mv "$backup" "${currentApp}"; }
/usr/bin/xattr -dr com.apple.quarantine "${currentApp}" 2>/dev/null
open "${currentApp}"
rm -rf "${dir}"
`, { mode: 0o755 });
    spawn('/bin/bash', [script], { detached: true, stdio: 'ignore' }).unref();
    setTimeout(() => app.quit(), 300);
    return { ok: true };
  } catch (e) {
    busy = false;
    return { error: e.message };
  }
}

function init() {
  ipcMain.handle('update:check', () => check({ manual: true }));
  ipcMain.handle('update:install', () => install());
  ipcMain.handle('update:version', () => app.getVersion());
  if (!app.isPackaged) return;
  setTimeout(() => check(), 8000);                    // shortly after launch
  setInterval(() => check(), 6 * 60 * 60 * 1000);     // and every 6 hours
}

module.exports = { init };
