import { startServicePage } from "./service/startup.js";
import { bookingContext } from "./service/navigation.js";
export const ready = startServicePage({ role: "student", publicPage: true, publicCoachId: bookingContext(location.search), load: async () => {
  const { renderPublicProfile } = await import("./service/public-profile-page.js");
  renderPublicProfile();
} });
