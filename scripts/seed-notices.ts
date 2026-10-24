/**
 * Notice board seed (CLAUDE.md §23), called from seed.ts: one pinned hostel notice, one urgent alert,
 * one known issue, one academic notice with a PDF, one event; each with a Hindi version.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { DEMO_ACCOUNTS } from "../src/config/demo-accounts";
import { audienceMatchesProfile, type NoticeAudience, type NoticeModule, type NoticeType } from "../src/config/notices";
import type { Role } from "../src/config/roles";

const H = 3600_000;
const D = 24 * H;
const IST = 5.5 * H;

type SeededUser = { id: string; name: string; role: Role };

/** Today (IST) at the given hour, plus whole days, as a UTC Date. */
function istAt(hour: number, addDays = 0): Date {
  const ist = new Date(Date.now() + IST);
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate() + addDays, hour, 0) - IST);
}

/** A small valid one-page PDF (with a real xref table) used as the timetable placeholder. */
function placeholderPdf(lines: string[]): Buffer {
  const text = lines
    .map((l, i) => `BT /F1 ${i === 0 ? 20 : 12} Tf 60 ${780 - i * 26} Td (${l.replace(/[()\\]/g, "")}) Tj ET`)
    .join("\n");
  const objects = [
    "<</Type/Catalog/Pages 2 0 R>>",
    "<</Type/Pages/Kids[3 0 R]/Count 1>>",
    "<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>",
    `<</Length ${text.length}>>\nstream\n${text}\nendstream`,
    "<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((o, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("");
  pdf += `trailer\n<</Root 1 0 R/Size ${objects.length + 1}>>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, "latin1");
}

interface SeedNotice {
  key: string;
  by: string;
  module: NoticeModule;
  type: NoticeType;
  title: string;
  title_hi: string;
  body: string;
  body_hi: string;
  summary: string;
  category?: string;
  audience: NoticeAudience;
  pinned?: boolean;
  hoursAgo: number;
  expires: Date;
  event_at?: Date;
  expected_fix_at?: Date;
  attachment?: boolean;
}

function must<T>(result: { data: T; error: { message: string } | null }, what: string): T {
  if (result.error) throw new Error(`${what}: ${result.error.message}`);
  return result.data;
}

export async function seedNotices(db: SupabaseClient, u: (loginId: string) => SeededUser) {
  const now = Date.now();
  const fix = istAt(18).getTime() > now + 0.5 * H ? istAt(18) : new Date(now + 4 * H);
  const sportsDay = istAt(9, 5);

  const NOTICES: SeedNotice[] = [
    {
      key: "fees", by: "rao", module: "hostel", type: "notice", pinned: true, hoursAgo: 30,
      title: "Hostel fee deadline: pay by 31 October",
      title_hi: "हॉस्टल फीस की अंतिम तिथि: 31 अक्टूबर तक जमा करें",
      body: "The last date to pay the hostel fee for this term is 31 October. Pay at the accounts office between 10 AM and 4 PM, or online through the college portal. A late fee applies after the deadline.\nBring your college ID card when paying at the office.",
      body_hi: "इस सत्र की हॉस्टल फीस जमा करने की अंतिम तिथि 31 अक्टूबर है। फीस अकाउंट्स ऑफिस में सुबह 10 से शाम 4 बजे के बीच या कॉलेज पोर्टल पर ऑनलाइन जमा करें। अंतिम तिथि के बाद लेट फीस लगेगी।\nऑफिस में फीस जमा करते समय अपना कॉलेज आईडी कार्ड साथ लाएँ।",
      summary: "Hostel fee for this term must be paid by 31 October.",
      audience: { all: true },
      expires: new Date(now + 10 * D),
    },
    {
      key: "power", by: "iyer", module: "all", type: "urgent", hoursAgo: 1,
      title: "Power shutdown in Block C, 2–4 PM today",
      title_hi: "आज दोपहर 2 से 4 बजे ब्लॉक C में बिजली बंद रहेगी",
      body: "Electricity in Block C will be switched off from 2 PM to 4 PM today for urgent line maintenance. Classes and labs in Block C may shift to Block B. Please save your work and charge your devices beforehand.",
      body_hi: "ज़रूरी लाइन मेंटेनेंस के लिए आज दोपहर 2 से 4 बजे तक ब्लॉक C में बिजली बंद रहेगी। ब्लॉक C की कक्षाएँ और लैब ब्लॉक B में शिफ्ट हो सकती हैं। कृपया अपना काम सेव कर लें और डिवाइस पहले से चार्ज कर लें।",
      summary: "No power in Block C from 2 PM to 4 PM today; classes may move to Block B.",
      audience: { all: true },
      expires: new Date(now + 12 * H),
    },
    {
      key: "water", by: "rao", module: "hostel", type: "known_issue", category: "Water Supply", hoursAgo: 2,
      title: "No water supply: New Hostel 2nd to 5th floor",
      title_hi: "पानी की सप्लाई बंद: न्यू हॉस्टल दूसरी से पाँचवीं मंज़िल",
      body: "Water supply is off on the 2nd to 5th floors of New Hostel because of a broken main pipe. The Estate team is repairing it. Tanker water is kept near the ground-floor water cooler. Expected to be fixed by 6 PM today.",
      body_hi: "मुख्य पाइप टूटने के कारण न्यू हॉस्टल की दूसरी से पाँचवीं मंज़िल पर पानी की सप्लाई बंद है। एस्टेट टीम मरम्मत कर रही है। टैंकर का पानी ग्राउंड फ्लोर के वॉटर कूलर के पास रखा गया है। आज शाम 6 बजे तक ठीक होने की उम्मीद है।",
      summary: "Main pipe repair in progress; expected fix by 6 PM today.",
      audience: { buildings: ["New Hostel"], floors: ["2nd", "3rd", "4th", "5th"] },
      expires: new Date(now + 2 * D),
      expected_fix_at: fix,
    },
    {
      key: "timetable", by: "kapoor", module: "academic", type: "notice", hoursAgo: 20,
      title: "Mid-semester exam timetable released",
      title_hi: "मिड-सेमेस्टर परीक्षा समय-सारणी जारी",
      body: "The mid-semester examination timetable is attached. Exams start on Monday 3 November at 10 AM in your regular classrooms. Carry your college ID card; no student is allowed in without it.\nClashes with another paper must be reported to the Academic Office by Friday.",
      body_hi: "मिड-सेमेस्टर परीक्षा की समय-सारणी संलग्न है। परीक्षाएँ सोमवार 3 नवंबर को सुबह 10 बजे आपकी नियमित कक्षाओं में शुरू होंगी। कॉलेज आईडी कार्ड साथ रखें; इसके बिना प्रवेश नहीं मिलेगा।\nकिसी और पेपर से टकराव हो तो शुक्रवार तक अकादमिक कार्यालय को बताएँ।",
      summary: "Mid-sem exams start Monday 3 November at 10 AM; timetable attached.",
      audience: { all: true },
      expires: new Date(now + 14 * D),
      attachment: true,
    },
    {
      key: "sports", by: "iyer", module: "all", type: "event", hoursAgo: 40,
      title: "Annual Sports Day at the Sports Complex",
      title_hi: "स्पोर्ट्स कॉम्प्लेक्स में वार्षिक खेल दिवस",
      body: "Annual Sports Day will be held at the Sports Complex. Track events begin at 9 AM, followed by team games and the prize distribution. Register for your events at the Sports Complex office by the day before. Everyone is welcome to cheer.",
      body_hi: "वार्षिक खेल दिवस स्पोर्ट्स कॉम्प्लेक्स में आयोजित होगा। ट्रैक इवेंट सुबह 9 बजे शुरू होंगे, उसके बाद टीम गेम और पुरस्कार वितरण होगा। अपने इवेंट के लिए एक दिन पहले तक स्पोर्ट्स कॉम्प्लेक्स ऑफिस में पंजीकरण करें। सभी का स्वागत है।",
      summary: "Sports Day at the Sports Complex, starting 9 AM.",
      audience: { all: true },
      expires: new Date(sportsDay.getTime() + 6 * H),
      event_at: sportsDay,
    },
  ];

  const ids = new Map<string, string>();
  for (const n of NOTICES) {
    const author = u(n.by);
    let attachment_url: string | null = null;
    if (n.attachment) {
      const path = `${author.id}/seed-midsem-timetable.pdf`;
      const pdf = placeholderPdf([
        "Mid-Semester Examination Timetable",
        "Placeholder PDF for the demo",
        "Mon 3 Nov  10:00  Mathematics",
        "Tue 4 Nov  10:00  Physics",
        "Wed 5 Nov  10:00  Programming",
        "Thu 6 Nov  10:00  Basic Electrical",
        "Fri 7 Nov  10:00  Communication Skills",
      ]);
      const up = await db.storage.from("notice-attachments").upload(path, pdf, { contentType: "application/pdf", upsert: true });
      if (up.error) console.warn(`! Could not upload the timetable PDF (${up.error.message}). Did you re-run schema.sql?`);
      else attachment_url = db.storage.from("notice-attachments").getPublicUrl(path).data.publicUrl;
    }
    const created = new Date(now - n.hoursAgo * H).toISOString();
    const row = must(
      await db
        .from("notices")
        .insert({
          author_id: author.id,
          author_name: author.name,
          author_role: author.role,
          module: n.module,
          type: n.type,
          title: n.title,
          title_hi: n.title_hi,
          body: n.body,
          body_hi: n.body_hi,
          summary: n.summary,
          category: n.category ?? null,
          audience: n.audience,
          attachment_url,
          event_at: n.event_at?.toISOString() ?? null,
          expected_fix_at: n.expected_fix_at?.toISOString() ?? null,
          pinned: n.pinned ?? false,
          expires_at: n.expires.toISOString(),
          created_at: created,
        })
        .select("id")
        .single(),
      `notice ${n.key}`,
    )!;
    ids.set(n.key, row.id);
    must(
      await db.from("notice_log").insert({ notice_id: row.id, actor_id: author.id, actor_name: author.name, action: "posted", detail: `${n.type} · ${n.title}`, created_at: created }),
      "notice log",
    );
  }

  // A few reads so the poster view has numbers, and one follower on the known issue.
  const read = (key: string, login: string, acknowledged: boolean) => ({ notice_id: ids.get(key)!, user_id: u(login).id, acknowledged });
  must(
    await db.from("notice_reads").insert([
      read("fees", "2616400102", true),
      read("fees", "2616400103", false),
      read("fees", "2616400104", true),
      read("timetable", "2616400102", true),
      read("sports", "2616400103", false),
      read("water", "2616400105", true),
    ]),
    "notice reads",
  );
  must(await db.from("notice_followers").insert({ notice_id: ids.get("water")!, user_id: u("2616400105").id }), "notice follower");
  must(
    await db.from("notice_log").insert({ notice_id: ids.get("water")!, actor_id: u("2616400105").id, actor_name: "Vikram Joshi", action: "me_too", detail: "2616400105 follows this known issue" }),
    "notice log",
  );

  // Bell notifications for the quick-login students each audience covers.
  const students = DEMO_ACCOUNTS.filter((a) => a.role === "student" && !a.hidden);
  const bell = NOTICES.flatMap((n) =>
    students
      .filter((s) => audienceMatchesProfile(n.audience, { hostel: s.hostel ?? null, wing: s.wing ?? null, room: s.room ?? null }))
      .map((s) => ({
        user_id: u(s.loginId).id,
        kind: "notice",
        title: n.type === "urgent" ? `Urgent: ${n.title}` : n.type === "known_issue" ? `Known issue: ${n.title}` : `New ${n.type}: ${n.title}`,
        body: n.summary,
        link: `${n.module === "academic" ? "/education/notices" : "/hostel/notices"}?n=${ids.get(n.key)}`,
        created_at: new Date(now - n.hoursAgo * H).toISOString(),
      })),
  );
  must(await db.from("notifications").insert(bell), "notice notifications");
  console.log("✔ 5 notices (1 pinned, 1 urgent, 1 known issue, 1 academic with PDF, 1 event), each with a Hindi version");
}
