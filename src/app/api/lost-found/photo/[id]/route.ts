import { NextResponse } from "next/server";
import { z } from "zod";
import { PHOTO_BUCKET } from "@/config/storage";
import { LF_ALL_ROLES } from "@/config/lost-found";
import { getCurrentProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/lost-found/photo/:id — the heavily blurred copy of a SENSITIVE item's photo (ID cards,
 * wallets, phones) for everyone who isn't the reporter or the Security Office. The real photo URL is
 * never sent to those viewers, so the blur can't be undone in the browser. Fails closed: if the
 * image can't be blurred, nothing is returned.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { profile } = await getCurrentProfile();
  if (!profile || !LF_ALL_ROLES.includes(profile.role)) return new NextResponse(null, { status: 401 });

  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) return new NextResponse(null, { status: 404 });

  const { data: item } = await createAdminClient()
    .from("lost_found_items")
    .select("photo_path, sensitive, status")
    .eq("id", id)
    .maybeSingle();
  if (!item?.photo_path || !["open", "matched", "claimed"].includes(item.status as string)) return new NextResponse(null, { status: 404 });

  try {
    const { data: file, error } = await createAdminClient().storage.from(PHOTO_BUCKET).download(item.photo_path as string);
    if (error || !file) return new NextResponse(null, { status: 404 });
    const { default: sharp } = await import("sharp");
    const blurred = await sharp(Buffer.from(await file.arrayBuffer()))
      .rotate()
      .resize({ width: 480, withoutEnlargement: true })
      .blur(28)
      .jpeg({ quality: 60 })
      .toBuffer();
    return new NextResponse(new Uint8Array(blurred), {
      headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=300" },
    });
  } catch (err) {
    console.error("[lost-found/photo]", err instanceof Error ? err.message : err);
    return new NextResponse(null, { status: 500 });
  }
}
