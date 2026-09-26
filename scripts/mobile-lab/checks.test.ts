import { describe, expect, it } from "vitest";
import {
  expectedDrawerTop,
  type Frame,
  isWebkitCompositorCrash,
  type Probe,
  reversals,
  stepChecks,
  traceChecks,
} from "./checks";
import { calibrate, toScreen, toVisual } from "./device";

function aProbe(overrides: Partial<Probe> = {}): Probe {
  return {
    url: "https://terpsicle.com/",
    title: "Terpsicle",
    timeOrigin: 1000,
    installed: true,
    labId: "a",
    innerWidth: 412,
    innerHeight: 800,
    outerWidth: 412,
    outerHeight: 800,
    devicePixelRatio: 2.625,
    screen: { width: 412, height: 915, orientation: "portrait-primary" },
    visualViewport: {
      width: 412,
      height: 800,
      offsetTop: 0,
      offsetLeft: 0,
      pageTop: 0,
      scale: 1,
    },
    scrollX: 0,
    scrollY: 0,
    document: {
      scrollWidth: 412,
      scrollHeight: 800,
      clientWidth: 412,
      clientHeight: 800,
    },
    drawer: {
      snap: "half",
      rect: { x: 0, y: 400, width: 412, height: 800, bottom: 1200, right: 412 },
      transform: "none",
      contentHeight: 400,
    },
    activeElement: null,
    panel: null,
    searchResults: null,
    resultCount: 0,
    calendar: null,
    events: [],
    frames: [],
    errors: [],
    ...overrides,
  };
}

const failed = (p: Probe, settled = true) =>
  stepChecks(p, { labId: "a", settled })
    .filter((c) => !c.ok)
    .map((c) => c.id);

describe("stepChecks", () => {
  it("passes a phone at rest", () => {
    expect(failed(aProbe())).toEqual([]);
  });

  it("catches a reload", () => {
    expect(failed(aProbe({ labId: "b" }))).toContain("no-reload");
    expect(failed(aProbe({ installed: false, labId: null }))).toContain(
      "no-reload",
    );
    // timeOrigin drifts within one load in the iOS Simulator: not a reload.
    expect(failed(aProbe({ timeOrigin: 1020 }))).not.toContain("no-reload");
  });

  it("catches a focused field the keyboard or a pan hid", () => {
    const field = (y: number) => ({
      describe: "input",
      textEntry: true,
      rect: { x: 0, y, width: 300, height: 34, bottom: y + 34, right: 300 },
      hit: "self",
      value: "",
    });
    // Keyboard up: only the top 450px show, from the top.
    const keyboard = {
      width: 412,
      height: 450,
      offsetTop: 0,
      offsetLeft: 0,
      pageTop: 0,
      scale: 1,
    };
    expect(
      failed(aProbe({ visualViewport: keyboard, activeElement: field(100) })),
    ).toEqual([]);
    expect(
      failed(aProbe({ visualViewport: keyboard, activeElement: field(600) })),
    ).toContain("focused-field-visible");
    // The browser panned the page 300px up to a field that then moved up.
    expect(
      failed(
        aProbe({
          visualViewport: { ...keyboard, offsetTop: 300, pageTop: 300 },
          activeElement: field(100),
        }),
      ),
    ).toContain("focused-field-visible");
  });

  it("needs every rail tab on screen or scrollable to", () => {
    const rail = (scrolls: boolean) => ({
      cut: ["Generate", "Export"],
      scrolls,
    });
    expect(failed(aProbe({ rail: rail(false) }))).toContain(
      "rail-tabs-reachable",
    );
    expect(failed(aProbe({ rail: rail(true) }))).toEqual([]);
    expect(failed(aProbe({ rail: { cut: [], scrolls: false } }))).toEqual([]);
  });

  it("knows where the drawer rests at each snap", () => {
    expect(expectedDrawerTop(aProbe())).toBe(400);
    const full = aProbe();
    if (full.drawer) full.drawer.snap = "full";
    expect(expectedDrawerTop(full)).toBe(48);
    // Under 480px tall, half is full.
    expect(expectedDrawerTop(aProbe({ innerHeight: 400 }))).toBe(48);
    expect(failed(aProbe())).not.toContain("drawer-rests-at-snap");
    const moved = aProbe();
    if (moved.drawer?.rect) moved.drawer.rect.y = 300;
    expect(failed(moved)).toContain("drawer-rests-at-snap");
    expect(failed(moved, false)).not.toContain("drawer-rests-at-snap");
  });
});

