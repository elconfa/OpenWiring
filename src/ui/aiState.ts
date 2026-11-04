// Profili degli assistenti IA (account e chiavi) condivisi da pannello, impostazioni e traduzioni.
import { create } from 'zustand';
import { loadProfiles, saveProfiles, type AiProfile } from '../io/ai';

interface AiState {
  profiles: AiProfile[];
  activeId: string;
  loaded: boolean;
  load(): Promise<void>;
  save(list: AiProfile[]): Promise<void>;
  setActive(id: string): void;
}

const ACTIVE = 'elettrocad.aiActive';

export const useAi = create<AiState>((set, get) => ({
  profiles: [],
  activeId: '',
  loaded: false,
  async load() {
    if (get().loaded) return;
    const profiles = await loadProfiles();
    // I profili iniziali vengono salvati subito, così restano gli stessi alla prossima apertura
    await saveProfiles(profiles);
    let active = '';
    try { active = localStorage.getItem(ACTIVE) ?? ''; } catch { /* preferenza non disponibile */ }
    set({ profiles, loaded: true, activeId: profiles.some(p => p.id === active) ? active : profiles[0]?.id ?? '' });
  },
  async save(list) {
    await saveProfiles(list);
    set(s => ({ profiles: list, activeId: list.some(p => p.id === s.activeId) ? s.activeId : list[0]?.id ?? '' }));
  },
  setActive(id) {
    try { localStorage.setItem(ACTIVE, id); } catch { /* preferenza non salvabile */ }
    set({ activeId: id });
  },
}));

export const activeProfile = () => {
  const s = useAi.getState();
  return s.profiles.find(p => p.id === s.activeId);
};
