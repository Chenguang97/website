import { createLiquidSwitchMotion } from "../../ui/liquid-switch-motion.js";

let controller;

export function initializeBookingViewMotion(buttonList) {
  if (controller) return;
  controller = createLiquidSwitchMotion(buttonList, { id: "booking-liquid", className: "booking-view-liquid" });
}

export function animateBookingView(button) {
  controller?.animate(button);
}
