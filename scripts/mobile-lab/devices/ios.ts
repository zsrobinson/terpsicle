// Safari in the iOS Simulator, driven through Appium's XCUITest driver: page
// scripts run over Safari's Web Inspector (Appium's web context), while taps,
// drags and typing are XCTest touches on the screen and keys on the software
// keyboard (the Simulator's hardware keyboard is disconnected), so Safari's
// own scrolling, rubber-banding, zoom-on-focus, keyboard and toolbars are
// what's under test. Talks WebDriver over fetch; the Appium server comes
// from the workflow (APPIUM_URL, default http://127.0.0.1:4723).

import { type ChildProcess, execFile, spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
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

class WebDriver {
  constructor(
    private readonly base: string,
    readonly id: string,
  ) {}

  static async start(
    base: string,
    capabilities: Record<string, unknown>,
  ): Promise<WebDriver> {
    const response = await fetch(`${base}/session`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ capabilities: { alwaysMatch: capabilities } }),
    });
    const body = (await response.json()) as {
      value: { sessionId?: string } & Partial<WebDriverError>;
    };
    if (!body.value.sessionId)
      throw new Error(`Appium session failed: ${body.value.message}`);
    return new WebDriver(base, body.value.sessionId);
  }

  async send<T>(
    method: "GET" | "POST" | "DELETE",
    path: string,
    body?: unknown,
  ): Promise<T> {
    const response = await fetch(`${this.base}/session/${this.id}${path}`, {
      method,
      headers: { "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const json = (await response.json()) as { value: T | WebDriverError };
    const value = json.value;
    if (
      value &&
      typeof value === "object" &&
      "error" in value &&
      typeof value.error === "string"
    )
      throw new Error(`${method} ${path}: ${value.error}: ${value.message}`);
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
    return this.driver.send<T>("POST", "/execute/sync", {
      script: `return ${expression};`,
      args: [],
    });
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

  private async touch(points: Point[], ms: number): Promise<void> {
    await this.use("native");
    const [first, ...rest] = points;
    if (!first) return;
    const actions: Record<string, unknown>[] = [
      { type: "pointerMove", duration: 0, x: first.x, y: first.y },
      { type: "pointerDown", button: 0 },
      { type: "pause", duration: 60 },
      ...rest.map((p) => ({
        type: "pointerMove",
        duration: Math.round(ms / rest.length),
        x: p.x,
        y: p.y,
      })),
      { type: "pointerUp", button: 0 },
    ];
    await this.driver.send("POST", "/actions", {
      actions: [
        {
          type: "pointer",
          id: "finger",
          parameters: { pointerType: "touch" },
          actions,
        },
      ],
    });
  }

  /** As on Android (devices/android.ts): one tap tells us the page's origin. */
  private async calibrate(): Promise<ScreenMapping> {
    const { width, height } = await this.screenSize();
    const at = { x: Math.round(width / 2), y: Math.round(height * 0.45) };
    await this.evaluate(ARM_CALIBRATION);
    await this.touch([at], 0);
    let seen:
      | (Point & { offsetTop: number; offsetLeft: number; scale: number })
      | null = null;
    for (let i = 0; i < 20 && !seen; i++) {
      await new Promise((resolve) => setTimeout(resolve, 150));
      seen = await this.evaluate(READ_CALIBRATION);
    }
    if (!seen) throw new Error("the calibration tap never reached the page");
    // Points are CSS pixels in Safari at 1× zoom.
    this.mapping = calibrate(at, seen, 1);
    return this.mapping;
  }

  private async screenPoint(at: Point): Promise<Point> {
    return toScreen(at, this.mapping ?? (await this.calibrate()));
  }

  async tap(at: Point): Promise<void> {
    await this.touch([await this.screenPoint(at)], 0);
  }

  async swipe(from: Point, to: Point, ms: number): Promise<void> {
    const a = await this.screenPoint(from);
    const b = await this.screenPoint(to);
    const steps = 8;
    const points = Array.from({ length: steps + 1 }, (_, i) => ({
      x: Math.round(a.x + ((b.x - a.x) * i) / steps),
      y: Math.round(a.y + ((b.y - a.y) * i) / steps),
    }));
    await this.touch(points, ms);
  }

  async type(text: string): Promise<void> {
    await this.use("native");
    for (const char of text) {
      // A tap on the software keyboard's key.
      try {
        const key = await this.driver.send<Record<string, string>>(
          "POST",
          "/element",
          { using: "accessibility id", value: char },
        );
        const id = Object.values(key)[0];
        await this.driver.send("POST", `/element/${id}/click`, {});
      } catch {
        // No such key on screen (another layout): type it into the field.
        const field = await this.driver.send<Record<string, string>>(
          "POST",
          "/element",
          { using: "-ios predicate string", value: "hasKeyboardFocus == 1" },
        );
        await this.driver.send(
          "POST",
          `/element/${Object.values(field)[0]}/value`,
          {
            text: char,
          },
        );
      }
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
