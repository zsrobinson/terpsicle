// What a scenario can do to a phone. Each engine implements it: Playwright
// (WebKit or Chromium with a phone's viewport and touch), Chrome on an
// Android emulator over adb, and Safari in the iOS Simulator over Appium.

export type Engine = "webkit" | "chromium" | "android" | "ios";

export type SwipeIntent = "drag" | "scroll";

export interface Point {
  x: number;
  y: number;
}

/** The visual viewport, in the layout viewport's CSS pixels. */
export interface Viewport {
  offsetTop: number;
  offsetLeft: number;
  scale: number;
}

export interface Device {
  readonly engine: Engine;
  /** A human name for the report: model, OS and browser versions. */
  describe(): Promise<string>;
  /**
   * Whether touches, the keyboard and the browser's toolbars are the real
   * ones (adb, XCUITest) rather than synthesized events.
   */
  readonly real: boolean;
  /** Starts a scenario (a fresh recording) and loads `url`. */
  begin(url: string, video: string | null): Promise<void>;
  /** Ends the scenario; returns the recording's path if one was made. */
  end(): Promise<string | null>;
  /** Evaluates a JavaScript expression in the page; JSON in and out. */
  evaluate<T>(expression: string): Promise<T>;
  /** Reloads nothing: navigates the current tab to `url`. */
  navigate(url: string): Promise<void>;
  /** A tap at a point in the visual viewport, in CSS pixels. */
  tap(at: Point): Promise<void>;
  /**
   * One finger from `from` to `to` over `ms`, in visual-viewport CSS px.
   * `intent` only matters where there's no real finger: a "scroll" is sent
   * as a wheel, a "drag" as a pointer drag.
   */
  swipe(from: Point, to: Point, ms: number, intent: SwipeIntent): Promise<void>;
  /** Types into whatever has focus, through the keyboard. */
  type(text: string): Promise<void>;
  /** Whether the on-screen keyboard is up (null: can't tell). */
  keyboardShown(): Promise<boolean | null>;
  /** Puts the keyboard away the way a person would, if it's up. */
  hideKeyboard(): Promise<void>;
  rotate(orientation: "portrait" | "landscape"): Promise<void>;
  /** The whole screen: browser chrome, keyboard and all where possible. */
  screenshot(): Promise<Buffer>;
  close(): Promise<void>;
  /**
   * What the host saw of a crashed page process since the last call (kernel
   * lines: a segfault, an OOM kill), if the engine runs on this machine.
   */
  crashEvidence?(): Promise<string | null>;
}

/**
 * Where a page's layout coordinates land on a real screen. `origin` is the
 * screen position of the visual viewport's top-left corner and `unit` the
 * screen units per CSS pixel (device pixels on Android, points on iOS).
 */
export interface ScreenMapping {
  origin: Point;
  unit: number;
}

/** A layout-viewport point (getBoundingClientRect) → visual-viewport CSS px. */
export function toVisual(at: Point, viewport: Viewport): Point {
  return {
    x: (at.x - viewport.offsetLeft) * viewport.scale,
    y: (at.y - viewport.offsetTop) * viewport.scale,
  };
}

/** A visual-viewport point in CSS px → screen units. */
export function toScreen(at: Point, mapping: ScreenMapping): Point {
  return {
    x: Math.round(mapping.origin.x + at.x * mapping.unit),
    y: Math.round(mapping.origin.y + at.y * mapping.unit),
  };
}

/**
 * The mapping from one calibration tap: the screen point we touched, and
 * where the page saw the touch (layout coordinates, with the visual viewport
 * at that moment).
 */
export function calibrate(
  screen: Point,
  seen: Point & Viewport,
  unit: number,
): ScreenMapping {
  const visual = toVisual(seen, seen);
  return {
    origin: { x: screen.x - visual.x * unit, y: screen.y - visual.y * unit },
    unit,
  };
}
