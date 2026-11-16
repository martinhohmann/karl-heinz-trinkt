import { initializeApp, deleteApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, signOut
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {
  initializeFirestore, persistentLocalCache, doc, collection, onSnapshot, setDoc, updateDoc,
  deleteDoc, query, where, orderBy, increment, arrayUnion, arrayRemove
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { CONFIG } from './config.js';

const GOAL = CONFIG.goalMl;
const $ = (id) => document.getElementById(id);
const nf = new Intl.NumberFormat('de-DE');
const ml = (n) => `${nf.format(n)} ml`;

const app = initializeApp(CONFIG.firebase);
const auth = getAuth(app);
let db;
try {
  db = initializeFirestore(app, { localCache: persistentLocalCache() });
} catch (_) {
  db = initializeFirestore(app, {});
}

// ---------- kleine Helfer ----------
const pad = (n) => String(n).padStart(2, '0');
function dayStr(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function daysAgo(n) {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - n);
  return d;
}
function timeStr(t) {
  return new Date(t).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}
function expectedNow() {
  const d = new Date();
  const h = d.getHours() + d.getMinutes() / 60;
  const f = (h - CONFIG.dayStartHour) / (CONFIG.dayEndHour - CONFIG.dayStartHour);
  return Math.round(GOAL * Math.min(1, Math.max(0, f)));
}
function store(key, value) {
  try {
    if (value === undefined) return localStorage.getItem(key);
    localStorage.setItem(key, value);
  } catch (_) { /* Speicher gesperrt: dann eben ohne */ }
  return null;
}
const b64url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
function fromB64url(s) {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
}
async function sha256(text) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
}
const hex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

let toastTimer;
function toast(text, ms = 3500) {
  const el = $('toast');
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, ms);
}

// ---------- Zustand ----------
let currentDay = dayStr();
let today = { total: 0, entries: [] };
let history = new Map();
let pushConfig = null;
let unsubToday = null, unsubHistory = null, unsubConfig = null;

// ---------- Knöpfe mit Glas-Bild ----------
function glassIcon(mlValue, index) {
  const w = 62 + index * 16;           // Glas wird von Knopf zu Knopf größer
  const h = 62 + index * 19;
  const cx = 80, bottom = 124, top = bottom - h;
  const tl = cx - w / 2, tr = cx + w / 2;
  const bl = cx - w / 2 + w * 0.13, br = cx + w / 2 - w * 0.13;
  const waterTop = top + h * 0.16;
  const k = (waterTop - top) / h;
  const wl = tl + (bl - tl) * k, wr = tr + (br - tr) * k;
  const fs = index === 0 ? 19 : 21;
  return `<svg viewBox="0 0 160 132" aria-hidden="true">
    <path d="M${wl} ${waterTop} L${bl} ${bottom} L${br} ${bottom} L${wr} ${waterTop} Z" fill="#bfe0fa"/>
    <path d="M${tl} ${top} L${bl} ${bottom} L${br} ${bottom} L${tr} ${top}" fill="none" stroke="#0e2a43" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"/>
    <text x="${cx}" y="${bottom - h * 0.36}" text-anchor="middle" font-size="${fs}" font-weight="800" fill="#0e2a43">${mlValue}</text>
    <text x="${cx}" y="${bottom - h * 0.36 + 17}" text-anchor="middle" font-size="15" font-weight="700" fill="#0e2a43">ml</text>
  </svg>`;
}
function buildButtons() {
  $('buttons').innerHTML = CONFIG.sizes.map((s, i) => `
    <button class="add" data-ml="${s.ml}" aria-label="${s.label}, ${s.ml} Milliliter eintragen">
      ${glassIcon(s.ml, i)}
      <span class="cap">${s.label}</span>
    </button>`).join('');
  $('buttons').addEventListener('click', (e) => {
    const btn = e.target.closest('.add');
    if (btn) addDrink(Number(btn.dataset.ml), btn);
  });
}

