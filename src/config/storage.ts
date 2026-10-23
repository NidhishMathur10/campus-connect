/** Supabase Storage bucket for complaint photos (created by supabase/schema.sql). */
export const PHOTO_BUCKET = "complaint-photos";

/** Photos are compressed in the browser to stay under this size before upload. */
export const PHOTO_MAX_BYTES = 1_000_000;
