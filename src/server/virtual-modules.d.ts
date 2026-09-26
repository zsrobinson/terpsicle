// Modules the build makes up (vite.config.ts).

/** The app shell's hashed build files for /sw.js to precache: scripts/pwa-precache.ts. Empty in dev. */
declare module "virtual:terpsicle/precache" {
  export const PRECACHE: readonly string[];
}
