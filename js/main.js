import { api } from './daten/index.js';
import { TEST_KONTEN, TEST_CODE } from './daten/mock.js';

const app = document.getElementById('app');
let ich = null;
let abmeldenVonBeobachtung = null;

// ---------- Hilfen ----------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const datum = (iso) => iso ? new Date(iso).toLocaleDateString('de-DE') : '–';
const datumZeit = (iso) => new Date(iso).toLocaleString('de-DE',
  { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const gueltigBis = (d) => { if (!d) return null; const x = new Date(d); x.setFullYear(x.getFullYear() + 2); return x; };
const zuLokalInput = (d) => { const x = new Date(d); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0, 16); };
const formDaten = (form) => Object.fromEntries(new FormData(form));
const leerZuNull = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v === '' ? null : v]));

// Auswahl 1–5 als große Tippflächen, optional vorbelegt
const skala = (name, wert) => `<div class="skala">${[1, 2, 3, 4, 5].map((n) =>
  `<label><input type="radio" name="${name}" value="${n}" ${Number(wert) === n ? 'checked' : ''}><span>${n}</span></label>`).join('')}</div>`;
const BEWERTUNG = [['struktur_hf', 'Struktur HF (Taktik/Suche)'], ['suchverhalten', 'Suchverhalten Hund'],
  ['lenkbarkeit', 'Lenkbarkeit'], ['abstand_vp', 'Abstand bei Versteckperson']];
const STATUS = [['probezeit', 'in Probezeit'], ['helfer', 'Helfer ohne Hund'], ['hundefuehrer', 'Hundeführer:in']];

const WETTER = ['windstill', 'wechselnder Wind', 'starker Wind', 'trocken', 'sonnig', 'warm',
  'nass', 'kalt', 'leichter Regen', 'starker Regen', 'Schneefall', 'Schnee'];

// Status-Etikett: Helfer/Probezeit am Mitglied, Ausbildungsstand am Hund
function etikett(m) {
  if (m.status === 'probezeit') return { text: 'in Probezeit', klasse: 'probe' };
  const hund = m.hunde?.[0];
  if (m.status === 'helfer' || !hund) return { text: 'Helfer ohne Hund', klasse: 'helfer' };
  if (hund.status === 'geprueft') return { text: 'geprüft · Fläche', klasse: 'geprueft' };
  return { text: 'in Ausbildung', klasse: 'ausbildung' };
}
const etikettHtml = (m) => { const e = etikett(m); return `<span class="tag ${e.klasse}">${e.text}</span>`; };

function pruefungsHinweis(hund) {
  const bis = gueltigBis(hund?.letzte_pruefung);
  if (!bis) return '';
  const abgelaufen = bis < new Date();
  const inDreiMonaten = new Date(); inDreiMonaten.setMonth(inDreiMonaten.getMonth() + 3);
  const baldFaellig = !abgelaufen && bis < inDreiMonaten;
  return `<div class="klein ${abgelaufen || baldFaellig ? 'warn' : ''}">Prüfung gültig bis ${bis.toLocaleDateString('de-DE')}${abgelaufen ? ' – abgelaufen' : baldFaellig ? ' – bald fällig' : ''}</div>`;
}

// Einheitliche Symbole (eigene Linien-Icons, sehen auf allen Geräten gleich aus)
const IKONEN = {
  pfote: '<g fill="currentColor" stroke="none"><circle cx="5.5" cy="10" r="2.2"/><circle cx="9.5" cy="5.5" r="2.2"/><circle cx="14.5" cy="5.5" r="2.2"/><circle cx="18.5" cy="10" r="2.2"/><path d="M12 11.2c-3 0-6 4.1-6 6.7C6 19.6 7.4 21 9 21c1.2 0 2-.6 3-.6s1.8.6 3 .6c1.6 0 3-1.4 3-3.1 0-2.6-3-6.7-6-6.7z"/></g>',
  teams: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c1-3.5 3.5-5.5 6.5-5.5s5.5 2 6.5 5.5"/><circle cx="17" cy="9" r="2.8"/><path d="M16.6 14.6c2.5.2 4.3 2 4.9 4.9"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  liste: '<rect x="5" y="4" width="14" height="17" rx="2.5"/><path d="M9 3.5h6v3H9zM9 11h6M9 15h4"/>',
  person: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
  zurueck: '<path d="M15 5l-7 7 7 7"/>',
};
const ikon = (name, klasse = 'ikon') => `<svg class="${klasse}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IKONEN[name]}</svg>`;
const hundName = (name) => `<span class="mit-ikon">${ikon('pfote', 'ikon-klein')}${esc(name)}</span>`;
// Bewertung 1–5 als Punkte, für Vorlesehilfen als "4 von 5"
const punkte = (n) => n ? `<span class="punkte" role="img" aria-label="${n} von 5">${'●'.repeat(n)}${'○'.repeat(5 - n)}</span>` : '–';

// Kurze Bestätigung unten einblenden, ohne die Seite neu aufzubauen
function meldung(text) {
  app.querySelector('.meldung')?.remove();
  app.querySelector('main')?.insertAdjacentHTML('afterbegin', `<div class="meldung" role="status">${esc(text)}</div>`);
}

// Graue Platzhalter, falls das Laden spürbar dauert
let ladeTimer = null;
function ladeAnzeigeSpaeter() {
  clearTimeout(ladeTimer);
  ladeTimer = setTimeout(() => {
    app.innerHTML = `${kopf('')}<main aria-busy="true">${'<div class="karte platzhalter"><div></div><div></div></div>'.repeat(4)}</main>${ich ? tabs() : ''}`;
  }, 150);
}

function zeige(html) {
  clearTimeout(ladeTimer);
  app.innerHTML = html + (ich ? tabs() : '');
  const text = sessionStorage.getItem('rhs-meldung');
  if (text) { sessionStorage.removeItem('rhs-meldung'); meldung(text); }
  window.scrollTo(0, 0);
}
// Verständliche Meldungen statt technischer (oft englischer) Fehlertexte
const ohneNetz = (e) => !navigator.onLine || /failed to fetch|networkerror|load failed|network request failed/i.test(e?.message || '');
function fehlerText(e) {
  const t = e?.message || String(e);
  if (ohneNetz(e)) return 'Keine Internetverbindung. Bitte später noch einmal versuchen.';
  if (/signups not allowed|user not found/i.test(t)) return 'Diese E-Mail ist nicht freigeschaltet. Bitte bei den Trainern melden.';
  if (/token has expired|expired or is invalid/i.test(t)) return 'Code falsch oder abgelaufen. Bitte neuen Code anfordern.';
  if (/rate limit|only request this after/i.test(t)) return 'Zu viele Anfragen. Bitte eine Minute warten und dann erneut versuchen.';
  if (/row-level security|permission denied|keine berechtigung/i.test(t)) return 'Dafür fehlt dir die Berechtigung.';
  return t;
}
function fehler(e) { alert(fehlerText(e)); }

