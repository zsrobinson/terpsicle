import { create } from "zustand";

// Whether the Travel tab's settings are expanded. Shared so connection
// details' "Change your pace or use accessible routes" can open the tab with
// them showing. Not persisted: the tab opens on connections.

export const useTravelSettingsOpen = create<{
  open: boolean;
  setOpen: (open: boolean) => void;
}>()((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));
