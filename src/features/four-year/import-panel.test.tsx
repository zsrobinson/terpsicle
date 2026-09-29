import { onlineManager } from "@tanstack/react-query";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  EMPTY_TRANSCRIPT_CHECKS,
  parseTranscript,
  pendingChoices,
  transcriptRows,
} from "~/core/four-year/transcript";
import { PASTES } from "~/core/four-year/transcript/__fixtures__/pastes";
import { canUndo } from "~/core/plans/history";
import { aCourseIndexEntry, aFourYear, aFourYearEntry } from "~/fixtures";
import { MOBILE_QUERY } from "~/hooks/use-media-query";
import { track } from "~/lib/analytics";
import { DataError } from "~/state/data-source";
import { courseIndexSource } from "~/state/query/course-index-testing";
import { connectPublished } from "~/state/query/published";
import { TooltipProvider } from "~/ui/tooltip";
import { removeGrades } from "./actions";
import { PlanFirstVisit } from "./first-visit";
import { ImportPanel } from "./import-panel";
import { resetTranscriptImport, useTranscriptImport } from "./import-state";
import {
  PlanModelProvider,
  type PlanNav,
  PlanNavProvider,
  usePlanModel,
} from "./model";
import { activeDoc, INITIAL_FOUR_YEAR_STORE, useFourYear } from "./store";

vi.mock("~/lib/analytics", () => ({ track: vi.fn() }));

// The Import tab (docs/V3.md §2.10) at phone width, where the check list sits
// under the paste: paste, check (skip, "or", mapping, Keep grades), import.

const TODAY = "2026-09-26";

function paste(name: string): string {
  const text = PASTES[name];
  if (text === undefined) throw new Error(`No paste ${name}`);
  return text;
}

function nav(go: PlanNav["go"] = vi.fn()): PlanNav {
  return { search: { tab: "import" }, go, back: vi.fn() };
}

function Harness({ children, go }: { children: ReactNode; go: PlanNav["go"] }) {
  const doc = useFourYear(activeDoc);
  const model = usePlanModel(
    // biome-ignore lint/style/noNonNullAssertion: each test opens a doc first
    doc!,
    TODAY,
    undefined,
  );
  return (
    <TooltipProvider>
      <PlanNavProvider value={nav(go)}>
        <PlanModelProvider value={model}>{children}</PlanModelProvider>
      </PlanNavProvider>
    </TooltipProvider>
  );
}

function renderPanel(docOverrides: Parameters<typeof aFourYear>[0] = {}) {
  const doc = aFourYear({ firstTermId: "202408", ...docOverrides });
  useFourYear.setState({
    ...INITIAL_FOUR_YEAR_STORE,
    phase: "ready",
    history: { past: [], present: { docs: [doc] }, future: [] },
    activeId: doc.id,
  });
  const go = vi.fn();
  const user = userEvent.setup();
  render(
    <Harness go={go}>
      <ImportPanel />
    </Harness>,
  );
  const box = screen.getByLabelText("Paste your unofficial transcript");
  return {
    user,
    go,
    /** Pasting, the way the clipboard does: all at once. */
    paste: async (text: string) => {
      await user.click(box);
      await user.paste(text);
    },
  };
}

const openDoc = () => {
  const doc = activeDoc(useFourYear.getState());
  if (!doc) throw new Error("no doc");
  return doc;
};

/** Phone width: the check list sits under the paste, in the panel. */
function phoneWidth() {
  vi.spyOn(window, "matchMedia").mockImplementation(
    (query) =>
      ({
        matches: query === MOBILE_QUERY,
        media: query,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }) as unknown as MediaQueryList,
  );
}

