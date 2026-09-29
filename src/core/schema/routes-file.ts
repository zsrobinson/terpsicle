import { z } from "zod";
import { decodeRoutes } from "../travel/routes-binary";

// Out of the barrel: it decodes with core/travel, which reads the barrel,
// and only the campus map's query needs it (import ~/core/schema/routes-file).

/**
 * `geo/routes.<hash>.bin` (DATA.md §4.2) as bytes that decode: a file with
 * the wrong magic, version or length is broken, so it's never saved or
 * shown, whether it came from the server or from disk.
 */
export const RoutesFileSchema = z
  .instanceof(ArrayBuffer)
  .superRefine((bytes, ctx) => {
    try {
      decodeRoutes(bytes);
    } catch (error) {
      ctx.addIssue({
        code: "custom",
        message:
          error instanceof Error ? error.message : "Routes file doesn't decode",
      });
    }
  });
