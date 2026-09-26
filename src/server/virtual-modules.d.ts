// Modules the build makes up (vite.config.ts).

/** The app shell's hashed build files for /sw.js to precache: scripts/pwa-precache.ts. Empty in dev. */
declare module "virtual:terpsicle/precache" {
  export const PRECACHE: readonly string[];
}

/**
 * The CSP hash (`'sha256-…'`) of each inline head script, built from
 * src/app/inline-scripts.ts (scripts/inline-scripts.ts).
 */
declare module "virtual:terpsicle/inline-script-hashes" {
  export const INLINE_SCRIPT_HASHES: readonly string[];
}