// Sperrt den Speichern-Knopf, solange gespeichert wird: doppeltes Tippen erzeugt sonst doppelte Einträge
async function sperrend(form, fn) {
  const knopf = form.querySelector('button:not([type=button])');
  if (knopf.disabled) return;
  knopf.disabled = true;
  try { await fn(); } catch (e) { fehler(e); } finally { knopf.disabled = false; }
}

// Zwischenspeicher für "Training eintragen": nichts geht verloren, wenn die App zugeht oder neu lädt
const entwurfSchluessel = () => `rhs-entwurf-${ich.id}`;
function entwurfLaden() {
  try { return JSON.parse(localStorage.getItem(entwurfSchluessel())) || {}; } catch { return {}; }
}
function entwurfSichern(aenderung) {
  try { localStorage.setItem(entwurfSchluessel(), JSON.stringify({ ...entwurfLaden(), ...aenderung })); } catch {}
}
function entwurfLoeschen() { try { localStorage.removeItem(entwurfSchluessel()); } catch {} }
function entwurfEinsetzen(form, paare = []) {
  for (const [name, wert] of paare) {
    const felder = form.querySelectorAll(`[name="${name}"]`);
    felder.forEach((f) => {
      if (f.type === 'checkbox' || f.type === 'radio') { if (f.value === wert) f.checked = true; }
      else f.value = wert;
    });
  }
}

// Kleiner Offline-Speicher: wer bin ich, welche Hunde habe ich (damit Eintragen auch ohne Netz geht)
const merke = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const gemerkt = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
const vergiss = (k) => { try { localStorage.removeItem(k); } catch {} };

// Ausgang: ohne Netz gespeicherte Einträge, werden automatisch gesendet, sobald wieder Netz da ist
const ausgangSchluessel = () => `rhs-ausgang-${ich.id}`;
const ausgang = () => (ich && gemerkt(ausgangSchluessel())) || [];
const ausgangText = (n) => n === 1 ? '1 Eintrag wartet auf Netz' : `${n} Einträge warten auf Netz`;
let sendetGerade = false;
async function sendeAusgang() {
  if (!ich || sendetGerade || !navigator.onLine || !ausgang().length) return;
  sendetGerade = true;
  const neueTagIds = {}; // lokale Trainingstag-ID → echte ID (mehrere Einträge können denselben Tag haben)
  const rest = [];
  let gesendet = 0;
  for (const p of ausgang()) {
    try {
      if (!p.tagId) {
        const { id: lokalId, ...tagDaten } = p.tag; // lokale ID nicht an die Datenbank schicken
        p.tagId = neueTagIds[lokalId] ?? (await api.legeTrainingstagAn(tagDaten)).id;
        neueTagIds[lokalId] = p.tagId;
      }
      await api.legeEintragAn({ ...p.eintrag, trainingstag_id: p.tagId });
      gesendet++;
    } catch { rest.push(p); }
  }
  merke(ausgangSchluessel(), rest);
  sendetGerade = false;
  if (gesendet) {
    sessionStorage.setItem('rhs-meldung', `${gesendet === 1 ? 'Offline gespeicherter Eintrag' : `${gesendet} offline gespeicherte Einträge`} gesendet ✓`);
    if (!location.hash.startsWith('#/eintragen')) route();
  }
}
window.addEventListener('online', sendeAusgang);
document.addEventListener('visibilitychange', () => { if (!document.hidden) sendeAusgang(); });

const initialen = (name) => (name || '?').split(/\s+/).map((t) => t[0]).join('').slice(0, 2).toUpperCase();

function kopf(titel, zurueck = null) {
  return `<header class="kopf">
    ${zurueck ? `<a class="zurueck" href="${zurueck}" aria-label="Zurück">${ikon('zurueck')}</a>` : `<span class="logo">${ikon('pfote')}</span>`}
    <h1>${esc(titel)}</h1>
    ${ich ? `<a class="avatar-knopf" href="#/profil" aria-label="Mein Profil">${esc(initialen(ich.name))}</a>` : ''}
  </header>
  ${api.modus === 'test' ? '<div class="testbanner"><span>Testmodus · Daten nur in diesem Browser</span></div>' : ''}`;
}

// Untere Navigation (Daumen-Reichweite am Handy)
function tabs() {
  const h = location.hash || '#/';
  const punkte = [
    ['#/', 'teams', 'Teams', h === '#/' || h.startsWith('#/team') || h.startsWith('#/tag')],
    ['#/eintragen', 'plus', 'Eintragen', h.startsWith('#/eintragen'), 'plus'],
    ...(ich.rolle === 'trainer' ? [['#/trainer', 'liste', 'Trainer', h === '#/trainer']] : []),
    ['#/profil', 'person', 'Profil', h === '#/profil'],
  ];
  return `<nav class="tabs">${punkte.map(([ziel, ico, text, aktiv, extra = '']) =>
    `<a href="${ziel}" class="${aktiv ? 'aktiv' : ''} ${extra}" ${aktiv ? 'aria-current="page"' : ''}><span class="ico">${ikon(ico)}</span>${text}</a>`).join('')}</nav>`;
}
function verdrahteKopf() {
  document.getElementById('abmelden')?.addEventListener('click', async () => {
    await api.abmelden(); ich = null; vergiss('rhs-ich'); location.hash = '#/login';
  });
}

// ---------- Login ----------
function seiteLogin() {
  let email = '';
  zeige(`${kopf('Trainingsbuch')}
    <main><div class="karte">
      <form id="f-email">
        <h2>Anmelden</h2>
        <p>Wir schicken dir einen 6-stelligen Code per E-Mail.</p>
        <label>E-Mail<input name="email" type="email" autocomplete="email" inputmode="email" required></label>
        <button class="haupt">Code anfordern</button>
      </form>
      <form id="f-code" hidden>
        <h2>Code eingeben</h2>
        <p id="code-hinweis"></p>
        <label>Code<input name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="10" pattern="[0-9]*" required></label>
        <button class="haupt">Anmelden</button>
        <button type="button" class="link" id="anders">Andere E-Mail</button>
      </form>
      ${api.modus === 'test' ? `<p class="klein hinweis">Testmodus: ${Object.keys(TEST_KONTEN).map(esc).join(', ')} · Code ${TEST_CODE}<br>
        <button type="button" class="link" id="reset">Testdaten auf Anfang zurücksetzen</button></p>` : ''}
    </div></main>`);
  const fE = document.getElementById('f-email');
  const fC = document.getElementById('f-code');
  fE.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    email = formDaten(fE).email;
    try {
      await api.sendeCode(email);
      fE.hidden = true; fC.hidden = false;
      document.getElementById('code-hinweis').textContent = `Code wurde an ${email} geschickt.`;
      fC.code.focus();
    } catch (e) { fehler(e); }
  });
  fC.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    try {
      await api.pruefeCode(email, formDaten(fC).code);
      ich = await api.ich();
      if (!ich) throw new Error('Dein Zugang ist nicht (mehr) freigeschaltet.');
      merke('rhs-ich', ich);
      location.hash = '#/';
    } catch (e) { fehler(e); }
  });
  document.getElementById('reset')?.addEventListener('click', () => {
    if (confirm('Alle Testeingaben in diesem Browser löschen?')) { localStorage.clear(); location.reload(); }
  });
  document.getElementById('anders').addEventListener('click', () => { fC.hidden = true; fE.hidden = false; });
}

