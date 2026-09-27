import { afterEach, describe, expect, it } from "vitest";
import { MeInputSchema, MeResultSchema } from "~/core/schema";
import { type ApiFailure, call, onApiFailure } from "~/server/fns/api";

// The typed client tells the feedback activity log about failed calls
// (src/app/activity-log-boot.tsx): the route and status, never a body.

afterEach(() => onApiFailure(null));

function heard(): ApiFailure[] {
  const failures: ApiFailure[] = [];
  onApiFailure((failure) => failures.push(failure));
  return failures;
}

const answer = (status: number, body: unknown) => async () =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

describe("onApiFailure", () => {
  it("hears a refused call's route and status only", async () => {
    const failures = heard();
    await expect(
      call(
        "me",
        MeInputSchema,
        MeResultSchema,
        {},
        {
          fetcher: answer(429, { error: "rate-limited", retryAfterSeconds: 9 }),
        },
      ),
    ).rejects.toThrow();
    expect(failures).toEqual([{ route: "/api/me", status: 429 }]);
  });

  it("hears a network failure as status 0, but not an abort", async () => {
    const failures = heard();
    const offline = async () => {
      throw new TypeError("Failed to fetch");
    };
    await expect(
      call("me", MeInputSchema, MeResultSchema, {}, { fetcher: offline }),
    ).rejects.toThrow();
    const aborted = new AbortController();
    aborted.abort();
    await expect(
      call(
        "me",
        MeInputSchema,
        MeResultSchema,
        {},
        {
          fetcher: offline,
          signal: aborted.signal,
        },
      ),
    ).rejects.toThrow();
    expect(failures).toEqual([{ route: "/api/me", status: 0 }]);
  });

  it("hears nothing from a call that worked", async () => {
    const failures = heard();
    await call(
      "me",
      MeInputSchema,
      MeResultSchema,
      {},
      {
        fetcher: answer(200, {
          status: "signed-out",
          flags: {
            signIn: false,
            chat: "off",
            reviews: "off",
            seatAlerts: false,
            push: false,
            todo: false,
            plan: false,
            authTestMode: false,
          },
        }),
      },
    ).catch(() => {});
    expect(failures).toEqual([]);
  });
});
