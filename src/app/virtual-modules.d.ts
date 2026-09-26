// Modules the build makes up (vite.config.ts).

/**
 * Each inline head script's text, built from src/app/inline-scripts.ts
 * (scripts/inline-scripts.ts). Render these, never the source strings: the
 * Worker's CSP allows exactly this text.
 */
declare module "virtual:terpsicle/inline-scripts" {
  export const INLINE_SCRIPTS: Readonly<
    Record<import("./inline-scripts").InlineScriptName, string>
  >;
}
