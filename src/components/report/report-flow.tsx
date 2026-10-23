"use client";

import { useEffect, useRef, useState } from "react";
import { MapPin } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { CLASS_DISRUPTION_REASON, mentionsUpcomingClass, type ReporterAudience } from "@/config/faculty";
import { isHostelBuilding, normaliseRoom } from "@/config/locations";
import { getRoutingRule, type TicketModule } from "@/config/routing";
import { PHOTO_BUCKET } from "@/config/storage";
import type {
  AnalyzeRequest,
  AnalyzeResponse,
  ComplaintAnalysis,
  ComplaintLocation,
  DuplicateMatch,
  DuplicateRequest,
  DuplicateResponse,
} from "@/lib/ai/complaint";
import { formatLocation } from "@/lib/format";
import { createTicket, followTicket } from "@/lib/tickets/actions";
import { AiThinking, Bubble, ChatReply } from "./chat";
import { SimilarTicketCard } from "./similar-ticket-card";
import { PreviewCard, type TicketDraft } from "./preview-card";
import { hostelDraft, type OwnRoom } from "./hostel-place";
import { EMPTY_DRAFT, ReportForm, type ReportDraft } from "./report-form";
import { SuccessCard } from "./success-card";

type Phase = "form" | "chat" | "preview" | "success";

/** What the duplicate check found, and which path (Gemini or keyword fallback) produced it. */
type DupResult = { match: DuplicateMatch | null; method: "gemini" | "keyword"; model: string | null };

const HAZARD_WORDS = /spark|short.?circuit|fire|smoke|burning|gas smell|exposed wire|current|shock|करंट|आग|धुआ|चिंगारी/i;
const DEVANAGARI = /[ऀ-ॿ]/;

async function postJson<T>(url: string, body: unknown, timeoutMs: number): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Hostel buildings store a room number OR a common area; everything else keeps the free-text spot. */
function locationOf(d: ReportDraft, module: TicketModule): ComplaintLocation {
  if (module === "hostel" && isHostelBuilding(d.building)) {
    if (d.place === "room") {
      return { building: d.building, floor: d.floor, room_no: normaliseRoom(d.room), spot: null, machine_id: null };
    }
    const detail = d.spot.trim();
    const spot = d.area === "Other" ? (detail ? `Other: ${detail}` : "Other") : d.area;
    return {
      building: d.building,
      floor: d.floor,
      room_no: null,
      spot,
      machine_id: d.area === "Laundry machine" ? d.machineId : null,
    };
  }
  return { building: d.building, floor: d.floor, room_no: null, spot: d.spot.trim() || null, machine_id: d.machineId };
}

function draftFromAnalysis(a: ComplaintAnalysis): TicketDraft {
  return {
    is_emergency: a.is_emergency,
    confidential_choice: true,
    hide_identity: false,
    title: a.title,
    summary: a.summary,
    extracted_issue: a.extracted_issue,
    english_text: a.english_text,
    language: a.language,
    category: a.category,
    department: a.department,
    priority: a.priority,
    is_safety_hazard: a.is_safety_hazard,
    scope: a.scope,
    photo_analysis: a.photo_analysis,
    location: a.location,
    missing_fields: a.missing_fields,
    ai: { category: a.category, confidence: a.confidence, reasons: a.reasons },
  };
}

/** Used when the AI is unavailable: the reporter picks the category by hand. */
function manualDraft(d: ReportDraft, module: TicketModule, audience: ReporterAudience): TicketDraft {
  const text = d.text.trim();
  const location = locationOf(d, module);
  const hazard = module !== "security" && HAZARD_WORDS.test(text);
  // Faculty with a class happening now or soon: at least High, same as the AI rule.
  const classSoon = audience === "faculty" && mentionsUpcomingClass(text);
  return {
    is_emergency: false,
    confidential_choice: true,
    hide_identity: false,
    title: text.split(/\s+/).slice(0, 8).join(" "),
    summary: text,
    extracted_issue: "",
    english_text: null,
    language: DEVANAGARI.test(text) ? "hi" : "en",
    category: null,
    department: "",
    priority: hazard ? "Urgent" : classSoon ? "High" : "Medium",
    is_safety_hazard: hazard,
    photo_analysis: null,
    location,
    scope: location.room_no ? "room" : null,
    missing_fields: [],
    ai: null,
  };
}

