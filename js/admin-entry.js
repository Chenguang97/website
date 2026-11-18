import { startServicePage } from "./service/startup.js";
export const ready = startServicePage({ role: "admin", load: async () => {
  const { initializeAdminApp } = await import("./admin/app.js");
  return initializeAdminApp();
} });
