// The shared data contract. Prose version: docs/DATA.md.
// Not here: `./four-year` (Plan's doc), imported by path so its zod schemas stay
// out of every product's eager bundle (zod objects don't tree-shake).
export * from "./api";
export * from "./auth";
export * from "./calendar";
export * from "./catalog";
export * from "./chat";
export * from "./course-index";
export * from "./generate";
export * from "./geo";
export * from "./ics-feed";
export * from "./keys";
export * from "./local";
export * from "./moderation";
export * from "./planetterp";
export * from "./primitives";
export * from "./problems";
export * from "./reviews";
export * from "./settings";
export * from "./share";
export * from "./sync";
export * from "./sync-api";
export * from "./transcript";
export * from "./travel";
export * from "./versions";
export * from "./wildcard";
