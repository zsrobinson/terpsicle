// Confetti off the end of a bar as it fills (docs/decisions.md, "Confetti
// when a check finishes the week"). The owner, 2026-10-05: "somewhat
// shooting out the side that the bar is progressing into, but still
// vertical, ~45ish degrees." So it leaves the bar's leading end up and out,
// rising at about 45° from straight up to the top of its arc (launched a
// little steeper, since air and gravity bend it toward the side), and is
// gone in about a second. Squares
// and strips, square like everything else, in the colors it's given: theme
// tokens, read in the theme that's on. One canvas over the page while it
// flies, removed after; no package. `./celebrate` decides when.

/** A color and how much of the confetti it is: a course's share of the week. */
export interface ConfettiColor {
  /** A theme token, without its dashes: `course-blue-dot`. */
  token: string;
  weight: number;
}

/** A course's few, or the week's many. */
export type ConfettiSize = "small" | "large";

interface Burst {
  count: number;
  /** Launch speeds, px/s. */
  speed: readonly [number, number];
  /** A square's side, px. */
  size: number;
}

const BURSTS: Record<ConfettiSize, Burst> = {
  small: { count: 30, speed: [480, 820], size: 6 },
  large: { count: 120, speed: [620, 1180], size: 7 },
};

/** Gravity, px/s². */
const GRAVITY = 1400;
/** Air: a particle's speed falls by e^(−DRAG·t). */
const DRAG = 2.4;
/** How long a particle lives, ms. */
const LIFE: readonly [number, number] = [750, 1150];
/** The last share of a life spent fading out. */
const FADE = 0.35;
/**
 * The launch, degrees from straight up, with room to fly. Air and gravity
 * flatten the climb, so 35° at launch reads as 45° from the bar's end to the
 * top of the arc, the angle the eye takes (a launch at 45° reads nearer 58°).
 */
const AIM = 35;
/** Degrees each side of the aim. */
const SPREAD = 16;
/** The least room, px, between where confetti starts and the screen's edge. */
const MIN_ROOM = 48;
/** Strips among the squares. */
const STRIPS = 0.45;

export interface Particle {
  x: number;
  y: number;
  /** px/s */
  vx: number;
  vy: number;
  /** Radians, and radians per second. */
  angle: number;
  spin: number;
  /** A tumble, drawn as the shape's height shrinking and growing. */
  flip: number;
  flipSpeed: number;
  width: number;
  height: number;
  color: string;
  /** ms */
  life: number;
}

/**
 * The aim in degrees from straight up, leaning toward the bar's leading
 * side: `AIM`, and steeper as the screen's edge gets near (a phone's bar
 * ends 16px from it), so the confetti stays on screen long enough to see.
 */
export function confettiAim(room: number): number {
  return Math.min(AIM, Math.max(10, room / 4));
}

/** Picks a color by weight; `roll` is in [0, 1). */
export function pickColor(
  colors: readonly { color: string; weight: number }[],
  roll: number,
): string {
  const total = colors.reduce((sum, c) => sum + c.weight, 0);
  let left = roll * total;
  for (const c of colors) {
    left -= c.weight;
    if (left < 0) return c.color;
  }
  return colors[colors.length - 1]?.color ?? "";
}

/**
 * A burst's particles from (x, y). `side` is the way the bar grows: 1 to the
 * right, −1 to the left. `random` is Math.random outside tests.
 */
export function spawnConfetti({
  x,
  y,
  side,
  aim,
  size,
  colors,
  random,
}: {
  x: number;
  y: number;
  side: 1 | -1;
  /** Degrees from straight up (`confettiAim`). */
  aim: number;
  size: ConfettiSize;
  colors: readonly { color: string; weight: number }[];
  random: () => number;
}): Particle[] {
  const burst = BURSTS[size];
  const between = ([lo, hi]: readonly [number, number]) =>
    lo + (hi - lo) * random();
  return Array.from({ length: burst.count }, () => {
    const degrees = aim + (random() * 2 - 1) * SPREAD;
    const radians = (degrees * Math.PI) / 180;
    const speed = between(burst.speed);
    const side_ = burst.size * (0.75 + random() * 0.5);
    const strip = random() < STRIPS;
    return {
      x,
      y,
      vx: side * Math.sin(radians) * speed,
      vy: -Math.cos(radians) * speed,
      angle: random() * Math.PI,
      spin: (random() * 2 - 1) * 9,
      flip: random() * Math.PI,
      flipSpeed: 6 + random() * 8,
      width: strip ? side_ * 0.45 : side_,
      height: strip ? side_ * 1.8 : side_,
      color: pickColor(colors, random()),
      life: between(LIFE),
    };
  });
}