// ---------- Eintragen und Löschen ----------
let lastTap = 0;
async function addDrink(amount, btn) {
  const now = Date.now();
  if (now - lastTap < 600) return;           // Doppel-Tipper abfangen
  lastTap = now;
  btn.classList.add('pressed');
  setTimeout(() => btn.classList.remove('pressed'), 250);
  const day = dayStr();
  const entry = { t: now, ml: amount };
  toast(`${ml(amount)} eingetragen`);
  try {
    await setDoc(doc(db, 'days', day), {
      date: day, total: increment(amount), entries: arrayUnion(entry), last: now
    }, { merge: true });
  } catch (err) {
    console.error('[KHT] Eintragen fehlgeschlagen', err);
    toast('Das hat nicht geklappt. Bitte noch einmal drücken.', 6000);
  }
}
async function undoLast() {
  const entries = [...today.entries].sort((a, b) => a.t - b.t);
  const lastEntry = entries.pop();
  if (!lastEntry) return;
  const prev = entries.length ? entries[entries.length - 1].t : 0;
  try {
    await updateDoc(doc(db, 'days', currentDay), {
      total: increment(-lastEntry.ml), entries: arrayRemove(lastEntry), last: prev
    });
    toast(`${ml(lastEntry.ml)} wieder gelöscht`);
  } catch (err) {
    console.error('[KHT] Löschen fehlgeschlagen', err);
    toast('Löschen hat nicht geklappt.', 6000);
  }
}

// ---------- Anzeige ----------
function renderToday() {
  const total = Math.max(0, today.total || 0);
  const rest = Math.max(0, GOAL - total);
  const pct = Math.min(1, total / GOAL);
  $('water').style.transform = `translateY(${(1 - pct) * 334}px)`;
  const rem = $('remaining');
  if (rest > 0) {
    rem.classList.remove('done');
    rem.innerHTML = `Noch<strong>${ml(rest)}</strong>bis zum Ziel`;
  } else {
    rem.classList.add('done');
    rem.innerHTML = `Tagesziel<strong>geschafft!</strong>Sehr gut.`;
  }
  $('drunk').innerHTML = `<b>${ml(total)}</b> von ${ml(GOAL)} getrunken`;
  const entries = [...today.entries].sort((a, b) => a.t - b.t);
  const lastEntry = entries[entries.length - 1];
  $('lastEntry').textContent = lastEntry
    ? `Zuletzt: ${ml(lastEntry.ml)} um ${timeStr(lastEntry.t)} Uhr`
    : 'Heute noch nichts eingetragen.';
  $('btnUndo').hidden = !lastEntry;
  $('dateLabel').textContent = new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
  $('entryList').innerHTML = entries.length
    ? entries.map((e) => `<li>${timeStr(e.t)} Uhr – <b>${ml(e.ml)}</b></li>`).join('')
    : '<li>Noch keine Einträge.</li>';
  $('statToday').textContent = ml(total);
}

function renderHistory() {
  const days = [];
  for (let i = 13; i >= 0; i--) {
    const d = daysAgo(i);
    const key = dayStr(d);
    const total = key === currentDay ? (today.total || 0) : (history.get(key)?.total || 0);
    days.push({ d, key, total: Math.max(0, total) });
  }
  const max = Math.max(GOAL * 1.15, ...days.map((x) => x.total));
  const goalPos = 100 - (GOAL / max) * 100;
  $('bars').innerHTML = `<div class="goal" style="top: calc(22px + (100% - 22px) * ${goalPos / 100})"><span>Ziel ${ml(GOAL)}</span></div>` +
    days.map((x) => `<div class="bar${x.total >= GOAL ? ' reached' : ''}${x.key === currentDay ? ' today' : ''}" title="${x.d.toLocaleDateString('de-DE')}: ${ml(x.total)}">
      <span class="n">${x.total ? nf.format(x.total) : ''}</span><i style="height:${(x.total / max) * 100}%"></i></div>`).join('');
  $('barLabels').innerHTML = days.map((x) =>
    `<div><b>${x.d.toLocaleDateString('de-DE', { weekday: 'short' }).replace('.', '')}</b>${x.d.getDate()}.</div>`).join('');

  const week = days.slice(-7);
  const past = week.filter((x) => x.key !== currentDay);       // der laufende Tag verzerrt den Schnitt
  const avg = past.length ? Math.round(past.reduce((s, x) => s + x.total, 0) / past.length / 10) * 10 : 0;
  $('statAvg').textContent = ml(avg);
  $('statGoal').textContent = `${week.filter((x) => x.total >= GOAL).length} von 7`;
  $('dayTable').innerHTML = [...days].reverse().map((x) => `<tr>
      <td>${x.key === currentDay ? 'Heute' : x.d.toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'numeric' })}</td>
      <td>${ml(x.total)}</td>
      <td class="${x.total >= GOAL ? 'ok' : ''}">${x.total >= GOAL ? 'Ziel erreicht' : `${Math.round((x.total / GOAL) * 100)} %`}</td>
    </tr>`).join('');
}

