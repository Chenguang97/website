import { productClient, readServiceContext } from "./service/runtime.js";
import { bookingContext, applyServiceBookingContext } from "./service/navigation.js";
import { startServicePage } from "./service/startup.js";
export const ready = startServicePage({ role: "student", load: async () => {
  const [{ initializeStudentApp }, { activateStudentPanel }, { applyPublicProfileBookingContext }, { refreshStudentCalendar }, { selectStudentCoach }] = await Promise.all([
    import("./student/app.js"), import("./student/navigation.js"), import("./profile-booking-context.js"), import("./student/calendar-controller.js"), import("./student/filter-controls.js"),
  ]);
  const app = initializeStudentApp();
  const page = { activateStudentPanel, selectCoach: selectStudentCoach, refreshCalendar: refreshStudentCalendar };
  if (readServiceContext().service) applyServiceBookingContext(bookingContext(location.search), productClient.readBootstrap()?.data.coachProfiles || {}, page);
  else applyPublicProfileBookingContext(page);
  return app;
} });
