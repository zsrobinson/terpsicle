import { z } from "zod";
import {
  FeedbackIdSchema,
  FeedbackKindSchema,
  FeedbackProductSchema,
  type FeedbackStatus,
  FeedbackStatusSchema,
} from "./feedback-enums";
import { IsoDateTimeSchema } from "./primitives";

export * from "./feedback-enums";

// Feedback (docs/FEEDBACK.md): what the feedback sheet sends, the owner's
// pinned notes, and the admin inbox. Kept out of the ~/core/schema barrel
// (import ~/core/schema/feedback): the sheet is lazy, and zod objects don't
// tree-shake.
//
// Never meant to hold: secrets (the ELMS feed link, tokens, push endpoints,
// share-link payloads), other people's words, transcript grades. The
// context's fields are short structured values, apart from the person's own
// block labels and the error messages the app raised; `sanitizeContext`
// (~/core/feedback) scrubs routes and redacts link- and token-shaped text
// in the browser and again in the Worker.

/** The kinds the sheet sends; "review" is a pinned note (`feedback/pin`). */
export const FeedbackSendKindSchema = z.enum(["bug", "idea"]);
export type FeedbackSendKind = z.infer<typeof FeedbackSendKindSchema>;

/** Statuses that close an item: its screenshots go 30 days after. */
export const CLOSED_FEEDBACK_STATUSES: readonly FeedbackStatus[] = [
  "fixed",
  "wont-fix",
  "spam",
];

/** A group of similar items (`feedback_groups.id`), the same shape. */
export const FeedbackGroupIdSchema = FeedbackIdSchema;

/** 32 random bytes, base64url. Only its SHA-256 is stored, for 10 minutes. */
export const FeedbackUndoTokenSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{43}$/, "Expected a 43-char token");

// ---------- Limits ----------

/** The longest "What happened?" / "What would help?" / pinned note. */
export const FEEDBACK_TEXT_MAX = 4_000;
/** The longest "What did you expect?". */
export const FEEDBACK_EXPECTED_MAX = 2_000;
/** Entries in the activity log a report carries. */
export const FEEDBACK_MAX_ACTIONS = 60;
/** The largest image, decoded. */
export const FEEDBACK_IMAGE_MAX_BYTES = 2_000_000;
/** The largest image side, in pixels. */
export const FEEDBACK_IMAGE_MAX_SIDE = 4_096;
/** The largest `feedback/send` or `feedback/pin` request, in bytes. */
export const FEEDBACK_MAX_REQUEST_BYTES = 3_000_000;
/** The largest context, as JSON: a backstop on top of the per-field caps. */
export const FEEDBACK_CONTEXT_MAX_CHARS = 100_000;
/** How long "Undo" works after sending. */
export const FEEDBACK_UNDO_MS = 10 * 60_000;
/** How long an admin's delete stays undoable before the row goes. */
export const FEEDBACK_DELETE_UNDO_MS = 10_000;

// ---------- Images ----------

export const FeedbackImageTypeSchema = z.enum([
  "image/webp",
  "image/png",
  "image/jpeg",
]);
export type FeedbackImageType = z.infer<typeof FeedbackImageTypeSchema>;

/**
 * A screenshot or a chosen image, base64 in the JSON body. The Worker checks
 * the bytes are really that type and a sane size (`sniffImage`).
 */
export const FeedbackImageSchema = z.strictObject({
  type: FeedbackImageTypeSchema,
  data: z
    .string()
    .min(8)
    .max(Math.ceil(FEEDBACK_IMAGE_MAX_BYTES / 3) * 4)
    .regex(/^[A-Za-z0-9+/]+={0,2}$/, "Expected base64"),
});
export type FeedbackImage = z.infer<typeof FeedbackImageSchema>;

// ---------- The context ("Include what I was doing") ----------

const Short = (max: number) => z.string().max(max);
/** Milliseconds since the epoch, from the browser's clock. */
const AtSchema = z.number().int().min(0);
/** An analytics-style property value: short, never free text. */
const PropValueSchema = z.union([
  Short(200),
  z.number(),
  z.boolean(),
  z.null(),
]);
const PropKeySchema = z.string().regex(/^[A-Za-z0-9_]{1,40}$/);

const boundedRecord = <V extends z.ZodType>(value: V, maxKeys: number) =>
  z
    .record(PropKeySchema, value)
    .refine((r) => Object.keys(r).length <= maxKeys, {
      message: `At most ${maxKeys} keys`,
    });

