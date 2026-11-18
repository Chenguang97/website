import { renderAdminDashboard } from "./render.js";
import * as owner from "../core/state.js";
import { exportSavedLocalApplicationData } from "../core/data-store.js";
import { coaches } from "../core/config.js";
import * as operations from "../service/operations.js";
import { productClient, readServiceContext } from "../service/runtime.js";

export function resetDemoData() {
  if (owner.readServiceOwnerState?.().service) return { ok: false, reason: "service", resetApplied: false };
  const result = owner.resetDemoApplicationData();
  if (result.ok === true) renderAdminDashboard();
  return result;
}
export function createAdminServicePort() {
  return Object.freeze({
    readProjection: () => owner.readConfirmedServiceProjection(),
    readIdentity: () => ({ ...owner.readServiceOwnerState(), role: productClient.readSession()?.user?.role,
      reloadRequired: readServiceContext().reloadRequired }),
    execute: (type, payload) => operations.executeServiceCommand(type, payload),
    saveProfile: input => operations.saveAdminCoachProfile(input),
    retry: receipt => operations.retryServiceOperation(receipt),
    refresh: () => operations.refreshServiceState(),
    reload: () => location.reload(),
  });
}

export function downloadLocalBackup(documentRoot = document) {
  const result = exportSavedLocalApplicationData();
  if (result.ok !== true) return result;
  const win = documentRoot.defaultView;
  if (!win?.URL?.createObjectURL) return { ok: false, code: "download-unavailable", message: "此浏览器暂不支持下载，请换用支持文件下载的浏览器；原资料未修改。" };
  const packet = { ...result.backup, displayNames: { coaches: Object.fromEntries(coaches.map(coach => [coach.id, coach.name])) } };
  const file = new win.Blob([JSON.stringify(packet, null, 2)], { type: "application/json" });
  const url = win.URL.createObjectURL(file), link = documentRoot.createElement("a");
  link.href = url; link.download = `icecoach-local-backup-${result.backup.exportedAt.slice(0,10)}.json`; link.hidden = true;
  try {
    documentRoot.body.append(link);
    link.click();
  } catch (error) {
    win.URL.revokeObjectURL(url);
    throw error;
  } finally { link.remove(); }
  let released = false;
  const release = () => { if (!released) { released = true; win.URL.revokeObjectURL(url); } };
  const timer = win.setTimeout(release, 1000);
  return { ok: true, readyForImport: result.readyForImport,
    message: result.readyForImport ? "备份已准备并开始下载。请确认文件已保存；其中包含私密联系人和照片。" : "已准备含原文的备份，但部分记录需要核对，暂不能直接导入。请保管文件。",
    dispose() { win.clearTimeout(timer); release(); } };
}
