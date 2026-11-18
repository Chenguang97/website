import { LIQUID_DURATION, smooth, mix, liquidOutline, createLiquidSpring, liquidBody, createLiquidSurface } from "../ui/liquid-motion.js";
import { createControlScope } from "../ui/control-lifecycle.js";

// This three-tab variant deliberately keeps its own geometry and intensity.
const INTENSITY = Object.freeze({ damping: .74, deformation: .55, tailScale: .32 });
let tabs = null;

export function initializeCoachTabMotion(buttonList) {
  if (tabs) return tabs.controller;
  const buttons = [...buttonList];
  if (buttons.length !== 3) return null;
  const root = buttons[0].parentElement;
  const view = root.ownerDocument.defaultView;
  const runtime = root.ownerDocument === globalThis.document ? globalThis : view;
  const scope = createControlScope();
  const { svg, path } = createLiquidSurface({ id: "coach-tab-liquid", className: "coach-tab-liquid", width: 540, droplets: 0 });
  path.parentElement.removeAttribute("filter");
  root.prepend(svg);
  const owner = {
    buttons, root, svg, path, view,
    frame: null, velocity: 0, generation: 0, destroyed: false,
    initialClass: root.classList.contains("has-liquid-tabs"),
    requestFrame: runtime.requestAnimationFrame.bind(runtime),
    cancelFrame: runtime.cancelAnimationFrame.bind(runtime),
    now: runtime.performance.now.bind(runtime.performance),
    selected: Math.max(0, buttons.findIndex((button) => button.getAttribute("aria-selected") === "true")),
    layout: buttons.map((_, index) => ({ center: 90 + 180 * index, width: 164, height: 68 })),
    desktop: view.matchMedia?.("(min-width: 1101px)"),
    reduced: view.matchMedia?.("(prefers-reduced-motion: reduce)"),
  };
  owner.shape = { ...owner.layout[owner.selected], tail: 0 };
  const controller = {
    animate(button, options) { animateTab(owner, button, options); },
    refresh() { refresh(owner); },
    destroy() {
      if (owner.destroyed) return;
      owner.destroyed = true;
      cancelFlight(owner);
      scope.destroy();
      svg.remove();
      root.classList.toggle("has-liquid-tabs", owner.initialClass);
      if (tabs === owner) tabs = null;
    },
  };
  owner.controller = controller;
  tabs = owner;
  refresh(owner);
  if (owner.desktop) scope.listen(owner.desktop, "change", () => refresh(owner));
  if (owner.reduced) scope.listen(owner.reduced, "change", () => {
    if (!owner.destroyed && owner.reduced.matches) settle(owner);
  });
  const Observer = runtime.ResizeObserver || view.ResizeObserver;
  if (typeof Observer === "function") {
    const observer = new Observer(() => refresh(owner));
    observer.observe(root);
    scope.add(() => observer.disconnect());
  } else scope.listen(view, "resize", () => refresh(owner));
  return controller;
}

function cancelFlight(owner) {
  owner.generation++;
  if (owner.frame !== null) owner.cancelFrame(owner.frame);
  owner.frame = null;
}

function isDesktop(owner) {
  return owner.desktop?.matches ?? owner.view.innerWidth > 1100;
}

function measure(owner) {
  const bounds = owner.root.getBoundingClientRect();
  if (!bounds.width || !bounds.height) return false;
  const scale = 88 / bounds.height;
  const rectangles = owner.buttons.map((button) => button.getBoundingClientRect());
  // The equal CSS grid tracks share one resting capsule, including subpixel sizes.
  const width = Math.min(...rectangles.map((rect) => rect.width)) * scale;
  const height = Math.min(width, ...rectangles.map((rect) => rect.height * scale));
  const layout = rectangles.map((rect) => ({
    center: (rect.left - bounds.left + rect.width / 2) * scale,
    width,
    height,
  }));
  const changed = layout.some((item, i) => Object.keys(item).some((key) => Math.abs(item[key] - owner.layout[i][key]) > .01));
  owner.layout = layout;
  owner.svg.setAttribute("viewBox", `0 0 ${bounds.width * scale} 88`);
  return changed;
}

function refresh(owner) {
  if (owner.destroyed) return;
  owner.root.classList.toggle("has-liquid-tabs", isDesktop(owner));
  owner.svg.style.display = isDesktop(owner) ? "block" : "none";
  if (measure(owner) || !isDesktop(owner) || owner.frame === null) settle(owner);
}

function draw(owner) {
  owner.path.setAttribute("d", liquidOutline(owner.shape));
}

function settle(owner) {
  if (owner.destroyed) return;
  cancelFlight(owner);
  owner.velocity = 0;
  owner.shape = { ...owner.layout[owner.selected], tail: 0 };
  draw(owner);
}

// Called after the existing navigation accepts the change, including discard confirmation.
function animateTab(owner, button, { animate = true } = {}) {
  if (!owner || owner.destroyed) return;
  const next = owner.buttons.indexOf(button);
  if (next < 0 || button.disabled || button.getAttribute("aria-disabled") === "true") return;
  if (measure(owner)) settle(owner);
  if (!animate || !isDesktop(owner) || owner.reduced?.matches) {
    owner.selected = next;
    settle(owner);
    return;
  }
  if (next === owner.selected) return;
  cancelFlight(owner);
  const generation = owner.generation;
  const initial = { ...owner.shape }, target = owner.layout[next];
  const distance = target.center - initial.center;
  const direction = Math.sign(distance) || 1;
  const amplitude = Math.min(1, Math.abs(distance) / 180);
  const spring = createLiquidSpring(initial.center, target.center, owner.velocity, INTENSITY.damping);
  const start = owner.now();
  owner.selected = next;
  function tick(now) {
    if (owner.destroyed || generation !== owner.generation) return;
    const time = (now - start) / 1000;
    if (time >= LIQUID_DURATION) { settle(owner); return; }
    const { center, velocity } = spring(time);
    const body = liquidBody(time, velocity, direction, amplitude, INTENSITY);
    const blend = smooth(time / .12);
    owner.shape = {
      center,
      width: mix(initial.width, target.width, smooth(time / .26)) + (body.width - 164) * target.width / 164 * blend,
      height: mix(initial.height, target.height, smooth(time / .12)) + (body.height - 68) * target.height / 68 * blend,
      tail: mix(initial.tail, body.tail * target.height / 68, blend),
    };
    owner.velocity = velocity;
    draw(owner);
    owner.frame = owner.requestFrame(tick);
  }
  owner.frame = owner.requestFrame(tick);
}

export function animateCoachTab(button, options) {
  animateTab(tabs, button, options);
}