/**
 * One entry of the activity log (src/lib/activity-log.ts): a route change
 * (its pattern only), an app event (what `track()` sends), an error the page
 * raised, or an API call that failed (method, route, status; never a body).
 */
export const ActivityEntrySchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("nav"), at: AtSchema, route: Short(300) }),
  z.strictObject({
    type: z.literal("event"),
    at: AtSchema,
    name: z.string().regex(/^[a-z0-9_]{1,64}$/),
    props: boundedRecord(PropValueSchema, 20),
  }),
  z.strictObject({
    type: z.literal("error"),
    at: AtSchema,
    name: Short(100),
    message: Short(500),
    stack: Short(2_000).nullable(),
  }),
  z.strictObject({
    type: z.literal("request"),
    at: AtSchema,
    method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"]),
    route: Short(200),
    /** 0 for a network failure. */
    status: z.number().int().min(0).max(599),
  }),
]);
export type ActivityEntry = z.infer<typeof ActivityEntrySchema>;

export const ThemeNameSchema = z.enum(["light", "dark"]);

const SizeSchema = z.strictObject({
  width: z.number().int().min(0).max(100_000),
  height: z.number().int().min(0).max(100_000),
});

/**
 * The person's own plan, as it was when they sent it: what makes a Schedule
 * bug reproducible. Block labels are theirs to share (the screenshot still
 * covers them, as it covers every `data-private` element).
 */
export const FeedbackPlanSchema = z.strictObject({
  termId: Short(16),
  name: Short(80),
  /** "CMSC131 0101". */
  sections: z.array(Short(24)).max(80),
  bookmarks: z.array(Short(12)).max(80),
  blocks: z
    .array(
      z.strictObject({
        label: Short(80),
        days: Short(12),
        start: Short(5),
        end: Short(5),
      }),
    )
    .max(40),
});
export type FeedbackPlan = z.infer<typeof FeedbackPlanSchema>;

/** What "Include what I was doing" adds, built by `buildFeedbackContext`. */
export const FeedbackContextSchema = z
  .strictObject({
    /** The app's build, `__APP_VERSION__`. */
    version: Short(64),
    /** "Chrome 141 · macOS", from the user agent. */
    browser: Short(120),
    screen: SizeSchema.extend({ dpr: z.number().min(0).max(10) }),
    viewport: SizeSchema,
    online: z.boolean(),
    theme: ThemeNameSchema,
    /** The route pattern, scrubbed like analytics (`scrubUrl`). */
    route: Short(300),
    actions: z.array(ActivityEntrySchema).max(FEEDBACK_MAX_ACTIONS),
    plan: FeedbackPlanSchema.nullable(),
    settings: boundedRecord(PropValueSchema, 40),
  })
  .refine((c) => JSON.stringify(c).length <= FEEDBACK_CONTEXT_MAX_CHARS, {
    message: "Context too large",
  });
export type FeedbackContext = z.infer<typeof FeedbackContextSchema>;

/** Where a pinned note was left: enough for an agent to find the element. */
export const FeedbackElementSchema = z.strictObject({
  /** A stable CSS selector (ids, `data-*`, then nth-of-type). */
  selector: Short(500),
  /** Its visible text, cut to 200 characters. */
  text: Short(200),
  /** Its `data-*` attributes (and the nearest ancestor's), name to value. */
  ids: z
    .record(z.string().regex(/^data-[a-z0-9-]{1,40}$/), Short(200))
    .refine((r) => Object.keys(r).length <= 20, { message: "At most 20" }),
  /** Where it was, in page pixels, when the note was pinned. */
  rect: z.strictObject({
    x: z.number(),
    y: z.number(),
    width: z.number().min(0),
    height: z.number().min(0),
  }),
});
export type FeedbackElement = z.infer<typeof FeedbackElementSchema>;

/** A page path with its search params, as sent. */
const PathSchema = z
  .string()
  .min(1)
  .max(1_000)
  .regex(/^\/[^\s]*$/, "Expected a path");

const TrimmedText = (max: number) => z.string().trim().min(1).max(max);

// ---------- POST /api/feedback/send ----------

