// Core tests read saved inputs as text (`./__fixtures__/paste.txt?raw`), which
// Vite serves in every Vitest project. The app and worker programs type any
// `?raw` import through vite/client; tsconfig.node.json doesn't load it, so
// these name the fixture kinds core tests use.
declare module "*.txt?raw" {
  const text: string;
  // biome-ignore lint/style/noDefaultExport: Vite's `?raw` modules have only a default export.
  export default text;
}

declare module "*.ics?raw" {
  const text: string;
  // biome-ignore lint/style/noDefaultExport: Vite's `?raw` modules have only a default export.
  export default text;
}
