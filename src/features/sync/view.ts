import { SYNC_MAX_PLANS } from "~/core/schema";
import type { SyncStatusLook } from "./status";

// How plan sync's status looks (status-view.tsx draws it). Loaded with the
// engine, so the scheduler's first load carries none of it. The icons are
// Lucide's cloud icons (ISC license) as bare path data: importing the icon
// components here would pull React's chunk apart from the scheduler's.

const CLOUD_UPLOAD = [
  "M12 13v8",
  "M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242",
  "m8 17 4-4 4 4",
];
const CLOUD_CHECK = [
  "m17 15-5.5 5.5L9 18",
  "M5.516 16.07A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 3.501 7.327",
];
const CLOUD_OFF = [
  "M10.94 5.274A7 7 0 0 1 15.71 10h1.79a4.5 4.5 0 0 1 4.222 6.057",
  "M18.796 18.81A4.5 4.5 0 0 1 17.5 19H9A7 7 0 0 1 5.79 5.78",
  "m2 2 20 20",
];
const CLOUD_ALERT = [
  "M12 12v4",
  "M12 20h.01",
  "M8.128 16.949A7 7 0 1 1 15.71 8h1.79a1 1 0 0 1 0 9h-1.642",
];

export const SYNC_STATUS_LOOK: SyncStatusLook = {
  saving: {
    icon: CLOUD_UPLOAD,
    label: "Saving…",
    tooltip: "Saving your plans to your account",
  },
  saved: {
    icon: CLOUD_CHECK,
    label: "Saved",
    tooltip: "Your plans are saved to your account",
  },
  offline: {
    icon: CLOUD_OFF,
    label: "Offline, will save when you're back",
    tooltip:
      "Your changes are kept on this device and saved to your account once you're online",
  },
  error: {
    icon: CLOUD_ALERT,
    label: "Couldn't save yet, trying again",
    tooltip:
      "Terpsicle couldn't reach your account. Your changes are kept on this device, and it'll keep trying.",
  },
  full: {
    icon: CLOUD_ALERT,
    label: "Account full",
    tooltip: `Your account holds ${SYNC_MAX_PLANS} plans. New plans stay on this device until you delete one.`,
  },
};
