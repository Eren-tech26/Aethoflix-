export type AppMode = 'lite' | 'performance';

const MODE_KEY = 'aethoflix-app-mode';

function lowEndDevice() {
  if (typeof navigator === 'undefined') return false;
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  const cores = navigator.hardwareConcurrency || 4;
  const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
  return !!saveData || (typeof memory === 'number' && memory > 0 && memory <= 4) || cores <= 4;
}

export function readAppMode(): AppMode {
  try {
    const saved = localStorage.getItem(MODE_KEY);
    if (saved === 'lite' || saved === 'performance') return saved;
  } catch { /* optional */ }
  return lowEndDevice() ? 'lite' : 'performance';
}

export function writeAppMode(mode: AppMode) {
  try { localStorage.setItem(MODE_KEY, mode); } catch { /* optional */ }
}

export function applyDocumentMode(mode: AppMode) {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.appMode = mode;
  document.documentElement.classList.toggle('lite-mode', mode === 'lite');
  document.documentElement.classList.toggle('performance-mode', mode === 'performance');
}
