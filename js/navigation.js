function selectCalendarRink(event) {
  const button = event.target.closest("button[data-rink]");
  if (!button) return;

  elements.calendarLocationType.value = button.dataset.rink;
  renderCalendarRinkOptions();
}

function switchView(event) {
  const button = event.currentTarget;
  const viewId = button.dataset.view;

  elements.modeButtons.forEach((item) => {
    const isActive = item === button;
    item.classList.toggle("active", isActive);
    item.setAttribute("aria-selected", String(isActive));
  });

  elements.views.forEach((view) => {
    view.classList.toggle("active", view.id === viewId);
  });
}

function switchMethod(event) {
  const button = event.currentTarget;
  const method = button.dataset.method;

  elements.methodButtons.forEach((item) => {
    const isActive = item === button;
    item.classList.toggle("active", isActive);
    item.setAttribute("aria-selected", String(isActive));
  });

  elements.methodPanels.forEach((panel) => {
    panel.classList.toggle("is-hidden", panel.dataset.methodPanel !== method);
  });
}

function switchAvailabilitySection(event) {
  const button = event.currentTarget;
  const sectionId = button.dataset.availabilitySection;

  elements.availabilitySubtabs.forEach((item) => {
    const isActive = item === button;
    item.classList.toggle("active", isActive);
    item.setAttribute("aria-selected", String(isActive));
  });

  elements.availabilitySections.forEach((section) => {
    section.classList.toggle("active", section.dataset.availabilityContent === sectionId);
  });
}

function switchBookingSection(event) {
  const button = event.currentTarget;
  const sectionId = button.dataset.bookingSection;

  elements.bookingSubtabs.forEach((item) => {
    const isActive = item === button;
    item.classList.toggle("active", isActive);
    item.setAttribute("aria-selected", String(isActive));
  });

  elements.bookingSections.forEach((section) => {
    section.classList.toggle("active", section.dataset.bookingContent === sectionId);
  });
}

function activateCoachPanel(panelId, shouldPersist = true) {
  const targetPanelId = [...elements.coachTabs].some((button) => button.dataset.coachPanel === panelId) ? panelId : "profilePanel";
  document.documentElement.dataset.activeCoachPanel = targetPanelId;

  elements.coachTabs.forEach((item) => {
    const isActive = item.dataset.coachPanel === targetPanelId;
    item.classList.toggle("active", isActive);
    item.setAttribute("aria-selected", String(isActive));
  });

  elements.coachPanels.forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.coachContent === targetPanelId);
  });

  if (shouldPersist) {
    storageSetItem(activeCoachPanelStorageKey, targetPanelId);
  }
}

function switchCoachPanel(event) {
  if (!confirmDiscardProfileChanges()) return;
  activateCoachPanel(event.currentTarget.dataset.coachPanel);
}

function resetDemoData() {
  coachProfiles = createDefaultProfiles();
  slots = createDefaultSlots();
  hasUnsavedProfileChanges = false;
  unsavedAddedSlotIds.clear();
  unsavedBlockedCellKeys.clear();
  unsavedRecurringCellKeys.clear();
  unsavedBlockExceptionIds.clear();
  pendingDeletedSlots.clear();
  clearUndoHistory();
  if (!saveProfiles() || !saveSlots()) {
    showFormMessage("重置失败。浏览器存储空间不足。", true);
    return;
  }
  setProfileDirty(false);
  setAvailabilityDirty(false, "已重置示例数据");
  render();
  showFormMessage("已重置：默认周一到周五 6:00-16:00 对不限冰场可预约。");
}
