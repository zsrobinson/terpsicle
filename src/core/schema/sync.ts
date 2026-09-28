import { z } from "zod";
import { BlockSchema, CourseColorSchema, PlanSchema } from "./local";
import { SyncedPrefsSchema } from "./prefs";
import {
  CourseCodeSchema,
  IsoDateTimeSchema,
  LocalIdSchema,
  TermIdSchema,
} from "./primitives";
import { TravelSettingsSchema } from "./travel";

// Plan sync (docs/V2.md §5): what a signed-in person's data looks like on the
// server. The unit of sync is a document, saved whole with the `rev` it was
// based on: one per plan, one per four-year plan (docs/V3.md §2.4), plus one
// settings doc per user. The mapping to and from the Dexie tables is
// `~/core/sync`.

export const SYNC_DOC_KINDS = ["plan", "settings", "four-year"] as const;
export const SyncDocKindSchema = z.enum(SYNC_DOC_KINDS);
export type SyncDocKind = z.infer<typeof SyncDocKindSchema>;

/** The settings doc's id: there's one per user. */
export const SETTINGS_DOC_ID = "settings";

/**
 * The server's version counter, from a per-user counter that goes up on every
 * save, so "every doc with `rev` > n" is a pull cursor. 0 on a device means
 * "never saved".
 */
export const RevSchema = z.number().int().min(0);
export type Rev = z.infer<typeof RevSchema>;

/** A plan doc is the plan row itself: term, name, tab order and courses. */
export const PlanDocSchema = PlanSchema;
export type PlanDoc = z.infer<typeof PlanDocSchema>;

/**
 * Each term's main plan (V2 §5.5): the one plan you're actually taking, which
 * Chat, Plan, Todo and the calendar feed read. A term missing here, or whose
 * plan is gone, has its first tab as main (`mainPlanFor` in ~/core/plans).
 */
export const MainPlansSchema = z.record(TermIdSchema, LocalIdSchema);
export type MainPlans = z.infer<typeof MainPlansSchema>;

function uniqueIds(blocks: readonly { id: string }[]): boolean {
  return new Set(blocks.map((b) => b.id)).size === blocks.length;
}

/**
 * Builds from before main plans call the same map `chatPlans`, and read and
 * write only that. A body without `mainPlans` takes theirs.
 */
function withLegacyMainPlans(body: unknown): unknown {
  if (typeof body !== "object" || body === null || "mainPlans" in body)
    return body;
  return "chatPlans" in body ? { ...body, mainPlans: body.chatPlans } : body;
}

/**
 * Everything synced that doesn't belong to one plan: blocks (per term, shared
 * by the term's plans), course colors (global) and travel settings, plus
 * each term's main plan and the other products' prefs (`SyncedPrefs`).
 */
export const SettingsDocSchema = z.preprocess(
  withLegacyMainPlans,
  z.object({
    blocks: z
      .array(BlockSchema)
      .refine(uniqueIds, { message: "A block appears twice" }),
    colors: z.record(CourseCodeSchema, CourseColorSchema),
    travel: TravelSettingsSchema,
    mainPlans: MainPlansSchema,
    /**
     * `mainPlans` again, under its old name, for builds from before main
     * plans, which can't read a doc without it. Every push writes it
     * (`settingsDocOf`); nothing reads it. Drop it once those builds are gone.
     */
    chatPlans: MainPlansSchema.optional(),
    /** Missing in docs saved before prefs, and in older builds' pushes. */
    prefs: SyncedPrefsSchema.default(() => ({})),
  }),
);
export type SettingsDoc = z.infer<typeof SettingsDocSchema>;

/**
 * A four-year doc's body as the shared sync schemas check it: a JSON object
 * with the doc's id, under the push's size limit like every kind. The full
 * `FourYearDocSchema` stays out of this barrel (every page loads it; see
 * ./index.ts), so the Worker checks it on push (src/server/sync/api.ts) and
 * the device when it reads a body. Nothing on the server reads the body past
 * that (V3 §2.4–2.5: grades live in it).
 */
export const FourYearSyncBodySchema = z.looseObject({ id: LocalIdSchema });
export type FourYearSyncBody = z.infer<typeof FourYearSyncBodySchema>;

/**
 * A stored doc as the server returns it. A plan or four-year doc with
 * `body: null` is a tombstone.
 */
export const SyncDocSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("plan"),
      id: LocalIdSchema,
      rev: RevSchema.min(1),
      /** Server time of the save; tombstones are pruned 30 days after it. */
      updatedAt: IsoDateTimeSchema,
      body: PlanDocSchema.nullable(),
    })
    .refine((d) => d.body === null || d.body.id === d.id, {
      message: "A plan doc's body must have the doc's id",
      path: ["body", "id"],
    }),
  z.object({
    kind: z.literal("settings"),
    id: z.literal(SETTINGS_DOC_ID),
    rev: RevSchema.min(1),
    updatedAt: IsoDateTimeSchema,
    body: SettingsDocSchema,
  }),
  z
    .object({
      kind: z.literal("four-year"),
      id: LocalIdSchema,
      rev: RevSchema.min(1),
      updatedAt: IsoDateTimeSchema,
      body: FourYearSyncBodySchema.nullable(),
    })
    .refine((d) => d.body === null || d.body.id === d.id, {
      message: "A four-year doc's body must have the doc's id",
      path: ["body", "id"],
    }),
]);
export type SyncDoc = z.infer<typeof SyncDocSchema>;
export type PlanSyncDoc = Extract<SyncDoc, { kind: "plan" }>;
export type SettingsSyncDoc = Extract<SyncDoc, { kind: "settings" }>;
export type FourYearSyncDoc = Extract<SyncDoc, { kind: "four-year" }>;

// ---------- on the device (Dexie v2, DATA.md §5) ----------

/**
 * A doc's name on the device: `plan:<id>`, `four-year:<id>` or `settings`
 * (`DocKey` in ~/core/sync).
 */
export const DocKeySchema = z.union([
  z.literal(SETTINGS_DOC_ID),
  z.templateLiteral(["plan:", LocalIdSchema]),
  z.templateLiteral(["four-year:", LocalIdSchema]),
]);

/**
 * A `syncDocs` row: one doc's sync flags on this device (`DocSync` in
 * ~/core/sync). The settings doc's row also keeps `base`, its body as last
 * saved or pulled, which settles a conflict per key (V2 §5.4).
 */
export const LocalSyncDocSchema = z.object({
  key: DocKeySchema,
  /** The server rev this device's version is based on; 0 = never saved. */
  rev: RevSchema,
  dirty: z.boolean(),
  /** Made dirty again on load: a push the page never heard back from. */
  inFlight: z.boolean(),
  base: SettingsDocSchema.nullable().optional(),
});
export type LocalSyncDoc = z.infer<typeof LocalSyncDocSchema>;

/**
 * The `sync` settings row: whose account this device's sync state belongs
 * to, and where its pulls continue. A different (or no) user at sign-in
 * means a first sign-in on this device (V2 §5.4).
 */
export const LocalSyncMetaSchema = z.object({
  userId: z.string().min(1),
  cursor: RevSchema,
});
export type LocalSyncMeta = z.infer<typeof LocalSyncMetaSchema>;
