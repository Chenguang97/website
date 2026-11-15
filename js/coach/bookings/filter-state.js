let appliedStudentKeys = [];
let activeScope = "records";
const scopeSelections = { records: [], requests: [], requestHistory: [] };

export function selectCoachBookingFilterScope(scope, { inheritFrom = null } = {}) {
  if (scope === activeScope) return;
  scopeSelections[activeScope] = appliedStudentKeys.slice();
  if (inheritFrom) scopeSelections[scope] = getAppliedCoachBookingStudentKeys(inheritFrom);
  activeScope = scope;
  appliedStudentKeys = scopeSelections[scope].slice();
}

export function getAppliedCoachBookingStudentKeys(scope = activeScope) {
  return (scope === activeScope ? appliedStudentKeys : scopeSelections[scope]).slice();
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

export function clearAppliedCoachBookingStudentKeys() {
  appliedStudentKeys = [];
  return getAppliedCoachBookingStudentKeys();
}

