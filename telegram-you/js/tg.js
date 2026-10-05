/**
 * Picks the Telegram implementation once at start-up:
 * - "workerMode" (default; Settings → Для разработчиков): GramJS in a Web Worker
 *   (js/telegram-remote.js ⇄ js/tg-worker.js), so downloads and decryption
 *   never block the interface. Changing the switch needs a reload;
 * - switched off: GramJS on the page (js/telegram.js).
 */
import { onPrefsChange, getPrefs } from './core/prefs.js';

let useWorker = false;
try {
  useWorker = typeof Worker !== 'undefined' && !!getPrefs().workerMode;
} catch {}

const mod = useWorker ? await import('./telegram-remote.js') : await import('./telegram.js');

export const telegram = mod.telegram;
export const workerMode = useWorker;

if (useWorker) onPrefsChange(() => mod.syncStorage('telex.prefs'));
