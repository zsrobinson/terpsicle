// Chrome on an Android emulator (or a phone on USB). Playwright attaches to
// Chrome over adb for page scripts only; every touch, keystroke and rotation
// goes through adb's input and settings, so Android's own gesture handling,
// keyboard (IME), pull-to-refresh and toolbar are the ones under test, and
// screenshots are the real screen with the keyboard and browser chrome.

import { type ChildProcess, execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import {
  _android,
  type AndroidDevice,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import {
  calibrate,
  type Device,
  type Point,
  type ScreenMapping,
  toScreen,
} from "../device";
import { ARM_CALIBRATION, READ_CALIBRATION } from "../page-scripts";

const run = promisify(execFile);
const CHROME = "com.android.chrome";
const RECORDING = "/sdcard/mobile-lab.mp4";

export async function androidDevice(): Promise<Device> {
  // Playwright's on-device driver serves its selector API, which we don't
  // use: page scripts go over CDP and input over adb.
  const [device] = await _android.devices({ omitDriverInstall: true });
  if (!device) throw new Error("No Android device: `adb devices` is empty.");
  const phone = new AndroidChrome(device);
  await phone.setUp();
  return phone;
}

class AndroidChrome implements Device {
  readonly engine = "android" as const;
  readonly real = true;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private mapping: ScreenMapping | null = null;
  private recorder: ChildProcess | null = null;
  private video: string | null = null;

  constructor(private readonly device: AndroidDevice) {}

  private async adb(...args: string[]): Promise<string> {
    const { stdout } = await run("adb", ["-s", this.device.serial(), ...args], {
      maxBuffer: 64 * 1024 * 1024,
    });
    return stdout.toString();
  }

  private shell(command: string): Promise<string> {
    return this.adb("shell", command);
  }

  async setUp(): Promise<void> {
    await this.shell("svc power stayon true");
    await this.shell("input keyevent KEYCODE_WAKEUP");
    await this.shell("wm dismiss-keyguard").catch(() => "");
    // Rotation under our control, starting upright.
    await this.shell("settings put system accelerometer_rotation 0");
    await this.shell("settings put system user_rotation 0");
    // A busy emulator can make Chrome miss Android's five seconds to answer
    // input; its "isn't responding" box would then take every tap.
    await this.shell("settings put global hide_error_dialogs 1").catch(
      () => "",
    );
    // Android 13+ asks whether Chrome may notify, over the page, on first
    // run. Answer it ahead of time so no dialog eats the first taps.
    await this.shell(
      `pm grant ${CHROME} android.permission.POST_NOTIFICATIONS`,
    ).catch(() => "");
    this.context = await this.device.launchBrowser();
    this.page = this.context.pages()[0] ?? (await this.context.newPage());
  }

  async describe(): Promise<string> {
    const prop = (name: string) =>
      this.shell(`getprop ${name}`).then((s) => s.trim());
    const chrome = (await this.shell(`dumpsys package ${CHROME}`)).match(
      /versionName=(\S+)/,
    )?.[1];
    const size = (await this.shell("wm size")).match(/(\d+x\d+)/)?.[1];
    const density = (await this.shell("wm density")).match(/(\d+)\s*$/m)?.[1];
    return `${await prop("ro.product.model")}, Android ${await prop("ro.build.version.release")} (API ${await prop("ro.build.version.sdk")}), Chrome ${chrome ?? "?"}, screen ${size} at ${density} dpi`;
  }

  private get p(): Page {
    if (!this.page) throw new Error("Chrome isn't running");
    return this.page;
  }

  async begin(url: string, video: string | null): Promise<void> {
    this.mapping = null;
    await this.rotate("portrait");
    if (video) await this.startRecording(`${video}.mp4`);
    await this.p.goto(url);
    await this.dismissDialogs();
  }

  /**
   * Closes whatever Chrome or Android put over the page (first-run cards,
   * permission and "sign in" prompts) by tapping its dismiss button.
   * Returns whether it found one.
   */
  private async dismissDialogs(): Promise<boolean> {
    const dump = await this.shell(
      "uiautomator dump /sdcard/mobile-lab-ui.xml >/dev/null && cat /sdcard/mobile-lab-ui.xml",
    ).catch(() => "");
    const labels = [
      "No thanks",
      "No, thanks",
      "Don’t allow",
      "Don't allow",
      "Not now",
      "Got it",
      "Wait",
      "Dismiss",
    ];
    for (const label of labels) {
      const node = dump.match(
        new RegExp(
          `text="${label}"[^>]*bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"`,
        ),
      );
      if (!node) continue;
      const [x1, y1, x2, y2] = node.slice(1).map(Number) as [
        number,
        number,
        number,
        number,
      ];
      await this.shell(
        `input tap ${Math.round((x1 + x2) / 2)} ${Math.round((y1 + y2) / 2)}`,
      );
      await new Promise((resolve) => setTimeout(resolve, 800));
      return true;
    }
    return false;
  }

  private async startRecording(file: string): Promise<void> {
    await this.shell(`rm -f ${RECORDING}`);
    // Half size keeps files small; the bit rate keeps text readable.
    this.recorder = spawn(
      "adb",
      [
        "-s",
        this.device.serial(),
        "shell",
        `screenrecord --bit-rate 3000000 --size 540x1200 ${RECORDING}`,
      ],
      { stdio: "ignore" },
    );
    this.video = file;
    // screenrecord takes a moment to start writing.
    await new Promise((resolve) => setTimeout(resolve, 800));
  }

  async end(): Promise<string | null> {
    const recorder = this.recorder;
    const video = this.video;
    this.recorder = null;
    this.video = null;
    if (!recorder || !video) return null;
    await this.shell("pkill -INT screenrecord").catch(() => "");
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 8000);
      recorder.once("exit", () => {
        clearTimeout(timer);
        resolve();
      });
    });
    // The file is finalized just after the process exits.
    await new Promise((resolve) => setTimeout(resolve, 1000));
    try {
      await this.adb("pull", RECORDING, video);
      return video;
    } catch {
      return null;
    }
  }

  evaluate<T>(expression: string): Promise<T> {
    return this.p.evaluate(expression) as Promise<T>;
  }

  async navigate(url: string): Promise<void> {
    await this.p.goto(url);
  }

  private async screenSize(): Promise<{ width: number; height: number }> {
    // `wm size` is the upright size; the rotation swaps it.
    const [w = 1080, h = 2400] = (
      (await this.shell("wm size")).match(/(\d+)x(\d+)(?![\s\S]*\d+x\d+)/) ?? []
    )
      .slice(1)
      .map(Number);
    // The display's actual rotation, not the setting asked for.
    const dump = await this.shell("dumpsys input");
    const rotation = Number(
      dump.match(/SurfaceOrientation:\s*(\d)/)?.[1] ??
        (await this.shell("settings get system user_rotation")).trim(),
    );
    return rotation % 2 === 1
      ? { width: h, height: w }
      : { width: w, height: h };
  }

  /**
   * Taps a point on the screen that's inside the page and asks the page
   * where it felt it. The page's origin on the screen moves with Chrome's
   * toolbar and the rotation, so this runs again after either could move.
   */
  private async calibrate(retry = true): Promise<ScreenMapping> {
    const { width, height } = await this.screenSize();
    const dpr = await this.evaluate<number>("devicePixelRatio");
    const at = { x: Math.round(width / 2), y: Math.round(height * 0.45) };
    await this.evaluate(ARM_CALIBRATION);
    await this.shell(`input tap ${at.x} ${at.y}`);
    let seen:
      | (Point & { offsetTop: number; offsetLeft: number; scale: number })
      | null = null;
    for (let i = 0; i < 20 && !seen; i++) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      seen = await this.evaluate(READ_CALIBRATION);
    }
    if (!seen) {
      // Something over the page took the tap: clear it and try once more.
      if (retry && (await this.dismissDialogs())) return this.calibrate(false);
      throw new Error("the calibration tap never reached the page");
    }
    // Let the catcher disarm before the next tap (page-scripts.ts).
    await new Promise((resolve) => setTimeout(resolve, 600));
    this.mapping = calibrate(at, seen, dpr);
    return this.mapping;
  }

  private async screenPoint(at: Point): Promise<Point> {
    return toScreen(at, this.mapping ?? (await this.calibrate()));
  }

  async tap(at: Point): Promise<void> {
    const p = await this.screenPoint(at);
    await this.shell(`input tap ${p.x} ${p.y}`);
  }

  async swipe(from: Point, to: Point, ms: number): Promise<void> {
    const a = await this.screenPoint(from);
    const b = await this.screenPoint(to);
    await this.shell(
      `input swipe ${a.x} ${a.y} ${b.x} ${b.y} ${Math.round(ms)}`,
    );
  }

  async type(text: string): Promise<void> {
    // `input text` sends the characters through the focused field's input
    // connection, the way the keyboard's own keys do.
    await this.shell(`input text ${JSON.stringify(text)}`);
  }

  async keyboardShown(): Promise<boolean | null> {
    const dump = await this.shell("dumpsys input_method");
    const shown = dump.match(/mInputShown=(true|false)/)?.[1];
    if (shown) return shown === "true";
    const visible = dump.match(/isInputViewShown=(true|false)/)?.[1];
    return visible ? visible === "true" : null;
  }

  async hideKeyboard(): Promise<void> {
    // Back puts the keyboard away; with no keyboard up it would go back a
    // page, so only when it's up.
    if (await this.keyboardShown()) await this.shell("input keyevent 4");
  }

  async rotate(orientation: "portrait" | "landscape"): Promise<void> {
    const rotation = orientation === "landscape" ? 1 : 0;
    // Newer Android takes the window manager's lock; older, the setting.
    await this.shell(`wm user-rotation lock ${rotation}`).catch(() => "");
    await this.shell(`settings put system user_rotation ${rotation}`);
    this.mapping = null;
  }

  async screenshot(): Promise<Buffer> {
    const { stdout } = await run(
      "adb",
      ["-s", this.device.serial(), "exec-out", "screencap", "-p"],
      { encoding: "buffer", maxBuffer: 64 * 1024 * 1024 },
    );
    return stdout;
  }

  async close(): Promise<void> {
    await this.end();
    await this.context?.close().catch(() => undefined);
    await this.device.close();
  }
}
