import { type DirectoryId, DirectoryIdSchema } from "../schema";

/**
 * `config/admins.txt` → the admins' directory IDs (V2.md §4.8). One per
 * line; blank lines and `#` comments (whole-line or trailing) are ignored,
 * and entries are trimmed and lowercased. A line that isn't a directory ID
 * throws, so a typo fails the tests and the Worker's startup rather than
 * quietly leaving someone out.
 */
export function parseAdmins(text: string): ReadonlySet<DirectoryId> {
  const ids = new Set<DirectoryId>();
  text.split(/\r?\n/).forEach((line, index) => {
    const entry = line.replace(/#.*$/, "").trim().toLowerCase();
    if (!entry) return;
    const parsed = DirectoryIdSchema.safeParse(entry);
    if (!parsed.success)
      throw new Error(
        `config/admins.txt line ${index + 1}: "${entry}" isn't a directory ID (2–16 letters and digits)`,
      );
    ids.add(parsed.data);
  });
  return ids;
}
