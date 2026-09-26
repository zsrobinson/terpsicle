// Code that runs inside the page under test, as source text. Every driver
// runs it the same way: Playwright's `page.evaluate(string)`, and Appium's
// `execute/sync` (as `return <expression>`). Plain strings, not functions,
// because a transpiled function can reference helpers (`__name`) the page
// doesn't have.

/** Wraps a function's source and its JSON arguments into one expression. */
export function call(fnSource: string, ...args: unknown[]): string {
  return `(${fnSource})(${args.map((a) => JSON.stringify(a)).join(",")})`;
}

/**
 * Installs the recorder once per page load: events (resizes, the visual
 * viewport, focus, visibility, touches, errors) and a per-frame trace of
 * whatever moved (the drawer, the viewport, the page's scroll, the focused
 * field). Returns `fresh: true` when it had to install, which after the
 * first load means the page reloaded.
 */
export const INSTALL = `(() => {
  const w = window;
  if (w.__lab) return { fresh: false, timeOrigin: performance.timeOrigin };
  const lab = { events: [], frames: [], errors: [] };
  w.__lab = lab;
  const now = () => Math.round(performance.now());
  const describe = (el) => {
    if (!el || !el.tagName) return el === document ? "document" : String(el);
    let s = el.tagName.toLowerCase();
    if (el.id) s += "#" + el.id;
    const label = el.getAttribute("aria-label");
    if (label) s += '[aria-label="' + label + '"]';
    return s;
  };
  lab.describe = describe;
  const push = (type, detail) => {
    lab.events.push(Object.assign({ t: now(), type }, detail));
    if (lab.events.length > 3000) lab.events.splice(0, 1000);
  };
  const vv = w.visualViewport;
  const vvState = () => vv ? { h: Math.round(vv.height), top: Math.round(vv.offsetTop), scale: +vv.scale.toFixed(3) } : {};
  addEventListener("resize", () => push("resize", { innerWidth, innerHeight }));
  if (vv) {
    vv.addEventListener("resize", () => push("vv-resize", vvState()));
    vv.addEventListener("scroll", () => push("vv-scroll", vvState()));
  }
  addEventListener("scroll", () => push("scroll", { y: Math.round(scrollY) }));
  document.addEventListener("focusin", (e) => push("focusin", { target: describe(e.target) }));
  document.addEventListener("focusout", (e) => push("focusout", { target: describe(e.target) }));
  document.addEventListener("visibilitychange", () => push("visibility", { state: document.visibilityState }));
  addEventListener("pagehide", () => push("pagehide", {}));
  addEventListener("pageshow", (e) => push("pageshow", { persisted: e.persisted }));
  addEventListener("beforeunload", () => push("beforeunload", {}));
  addEventListener("orientationchange", () => push("orientationchange", {}));
  addEventListener("pointercancel", (e) => push("pointercancel", { target: describe(e.target) }), true);
  const touch = (type) => (e) => {
    const t = e.changedTouches[0];
    push(type, { n: e.touches.length, x: t ? +t.clientX.toFixed(1) : null, y: t ? +t.clientY.toFixed(1) : null, target: describe(e.target) });
  };
  addEventListener("touchstart", touch("touchstart"), { capture: true, passive: true });
  addEventListener("touchend", touch("touchend"), { capture: true, passive: true });
  addEventListener("error", (e) => lab.errors.push(String(e.message || e)));
  addEventListener("unhandledrejection", (e) => lab.errors.push("unhandled rejection: " + String(e.reason && e.reason.message || e.reason)));
  // Only frames where something moved, so a still screen costs nothing.
  let last = "";
  const tick = () => {
    const d = document.querySelector("[data-vaul-drawer]");
    const a = document.activeElement;
    const focused = a && a !== document.body && (a.tagName === "INPUT" || a.tagName === "TEXTAREA");
    const f = [
      d ? Math.round(d.getBoundingClientRect().top) : null,
      d ? d.getAttribute("data-snap") : null,
      innerHeight,
      vv ? Math.round(vv.height) : null,
      vv ? Math.round(vv.offsetTop) : null,
      vv ? +vv.scale.toFixed(3) : null,
      Math.round(scrollY),
      focused ? Math.round(a.getBoundingClientRect().top) : null,
    ];
    const key = f.join();
    if (key !== last) {
      last = key;
      lab.frames.push([now()].concat(f));
      if (lab.frames.length > 6000) lab.frames.splice(0, 2000);
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  push("installed", { navigation: (performance.getEntriesByType("navigation")[0] || {}).type || null });
  return { fresh: true, timeOrigin: performance.timeOrigin };
})()`;

