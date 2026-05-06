import type { AppState } from './store';
import { useAppStore } from './store';

const KEY = 'rsd-ui-state-v1';

interface Persisted {
  activity: AppState['activity'];
  sidebarOpen: boolean;
  inspectorOpen: boolean;
  bottomOpen: boolean;
  bottomDetached: boolean;
  bottomTab: AppState['bottomTab'];
}

export function loadPersistedUI(): void {
  if (typeof window === 'undefined') return;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Partial<Persisted>;
    useAppStore.set((s) => ({
      ...s,
      activity: parsed.activity ?? s.activity,
      sidebarOpen: parsed.sidebarOpen ?? s.sidebarOpen,
      inspectorOpen: parsed.inspectorOpen ?? s.inspectorOpen,
      bottomOpen: parsed.bottomOpen ?? s.bottomOpen,
      bottomDetached: parsed.bottomDetached ?? s.bottomDetached,
      bottomTab: parsed.bottomTab ?? s.bottomTab,
    }));
  } catch {
    // ignore corrupted/older state
  }
}

export function startPersistingUI(): () => void {
  if (typeof window === 'undefined') return () => {};
  let last = '';
  return useAppStore.subscribe(() => {
    const s = useAppStore.get();
    const snapshot: Persisted = {
      activity: s.activity,
      sidebarOpen: s.sidebarOpen,
      inspectorOpen: s.inspectorOpen,
      bottomOpen: s.bottomOpen,
      bottomDetached: s.bottomDetached,
      bottomTab: s.bottomTab,
    };
    const serialized = JSON.stringify(snapshot);
    if (serialized === last) return;
    last = serialized;
    try {
      window.localStorage.setItem(KEY, serialized);
    } catch {
      // ignore quota errors
    }
  });
}
