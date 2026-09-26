// Puts the mock bucket (src/fixtures/mock/data-source.ts) into local R2, so
// the Worker in `pnpm dev:mock` reads the same catalog the app does: Chat's
// CourseChat objects derive their rooms from it (V2.md §8.1). The app itself
// reads the fixtures from memory in mock mode. Run by `pnpm dev:mock`, after
// the local D1 migrations; wrangler's default local state, which the Vite
// plugin uses too.
import { getPlatformProxy } from "wrangler";
import { buildMockDataFiles } from "~/fixtures";
import { isMain } from "./lib/source-files";

export async function seedMockData(): Promise<number> {
  const files = await buildMockDataFiles();
  const proxy = await getPlatformProxy<{
    DATA: { put(key: string, value: Uint8Array): Promise<unknown> };
  }>({
    configPath: "wrangler.jsonc",
    persist: true,
    // Offline: Workers AI is a remote binding, and nothing here needs it.
    remoteBindings: false,
  });
  try {
    await Promise.all(
      [...files].map(([key, bytes]) => proxy.env.DATA.put(key, bytes)),
    );
  } finally {
    await proxy.dispose();
  }
  return files.size;
}

if (isMain(import.meta.url)) {
  const count = await seedMockData();
  console.log(`seed-mock-data: ${count} files in local R2`);
}
