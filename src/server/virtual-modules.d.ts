// Modules the build makes up (vite.config.ts).

/**
 * The CSP hash (`'sha256-…'`) of each inline head script, built from
 * src/app/inline-scripts.ts (scripts/inline-scripts.ts).
 */
declare module "virtual:terpsicle/inline-script-hashes" {
  export const INLINE_SCRIPT_HASHES: readonly string[];
}
