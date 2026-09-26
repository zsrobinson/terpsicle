import { describe, expect, it } from "vitest";
import {
  ModerationConfigOverridesSchema,
  ModerationDecisionRowSchema,
  ModerationQueueRowSchema,
} from "./moderation";

const ROW = {
  id: "AAAAAAAAAAAAAAAAAAAAAA",
  surface: "chat",
  ref: "202701:CMSC351:m-1",
  stage: "model",
  verdict: "hold",
  labels: JSON.stringify([
    { code: "phone", source: "rules", action: "hold", span: [4, 16] },
  ]),
  guard: JSON.stringify({ safe: true, categories: [] }),
  policy: null,
  models: JSON.stringify({ guard: "@cf/meta/llama-guard-3-8b", policy: null }),
  latency_ms: 420,
  decided_by: "system",
  reason: null,
  created_at: "2026-10-01T12:00:00.000Z",
};

describe("moderation rows", () => {
  it("parses JSON columns into typed values, and allows null ones", () => {
    const row = ModerationDecisionRowSchema.parse(ROW);
    expect(row.labels[0]?.span).toEqual([4, 16]);
    expect(row.guard).toEqual({ safe: true, categories: [] });
    expect(row.policy).toBeNull();
    expect(row.models?.policy).toBeNull();
  });

  it("rejects JSON columns that don't parse or don't match", () => {
    expect(
      ModerationDecisionRowSchema.safeParse({ ...ROW, labels: "not json" })
        .success,
    ).toBe(false);
    expect(
      ModerationDecisionRowSchema.safeParse({
        ...ROW,
        labels: JSON.stringify([{ code: "nope" }]),
      }).success,
    ).toBe(false);
    expect(
      ModerationDecisionRowSchema.safeParse({ ...ROW, verdict: "publish" })
        .success,
    ).toBe(false);
  });

  it("reads the queue's snapshot, including a blanked one", () => {
    const base = {
      id: ROW.id,
      surface: "review",
      ref: "review-1",
      labels: "[]",
      urgent: 1,
      status: "open",
      created_at: ROW.created_at,
      closed_at: null,
    };
    const row = ModerationQueueRowSchema.parse({
      ...base,
      snapshot: JSON.stringify({
        text: "held text",
        course: "CMSC351",
        activeAssignments: false,
        scores: { spam: 0.2 },
        retries: 0,
      }),
    });
    expect(row.urgent).toBe(true);
    expect(row.snapshot?.scores).toEqual({ spam: 0.2 });
    expect(
      ModerationQueueRowSchema.parse({ ...base, snapshot: null }).snapshot,
    ).toBeNull();
  });
});

describe("MODERATION_CONFIG overrides", () => {
  it("accepts partial overrides and rejects unknown keys", () => {
    expect(
      ModerationConfigOverridesSchema.parse({
        policyModels: { chat: "@cf/meta/llama-3.1-8b-instruct-fp8-fast" },
        guardActions: { S5: "hold" },
        chatPolicy: "flagged",
      }),
    ).toEqual({
      policyModels: { chat: "@cf/meta/llama-3.1-8b-instruct-fp8-fast" },
      guardActions: { S5: "hold" },
      chatPolicy: "flagged",
    });
    expect(
      ModerationConfigOverridesSchema.safeParse({ threshold: 0.5 }).success,
    ).toBe(false);
    expect(
      ModerationConfigOverridesSchema.safeParse({ guardModel: "gpt-4" })
        .success,
    ).toBe(false);
  });
});
