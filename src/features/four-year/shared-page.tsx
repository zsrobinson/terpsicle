import { useNavigate } from "@tanstack/react-router";
import { Copy } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { fourYearTermLabel } from "~/core/four-year/terms";
import type { IsoDate } from "~/core/schema";
import {
  decodeFourYearShare,
  type FourYearShare,
  fourYearDocFromShare,
} from "~/core/share/four-year-share";
import { newYorkClock } from "~/core/todo/list";
import { SitePage } from "~/features/site/site-page";
import { initAnalytics, track } from "~/lib/analytics";
import { newLocalId, nowIso } from "~/state/ids";
import { Button } from "~/ui/button";
import { InlineError } from "~/ui/inline-error";
import { PageHeader } from "~/ui/page-header";
import { PageSection } from "~/ui/page-section";
import { WithTooltip } from "~/ui/tooltip";
import { Board } from "./board";
import { startFourYear } from "./data";
import { GenEdPanel, GenEdStatus } from "./gen-ed-panel";
import {
  PlanModelProvider,
  type PlanNav,
  PlanNavProvider,
  PlanReadOnlyProvider,
  usePlanModel,
} from "./model";
import { CreditsSummary } from "./plan-sidebar";
import { useFourYear, whenSaved } from "./store";

// `/plan/shared?plan=1.…` (docs/V3.md §2.14): a four-year plan someone
// shared, read from the URL. Anyone can read it, signed in or not: its
// semesters, courses, credits and GenEd progress, with nothing to press
// that would change it. "Save a copy" makes it one of the reader's own
// four-year plans (synced when they're signed in) and opens it in Plan.

/** The shared doc's id while it's only on this page; a copy gets a new one. */
const SHARED_ID = "shared_fouryear_plan";

/** Nothing moves in a shared plan, so nothing navigates. */
const STILL_NAV: PlanNav = {
  search: { tab: "gened" },
  go: () => {},
  back: () => {},
};

function useToday(): IsoDate {
  const date = newYorkClock(Date.now()).date;
  return useMemo(() => date, [date]);
}

export function SharedFourYearPage({ param }: { param: string }) {
  const result = useMemo(() => decodeFourYearShare(param), [param]);
  const counted = useRef(false);
  useEffect(() => {
    void initAnalytics();
    if (counted.current) return;
    counted.current = true;
    track("four_year_shared_opened", {
      outcome: result.ok
        ? "ok"
        : result.error.kind === "malformed"
          ? "invalid"
          : "newer-version",
    });
  }, [result]);

  if (!result.ok)
    return (
      <SitePage layout="note">
        <PageHeader title="Shared four-year plan" />
        <InlineError
          message={result.error.message}
          reload={result.error.kind === "newer-version"}
        />
      </SitePage>
    );
  return <Shared share={result.share} />;
}

function Shared({ share }: { share: FourYearShare }) {
  const doc = useMemo(() => {
    let n = 0;
    return fourYearDocFromShare(share, {
      id: SHARED_ID,
      // Stable ids for this page only: a copy takes fresh ones.
      newId: () => `shared_entry_${String(++n).padStart(3, "0")}`,
      now: nowIso(),
    });
  }, [share]);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    // The course index gives titles, credits and GenEds; the docs are
    // where "Save a copy" goes.
    void startFourYear()
      .catch((error: unknown) => console.error(error))
      .then(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  const model = usePlanModel(doc, useToday(), undefined);

  return (
    <PlanNavProvider value={STILL_NAV}>
      <PlanModelProvider value={model}>
        <PlanReadOnlyProvider value={true}>
          <SitePage layout="app">
            <PageHeader
              title={share.name}
              status={
                <>
                  <span>Shared four-year plan</span>
                  <span aria-hidden="true">·</span>
                  <span>From {fourYearTermLabel(share.firstTermId)}</span>
                  <span aria-hidden="true">·</span>
                  <span>Read-only</span>
                </>
              }
              actions={<SaveCopy share={share} ready={ready} />}
            />
            <div className="max-w-md">
              <CreditsSummary />
            </div>
            <PageSection title="Semesters">
              <Board />
            </PageSection>
            <PageSection title="GenEds" aside={<GenEdStatus />}>
              <div className="-mx-4 md:mx-0 md:border md:border-hairline">
                <GenEdPanel />
              </div>
            </PageSection>
            <p className="text-muted text-sm">
              A copy from a link: it doesn't change when whoever shared it edits
              their plan.
            </p>
          </SitePage>
        </PlanReadOnlyProvider>
      </PlanModelProvider>
    </PlanNavProvider>
  );
}

/** Makes the shared plan one of yours, and opens it in Plan. */
function SaveCopy({ share, ready }: { share: FourYearShare; ready: boolean }) {
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (saving || !ready) return;
    setSaving(true);
    const doc = fourYearDocFromShare(share, {
      id: newLocalId(),
      newId: newLocalId,
      now: nowIso(),
    });
    useFourYear
      .getState()
      .dispatch({ type: "add-doc", doc }, `Saved a copy of ${share.name}`);
    await whenSaved();
    track("four_year_shared_saved", {});
    void navigate({ to: "/plan" });
  };
  return (
    <WithTooltip label="Make this four-year plan one of yours, to change as you like">
      <Button
        onClick={() => void save()}
        disabled={saving}
        aria-disabled={!ready}
      >
        <Copy aria-hidden="true" />
        {saving ? "Saving…" : "Save a copy"}
      </Button>
    </WithTooltip>
  );
}
