import { track } from "~/app/analytics";
import { aiFeaturesOn, withAiFeatures } from "~/core/prefs";
import { saveSyncedPrefs, useSyncedPrefs } from "~/features/prefs/synced-prefs";

// The one gate for everything a model wrote that a student sees: every
// sparkles feature asks this hook first (DESIGN.md §5, SPEC.md §3.13). Some
// students don't want AI at all, so "Show AI summaries" turns it off
// everywhere: in Settings, or from any AI box's ⋯ menu. On by default; local
// while signed out, the account's once signed in (~/features/prefs).

/** Where "Show AI summaries" was changed, for `ai_features_changed`. */
export type AiFeaturesVia = "box" | "settings";

export interface AiFeatures {
  /**
   * Whether to show AI features, or null until this browser's choice can be
   * read (on the server, while hydrating): show nothing AI until it's true,
   * and ask no model for anything.
   */
  on: boolean | null;
  setOn: (on: boolean, via: AiFeaturesVia) => void;
}

/** Turns AI features on or off everywhere, and counts it (anonymously). */
export function setAiFeatures(on: boolean, via: AiFeaturesVia): void {
  track("ai_features_changed", { on, via });
  void saveSyncedPrefs((prefs) => withAiFeatures(prefs, on));
}

export function useAiFeatures(): AiFeatures {
  const prefs = useSyncedPrefs();
  return {
    on: prefs === null ? null : aiFeaturesOn(prefs),
    setOn: setAiFeatures,
  };
}
