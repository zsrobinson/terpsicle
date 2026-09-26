// Playwright's WebKit (or Chromium) with a phone's viewport, touch and user
// agent. Cheap and runs on every PR, but nothing here is the real thing:
// there's no on-screen keyboard or browser toolbar, and WebKit can't be sent
// a touch drag, so drags are mouse drags (vaul follows either).

import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import {
  type Browser,
  type BrowserContext,
  type CDPSession,
  chromium,
  devices,
  type Page,
  webkit,
} from "@playwright/test";
import type { Device, Point, SwipeIntent } from "../device";

const PHONE = "iPhone 15";

export async function playwrightDevice(
  engine: "webkit" | "chromium",
): Promise<Device> {
  const browser = await (engine === "webkit" ? webkit : chromium).launch({
    ...(engine === "chromium"
      ? { executablePath: localChromium(), args: [] }
      : {}),
    ...(process.env.HTTPS_PROXY
      ? { proxy: { server: process.env.HTTPS_PROXY } }
      : {}),
  });
  return new PlaywrightDevice(engine, browser);
}

class PlaywrightDevice implements Device {
  readonly real = false;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private cdp: CDPSession | null = null;
  private landscape = false;

  constructor(
    readonly engine: "webkit" | "chromium",
    private readonly browser: Browser,
  ) {}

  async describe(): Promise<string> {
    return `Playwright ${this.engine} ${this.browser.version()}, ${PHONE} viewport (emulated touch, no keyboard)`;
  }

  private get p(): Page {
    if (!this.page) throw new Error("no scenario running");
    return this.page;
  }

  async begin(url: string, video: string | null): Promise<void> {
    const phone = devices[PHONE];
    const size = this.landscape
      ? { width: phone.viewport.height, height: phone.viewport.width }
      : phone.viewport;
    // Chromium can't take WebKit's descriptor as is (it has no `isMobile`
    // quirks for Safari), but the viewport, touch and scale factor carry.
    this.context = await this.browser.newContext({
      ...phone,
      viewport: size,
      ...(video ? { recordVideo: { dir: path.dirname(video), size } } : {}),
    });
    this.page = await this.context.newPage();
    if (this.engine === "chromium")
      this.cdp = await this.context.newCDPSession(this.page);
    await this.page.goto(url);
  }

  async end(): Promise<string | null> {
    const video = this.page?.video();
    await this.context?.close();
    this.context = null;
    this.page = null;
    this.cdp = null;
    return video ? await video.path() : null;
  }

  evaluate<T>(expression: string): Promise<T> {
    return this.p.evaluate(expression) as Promise<T>;
  }

  async navigate(url: string): Promise<void> {
    await this.p.goto(url);
  }

  async tap(at: Point): Promise<void> {
    await this.p.touchscreen.tap(at.x, at.y);
  }

  async swipe(
    from: Point,
    to: Point,
    ms: number,
    intent: SwipeIntent,
  ): Promise<void> {
    const steps = Math.max(8, Math.round(ms / 16));
    const at = (i: number) => ({
      x: from.x + ((to.x - from.x) * i) / steps,
      y: from.y + ((to.y - from.y) * i) / steps,
    });
    if (this.cdp) {
      // Chromium: real touch input, so scrolling and pointer cancels behave
      // as on a phone (e2e/drawer-gestures.spec.ts does the same).
      const cdp = this.cdp;
      const send = (
        type: "touchStart" | "touchMove" | "touchEnd",
        points: Point[],
      ) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: points });
      await send("touchStart", [from]);
      for (let i = 1; i <= steps; i++) {
        await send("touchMove", [at(i)]);
        await this.p.waitForTimeout(ms / steps);
      }
      await send("touchEnd", []);
      return;
    }
    // WebKit takes no touch drags from Playwright, and mobile WebKit no
    // wheel. A scroll scrolls whatever scrolls under the point (a mouse drag
    // on the calendar would draw a block); a drag is a mouse drag.
    if (intent === "scroll") {
      await this.p.evaluate(
        `(() => {
          let el = document.elementFromPoint(${from.x}, ${from.y});
          while (el && !(el.scrollHeight > el.clientHeight && /auto|scroll/.test(getComputedStyle(el).overflowY))) el = el.parentElement;
          if (el) el.scrollBy({ top: ${from.y - to.y} });
        })()`,
      );
      return;
    }
    await this.p.mouse.move(from.x, from.y);
    await this.p.mouse.down();
    for (let i = 1; i <= steps; i++) {
      await this.p.mouse.move(at(i).x, at(i).y);
      await this.p.waitForTimeout(ms / steps);
    }
    await this.p.mouse.up();
  }

  async type(text: string): Promise<void> {
    await this.p.keyboard.type(text, { delay: 60 });
  }

  async keyboardShown(): Promise<boolean | null> {
    return null;
  }

  async hideKeyboard(): Promise<void> {
    // No keyboard to put away; leaving the field is the closest thing.
    await this.p.evaluate(
      "document.activeElement instanceof HTMLElement && document.activeElement.blur()",
    );
  }

  async rotate(orientation: "portrait" | "landscape"): Promise<void> {
    this.landscape = orientation === "landscape";
    const { width, height } = devices[PHONE].viewport;
    await this.p.setViewportSize(
      this.landscape ? { width: height, height: width } : { width, height },
    );
  }

  async screenshot(): Promise<Buffer> {
    return this.p.screenshot();
  }

  async close(): Promise<void> {
    await this.end();
    await this.browser.close();
  }
}

/**
 * Agent sandboxes ship an older Chromium under PLAYWRIGHT_BROWSERS_PATH that
 * must not be reinstalled (playwright.config.ts does the same).
 */
function localChromium(): string | undefined {
  if (existsSync(chromium.executablePath())) return undefined;
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!root || !existsSync(root)) return undefined;
  const newest = readdirSync(root)
    .filter((name) => /^chromium-\d+$/.test(name))
    .sort((a, b) => Number(b.split("-")[1]) - Number(a.split("-")[1]))[0];
  return newest ? path.join(root, newest, "chrome-linux", "chrome") : undefined;
}
