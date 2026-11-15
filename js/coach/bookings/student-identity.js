export function getCoachBookingStudentKey(item) {
  const studentId = String(item?.student?.id || "").trim();
  if (studentId) return `id:${studentId}`;
  const email = String(item?.student?.email || "").trim().toLocaleLowerCase();
  if (email) return `email:${email}`;
  return `legacy:${String(item?.student?.name || "学生（未填写姓名）").trim().toLocaleLowerCase()}`;
}
