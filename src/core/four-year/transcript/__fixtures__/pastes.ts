import apTransfer from "./synthetic-ap-transfer.txt?raw";
import fourSemesters from "./synthetic-four-semesters.txt?raw";
import inProgress from "./synthetic-in-progress.txt?raw";

/**
 * Every saved paste, by file name, for the golden, redaction and robustness
 * tests. The synthetic ones are invented in v1's format; a redacted real
 * paste is added here too (README.md), and every test runs over it.
 */
export const PASTES: Readonly<Record<string, string>> = {
  "synthetic-four-semesters": fourSemesters,
  "synthetic-ap-transfer": apTransfer,
  "synthetic-in-progress": inProgress,
};
