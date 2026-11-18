import { selectElements } from "./select-elements.js";
export const adminElements = selectElements({
  root: "main.app-shell", resetDialog: "#adminResetDialog", resetConfirm: "#adminResetConfirm", resetCancel: "#adminResetCancel", adminBookedCount: "#adminBookedCount", adminCoachCount: "#adminCoachCount",
  adminRinkCount: "#adminRinkCount", availableCount: "#availableCount", bookedCount: "#bookedCount",
  resetDemo: "#resetDemo", exportLocal: "#adminExportLocal", exportStatus: "#adminExportStatus", resetReceipt: "#adminResetReceipt", localNotice: "#adminLocalNotice",
});