// ---------- Übersicht ----------
let filter = 'alle';
async function seiteUebersicht() {
  const [mitglieder, tage] = await Promise.all([api.mitgliederMitHunden(), api.trainingstage()]);
  const wartend = ausgang().length;
  const nummer = (m) => parseInt((m.funkrufname || '').match(/\d+$/)?.[0] ?? '999', 10);
  mitglieder.sort((a, b) => nummer(a) - nummer(b) || a.name.localeCompare(b.name));
  const filterListe = [['alle', 'Alle'], ['geprueft', 'Geprüft'], ['ausbildung', 'Ausbildung'], ['helfer', 'Helfer'], ['probe', 'Probezeit']];
  const sichtbar = mitglieder.filter((m) => filter === 'alle' || etikett(m).klasse === filter);
  const geprueft = mitglieder.filter((m) => etikett(m).klasse === 'geprueft').length;
  zeige(`${kopf('Teams')}
    <main>
      <a class="haupt gross" href="#/eintragen">+ Training eintragen</a>
      <div class="kacheln">
        <div class="kachel"><b>${mitglieder.length}</b><span>Mitglieder</span></div>
        <div class="kachel"><b>${geprueft}</b><span>geprüft</span></div>
        <div class="kachel"><b>${tage.length}</b><span>Trainingstage</span></div>
      </div>
      ${wartend ? `<div class="entwurf">${ausgangText(wartend)} und wird automatisch gesendet.</div>` : ''}
      ${ich.rolle === 'trainer' ? '<a class="zweit" href="#/trainer">Trainer-Bereich</a>' : ''}
      <div class="filter">${filterListe.map(([k, t]) =>
        `<button data-filter="${k}" class="${filter === k ? 'aktiv' : ''}">${t}</button>`).join('')}</div>
      <ul class="liste">${sichtbar.map((m) => `
        <li><a href="#/team/${m.id}" class="${m.id === ich.id ? 'ich' : ''}">
          <div class="avatar ${etikett(m).klasse}">${nummer(m) < 999 ? nummer(m) : esc(initialen(m.name))}</div>
          <div class="team-text">
            <strong>${esc(m.name)}${m.id === ich.id ? ' <span class="klein">(ich)</span>' : ''}</strong>
            <div class="klein hund">${m.hunde.length ? hundName(m.hunde.map((h) => h.name).join(', ')) : esc(m.funkrufname || 'ohne Funkrufname')}</div>
            ${pruefungsHinweis(m.hunde.find((h) => h.status === 'geprueft'))}
          </div>
          ${etikettHtml(m)}
        </a></li>`).join('') || '<li class="leer">Keine Treffer</li>'}
      </ul>
      ${tage.length ? `<h2 class="abschnitt">Letzte Trainings</h2>
        <ul class="liste kompakt">${tage.slice(0, 5).map((t) => `<li><a href="#/tag/${t.id}">
          <div class="zeile"><strong>${esc(t.ort)}</strong><span class="klein">${datum(t.beginn)}</span></div>
          ${t.schwerpunkt ? `<div class="klein">${esc(t.schwerpunkt)}</div>` : ''}
        </a></li>`).join('')}</ul>` : ''}
    </main>`);
  verdrahteKopf();
  app.querySelectorAll('[data-filter]').forEach((b) => b.addEventListener('click', () => {
    filter = b.dataset.filter; seiteUebersicht();
  }));
}

// Notizliste mit Ändern/Löschen (Hundenotizen: Autor:in oder Trainer; Trainernotizen: Trainer)
function notizListe(notizen, typ) {
  const darf = (n) => ich.rolle === 'trainer' || (typ === 'hund' && n.autor_id === ich.id);
  const geaendert = (n) => n.geaendert_am && new Date(n.geaendert_am) - new Date(n.erstellt_am) > 1000 ? ' · geändert' : '';
  return `<ul class="notizen">${notizen.map((n) => `<li data-notiz="${n.id}" data-typ="${typ}">
    <div class="notiz-text">${esc(n.text)}</div>
    <div class="klein notiz-fuss">${esc(n.autor)} · ${datum(n.erstellt_am)}${geaendert(n)}
      ${darf(n) ? '<span class="notiz-knoepfe"><button type="button" class="link" data-aktion="aendern">Ändern</button><button type="button" class="link gefahr" data-aktion="loeschen">Löschen</button></span>' : ''}</div>
  </li>`).join('') || '<li class="leer">Noch keine Notizen</li>'}</ul>`;
}
function verdrahteNotizen(nachAenderung) {
  app.querySelectorAll('[data-notiz] [data-aktion]').forEach((b) => b.addEventListener('click', async () => {
    const li = b.closest('[data-notiz]');
    const { notiz: nid, typ } = li.dataset;
    if (b.dataset.aktion === 'loeschen') {
      if (!confirm('Notiz löschen?')) return;
      try { await api.loescheNotiz(typ, nid); await nachAenderung('Notiz gelöscht'); } catch (e) { fehler(e); }
      return;
    }
    // Ändern direkt in der Liste
    const alt = li.querySelector('.notiz-text').textContent;
    li.innerHTML = `<form class="f-notiz-aendern"><textarea name="text" rows="3" required>${esc(alt)}</textarea>
      <div class="knopfzeile"><button class="haupt">Speichern</button><button type="button" class="link" data-abbrechen>Abbrechen</button></div></form>`;
    const f = li.querySelector('form');
    f.text.focus();
    f.querySelector('[data-abbrechen]').addEventListener('click', () => nachAenderung(null));
    f.addEventListener('submit', (ev) => {
      ev.preventDefault();
      sperrend(f, async () => { await api.aendereNotiz(typ, nid, f.text.value.trim()); await nachAenderung('Notiz geändert ✓'); });
    });
  }));
}

