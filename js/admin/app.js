import { adminElements } from "../dom/admin-elements.js";
import { resetDemoData } from "./actions.js";
import { renderAdminDashboard } from "./render.js";

export function initializeAdminApp() {
  adminElements.resetDemo.addEventListener("click", resetDemoData);
  renderAdminDashboard();
}

