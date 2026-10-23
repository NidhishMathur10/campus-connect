import type { Metadata } from "next";
import { PublicTrackCard } from "@/components/tickets/public-track-card";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Log in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return (
    <div className="space-y-6">
      <LoginForm next={next} />
      <PublicTrackCard compact />
    </div>
  );
}
