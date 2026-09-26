# Transcript pastes

Golden inputs for `parseTranscript` (docs/V3.md §2.10). Each `<name>.txt` is a paste; `<name>.golden.txt` is what the parser reads from it, written by `parse.test.ts` (`pnpm vitest --project core -u` rewrites them, so review the diff).

**Every paste here is synthetic** (`synthetic-*.txt`, first line `SYNTHETIC FIXTURE`): invented courses and grades in v1's 2025 format, never a real student's data. They stand in until the owner shares a real paste (§10, owner action 1).

## Adding a real paste

1. Keep the owner's paste out of the repo and out of the PR until it's redacted.
2. Replace the header's personal values with the fixed fakes the synthetic pastes use: name `Sam Testudo`, UID `XXXXXXXXX`, email `sam.testudo@example.edu`, birth date `01/01/2000`, and drop any address lines. Leave the course lines exactly as pasted, spacing included.
3. Save it as `real-<yyyy-mm>-<what it covers>.txt` (for example `real-2026-10-ap-w-in-progress.txt`), add it to `PASTES` in `pastes.ts`, and run the core tests with `-u` to write its golden file. The redaction test fails if a 9-digit number, another email or another birth date is left.
4. Once real pastes cover what a synthetic one does (a plain four-semester paste; AP and transfer credit; a W, a drop and an in-progress term), delete that synthetic paste and its golden file.
