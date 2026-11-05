export const coachSpecialtyOptions = Object.freeze([
  Object.freeze({ id: "edges", label: "滑行与用刃（Edges）" }),
  Object.freeze({ id: "spins", label: "旋转（Spins）" }),
  Object.freeze({ id: "jumps", label: "跳跃（Jumps）" }),
  Object.freeze({ id: "footwork", label: "步法（Footwork）" }),
  Object.freeze({ id: "choreography", label: "编舞（Choreography）" }),
]);

export const coachTeachingDisciplineOptions = Object.freeze([
  Object.freeze({ id: "singles", label: "单人滑" }),
  Object.freeze({ id: "pairs", label: "双人滑" }),
  Object.freeze({ id: "ice-dance", label: "冰舞" }),
  Object.freeze({ id: "synchronized", label: "同步滑" }),
]);

const coachSpecialtyIds = new Set(coachSpecialtyOptions.map((option) => option.id));
const coachSpecialtyLabels = new Set(coachSpecialtyOptions.map((option) => option.label.toLocaleLowerCase()));
const coachTeachingDisciplineIds = new Set(coachTeachingDisciplineOptions.map((option) => option.id));

export const customCoachSpecialtyMaxLength = 30;

export function normalizeCoachSpecialties(values) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.filter((value) => typeof value === "string" && coachSpecialtyIds.has(value)))];
}

export function normalizeCoachTeachingDisciplines(values) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.filter((value) => typeof value === "string" && coachTeachingDisciplineIds.has(value)))];
}

export function getCoachTeachingDisciplineLabels(values) {
  const selected = new Set(normalizeCoachTeachingDisciplines(values));
  return coachTeachingDisciplineOptions.filter((option) => selected.has(option.id)).map((option) => option.label);
}

export function normalizeStartYear(value, currentYear = new Date().getFullYear()) {
  if (value === "" || value === null || value === undefined) return null;
  const year = Number(value);
  return Number.isInteger(year) && year >= 1900 && year <= currentYear ? year : null;
}

export function normalizeCustomCoachSpecialties(values) {
  if (!Array.isArray(values)) return [];
  const normalized = [];
  const seen = new Set();
  for (const value of values) {
    if (typeof value !== "string") continue;
    const specialty = value.trim().slice(0, customCoachSpecialtyMaxLength);
    const key = specialty.toLocaleLowerCase();
    if (!specialty || seen.has(key) || coachSpecialtyLabels.has(key)) continue;
    seen.add(key);
    normalized.push(specialty);
  }
  return normalized;
}

export function getCoachSpecialtyLabels(values, customValues = []) {
  const selected = new Set(normalizeCoachSpecialties(values));
  return [
    ...coachSpecialtyOptions.filter((option) => selected.has(option.id)).map((option) => option.label),
    ...normalizeCustomCoachSpecialties(customValues),
  ];
}
