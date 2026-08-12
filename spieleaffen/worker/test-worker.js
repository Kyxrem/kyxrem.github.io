/* SpieleAffen — Worker-Test.
 *
 *   node spieleaffen/worker/test-worker.js
 *
 * Fährt den Worker gegen einen KV-Ersatz im Speicher. Kein Cloudflare-Konto,
 * kein Netz — geprüft wird die Logik: öffentliches Lesen, Anmelden mit dem
 * eigenen Code, Sperre nach zu vielen Fehlversuchen, Konflikt bei veralteter
 * Revision, Log mit Namen, Codeverwaltung nur für Admins.
 */
import worker from './worker.js';

// ── KV im Speicher ─────────────────────────────────────────────────────────
function kv() {
  const store = new Map();
  return {
    async get(key, typ) {
      const v = store.get(key);
      if (v === undefined) return null;
      return typ === 'json' ? JSON.parse(v) : v;
    },
    async put(key, value) { store.set(key, value); },
    async delete(key) { store.delete(key); },
    _store: store
  };
}

let fails = 0, checks = 0;
function ok(cond, label, detail) {
  checks++;
  if (cond) console.log('  ok    ' + label);
  else { fails++; console.log('  FAIL  ' + label + (detail ? '\n        ' + detail : '')); }
}
function section(s) { console.log('\n' + s); }

const env = { SA_KV: kv(), ADMIN_TOKEN: 'geheimer-admin-schluessel-1234' };

function anfrage(method, pfad, { body, token, ip } = {}) {
  const headers = { 'CF-Connecting-IP': ip || '1.2.3.4' };
  if (token) headers['Authorization'] = 'Bearer ' + token;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  return worker.fetch(new Request('https://api.test' + pfad, {
    method, headers, body: body !== undefined ? JSON.stringify(body) : undefined
  }), env);
}
const alsJson = async (r) => ({ status: r.status, body: await r.json() });

const DOKUMENT = {
  meta: { version: 1 },
  players: [
    { id: 'maik', name: 'Maik', seat: 1, admin: true },
    { id: 'bene', name: 'Bene', seat: 3 },
    { id: 'tobi', name: 'Tobi', seat: 6, archived: true }
  ],
  seasons: [], games: [], nights: [], modules: {}, houseRules: []
};

