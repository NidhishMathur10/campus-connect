import "server-only";
import { PHOTO_BUCKET } from "@/config/storage";
import { createAdminClient } from "@/lib/supabase/admin";

/** Fetches an uploaded complaint photo as base64 for Gemini. Null if it can't be read. */
export async function downloadComplaintPhoto(
  path: string,
): Promise<{ base64: string; mimeType: string } | null> {
  try {
    const { data, error } = await createAdminClient().storage.from(PHOTO_BUCKET).download(path);
    if (error || !data) {
      console.error("[photos] download failed", error?.message);
      return null;
    }
    const base64 = Buffer.from(await data.arrayBuffer()).toString("base64");
    return { base64, mimeType: data.type || "image/jpeg" };
  } catch (err) {
    console.error("[photos]", err);
    return null;
  }
}

/** Public URL for a stored photo (the bucket is public-read; file names are random). */
export function photoPublicUrl(path: string): string {
  return createAdminClient().storage.from(PHOTO_BUCKET).getPublicUrl(path).data.publicUrl;
}
