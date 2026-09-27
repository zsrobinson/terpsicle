import { create } from "zustand";
import { releaseShot, type Shot } from "./screenshot";

// The feedback sheet's draft, in memory only: closing the sheet (Esc, a
// click away) keeps it; sending clears it; Undo after sending brings the
// words back. Never stored in the browser.

export type SheetMode = "bug" | "idea" | "pin";

export type ShotState =
  | { status: "none" }
  | { status: "taking" }
  | { status: "ready"; shot: Shot }
  | { status: "failed"; reason: "too-big" | "error" | "unreadable" };

export interface FeedbackDraft {
  mode: SheetMode;
  /** "What happened?" or "What would help?". */
  text: string;
  /** "What did you expect?": bugs only. */
  expected: string;
  includeContext: boolean;
  includeShot: boolean;
  reply: boolean;
  shot: ShotState;
}

interface DraftState extends FeedbackDraft {
  set: (patch: Partial<FeedbackDraft>) => void;
  setShot: (shot: ShotState) => void;
  /** After sending: empty, the boxes back on, the kind kept. */
  clear: () => void;
  /** Undo after sending: the words come back (not the screenshot). */
  restore: (words: Pick<FeedbackDraft, "mode" | "text" | "expected">) => void;
}

const EMPTY: FeedbackDraft = {
  mode: "bug",
  text: "",
  expected: "",
  includeContext: true,
  includeShot: true,
  reply: false,
  shot: { status: "none" },
};

export const useDraft = create<DraftState>()((set, get) => ({
  ...EMPTY,
  set: (patch) => set(patch),
  setShot: (shot) => {
    const was = get().shot;
    if (
      was.status === "ready" &&
      (shot.status !== "ready" || shot.shot !== was.shot)
    )
      releaseShot(was.shot);
    set({ shot });
  },
  clear: () => {
    get().setShot({ status: "none" });
    set({ ...EMPTY, mode: get().mode === "pin" ? "bug" : get().mode });
  },
  restore: (words) => set(words),
}));
