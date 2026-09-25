import { z } from "zod";

// Client configuration from the Vite env files in env/ (.env, .env.mock,
// .env.development). `VITE_DATA_SOURCE` is the one switch between fixtures and
// live data (BUILD.md §6 M6).
// TODO(schema): move this schema into src/core/schema once it exists.
const clientEnvSchema = z.object({
  MODE: z.string(),
  VITE_DATA_SOURCE: z.enum(["mock", "live"]).default("live"),
  VITE_DATA_BASE_URL: z.string().min(1).default("/data"),
  VITE_POSTHOG_TOKEN: z.string().min(1).optional(),
});

export type DataSource = "mock" | "live";

export interface ClientConfig {
  /** Vite mode: "development", "mock", "production" or "test". */
  mode: string;
  dataSource: DataSource;
  /** Where published data lives: `/data` in production. */
  dataBaseUrl: string;
  posthogToken: string | undefined;
}

export function parseClientConfig(env: unknown): ClientConfig {
  const result = clientEnvSchema.safeParse(env);
  if (!result.success) {
    throw new Error(
      `Invalid client env (check .env files):\n${z.prettifyError(result.error)}`,
    );
  }
  const parsed = result.data;
  return {
    mode: parsed.MODE,
    dataSource: parsed.VITE_DATA_SOURCE,
    dataBaseUrl: parsed.VITE_DATA_BASE_URL,
    posthogToken: parsed.VITE_POSTHOG_TOKEN,
  };
}

export const clientConfig: ClientConfig = parseClientConfig(import.meta.env);
