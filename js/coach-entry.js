import { startServicePage } from "./service/startup.js";
export const ready = startServicePage({ role: "coach", load: async () => {
  const { initializeCoachApp } = await import("./coach/app.js");
  const app = initializeCoachApp();
  const { readProfileState, readAvailabilityChanges } = await import("./core/state.js");
  return { destroy: () => app.destroy(), beforeLogout() {
    if (!readProfileState().dirty && !readAvailabilityChanges().dirty) return true;
    return window.confirm("你有尚未保存的更改，确定要放弃这些更改并切换账号吗？");
  } };
} });
