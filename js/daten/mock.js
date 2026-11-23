// Testdaten-Modus: läuft komplett im Browser (localStorage), ohne Supabase.
// Bildet die RLS-Regeln für Trainerbewertungen nach, damit sich die App wie echt verhält.
// Test-Login: beliebige E-Mail aus TEST_KONTEN, Code 123456.

const KEY = 'rhs-testdaten-v1';
const SESSION_KEY = 'rhs-test-session';
export const TEST_CODE = '123456';

export const TEST_KONTEN = {
  'anna@test.local': 'm2',   // Mitglied mit geprüftem Hund
  'lena@test.local': 'm4',   // Mitglied in Ausbildung
  'trainer@test.local': 'm99', // Trainer
};

// crypto.randomUUID gibt es nur auf https/localhost – beim Handytest über die WLAN-Adresse nicht
const id = () => crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
const jetzt = () => new Date().toISOString();

function startdaten() {
  const m = (mid, funkrufname, name, status, rolle = 'mitglied') =>
    ({ id: mid, funkrufname, name, status, rolle, aktiv: true, erstellt_am: jetzt() });
  const h = (hid, mitglied_id, name, status, letzte_pruefung = null) =>
    ({ id: hid, mitglied_id, name, status, letzte_pruefung, aktiv: true, erstellt_am: jetzt() });
  const mitglieder = [
    m('m1', 'Demo RHT 1', 'Carla B.', 'helfer'),
    m('m2', 'Demo RHT 2', 'Anna', 'hundefuehrer'),
    m('m3', 'Demo RHT 3', 'Jonas', 'hundefuehrer'),
    m('m4', 'Demo RHT 4', 'Lena', 'hundefuehrer'),
    m('m5', 'Demo RHT 5', 'Markus', 'hundefuehrer'),
    m('m10', 'Demo RHT 10', 'Julia', 'helfer'),
    m('m14', 'Demo RHT 14', 'Eva', 'hundefuehrer'),
    m('m16', 'Demo RHT 16', 'Nina', 'helfer'),
    m('m17', 'Demo RHT 17', 'Carla G.', 'helfer'),
    m('m18', 'Demo RHT 18', 'Sophie', 'hundefuehrer'),
    m('m21', 'Demo RHT 21', 'Mia', 'hundefuehrer'),
    m('m99', null, 'Test-Trainer', 'helfer', 'trainer'),
  ];
  const hunde = [
    h('h2', 'm2', 'Bello', 'geprueft', '2026-04-15'),
    h('h3', 'm3', 'Rocky', 'geprueft', '2026-10-17'),
    h('h4', 'm4', 'Luna', 'ausbildung'),
    h('h5', 'm5', 'Balu', 'ausbildung'),
    h('h14', 'm14', 'Finn', 'geprueft', '2025-09-13'),
    h('h18', 'm18', 'Kira', 'ausbildung'),
    h('h21', 'm21', 'Lucky', 'geprueft', '2025-02-16'),
  ];
  const tag = {
    id: 't1', beginn: '2026-10-31T10:00:00.000Z', ort: 'Waldstück Testgelände', art: 'Suche',
    wetter: ['wechselnder Wind', 'kalt', 'nass'], wetter_notiz: 'Morgens Nebel',
    gelaende: 'Mischwald, dichtes Unterholz', schwerpunkt: 'Verweisen aus der Distanz',
    erstellt_von: 'm2', erstellt_am: jetzt(),
  };
  const eintraege = [
    { id: 'e1', trainingstag_id: 't1', mitglied_id: 'm2', hund_id: 'h2', verstecke: [
        { person: 'Markus', besonderheiten: 'Liegend unter Plane' }, { person: 'Mia', besonderheiten: 'Erhöht im Hochsitz' }],
      arbeit_hund: 'Sehr motiviert, gute Querschläge',
      selbstbewertung: 4, ziel: 'Ruhiger anzeigen',
      ziel_erreicht: 'teilweise', notiz: 'Taktik am Hang verbessern', erstellt_am: jetzt() },
    { id: 'e2', trainingstag_id: 't1', mitglied_id: 'm4', hund_id: 'h4', verstecke: [{ person: 'Anna', besonderheiten: '' }],
      arbeit_hund: 'Anfangs unkonzentriert, dann gut',
      selbstbewertung: 3, ziel: 'Freiverweis üben',
      ziel_erreicht: 'ja', notiz: '', erstellt_am: jetzt() },
  ];
  const trainerbewertungen = [
    { eintrag_id: 'e1', trainer_id: 'm99', struktur_hf: 4, suchverhalten: 5, lenkbarkeit: 3,
      abstand_vp: 4, kommentar: 'Gute Arbeit, Lenkbarkeit im Unterholz üben.' },
  ];
  return { mitglieder, hunde, hundenotizen: [], trainingstage: [tag], trainingseintraege: eintraege,
    trainerbewertungen, trainernotizen: [] };
}

