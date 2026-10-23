"use client";

import { PHOTO_MAX_BYTES } from "@/config/storage";

/**
 * Shrinks a photo in the browser to a JPEG under ~1 MB (max 1600px side).
 * Throws a friendly error if the browser can't decode the image (e.g. HEIC on Chrome).
 */
export async function compressImage(file: File, maxBytes = PHOTO_MAX_BYTES): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("This photo format isn't supported here. Please use a JPG or PNG.");
  }

  let maxSide = 1600;
  let quality = 0.82;
  for (let attempt = 0; attempt < 8; attempt++) {
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not process the photo.");
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (!blob) throw new Error("Could not process the photo.");
    if (blob.size <= maxBytes) {
      bitmap.close();
      return blob;
    }
    if (quality > 0.55) quality -= 0.12;
    else maxSide = Math.round(maxSide * 0.75);
  }
  bitmap.close();
  throw new Error("This photo is too large. Please try a smaller one.");
}
