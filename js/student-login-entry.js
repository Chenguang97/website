import { initializeAuthPage } from "./service/auth-page.js";
export const authController = initializeAuthPage({ role: "student" });
export const ready = authController.ready;