// Trainerbewertung abgeben/ändern; auf Team- und Trainingstag-Seite
function bewertungsFormular(e, offen = false) {
  return `<details class="bewerten" ${offen ? 'open' : ''}>
    <summary>${e.bewertung ? 'Trainerbewertung ändern' : 'Trainerbewertung abgeben'}</summary>
    <form class="f-bewertung" data-eintrag="${e.id}">
      ${BEWERTUNG.map(([k, t]) => `<fieldset><legend>${t}</legend>${skala(k, e.bewertung?.[k])}</fieldset>`).join('')}
      <label>Kommentar<textarea name="kommentar" rows="2">${esc(e.bewertung?.kommentar)}</textarea></label>
      <button class="haupt">Bewertung speichern</button>
    </form></details>`;
}
function verdrahteBewertungen(nachSpeichern) {
  app.querySelectorAll('.f-bewertung').forEach((f) => f.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const d = formDaten(f);
    const felder = { kommentar: d.kommentar || null };
    for (const [k] of BEWERTUNG) felder[k] = d[k] ? Number(d[k]) : null;
    sperrend(f, async () => { await api.speichereBewertung(f.dataset.eintrag, felder); await nachSpeichern(f.dataset.eintrag, f); });
  }));
}

// Felder eines Trainingseintrags (Team-Teil); für Neu-Anlage und Bearbeiten
function eintragFelder(e, hunde) {
  const w = (k) => esc(e[k]);
  return `${hunde.length > 1 ? `<label>Hund<select name="hund_id">${hunde.map((h) =>
      `<option value="${h.id}" ${e.hund_id === h.id ? 'selected' : ''}>${esc(h.name)}</option>`).join('')}</select></label>`
    : hunde.length === 1 ? `<input type="hidden" name="hund_id" value="${hunde[0].id}"><p>Hund: <strong>${esc(hunde[0].name)}</strong></p>`
    : '<p class="klein">Kein Hund hinterlegt – Eintrag als Helfer.</p>'}
    <label>Versteckperson(en)<input name="versteckperson" value="${w('versteckperson')}"></label>
    <label>Besonderheiten Versteck<input name="versteck_besonderheiten" value="${w('versteck_besonderheiten')}"></label>
    <label>Wie hat der Hund gearbeitet?<textarea name="arbeit_hund" rows="3">${w('arbeit_hund')}</textarea></label>
    <fieldset><legend>Selbstbewertung (1 = schwach, 5 = sehr gut)</legend>${skala('selbstbewertung', e.selbstbewertung)}</fieldset>
    <label>Kommentar zur Selbstbewertung<textarea name="selbst_kommentar" rows="2">${w('selbst_kommentar')}</textarea></label>
    <label>Mein Ziel<input name="ziel" value="${w('ziel')}"></label>
    <fieldset><legend>Ziel erreicht?</legend>
      <div class="skala drei">${['ja', 'teilweise', 'nein'].map((z) =>
        `<label><input type="radio" name="ziel_erreicht" value="${z}" ${e.ziel_erreicht === z ? 'checked' : ''}><span>${z}</span></label>`).join('')}</div>
    </fieldset>
    <label>Notiz<textarea name="notiz" rows="2">${w('notiz')}</textarea></label>`;
}
const eintragAusForm = (form) => {
  const d = leerZuNull(formDaten(form));
  return { ...d, hund_id: d.hund_id ?? null, selbstbewertung: d.selbstbewertung ? Number(d.selbstbewertung) : null,
    ziel_erreicht: d.ziel_erreicht ?? null };
};

// Felder eines Trainingstags; für Neu-Anlage und Ändern
function tagFelder(t = {}) {
  return `<label>Datum und Uhrzeit<input name="beginn" type="datetime-local" value="${zuLokalInput(t.beginn || new Date())}" required></label>
    <label>Ort<input name="ort" required placeholder="z. B. Waldstück Nord" value="${esc(t.ort)}"></label>
    <fieldset><legend>Wetter &amp; Umgebung</legend>
      <div class="chips">${WETTER.map((w) => `<label class="chip"><input type="checkbox" name="wetter" value="${w}" ${t.wetter?.includes(w) ? 'checked' : ''}><span>${w}</span></label>`).join('')}</div>
    </fieldset>
    <label>Besonderheiten Wetter<input name="wetter_notiz" value="${esc(t.wetter_notiz)}"></label>
    <label>Gelände<textarea name="gelaende" rows="2">${esc(t.gelaende)}</textarea></label>
    <label>Übungsschwerpunkt<textarea name="schwerpunkt" rows="2">${esc(t.schwerpunkt)}</textarea></label>`;
}
const tagAusForm = (form) => {
  const d = leerZuNull(formDaten(form));
  return { ...d, beginn: new Date(d.beginn).toISOString(), wetter: new FormData(form).getAll('wetter') };
};

