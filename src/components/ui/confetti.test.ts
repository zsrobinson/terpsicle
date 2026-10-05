import { afterEach, describe, expect, it, vi } from "vitest";
import {
  burstConfetti,
  confettiAim,
  flashDone,
  type Particle,
  particleAlpha,
  pickColor,
  spawnConfetti,
  stepParticle,
} from "./confetti";

/** A steady walk through [0, 1), so a burst comes out the same each time. */
function steps(): () => number {
  let i = 0;
  return () => {
    i = (i + 0.618034) % 1;
    return i;
  };
}

const COLORS = [
  { color: "#4385be", weight: 3 },
  { color: "#d0a215", weight: 1 },
];

describe("confettiAim", () => {
  it("leans 45° from straight up with room to fly", () => {
    expect(confettiAim(600)).toBe(45);
    expect(confettiAim(180)).toBe(45);
  });

  it("stands steeper near the screen's edge, never past 10°", () => {
    expect(confettiAim(100)).toBe(25);
    expect(confettiAim(16)).toBe(10);
    expect(confettiAim(0)).toBe(10);
  });
});

describe("spawnConfetti", () => {
  const spawn = (side: 1 | -1, size: "small" | "large" = "large") =>
    spawnConfetti({
      x: 300,
      y: 200,
      side,
      aim: 45,
      size,
      colors: COLORS,
      random: steps(),
    });

  it("sends every piece up and toward the side the bar grows into", () => {
    const right = spawn(1);
    expect(right.length).toBeGreaterThan(0);
    for (const p of right) {
      expect(p.vy).toBeLessThan(0);
      expect(p.vx).toBeGreaterThan(0);
      // Within the spread of 45°: never flatter than about 30° off level.
      const fromUp = (Math.atan2(p.vx, -p.vy) * 180) / Math.PI;
      expect(fromUp).toBeGreaterThanOrEqual(45 - 16 - 1e-9);
      expect(fromUp).toBeLessThanOrEqual(45 + 16 + 1e-9);
    }
    // A bar that grows to the left sends it left.
    for (const p of spawn(-1)) expect(p.vx).toBeLessThan(0);
  });

  it("is a few for a course and many for the week, from the bar's end", () => {
    expect(spawn(1, "small").length).toBeLessThan(spawn(1, "large").length);
    for (const p of spawn(1)) expect([p.x, p.y]).toEqual([300, 200]);
  });

  it("lives about a second", () => {
    for (const p of spawn(1)) {
      expect(p.life).toBeGreaterThanOrEqual(700);
      expect(p.life).toBeLessThanOrEqual(1200);
    }
  });

  it("uses each color as much as its weight", () => {
    const pieces = spawn(1);
    const blue = pieces.filter((p) => p.color === "#4385be").length;
    expect(blue / pieces.length).toBeGreaterThan(0.6);
    expect(blue / pieces.length).toBeLessThan(0.9);
  });
});

describe("pickColor", () => {
  it("walks the weights", () => {
    expect(pickColor(COLORS, 0)).toBe("#4385be");
    expect(pickColor(COLORS, 0.74)).toBe("#4385be");
    expect(pickColor(COLORS, 0.76)).toBe("#d0a215");
    expect(pickColor(COLORS, 0.999)).toBe("#d0a215");
  });
});

describe("stepParticle", () => {
  it("slows in the air and falls back down", () => {
    const p: Particle = {
      x: 0,
      y: 0,
      vx: 500,
      vy: -800,
      angle: 0,
      spin: 1,
      flip: 0,
      flipSpeed: 1,
      width: 6,
      height: 6,
      color: "#000",
      life: 1000,
    };
    let top = 0;
    for (let i = 0; i < 60; i++) {
      stepParticle(p, 1 / 60);
      top = Math.min(top, p.y);
    }
    expect(p.vx).toBeLessThan(500);
    expect(p.vx).toBeGreaterThan(0);
    // Rose, then turned back down.
    expect(top).toBeLessThan(-100);
    expect(p.vy).toBeGreaterThan(0);
  });
});

