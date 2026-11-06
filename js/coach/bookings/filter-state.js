let appliedStudentKeys = [];

export function getAppliedCoachBookingStudentKeys() {
  return appliedStudentKeys.slice();
}

export function hasAppliedCoachBookingStudentFilter() {
  return appliedStudentKeys.length > 0;
}

export function setAppliedCoachBookingStudentKeys(studentKeys, availableStudents = []) {
  const availableKeys = new Set(availableStudents.map((student) => student.key));
  const uniqueKeys = [...new Set(studentKeys)].filter((key) => !availableKeys.size || availableKeys.has(key));
  appliedStudentKeys = availableStudents.length && uniqueKeys.length === availableStudents.length ? [] : uniqueKeys;
  return getAppliedCoachBookingStudentKeys();
}

export function resetAppliedCoachBookingStudentKeys() {
  appliedStudentKeys = [];
}