// ---------- Training eintragen ----------
async function seiteEintragen(vorTagId = null) {
  const heute = new Date(); heute.setHours(0, 0, 0, 0);
  // Ohne Netz: keine Liste der heutigen Tage, eigene Hunde aus dem Speicher
  let tage = [], meine = gemerkt(`rhs-hunde-${ich.id}`) || [], offline = false, letzter = null;
  try {
    [tage, { hunde: meine }, [letzter = null]] = await Promise.all([
      api.trainingstage({ seit: heute.toISOString() }), api.mitglied(ich.id), api.eintraegeVon(ich.id)]);
    merke(`rhs-hunde-${ich.id}`, meine);
  } catch (e) { if (!ohneNetz(e)) throw e; offline = true; }
  if (vorTagId && !tage.some((t) => t.id === vorTagId) && !offline) {
    const t = await api.trainingstag(vorTagId);
    if (t) tage.unshift(t);
  }

  zeige(`${kopf('Training eintragen', '#/')}
    <main>
      ${offline ? '<div class="entwurf">Kein Netz: Du kannst trotzdem eintragen. Der Eintrag wird gesendet, sobald wieder Netz da ist.</div>' : ''}
      <ol class="schritte"><li class="aktiv" id="s1">1 Trainingstag</li><li id="s2">2 Mein Team</li></ol>
      <div class="entwurf" id="entwurf-hinweis" hidden>Angefangener Eintrag wiederhergestellt.
        <button type="button" class="link" id="entwurf-weg">Verwerfen</button></div>

      <section id="schritt1" class="karte">
        ${tage.length ? `<h2>${vorTagId ? 'Trainingstag' : 'Heutiger Trainingstag'}</h2>
          ${tage.map((t) => `<button class="wahl" data-tag="${t.id}">
            <strong>${esc(t.ort)}</strong><span class="klein">${datumZeit(t.beginn)}${t.wetter.length ? ' · ' + esc(t.wetter.join(', ')) : ''}</span>
          </button>`).join('')}
          <details class="trenner"><summary>Anderen Trainingstag neu anlegen</summary>` : '<h2>Neuer Trainingstag</h2>'}
        <form id="f-tag">
          ${letzter ? `<button type="button" class="vorlage" id="wie-zuletzt-tag">↺ Ort und Gelände wie zuletzt<span class="klein">${esc(letzter.tag.ort)}</span></button>` : ''}
          ${tagFelder()}
          <button class="haupt">Weiter</button>
        </form>
        ${tage.length ? '</details>' : ''}
      </section>

      <section id="schritt2" class="karte" hidden>
        <p class="klein" id="tag-info"></p>
        <form id="f-eintrag">
          ${letzter && (letzter.ziel || letzter.versteckperson) ? `<button type="button" class="vorlage" id="wie-zuletzt-eintrag">↺ Ziel und Versteckperson wie zuletzt<span class="klein">${esc([letzter.ziel, letzter.versteckperson].filter(Boolean).join(' · '))}</span></button>` : ''}
          ${eintragFelder({}, meine)}
          <button class="haupt">Speichern</button>
          <button type="button" class="link" id="zurueck1">Zurück zum Trainingstag</button>
        </form>
      </section>
    </main>`);
  verdrahteKopf();

  let tag = null;
  const zuSchritt2 = (t) => {
    tag = t;
    entwurfSichern({ tagId: t.id, lokalerTag: t.lokal ? t : null });
    document.getElementById('schritt1').hidden = true;
    document.getElementById('schritt2').hidden = false;
    document.getElementById('s1').classList.remove('aktiv');
    document.getElementById('s2').classList.add('aktiv');
    document.getElementById('tag-info').textContent = `${t.ort} · ${datumZeit(t.beginn)}`;
    window.scrollTo(0, 0);
  };
  app.querySelectorAll('[data-tag]').forEach((b) => b.addEventListener('click', () =>
    zuSchritt2(tage.find((t) => t.id === b.dataset.tag))));

  const fTag = document.getElementById('f-tag');
  const fE = document.getElementById('f-eintrag');

  // Angefangenen Eintrag wiederherstellen
  const entwurf = entwurfLaden();
  if (entwurf.tag || entwurf.eintrag) {
    entwurfEinsetzen(fTag, entwurf.tag);
    entwurfEinsetzen(fE, entwurf.eintrag);
    document.getElementById('entwurf-hinweis').hidden = false;
    const gemerkterTag = tage.find((t) => t.id === entwurf.tagId)
      || (entwurf.lokalerTag?.id === entwurf.tagId ? entwurf.lokalerTag : null);
    if (gemerkterTag) zuSchritt2(gemerkterTag);
    else if (fTag.ort.value) fTag.closest('details')?.setAttribute('open', '');
  }
  if (vorTagId && !tag && tage[0]?.id === vorTagId) zuSchritt2(tage[0]);
  document.getElementById('entwurf-weg').addEventListener('click', () => { entwurfLoeschen(); seiteEintragen(); });
  // "Wie zuletzt": Felder aus dem letzten eigenen Eintrag übernehmen (danach frei änderbar)
  const uebernimm = (form, felder) => {
    for (const [name, wert] of Object.entries(felder)) if (wert) form[name].value = wert;
    form.dispatchEvent(new Event('input'));
  };
  document.getElementById('wie-zuletzt-tag')?.addEventListener('click', (ev) => {
    uebernimm(fTag, { ort: letzter.tag.ort, gelaende: letzter.tag.gelaende }); ev.currentTarget.remove();
  });
  document.getElementById('wie-zuletzt-eintrag')?.addEventListener('click', (ev) => {
    uebernimm(fE, { ziel: letzter.ziel, versteckperson: letzter.versteckperson, versteck_besonderheiten: letzter.versteck_besonderheiten });
    ev.currentTarget.remove();
  });
  fTag.addEventListener('input', () => entwurfSichern({ tag: [...new FormData(fTag)] }));
  fE.addEventListener('input', () => entwurfSichern({ eintrag: [...new FormData(fE)] }));

  fTag.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const d = tagAusForm(fTag);
    sperrend(fTag, async () => {
      try { zuSchritt2(await api.legeTrainingstagAn(d)); } catch (e) {
        if (!ohneNetz(e)) throw e;
        zuSchritt2({ ...d, id: `lokal-${Date.now()}`, lokal: true }); // wird später mit dem Eintrag gesendet
      }
    });
  });
  document.getElementById('zurueck1').addEventListener('click', () => {
    entwurfSichern({ tagId: null });
    seiteEintragen();
  });

  fE.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const d = { ...eintragAusForm(fE), mitglied_id: ich.id };
    sperrend(fE, async () => {
      try {
        if (tag.lokal) throw new TypeError('Failed to fetch');
        await api.legeEintragAn({ ...d, trainingstag_id: tag.id });
      } catch (e) {
        if (!ohneNetz(e)) throw e;
        // Ohne Netz in den Ausgang legen; wird automatisch gesendet
        const { lokal, ...tagDaten } = tag;
        merke(ausgangSchluessel(), [...ausgang(), { tagId: lokal ? null : tag.id, tag: lokal ? tagDaten : null, eintrag: d }]);
        entwurfLoeschen();
        sessionStorage.setItem('rhs-meldung', 'Kein Netz: Eintrag ist auf dem Handy gespeichert und wird automatisch gesendet ✓');
        location.hash = '#/';
        return;
      }
      entwurfLoeschen();
      sessionStorage.setItem('rhs-meldung', 'Training gespeichert ✓');
      location.hash = `#/team/${ich.id}`;
    });
  });
}

