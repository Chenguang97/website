import { coaches, currentCoachId, profileStorageKey, studentHasFullAccess } from "./core/config.js";
import { loadProfiles } from "./core/data-store.js";
import { createDefaultProfile } from "./core/demo-data.js";
import { storageGetItem } from "./core/storage-adapter.js";
import {
  getCoachSpecialtyLabels,
  getCoachTeachingDisciplineLabels,
} from "./domain/coach-profile.mjs";
const coachProfiles = loadProfiles();
function getProfile(coachId) {
  return coachProfiles[coachId] || createDefaultProfile(coachId);
}
(() => {
  const params = new URLSearchParams(location.search);
  const coachId = params.get("coach") || currentCoachId;
  const coach = coaches.find((item) => item.id === coachId);
  const byId = (id) => document.getElementById(id);
  if (!coach) {
    byId("dataNote").hidden = true;
    byId("profileError").hidden = false;
    byId("profileError").textContent = "未找到这位教练的资料。请返回首页或前往预约页选择其他教练。";
    return;
  }
  const profile = getProfile(coachId);
  const disciplines = getCoachTeachingDisciplineLabels(profile.teachingDisciplines);
  const specialties = getCoachSpecialtyLabels(profile.specialties, profile.selectedCustomSpecialties);
  const bookingUrl = new URL("../student/index.html", location.href);
  bookingUrl.searchParams.set("coach", coach.id);
  if (studentHasFullAccess) bookingUrl.searchParams.set("access", "full");
  const loginUrl = new URL("../student/login/index.html", location.href);
  loginUrl.searchParams.set("coach", coach.id);
  byId("bookCoach").href = bookingUrl.href;
  byId("navBookCoach").href = bookingUrl.href;
  byId("profileLogin").href = loginUrl.href;
  if (studentHasFullAccess) {
    byId("profileLogin").textContent = "进入预约";
    byId("profileLogin").href = bookingUrl.href;
    byId("bookingHelp").textContent = "进入完整课表，选择上课时间。";
  }
  document.title = `${coach.name} · ${disciplines.length ? disciplines.join("、") : "教练"} · 冰场预约`;
  byId("coachName").textContent = coach.name;
  byId("coachDisciplines").textContent = disciplines.join("、");
  byId("coachDisciplines").hidden = !disciplines.length;
  byId("coachInitials").textContent = coach.name.split(/\s+/).map((part) => part[0]).slice(0, 2).join("");
  const saved = storageGetItem(profileStorageKey);
  let isSaved = false;
  try {
    isSaved = Boolean(saved && JSON.parse(saved)[coach.id]);
  } catch {
  }
  byId("dataNote").textContent = isSaved ? "当前站点保存资料 · 资历待核实" : "本地示例资料 · 待教练确认";
  const bio = typeof profile.bio === "string" ? profile.bio.trim() : "";
  byId("coachBio").textContent = bio;
  byId("aboutCoach").hidden = !bio;
  byId("aboutCoachNav").hidden = !bio;
  byId("teachingSpecialties").hidden = !specialties.length;
  byId("teachingSpecialtiesNav").hidden = !specialties.length;
  for (const specialty of specialties) {
    const chip = document.createElement("span");
    chip.textContent = specialty;
    byId("coachSpecialties").append(chip);
  }
  const firstVisibleSection = bio ? "aboutCoach" : specialties.length ? "teachingSpecialties" : "teachingRinks";
  byId("profileDetailsLink").href = `#${firstVisibleSection}`;
  const firstVisibleNav = document.querySelector(".section-nav a:not([hidden])");
  firstVisibleNav?.classList.add("active");
  const photo = byId("coachPhoto");
  if (typeof profile.photoUrl === "string" && profile.photoUrl.trim()) {
    try {
      const url = new URL(profile.photoUrl, location.href);
      const allowed = ["http:", "https:", "file:"].includes(url.protocol) || /^data:image\/(png|jpe?g|webp|gif);base64,/i.test(profile.photoUrl);
      if (allowed) {
        photo.alt = `${coach.name}的教练照片`;
        photo.addEventListener("load", () => {
          photo.hidden = false;
          byId("portraitFallback").hidden = true;
        });
        photo.addEventListener("error", () => {
          photo.hidden = true;
          byId("portraitFallback").hidden = false;
        });
        photo.src = url.href;
      }
    } catch {
    }
  }
  for (const rink of profile.servedRinks || []) {
    const item = document.createElement("li");
    item.textContent = rink;
    byId("coachRinks").append(item);
  }
  if (!byId("coachRinks").children.length) byId("coachRinks").textContent = "服务冰场暂未提供。";
  const travelConditions = typeof profile.travelConditions === "string" ? profile.travelConditions.trim() : "";
  byId("travelNote").textContent = profile.travelsToOtherRinks
    ? `其他冰场授课：可协商。${travelConditions ? ` ${travelConditions}` : ""}`
    : "其他冰场授课：不接受。";
  const lessons = Array.isArray(profile.lessonOptions) ? profile.lessonOptions : [];
  for (const lesson of lessons) {
    const row = document.createElement("li");
    const detail = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = String(lesson.name || "私教课程").replace(/(\d+) min private lesson/, "$1 分钟私教");
    const duration = document.createElement("small");
    duration.textContent = Number(lesson.duration) > 0 ? `${Number(lesson.duration)} 分钟 / 次` : "时长暂未提供";
    detail.append(title, duration);
    const price = document.createElement("span");
    price.className = "lesson-price";
    if (lesson.price !== null && lesson.price !== "" && Number.isFinite(Number(lesson.price)) && Number(lesson.price) >= 0) {
      const currency = document.createElement("small");
      currency.textContent = "$";
      price.append(currency, Number(lesson.price).toLocaleString("en-US", { maximumFractionDigits: 2 }));
    } else {
      price.textContent = "价格待提供";
      price.style.fontSize = "12px";
    }
    row.append(detail, price);
    byId("publicLessons").append(row);
  }
  if (!lessons.length) byId("publicLessons").textContent = "课程时长和价格暂未提供。";
  byId("profileLayout").hidden = false;
})();