/** Column names for `frames` rows (`[t, ...FRAME_COLUMNS]`). */
export const FRAME_COLUMNS = [
  "drawerTop",
  "snap",
  "innerHeight",
  "vvHeight",
  "vvOffsetTop",
  "vvScale",
  "scrollY",
  "focusedTop",
] as const;

/**
 * Everything a step records about the page. Drains the recorder's events
 * and frames, so each step gets what happened since the last one.
 */
export const PROBE = `(() => {
  const lab = window.__lab;
  const vv = window.visualViewport;
  const r1 = (n) => Math.round(n * 10) / 10;
  const rect = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r1(r.x), y: r1(r.y), width: r1(r.width), height: r1(r.height), bottom: r1(r.bottom), right: r1(r.right) };
  };
  const describe = lab ? lab.describe : (el) => el && el.tagName;
  const scroller = (el) => el ? { scrollTop: Math.round(el.scrollTop), scrollHeight: el.scrollHeight, clientHeight: el.clientHeight, rect: rect(el) } : null;
  const drawer = document.querySelector("[data-vaul-drawer]");
  const a = document.activeElement;
  const nonText = ["button","checkbox","color","file","image","radio","range","reset","submit"];
  const textEntry = !!a && ((a.tagName === "INPUT" && !nonText.includes(a.type)) || a.tagName === "TEXTAREA" || a.isContentEditable === true);
  const ar = a && a !== document.body ? a.getBoundingClientRect() : null;
  let hit = null;
  if (ar && ar.width > 0) {
    const el = document.elementFromPoint(ar.x + Math.min(ar.width / 2, 40), ar.y + ar.height / 2);
    hit = el === a || (el && a.contains(el)) ? "self" : describe(el);
  }
  const panel = document.querySelector("#sidebar-panel > [data-layer][data-active]");
  const heading = panel ? panel.querySelector("h1, h2") : null;
  return {
    url: location.href,
    title: document.title,
    timeOrigin: performance.timeOrigin,
    installed: !!lab,
    innerWidth, innerHeight, outerWidth, outerHeight,
    devicePixelRatio,
    screen: { width: screen.width, height: screen.height, orientation: screen.orientation ? screen.orientation.type : null },
    visualViewport: vv ? { width: r1(vv.width), height: r1(vv.height), offsetTop: r1(vv.offsetTop), offsetLeft: r1(vv.offsetLeft), pageTop: r1(vv.pageTop), scale: +vv.scale.toFixed(3) } : null,
    scrollX: r1(scrollX), scrollY: r1(scrollY),
    document: { scrollWidth: document.documentElement.scrollWidth, scrollHeight: document.documentElement.scrollHeight, clientWidth: document.documentElement.clientWidth, clientHeight: document.documentElement.clientHeight },
    drawer: drawer ? { snap: drawer.getAttribute("data-snap"), rect: rect(drawer), transform: getComputedStyle(drawer).transform, contentHeight: [...drawer.children].reduce((m, c) => Math.max(m, r1(c.getBoundingClientRect().height)), 0) } : null,
    activeElement: a && a !== document.body ? { describe: describe(a), textEntry, rect: rect(a), hit, value: "value" in a ? String(a.value).slice(0, 40) : null } : null,
    panel: panel ? { heading: heading ? heading.textContent.trim().slice(0, 60) : null, body: scroller(panel.querySelector("[data-panel-body]")), layer: scroller(panel) } : null,
    searchResults: scroller(document.querySelector("#search-results")),
    resultCount: document.querySelectorAll("[data-course-result]").length,
    calendar: scroller(document.querySelector("[data-calendar-scroll]")),
    events: lab ? lab.events.splice(0) : [],
    frames: lab ? lab.frames.splice(0) : [],
    errors: lab ? lab.errors.splice(0) : [],
  };
})()`;

