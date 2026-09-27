import { useEffect } from "react";
import { useAccount } from "~/features/auth/account-store";
import { showSyncedPrefs } from "~/features/prefs/synced-prefs";
import { PageSection } from "~/ui/page-section";
import { Switch } from "~/ui/switch";
import { WithTooltip } from "~/ui/tooltip";
import { useAiFeatures } from "./use-ai-features";

/**
 * Settings → AI features: "Show AI summaries", signed in or not. Signed out
 * it's this browser's; signed in it follows the account.
 */
export function AiSettingsSection() {
  const { on, setOn } = useAiFeatures();
  const signedIn = useAccount((s) => s.status === "signed-in");
  useDeviceCopy();
  const shown = on ?? true;
  return (
    <PageSection
      title="AI features"
      aside={signedIn ? "Follows your account" : "Saved in this browser"}
    >
      <WithTooltip
        label={
          shown ? "Hide AI summaries everywhere" : "Show AI summaries again"
        }
      >
        <Switch
          checked={shown}
          disabled={on === null}
          onCheckedChange={(next) => setOn(next, "settings")}
          className="self-start"
        >
          Show AI summaries
        </Switch>
      </WithTooltip>
      <p className="text-muted text-sm">
        A model writes the review summaries from students' reviews. Turning them
        off hides them everywhere.
      </p>
    </PageSection>
  );
}

/**
 * The page's copy of the prefs from this device's own, in case they parted
 * (site data cleared by half): loaded here, where it matters most, and not
 * on Reviews' pages, which don't load IndexedDB.
 */
function useDeviceCopy(): void {
  useEffect(() => {
    let cancelled = false;
    void import("~/features/prefs/save")
      .then((m) => m.devicePrefs())
      .then((prefs) => {
        if (!cancelled) showSyncedPrefs(prefs);
      })
      .catch(() => {
        // IndexedDB blocked: the copy is all there is.
      });
    return () => {
      cancelled = true;
    };
  }, []);
}
