/* COOL Code — Google sign-in UI. Loaded after app.js and tracking.js. */
'use strict';

let currentUser = null;       // { email, name, picture, isAdmin }
let designOnly = false;       // chose "continue without signing in"

function renderUserChip() {
  const u = currentUser;
  $('userChip').hidden = !u;
  $('btnSignInTop').hidden = !!u || !window.qrApi?.auth;
  if (!u) return;
  $('userAvatar').outerHTML = `<span id="userAvatar">${avatarHtml(u.name, u.picture, 'avatar sm')}</span>`;
  $('userName').textContent = u.name.split(' ')[0];
  $('umName').textContent = u.name;
  $('umEmail').textContent = u.email;
  $('umRole').hidden = !u.isAdmin;
}

function showSignIn(message) {
  $('signin').hidden = false;
  $('signinMsg').textContent = message || '';
  $('signinMsg').className = 'signin-msg' + (message ? ' err' : '');
}
function hideSignIn() { $('signin').hidden = true; }

// Called from anywhere that hits a "please sign in" response
function requireSignIn(message) {
  currentUser = null;
  renderUserChip();
  showSignIn(message && !/sign in/i.test(message) ? message : '');
}

async function doSignIn() {
  const btn = $('btnGoogle');
  btn.disabled = true;
  btn.textContent = 'Waiting for Google… (check your browser)';
  $('signinMsg').textContent = '';
  const res = await window.qrApi.auth.signIn();
  btn.disabled = false;
  btn.textContent = 'Sign in with Google';
  if (res.user) {
    currentUser = res.user;
    designOnly = false;
    renderUserChip();
    hideSignIn();
    toast(`Welcome, ${res.user.name.split(' ')[0]}!`);
    if (!$('view-scans').hidden) showView('scans');
  } else if (res.error) {
    $('signinMsg').textContent = res.error;
    $('signinMsg').className = 'signin-msg err';
  }
}

async function initAuth() {
  if (!window.qrApi?.auth) { hideSignIn(); return; }   // plain browser preview
  const st = await window.qrApi.auth.status();
  if (st.domain) $('signinDomain').textContent = '@' + st.domain;
  setGoogleReady(st.googleReady !== false || st.signedIn);
  if (st.signedIn) {
    currentUser = st.user;
    renderUserChip();
    hideSignIn();
  } else {
    renderUserChip();
    showSignIn(st.error);
  }
}

// Before Google sign-in is switched on, the access key is the way in
function setGoogleReady(ready) {
  $('btnGoogle').hidden = !ready;
  $('googleSoon').hidden = ready;
  $('btnShowKey').hidden = !ready;
  $('keyForm').hidden = ready;
}

async function doKeySignIn(e) {
  e.preventDefault();
  const key = $('keyInput').value;
  const btn = $('keyForm').querySelector('button');
  btn.disabled = true; btn.textContent = 'Checking…';
  const res = await window.qrApi.auth.signInWithKey(key);
  btn.disabled = false; btn.textContent = 'Sign in';
  if (res.user) {
    $('keyInput').value = '';
    currentUser = res.user;
    renderUserChip();
    hideSignIn();
    toast(`Welcome, ${res.user.name.split(' ')[0]}!`);
    if (!$('view-scans').hidden) showView('scans');
  } else {
    $('signinMsg').textContent = res.error;
    $('signinMsg').className = 'signin-msg err';
  }
}

function wireAuth() {
  $('btnShowKey').onclick = () => { $('keyForm').hidden = false; $('btnShowKey').hidden = true; $('keyInput').focus(); };
  $('keyForm').onsubmit = doKeySignIn;
  $('btnGoogle').onclick = doSignIn;
  $('btnSkipSignin').onclick = () => {
    designOnly = true;
    window.qrApi?.auth?.cancel();
    hideSignIn();
    if (state.trackOn) { state.trackOn = false; sync(); render(); }
  };
  $('btnSignInTop').onclick = () => showSignIn();
  $('userBtn').onclick = (e) => { e.stopPropagation(); $('userMenu').hidden = !$('userMenu').hidden; };
  document.addEventListener('click', () => { $('userMenu').hidden = true; });
  $('btnSignOut').onclick = async () => {
    await window.qrApi.auth.signOut();
    currentUser = null;
    renderUserChip();
    showView('design');
    showSignIn();
  };
  // Tracking needs an account
  $('trackToggle').addEventListener('change', (e) => {
    if (e.target.checked && !currentUser && window.qrApi?.auth) {
      state.trackOn = false; sync();
      showSignIn('Sign in to create tracked codes — scans are shared with your team.');
    }
  });
}

wireAuth();
initAuth();
