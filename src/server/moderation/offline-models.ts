// Stand-in models for `pnpm dev:mock` (and so e2e), which run offline where
// Workers AI can't answer: Guard says "safe" and the policy model scores
// every rule 0, so only the rules (precheck) hold or remove anything. Used
// only while MODERATION_OFFLINE is "true", which the Vite config sets in mock
// mode and nothing else does; with AUTH_TEST_MODE off it's ignored.
import type { AiRunner } from "./models";

export interface OfflineModelsEnv {
  AI: Ai;
  MODERATION_OFFLINE?: string;
  AUTH_TEST_MODE?: string;
}

export const offlineModels: AiRunner = {
  async run(_model, inputs) {
    const format = inputs.response_format as
      | { json_schema?: { required?: string[] } }
      | undefined;
    const keys = format?.json_schema?.required;
    // The policy model asks for JSON with one key per rule; Guard doesn't.
    return keys
      ? { response: Object.fromEntries(keys.map((k) => [k, 0])) }
      : { response: "safe" };
  },
};

/** The models moderation calls: Workers AI, or offline ones in mock mode. */
export function moderationModels(env: OfflineModelsEnv): AiRunner {
  return env.MODERATION_OFFLINE === "true" && env.AUTH_TEST_MODE === "true"
    ? offlineModels
    : env.AI;
}
