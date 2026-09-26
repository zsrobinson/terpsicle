import { describe, expect, it } from "vitest";
import {
  ModerationConfigOverridesSchema,
  ModerationDecisionRowSchema,
  ModerationQueueRowSchema,
} from "./moderation";

const ROW = {
  id: "AAAAAAAAAAAAAAAAAAAAAA",
  kind: "chat",
  target_id: "msg-1",
  decision: "hold",
  actor: "auto",
  reasons: JSON.stringify([
    { code: "phone", source: "rules", action: "hold", span: [4, 16] },
  ]),
  models: JSON.stringify({ guard: "@cf/meta/llama-guard-3-8b", policy: null }),
  scores: "{}",
  created_at: "2026-10-01T12:00:00.000Z",
};

describe("moderation rows", () => {
  it("parses JSON columns into typed values", () => {
    const row = ModerationDecisionRowSchema.parse(ROW);
    expect(row.reasons[0]?.span).toEqual([4, 16]);
    expect(row.models.policy).toBeNull();
  });

  it("rejects JSON columns that don't parse or don't match", () => {
    expect(
      ModerationDecisionRowSchema.safeParse({ ...ROW, reasons: "not json" })
        .success,
    ).toBe(false);
    expect(
      ModerationDecisionRowSchema.safeParse({
        ...ROW,
        reasons: JSON.stringify([{ code: "nope" }]),
      }).success,
    ).toBe(false);
  });

  it("reads the queue's urgent flag as a boolean", () => {
    const row = ModerationQueueRowSchema.parse({
      id: ROW.id,
      kind: "review",
      target_id: "review-1",
      course: "CMSC351",
      text: "held text",
      reasons: "[]",
      scores: JSON.stringify({ spam: 0.2 }),
      urgent: 1,
      status: "pending",
      created_at: ROW.created_at,
      resolved_at: null,
      resolution_reason: null,
      resolution_note: null,
    });
    expect(row.urgent).toBe(true);
    expect(row.scores).toEqual({ spam: 0.2 });
  });
});

describe("MODERATION_CONFIG overrides", () => {
  it("accepts partial overrides and rejects unknown keys", () => {
    expect(
      ModerationConfigOverridesSchema.parse({
        policyModels: { chat: "@cf/meta/llama-3.1-8b-instruct-fp8-fast" },
        guardActions: { S5: "hold" },
      }),
    ).toEqual({
      policyModels: { chat: "@cf/meta/llama-3.1-8b-instruct-fp8-fast" },
      guardActions: { S5: "hold" },
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
