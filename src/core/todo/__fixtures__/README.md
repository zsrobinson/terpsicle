# Calendar feeds

Golden inputs for `parseIcs` (docs/V3.md §3.6, §3.7). Each `<name>.ics` is a feed or a dropped file; `<name>.golden.txt` is what the parser reads from it, written by `ics.test.ts` (`pnpm vitest --project core -u` rewrites them, so review the diff).

**Both feeds here are synthetic**, with invented courses, titles and dates, never a real student's:

- `synthetic-elms-2026-09.ics` is shaped like an ELMS-Canvas feed (CRLF, `icalendar-ruby`, UTC times, all-day `VALUE=DATE` items, `event-assignment-…` and `event-calendar-event-…` UIDs, folded lines, escapes).
- `synthetic-file-gradescope.ics` is shaped like a file someone exports themselves and drops on `/todo/connect` (LF, a `VTIMEZONE`, `TZID` times, Gradescope links), read with `source: "file"`.

## Adding a real feed

Run `pnpm tsx scripts/record-ics-fixture.ts` and paste the feed link when it asks (stdin, so it stays out of shell history; add `--fake-titles` to replace every title with a fixed fake). It keeps the feed's structure, UIDs, dates, course labels and URLs, drops descriptions (keeping only whether they mention gradescope.com), replaces the calendar's name, and writes `elms-<yyyy-mm-dd>.ics` here. Read it before committing, add it to `FEEDS` in `feeds.ts`, and run the core tests with `-u` to write its golden file. Once a real feed covers what `synthetic-elms-2026-09.ics` does, delete that one and its golden file.

The `.ics` files keep their line endings byte for byte (`.gitattributes`).