// ---------- Team-Detail ----------
async function seiteTeam(mid, offenerEintrag = null) {
  const m = await api.mitglied(mid);
  if (!m) { zeige(`${kopf('Nicht gefunden', '#/')}`); verdrahteKopf(); return; }
  const darfAendern = ich.rolle === 'trainer' || ich.id === m.id;
  const eintraege = await api.eintraegeVon(mid);
  const notizen = Object.fromEntries(await Promise.all(m.hunde.map(async (h) => [h.id, await api.hundenotizen(h.id)])));

  zeige(`${kopf(m.name, '#/')}
    <main>
      <section class="karte">
        <div class="zeile"><strong>${esc(m.funkrufname || 'ohne Funkrufname')}</strong>${etikettHtml(m)}</div>
        ${darfAendern ? `<details><summary>Stammdaten ändern</summary>
          <form id="f-mitglied">
            <label>Funkrufname<input name="funkrufname" value="${esc(m.funkrufname)}" placeholder="Demo RHT …"></label>
            <label>Status<select name="status">
              ${STATUS.map(([k, t]) =>
                `<option value="${k}" ${m.status === k ? 'selected' : ''}>${t}</option>`).join('')}
            </select></label>
            <button class="haupt">Speichern</button>
          </form></details>` : ''}
      </section>

      ${m.hunde.map((h) => `<section class="karte">
        <h2>${hundName(h.name)}</h2>
        <div class="klein">${h.status === 'geprueft' ? 'geprüftes Rettungshundeteam Sparte Fläche' : 'in Ausbildung'} · letzte Prüfung ${datum(h.letzte_pruefung)}</div>
        ${pruefungsHinweis(h)}
        ${darfAendern ? `<details><summary>Hund ändern</summary>
          <form class="f-hund" data-hund="${h.id}">
            <label>Ausbildungsstand<select name="status">
              <option value="ausbildung" ${h.status === 'ausbildung' ? 'selected' : ''}>in Ausbildung</option>
              <option value="geprueft" ${h.status === 'geprueft' ? 'selected' : ''}>geprüft (Fläche)</option>
            </select></label>
            <label>Letzte Prüfung<input type="date" name="letzte_pruefung" value="${h.letzte_pruefung || ''}"></label>
            <button class="haupt">Speichern</button>
          </form></details>` : ''}
        <h3>Notizen zum Hund</h3>
        <form class="f-notiz inline" data-hund="${h.id}">
          <input name="text" placeholder="Neue Notiz …" required><button>+</button>
        </form>
        ${notizListe(notizen[h.id], 'hund')}
      </section>`).join('')}

      ${darfAendern ? `<details class="karte"><summary>+ Hund hinzufügen</summary>
        <form id="f-neuer-hund">
          <label>Name des Hundes<input name="name" required></label>
          <label>Ausbildungsstand<select name="status">
            <option value="ausbildung">in Ausbildung</option><option value="geprueft">geprüft (Fläche)</option>
          </select></label>
          <label>Letzte Prüfung<input type="date" name="letzte_pruefung"></label>
          <button class="haupt">Hund speichern</button>
        </form></details>` : ''}

      <section>
        <h2 class="abschnitt">Trainingsverlauf</h2>
        ${eintraege.length ? eintraege.map((e) => `<details class="karte eintrag" id="e-${e.id}" ${e.id === offenerEintrag ? 'open' : ''}>
          <summary><strong>${datum(e.tag.beginn)}</strong> · ${esc(e.tag.ort)}
            <span class="klein">${e.hund ? hundName(e.hund.name) + ' · ' : ''}Selbst: ${punkte(e.selbstbewertung)}${e.ziel_erreicht ? ' · Ziel: ' + e.ziel_erreicht : ''}</span></summary>
          <dl>
            <dt>Trainingstag</dt><dd><a href="#/tag/${e.tag.id}">alle Einträge dieses Tages</a></dd>
            <dt>Wetter</dt><dd>${esc(e.tag.wetter.join(', ') || '–')}${e.tag.wetter_notiz ? ' – ' + esc(e.tag.wetter_notiz) : ''}</dd>
            <dt>Gelände</dt><dd>${esc(e.tag.gelaende || '–')}</dd>
            <dt>Schwerpunkt</dt><dd>${esc(e.tag.schwerpunkt || '–')}</dd>
            <dt>Versteckperson</dt><dd>${esc(e.versteckperson || '–')}${e.versteck_besonderheiten ? ' – ' + esc(e.versteck_besonderheiten) : ''}</dd>
            <dt>Arbeit des Hundes</dt><dd>${esc(e.arbeit_hund || '–')}</dd>
            <dt>Selbstbewertung</dt><dd>${punkte(e.selbstbewertung)} ${esc(e.selbst_kommentar || '')}</dd>
            <dt>Ziel</dt><dd>${esc(e.ziel || '–')}${e.ziel_erreicht ? ' (' + e.ziel_erreicht + ')' : ''}</dd>
            ${e.notiz ? `<dt>Notiz</dt><dd>${esc(e.notiz)}</dd>` : ''}
          </dl>
          ${e.bewertung ? `<div class="bewertung"><h3>Trainerbewertung <span class="klein">(nur für dich und die Trainer)</span></h3>
            <dl>
              <dt>Struktur HF (Taktik/Suche)</dt><dd>${punkte(e.bewertung.struktur_hf)}</dd>
              <dt>Suchverhalten Hund</dt><dd>${punkte(e.bewertung.suchverhalten)}</dd>
              <dt>Lenkbarkeit</dt><dd>${punkte(e.bewertung.lenkbarkeit)}</dd>
              <dt>Abstand bei Versteckperson</dt><dd>${punkte(e.bewertung.abstand_vp)}</dd>
              ${e.bewertung.kommentar ? `<dt>Kommentar</dt><dd>${esc(e.bewertung.kommentar)}</dd>` : ''}
            </dl></div>` : ''}
          ${ich.rolle === 'trainer' ? bewertungsFormular(e, e.id === offenerEintrag && !e.bewertung) : ''}
          ${darfAendern ? `<details class="bewerten"><summary>Eintrag bearbeiten</summary>
            <form class="f-eintrag-aendern" data-eintrag="${e.id}">${eintragFelder(e, m.hunde)}
              <button class="haupt">Änderungen speichern</button>
            </form></details>
            <button type="button" class="link gefahr" data-loeschen="${e.id}">Eintrag löschen</button>` : ''}
        </details>`).join('') : `<div class="karte leer-karte"><p>Noch keine Trainingseinträge.</p>${m.id === ich.id ? '<a class="zweit" href="#/eintragen">+ Erstes Training eintragen</a>' : ''}</div>`}
      </section>
    </main>`);
  verdrahteKopf();

  if (offenerEintrag) document.getElementById(`e-${offenerEintrag}`)?.scrollIntoView();
  const fertig = (text, eid = null) => { sessionStorage.setItem('rhs-meldung', text); return seiteTeam(mid, eid); };
  document.getElementById('f-neuer-hund')?.addEventListener('submit', (ev) => {
    ev.preventDefault();
    sperrend(ev.target, async () => {
      await api.legeHundAn({ ...leerZuNull(formDaten(ev.target)), mitglied_id: mid });
      if (m.status !== 'hundefuehrer') await api.aendereMitglied(mid, { status: 'hundefuehrer' });
      await fertig('Hund gespeichert ✓');
    });
  });
  verdrahteBewertungen((eid) => fertig('Bewertung gespeichert ✓', eid));
  document.getElementById('f-mitglied')?.addEventListener('submit', (ev) => {
    ev.preventDefault();
    sperrend(ev.target, async () => { await api.aendereMitglied(mid, leerZuNull(formDaten(ev.target))); await fertig('Gespeichert ✓'); });
  });
  app.querySelectorAll('.f-hund').forEach((f) => f.addEventListener('submit', (ev) => {
    ev.preventDefault();
    sperrend(f, async () => { await api.aendereHund(f.dataset.hund, leerZuNull(formDaten(f))); await fertig('Gespeichert ✓'); });
  }));
  app.querySelectorAll('.f-eintrag-aendern').forEach((f) => f.addEventListener('submit', (ev) => {
    ev.preventDefault();
    sperrend(f, async () => { await api.aendereEintrag(f.dataset.eintrag, eintragAusForm(f)); await fertig('Eintrag geändert ✓', f.dataset.eintrag); });
  }));
  app.querySelectorAll('[data-loeschen]').forEach((b) => b.addEventListener('click', async () => {
    if (!confirm('Diesen Trainingseintrag wirklich löschen?')) return;
    try { await api.loescheEintrag(b.dataset.loeschen); await fertig('Eintrag gelöscht'); } catch (e) { fehler(e); }
  }));
  verdrahteNotizen(async (text) => {
    const y = scrollY;
    if (text) sessionStorage.setItem('rhs-meldung', text);
    await seiteTeam(mid); scrollTo(0, y);
  });
  app.querySelectorAll('.f-notiz').forEach((f) => f.addEventListener('submit', (ev) => {
    ev.preventDefault();
    sperrend(f, async () => { await api.legeHundenotizAn(f.dataset.hund, formDaten(f).text); await fertig('Notiz gespeichert ✓'); });
  }));
}

