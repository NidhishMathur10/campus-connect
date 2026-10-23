import { requireProfile } from "@/lib/auth";

/** Every student page except the home route needs a signed-in student. */
export default async function StudentAppLayout({ children }: { children: React.ReactNode }) {
  await requireProfile(["student"]);
  return children;
}
