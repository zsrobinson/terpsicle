// Safari in the iOS Simulator, driven through Appium's XCUITest driver: page
// scripts run over Safari's Web Inspector (Appium's web context), while taps,
// drags and typing are XCTest touches on the screen and keys on the software
// keyboard (the Simulator's hardware keyboard is disconnected), so Safari's
// own scrolling, rubber-banding, zoom-on-focus, keyboard and toolbars are
// what's under test. Talks WebDriver over HTTP; the Appium server comes
// from the workflow (APPIUM_URL, default http://127.0.0.1:4723).

import { type ChildProcess, execFile, spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import http from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import {
  calibrate,
  type Device,
  type Point,
  type ScreenMapping,
  toScreen,
} from "../device";
import { ARM_CALIBRATION, READ_CALIBRATION } from "../page-scripts";

const run = promisify(execFile);

interface WebDriverError {
  error: string;
  message: string;
}

/**
 * One WebDriver call. Plain `http`, not fetch: creating the first session
 * builds WebDriverAgent, which outlasts fetch's five-minute wait for headers.
 */
function request<T>(
  method: "GET" | "POST" | "DELETE",
  url: string,
  body?: unknown,
): Promise<{ value: T | WebDriverError }> {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const req = http.request(
      url,
      {
        method,
        headers: {
          "content-type": "application/json",
          ...(payload ? { "content-length": Buffer.byteLength(payload) } : {}),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
          } catch (error) {
            reject(error);
          }
        });
        res.on("error", reject);
      },
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function failure(value: unknown): WebDriverError | null {
  return value &&
    typeof value === "object" &&
    "error" in value &&
    typeof value.error === "string"
    ? (value as WebDriverError)
    : null;
}

class WebDriver {
  constructor(
    private readonly base: string,
    readonly id: string,
  ) {}

  static async start(
    base: string,
    capabilities: Record<string, unknown>,
  ): Promise<WebDriver> {
    const { value } = await request<{ sessionId?: string }>(
      "POST",
      `${base}/session`,
      { capabilities: { alwaysMatch: capabilities } },
    );
    const error = failure(value);
    if (error || !("sessionId" in value) || !value.sessionId)
      throw new Error(`Appium session failed: ${error?.message}`);
    return new WebDriver(base, value.sessionId);
  }

  async send<T>(
    method: "GET" | "POST" | "DELETE",
    path: string,
    body?: unknown,
  ): Promise<T> {
    const { value } = await request<T>(
      method,
      `${this.base}/session/${this.id}${path}`,
      body,
    );
    const error = failure(value);
    if (error)
      throw new Error(`${method} ${path}: ${error.error}: ${error.message}`);
    return value as T;
  }
}

export async function iosDevice(): Promise<Device> {
  const base = process.env.APPIUM_URL ?? "http://127.0.0.1:4723";
  const driver = await WebDriver.start(base, {
    platformName: "iOS",
    browserName: "Safari",
    "appium:automationName": "XCUITest",
    "appium:deviceName": process.env.IOS_DEVICE ?? "iPhone 16",
    ...(process.env.IOS_VERSION
      ? { "appium:platformVersion": process.env.IOS_VERSION }
      : {}),
    ...(process.env.IOS_UDID ? { "appium:udid": process.env.IOS_UDID } : {}),
    // The software keyboard, as on a phone.
    "appium:connectHardwareKeyboard": false,
    "appium:newCommandTimeout": 900,
    // The first session builds WebDriverAgent.
    "appium:wdaLaunchTimeout": 900_000,
    "appium:wdaConnectionTimeout": 900_000,
    "appium:webviewConnectTimeout": 60_000,
    "appium:safariInitialUrl": "about:blank",
    ...(process.env.WDA_PATH
      ? {
          "appium:usePreinstalledWDA": true,
          "appium:prebuiltWDAPath": process.env.WDA_PATH,
        }
      : {}),
  });
  const phone = new SimulatorSafari(driver);
  await phone.setUp();
  return phone;
}

class SimulatorSafari implements Device {
  readonly engine = "ios" as const;
  readonly real = true;
  private web = "";
  private context = "";
  private mapping: ScreenMapping | null = null;
  private recorder: ChildProcess | null = null;
  private video: string | null = null;
  private udid = "";

  constructor(private readonly driver: WebDriver) {}

  async setUp(): Promise<void> {
    this.web = await this.driver.send<string>("GET", "/context");
    this.context = this.web;
    const caps = await this.driver.send<Record<string, unknown>>("GET", "");
    this.udid = String(caps["appium:udid"] ?? caps.udid ?? "booted");
    await this.driver.send("POST", "/orientation", {
      orientation: "PORTRAIT",
    });
  }

  private async use(context: "native" | "web"): Promise<void> {
    if (context === "web") {
      // Safari's page shows up as a new web context after some navigations.
      const contexts = await this.driver.send<string[]>("GET", "/contexts");
      if (!contexts.includes(this.web))
        this.web =
          contexts.filter((c) => c !== "NATIVE_APP").at(-1) ?? this.web;
    }
    const name = context === "web" ? this.web : "NATIVE_APP";
    if (this.context === name) return;
    await this.driver.send("POST", "/context", { name });
    this.context = name;
  }

  async describe(): Promise<string> {
    const caps = await this.driver.send<Record<string, unknown>>("GET", "");
    const name = caps["appium:deviceName"] ?? caps.deviceName;
    const version = caps["appium:platformVersion"] ?? caps.platformVersion;
    return `${name} Simulator, iOS ${version}, Safari (XCUITest touches, software keyboard)`;
  }

  async begin(url: string, video: string | null): Promise<void> {
    this.mapping = null;
    if (video) await this.startRecording(`${video}.mp4`);
    await this.navigate(url);
  }

  private async startRecording(file: string): Promise<void> {
    this.recorder = spawn(
      "xcrun",
      [
        "simctl",
        "io",
        this.udid,
        "recordVideo",
        "--codec=h264",
        "--force",
        file,
      ],
      { stdio: "ignore" },
    );
    this.video = file;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  async end(): Promise<string | null> {
    const recorder = this.recorder;
    const video = this.video;
    this.recorder = null;
    this.video = null;
    if (!recorder || !video) return null;
    recorder.kill("SIGINT");
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 10_000);
      recorder.once("exit", () => {
        clearTimeout(timer);
        resolve();
      });
    });
    return video;
  }

  async evaluate<T>(expression: string): Promise<T> {
    await this.use("web");
    // As a string: Safari's remote automation drops parts of richer values.
    const json = await this.driver.send<string | null>(
      "POST",
      "/execute/sync",
      { script: `return JSON.stringify(${expression});`, args: [] },
    );
    return (json === null || json === undefined ? null : JSON.parse(json)) as T;
  }

  async navigate(url: string): Promise<void> {
    await this.use("web");
    await this.driver.send("POST", "/url", { url });
  }

  private async screenSize(): Promise<{ width: number; height: number }> {
    await this.use("native");
    return this.driver.send<{ width: number; height: number }>(
      "GET",
      "/window/rect",
    );
  }

  /** A tap at a screen point, through XCTest. */
  private async press(at: Point): Promise<void> {
    await this.use("native");
    await this.driver.send("POST", "/execute/sync", {
      script: "mobile: tap",
      args: [{ x: at.x, y: at.y }],
    });
  }

  /**
   * A drag at a steady speed, through XCTest. The press before it is short
   * enough not to read as a long press (which selects text).
   */
  private async drag(from: Point, to: Point, ms: number): Promise<void> {
    await this.use("native");
    const distance = Math.hypot(to.x - from.x, to.y - from.y);
    await this.driver.send("POST", "/execute/sync", {
      script: "mobile: dragFromToWithVelocity",
      args: [
        {
          fromX: from.x,
          fromY: from.y,
          toX: to.x,
          toY: to.y,
          pressDuration: 0.05,
          holdDuration: 0.05,
          velocity: Math.max(100, (distance / Math.max(ms, 1)) * 1000),
        },
      ],
    });
  }

  /** As on Android (devices/android.ts): one tap tells us the page's origin. */
  private async calibrate(): Promise<ScreenMapping> {
    const { width, height } = await this.screenSize();
    const at = { x: Math.round(width / 2), y: Math.round(height * 0.45) };
    await this.evaluate(ARM_CALIBRATION);
    await this.press(at);
    let seen:
      | (Point & { offsetTop: number; offsetLeft: number; scale: number })
      | null = null;
    for (let i = 0; i < 20 && !seen; i++) {
      await new Promise((resolve) => setTimeout(resolve, 150));
      seen = await this.evaluate(READ_CALIBRATION);
    }
    if (!seen) throw new Error("the calibration tap never reached the page");
    // Points are CSS pixels in Safari at 1× zoom.
    // Let the catcher disarm before the next tap (page-scripts.ts).
    await new Promise((resolve) => setTimeout(resolve, 600));
    this.mapping = calibrate(at, seen, 1);
    return this.mapping;
  }

  private async screenPoint(at: Point): Promise<Point> {
    return toScreen(at, this.mapping ?? (await this.calibrate()));
  }

  async tap(at: Point): Promise<void> {
    await this.press(await this.screenPoint(at));
  }

  async swipe(from: Point, to: Point, ms: number): Promise<void> {
    await this.drag(
      await this.screenPoint(from),
      await this.screenPoint(to),
      ms,
    );
  }

  /** The id of an element found by `using`/`value`, or null. */
  private async element(using: string, value: string): Promise<string | null> {
    try {
      const found = await this.driver.send<Record<string, string>>(
        "POST",
        "/element",
        { using, value },
      );
      return Object.values(found)[0] ?? null;
    } catch {
      return null;
    }
  }

  private async click(id: string): Promise<void> {
    await this.driver.send("POST", `/element/${id}/click`, {});
  }

  async type(text: string): Promise<void> {
    await this.use("native");
    for (const char of text) {
      // A tap on the software keyboard's key, switching between its letters
      // and numbers planes (the "123"/"ABC" key) when the key isn't showing.
      let key = await this.element("accessibility id", char);
      if (!key) {
        const plane = await this.element(
          "-ios predicate string",
          'type == "XCUIElementTypeKey" AND (name == "more" OR name CONTAINS[c] "numbers" OR name CONTAINS[c] "letters")',
        );
        if (plane) {
          await this.click(plane);
          key = await this.element("accessibility id", char);
        }
      }
      if (!key) throw new Error(`no "${char}" key on the keyboard`);
      await this.click(key);
    }
  }

  async keyboardShown(): Promise<boolean | null> {
    await this.use("native");
    try {
      const keyboards = await this.driver.send<unknown[]>("POST", "/elements", {
        using: "class name",
        value: "XCUIElementTypeKeyboard",
      });
      return keyboards.length > 0;
    } catch {
      return null;
    }
  }

  async hideKeyboard(): Promise<void> {
    if (!(await this.keyboardShown())) return;
    await this.use("native");
    // Safari's bar over the keyboard has Done; a person taps that.
    try {
      const done = await this.driver.send<Record<string, string>>(
        "POST",
        "/element",
        { using: "accessibility id", value: "Done" },
      );
      await this.driver.send(
        "POST",
        `/element/${Object.values(done)[0]}/click`,
        {},
      );
    } catch {
      await this.driver.send("POST", "/execute/sync", {
        script: "mobile: hideKeyboard",
        args: [{}],
      });
    }
  }

  async rotate(orientation: "portrait" | "landscape"): Promise<void> {
    await this.use("native");
    await this.driver.send("POST", "/orientation", {
      orientation: orientation.toUpperCase(),
    });
    this.mapping = null;
  }

  async screenshot(): Promise<Buffer> {
    // simctl's is the whole screen at full resolution, keyboard included.
    try {
      const file = path.join(tmpdir(), `mobile-lab-${process.pid}.png`);
      await run("xcrun", ["simctl", "io", this.udid, "screenshot", file]);
      return await readFile(file);
    } catch {
      // Not on the Mac running the Simulator: WebDriverAgent's screenshot.
    }
    const png = await this.driver.send<string>("GET", "/screenshot");
    return Buffer.from(png, "base64");
  }

  async close(): Promise<void> {
    await this.end();
    await this.driver.send("DELETE", "").catch(() => undefined);
  }
}
