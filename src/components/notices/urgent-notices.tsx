import { noticePath } from "@/lib/email/notice-notify";
import { pendingUrgentNotices, type NoticePage } from "@/lib/notices/queries";
import type { Profile } from "@/lib/types";
import { UrgentBanner } from "./urgent-banner";

/** Server wrapper: the red banner for this student's unacknowledged urgent alerts (home: all, module pages: that module). */
export async function UrgentNotices({ profile, page }: { profile: Pick<Profile, "id">; page?: NoticePage }) {
  const notices = await pendingUrgentNotices(profile, page);
  if (notices.length === 0) return null;
  return (
    <UrgentBanner
      notices={notices.map((n) => ({
        id: n.id,
        title: n.title,
        title_hi: n.title_hi,
        summary: n.summary,
        body: n.body,
        body_hi: n.body_hi,
        created_at: n.created_at,
        href: noticePath(n),
      }))}
    />
  );
}