/**
 * Where an element is, in the layout viewport's CSS pixels (what
 * `getBoundingClientRect` returns), with the visual viewport to convert it
 * to a point on the screen. `text` matches the element's aria-label or text.
 */
export const FIND = `(q) => {
  const vv = window.visualViewport;
  const viewport = vv ? { offsetTop: vv.offsetTop, offsetLeft: vv.offsetLeft, scale: vv.scale, width: vv.width, height: vv.height } : { offsetTop: 0, offsetLeft: 0, scale: 1, width: innerWidth, height: innerHeight };
  // On screen and not under anything (the keyboard's band, a list's edge).
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const x = r.x + r.width / 2, y = r.y + r.height / 2;
    if (y < viewport.offsetTop || y > viewport.offsetTop + viewport.height) return false;
    const hit = document.elementFromPoint(x, y);
    return !!hit && (hit === el || el.contains(hit));
  };
  const all = [...document.querySelectorAll(q.selector)];
  const matches = all.filter((el) => {
    if (q.visible && !visible(el)) return false;
    if (q.text === undefined) return true;
    const label = (el.getAttribute("aria-label") || el.textContent || "").trim();
    return q.exact ? label === q.text : label.includes(q.text);
  });
  const el = matches[q.index || 0];
  if (!el) return { found: false, count: matches.length, viewport };
  const r = el.getBoundingClientRect();
  return { found: true, count: matches.length, rect: { x: r.x, y: r.y, width: r.width, height: r.height }, viewport };
}`;

/** The visual viewport alone, to turn layout coordinates into screen ones. */
export const VIEWPORT = `(() => {
  const vv = window.visualViewport;
  return vv ? { offsetTop: vv.offsetTop, offsetLeft: vv.offsetLeft, scale: vv.scale, width: vv.width, height: vv.height } : { offsetTop: 0, offsetLeft: 0, scale: 1, width: innerWidth, height: innerHeight };
})()`;

/**
 * Arms a one-shot catcher for a calibration tap: the next touch anywhere is
 * recorded and swallowed before the app sees it, so tapping a known point on
 * the screen tells us where the page's origin sits (it moves with the
 * browser's toolbars).
 */
export const ARM_CALIBRATION = `(() => {
  const w = window;
  w.__labCalibration = null;
  const touch = ["pointerdown","pointerup","pointermove","pointercancel","touchstart","touchmove","touchend","touchcancel"];
  // What a browser may send after the touch ends, for a tap.
  const after = ["mousedown","mouseup","click"];
  const off = (types) => types.forEach((t) => removeEventListener(t, swallow, true));
  const swallow = (e) => {
    if (e.type === "touchstart" && !w.__labCalibration) {
      const t = e.changedTouches[0];
      const vv = w.visualViewport;
      w.__labCalibration = { x: t.clientX, y: t.clientY, offsetTop: vv ? vv.offsetTop : 0, offsetLeft: vv ? vv.offsetLeft : 0, scale: vv ? vv.scale : 1 };
    }
    if (e.cancelable) e.preventDefault();
    e.stopImmediatePropagation();
    // The tap's own mouse events come once each, if at all.
    if (after.includes(e.type)) removeEventListener(e.type, swallow, true);
    // Disarm as soon as the tap is over, so the next real tap gets through.
    if (e.type === "touchend" || e.type === "touchcancel") {
      off(touch);
      setTimeout(() => off(after), 400);
    }
  };
  touch.concat(after).forEach((t) => addEventListener(t, swallow, { capture: true, passive: false }));
  setTimeout(() => off(touch.concat(after)), 3000);
  return true;
})()`;

export const READ_CALIBRATION = "window.__labCalibration";
