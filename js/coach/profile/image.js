// Image processing depends only on the supplied file and browser capabilities.
// The controller's signal cancels a superseded selection or disposed dialog owner.
export async function loadProfilePhoto(file, capabilities, { signal } = {}) {
  if (!file) return { ok: false, reason: "empty", message: "", clearFile: false };
  if (!file.type.startsWith("image/")) return { ok: false, reason: "type", message: "请选择图片文件。", clearFile: true };
  try {
    const photoUrl = await resizeProfilePhoto(file, capabilities, signal);
    return photoUrl === null
      ? { ok: false, reason: "aborted", message: "", clearFile: false }
      : { ok: true, photoUrl };
  } catch {
    return { ok: false, reason: "read", message: "照片读取失败，请换一张图片。", clearFile: true };
  }
}

function resizeProfilePhoto(file, { createFileReader, createImage, createCanvas }, signal) {
  return new Promise((resolve, reject) => {
    let settled = false, reader = null, image = null;
    const cleanups = [];
    const listen = (target, type, handler) => {
      target.addEventListener(type, handler);
      cleanups.push(() => target.removeEventListener(type, handler));
    };
    const finish = (complete, value) => {
      if (settled) return;
      settled = true;
      cleanups.splice(0).reverse().forEach((cleanup) => cleanup());
      complete(value);
    };
    const abort = () => {
      finish(resolve, null);
      // Remove callbacks before stopping owned work; abort/error/load may fire synchronously.
      if (reader?.readyState === 1) reader.abort();
      if (image) image.src = "";
      reader = null;
      image = null;
    };
    if (signal?.aborted) { abort(); return; }
    if (signal) listen(signal, "abort", abort);
    try {
      reader = createFileReader();
      listen(reader, "error", () => finish(reject));
      listen(reader, "load", () => {
        if (settled) return;
        image = createImage();
        listen(image, "error", () => finish(reject));
        listen(image, "load", () => {
          if (settled) return;
          const scale = Math.min(1, 520 / Math.max(image.width, image.height));
          const canvas = createCanvas();
          canvas.width = Math.max(1, Math.round(image.width * scale));
          canvas.height = Math.max(1, Math.round(image.height * scale));
          canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
          finish(resolve, canvas.toDataURL("image/jpeg", 0.82));
        });
        image.src = String(reader.result || "");
      });
      reader.readAsDataURL(file);
    } catch (error) { finish(reject, error); }
    // Callback exceptions retain the legacy pending behavior (CORRECTNESS.md).
    // Teardown still detaches these listeners and settles the cancelled request.
  });
}
