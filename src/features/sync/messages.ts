import { SYNC_MAX_PLANS } from "~/core/schema";
import type { SyncNotice } from "./engine";

// Plan sync's words (SPEC §3.13: plain, specific, contractions). Every notice
// is a quiet toast: sync never asks anything and never blocks (DESIGN §5).

export interface SyncToast {
  title: string;
  description?: string;
}

const plans = (n: number) => (n === 1 ? "plan" : "plans");

function kept(list: readonly { from: string; to: string }[]): string {
  const [first, ...rest] = list;
  if (!first) return "";
  const more =
    rest.length === 0
      ? ""
      : ` (and ${rest.length} more ${plans(rest.length)} the same way)`;
  return `${first.from} was kept as ${first.to}${more}.`;
}

/** The toast for a notice, or null when there's nothing worth saying. */
export function syncToast(notice: SyncNotice): SyncToast | null {
  switch (notice.kind) {
    case "first-sign-in": {
      const renamed = notice.renamed.length > 0 ? kept(notice.renamed) : "";
      const copies = notice.copies.length > 0 ? kept(notice.copies) : "";
      const details = [
        renamed && `${renamed} Your account already had one by that name.`,
        copies &&
          `${copies} Your account had a different version, and you have both now.`,
      ]
        .filter(Boolean)
        .join(" ");
      if (notice.reset)
        return details
          ? { title: "Your plans are up to date", description: details }
          : null;
      const { uploaded, fromAccount } = notice;
      const also =
        fromAccount === 0
          ? ""
          : fromAccount === 1
            ? "Your account's other plan is here too."
            : `Your account's ${fromAccount} other plans are here too.`;
      const description =
        [details, also].filter(Boolean).join(" ") || undefined;
      if (uploaded > 0)
        return {
          title:
            uploaded === 1
              ? "Your plan is saved to your account"
              : `Your ${uploaded} plans are saved to your account`,
          ...(description ? { description } : {}),
        };
      if (fromAccount > 0)
        return {
          title:
            fromAccount === 1
              ? "Your plan from your account is here"
              : `Your ${fromAccount} plans from your account are here`,
          ...(details ? { description: details } : {}),
        };
      return details
        ? { title: "Your plans are on your account", description: details }
        : null;
    }
    case "conflict-copy":
      return {
        title: `Your changes are kept as ${notice.to}`,
        description: `${notice.from} changed on another device too, so you have both versions.`,
      };
    case "too-many-plans":
      return {
        title: "Your account is full",
        description: `It holds ${SYNC_MAX_PLANS} plans. New plans stay on this device until you delete one.`,
      };
  }
}
