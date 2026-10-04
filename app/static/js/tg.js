/**
 * Picks the Telegram implementation once at start-up:
 * - default: GramJS on the page (js/telegram.js);
 * - "workerMode" (Settings → Для разработчиков): GramJS in a Web Worker
 *   (js/telegram-remote.js ⇄ js/tg-worker.js), so downloads and decryption
 *   never block the interface. Changing the switch needs a reload.
 */
import { onPrefsChange } from './core/prefs.js';

let useWorker = false;
try {
  useWorker = typeof Worker !== 'undefined' && !!JSON.parse(localStorage.getItem('telex.prefs') || '{}').workerMode;
} catch {}

const mod = useWorker ? await import('./telegram-remote.js') : await import('./telegram.js');

export const telegram = mod.telegram;
export const workerMode = useWorker;

if (useWorker) onPrefsChange(() => mod.syncStorage('telex.prefs'));