function laden() {
  try {
    const roh = localStorage.getItem(KEY);
    if (roh) return JSON.parse(roh);
  } catch {}
  const d = startdaten();
  speichern(d);
  return d;
}
function speichern(d) { localStorage.setItem(KEY, JSON.stringify(d)); }

function ich() {
  const mid = localStorage.getItem(SESSION_KEY);
  if (!mid) return null;
  return laden().mitglieder.find((m) => m.id === mid && m.aktiv) || null;
}
function brauche(bedingung, text = 'Keine Berechtigung') { if (!bedingung) throw new Error(text); }

const listener = new Set();
const melde = () => listener.forEach((f) => f());

const roh = {
  modus: 'test',

  async sendeCode(email) {
    brauche(TEST_KONTEN[email.trim().toLowerCase()], 'Unbekannte E-Mail (Testmodus: siehe Hinweis)');
  },
  async pruefeCode(email, code) {
    const mid = TEST_KONTEN[email.trim().toLowerCase()];
    brauche(mid && code.trim() === TEST_CODE, 'Code falsch');
    localStorage.setItem(SESSION_KEY, mid);
  },
  async ich() { return ich(); },
  async abmelden() { localStorage.removeItem(SESSION_KEY); },

  async mitgliederMitHunden() {
    brauche(ich());
    const d = laden();
    return d.mitglieder.filter((m) => m.aktiv)
      .map((m) => ({ ...m, hunde: d.hunde.filter((h) => h.mitglied_id === m.id && h.aktiv) }));
  },
  async mitglied(mid) {
    return (await this.mitgliederMitHunden()).find((m) => m.id === mid);
  },
  async aendereMitglied(mid, felder) {
    const me = ich(); brauche(me);
    brauche(me.rolle === 'trainer' || me.id === mid);
    const d = laden();
    Object.assign(d.mitglieder.find((m) => m.id === mid), felder);
    speichern(d); melde();
  },
  async aendereHund(hid, felder) {
    const me = ich(); const d = laden();
    const hund = d.hunde.find((h) => h.id === hid);
    brauche(me && (me.rolle === 'trainer' || hund.mitglied_id === me.id));
    Object.assign(hund, felder); speichern(d); melde();
  },

  async trainingstage({ seit } = {}) {
    brauche(ich());
    return laden().trainingstage
      .filter((t) => !seit || t.beginn >= seit)
      .sort((a, b) => b.beginn.localeCompare(a.beginn));
  },
  async legeTrainingstagAn(tag) {
    const me = ich(); brauche(me);
    const d = laden();
    const neu = { ...tag, id: id(), erstellt_von: me.id, erstellt_am: jetzt() };
    d.trainingstage.push(neu); speichern(d); melde();
    return neu;
  },
  // Alle Trainingstage mit Teilnehmenden (Name, Hund, Eintrag), neueste zuerst
  async trainingstageMitTeilnehmern() {
    brauche(ich());
    const d = laden();
    return d.trainingstage.map((t) => ({
      ...t,
      teilnehmer: d.trainingseintraege.filter((e) => e.trainingstag_id === t.id).map((e) => ({
        eintrag_id: e.id, mitglied_id: e.mitglied_id,
        name: d.mitglieder.find((m) => m.id === e.mitglied_id)?.name || '?',
        hund: d.hunde.find((h) => h.id === e.hund_id)?.name || null,
      })).sort((a, b) => a.name.localeCompare(b.name)),
    })).sort((a, b) => b.beginn.localeCompare(a.beginn));
  },
  async trainingstag(tid) {
    brauche(ich());
    return laden().trainingstage.find((t) => t.id === tid) || null;
  },
  async aendereTrainingstag(tid, felder) {
    const me = ich(); const d = laden();
    const t = d.trainingstage.find((x) => x.id === tid);
    brauche(me && t && (me.rolle === 'trainer' || t.erstellt_von === me.id));
    Object.assign(t, felder, { geaendert_am: jetzt() }); speichern(d); melde();
  },
  // Alle Einträge eines Trainingstags; Trainerbewertung nur eigene bzw. für Trainer
  async eintraegeVomTag(tid) {
    const me = ich(); brauche(me);
    const d = laden();
    return d.trainingseintraege.filter((e) => e.trainingstag_id === tid).map((e) => ({
      ...e,
      mitglied: d.mitglieder.find((m) => m.id === e.mitglied_id),
      hund: d.hunde.find((h) => h.id === e.hund_id),
      bewertung: me.rolle === 'trainer' || me.id === e.mitglied_id
        ? d.trainerbewertungen.find((b) => b.eintrag_id === e.id) || null : null,
    })).sort((a, b) => (a.mitglied?.name || '').localeCompare(b.mitglied?.name || ''));
  },
  async legeEintragAn(eintrag) {
    const me = ich(); brauche(me);
    brauche(eintrag.mitglied_id === me.id || me.rolle === 'trainer');
    const d = laden();
    const neu = { ...eintrag, id: id(), erstellt_am: jetzt() };
    d.trainingseintraege.push(neu); speichern(d); melde();
    return neu;
  },
  // Einträge eines Mitglieds inkl. Trainingstag; Trainerbewertung nur für das Team selbst und Trainer
  async eintraegeVon(mid) {
    const me = ich(); brauche(me);
    const d = laden();
    const darfBewertung = me.rolle === 'trainer' || me.id === mid;
    return d.trainingseintraege.filter((e) => e.mitglied_id === mid)
      .map((e) => ({
        ...e,
        tag: d.trainingstage.find((t) => t.id === e.trainingstag_id),
        hund: d.hunde.find((h) => h.id === e.hund_id),
        bewertung: darfBewertung ? d.trainerbewertungen.find((b) => b.eintrag_id === e.id) || null : null,
      }))
      .sort((a, b) => b.tag.beginn.localeCompare(a.tag.beginn));
  },
  async aendereEintrag(eid, felder) {
    const me = ich(); brauche(me);
    const d = laden();
    const e = d.trainingseintraege.find((x) => x.id === eid);
    brauche(e && (me.rolle === 'trainer' || e.mitglied_id === me.id));
    Object.assign(e, felder, { geaendert_am: jetzt() }); speichern(d); melde();
  },
  async loescheEintrag(eid) {
    const me = ich(); brauche(me);
    const d = laden();
    const e = d.trainingseintraege.find((x) => x.id === eid);
    brauche(e && (me.rolle === 'trainer' || e.mitglied_id === me.id));
    d.trainingseintraege = d.trainingseintraege.filter((x) => x.id !== eid);
    d.trainerbewertungen = d.trainerbewertungen.filter((b) => b.eintrag_id !== eid);
    speichern(d); melde();
  },

  async hundenotizen(hid) {
    brauche(ich());
    const d = laden();
    return d.hundenotizen.filter((n) => n.hund_id === hid)
      .map((n) => ({ ...n, autor: d.mitglieder.find((m) => m.id === n.autor_id)?.name }))
      .sort((a, b) => b.erstellt_am.localeCompare(a.erstellt_am));
  },
  async legeHundenotizAn(hid, text) {
    const me = ich(); brauche(me);
    const d = laden();
    d.hundenotizen.push({ id: id(), hund_id: hid, autor_id: me.id, text, erstellt_am: jetzt() });
    speichern(d); melde();
  },

  // ---------- Trainer ----------
  async speichereBewertung(eintrag_id, felder) {
    const me = ich(); brauche(me?.rolle === 'trainer');
    const d = laden();
    const alt = d.trainerbewertungen.find((b) => b.eintrag_id === eintrag_id);
    if (alt) Object.assign(alt, felder, { geaendert_am: jetzt() });
    else d.trainerbewertungen.push({ eintrag_id, trainer_id: me.id, ...felder, erstellt_am: jetzt() });
    speichern(d); melde();
  },
  // Letzte Einträge aller Teams mit Kennzeichen, ob schon bewertet (nur Trainer)
  async letzteEintraege(anzahl = 30) {
    const me = ich(); brauche(me?.rolle === 'trainer');
    const d = laden();
    return d.trainingseintraege.map((e) => ({
      ...e,
      tag: d.trainingstage.find((t) => t.id === e.trainingstag_id),
      mitglied: d.mitglieder.find((m) => m.id === e.mitglied_id),
      hund: d.hunde.find((h) => h.id === e.hund_id),
      bewertet: d.trainerbewertungen.some((b) => b.eintrag_id === e.id),
    })).sort((a, b) => b.tag.beginn.localeCompare(a.tag.beginn)).slice(0, anzahl);
  },
  // Notizen ändern/löschen: Hundenotizen Autor:in oder Trainer, Trainernotizen nur Trainer
  async aendereNotiz(typ, nid, text) {
    const me = ich(); brauche(me);
    const d = laden();
    const n = d[typ === 'hund' ? 'hundenotizen' : 'trainernotizen'].find((x) => x.id === nid);
    brauche(n && (me.rolle === 'trainer' || (typ === 'hund' && n.autor_id === me.id)));
    Object.assign(n, { text, geaendert_am: jetzt() }); speichern(d); melde();
  },
  async loescheNotiz(typ, nid) {
    const me = ich(); brauche(me);
    const d = laden(); const k = typ === 'hund' ? 'hundenotizen' : 'trainernotizen';
    const n = d[k].find((x) => x.id === nid);
    brauche(n && (me.rolle === 'trainer' || (typ === 'hund' && n.autor_id === me.id)));
    d[k] = d[k].filter((x) => x.id !== nid); speichern(d); melde();
  },
  async trainernotizen() {
    const me = ich(); brauche(me?.rolle === 'trainer');
    const d = laden();
    return d.trainernotizen
      .map((n) => ({ ...n, autor: d.mitglieder.find((m) => m.id === n.autor_id)?.name }))
      .sort((a, b) => b.erstellt_am.localeCompare(a.erstellt_am));
  },
  async legeTrainernotizAn(text) {
    const me = ich(); brauche(me?.rolle === 'trainer');
    const d = laden();
    d.trainernotizen.push({ id: id(), autor_id: me.id, text, erstellt_am: jetzt() });
    speichern(d);
  },
  async loescheTrainernotiz(nid) {
    const me = ich(); brauche(me?.rolle === 'trainer');
    const d = laden();
    d.trainernotizen = d.trainernotizen.filter((n) => n.id !== nid);
    speichern(d);
  },
  async legeMitgliedAn(felder) {
    const me = ich(); brauche(me?.rolle === 'trainer');
    const d = laden();
    const neu = { id: id(), rolle: 'mitglied', aktiv: true, ...felder, erstellt_am: jetzt() };
    d.mitglieder.push(neu); speichern(d); melde();
    return neu;
  },
  async legeHundAn(felder) {
    const me = ich(); brauche(me && (me.rolle === 'trainer' || felder.mitglied_id === me.id));
    const d = laden();
    d.hunde.push({ id: id(), aktiv: true, status: 'ausbildung', ...felder, erstellt_am: jetzt() });
    speichern(d); melde();
  },

  beobachte(f) {
    listener.add(f);
    const vonAnderemTab = (e) => { if (e.key === KEY) f(); };
    window.addEventListener('storage', vonAnderemTab);
    return () => { listener.delete(f); window.removeEventListener('storage', vonAnderemTab); };
  },

  testdatenZuruecksetzen() { localStorage.removeItem(KEY); },
};

// Wie im echten Betrieb: ohne Netz schlagen Datenzugriffe fehl (zum Testen des Offline-Verhaltens)
const OHNE_NETZ_OK = new Set(['beobachte', 'testdatenZuruecksetzen', 'abmelden']);
export const api = Object.fromEntries(Object.entries(roh).map(([k, v]) => [k,
  typeof v !== 'function' || OHNE_NETZ_OK.has(k) ? v : async function (...args) {
    if (!navigator.onLine) throw new TypeError('Failed to fetch');
    return v.apply(this, args);
  }]));
