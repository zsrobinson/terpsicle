// The shared data contract. Prose version: docs/DATA.md. Three families stay
// out of this barrel, since every page loads it and zod objects don't
// tree-shake: the admin panel's schemas (import ~/core/schema/admin),
// Plan's four-year doc (import ~/core/schema/four-year) and notifications
// (import ~/core/schema/notifications).
export * from "./api";
export * from "./auth";
export * from "./calendar";
export * from "./catalog";
export * from "./chat";
export * from "./chat-api";
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
export * from "./pwa";
export * from "./reviews";
export * from "./reviews-data";
export * from "./rows";
export * from "./schedule-url";
export * from "./seat-watches";
export * from "./security";
export * from "./settings";
export * from "./share";
export * from "./sync";
export * from "./sync-api";
export * from "./todo-api";
export * from "./transcript";
export * from "./travel";
export * from "./versions";
export * from "./wildcard";
