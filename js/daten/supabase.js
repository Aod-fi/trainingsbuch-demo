// Echter Modus: Supabase (Login per E-Mail-Code, Daten über RLS geschützt).
// Gleiche Schnittstelle wie mock.js. Noch nicht gegen ein echtes Projekt getestet.
// Supabase-Bibliothek direkt aus dem Netz (feste Version), keine Installation nötig
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config.js';

const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function pruefe({ data, error }) {
  if (error) throw new Error(error.message);
  return data;
}

export const api = {
  modus: 'supabase',

  async sendeCode(email) {
    // shouldCreateUser: false → keine Selbstregistrierung, nur eingeladene Konten
    pruefe(await sb.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: false } }));
  },
  async pruefeCode(email, code) {
    pruefe(await sb.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' }));
  },
  async ich() {
    const { data } = await sb.auth.getSession();
    if (!data.session) return null;
    const rows = pruefe(await sb.from('mitglieder').select('*')
      .eq('user_id', data.session.user.id).eq('aktiv', true));
    return rows[0] || null;
  },
  async abmelden() { await sb.auth.signOut(); },

  async mitgliederMitHunden() {
    const rows = pruefe(await sb.from('mitglieder').select('*, hunde(*)').eq('aktiv', true));
    return rows.map((m) => ({ ...m, hunde: m.hunde.filter((h) => h.aktiv) }));
  },
  async mitglied(mid) {
    const m = pruefe(await sb.from('mitglieder').select('*, hunde(*)').eq('id', mid).maybeSingle());
    if (!m) return null;
    return { ...m, hunde: m.hunde.filter((h) => h.aktiv) };
  },
  async aendereMitglied(mid, felder) {
    pruefe(await sb.from('mitglieder').update(felder).eq('id', mid));
  },
  async aendereHund(hid, felder) {
    pruefe(await sb.from('hunde').update(felder).eq('id', hid));
  },

  async trainingstage({ seit } = {}) {
    let q = sb.from('trainingstage').select('*').order('beginn', { ascending: false });
    if (seit) q = q.gte('beginn', seit);
    return pruefe(await q);
  },
  async legeTrainingstagAn(tag) {
    const me = await this.ich();
    return pruefe(await sb.from('trainingstage').insert({ ...tag, erstellt_von: me.id }).select().single());
  },
  async trainingstageMitTeilnehmern() {
    const rows = pruefe(await sb.from('trainingstage')
      .select('*, trainingseintraege(id, mitglied_id, mitglied:mitglieder(name), hund:hunde(name))')
      .order('beginn', { ascending: false }));
    return rows.map(({ trainingseintraege, ...t }) => ({
      ...t,
      teilnehmer: trainingseintraege.map((e) => ({ eintrag_id: e.id, mitglied_id: e.mitglied_id,
        name: e.mitglied?.name || '?', hund: e.hund?.name || null })).sort((a, b) => a.name.localeCompare(b.name)),
    }));
  },
  async trainingstag(tid) {
    return pruefe(await sb.from('trainingstage').select('*').eq('id', tid).maybeSingle());
  },
  async aendereTrainingstag(tid, felder) {
    const rows = pruefe(await sb.from('trainingstage').update(felder).eq('id', tid).select('id'));
    if (!rows.length) throw new Error('Keine Berechtigung');
  },
  // RLS liefert Trainerbewertungen nur für eigene Einträge bzw. an Trainer
  async eintraegeVomTag(tid) {
    const rows = pruefe(await sb.from('trainingseintraege')
      .select('*, mitglied:mitglieder(*), hund:hunde(*), trainerbewertungen(*)')
      .eq('trainingstag_id', tid));
    const eine = (b) => (Array.isArray(b) ? b[0] : b) || null;
    return rows.map(({ trainerbewertungen, ...e }) => ({ ...e, bewertung: eine(trainerbewertungen) }))
      .sort((a, b) => (a.mitglied?.name || '').localeCompare(b.mitglied?.name || ''));
  },
  async legeEintragAn(eintrag) {
    return pruefe(await sb.from('trainingseintraege').insert(eintrag).select().single());
  },
  // RLS liefert trainerbewertungen nur an das betroffene Team und die Trainer
  async eintraegeVon(mid) {
    const rows = pruefe(await sb.from('trainingseintraege')
      .select('*, tag:trainingstage(*), hund:hunde(*), trainerbewertungen(*)')
      .eq('mitglied_id', mid));
    // 1:1-Beziehung (eintrag_id ist Primärschlüssel) → PostgREST liefert ein Objekt statt einer Liste
    const eine = (b) => (Array.isArray(b) ? b[0] : b) || null;
    return rows.map(({ trainerbewertungen, ...e }) => ({ ...e, bewertung: eine(trainerbewertungen) }))
      .sort((a, b) => b.tag.beginn.localeCompare(a.tag.beginn));
  },
  async aendereEintrag(eid, felder) {
    const rows = pruefe(await sb.from('trainingseintraege').update(felder).eq('id', eid).select('id'));
    if (!rows.length) throw new Error('Keine Berechtigung');
  },
  // RLS: nur eigene Einträge oder Trainer; Trainerbewertung wird per Kaskade mitgelöscht
  async loescheEintrag(eid) {
    const rows = pruefe(await sb.from('trainingseintraege').delete().eq('id', eid).select('id'));
    if (!rows.length) throw new Error('Keine Berechtigung');
  },

  async hundenotizen(hid) {
    const rows = pruefe(await sb.from('hundenotizen').select('*, autor:mitglieder(name)')
      .eq('hund_id', hid).order('erstellt_am', { ascending: false }));
    return rows.map((n) => ({ ...n, autor: n.autor?.name }));
  },
  async legeHundenotizAn(hid, text) {
    const me = await this.ich();
    pruefe(await sb.from('hundenotizen').insert({ hund_id: hid, autor_id: me.id, text }));
  },

  // ---------- Trainer (RLS lässt nur Trainer zu) ----------
  async speichereBewertung(eintrag_id, felder) {
    const me = await this.ich();
    const alt = pruefe(await sb.from('trainerbewertungen').select('eintrag_id').eq('eintrag_id', eintrag_id));
    if (alt.length) pruefe(await sb.from('trainerbewertungen').update(felder).eq('eintrag_id', eintrag_id));
    else pruefe(await sb.from('trainerbewertungen').insert({ eintrag_id, trainer_id: me.id, ...felder }));
  },
  async letzteEintraege(anzahl = 30) {
    const rows = pruefe(await sb.from('trainingseintraege')
      .select('*, tag:trainingstage(*), mitglied:mitglieder(*), hund:hunde(*), trainerbewertungen(eintrag_id)')
      .order('erstellt_am', { ascending: false }).limit(anzahl * 2));
    const eine = (b) => (Array.isArray(b) ? b[0] : b) || null;
    return rows.map(({ trainerbewertungen, ...e }) => ({ ...e, bewertet: !!eine(trainerbewertungen) }))
      .sort((a, b) => b.tag.beginn.localeCompare(a.tag.beginn)).slice(0, anzahl);
  },
  // RLS: Hundenotizen Autor:in oder Trainer, Trainernotizen nur Trainer
  async aendereNotiz(typ, nid, text) {
    const rows = pruefe(await sb.from(typ === 'hund' ? 'hundenotizen' : 'trainernotizen')
      .update({ text }).eq('id', nid).select('id'));
    if (!rows.length) throw new Error('Keine Berechtigung');
  },
  async loescheNotiz(typ, nid) {
    const rows = pruefe(await sb.from(typ === 'hund' ? 'hundenotizen' : 'trainernotizen')
      .delete().eq('id', nid).select('id'));
    if (!rows.length) throw new Error('Keine Berechtigung');
  },
  async trainernotizen() {
    const rows = pruefe(await sb.from('trainernotizen').select('*, autor:mitglieder(name)')
      .order('erstellt_am', { ascending: false }));
    return rows.map((n) => ({ ...n, autor: n.autor?.name }));
  },
  async legeTrainernotizAn(text) {
    const me = await this.ich();
    pruefe(await sb.from('trainernotizen').insert({ autor_id: me.id, text }));
  },
  async loescheTrainernotiz(nid) {
    pruefe(await sb.from('trainernotizen').delete().eq('id', nid));
  },
  // Login-Einladung (E-Mail) folgt über die Edge Function; hier nur der Datensatz
  async legeMitgliedAn(felder) {
    return pruefe(await sb.from('mitglieder').insert(felder).select().single());
  },
  async legeHundAn(felder) {
    pruefe(await sb.from('hunde').insert(felder));
  },

  beobachte(f) {
    const kanal = sb.channel('aenderungen')
      .on('postgres_changes', { event: '*', schema: 'public' }, f)
      .subscribe();
    return () => sb.removeChannel(kanal);
  },
};