// ---------- Hinweis in der App, wenn zu wenig getrunken wurde ----------
function maybeRemind() {
  if (document.hidden || $('appView').hidden || !$('reminder').hidden) return;
  const hour = new Date().getHours();
  if (hour < CONFIG.dayStartHour + 1 || hour >= CONFIG.dayEndHour + 1) return;
  const total = today.total || 0;
  const behind = expectedNow() - total;
  if (total >= GOAL || behind <= CONFIG.toleranceMl) return;
  const lastShown = Number(store('kht-reminded') || 0);
  if (Date.now() - lastShown < 60 * 60 * 1000) return;
  const lastDrink = Math.max(0, ...today.entries.map((e) => e.t));
  if (Date.now() - lastDrink < 30 * 60 * 1000) return;
  store('kht-reminded', String(Date.now()));
  $('remText').textContent = `Heute bisher ${ml(total)}. Bis jetzt wären etwa ${ml(Math.round(expectedNow() / 50) * 50)} gut.`;
  $('reminder').hidden = false;
}

// ---------- Datenbank-Abos ----------
function subscribe() {
  unsubscribe();
  currentDay = dayStr();
  let first = true;
  unsubToday = onSnapshot(doc(db, 'days', currentDay), (snap) => {
    const data = snap.data() || {};
    today = { total: data.total || 0, entries: Array.isArray(data.entries) ? data.entries : [] };
    renderToday();
    renderHistory();
    if (first) { first = false; setTimeout(maybeRemind, 1200); }
  }, (err) => console.error('[KHT] Heute lesen', err));
  unsubHistory = onSnapshot(
    query(collection(db, 'days'), where('date', '>=', dayStr(daysAgo(13))), orderBy('date')),
    (snap) => {
      history = new Map(snap.docs.map((d) => [d.id, d.data()]));
      renderHistory();
    }, (err) => console.error('[KHT] Verlauf lesen', err));
  unsubConfig = onSnapshot(doc(db, 'config', 'push'), (snap) => {
    pushConfig = snap.exists() ? snap.data() : null;
    refreshPushUI();
    refreshSetupUI();
  }, (err) => console.error('[KHT] Einstellungen lesen', err));
}
function unsubscribe() {
  for (const u of [unsubToday, unsubHistory, unsubConfig]) if (u) u();
  unsubToday = unsubHistory = unsubConfig = null;
}
// Tageswechsel um Mitternacht mitbekommen, auch wenn die App offen bleibt.
setInterval(() => {
  if (auth.currentUser && dayStr() !== currentDay) subscribe();
}, 30 * 1000);
document.addEventListener('visibilitychange', () => {
  if (document.hidden || !auth.currentUser) return;
  if (dayStr() !== currentDay) subscribe();
  renderToday();
  maybeRemind();
});
setInterval(maybeRemind, 5 * 60 * 1000);

// ---------- Mitteilungen (Web Push) ----------
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const pushSupported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
let swReg = null;
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').then((r) => { swReg = r; refreshPushUI(); })
    .catch((err) => console.error('[KHT] Service Worker', err));
}

