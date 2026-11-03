function applyPublicProfileBookingContext(studentPage = null) {
  const params = new URLSearchParams(location.search);
  const coachId = params.get("coach");
  if (!["maya", "alex", "sam"].includes(coachId)) return;
  const onLoginPage = location.pathname.endsWith("/student/login/index.html");
  const updateLinks = () => {
    for (const link of document.querySelectorAll("a[href]")) {
      const url = new URL(link.href, location.href);
      if (url.origin !== location.origin) continue;
      if (url.pathname.endsWith("/student/login/index.html") || onLoginPage && url.pathname.endsWith("/student/index.html")) {
        url.searchParams.set("coach", coachId);
        link.href = url.href;
      }
    }
  };
  updateLinks();
  if (onLoginPage) {
    const form = document.getElementById("studentSignupForm");
    if (form) {
      const field = document.createElement("input");
      field.type = "hidden";
      field.name = "coach";
      field.value = coachId;
      form.append(field);
    }
    return;
  }
  if (!studentPage) return;
  studentPage.activateStudentPanel("studentBookPanel", false);
  for (const input of document.querySelectorAll('input[name="studentCoachFilter"]')) input.checked = input.value === coachId;
  studentPage.updateStudentFilterSummaries();
  studentPage.renderStudentFilterChips();
  studentPage.renderStudentSlots();
  updateLinks();
}
export {
  applyPublicProfileBookingContext
};
