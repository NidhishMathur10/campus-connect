import { ClipboardList, Megaphone, MessageCircleQuestion, MessagesSquare, Star, Wrench } from "lucide-react";
import type { ModuleTab } from "@/components/common/module-tabs";

/** Tab bars for the student Hostel and Education pages; `unread` is the unread count on the Notices tab. */
export function hostelTabs(unread: number): ModuleTab[] {
  return [
    { value: "report", label: "Report a problem", icon: Wrench, href: "/hostel" },
    { value: "notices", label: "Notices", icon: Megaphone, href: "/hostel/notices", badge: unread },
  ];
}

export function educationTabs(unread: number): ModuleTab[] {
  return [
    { value: "issues", label: "Academic Issues", icon: ClipboardList, href: "/education" },
    { value: "notices", label: "Notices", icon: Megaphone, href: "/education/notices", badge: unread },
    { value: "qa", label: "Open Q&A", icon: MessagesSquare, href: "/education?tab=qa" },
    { value: "ask", label: "Ask my teacher", icon: MessageCircleQuestion, href: "/education?tab=ask" },
    { value: "feedback", label: "Rate my teachers", icon: Star, href: "/education?tab=feedback" },
  ];
}
