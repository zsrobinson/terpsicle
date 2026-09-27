// A feedback row and what the owner sees of it: pure, so scripts/feedback.ts
// (Node) shares it with the Worker.
import {
  type FeedbackContext,
  FeedbackContextSchema,
  type FeedbackElement,
  FeedbackElementSchema,
  type FeedbackItem,
  type FeedbackKind,
  type FeedbackProduct,
  type FeedbackStatus,
  type PinContext,
  PinContextSchema,
} from "~/core/schema/feedback";

export interface FeedbackRow {
  id: string;
  kind: FeedbackKind;
  product: FeedbackProduct;
  path: string;
  text: string;
  expected: string | null;
  screenshot_key: string | null;
  element_shot_key: string | null;
  context: string | null;
  element: string | null;
  host: string;
  user_id: string | null;
  status: FeedbackStatus;
  group_id: string | null;
  note: string | null;
  undo_hash: string | null;
  replied_at: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
}

function parseJson(text: string | null): unknown {
  if (text === null) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** A stored context, checked against its kind's schema; null if it isn't one. */
function parseContext(
  kind: FeedbackKind,
  text: string | null,
): FeedbackContext | PinContext | null {
  const json = parseJson(text);
  if (json === null) return null;
  const parsed =
    kind === "review"
      ? PinContextSchema.safeParse(json)
      : FeedbackContextSchema.safeParse(json);
  return parsed.success ? parsed.data : null;
}

function parseElement(text: string | null): FeedbackElement | null {
  const parsed = FeedbackElementSchema.safeParse(parseJson(text));
  return parsed.success ? parsed.data : null;
}

/** What the owner sees: whether a reply may go, never to whom. */
export function toItem(row: FeedbackRow): FeedbackItem {
  return {
    id: row.id,
    kind: row.kind,
    product: row.product,
    path: row.path,
    text: row.text,
    expected: row.expected,
    hasScreenshot: row.screenshot_key !== null,
    hasElementShot: row.element_shot_key !== null,
    context: parseContext(row.kind, row.context),
    element: parseElement(row.element),
    host: row.host,
    reply: row.kind !== "review" && row.user_id !== null,
    status: row.status,
    groupId: row.group_id,
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    closedAt: row.closed_at,
  };
}
