import { z } from "zod";

// `/admin/kit?view=` (docs/COHESION.md §3, Phase 2). Its own module, so the
// route's search schema loads without the admin panel's other schemas.

/** The page kit's parts; no view shows everything. */
export const KIT_VIEWS = ["page", "lists", "controls", "popups"] as const;
export const KitViewSchema = z.enum(KIT_VIEWS);
export type KitPart = z.infer<typeof KitViewSchema>;