async function currentSubscription() {
  if (!pushSupported || !swReg) return null;
  const sub = await swReg.pushManager.getSubscription();
  if (!sub || !pushConfig) return sub;
  const key = sub.options && sub.options.applicationServerKey;
  if (key && b64url(key) !== pushConfig.vapidPublic) return null;   // gehört zu einem alten Schlüssel
  return sub;
}
async function saveSubscription(sub) {
  const id = hex(await sha256(sub.endpoint)).slice(0, 32);
  await setDoc(doc(db, 'push', id), {
    sub: JSON.stringify(sub), ua: navigator.userAgent.slice(0, 200), created: Date.now()
  });
  return id;
}
async function refreshPushUI() {
  const row = $('pushRow');
  if (!row || !auth.currentUser) return;
  if (!pushSupported) {
    row.innerHTML = isIOS && !isStandalone
      ? '<span>🔔 Für Erinnerungen: in Safari auf „Teilen“ und dann „Zum Home-Bildschirm“ tippen. Danach die App von dort öffnen.</span>'
      : '<span>Dieses Gerät kann keine Mitteilungen anzeigen.</span>';
    return;
  }
  if (!pushConfig) { row.innerHTML = '<span>🔔 Erinnerungen sind noch nicht eingerichtet.</span>'; return; }
  if (Notification.permission === 'denied') {
    row.innerHTML = '<span>🔔 Mitteilungen sind für diese App gesperrt. Das lässt sich in den Einstellungen des Geräts ändern.</span>';
    return;
  }
  const sub = Notification.permission === 'granted' ? await currentSubscription() : null;
  if (sub) {
    saveSubscription(sub).catch(() => {});
    row.innerHTML = '<span class="on">🔔 Erinnerungen sind eingeschaltet</span><button class="linkbtn" id="btnPushTest">Probe</button><button class="linkbtn" id="btnPushOff">Ausschalten</button>';
    $('btnPushTest').onclick = () => swReg.showNotification('Karl-Heinz trinkt', {
      body: 'So sieht eine Erinnerung aus.', icon: 'icons/icon-192.png', tag: 'trinken'
    });
    $('btnPushOff').onclick = disablePush;
  } else {
    row.innerHTML = '<button class="linkbtn" id="btnPushOn">🔔 Erinnerungen einschalten</button>';
    $('btnPushOn').onclick = enablePush;
  }
}
async function enablePush() {
  try {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') { toast('Mitteilungen wurden nicht erlaubt.'); return refreshPushUI(); }
    const reg = swReg || await navigator.serviceWorker.ready;
    const old = await reg.pushManager.getSubscription();
    if (old && !(await currentSubscription())) await old.unsubscribe();
    const sub = await reg.pushManager.getSubscription() || await reg.pushManager.subscribe({
      userVisibleOnly: true, applicationServerKey: fromB64url(pushConfig.vapidPublic)
    });
    await saveSubscription(sub);
    toast('Erinnerungen sind eingeschaltet.');
  } catch (err) {
    console.error('[KHT] Erinnerungen einschalten', err);
    toast('Erinnerungen konnten nicht eingeschaltet werden.', 6000);
  }
  refreshPushUI();
}
async function disablePush() {
  try {
    const sub = await swReg.pushManager.getSubscription();
    if (sub) {
      const id = hex(await sha256(sub.endpoint)).slice(0, 32);
      await sub.unsubscribe();
      await deleteDoc(doc(db, 'push', id));
    }
    toast('Erinnerungen sind auf diesem Gerät aus.');
  } catch (err) { console.error('[KHT] Erinnerungen ausschalten', err); }
  refreshPushUI();
}