// ---------- Trainer-Bereich ----------
// Offene Bewertungen nach Trainingstag gruppieren, neuester Tag zuerst
function tageMitOffenen(offen) {
  const tage = new Map();
  for (const e of offen) {
    const g = tage.get(e.tag.id) || { tag: e.tag, anzahl: 0, namen: [] };
    g.anzahl++; g.namen.push(e.mitglied?.name || '?');
    tage.set(e.tag.id, g);
  }
  return [...tage.values()];
}
async function seiteTrainer() {
  if (ich.rolle !== 'trainer') { location.hash = '#/'; return; }
  const [eintraege, notizen] = await Promise.all([api.letzteEintraege(30), api.trainernotizen()]);
  const offen = eintraege.filter((e) => !e.bewertet);
  zeige(`${kopf('Trainer-Bereich', '#/')}
    <main>
      <section class="karte">
        <h2>Noch nicht bewertet (${offen.length})</h2>
        <ul class="liste kompakt">${tageMitOffenen(offen).map(({ tag, anzahl, namen }) => `<li><a href="#/tag/${tag.id}">
          <div class="zeile"><strong>${esc(tag.ort)}</strong><span class="klein">${datum(tag.beginn)}</span></div>
          <div class="klein">${anzahl} offen: ${esc(namen.join(', '))} · am Stück bewerten ›</div>
        </a></li>`).join('') || '<li class="leer">Alles bewertet ✓</li>'}</ul>
      </section>

      <section class="karte">
        <h2>Trainernotizen <span class="klein">(nur die Trainer sehen sie)</span></h2>
        <form id="f-tnotiz">
          <label>Neue Notiz<textarea name="text" rows="3" required></textarea></label>
          <button class="haupt">Notiz speichern</button>
        </form>
        ${notizListe(notizen, 'trainer')}
      </section>

      <details class="karte"><summary>+ Neues Mitglied anlegen</summary>
        <form id="f-mitglied-neu">
          <label>Name<input name="name" required></label>
          <label>Funkrufname (optional)<input name="funkrufname" placeholder="Demo RHT …"></label>
          <label>Status<select name="status">${STATUS.map(([k, t]) => `<option value="${k}">${t}</option>`).join('')}</select></label>
          <label>Hund (optional)<input name="hund" placeholder="Name des Hundes"></label>
          <p class="klein">Den Login per E-Mail-Einladung gibt es erst im Echtbetrieb mit Supabase.</p>
          <button class="haupt">Mitglied speichern</button>
        </form></details>
    </main>`);
  verdrahteKopf();

  const neuLaden = (text) => { sessionStorage.setItem('rhs-meldung', text); return seiteTrainer(); };
  document.getElementById('f-tnotiz').addEventListener('submit', (ev) => {
    ev.preventDefault();
    sperrend(ev.target, async () => { await api.legeTrainernotizAn(formDaten(ev.target).text); await neuLaden('Notiz gespeichert ✓'); });
  });
  verdrahteNotizen(async (text) => {
    const y = scrollY;
    if (text) sessionStorage.setItem('rhs-meldung', text);
    await seiteTrainer(); scrollTo(0, y);
  });
  document.getElementById('f-mitglied-neu').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const { hund, ...d } = leerZuNull(formDaten(ev.target));
    sperrend(ev.target, async () => {
      const neu = await api.legeMitgliedAn({ ...d, status: hund ? 'hundefuehrer' : d.status });
      if (hund) await api.legeHundAn({ mitglied_id: neu.id, name: hund });
      sessionStorage.setItem('rhs-meldung', `${neu.name} angelegt ✓`);
      location.hash = `#/team/${neu.id}`;
    });
  });
}

// ---------- Trainingstag ----------
async function seiteTag(tid) {
  const t = await api.trainingstag(tid);
  if (!t) { zeige(`${kopf('Nicht gefunden', '#/')}`); verdrahteKopf(); return; }
  const eintraege = await api.eintraegeVomTag(tid);
  const darfAendern = ich.rolle === 'trainer' || t.erstellt_von === ich.id;
  zeige(`${kopf(t.ort, '#/')}
    <main>
      <section class="karte">
        <div class="zeile"><strong>${datumZeit(t.beginn)}</strong></div>
        <dl>
          <dt>Wetter</dt><dd>${esc(t.wetter.join(', ') || '–')}${t.wetter_notiz ? ' – ' + esc(t.wetter_notiz) : ''}</dd>
          <dt>Gelände</dt><dd>${esc(t.gelaende || '–')}</dd>
          <dt>Schwerpunkt</dt><dd>${esc(t.schwerpunkt || '–')}</dd>
        </dl>
        ${darfAendern ? `<details class="bewerten"><summary>Trainingstag ändern</summary>
          <form id="f-tag-aendern">${tagFelder(t)}<button class="haupt">Änderungen speichern</button></form>
        </details>` : ''}
      </section>
      <a class="zweit" href="#/eintragen/${t.id}">+ Meinen Eintrag zu diesem Tag</a>
      <h2 class="abschnitt">Einträge (${eintraege.length})${ich.rolle === 'trainer' && eintraege.length
        ? ` · ${eintraege.filter((e) => !e.bewertung).length} offen` : ''}</h2>
      ${eintraege.map((e) => `<section class="karte tag-eintrag ${e.mitglied_id === ich.id ? 'ich' : ''}" id="e-${e.id}">
        <a class="tag-eintrag-kopf" href="#/team/${e.mitglied_id}/${e.id}">
          <div class="zeile"><strong>${esc(e.mitglied?.name)}</strong>${e.hund ? `<span class="klein">${hundName(e.hund.name)}</span>` : ''}</div>
          <div class="klein">Selbst: ${punkte(e.selbstbewertung)}${e.ziel_erreicht ? ' · Ziel: ' + esc(e.ziel_erreicht) : ''}${e.bewertung ? ' · <span class="ok">Trainerbewertung ✓</span>' : ''}</div>
          ${e.arbeit_hund ? `<div class="klein">${esc(e.arbeit_hund)}</div>` : ''}
        </a>
        ${ich.rolle === 'trainer' ? bewertungsFormular(e) : ''}
      </section>`).join('') || '<div class="karte leer-karte"><p>Noch keine Einträge an diesem Tag.</p></div>'}
    </main>`);
  verdrahteKopf();
  // Nach dem Bewerten auf der Seite bleiben, damit der Trainer direkt das nächste Team bewerten kann
  verdrahteBewertungen((eid, form) => {
    const det = form.closest('details');
    det.open = false;
    det.querySelector('summary').textContent = 'Trainerbewertung ändern';
    const kopfZeile = det.parentElement.querySelector('.tag-eintrag-kopf .klein');
    if (!kopfZeile.querySelector('.ok')) kopfZeile.insertAdjacentHTML('beforeend', ' · <span class="ok">Trainerbewertung ✓</span>');
    const offen = app.querySelectorAll('.tag-eintrag').length - app.querySelectorAll('.tag-eintrag .ok').length;
    const h = app.querySelector('h2.abschnitt');
    h.textContent = h.textContent.replace(/· \d+ offen/, `· ${offen} offen`);
    meldung(offen ? `Bewertung gespeichert ✓ · noch ${offen} offen` : 'Alle Teams dieses Tages bewertet ✓');
    det.parentElement.nextElementSibling?.querySelector('details.bewerten')?.setAttribute('open', '');
  });
  document.getElementById('f-tag-aendern')?.addEventListener('submit', (ev) => {
    ev.preventDefault();
    sperrend(ev.target, async () => {
      await api.aendereTrainingstag(tid, tagAusForm(ev.target));
      sessionStorage.setItem('rhs-meldung', 'Trainingstag geändert ✓');
      await seiteTag(tid);
    });
  });
}