export const FeedbackSendInputSchema = z
  .strictObject({
    kind: FeedbackSendKindSchema,
    product: FeedbackProductSchema,
    /** The page, scrubbed again by the Worker before it's stored. */
    path: PathSchema,
    text: TrimmedText(FEEDBACK_TEXT_MAX),
    /** "What did you expect?": bugs only, optional. */
    expected: TrimmedText(FEEDBACK_EXPECTED_MAX).optional(),
    screenshot: FeedbackImageSchema.optional(),
    context: FeedbackContextSchema.optional(),
    /** "You can reply by email": signed in only; stores who sent it. */
    reply: z.boolean().default(false),
  })
  .refine((i) => i.kind === "bug" || i.expected === undefined, {
    message: "Only bugs have an expected result",
    path: ["expected"],
  });
export type FeedbackSendInput = z.infer<typeof FeedbackSendInputSchema>;

export const FeedbackSendResultSchema = z.strictObject({
  id: FeedbackIdSchema,
  /** For `feedback/undo`, within FEEDBACK_UNDO_MS. */
  undoToken: FeedbackUndoTokenSchema,
});
export type FeedbackSendResult = z.infer<typeof FeedbackSendResultSchema>;

// ---------- POST /api/feedback/undo ----------

export const FeedbackUndoInputSchema = z.strictObject({
  id: FeedbackIdSchema,
  undoToken: FeedbackUndoTokenSchema,
});
export type FeedbackUndoInput = z.infer<typeof FeedbackUndoInputSchema>;

export const FeedbackUndoResultSchema = z.strictObject({
  /** `expired`: too late, or no such item (the two look the same). */
  status: z.enum(["undone", "expired"]),
});
export type FeedbackUndoResult = z.infer<typeof FeedbackUndoResultSchema>;

// ---------- POST /api/feedback/pin (admin) ----------

/** The page a pinned note was left on: what makes it findable again. */
export const PinContextSchema = z.strictObject({
  version: Short(64),
  viewport: SizeSchema,
  theme: ThemeNameSchema,
});
export type PinContext = z.infer<typeof PinContextSchema>;

export const FeedbackPinInputSchema = z.strictObject({
  product: FeedbackProductSchema,
  /** The route and its search params, unscrubbed: the owner's own page. */
  path: PathSchema,
  text: TrimmedText(FEEDBACK_TEXT_MAX),
  element: FeedbackElementSchema,
  /** The full viewport. */
  screenshot: FeedbackImageSchema.optional(),
  /** Just the element, cropped. */
  elementShot: FeedbackImageSchema.optional(),
  context: PinContextSchema,
});
export type FeedbackPinInput = z.infer<typeof FeedbackPinInputSchema>;

export const FeedbackPinResultSchema = FeedbackSendResultSchema;
export type FeedbackPinResult = FeedbackSendResult;

// ---------- POST /api/feedback/pins (admin) ----------

