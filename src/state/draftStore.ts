import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

type DraftState = {
  drafted: Record<string, true>;
  starred: Record<string, true>;
  myTeam: Record<string, true>;
  taken: Record<string, true>;
  undoStack: string[]; // last-in-first-out of drafted player IDs

  draftPlayer: (id: string) => void;
  takePlayer: (id: string) => void;
  undoDraft: () => void;
  resetDraft: () => void;
  toggleStar: (id: string) => void;

  isDrafted: (id: string) => boolean;
  isStarred: (id: string) => boolean;
  isTaken: (id: string) => boolean;
  isOnMyTeam: (id: string) => boolean;
}

export const useDraftStore = create<DraftState>()(
  persist(
    (set, get) => ({
      drafted: {},
      starred: {},
      myTeam: {},
      taken: {},
      undoStack: [],

      draftPlayer: (id) =>
        set((s) => {
          if (s.drafted[id] || s.taken[id]) return s; // already drafted or taken
          return {
            drafted: { ...s.drafted, [id]: true },
            myTeam: { ...s.myTeam, [id]: true },
            undoStack: [...s.undoStack, id],
          }
        }),

      takePlayer: (id) =>
        set((s) => {
          if (s.drafted[id] || s.taken[id]) return s; // already drafted or taken
          return {
            taken: { ...s.taken, [id]: true },
          }
        }),

      undoDraft: () =>
        set((s) => {
          const last = s.undoStack[s.undoStack.length - 1];
          if (!last) return s;
          // remove last from drafted and myTeam
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { [last]: _removedDrafted, ...restDrafted } = s.drafted;
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { [last]: _removedMyTeam, ...restMyTeam } = s.myTeam;
          return {
            drafted: restDrafted,
            myTeam: restMyTeam,
            undoStack: s.undoStack.slice(0, -1)
          }
        }),

      resetDraft: () => set({ drafted: {}, myTeam: {}, taken: {}, undoStack: [] }),

      toggleStar: (id) =>
        set((s) => {
          const copy = { ...s.starred };
          if (copy[id]) {
            delete copy[id];
          } else {
            copy[id] = true;
          }
          return { starred: copy };
        }),

      isDrafted: (id) => !!get().drafted[id],
      isStarred: (id) => !!get().starred[id],
      isTaken: (id) => !!get().taken[id],
      isOnMyTeam: (id) => !!get().myTeam[id],
    }),
    {
      name: 'bff-draft-store',
      storage: createJSONStorage(() => localStorage),
      version: 1,
    }
  )
)