(async () => {
  section('Öffentlich lesen');
  let r = await alsJson(await anfrage('GET', '/api/data'));
  ok(r.status === 200, 'GET /api/data ist ohne Anmeldung erreichbar');
  ok(r.body.rev === 0 && Array.isArray(r.body.data.players), 'Leeres Dokument bei frischer Installation');

  section('Schreiben ohne Sitzung');
  r = await alsJson(await anfrage('PUT', '/api/data', { body: { data: DOKUMENT, baseRev: 0 } }));
  ok(r.status === 401, 'PUT ohne Token wird abgewiesen', JSON.stringify(r));

  section('Admin-Schlüssel: der Weg hinein, bevor es Codes gibt');
  r = await alsJson(await anfrage('POST', '/api/login', { body: { code: env.ADMIN_TOKEN } }));
  ok(r.status === 200 && r.body.token, 'Der Admin-Schlüssel meldet an');
  ok(r.body.player.admin === true, 'und zwar als Admin');
  const adminToken = r.body.token;

  r = await alsJson(await anfrage('PUT', '/api/data', {
    token: adminToken, body: { data: DOKUMENT, baseRev: 0, summary: 'Erste Einrichtung' }
  }));
  ok(r.status === 200 && r.body.rev === 1, 'Das erste Dokument wird gespeichert (rev 1)', JSON.stringify(r));

  section('Konflikt: wer auf einer alten Revision aufsetzt, verliert nicht still');
  r = await alsJson(await anfrage('PUT', '/api/data', {
    token: adminToken, body: { data: DOKUMENT, baseRev: 0, summary: 'Veraltet' }
  }));
  ok(r.status === 409, 'Veraltete Revision gibt 409', JSON.stringify(r));
  ok(r.body.rev === 1, 'und nennt die aktuelle Revision');

  section('Codes setzen');
  r = await alsJson(await anfrage('POST', '/api/codes', { token: adminToken, body: { playerId: 'maik', code: '1234' } }));
  ok(r.status === 200 && r.body.gesetzt === true, 'Admin setzt einen Code');
  await anfrage('POST', '/api/codes', { token: adminToken, body: { playerId: 'bene', code: '5678' } });
  await anfrage('POST', '/api/codes', { token: adminToken, body: { playerId: 'tobi', code: '9012' } });

  r = await alsJson(await anfrage('POST', '/api/codes', { token: adminToken, body: { playerId: 'gibtsnicht', code: '1111' } }));
  ok(r.status === 404, 'Ein Code für einen unbekannten Affen wird abgelehnt');

  r = await alsJson(await anfrage('POST', '/api/codes', { token: adminToken, body: { playerId: 'maik', code: '12' } }));
  ok(r.status === 400, 'Zu kurze Codes werden abgelehnt');

  section('Der Code steht nie im Klartext in der Datenbank');
  const rohe = env.SA_KV._store.get('codes');
  ok(!rohe.includes('1234') && !rohe.includes('5678'), 'Kein Code im KV auffindbar');
  ok(rohe.includes('salt') && rohe.includes('hash'), 'Gespeichert sind Salt und Ableitung', rohe.slice(0, 80));

  section('Anmelden mit dem eigenen Code');
  r = await alsJson(await anfrage('POST', '/api/login', { body: { code: '5678' }, ip: '9.9.9.9' }));
  ok(r.status === 200 && r.body.player.name === 'Bene', 'Bene kommt mit seinen vier Ziffern rein', JSON.stringify(r.body.player));
  ok(r.body.player.admin === false, 'Bene ist kein Admin');
  const beneToken = r.body.token;

  r = await alsJson(await anfrage('GET', '/api/me', { token: beneToken }));
  ok(r.status === 200 && r.body.id === 'bene', '/api/me nennt den angemeldeten Affen');

  section('Rechte');
  r = await alsJson(await anfrage('POST', '/api/codes', { token: beneToken, body: { playerId: 'maik', code: '4321' } }));
  ok(r.status === 403, 'Ein Affe ohne Adminrechte darf keine Codes setzen');

  r = await alsJson(await anfrage('PUT', '/api/data', {
    token: beneToken, body: { data: DOKUMENT, baseRev: 1, summary: 'Bene trägt ein' }
  }));
  ok(r.status === 200, 'Aber eintragen darf er');

  section('Ein Affe ohne Rechte kommt nicht an das Affen-Verzeichnis');
  /* Die Oberfläche sperrt diese Knöpfe — aber PUT /api/data kann jeder von
     Hand schicken. Also muss es der Worker abfangen, nicht der Browser. */
  const kopie = () => JSON.parse(JSON.stringify(DOKUMENT));
  const alsBene = async (data, summary) => alsJson(await anfrage('PUT', '/api/data', {
    token: beneToken, body: { data, summary: summary || 'Bene ändert etwas' }
  }));

  let d = kopie();
  d.players.filter((p) => p.id === 'bene')[0].admin = true;
  r = await alsBene(d, 'Bene macht sich zum Admin');
  ok(r.status === 403, 'Er kann sich nicht selbst zum Admin machen', JSON.stringify(r.body));

  d = kopie();
  d.players.filter((p) => p.id === 'maik')[0].admin = false;
  r = await alsBene(d, 'Bene entmachtet Maik');
  ok(r.status === 403, 'Und Maik die Rechte auch nicht nehmen', JSON.stringify(r.body));

  d = kopie();
  d.players.push({ id: 'schwarz', name: 'Schwarzer Peter', seat: 5, admin: true });
  r = await alsBene(d, 'Bene legt einen Admin an');
  ok(r.status === 403, 'Einen neuen Affen anlegen darf er nicht', JSON.stringify(r.body));

  d = kopie();
  d.players = d.players.filter((p) => p.id !== 'maik');
  r = await alsBene(d, 'Bene löscht Maik');
  ok(r.status === 403, 'Und einen herausnehmen erst recht nicht');

  d = kopie();
  d.players.filter((p) => p.id === 'maik')[0].seat = 5;
  r = await alsBene(d, 'Bene färbt Maik um');
  ok(r.status === 403, 'Fremde Sitzfarben sind tabu', JSON.stringify(r.body));

  d = kopie();
  d.players.filter((p) => p.id === 'bene')[0].name = 'Bene der Große';
  r = await alsBene(d, 'Bene benennt sich um');
  ok(r.status === 403, 'Nicht einmal den eigenen Namen — nur die Farbe', JSON.stringify(r.body));

  d = kopie();
  d.players.filter((p) => p.id === 'bene')[0].seat = 1;   // Maik sitzt da
  r = await alsBene(d, 'Bene nimmt Maiks Farbe');
  ok(r.status === 403, 'Eine belegte Farbe nehmen geht nicht — das wäre ein Tausch', JSON.stringify(r.body));

  d = kopie();
  d.players.filter((p) => p.id === 'bene')[0].seat = 4;   // frei
  r = await alsBene(d, 'Bene nimmt eine freie Farbe');
  ok(r.status === 200, 'Eine freie Farbe für sich selbst darf er nehmen', JSON.stringify(r.body));

  d = kopie();
  d.players.filter((p) => p.id === 'bene')[0].seat = 6;   // Tobi ist archiviert
  r = await alsBene(d, 'Bene nimmt die Farbe des Archivierten');
  ok(r.status === 200, 'Auch die eines Archivierten — dessen Farbe ist wieder frei', JSON.stringify(r.body));

  section('Der Admin darf all das');
  d = kopie();
  d.players.filter((p) => p.id === 'bene')[0].admin = true;
  r = await alsJson(await anfrage('PUT', '/api/data', {
    token: adminToken, body: { data: d, summary: 'Admin macht Bene zum Admin' }
  }));
  ok(r.status === 200, 'Ein Admin vergibt Adminrechte', JSON.stringify(r.body));

  section('Genommene Rechte gelten sofort, nicht erst beim nächsten Anmelden');
  /* Benes Sitzung wurde angelegt, als er noch keine Rechte hatte. Jetzt hat er
     welche — die Prüfung liest sie aus dem Dokument, nicht aus der Sitzung. */
  d = kopie();
  d.players.filter((p) => p.id === 'bene')[0].admin = true;
  d.players.filter((p) => p.id === 'maik')[0].seat = 5;
  r = await alsBene(d, 'Bene, jetzt Admin, färbt Maik um');
  ok(r.status === 200, 'Mit frisch vergebenen Rechten geht es sofort', JSON.stringify(r.body));

  // Und wieder zurück, damit die folgenden Prüfungen ihren Bene vorfinden.
  r = await alsJson(await anfrage('PUT', '/api/data', {
    token: adminToken, body: { data: DOKUMENT, summary: 'Stand zurücksetzen' }
  }));
  ok(r.status === 200, 'Der Ausgangsstand steht wieder');
  r = await alsBene(kopie(), 'Bene versucht es noch einmal');
  ok(r.status === 200, 'Ohne Änderung am Verzeichnis darf Bene weiter schreiben');

  section('Das Log nennt den Namen, nicht die Rolle');
  r = await alsJson(await anfrage('GET', '/api/log'));
  ok(r.status === 200, 'Das Log ist öffentlich lesbar');
  ok(r.body.entries[0].actor === 'Bene', 'Der letzte Eintrag steht auf Bene', JSON.stringify(r.body.entries[0]));
  ok(r.body.entries.some((e) => e.actor === 'Admin'), 'Die Einrichtung steht auf Admin');

  section('Archivierte Affen kommen nicht mehr rein');
  r = await alsJson(await anfrage('POST', '/api/login', { body: { code: '9012' }, ip: '8.8.8.8' }));
  ok(r.status === 401, 'Tobi ist archiviert und wird abgewiesen', JSON.stringify(r));

  section('Sperre nach zu vielen Fehlversuchen');
  const angreifer = '6.6.6.6';
  let letzte;
  for (let i = 0; i < 7; i++) {
    letzte = await alsJson(await anfrage('POST', '/api/login', { body: { code: String(1000 + i) }, ip: angreifer }));
  }
  ok(letzte.status === 429, 'Nach sechs Fehlversuchen kommt 429', JSON.stringify(letzte));
  r = await alsJson(await anfrage('POST', '/api/login', { body: { code: '1234' }, ip: angreifer }));
  ok(r.status === 429, 'Auch der richtige Code wird während der Sperre abgewiesen');
  r = await alsJson(await anfrage('POST', '/api/login', { body: { code: '1234' }, ip: '5.5.5.5' }));
  ok(r.status === 200, 'Eine andere IP ist davon nicht betroffen');

  section('Codes auflisten verrät nur, WER einen hat');
  r = await alsJson(await anfrage('GET', '/api/codes', { token: adminToken }));
  ok(r.status === 200 && r.body.codes.maik === true, 'Admin sieht, wer einen Code hat');
  ok(JSON.stringify(r.body).indexOf('hash') < 0 && JSON.stringify(r.body).indexOf('salt') < 0,
    'Weder Hash noch Salt verlassen den Server', JSON.stringify(r.body));

  section('Code löschen');
  r = await alsJson(await anfrage('POST', '/api/codes', { token: adminToken, body: { playerId: 'bene', code: null } }));
  ok(r.status === 200 && r.body.gesetzt === false, 'Ein Code lässt sich löschen');
  r = await alsJson(await anfrage('POST', '/api/login', { body: { code: '5678' }, ip: '7.7.7.7' }));
  ok(r.status === 401, 'Danach kommt Bene nicht mehr rein');

  section('Abmelden beendet die Sitzung wirklich');
  r = await alsJson(await anfrage('POST', '/api/logout', { token: beneToken }));
  ok(r.status === 200, 'Abmelden geht');
  r = await alsJson(await anfrage('GET', '/api/me', { token: beneToken }));
  ok(r.status === 401, 'Das Token ist danach wertlos');

  section('Grenzen');
  r = await alsJson(await anfrage('PUT', '/api/data', {
    token: adminToken, body: { data: { fuellung: 'x'.repeat(500_000) }, baseRev: 2 }
  }));
  ok(r.status === 413, 'Zu große Dokumente werden abgewiesen', JSON.stringify(r).slice(0, 120));
  r = await alsJson(await anfrage('GET', '/api/gibtsnicht'));
  ok(r.status === 404, 'Unbekannte Pfade geben 404');

  console.log('\n' + (fails ? `${fails} von ${checks} fehlgeschlagen.` : `Alle ${checks} Prüfungen bestanden.`));
  process.exit(fails ? 1 : 0);
})();