/** Moves a particle on by `dt` seconds: air, then gravity. */
export function stepParticle(p: Particle, dt: number): void {
  const air = Math.exp(-DRAG * dt);
  p.vx *= air;
  p.vy = p.vy * air + GRAVITY * dt;
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  p.angle += p.spin * dt;
  p.flip += p.flipSpeed * dt;
}

/** How opaque a particle is `age` ms in: whole, then fading out. */
export function particleAlpha(age: number, life: number): number {
  const left = 1 - age / life;
  return Math.max(0, Math.min(1, left / FADE));
}

/**
 * Whether the point is on screen and `el` is what's there, not under a
 * drawer, scrolled away or hidden. A browser without `elementFromPoint`
 * only gets the screen's bounds.
 */
function showsAt(el: Element, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight)
    return false;
  if (typeof document.elementFromPoint !== "function") return true;
  const top = document.elementFromPoint(x, y);
  return top !== null && (top === el || el.contains(top));
}

/**
 * Confetti from `bar`'s leading end, if that end is on screen: nothing for
 * a bar that's hidden, scrolled away or under something.
 */
export function burstConfetti(
  bar: HTMLElement,
  colors: readonly ConfettiColor[],
  size: ConfettiSize,
): void {
  const rect = bar.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return;
  const style = getComputedStyle(bar);
  const side = style.direction === "rtl" ? -1 : 1;
  const x = side === 1 ? rect.right : rect.left;
  const y = rect.top + rect.height / 2;
  // A pixel inside the end, which is the bar's own.
  if (!showsAt(bar, x - side, y)) return;
  const palette = colors
    .map((c) => ({
      color: style.getPropertyValue(`--${c.token}`).trim(),
      weight: c.weight,
    }))
    .filter((c) => c.color !== "" && c.weight > 0);
  if (palette.length === 0) return;

  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  canvas.dataset.confetti = "";
  canvas.className = "pointer-events-none fixed inset-0 z-50 size-full";
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.round(window.innerWidth * ratio);
  canvas.height = Math.round(window.innerHeight * ratio);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  document.body.append(canvas);

  // A phone's bar ends 16px from the screen's edge: start a little inside
  // the end, so the confetti isn't off screen as soon as it leaves.
  const room = side === 1 ? window.innerWidth - x : x;
  const inset = Math.max(0, MIN_ROOM - room);
  const particles = spawnConfetti({
    x: x - side * inset,
    y,
    side,
    aim: confettiAim(room + inset),
    size,
    colors: palette,
    random: Math.random,
  });
  let last = performance.now();
  // Its own clock: a long gap between frames (a busy or hidden tab) slows
  // the flight down rather than skipping it or throwing it off screen.
  let age = 0;
  const frame = (now: number) => {
    const dt = Math.min(0.05, Math.max(0, now - last) / 1000);
    last = now;
    age += dt * 1000;
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    let alive = false;
    for (const p of particles) {
      if (age >= p.life) continue;
      alive = true;
      stepParticle(p, dt);
      ctx.globalAlpha = particleAlpha(age, p.life);
      ctx.fillStyle = p.color;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);
      const h = p.height * Math.abs(Math.cos(p.flip));
      ctx.fillRect(-p.width / 2, -h / 2, p.width, h);
      ctx.restore();
    }
    if (alive) requestAnimationFrame(frame);
    else canvas.remove();
  };
  requestAnimationFrame(frame);
}

/**
 * Reduce Motion's stand-in for confetti: `row` takes one soft flash of the
 * hover gray and fades back, a change of color rather than a movement. The
 * Web Animations API, which the stylesheet's Reduce Motion rule (for CSS
 * animations and transitions) leaves alone.
 */
export function flashDone(row: HTMLElement): void {
  if (typeof row.animate !== "function") return;
  const style = getComputedStyle(row);
  const gray = style.getPropertyValue("--hover").trim();
  if (gray === "") return;
  row.animate(
    [{ backgroundColor: gray }, { backgroundColor: style.backgroundColor }],
    { duration: 900, easing: "ease-out" },
  );
}
