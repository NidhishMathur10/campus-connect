import { NoticeList } from "./notice-list";
import { listNoticesForStudent, type NoticePage } from "@/lib/notices/queries";
import type { Profile } from "@/lib/types";

/** The Notices tab of a module page (Hostel or Education): that module's notices + campus-wide ones. */
export async function NoticesView({ profile, page, highlightId }: { profile: Pick<Profile, "id">; page: NoticePage; highlightId?: string }) {
  const notices = await listNoticesForStudent(profile, page);
  return <NoticeList notices={notices} highlightId={highlightId} />;
}