const REPLY_PLACEHOLDER: Record<string, string> = {
  hi: "अपना जवाब यहाँ लिखें…",
  en: "Type your answer…",
};
const QUESTIONS_INTRO: Record<string, string> = {
  hi: "शुक्रिया! सही टीम तक जल्दी पहुँचाने के लिए कुछ जानकारी और चाहिए:",
  en: "Thanks! A couple of quick questions so the right team can fix this fast:",
};
/** Safety & Security: gentler wording (CLAUDE.md §12). */
const SAFETY_INTRO: Record<string, string> = {
  hi: "हमें बताने के लिए धन्यवाद — आपने सही किया। यह रिपोर्ट गोपनीय है। बस एक-दो बातें, ताकि सही लोग मदद कर सकें:",
  en: "Thank you for telling us — you did the right thing. This report is confidential. Just one or two things so the right people can help:",
};

/** Education: blocks only, and records issues (attendance, marks, timetable) need no place. */
const ACADEMIC_FORM = {
  buildingLabel: "Block",
  noBuildingLabel: "No place — timetable, attendance or marks",
  spotPlaceholder: "Room B-204, Lab D-2, Library reading hall…",
};

/**
 * Module-agnostic report flow: form → AI chat (one follow-up round) → preview →
 * duplicate check → ticket. The Education module reuses it with module="academic".
 */