// ---------- Einrichtung des Erinnerungs-Dienstes (für Martin) ----------
// Das Geheimnis entsteht hier im Browser und wird nirgends gespeichert:
// Es gehört nur in das GitHub-Secret PUSH_SECRET.
let freshSecret = null;
function refreshSetupUI() {
  $('setupState').textContent = pushConfig
    ? `Eingerichtet am ${new Date(pushConfig.created).toLocaleDateString('de-DE')}. „Schlüssel erzeugen“ macht einen neuen Schlüssel – dann muss das Secret bei GitHub ersetzt und „Erinnerungen einschalten“ auf jedem Gerät neu gedrückt werden.`
    : 'Noch nicht eingerichtet.';
}
async function runSetup() {
  const msg = $('setupMsg');
  msg.className = 'note';
  msg.textContent = 'Einen Moment …';
  $('btnSetup').disabled = true;
  let second = null;
  try {
    const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign']);
    const vapidPublic = b64url(await crypto.subtle.exportKey('raw', pair.publicKey));
    const secret = (await crypto.subtle.exportKey('jwk', pair.privateKey)).d;
    const botEmail = `bot-${hex(await sha256(vapidPublic)).slice(0, 16)}@example.com`;
    const botPassword = b64url(await sha256(`bot:${secret}`));
    second = initializeApp(CONFIG.firebase, `setup-${Date.now()}`);
    await createUserWithEmailAndPassword(getAuth(second), botEmail, botPassword);
    await signOut(getAuth(second));
    await setDoc(doc(db, 'config', 'push'), { vapidPublic, botEmail, created: Date.now() });
    freshSecret = secret;
    $('btnCopySecret').hidden = false;
    msg.textContent = 'Schlüssel erzeugt. Jetzt „Geheimnis kopieren“ drücken und bei GitHub als PUSH_SECRET einfügen. Das Geheimnis ist nur sichtbar, solange diese Seite offen ist.';
  } catch (err) {
    console.error('[KHT] Einrichtung', err);
    msg.className = 'note err';
    msg.textContent = 'Das hat nicht geklappt. Bitte Internetverbindung prüfen und noch einmal versuchen.';
  } finally {
    if (second) deleteApp(second).catch(() => {});
    $('btnSetup').disabled = false;
  }
}
async function copySecret() {
  if (!freshSecret) return;
  try {
    await navigator.clipboard.writeText(freshSecret);
    $('setupMsg').textContent = 'Kopiert. Jetzt bei GitHub als Secret PUSH_SECRET einfügen.';
  } catch (_) {
    window.prompt('Bitte markieren und kopieren (⌘C):', freshSecret);
  }
}

// ---------- Anmeldung ----------
const loginErrors = {
  'auth/invalid-credential': 'Der Code stimmt nicht.',
  'auth/wrong-password': 'Der Code stimmt nicht.',
  'auth/user-not-found': 'Der Code stimmt nicht.',
  'auth/email-already-in-use': 'Es gibt schon einen Code. Bitte oben „Anmelden“ drücken.',
  'auth/weak-password': 'Der Code braucht mindestens 6 Zeichen.',
  'auth/missing-password': 'Bitte den Code eingeben.',
  'auth/too-many-requests': 'Zu viele Versuche. Bitte ein paar Minuten warten.',
  'auth/network-request-failed': 'Keine Internetverbindung.'
};
async function login(create) {
  const code = $('code').value;
  const msg = $('loginMsg');
  msg.className = 'note';
  if (code.length < 6) { msg.className = 'note err'; msg.textContent = 'Der Code braucht mindestens 6 Zeichen.'; return; }
  msg.textContent = 'Einen Moment …';
  try {
    if (create) await createUserWithEmailAndPassword(auth, CONFIG.familyEmail, code);
    else await signInWithEmailAndPassword(auth, CONFIG.familyEmail, code);
    $('code').value = '';
    msg.textContent = '';
  } catch (err) {
    console.error('[KHT] Anmeldung', err.code);
    msg.className = 'note err';
    msg.textContent = loginErrors[err.code] || 'Die Anmeldung hat nicht geklappt.';
  }
}
$('loginForm').addEventListener('submit', (e) => { e.preventDefault(); login(false); });
$('btnCreate').addEventListener('click', () => login(true));
$('showCode').addEventListener('change', (e) => { $('code').type = e.target.checked ? 'text' : 'password'; });

// ---------- Navigation ----------
function showTab(name) {
  const hist = name === 'history';
  $('viewToday').hidden = hist;
  $('viewHistory').hidden = !hist;
  $('tabToday').setAttribute('aria-selected', String(!hist));
  $('tabHistory').setAttribute('aria-selected', String(hist));
  window.scrollTo(0, 0);
}
$('tabToday').addEventListener('click', () => showTab('today'));
$('tabHistory').addEventListener('click', () => showTab('history'));
$('btnUndo').addEventListener('click', undoLast);
$('remOk').addEventListener('click', () => { $('reminder').hidden = true; });
$('btnSetup').addEventListener('click', runSetup);
$('btnCopySecret').addEventListener('click', copySecret);
$('btnLogout').addEventListener('click', () => signOut(auth));

buildButtons();
onAuthStateChanged(auth, (user) => {
  const ok = !!user && user.email === CONFIG.familyEmail;
  $('loginView').hidden = ok;
  $('appView').hidden = !ok;
  $('tabs').hidden = !ok;
  if (ok) { showTab('today'); renderToday(); subscribe(); }
  else { unsubscribe(); if (user) signOut(auth); }
});
