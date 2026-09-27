import { SYNC_MAX_FOUR_YEAR_DOCS, SYNC_MAX_PLANS } from "~/core/schema";
import type { SyncNotice } from "./engine";

// Plan sync's words (SPEC §3.13: plain, specific, contractions). Every notice
// is a quiet toast: sync never asks anything and never blocks (DESIGN §5).

export interface SyncToast {
  title: string;
  description?: string;
}

const plans = (n: number) => (n === 1 ? "plan" : "plans");

/**
 * "Your 3 plans and your four-year plan", "Your 2 four-year plans": plans
 * and four-year plans counted together (V3 §2.4), and whether that's one
 * thing or more. `owner` starts the words and `again` names the owner after
 * "and"; `other` says "other" before plans, for the account's own.
 */
function counted(
  planCount: number,
  fourYearCount: number,
  words: { owner: string; again: string; other?: boolean },
): { words: string; many: boolean } {
  const parts: string[] = [];
  const more = words.other ? "other " : "";
  if (planCount === 1) parts.push(`${words.owner} ${more}plan`);
  else if (planCount > 1)
    parts.push(`${words.owner} ${planCount} ${more}plans`);
  const owner = parts.length > 0 ? words.again : words.owner;
  if (fourYearCount === 1) parts.push(`${owner} four-year plan`);
  else if (fourYearCount > 1)
    parts.push(`${owner} ${fourYearCount} four-year plans`);
  return { words: parts.join(" and "), many: planCount + fourYearCount > 1 };
}

function kept(list: readonly { from: string; to: string }[]): string {
  const [first, ...rest] = list;
  if (!first) return "";
  const more =
    rest.length === 0
      ? ""
      : ` (and ${rest.length} more ${plans(rest.length)} the same way)`;
  return `${first.from} was kept as ${first.to}${more}.`;
}

const ALREADY_HAD = "Your account already had one by that name.";
const BOTH_VERSIONS =
  "Your account had a different version, and you have both now.";

const YOURS = { owner: "Your", again: "your" };
const THE_ACCOUNTS = { owner: "Your account's", again: "its", other: true };

/** The toast for a notice, or null when there's nothing worth saying. */
export function syncToast(notice: SyncNotice): SyncToast | null {
  switch (notice.kind) {
    case "first-sign-in": {
      const renamed = notice.renamed.length > 0 ? kept(notice.renamed) : "";
      const copies = notice.copies.length > 0 ? kept(notice.copies) : "";
      if (notice.reset) {
        const details = [
          renamed && `${renamed} ${ALREADY_HAD}`,
          copies && `${copies} ${BOTH_VERSIONS}`,
        ]
          .filter(Boolean)
          .join(" ");
        return details
          ? { title: "Your plans are up to date", description: details }
          : null;
      }
      // Plan opens the account's four-year plan (QA P4). Say so when this
      // device had one of its own, which is no longer the one open.
      const open = notice.fourYear.open;
      const switched = open !== null && notice.fourYear.uploaded > 0;
      const opened = switched ? `${open.name} from your account is open.` : "";
      const accountOnly = counted(
        notice.fromAccount,
        notice.fourYear.fromAccount - (switched ? 1 : 0),
        THE_ACCOUNTS,
      );
      const also = accountOnly.words
        ? `${accountOnly.words} ${accountOnly.many ? "are" : "is"} here too.`
        : "";

      // Something of this device's was saved under a new name: that's the
      // news, and the title says it the one way (QA P4: "saved to your
      // account" over "kept as My plan (copy)" read as two stories).
      const [first, ...rest] = [...notice.renamed, ...notice.copies];
      if (first) {
        const more =
          rest.length === 0
            ? ""
            : ` (and ${rest.length} more ${plans(rest.length)} the same way)`;
        const why = notice.renamed.length > 0 ? ALREADY_HAD : BOTH_VERSIONS;
        return {
          title: `${first.from} from this device is saved as ${first.to}${more}`,
          description: [why, opened, also].filter(Boolean).join(" "),
        };
      }

      const uploaded = counted(
        notice.uploaded,
        notice.fourYear.uploaded,
        YOURS,
      );
      const description = [opened, also].filter(Boolean).join(" ") || undefined;
      if (uploaded.words)
        return {
          title: `${uploaded.words} ${uploaded.many ? "are" : "is"} saved to your account`,
          ...(description ? { description } : {}),
        };
      const fromAccount = counted(
        notice.fromAccount,
        notice.fourYear.fromAccount,
        YOURS,
      );
      if (fromAccount.words)
        return {
          title: `${fromAccount.words} from your account ${fromAccount.many ? "are" : "is"} here`,
        };
      return null;
    }
    case "conflict-copy":
      return {
        title: `Your changes are kept as ${notice.to}`,
        description: `${notice.from} changed on another device too, so you have both versions.`,
      };
    case "too-many-plans":
      return notice.doc === "four-year"
        ? {
            title: `You have ${SYNC_MAX_FOUR_YEAR_DOCS} four-year plans`,
            description:
              "Delete one to make another. Until then, new ones stay on this device.",
          }
        : {
            title: "Your account is full",
            description: `It holds ${SYNC_MAX_PLANS} plans. New plans stay on this device until you delete one.`,
          };
  }
}