beforeEach(() => {
  phoneWidth();
  vi.mocked(track).mockClear();
  resetTranscriptImport();
  connectPublished(
    courseIndexSource([
      aCourseIndexEntry({
        code: "CMSC131",
        title: "Object-Oriented Programming I",
      }),
      aCourseIndexEntry({
        code: "PSYC100",
        title: "Introduction to Psychology",
      }),
      aCourseIndexEntry({ code: "CHEM131", title: "Chemistry I" }),
    ]),
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("paste", () => {
  it("says where to copy from, and that the transcript stays in the browser", () => {
    renderPanel();
    expect(screen.getByText(/open Unofficial Transcript/)).toBeInTheDocument();
    expect(
      screen.getByText(
        "Your transcript is read here, in your browser, and never saved or sent. Only the courses you import are saved.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText("Paste your unofficial transcript"),
    ).toHaveFocus();
  });

  it("says so when the paste isn't a transcript, and where to copy it from", async () => {
    const { paste: type } = renderPanel();
    await type("Dear Sam, your advising appointment is on Tuesday.");
    expect(
      screen.getByText(
        "That doesn't look like a UMD unofficial transcript. Copy the whole page from Testudo's Unofficial Transcript.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Import/ })).toBeNull();
  });

  it("keeps the paste out of spell checkers and analytics", () => {
    renderPanel();
    const box = screen.getByLabelText("Paste your unofficial transcript");
    expect(box).toHaveAttribute("spellcheck", "false");
    expect(box).toHaveAttribute("data-private");
  });

  it("counts a paste for analytics with numbers only, once it settles", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { paste: type } = renderPanel();
    await type(paste("synthetic-in-progress"));
    await act(() => vi.advanceTimersByTimeAsync(2000));
    expect(track).toHaveBeenCalledTimes(1);
    const [event, props] = vi.mocked(track).mock.calls[0] ?? [];
    expect(event).toBe("transcript_parsed");
    const parsed = parseTranscript(paste("synthetic-in-progress"));
    expect(props).toEqual({
      recognized: true,
      lines: parsed.lines.length,
      choices: pendingChoices(
        transcriptRows(parsed).rows,
        EMPTY_TRANSCRIPT_CHECKS,
      ),
      skipped: 5,
    });
  });
});

describe("check", () => {
  it("shows what was read by semester, with the catalog title and the transcript's", async () => {
    const { paste: type } = renderPanel();
    await type(paste("synthetic-ap-transfer"));
    const fall = screen.getByRole("region", { name: "Fall 2024" });
    expect(within(fall).getByText("CMSC131")).toBeInTheDocument();
    // The catalog's title, once the course list has loaded.
    expect(
      await within(fall).findByText("Object-Oriented Programming I"),
    ).toBeInTheDocument();
    expect(
      within(fall).getByText("Object-Oriented Prog I"),
    ).toBeInTheDocument();
    for (const term of [
      "Before UMD",
      "Winter 2025",
      "Spring 2025",
      "Summer 2025",
    ])
      expect(screen.getByRole("region", { name: term })).toBeInTheDocument();
  });

  it("flags a code Testudo doesn't have", async () => {
    const { paste: type } = renderPanel();
    await type(paste("synthetic-ap-transfer"));
    const fall = screen.getByRole("region", { name: "Fall 2024" });
    // CMSC100 isn't in the search file above; CMSC131 is.
    await waitFor(() =>
      expect(
        within(fall).getAllByText(/Not in Testudo's catalog/),
      ).toHaveLength(4),
    );
  });

  it("waits for each 'or' to be chosen before importing", async () => {
    const { paste: type, user } = renderPanel();
    await type(paste("synthetic-ap-transfer"));
    const button = screen.getByRole("button", { name: "Import 21 courses" });
    expect(button).toBeDisabled();
    expect(
      screen.getByText(/Pick a GenEd for 2 courses where Testudo says "or"/),
    ).toBeInTheDocument();
    const psyc = screen.getByRole("radiogroup", { name: /PSYC100/ });
    await user.click(within(psyc).getByRole("radio", { name: "DSNS" }));
    const aasp = screen.getByRole("radiogroup", { name: /AASP100/ });
    await user.click(within(aasp).getByRole("radio", { name: "DSHU" }));
    expect(button).toBeEnabled();
  });

  it("leaves a line out, and ticks a skipped one back in", async () => {
    const { paste: type, user } = renderPanel();
    await type(paste("synthetic-in-progress"));
    const before = screen.getByRole("button", { name: /^Import \d+ courses/ });
    const count = Number(before.textContent?.match(/\d+/)?.[0]);
    await user.click(screen.getByRole("checkbox", { name: "Import BMGT110" }));
    expect(
      screen.getByText("Imported anyway, without a grade."),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: "Import CMSC216" }));
    expect(
      screen.getByRole("button", { name: `Import ${count} courses` }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText("Withdrawn (W), so it's left out."),
    ).toHaveLength(2);
  });

  it("says what transfer credit counts as, or keeps it as credit", async () => {
    const { paste: type, user } = renderPanel();
    await type(paste("synthetic-ap-transfer"));
    const field = screen.getByLabelText(/Testudo lists it as CHEM1XX/);
    expect(
      screen.getByText("It imports as 4 cr of AP credit."),
    ).toBeInTheDocument();
    await user.type(field, "chem 1");
    expect(
      screen.getByText("Type a course code, like CHEM131."),
    ).toBeInTheDocument();
    await user.type(field, "31");
    expect(
      await screen.findByText("Counts as CHEM131, Chemistry I."),
    ).toBeInTheDocument();
  });

  it("hides grades when they won't be kept", async () => {
    const { paste: type, user } = renderPanel();
    await type(paste("synthetic-ap-transfer"));
    const fall = screen.getByRole("region", { name: "Fall 2024" });
    expect(within(fall).getByText("A-")).toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: "Keep grades" }));
    expect(within(fall).queryByText("A-")).toBeNull();
    expect(
      screen.getByText(
        /Grades stay in your four-year plan. If you're signed in, they sync/,
      ),
    ).toBeInTheDocument();
  });
});

describe("import", () => {
  async function checked(options: { keepGrades?: boolean } = {}) {
    const panel = renderPanel();
    await panel.paste(paste("synthetic-ap-transfer"));
    for (const [course, code] of [
      ["PSYC100", "DSNS"],
      ["AASP100", "DSHU"],
    ] as const)
      await panel.user.click(
        within(
          screen.getByRole("radiogroup", { name: new RegExp(course) }),
        ).getByRole("radio", { name: code }),
      );
    if (options.keepGrades === false)
      await panel.user.click(
        screen.getByRole("checkbox", { name: "Keep grades" }),
      );
    return panel;
  }

  it("imports in one undoable step, then forgets the paste", async () => {
    const { user, go } = await checked();
    const before = useFourYear.getState().history;
    await user.click(screen.getByRole("button", { name: "Import 21 courses" }));
    await waitFor(() => expect(openDoc().entries).toHaveLength(21));
    const { history, notice } = useFourYear.getState();
    expect(history.past).toEqual([before.present]);
    expect(canUndo(history)).toBe(true);
    expect(notice?.label).toBe(
      "Imported 21 courses from 4 semesters and Before UMD",
    );
    expect(Object.keys(openDoc().grades)).toHaveLength(18);
    expect(openDoc().firstTermId).toBe("202408");
    expect(useTranscriptImport.getState().text).toBe("");
    // A phone opens its strip on the latest semester that came in.
    expect(go).toHaveBeenCalledWith({ tab: undefined, semester: "202505" });

    useFourYear.getState().undo();
    expect(openDoc().entries).toHaveLength(0);
    useFourYear.getState().redo();
    expect(openDoc().entries).toHaveLength(21);
  });

  it("stops if another plan opens while the course list loads", async () => {
    // The course list answers only when let go.
    const index = courseIndexSource([
      aCourseIndexEntry({ code: "CHEM131", title: "Chemistry I" }),
    ]);
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    connectPublished({
      ...index,
      readJson: async (key, options) => {
        if (key.startsWith("courses/search.")) await gate;
        return index.readJson(key, options);
      },
    });
    const { user } = await checked();
    const first = openDoc();
    await user.click(screen.getByRole("button", { name: "Import 21 courses" }));
    // Meanwhile, another plan opens.
    const other = aFourYear({ id: "fouryear_other", name: "Other plan" });
    act(() =>
      useFourYear.setState((s) => ({
        activeId: other.id,
        history: {
          ...s.history,
          present: { docs: [...s.history.present.docs, other] },
        },
      })),
    );
    await act(async () => release());
    await waitFor(() =>
      expect(useTranscriptImport.getState().busy).toBe(false),
    );
    const docs = useFourYear.getState().history.present.docs;
    expect(docs.find((d) => d.id === first.id)?.entries).toHaveLength(0);
    expect(docs.find((d) => d.id === other.id)?.entries).toHaveLength(0);
  });

  it("says it couldn't reach the server when offline, and imports nothing", async () => {
    const { user } = await checked();
    // Offline from here, with nothing of these departments saved: the
    // real retry policy, so nothing waits for the connection.
    const index = courseIndexSource([]);
    connectPublished({
      ...index,
      readJson: async (key) => {
        throw new DataError(key, "network", "offline");
      },
    });
    onlineManager.setOnline(false);
    try {
      await user.click(
        screen.getByRole("button", { name: "Import 21 courses" }),
      );
      expect(
        await screen.findByText(
          "We couldn't reach terpsicle.com to look up these courses. Check your connection and try again.",
        ),
      ).toBeInTheDocument();
      expect(useTranscriptImport.getState().busy).toBe(false);
      expect(openDoc().entries).toHaveLength(0);
    } finally {
      onlineManager.setOnline(true);
    }
  });

  it("sends analytics a count and a boolean, never what was imported", async () => {
    const { user } = await checked({ keepGrades: false });
    vi.mocked(track).mockClear();
    await user.click(screen.getByRole("button", { name: "Import 21 courses" }));
    await waitFor(() =>
      expect(track).toHaveBeenCalledWith("transcript_imported", {
        lines: 21,
        keptGrades: false,
      }),
    );
    expect(openDoc().grades).toEqual({});
  });

  it("keeps planned semesters and the courses people added themselves", async () => {
    const planned = aFourYearEntry({
      id: "entry_planned_1",
      term: "202701",
      code: "CMSC351",
    });
    const typed = aFourYearEntry({
      id: "entry_typed_01",
      term: "202408",
      code: "CMSC216",
    });
    renderPanel({ entries: [typed, planned] });
    expect(screen.queryByText(/This replaces your done/)).toBeNull();
    const panel = { user: userEvent.setup() };
    await panel.user.click(
      screen.getByLabelText("Paste your unofficial transcript"),
    );
    await panel.user.paste(paste("synthetic-four-semesters"));
    expect(
      screen.getByText(/This replaces your done and in-progress semesters/),
    ).toBeInTheDocument();
    for (const [course, code] of [
      ["PSYC100", "DSHS"],
      ["GEOL100", "DSNS"],
      ["HIST200", "DSHU"],
    ] as const)
      await panel.user.click(
        within(
          screen.getByRole("radiogroup", { name: new RegExp(course) }),
        ).getByRole("radio", { name: code }),
      );
    await panel.user.click(
      screen.getByRole("button", { name: "Import 24 courses" }),
    );
    await waitFor(() => expect(openDoc().entries).toHaveLength(26));
    expect(openDoc().entries.map((e) => e.id)).toEqual(
      expect.arrayContaining(["entry_planned_1", "entry_typed_01"]),
    );
  });

  it("removes every grade afterwards in one step, with undo", async () => {
    const { user } = await checked();
    await user.click(screen.getByRole("button", { name: "Import 21 courses" }));
    await waitFor(() => expect(Object.keys(openDoc().grades)).toHaveLength(18));
    removeGrades(openDoc());
    expect(openDoc().grades).toEqual({});
    expect(useFourYear.getState().notice?.label).toBe(
      "Removed the grades from My plan",
    );
    useFourYear.getState().undo();
    expect(Object.keys(openDoc().grades)).toHaveLength(18);
  });
});

describe("the first visit's import card", () => {
  it("opens a plan on the Import tab", async () => {
    useFourYear.setState({ ...INITIAL_FOUR_YEAR_STORE, phase: "ready" });
    const go = vi.fn();
    render(
      <TooltipProvider>
        <PlanFirstVisit today={TODAY} nav={nav(go)} />
      </TooltipProvider>,
    );
    expect(screen.queryByText("Coming next")).toBeNull();
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Import your transcript" }));
    expect(useFourYear.getState().history.present.docs).toHaveLength(1);
    expect(go).toHaveBeenCalledWith({ tab: "import" });
    expect(track).toHaveBeenCalledWith("four_year_created", {
      source: "import",
    });
  });
});
