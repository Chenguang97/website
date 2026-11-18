import { createControlScope } from "./control-lifecycle.js";
import { LIQUID_DURATION, clamp, smooth, mix, liquidOutline, createLiquidSpring, liquidBody, createLiquidSurface } from "./liquid-motion.js";

const owners = new WeakMap();

// Creates one self-contained liquid decoration. Business selection remains owned
// by the feature navigation that calls animate().
export function createLiquidSwitchMotion(buttonList, {
  id,
  className,
  dynamicLayout = false,
  restingCenters = [90, 270],
  restingWidth = 164,
  restingHeight = 68,
  selectedAttribute = "aria-selected",
} = {}) {
  const buttons = [...buttonList];
  if (buttons.length < 2) return null;
  const fallbackCenters = restingCenters.length >= buttons.length
    ? restingCenters
    : buttons.map((_, index) => 90 + index * 180);
  const root = buttons[0].parentElement;
  const existing = owners.get(root);
  if (existing) return existing;
  const scope = createControlScope();
  const view = root.ownerDocument.defaultView;
  // In-page controls use the current realm; foreign-document roots use theirs.
  const runtime = root.ownerDocument === globalThis.document ? globalThis : view;
  const requestFrame = runtime.requestAnimationFrame.bind(runtime);
  const cancelFrame = runtime.cancelAnimationFrame.bind(runtime);
  const addedClass = !root.classList.contains("has-liquid-switch");
  let destroyed = false;
  let generation = 0;
  const { svg, path, beads } = createLiquidSurface({ id, className });
  root.prepend(svg);
  root.classList.add("has-liquid-switch");
  const selected = Math.max(0, buttons.findIndex((button) => button.getAttribute(selectedAttribute) === "true"));
  const motion = {
    buttons, root, svg, path, beads, frame: null, target: selected, velocity: 0,
    media: view?.matchMedia?.("(prefers-reduced-motion: reduce)"),
    layout: buttons.map((_, index) => ({ center: fallbackCenters[index], width: restingWidth, height: restingHeight })),
    shape: { center: fallbackCenters[selected], width: restingWidth, height: restingHeight, tail: 0 },
    droplets: beads.map(() => ({ x: 0, y: 44, rx: 0, ry: 0 })),
  };

  function measure() {
    if (destroyed || !dynamicLayout) return false;
    const bounds = root.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return false;
    const scale = 88 / bounds.height;
    const layout = buttons.map((button) => {
      const rect = button.getBoundingClientRect();
      return {
        center: (rect.left - bounds.left + rect.width / 2) * scale,
        width: rect.width * scale,
        height: Math.min(rect.height * scale, rect.width * scale),
      };
    });
    const changed = layout.some((item, index) => Object.keys(item).some((key) => Math.abs(item[key] - motion.layout[index][key]) > .01));
    motion.layout = layout;
    svg.setAttribute("viewBox", `0 0 ${bounds.width * scale} 88`);
    return changed;
  }

  function draw() {
    if (destroyed) return;
    path.setAttribute("d", liquidOutline(motion.shape));
    beads.forEach((bead, index) => {
      const drop = motion.droplets[index];
      Object.entries({ cx: drop.x, cy: drop.y, rx: drop.rx, ry: drop.ry }).forEach(([key, value]) => bead.setAttribute(key, value));
    });
  }

  function stopFrame() {
    generation += 1;
    // Zero is a valid scheduler ID; only null means there is no owned frame.
    if (motion.frame !== null) {
      cancelFrame(motion.frame);
    }
    motion.frame = null;
  }

  function settle() {
    if (destroyed) return;
    stopFrame();
    motion.velocity = 0;
    motion.shape = { ...motion.layout[motion.target], tail: 0 };
    motion.droplets.forEach((drop) => { drop.rx = drop.ry = 0; });
    draw();
  }

  function refresh() {
    if (destroyed) return;
    if (measure() || motion.frame === null) settle();
  }

  function animate(button) {
    if (destroyed) return;
    const next = buttons.indexOf(button);
    if (next < 0 || next === motion.target || button.disabled || button.getAttribute("aria-disabled") === "true") return;
    if (measure()) settle();
    stopFrame();
    motion.target = next;
    if (motion.media?.matches) { settle(); return; }
    const initial = { ...motion.shape };
    const target = motion.layout[next];
    const oldDrops = motion.droplets.map((drop) => ({ ...drop }));
    const distance = target.center - initial.center;
    const direction = Math.sign(distance) || (next ? 1 : -1);
    const amplitude = Math.min(1, Math.abs(distance) / Math.max(1, Math.abs(motion.layout[1].center - motion.layout[0].center)));
    const start = runtime.performance.now();
    const flight = generation;
    const spring = createLiquidSpring(initial.center, target.center, motion.velocity);
    function poseAt(time) {
      const { center, velocity } = spring(time);
      const body = liquidBody(time, velocity, direction, amplitude);
      return {
        center, velocity,
        width: target.width + (body.width - 164) * target.width / 164,
        height: target.height + (body.height - 68) * target.height / 68,
        tail: body.tail * target.height / 68,
      };
    }
    function tick(now) {
      if (destroyed || flight !== generation) return;
      const elapsed = (now - start) / 1000;
      if (elapsed >= LIQUID_DURATION) { settle(); return; }
      const pose = poseAt(elapsed);
      const blend = smooth(elapsed / .12);
      const { center } = pose;
      motion.shape = {
        center,
        width: mix(initial.width, pose.width, blend),
        height: mix(initial.height, pose.height, blend),
        tail: mix(initial.tail, pose.tail, blend),
      };
      motion.velocity = pose.velocity;
      motion.droplets = oldDrops.map((old, index) => {
        const carryProgress = smooth(elapsed / .12);
        const carried = { ...old, x: mix(old.x, center, carryProgress), y: mix(old.y, 44, carryProgress) };
        const safelyInside = Math.abs(carried.x - center) + carried.rx < motion.shape.width / 2 - 8;
        if (old.rx > 0 && (elapsed === 0 || !safelyInside)) return carried;

        const birth = .34 + index * .065;
        const age = elapsed - birth;
        const progress = clamp(age / (.82 + index * .075));
        const radius = (7.5 - index * 1.5) * smooth(age / .09) * amplitude * target.height / 68;
        const birthPose = poseAt(birth);
        const origin = birthPose.center - direction * (birthPose.width / 2 + Math.abs(birthPose.tail) - radius * .6);
        const mergePoint = center - direction * (motion.shape.width / 2 - radius - 12 * target.height / 68);
        return {
          x: mix(origin, mergePoint, 1 - (1 - progress) ** 2),
          y: 44 + Math.sin(progress * Math.PI) * (index === 1 ? -2 : 2),
          rx: radius * (1 + .45 * Math.sin(progress * Math.PI)),
          ry: radius * (1 - .15 * Math.sin(progress * Math.PI)),
        };
      });
      draw();
      if (!destroyed && flight === generation) {
        motion.frame = requestFrame(tick);
      }
    }
    motion.frame = requestFrame(tick);
  }

  const controller = {
    animate,
    refresh,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      scope.destroy();
      svg.remove();
      if (owners.get(root) === controller) {
        if (addedClass) {
          root.classList.remove("has-liquid-switch");
        }
        owners.delete(root);
      }
    },
  };
  scope.add(stopFrame);
  owners.set(root, controller);
  measure();
  settle();
  if (motion.media) {
    scope.listen(motion.media, "change", () => {
      if (!destroyed && motion.media.matches) settle();
    });
  }
  if (dynamicLayout && typeof runtime.ResizeObserver === "function") {
    const observer = new runtime.ResizeObserver(refresh);
    observer.observe(root);
    scope.add(() => observer.disconnect());
  }
  return controller;
}
