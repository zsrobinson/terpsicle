// The maps on the page, for feedback screenshots (src/features/feedback/
// screenshot.ts). A WebGL canvas reads back blank outside its own frame, so
// the screenshot asks each map for one more frame and copies it then.
// Structural, so this module doesn't load MapLibre.

export interface SnapshotMap {
  getCanvas(): HTMLCanvasElement;
  once(type: "render", listener: () => void): unknown;
  triggerRepaint(): void;
}

const maps = new Set<SnapshotMap>();

/** Lists `map` until the returned function is called (with `map.remove()`). */
export function registerScreenshotMap(map: SnapshotMap): () => void {
  maps.add(map);
  return () => {
    maps.delete(map);
  };
}

export function screenshotMaps(): readonly SnapshotMap[] {
  return [...maps];
}
