import { createLiquidSwitchMotion } from "../../ui/liquid-switch-motion.js";

let controller;

export function initializeBookingPeriodMotion(buttonList) {
  if (controller) return controller;
  const motion = createLiquidSwitchMotion(buttonList, {
    id: "booking-period-liquid",
    className: "booking-period-liquid",
    selectedAttribute: "aria-pressed",
    dynamicLayout: true,
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

export function animateBookingPeriod(button) {
  controller?.animate(button);
}