// ---------- Mein Profil ----------
async function seiteProfil() {
  const m = await api.mitglied(ich.id);
  const wartend = ausgang().length;
  const iphone = /iphone|ipad/i.test(navigator.userAgent);
  const installiert = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  zeige(`${kopf('Mein Profil', '#/')}
    <main>
      <section class="karte">
        <div class="zeile"><strong>${esc(m.name)}</strong>${etikettHtml(m)}</div>
        <div class="klein">${esc(m.funkrufname || 'ohne Funkrufname')} · ${ich.rolle === 'trainer' ? 'Trainer:in' : 'Mitglied'}</div>
        ${m.hunde.map((h) => `<div>${hundName(h.name)}</div>${pruefungsHinweis(h)}`).join('')}
        <a class="zweit" href="#/team/${m.id}" style="margin-top:12px">Meine Daten, Hunde und Trainings</a>
      </section>
      ${wartend ? `<section class="karte"><h2>Offline gespeichert</h2>
        <p>${ausgangText(wartend)}. Er wird automatisch gesendet, sobald du wieder Netz hast.</p>
        <button class="haupt" id="jetzt-senden">Jetzt senden</button></section>` : ''}
      ${installiert ? '' : `<section class="karte"><h2>Als App aufs Handy</h2>
        <p class="klein">${iphone ? 'In Safari unten auf das Teilen-Symbol tippen, dann „Zum Home-Bildschirm“.'
          : 'Im Browser-Menü ⋮ „App installieren“ oder „Zum Startbildschirm hinzufügen“ wählen.'}
          Danach startet das Trainingsbuch wie eine App, auch ohne Netz.</p></section>`}
      <button class="haupt" id="abmelden">Abmelden</button>
      ${api.modus === 'test' ? '<button type="button" class="link" id="reset">Testdaten auf Anfang zurücksetzen</button>' : ''}
    </main>`);
  verdrahteKopf();
  document.getElementById('jetzt-senden')?.addEventListener('click', async () => {
    await sendeAusgang();
    if (ausgang().length) alert(navigator.onLine ? 'Senden hat nicht geklappt. Bitte später noch einmal versuchen.' : 'Noch keine Internetverbindung.');
  });
  document.getElementById('reset')?.addEventListener('click', () => {
    if (confirm('Alle Testeingaben in diesem Browser löschen?')) { localStorage.clear(); location.hash = '#/login'; location.reload(); }
  });
}

// Wenn ohne Netz nichts geladen werden kann: Eintragen geht trotzdem
function seiteOffline() {
  const wartend = ich ? ausgang().length : 0;
  zeige(`${kopf('Trainingsbuch')}
    <main><div class="karte">
      <h2>Kein Netz</h2>
      <p>Lesen geht nur mit Internet. Ein Training eintragen kannst du trotzdem, es wird dann automatisch gesendet.</p>
      ${wartend ? `<p class="klein">${ausgangText(wartend)}.</p>` : ''}
      ${ich ? '<a class="haupt gross" href="#/eintragen">+ Training eintragen</a>' : ''}
      <button class="link" onclick="location.reload()">Erneut versuchen</button>
    </div></main>`);
}

// ---------- Router ----------
async function route() {
  try {
    if (!ich) { ich = await api.ich(); if (ich) merke('rhs-ich', ich); else vergiss('rhs-ich'); }
  } catch (e) {
    // Ohne Netz mit der zuletzt bekannten Anmeldung weiterarbeiten
    if (ohneNetz(e) && gemerkt('rhs-ich')) ich = gemerkt('rhs-ich');
    else {
      zeige(`${kopf('Trainingsbuch')}<main><div class="karte"><p>${esc(fehlerText(e))}</p>
        <button class="haupt" onclick="location.reload()">Erneut versuchen</button></div></main>`);
      return;
    }
  }
  const hash = location.hash || '#/';
  if (!ich) { if (hash !== '#/login') location.hash = '#/login'; else seiteLogin(); return; }
  abmeldenVonBeobachtung?.(); abmeldenVonBeobachtung = null;
  ladeAnzeigeSpaeter();
  try {
    if (hash === '#/login' || hash === '#/') {
      if (hash === '#/login') { location.hash = '#/'; return; }
      await seiteUebersicht();
      abmeldenVonBeobachtung = api.beobachte(() => { if (location.hash === '#/' || location.hash === '') seiteUebersicht(); });
    } else if (hash.startsWith('#/eintragen')) {
      await seiteEintragen(hash.split('/')[2] || null);
    } else if (hash.startsWith('#/tag/')) {
      await seiteTag(hash.slice(6));
    } else if (hash === '#/profil') {
      await seiteProfil();
    } else if (hash === '#/trainer') {
      await seiteTrainer();
    } else if (hash.startsWith('#/team/')) {
      const [mid, eid] = hash.slice(7).split('/');
      await seiteTeam(mid, eid || null);
    } else {
      location.hash = '#/';
    }
  } catch (e) { clearTimeout(ladeTimer); if (ohneNetz(e)) seiteOffline(); else fehler(e); }
  clearTimeout(ladeTimer);
  sendeAusgang();
}

window.addEventListener('hashchange', route);
route();

// Service Worker: App startet auch ohne Netz (nur über https oder localhost möglich)
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
