/* COOL Code — update banner */
'use strict';
(function () {
  const u = window.qrApi?.updates;
  if (!u) return;
  const btn = $('updateBtn');
  let info = null;

  u.version().then((v) => { $('appVersion').textContent = v; });

  u.onAvailable((d) => {
    info = d;
    btn.hidden = false;
    btn.disabled = false;
    btn.textContent = d.canInstall ? `Update to ${d.version}` : `Version ${d.version} is out`;
    btn.title = d.notes ? d.notes.slice(0, 400) : 'A new version of COOL Code is available';
  });
  u.onProgress(({ pct }) => { btn.textContent = `Downloading… ${pct}%`; });

  btn.onclick = async () => {
    if (!info) return;
    btn.disabled = true;
    btn.textContent = 'Downloading…';
    const r = await u.install();
    if (r?.error) {
      btn.disabled = false;
      btn.textContent = `Update to ${info.version}`;
      toast(r.error);
    } else {
      btn.textContent = 'Restarting…';
    }
  };

  $('btnCheckUpdates').onclick = async () => {
    const b = $('btnCheckUpdates');
    b.textContent = 'Checking…';
    const r = await u.check();
    b.textContent = 'Check for updates';
    if (r.status === 'current') toast('You have the latest version');
    else if (r.status === 'none') toast('No releases published yet');
    else if (r.status === 'error') toast(r.error || 'Couldn’t check for updates');
    else if (r.status === 'available') { $('settingsModal').hidden = true; toast(`Version ${r.version} is ready — click the update button at the top`); }
  };
})();
