import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  fakeSeatWatchesClient,
  resetSeatWatches,
  seatAlertsAccount,
} from "~/features/alerts/testing";
import { SeatBell } from "~/features/course-details/seat-bell";
import { aMeUser, aSeatWatch, fixtureTermId } from "~/fixtures";
import { createTestQueryClient } from "~/state/query/testing";
import { TooltipProvider } from "~/ui/tooltip";
import { WithSeatWatches } from "./seat-watches";

vi.mock("~/lib/analytics", () => ({ track: vi.fn() }));

beforeEach(() => {
  resetSeatWatches();
});

/** What Home's Schedule part gets: the term's watched sections, or "none yet". */
function HomeWatches({ termId = fixtureTermId }: { termId?: string }) {
  return (
    <WithSeatWatches termId={termId}>
      {(watches): ReactNode => (
        <output data-testid="home-watches">
          {watches === null
            ? "loading"
            : watches.map((w) => w.sectionKey).join(",") || "none"}
        </output>
      )}
    </WithSeatWatches>
  );
}

function renderHomeAndBell() {
  const client = createTestQueryClient();
  render(
    <QueryClientProvider client={client}>
      <TooltipProvider delayDuration={0}>
        <SeatBell termId={fixtureTermId} sectionKey="CMSC351-0101" />
        <HomeWatches />
      </TooltipProvider>
    </QueryClientProvider>,
  );
  return { user: userEvent.setup() };
}

const homeSays = () => screen.getByTestId("home-watches");

describe("Home's seat watches", () => {
  it("are the term's, from the same list Schedule's bells change: a watch shows on Home at once", async () => {
    const api = fakeSeatWatchesClient([
      aSeatWatch({ termId: "202608", sectionKey: "ENGL393-0101" }),
    ]);
    // The server is slow to answer: Home has it before then.
    api.watch.mockImplementationOnce(() => new Promise(() => {}));
    seatAlertsAccount(aMeUser());
    const { user } = renderHomeAndBell();
    // Another term's watch isn't this term's.
    await waitFor(() => expect(homeSays()).toHaveTextContent("none"));

    await user.click(
      screen.getByRole("button", { name: /^Watch for a seat.*0101$/ }),
    );
    expect(homeSays()).toHaveTextContent("CMSC351-0101");
    expect(api.list).toHaveBeenCalledOnce();
  });

  it("aren't asked for while signed out", () => {
    const api = fakeSeatWatchesClient([aSeatWatch()]);
    seatAlertsAccount(null);
    renderHomeAndBell();
    expect(homeSays()).toHaveTextContent("loading");
    expect(api.list).not.toHaveBeenCalled();
  });
});