describe("particleAlpha", () => {
  it("is whole until the last third or so, then fades to nothing", () => {
    expect(particleAlpha(0, 1000)).toBe(1);
    expect(particleAlpha(600, 1000)).toBe(1);
    expect(particleAlpha(825, 1000)).toBeCloseTo(0.5);
    expect(particleAlpha(1000, 1000)).toBe(0);
    expect(particleAlpha(1200, 1000)).toBe(0);
  });
});

describe("burstConfetti", () => {
  const frames: FrameRequestCallback[] = [];

  function aBar({ width = 200 } = {}) {
    const bar = document.createElement("div");
    bar.style.setProperty("--course-blue-dot", "#4385be");
    document.body.append(bar);
    vi.spyOn(bar, "getBoundingClientRect").mockReturnValue(
      new DOMRect(16, 300, width, 8),
    );
    return bar;
  }

  function aCanvas() {
    const ctx = {
      setTransform: vi.fn(),
      clearRect: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      translate: vi.fn(),
      rotate: vi.fn(),
      fillRect: vi.fn(),
      globalAlpha: 1,
      fillStyle: "",
    };
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      ctx as unknown as CanvasRenderingContext2D,
    );
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      frames.push(cb);
      return frames.length;
    });
    return ctx;
  }

  /** Runs the frames asked for, up to `until` ms after the first. */
  function play(until: number) {
    const start = performance.now();
    for (let t = 0; t <= until && frames.length > 0; t += 16) {
      const next = frames.splice(0);
      for (const cb of next) cb(start + t);
    }
  }

  const canvases = () => document.querySelectorAll("canvas[data-confetti]");

  afterEach(() => {
    frames.length = 0;
    for (const c of canvases()) c.remove();
    document.body.replaceChildren();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("draws over the page from a visible bar, out of the way, then clears away", () => {
    const ctx = aCanvas();
    const bar = aBar();
    vi.spyOn(document, "elementFromPoint").mockReturnValue(bar);
    burstConfetti(bar, [{ token: "course-blue-dot", weight: 1 }], "small");
    const [canvas] = canvases();
    expect(canvas).toHaveAttribute("aria-hidden", "true");
    expect(canvas).toHaveClass("pointer-events-none", "fixed", "inset-0");
    play(200);
    expect(ctx.fillRect).toHaveBeenCalled();
    expect(ctx.fillStyle).toBe("#4385be");
    play(1500);
    expect(canvases()).toHaveLength(0);
  });

  it("leaves from the bar's leading end", () => {
    aCanvas();
    const bar = aBar();
    const at = vi.spyOn(document, "elementFromPoint").mockReturnValue(bar);
    burstConfetti(bar, [{ token: "course-blue-dot", weight: 1 }], "small");
    // A pixel inside the right end, halfway down.
    expect(at).toHaveBeenCalledWith(215, 304);
  });

  it("sends nothing from a bar that's hidden, or under something else", () => {
    aCanvas();
    const hidden = aBar({ width: 0 });
    burstConfetti(hidden, [{ token: "course-blue-dot", weight: 1 }], "large");
    expect(canvases()).toHaveLength(0);
    const covered = aBar();
    vi.spyOn(document, "elementFromPoint").mockReturnValue(document.body);
    burstConfetti(covered, [{ token: "course-blue-dot", weight: 1 }], "large");
    expect(canvases()).toHaveLength(0);
  });

  it("sends nothing without a color the theme knows", () => {
    aCanvas();
    const bar = aBar();
    vi.spyOn(document, "elementFromPoint").mockReturnValue(bar);
    burstConfetti(bar, [{ token: "course-nope-dot", weight: 1 }], "large");
    expect(canvases()).toHaveLength(0);
  });
});

describe("flashDone", () => {
  it("flashes the row the hover gray, then fades back", () => {
    const row = document.createElement("div");
    row.style.setProperty("--hover", "#e6e4d9");
    document.body.append(row);
    const animate = vi.fn();
    row.animate = animate;
    flashDone(row);
    expect(animate).toHaveBeenCalledTimes(1);
    const [keyframes, options] = animate.mock.calls[0] ?? [];
    expect(keyframes[0]).toEqual({ backgroundColor: "#e6e4d9" });
    // A fade, not a movement: nothing but the color changes.
    for (const frame of keyframes)
      expect(Object.keys(frame)).toEqual(["backgroundColor"]);
    expect(options).toMatchObject({ duration: 900 });
    row.remove();
  });
});
