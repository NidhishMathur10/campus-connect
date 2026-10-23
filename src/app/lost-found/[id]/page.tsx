import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { ItemDetailView } from "@/components/lost-found/item-detail";
import { LF_ALL_ROLES } from "@/config/lost-found";
import { requireProfile } from "@/lib/auth";
import { loadItemDetail } from "@/lib/lost-found/queries";

export const metadata: Metadata = { title: "Lost & Found item" };

export default async function LostFoundItemPage({ params }: { params: Promise<{ id: string }> }) {
  const profile = await requireProfile(LF_ALL_ROLES);
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const detail = await loadItemDetail(id, { id: profile.id, role: profile.role });
  if (!detail) notFound();
  return <ItemDetailView detail={detail} />;
}
