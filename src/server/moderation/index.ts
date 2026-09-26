// What Reviews and Chat use. docs/MODERATION.md is the guide.
export {
  type AdminGuard,
  type AdminIdentity,
  denyAllAdmins,
} from "./admin";
export {
  DEFAULT_MODERATION_CONFIG,
  type ModerationConfig,
} from "./classify";
export {
  MODERATION_HANDLERS,
  type ModerationHandler,
  type ModerationHandlers,
} from "./handlers";
export {
  currentDecision,
  DEFAULT_DAILY_CAP,
  type ModerationEnv,
  moderate,
} from "./service";
