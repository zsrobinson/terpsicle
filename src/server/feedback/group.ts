// "Group similar" (docs/FEEDBACK.md, "Triage"): the open items, newest
// first, go to Workers AI, which groups items about the same thing and
// writes a one-line summary for each (shown with the sparkles). Run from
// the inbox's button and by the daily job. Each run replaces the open
// items' groups; groups nothing points at any more go with the daily job.
import {
  buildGroupingMessages,
  GROUP_MAX_ITEMS,
  GROUPING_JSON_SCHEMA,
  type GroupingItem,
  offlineGroups,
  type ParsedGroup,
  parseGroupingOutput,
} from "~/core/feedback";
import type { FeedbackGroupResult } from "~/core/schema/feedback";
import { randomToken } from "../crypto";
import type { FeedbackRow } from "./store";

/** The model, the same small instruct model chat's policy check uses. */
export const GROUPING_MODEL = "@cf/meta/llama-3.1-8b-instruct-fp8-fast";

export interface GroupingEnv {
  DB: D1Database;
  AI?: Ai;
  /** With AUTH_TEST_MODE, mock mode's offline stand-in (no Workers AI). */
  MODERATION_OFFLINE?: string;
  AUTH_TEST_MODE?: string;
}

type OpenRow = Pick<FeedbackRow, "id" | "kind" | "product" | "text">;

async function askModel(
  env: GroupingEnv,
  items: readonly GroupingItem[],
): Promise<ParsedGroup[] | null> {
  if (env.MODERATION_OFFLINE === "true" && env.AUTH_TEST_MODE === "true")
    return offlineGroups(items);
  if (!env.AI) return null;
  try {
    const output = await env.AI.run(GROUPING_MODEL, {
      messages: buildGroupingMessages(items),
      response_format: {
        type: "json_schema",
        json_schema: GROUPING_JSON_SCHEMA,
      },
      max_tokens: 1_200,
      temperature: 0.1,
    });
    return parseGroupingOutput(
      (output as { response?: unknown }).response,
      items.length,
    );
  } catch (error) {
    // The error's name only: messages can quote the input.
    console.warn({
      feedback: "grouping failed",
      error: error instanceof Error ? error.name : "error",
    });
    return null;
  }
}

/** Groups the open items (New and Planned) again. */
export async function groupOpenFeedback(
  env: GroupingEnv,
  now: Date,
): Promise<FeedbackGroupResult> {
  const { results: open } = await env.DB.prepare(
    `SELECT id, kind, product, text FROM feedback
     WHERE deleted_at IS NULL AND status IN ('new', 'planned')
     ORDER BY created_at DESC, id DESC LIMIT ?1`,
  )
    .bind(GROUP_MAX_ITEMS)
    .all<OpenRow>();
  if (open.length < 2) return { status: "grouped", groups: 0, grouped: 0 };
  const groups = await askModel(env, open);
  if (groups === null) return { status: "unavailable", groups: 0, grouped: 0 };

  const at = now.toISOString();
  const groupOf = new Map<string, string>();
  const statements: D1PreparedStatement[] = [];
  for (const group of groups) {
    const id = randomToken(16);
    statements.push(
      env.DB.prepare(
        "INSERT INTO feedback_groups (id, summary, created_at, updated_at) VALUES (?1, ?2, ?3, ?3)",
      ).bind(id, group.summary, at),
    );
    for (const i of group.items) {
      const row = open[i];
      if (row) groupOf.set(row.id, id);
    }
  }
  for (const row of open)
    statements.push(
      env.DB.prepare("UPDATE feedback SET group_id = ?2 WHERE id = ?1").bind(
        row.id,
        groupOf.get(row.id) ?? null,
      ),
    );
  await env.DB.batch(statements);
  return { status: "grouped", groups: groups.length, grouped: groupOf.size };
}
