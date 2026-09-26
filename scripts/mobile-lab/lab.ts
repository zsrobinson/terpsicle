// A scenario's view of the phone: find things on the page, touch them, and
// record a step (screenshot + probe + checks) after each action.

import { spawnSync } from "node:child_process";
import { mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  type Check,
  type Probe,
  type StepContext,
  stepChecks,
  traceChecks,
} from "./checks";
import {
  type Device,
  type Point,
  type SwipeIntent,
  toVisual,
  type Viewport,
} from "./device";
import { call, FIND, INSTALL, PROBE } from "./page-scripts";

/** An element on the page: a CSS selector, optionally narrowed by label. */
export interface Target {
  selector: string;
  /** Matches aria-label, else text content (substring unless `exact`). */
  text?: string;
  exact?: boolean;
  index?: number;
  /** Only elements whose middle is on screen and not covered. */
  visible?: boolean;
}

export interface Action {
  t: number;
  type: string;
  detail: Record<string, unknown>;
}

export interface Step {
  index: number;
  name: string;
  /** Milliseconds since the scenario started. */
  t: number;
  screenshot: string | null;
  keyboard: boolean | null;
  actions: Action[];
  checks: Check[];
  probe: Probe | null;
  error?: string;
}

export interface StepOptions {
  /** The drawer should be at rest: check it sits at its snap. */
  settled?: boolean;
  /** Extra checks for this step. */
  expect?: (probe: Probe) => Check[];
  /** Skip the screenshot (bursts that only need the probe). */
  noScreenshot?: boolean;
}

export class Lab {
  readonly steps: Step[] = [];
  private actions: Action[] = [];
  private timeOrigin = 0;
  private readonly started = Date.now();

  constructor(
    readonly device: Device,
    readonly url: string,
    private readonly dir: string,
  ) {
    mkdirSync(dir, { recursive: true });
  }

  private log(type: string, detail: Record<string, unknown> = {}): void {
    this.actions.push({ t: Date.now() - this.started, type, detail });
  }

  /** Installs the recorder; the first install is the load we compare to. */
  async install(): Promise<void> {
    const { fresh, timeOrigin } = await this.device.evaluate<{
      fresh: boolean;
      timeOrigin: number;
    }>(INSTALL);
    if (!this.timeOrigin) this.timeOrigin = timeOrigin;
    else if (fresh) this.log("reinstalled after a reload", { timeOrigin });
  }

  /** Waits for the app shell and the drawer, then starts recording. */
  async ready(timeout = 30_000): Promise<void> {
    const ok = await this.waitFor(
      "!!document.querySelector('[data-vaul-drawer]') && !!document.querySelector('[data-calendar-scroll]')",
      timeout,
      "the app shell",
    );
    if (!ok) throw new Error("the app didn't load");
    await this.install();
  }

