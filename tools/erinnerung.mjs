// Prüft, ob heute bisher zu wenig getrunken wurde, und schickt dann eine Mitteilung
// an alle Geräte, auf denen "Erinnerungen einschalten" gedrückt wurde.
// Läuft per GitHub Actions (siehe .github/workflows/erinnerung.yml).
// Einziges Geheimnis: PUSH_SECRET (wird in der App unter Verlauf > Einrichtung erzeugt).
import crypto from 'node:crypto';
import webpush from 'web-push';

const API_KEY = 'AIzaSyDeYrEsbbJdb-GQTji6NehHAD2dqxOf8jw';   // öffentlicher Web-Schlüssel
const PROJECT = 'trink-app-81c66';
const APP_URL = 'https://martinhohmann.github.io/karl-heinz-trinkt/';
const GOAL = 2000, START = 8, END = 20, TOLERANCE = 200;
const CHECK_HOURS = [10, 12, 14, 16, 18];                    // Uhrzeit in Deutschland
const DOCS = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

export function derive(secret) {
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.setPrivateKey(Buffer.from(secret, 'base64url'));
  const vapidPublic = ecdh.getPublicKey().toString('base64url');
  const sha = (s) => crypto.createHash('sha256').update(s).digest();
  return {
    vapidPublic,
    botEmail: `bot-${sha(vapidPublic).toString('hex').slice(0, 16)}@example.com`,
    botPassword: sha(`bot:${secret}`).toString('base64url')
  };
}

export function berlinNow(date = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(date).map((x) => [x.type, x.value]));
  return { day: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour), minute: Number(p.minute) };
}

export function decide({ hour, minute, total, last, nowMs }) {
  if (!CHECK_HOURS.includes(hour)) return { send: false, why: `keine Prüfzeit (${hour} Uhr)` };
  const expected = Math.round(GOAL * Math.min(1, Math.max(0, (hour + minute / 60 - START) / (END - START))));
  if (total >= GOAL) return { send: false, why: 'Ziel erreicht' };
  if (expected - total <= TOLERANCE) return { send: false, why: `im Plan (${total} von ${expected} ml)` };
  if (last && nowMs - last < 30 * 60 * 1000) return { send: false, why: 'gerade erst getrunken' };
  return { send: true, why: `Rückstand (${total} von ${expected} ml)` };
}

const fmt = (n) => new Intl.NumberFormat('de-DE').format(n);

async function main() {
  const secret = (process.env.PUSH_SECRET || '').trim();
  if (!secret) { console.log('PUSH_SECRET fehlt – Erinnerungen sind noch nicht eingerichtet.'); return; }
  const test = process.env.MODE === 'test';
  const now = berlinNow();
  if (!test && !CHECK_HOURS.includes(now.hour)) { console.log(`Keine Prüfzeit (${now.hour} Uhr).`); return; }

  const { vapidPublic, botEmail, botPassword } = derive(secret);
  const login = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`, {
    method: 'POST', headers: { 'content-type': 'application/json', referer: APP_URL },
    body: JSON.stringify({ email: botEmail, password: botPassword, returnSecureToken: true })
  });
  if (!login.ok) throw new Error(`Anmeldung des Erinnerungs-Dienstes fehlgeschlagen (${login.status}). Passt PUSH_SECRET zur Einrichtung in der App?`);
  const auth = { authorization: `Bearer ${(await login.json()).idToken}` };

  let total = 0, last = 0;
  const dayRes = await fetch(`${DOCS}/days/${now.day}`, { headers: auth });
  if (dayRes.ok) {
    const f = (await dayRes.json()).fields || {};
    total = Number(f.total?.integerValue ?? f.total?.doubleValue ?? 0);
    last = Number(f.last?.integerValue ?? 0);
  } else if (dayRes.status !== 404) {
    throw new Error(`Tagesstand nicht lesbar (${dayRes.status}).`);
  }

  const verdict = test ? { send: true, why: 'Test' } : decide({ ...now, total, last, nowMs: Date.now() });
  console.log(`${now.day} ${now.hour}:${String(now.minute).padStart(2, '0')} – ${verdict.why}`);
  if (!verdict.send) return;

  const subsRes = await fetch(`${DOCS}/push?pageSize=100`, { headers: auth });
  if (!subsRes.ok) throw new Error(`Geräteliste nicht lesbar (${subsRes.status}).`);
  const docs = (await subsRes.json()).documents || [];
  if (!docs.length) { console.log('Kein Gerät hat Erinnerungen eingeschaltet.'); return; }

  webpush.setVapidDetails(APP_URL, vapidPublic, secret);
  // Im Test geht dieselbe Mitteilung raus wie im Alltag, nur unabhängig von Uhrzeit und Rückstand.
  const payload = JSON.stringify({
    title: 'Zeit für ein Glas Wasser 💧',
    body: total >= GOAL
      ? `Heute schon ${fmt(total)} ml – Tagesziel erreicht.`
      : `Heute bisher ${fmt(total)} ml – noch ${fmt(GOAL - total)} ml bis zum Ziel.`
  });

  let ok = 0;
  for (const d of docs) {
    try {
      await webpush.sendNotification(JSON.parse(d.fields.sub.stringValue), payload, { TTL: 3600, urgency: 'high' });
      ok++;
    } catch (err) {
      console.log(`Gerät nicht erreichbar (${err.statusCode || err.message}).`);
      if (err.statusCode === 404 || err.statusCode === 410) {
        await fetch(`https://firestore.googleapis.com/v1/${d.name}`, { method: 'DELETE', headers: auth });
      }
    }
  }
  console.log(`Mitteilung an ${ok} von ${docs.length} Gerät(en) gesendet.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => { console.error(err.message); process.exit(1); });
}
