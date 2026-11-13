import { createLiquidSwitchMotion } from "../../ui/liquid-switch-motion.js";

let controller;

export function initializeBookingPeriodMotion(buttonList) {
  if (controller) return;
  controller = createLiquidSwitchMotion(buttonList, {
    id: "booking-period-liquid",
    className: "booking-period-liquid",
    selectedAttribute: "aria-pressed",
  });
}

export function animateBookingPeriod(button) {
  controller?.animate(button);
}