  async wait(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  /** Polls a page expression until it's truthy. */
  async waitFor(
    expression: string,
    timeout: number,
    what: string,
  ): Promise<boolean> {
    const until = Date.now() + timeout;
    while (Date.now() < until) {
      try {
        if (await this.device.evaluate<boolean>(`!!(${expression})`))
          return true;
      } catch {
        // Mid-navigation; try again.
      }
      await this.wait(200);
    }
    this.log("timeout", { waitingFor: what, ms: timeout });
    return false;
  }

  async find(target: Target): Promise<{
    rect: { x: number; y: number; width: number; height: number };
    viewport: Viewport;
  }> {
    const found = await this.device.evaluate<{
      found: boolean;
      count: number;
      rect?: { x: number; y: number; width: number; height: number };
      viewport: Viewport;
    }>(call(FIND, target));
    if (!found.found || !found.rect)
      throw new Error(`not on the page: ${describeTarget(target)}`);
    return { rect: found.rect, viewport: found.viewport };
  }

  async exists(target: Target): Promise<boolean> {
    const found = await this.device.evaluate<{ found: boolean }>(
      call(FIND, target),
    );
    return found.found;
  }

  /** The visual-viewport point `(fx, fy)` of the way across a target. */
  async pointIn(target: Target, fx = 0.5, fy = 0.5): Promise<Point> {
    const { rect, viewport } = await this.find(target);
    return toVisual(
      { x: rect.x + rect.width * fx, y: rect.y + rect.height * fy },
      viewport,
    );
  }

  async tap(target: Target | Point): Promise<void> {
    const at = isPoint(target) ? target : await this.pointIn(target);
    this.log("tap", {
      target: isPoint(target) ? null : describeTarget(target),
      at: rounded(at),
    });
    await this.device.tap(at);
  }

  /** A drag from a target (or point) by `dy` (and `dx`) CSS px. */
  async swipe(
    from: Target | Point,
    by: { dx?: number; dy: number },
    ms = 400,
    intent: SwipeIntent = "drag",
  ): Promise<void> {
    const start = isPoint(from) ? from : await this.pointIn(from);
    const end = { x: start.x + (by.dx ?? 0), y: start.y + by.dy };
    this.log("swipe", {
      from: isPoint(from) ? null : describeTarget(from),
      start: rounded(start),
      end: rounded(end),
      ms,
      intent,
    });
    await this.device.swipe(start, end, ms, intent);
  }

  async type(text: string): Promise<void> {
    this.log("type", { text });
    await this.device.type(text);
  }

  async hideKeyboard(): Promise<void> {
    this.log("hide keyboard");
    await this.device.hideKeyboard();
  }

  async rotate(orientation: "portrait" | "landscape"): Promise<void> {
    this.log("rotate", { orientation });
    await this.device.rotate(orientation);
  }

  async navigate(url: string): Promise<void> {
    this.log("navigate", { url });
    await this.device.navigate(url);
  }

  /** Records the page now: a screenshot, the probe and the checks. */
  async step(name: string, options: StepOptions = {}): Promise<Step> {
    const index = this.steps.length + 1;
    const step: Step = {
      index,
      name,
      t: Date.now() - this.started,
      screenshot: null,
      keyboard: null,
      actions: this.actions,
      checks: [],
      probe: null,
    };
    this.actions = [];
    this.steps.push(step);
    try {
      if (!options.noScreenshot)
        step.screenshot = saveImage(
          await this.device.screenshot(),
          path.join(
            this.dir,
            `${String(index).padStart(2, "0")}-${slug(name)}`,
          ),
        );
      step.keyboard = await this.device.keyboardShown();
      const probe = await this.device.evaluate<Probe | null>(PROBE);
      if (!probe || typeof probe.innerHeight !== "number")
        throw new Error(
          `the page didn't answer the probe: ${JSON.stringify(probe)?.slice(0, 200)}`,
        );
      step.probe = probe;
      const ctx: StepContext = {
        timeOrigin: this.timeOrigin,
        settled: options.settled ?? false,
      };
      step.checks = [
        ...stepChecks(probe, ctx),
        ...traceChecks(probe.frames),
        ...(options.expect?.(probe) ?? []),
      ];
      if (!probe.installed) await this.install();
    } catch (error) {
      step.error = error instanceof Error ? error.message : String(error);
    }
    return step;
  }

  /** Several steps right after an action, to catch motion mid-way. */
  async burst(name: string, delays: number[]): Promise<void> {
    let waited = 0;
    for (const delay of delays) {
      await this.wait(Math.max(0, delay - waited));
      waited = delay;
      await this.step(`${name} (+${delay} ms)`);
    }
  }

  /** A step for a scenario that threw, with whatever the screen shows. */
  async failure(error: unknown): Promise<void> {
    const step = await this.step("error");
    step.error = error instanceof Error ? error.message : String(error);
  }
}

/** A check a scenario adds to a step. */
export function expectation(
  id: string,
  ok: boolean,
  detail: string,
  severity: Check["severity"] = "fail",
): Check {
  return { id, ok, severity, detail };
}

function isPoint(t: Target | Point): t is Point {
  return "x" in t && "y" in t;
}

function describeTarget(t: Target): string {
  return t.text === undefined ? t.selector : `${t.selector} "${t.text}"`;
}

function rounded(p: Point): Point {
  return { x: Math.round(p.x), y: Math.round(p.y) };
}

export function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

const FFMPEG = process.env.MOBILE_LAB_FFMPEG ?? "ffmpeg";
let ffmpegWorks: boolean | null = null;

/**
 * Saves a PNG screenshot, as a JPEG at most 720px wide when ffmpeg is there
 * (a tenth of the size, so a run's pictures stay cheap to keep in git).
 * Returns the file's name.
 */
export function saveImage(png: Buffer, base: string): string {
  const pngPath = `${base}.png`;
  writeFileSync(pngPath, png);
  if (ffmpegWorks === false) return path.basename(pngPath);
  const jpgPath = `${base}.jpg`;
  const result = spawnSync(
    FFMPEG,
    [
      "-y",
      "-loglevel",
      "error",
      "-i",
      pngPath,
      "-vf",
      "scale='min(720,iw)':-2",
      "-q:v",
      "4",
      `${jpgPath}.tmp.jpg`,
    ],
    { stdio: "ignore" },
  );
  ffmpegWorks = result.status === 0;
  if (!ffmpegWorks) return path.basename(pngPath);
  renameSync(`${jpgPath}.tmp.jpg`, jpgPath);
  rmSync(pngPath);
  return path.basename(jpgPath);
}