describe("traceChecks", () => {
  // [t, drawerTop, snap, innerHeight, vvHeight, vvOffsetTop, vvScale, scrollY, focusedTop]
  it("fails when the focused field left the panned view, even for a frame", () => {
    // Android Chrome on production: the keyboard opened with the field low
    // at half, Chrome panned 258px, and the drawer carried the field to 133.
    const frames: Frame[] = [
      [13522, 391, "half", 783, 783, 0, 1, 0, 476],
      [15290, 391, "full", 783, 471, 0, 1, 0, 476],
      [17991, 391, "full", 783, 471, 32, 1, 0, 476],
      [18121, 48, "full", 783, 471, 32, 1, 0, 133],
      [18394, 48, "full", 783, 471, 258, 1, 0, 133],
    ];
    const check = traceChecks(frames).find(
      (c) => c.id === "focused-field-never-above-view",
    );
    expect(check).toMatchObject({ ok: false, severity: "fail" });
  });

  it("passes a field that stays in view", () => {
    const frames: Frame[] = [
      [100, 48, "full", 783, 783, 0, 1, 0, 133],
      [300, 48, "full", 783, 471, 0, 1, 0, 133],
    ];
    expect(traceChecks(frames).filter((c) => !c.ok)).toEqual([]);
  });
});

describe("reversals", () => {
  it("counts changes of direction past a threshold", () => {
    expect(reversals([400, 300, 200, 48])).toBe(0);
    expect(reversals([400, 48, 400])).toBe(1);
    expect(reversals([400, 48, 400, 48])).toBe(2);
    // Jitter under the threshold isn't a reversal.
    expect(reversals([400, 390, 400, 395, 48])).toBe(0);
  });
});

describe("screen mapping", () => {
  it("finds the page's origin from one tap", () => {
    // Chrome's toolbar is 56 CSS px (147 device px) tall at 2.625×.
    const mapping = calibrate(
      { x: 540, y: 1080 },
      {
        x: 540 / 2.625,
        y: (1080 - 147) / 2.625,
        offsetTop: 0,
        offsetLeft: 0,
        scale: 1,
      },
      2.625,
    );
    expect(mapping.origin.y).toBeCloseTo(147);
    expect(toScreen({ x: 100, y: 100 }, mapping)).toEqual({ x: 263, y: 410 });
  });

  it("accounts for a panned or zoomed visual viewport", () => {
    expect(
      toVisual({ x: 100, y: 500 }, { offsetTop: 200, offsetLeft: 0, scale: 1 }),
    ).toEqual({ x: 100, y: 300 });
    expect(
      toVisual(
        { x: 100, y: 500 },
        { offsetTop: 200, offsetLeft: 50, scale: 2 },
      ),
    ).toEqual({ x: 100, y: 600 });
  });
});

describe("isWebkitCompositorCrash", () => {
  it("knows WPE's compositor segfault, and nothing else", () => {
    // From the runner's kernel log (run 2026-09-26T1419-webkit-36248050878).
    expect(
      isWebkitCompositorCrash(
        "[Sat Sep 26 14:20:04 2026] eadedCompositor[6411]: segfault at 0 ip 00007f2c4aca0f8a sp 00007f2bbaff98f0 error 4 in libWPEWebKit-2.0.so.1.12.0[60a0f8a,7f2c45408000+5edd000] likely on CPU 3 (core 1, socket 0)",
      ),
    ).toBe(true);
    // The same report, split over two lines as raw dmesg can print it.
    expect(
      isWebkitCompositorCrash(
        "[  312.4] eadedCompositor[6411]: segfault at 0 ip 00007f2c4aca0f8a sp 00007f2bbaff98f0 error 4\n[  312.4]  in libWPEWebKit-2.0.so.1.12.0[60a0f8a,7f2c45408000+5edd000] likely on CPU 3",
      ),
    ).toBe(true);
    // A crash anywhere else in the page process is the page's problem.
    expect(
      isWebkitCompositorCrash(
        "WebKitWebProces[7001]: segfault at 18 ip 00007f00 sp 00007f00 error 4 in libWPEWebKit-2.0.so.1.12.0[1234,7f00+5edd000]",
      ),
    ).toBe(false);
    expect(
      isWebkitCompositorCrash(
        "Out of memory: Killed process 7001 (WPEWebProcess)",
      ),
    ).toBe(false);
  });
});
