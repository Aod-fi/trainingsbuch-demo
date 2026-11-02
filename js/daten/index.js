// Wählt die Datenquelle: Supabase, wenn in config.js Adresse und anon-Key stehen, sonst Testdaten im Browser.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config.js';

export const api = SUPABASE_URL && SUPABASE_ANON_KEY
  ? (await import('./supabase.js')).api
  : (await import('./mock.js')).api;