export function ReportFlow({
  module,
  userId,
  buildings,
  onEmergencyChange,
  textPlaceholder,
  ownRoom,
  audience = "student",
}: {
  module: TicketModule;
  /** Faculty get the faculty-only categories and the "class soon → High" rule; results go to My Reports. */
  audience?: ReporterAudience;
  userId: string;
  buildings: readonly string[];
  /** Hostel module: the student's own hostel + room, pre-filled in the form. */
  ownRoom?: OwnRoom;
  /** Safety & Security: called when the AI thinks the student may be in immediate danger. */
  onEmergencyChange?: (emergency: boolean) => void;
  textPlaceholder?: string;
}) {
  const isSecurity = module === "security";
  const [phase, setPhase] = useState<Phase>("form");
  const freshDraft = () => (module === "hostel" && ownRoom ? hostelDraft(EMPTY_DRAFT, ownRoom) : EMPTY_DRAFT);
  const [draft, setDraft] = useState<ReportDraft>(freshDraft);
  const [uploaded, setUploaded] = useState<{ blob: Blob; path: string } | null>(null);
  const [thinking, setThinking] = useState<0 | 1 | 2>(0);
  const [round1, setRound1] = useState<ComplaintAnalysis | null>(null);
  const [finalAnalysis, setFinalAnalysis] = useState<ComplaintAnalysis | null>(null);
  const [reply, setReply] = useState<string | null>(null);
  const [ticket, setTicket] = useState<TicketDraft | null>(null);
  const [aiFailed, setAiFailed] = useState(false);
  const [checkingDup, setCheckingDup] = useState(false);
  /** Result of the "already reported?" check for the ticket currently shown in the preview. */
  const [dup, setDup] = useState<{ key: string; checking: boolean; result: DupResult | null } | null>(null);
  const checks = useRef(new Map<string, Promise<DupResult | null>>());
  const match = dup && !dup.checking ? (dup.result?.match ?? null) : null;
  const [choiceBusy, setChoiceBusy] = useState<"metoo" | "new" | null>(null);
  const [result, setResult] = useState<{ ticketNo: string; followed: boolean } | null>(null);
  const busy = useRef(false); // hard guard against double submits
  const bottomRef = useRef<HTMLDivElement>(null);

  const questions = round1 && !aiFailed ? round1.follow_up_questions : [];
  const lang = round1?.language === "hi" ? "hi" : "en";
  const photoPath = uploaded && draft.photo && uploaded.blob === draft.photo.blob ? uploaded.path : null;

  useEffect(() => {
    if (phase === "chat" || phase === "preview") {
      bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [phase, thinking, round1, ticket]);

  async function uploadPhoto(): Promise<string | null> {
    if (!draft.photo) return null;
    if (uploaded && uploaded.blob === draft.photo.blob) return uploaded.path;
    const path = `${userId}/${crypto.randomUUID()}.jpg`;
    const { error } = await createClient()
      .storage.from(PHOTO_BUCKET)
      .upload(path, draft.photo.blob, { contentType: "image/jpeg", upsert: false });
    if (error) {
      console.error("photo upload", error);
      toast.error("Photo upload failed — continuing without the photo.");
      return null;
    }
    setUploaded({ blob: draft.photo.blob, path });
    return path;
  }

  function analyze(body: AnalyzeRequest) {
    return postJson<AnalyzeResponse>("/api/ai/analyze", body, 45_000);
  }

  function goPreview(t: TicketDraft) {
    setTicket(t);
    setPhase("preview");
  }

  function noteEmergency(a: ComplaintAnalysis) {
    if (isSecurity && a.is_emergency) onEmergencyChange?.(true);
  }

  async function submitComplaint() {
    if (busy.current) return;
    busy.current = true;
    setPhase("chat");
    setRound1(null);
    setFinalAnalysis(null);
    setReply(null);
    setTicket(null);
    setAiFailed(false);
    setThinking(1);
    try {
      const path = await uploadPhoto();
      const res = await analyze({
        module,
        text: draft.text.trim(),
        location: locationOf(draft, module),
        photoPath: path,
      });
      if (!res?.ok) {
        setAiFailed(true);
        goPreview(manualDraft(draft, module, audience));
        return;
      }
      const a = res.analysis;
      noteEmergency(a);
      setRound1(a);
      if (a.missing_fields.length > 0 && a.follow_up_questions.length > 0) return; // wait for reply
      setFinalAnalysis(a);
      goPreview(draftFromAnalysis(a));
    } finally {
      setThinking(0);
      busy.current = false;
    }
  }

  async function sendReply(answer: string) {
    if (busy.current || !round1) return;
    busy.current = true;
    setReply(answer);
    setThinking(2);
    try {
      const res = await analyze({
        module,
        text: draft.text.trim(),
        location: round1.location,
        photoPath,
        followUp: { questions: round1.follow_up_questions, answer },
        previousPhotoAnalysis: round1.photo_analysis,
      });
      if (res?.ok) {
        noteEmergency(res.analysis);
        setFinalAnalysis(res.analysis);
        goPreview(draftFromAnalysis(res.analysis));
      } else {
        // Keep round 1 and attach the answer so nothing the student typed is lost.
        toast.message("Couldn't re-check with AI — we added your answer to the ticket.");
        setFinalAnalysis(round1);
        const t = draftFromAnalysis(round1);
        goPreview({ ...t, summary: `${t.summary}\nStudent added: ${answer}` });
      }
    } finally {
      setThinking(0);
      busy.current = false;
    }
  }

  function skipQuestions() {
    if (!round1) return;
    setFinalAnalysis(round1);
    goPreview(draftFromAnalysis(round1));
  }

  function changeCategory(category: string) {
    if (!ticket) return;
    if (finalAnalysis && category === finalAnalysis.category) {
      setTicket({ ...ticket, category, department: finalAnalysis.department, priority: finalAnalysis.priority });
      return;
    }
    const rule = getRoutingRule(module, category);
    const urgent = isSecurity ? ticket.is_emergency : ticket.is_safety_hazard;
    const classAffected =
      audience === "faculty" &&
      (finalAnalysis?.reasons.priority === CLASS_DISRUPTION_REASON || mentionsUpcomingClass(draft.text));
    const atLeastHigh = classAffected && (rule.defaultPriority === "Low" || rule.defaultPriority === "Medium");
    setTicket({
      ...ticket,
      category,
      department: rule.departments[0],
      priority: urgent ? "Urgent" : atLeastHigh ? "High" : rule.defaultPriority,
    });
  }

  function editComplaint() {
    setPhase("form");
    setTicket(null);
    setRound1(null);
    setFinalAnalysis(null);
    setReply(null);
    setDup(null);
    checks.current.clear();
  }

  function reset() {
    if (draft.photo) URL.revokeObjectURL(draft.photo.previewUrl);
    setDraft(freshDraft());
    setUploaded(null);
    setResult(null);
    editComplaint();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /** Same place + category + wording = same answer, so a repeat of the same preview reuses the result. */
  const dupKey =
    phase === "preview" && ticket?.category && !isSecurity
      ? JSON.stringify([ticket.category, ticket.location, ticket.scope, ticket.title, ticket.summary])
      : null;

  function runDupCheck(): Promise<DupResult | null> | null {
    if (!dupKey || !ticket?.category) return null;
    let promise = checks.current.get(dupKey);
    if (!promise) {
      const body: DuplicateRequest = {
        module: module as DuplicateRequest["module"],
        category: ticket.category,
        building: ticket.location.building,
        floor: ticket.location.floor,
        room_no: ticket.location.room_no,
        scope: ticket.scope,
        spot: ticket.location.spot,
        title: ticket.title,
        summary: ticket.summary,
        english_text: ticket.english_text ?? draft.text,
      };
      const key = dupKey;
      promise = postJson<DuplicateResponse>("/api/ai/duplicates", body, 25_000).then((res) => {
        if (res?.ok) return { match: res.match, method: res.method ?? "gemini", model: res.model ?? null };
        checks.current.delete(key); // failed: let the next attempt (e.g. on Confirm) try again
        return null;
      });
      checks.current.set(dupKey, promise);
    }
    return promise;
  }

  // Check for a similar open ticket as soon as the preview is shown (and again if the category changes).
  useEffect(() => {
    if (!dupKey) {
      setDup(null);
      return;
    }
    let cancelled = false;
    setDup({ key: dupKey, checking: true, result: null });
    void runDupCheck()?.then((result) => {
      if (!cancelled) setDup({ key: dupKey, checking: false, result });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- dupKey captures everything the check reads
  }, [dupKey]);

  async function confirm() {
    if (busy.current || !ticket?.category) return;
    busy.current = true;
    setCheckingDup(true);
    try {
      // Safety reports skip duplicate detection entirely. A failed check never blocks the student.
      const result = isSecurity ? null : await (runDupCheck() ?? null);
      if (result?.match) {
        setDup({ key: dupKey ?? "", checking: false, result });
        return;
      }
      await create(null, result);
    } finally {
      setCheckingDup(false);
      busy.current = false;
    }
  }

  async function create(dupOf: DuplicateMatch | null, check: DupResult | null) {
    if (!ticket?.category) return;
    const res = await createTicket({
      module,
      original_text: draft.text.trim(),
      language: ticket.language,
      english_text: ticket.english_text,
      title: ticket.title.trim(),
      summary: ticket.summary,
      category: ticket.category,
      department: ticket.department || null,
      priority: ticket.priority,
      is_safety_hazard: ticket.is_safety_hazard,
      location: ticket.location,
      scope: ticket.scope,
      photo_path: photoPath,
      photo_analysis: ticket.photo_analysis,
      details_incomplete: ticket.missing_fields.length > 0,
      confidential_choice: ticket.confidential_choice,
      hide_identity: ticket.hide_identity,
      is_emergency: ticket.is_emergency,
      ai: finalAnalysis
        ? {
            model: finalAnalysis.model,
            extracted_issue: finalAnalysis.extracted_issue,
            confidence: finalAnalysis.confidence,
            reasons: finalAnalysis.reasons,
            missing_fields: ticket.missing_fields,
            follow_up: reply != null && round1 ? { questions: round1.follow_up_questions, answer: reply } : null,
            ai_category: finalAnalysis.category,
          }
        : null,
      duplicate: dupOf ? { ticket_id: dupOf.id, similarity: dupOf.similarity, reason: dupOf.reason } : null,
      duplicate_check: check ? { method: check.method, model: check.model } : null,
    });
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setDup(null);
    setResult({ ticketNo: res.ticket_no, followed: false });
    setPhase("success");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function submitAsNew() {
    if (busy.current || !match) return;
    busy.current = true;
    setChoiceBusy("new");
    try {
      await create(match, dup?.result ?? null);
    } finally {
      setChoiceBusy(null);
      busy.current = false;
    }
  }

  async function meToo() {
    if (busy.current || !match) return;
    busy.current = true;
    setChoiceBusy("metoo");
    try {
      const res = await followTicket(match.id, ticket?.english_text ?? draft.text);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setDup(null);
      setResult({ ticketNo: res.ticket_no, followed: true });
      setPhase("success");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      setChoiceBusy(null);
      busy.current = false;
    }
  }

  if (phase === "success" && result) {
    return (
      <SuccessCard
        ticketNo={result.ticketNo}
        followed={result.followed}
        confidential={isSecurity}
        trackBase={audience === "faculty" ? "/reports" : "/tickets"}
        onReportAnother={reset}
      />
    );
  }

  if (phase === "form") {
    return (
      <ReportForm
        draft={draft}
        onChange={setDraft}
        buildings={buildings}
        onSubmit={submitComplaint}
        busy={false}
        textPlaceholder={textPlaceholder}
        showMachines={module === "hostel"}
        ownRoom={module === "hostel" ? ownRoom : undefined}
        {...(module === "academic" ? ACADEMIC_FORM : {})}
      />
    );
  }

  const awaitingReply = phase === "chat" && thinking === 0 && questions.length > 0 && reply == null;

  return (
    <div className="space-y-4">
      {/* The complaint as the student's first chat message */}
      <Bubble from="student">
        <p className="whitespace-pre-wrap">{draft.text}</p>
        <p className="mt-2 flex items-center gap-1 text-xs text-slate-300">
          <MapPin className="size-3" /> {formatLocation(locationOf(draft, module))}
        </p>
        {draft.photo && (
          // eslint-disable-next-line @next/next/no-img-element -- local blob preview
          <img src={draft.photo.previewUrl} alt="" className="mt-2 max-h-32 rounded-xl" />
        )}
      </Bubble>

      {thinking === 1 && <AiThinking round={1} hasPhoto={!!draft.photo} />}

      {aiFailed &&
        (isSecurity ? (
          <Bubble from="ai">
            Thank you for telling us. I couldn&apos;t sort this automatically, and that&apos;s okay — please pick the
            closest category below. Your report will still reach the right people, confidentially.
          </Bubble>
        ) : (
          <Bubble from="ai" tone="warning">
            Our AI assistant is busy right now, so I couldn&apos;t read this automatically. Please pick a category
            below and submit — staff will review it.
          </Bubble>
        ))}

      {questions.length > 0 && (
        <>
          <Bubble from="ai">{(isSecurity ? SAFETY_INTRO : QUESTIONS_INTRO)[lang]}</Bubble>
          {questions.map((q, i) => (
            <Bubble key={i} from="ai" className="[animation-delay:120ms]">
              {q}
            </Bubble>
          ))}
        </>
      )}

      {reply != null && <Bubble from="student">{reply}</Bubble>}
      {thinking === 2 && <AiThinking round={2} hasPhoto={false} />}

      {awaitingReply && (
        <ChatReply onSend={sendReply} onSkip={skipQuestions} busy={thinking > 0} placeholder={REPLY_PLACEHOLDER[lang]} />
      )}

      {phase === "preview" && ticket && (
        <>
          {!aiFailed && (
            <Bubble from="ai">
              {isSecurity
                ? "Thank you. Here's your report — check it, choose your privacy options and submit when you're ready."
                : ticket.missing_fields.length > 0
                  ? "Thanks! A few details are still missing, but that's okay — here's your ticket. Check it and confirm."
                  : "Got it! Here's your ticket — check the details and confirm."}
            </Bubble>
          )}
          <PreviewCard
            module={module}
            audience={audience}
            draft={ticket}
            originalText={draft.text}
            photoUrl={draft.photo?.previewUrl ?? null}
            onCategoryChange={changeCategory}
            onTitleChange={(title) => setTicket({ ...ticket, title })}
            onPrivacyChange={(patch) => setTicket({ ...ticket, ...patch })}
            onConfirm={confirm}
            onEdit={editComplaint}
            busy={checkingDup || !!choiceBusy}
            confirmBlocked={match ? "Choose an option in the card above first." : undefined}
            notice={
              !isSecurity && dup ? (
                <SimilarTicketCard
                  checking={dup.checking}
                  match={match}
                  onMeToo={meToo}
                  onSubmitNew={submitAsNew}
                  busy={choiceBusy}
                />
              ) : null
            }
          />
        </>
      )}

      <div ref={bottomRef} />

    </div>
  );
}
