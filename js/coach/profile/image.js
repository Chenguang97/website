import { coachElements as elements } from "../../dom/coach-elements.js";

export function handlePhotoFileChange() {
  const file = elements.coachPhotoFile.files?.[0];
  if (!file) return Promise.resolve("");
  if (!file.type.startsWith("image/")) {
    elements.photoMessage.textContent = "请选择图片文件。";
    elements.photoMessage.style.color = "var(--red)";
    elements.coachPhotoFile.value = "";
    return Promise.resolve("");
  }

  return readResizedImage(file).catch(() => {
    elements.photoMessage.textContent = "照片读取失败，请换一张图片。";
    elements.photoMessage.style.color = "var(--red)";
    elements.coachPhotoFile.value = "";
    return "";
  });
}

export function readResizedImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("error", reject);
    reader.addEventListener("load", () => {
      const image = new Image();
      image.addEventListener("error", reject);
      image.addEventListener("load", () => {
        const maxSize = 520;
        const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      });
      image.src = String(reader.result || "");
    });
    reader.readAsDataURL(file);
  });
}
