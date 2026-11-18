import { createLiquidSwitchMotion } from "../../ui/liquid-switch-motion.js";

let controller;

export function initializeAvailabilityMethodMotion(buttonList) {
  if (controller) return controller;
  const motion = createLiquidSwitchMotion(buttonList, {
    id: "availability-method-liquid",
    className: "availability-method-liquid",
  });
  if (!motion) return null;
  let destroyed = false;
  const handle = {
    animate(button) { motion.animate(button); },
    refresh() { motion.refresh(); },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      motion.destroy();
      if (controller === handle) controller = null;
    },
  };
  controller = handle;
  return handle;
}

export function animateAvailabilityMethod(button) {
  controller?.animate(button);
}