export const FeedbackPinsInputSchema = z.strictObject({
  /** A pathname, no search: pins show on their route. */
  pathname: z
    .string()
    .min(1)
    .max(500)
    .regex(/^\/[^\s?#]*$/),
});
export type FeedbackPinsInput = z.infer<typeof FeedbackPinsInputSchema>;

export const PinSchema = z.strictObject({
  id: FeedbackIdSchema,
  /**
   * 1, 2, 3 … in the order they were left on this route. Spam isn't
   * listed, so marking one spam renumbers the ones after it.
   */
  number: z.number().int().min(1),
  text: z.string(),
  status: FeedbackStatusSchema,
  element: FeedbackElementSchema,
  createdAt: IsoDateTimeSchema,
});
export type Pin = z.infer<typeof PinSchema>;

export const FeedbackPinsResultSchema = z.strictObject({
  pins: z.array(PinSchema),
});
export type FeedbackPinsResult = z.infer<typeof FeedbackPinsResultSchema>;

// ---------- The admin inbox: /api/admin/feedback/* ----------

/** One item as the owner sees it. `reply` says whether they may be emailed, never who. */
export const FeedbackItemSchema = z.strictObject({
  id: FeedbackIdSchema,
  kind: FeedbackKindSchema,
  product: FeedbackProductSchema,
  path: z.string(),
  text: z.string(),
  expected: z.string().nullable(),
  /** Served at /admin/feedback/shot/<id>. */
  hasScreenshot: z.boolean(),
  /** Served at /admin/feedback/shot/<id>/element. */
  hasElementShot: z.boolean(),
  /** "What I was doing" for bug and idea; the page's state for a pinned note. */
  context: z.union([FeedbackContextSchema, PinContextSchema]).nullable(),
  element: FeedbackElementSchema.nullable(),
  host: z.string(),
  reply: z.boolean(),
  status: FeedbackStatusSchema,
  groupId: FeedbackGroupIdSchema.nullable(),
  note: z.string().nullable(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
  closedAt: IsoDateTimeSchema.nullable(),
});
export type FeedbackItem = z.infer<typeof FeedbackItemSchema>;

export const FeedbackGroupSchema = z.strictObject({
  id: FeedbackGroupIdSchema,
  /** The model's one-line summary: show it with the sparkles. */
  summary: z.string(),
  updatedAt: IsoDateTimeSchema,
});
export type FeedbackGroup = z.infer<typeof FeedbackGroupSchema>;

/** Where the next page starts: the last row's `created_at` and id. */
export const FeedbackCursorSchema = z
  .string()
  .regex(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z~[A-Za-z0-9_-]{22}$/,
    "Expected a feedback cursor",
  );

export const FeedbackListInputSchema = z.strictObject({
  /** One item, for a link back to it (issues, "Copy for an agent"). */
  id: FeedbackIdSchema.optional(),
  status: FeedbackStatusSchema.optional(),
  kind: FeedbackKindSchema.optional(),
  product: FeedbackProductSchema.optional(),
  /** Exact host, e.g. `pr-42-terpsicle.zsrobinson.workers.dev`. */
  host: z.string().min(1).max(200).optional(),
  groupId: FeedbackGroupIdSchema.optional(),
  cursor: FeedbackCursorSchema.optional(),
  limit: z.number().int().min(1).max(100).default(50),
});
export type FeedbackListInput = z.infer<typeof FeedbackListInputSchema>;

export const FeedbackListResultSchema = z.strictObject({
  items: z.array(FeedbackItemSchema),
  /** Pass it back for the next page; null on the last one. */
  cursor: FeedbackCursorSchema.nullable(),
  /** The groups these items belong to. */
  groups: z.array(FeedbackGroupSchema),
  /** Every host with feedback, for the filter. */
  hosts: z.array(z.string()),
  /** Items still `new`, whatever the filters. */
  newCount: z.number().int().min(0),
});
export type FeedbackListResult = z.infer<typeof FeedbackListResultSchema>;

export const FeedbackUpdateInputSchema = z
  .strictObject({
    id: FeedbackIdSchema,
    status: FeedbackStatusSchema.optional(),
    /** The owner's own note; null clears it. */
    note: z.string().trim().max(2_000).nullable().optional(),
    groupId: FeedbackGroupIdSchema.nullable().optional(),
  })
  .refine(
    (i) =>
      i.status !== undefined || i.note !== undefined || i.groupId !== undefined,
    { message: "Nothing to change" },
  );
export type FeedbackUpdateInput = z.infer<typeof FeedbackUpdateInputSchema>;

export const FeedbackUpdateResultSchema = z.discriminatedUnion("status", [
  z.strictObject({
    status: z.literal("updated"),
    item: FeedbackItemSchema,
    /** A "Fixed" note went to the person who asked for a reply. */
    emailed: z.boolean(),
  }),
  z.strictObject({ status: z.literal("gone") }),
]);
export type FeedbackUpdateResult = z.infer<typeof FeedbackUpdateResultSchema>;

export const FeedbackDeleteInputSchema = z.strictObject({
  id: FeedbackIdSchema,
  /** Undo a delete, within FEEDBACK_DELETE_UNDO_MS. */
  restore: z.boolean().default(false),
});
export type FeedbackDeleteInput = z.infer<typeof FeedbackDeleteInputSchema>;

export const FeedbackDeleteResultSchema = z.strictObject({
  status: z.enum(["deleted", "restored", "gone"]),
});
export type FeedbackDeleteResult = z.infer<typeof FeedbackDeleteResultSchema>;

// ---------- POST /api/admin/feedback/group ----------

export const FeedbackGroupInputSchema = z.strictObject({});

export const FeedbackGroupResultSchema = z.strictObject({
  /** `unavailable`: the model didn't answer; the old groups stay. */
  status: z.enum(["grouped", "unavailable"]),
  /** Groups made this time. */
  groups: z.number().int().min(0),
  /** Open items now in a group. */
  grouped: z.number().int().min(0),
});
export type FeedbackGroupResult = z.infer<typeof FeedbackGroupResultSchema>;
