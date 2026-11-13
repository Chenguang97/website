import { LIQUID_DURATION, smooth, mix, liquidOutline, createLiquidSpring, liquidBody, createLiquidSurface } from "../ui/liquid-motion.js";

// Only the coach's three top-level tabs opt into this desktop variant.
const INTENSITY = Object.freeze({ damping: .74, deformation: .55, tailScale: .32 });
let tabs;

export function initializeCoachTabMotion(buttonList) {
  if (tabs) return;
  const buttons = [...buttonList];
  if (buttons.length !== 3) return;
  const root = buttons[0].parentElement;
  const { svg, path } = createLiquidSurface({ id: "coach-tab-liquid", className: "coach-tab-liquid", width: 540, droplets: 0 });
  // A single continuous path needs no goo filter. Its drawn bounds now match
  // the measured capsule exactly, including the 8px resting inset.
  path.parentElement.removeAttribute("filter");
  root.prepend(svg);
  tabs = {
    buttons, root, svg, path, frame: 0, velocity: 0,
    selected: Math.max(0, buttons.findIndex((button) => button.getAttribute("aria-selected") === "true")),
    layout: buttons.map((_, index) => ({ center: 90 + 180 * index, width: 164, height: 68 })),
    desktop: window.matchMedia?.("(min-width: 1101px)"),
    reduced: window.matchMedia?.("(prefers-reduced-motion: reduce)"),
  };
  tabs.shape = { ...tabs.layout[tabs.selected], tail: 0 };
  refresh();
  tabs.desktop?.addEventListener("change", refresh);
  tabs.reduced?.addEventListener("change", () => { if (tabs.reduced.matches) settle(); });
  if (typeof ResizeObserver === "function") {
    const observer = new ResizeObserver(refresh);
    observer.observe(root);
  } else window.addEventListener("resize", refresh);
}

function isDesktop() {
  return tabs.desktop?.matches ?? window.innerWidth > 1100;
}

function measure() {
  const bounds = tabs.root.getBoundingClientRect();
  if (!bounds.width || !bounds.height) return false;
  const scale = 88 / bounds.height;
  const rectangles = tabs.buttons.map((button) => button.getBoundingClientRect());
  // The equal CSS grid tracks share one resting capsule, including subpixel sizes.
  const width = Math.min(...rectangles.map((rect) => rect.width)) * scale;
  const height = Math.min(width, ...rectangles.map((rect) => rect.height * scale));
  const layout = rectangles.map((rect) => ({
    center: (rect.left - bounds.left + rect.width / 2) * scale,
    width,
    height,
  }));
  const changed = layout.some((item, i) => Object.keys(item).some((key) => Math.abs(item[key] - tabs.layout[i][key]) > .01));
  tabs.layout = layout;
  tabs.svg.setAttribute("viewBox", `0 0 ${bounds.width * scale} 88`);
  return changed;
}

function refresh() {
  tabs.root.classList.toggle("has-liquid-tabs", isDesktop());
  tabs.svg.style.display = isDesktop() ? "block" : "none";
  if (measure() || !isDesktop() || !tabs.frame) settle();
}

function draw() {
  tabs.path.setAttribute("d", liquidOutline(tabs.shape));
}

function settle() {
  cancelAnimationFrame(tabs.frame);
  tabs.frame = 0;
  tabs.velocity = 0;
  tabs.shape = { ...tabs.layout[tabs.selected], tail: 0 };
  draw();
}

// Called after the existing navigation accepts the change, including discard confirmation.
export function animateCoachTab(button, { animate = true } = {}) {
  if (!tabs) return;
  const next = tabs.buttons.indexOf(button);
  if (next < 0 || button.disabled || button.getAttribute("aria-disabled") === "true") return;
  if (measure()) settle();
  if (!animate || !isDesktop() || tabs.reduced?.matches) {
    tabs.selected = next;
    settle();
    return;
  }
  if (next === tabs.selected) return;
  cancelAnimationFrame(tabs.frame);
  const initial = { ...tabs.shape }, target = tabs.layout[next];
  const distance = target.center - initial.center;
  const direction = Math.sign(distance) || 1;
  const amplitude = Math.min(1, Math.abs(distance) / 180);
  const spring = createLiquidSpring(initial.center, target.center, tabs.velocity, INTENSITY.damping);
  const start = performance.now();
  tabs.selected = next;
  function tick(now) {
    const time = (now - start) / 1000;
    if (time >= LIQUID_DURATION) { settle(); return; }
    const { center, velocity } = spring(time);
    const body = liquidBody(time, velocity, direction, amplitude, INTENSITY);
    const blend = smooth(time / .12);
    tabs.shape = {
      center,
      width: mix(initial.width, target.width, smooth(time / .26)) + (body.width - 164) * target.width / 164 * blend,
      height: mix(initial.height, target.height, smooth(time / .12)) + (body.height - 68) * target.height / 68 * blend,
      tail: mix(initial.tail, body.tail * target.height / 68, blend),
    };
    tabs.velocity = velocity;
    draw();
    tabs.frame = requestAnimationFrame(tick);
  }
  tabs.frame = requestAnimationFrame(tick);
}
