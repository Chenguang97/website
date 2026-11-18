import { createControlScope } from "../ui/control-lifecycle.js";
import { adminElements } from "../dom/admin-elements.js";
import * as owner from "../core/state.js";
import { resetDemoData, createAdminServicePort, downloadLocalBackup } from "./actions.js";
import { renderAdminDashboard } from "./render.js";
import { createAdminProductController } from "./product-controller.js";
let controller = null;
export function initializeAdminApp() {
  if (controller) return controller;
  const scope = createControlScope();
  let destroyed = false, product = null;
  const service = owner.readServiceOwnerState?.().service === true;
  if (service) {
    try { product = createAdminProductController({ root: adminElements.root, port: createAdminServicePort() }); }
    catch {
      adminElements.localNotice.textContent = "管理员服务接口未能接通。请重新载入后重试；没有切换到本地示例。";
      adminElements.resetDemo.hidden = true; adminElements.resetDemo.disabled = true;
    }
  } else {
    renderAdminDashboard();
    scope.listen(adminElements.exportLocal, "click", () => {
      adminElements.exportLocal.disabled = true;
      try {
        const receipt = downloadLocalBackup(adminElements.root.ownerDocument);
        adminElements.exportStatus.textContent = receipt.message;
        if (receipt.dispose) scope.add(receipt.dispose);
      } catch { adminElements.exportStatus.textContent = "备份未能下载，原资料未修改。请重试。"; }
      finally { if (!destroyed) adminElements.exportLocal.disabled = false; }
    });
    const dialog = adminElements.resetDialog;
    const cancelReset = () => { if (dialog.open) dialog.close(); adminElements.resetReceipt.textContent = "已取消，未恢复示例。"; adminElements.resetDemo.focus(); };
    scope.listen(adminElements.resetDemo, "click", () => {
      try { dialog.showModal(); adminElements.resetCancel.focus(); }
      catch { adminElements.resetReceipt.textContent = "未能打开确认窗口，未恢复示例。请先保管备份。"; }
    });
    scope.listen(adminElements.resetCancel, "click", cancelReset);
    scope.listen(dialog, "cancel", event => { event.preventDefault(); cancelReset(); });
    scope.listen(adminElements.resetConfirm, "click", () => {
      if (!dialog.open) return;
      dialog.close();
      const result = resetDemoData();
      adminElements.resetReceipt.textContent = result.ok === true ? "已恢复本地示例并保存。原资料请从您已下载的备份核对。"
        : result.resetApplied ? "已尝试恢复示例，但部分内容未能保存，当前页面和下次打开的资料可能不同。请保管备份并检查后重试。" : "未执行示例重置。";
      adminElements.resetDemo.focus();
    });
    scope.add(() => { if (dialog.open) dialog.close(); });
  }
  const ready = Promise.resolve(product);
  controller = Object.freeze({ ready, destroy() {
    if (destroyed) return;
    destroyed = true; product?.destroy(); scope.destroy(); controller = null;
  } });
  scope.listen(window, "pagehide", () => controller?.destroy());
  return controller;
}
