"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { Archive, Check, ChevronDown, Gift, Handshake, History, Inbox, Loader2, PackageCheck, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/common/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LF_EXPIRY_DAYS } from "@/config/lost-found";
import { decideMatch, disposeItem, markReceived, markReturned, reviewClaim, updateVerification } from "@/lib/lost-found/actions";
import type { DeskData, DeskItem } from "@/lib/lost-found/queries";
import { formatDateTime, timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ItemPhoto, LfCategoryBadge, LfStatusBadge, PlaceLine } from "./item-bits";

type Result = { ok: true } | { ok: false; error: string };

/** Runs a server action with a spinner, a toast and a refresh of the desk data. */
function useDeskAction() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  function run(key: string, action: () => Promise<Result>, success: string) {
    setBusyKey(key);
    start(async () => {
      const res = await action();
      if (res.ok) {
        toast.success(success);
        router.refresh();
      } else toast.error(res.error);
      setBusyKey(null);
    });
  }
  return { run, pending, busy: (key: string) => pending && busyKey === key };
}

function Section({ title, count, hint, children }: { title: string; count?: number; hint?: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-extrabold tracking-tight text-text">
          {title}
          {count != null && <span className="rounded-full bg-surface-accent-2 px-2 py-0.5 text-xs font-bold text-accent-text">{count}</span>}
        </h2>
        {hint && <p className="text-sm text-text-muted">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <p className="text-sm">
      <span className="eyebrow mr-1.5">{label}</span>
      <span className="font-semibold text-text">{value}</span>
    </p>
  );
}

/** One side of a side-by-side comparison. Staff see the private description and the reporter's roll number. */
function ItemPanel({ label, item }: { label: string; item: DeskItem }) {
  return (
    <div className="space-y-2.5 rounded-2xl border border-border bg-surface-2 p-4">
      <p className="eyebrow">{label}</p>
      <div className="flex gap-3">
        <ItemPhoto src={item.photo_src} category={item.item_category} alt={item.title} className="size-20 shrink-0 rounded-xl" />
        <div className="min-w-0 space-y-1">
          <Link href={`/lost-found/${item.id}`} className="block font-bold text-text hover:underline">{item.title}</Link>
          <p className="font-mono text-xs text-text-muted">{item.item_no}</p>
          <LfCategoryBadge category={item.item_category} />
        </div>
      </div>
      <p className="text-sm text-text">{item.description}</p>
      <div className="space-y-0.5">
        <Fact label="Colour" value={item.color} />
        <Fact label="Brand" value={item.brand} />
        <Fact label="Marks" value={item.marks} />
        <Fact label="When" value={formatDateTime(item.happened_at)} />
      </div>
      <PlaceLine building={item.building} spot={item.spot} />
      {item.reporter && (
        <p className="text-xs text-text-muted">
          Reported by <span className="font-semibold text-text">{item.reporter.name}</span>
          {item.reporter.roll_no ? ` · roll ${item.reporter.roll_no}` : ""}
        </p>
      )}
    </div>
  );
}

const pct = (n: number | null) => (n == null ? null : `${Math.round(n * 100)}%`);

// ---------------------------------------------------------------------------
// Pending claims
// ---------------------------------------------------------------------------
function ClaimCard({ c, canManage }: { c: DeskData["claims"][number]; canManage: boolean }) {
  const { run, busy } = useDeskAction();
  const [note, setNote] = useState("");
  const [pickup, setPickup] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const { claim, claimant, found, lost } = c;

  return (
    <li className="space-y-4 rounded-3xl border border-border bg-surface p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-bold text-text">
          {claimant?.name ?? "Unknown"}
          {claimant?.roll_no ? <span className="font-normal text-text-muted"> · roll {claimant.roll_no}</span> : null}
          <span className="font-normal text-text-muted"> wants to claim </span>
          {found.item_no}
        </p>
        <span className="text-xs text-text-muted">{timeAgo(claim.created_at)}</span>
      </div>

      {claim.match_reason || claim.match_score != null ? (
        <p className="flex items-start gap-2 rounded-2xl bg-violet-bg p-3 text-sm text-violet-fg">
          <Sparkles className="mt-0.5 size-4 shrink-0" />
          <span>
            <span className="font-bold">AI match{claim.match_score != null ? ` ${pct(claim.match_score)}` : ""}:</span> {claim.match_reason ?? "The claimant's lost report was matched with this item."}
          </span>
        </p>
      ) : (
        <p className="rounded-2xl bg-surface-2 p-3 text-sm text-text-muted">
          No lost report from this person is matched with the item. Judge the answer below against the item.
        </p>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        <ItemPanel label="Found item" item={found} />
        {lost ? (
          <ItemPanel label="Claimant's lost report" item={lost} />
        ) : (
          <div className="rounded-2xl border border-dashed border-border p-4 text-sm text-text-muted">
            <p className="eyebrow mb-1">Claimant&apos;s lost report</p>
            They haven&apos;t posted a lost report for this item.
          </div>
        )}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1 rounded-2xl border border-border p-4">
          <p className="eyebrow">Verification question</p>
          <p className="text-sm font-semibold text-text">{found.verification_question ?? "None was set"}</p>
          <p className="eyebrow mt-2">Expected answer</p>
          <p className="text-sm font-semibold text-text">{found.verification_answer ?? "Not provided by the finder"}</p>
        </div>
        <div className="space-y-1 rounded-2xl border border-accent-blue/50 bg-surface-accent p-4">
          <p className="eyebrow">Claimant&apos;s answer</p>
          <p className="text-sm font-semibold text-text">&ldquo;{claim.answer}&rdquo;</p>
        </div>
      </div>

      {canManage &&
        (rejecting ? (
          <div className="flex flex-wrap items-center gap-2">
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reason shown to the claimant (optional)" maxLength={300} className="max-w-md flex-1" />
            <Button
              variant="outline"
              disabled={busy(claim.id)}
              onClick={() => run(claim.id, () => reviewClaim({ claimId: claim.id, decision: "reject", note }), "Claim rejected")}
            >
              {busy(claim.id) ? <Loader2 className="animate-spin" /> : <X />} Reject claim
            </Button>
            <Button variant="ghost" onClick={() => setRejecting(false)}>Back</Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <Input value={pickup} onChange={(e) => setPickup(e.target.value)} placeholder="Pickup note (default: collect from the Security Office)" maxLength={300} className="max-w-md flex-1" />
            <Button
              disabled={busy(claim.id)}
              onClick={() => run(claim.id, () => reviewClaim({ claimId: claim.id, decision: "approve", pickupNote: pickup }), "Claim approved. The owner has been told to collect it.")}
            >
              {busy(claim.id) ? <Loader2 className="animate-spin" /> : <Check />} Approve
            </Button>
            <Button variant="outline" onClick={() => setRejecting(true)}><X /> Reject…</Button>
          </div>
        ))}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Suggested matches
// ---------------------------------------------------------------------------
function MatchCard({ m, canManage }: { m: DeskData["matches"][number]; canManage: boolean }) {
  const { run, busy } = useDeskAction();
  const key = `${m.match.lost_id}-${m.match.found_id}`;
  return (
    <li className="space-y-4 rounded-3xl border border-border bg-surface p-5 shadow-sm">
      <p className="flex items-start gap-2 rounded-2xl bg-violet-bg p-3 text-sm text-violet-fg">
        <Sparkles className="mt-0.5 size-4 shrink-0" />
        <span>
          <span className="font-bold">{pct(m.match.score)} match:</span> {m.match.reason ?? "Descriptions line up."}
        </span>
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        <ItemPanel label="Lost" item={m.lost} />
        <ItemPanel label="Found" item={m.found} />
      </div>
      {canManage && (
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={busy(key)}
            onClick={() => run(key, () => decideMatch({ lostId: m.match.lost_id, foundId: m.match.found_id, decision: "confirm" }), "Match confirmed. Both people were notified.")}
          >
            {busy(key) ? <Loader2 className="animate-spin" /> : <Check />} Confirm match
          </Button>
          <Button variant="outline" disabled={busy(key)} onClick={() => run(key, () => decideMatch({ lostId: m.match.lost_id, foundId: m.match.found_id, decision: "reject" }), "Marked as not a match")}>
            <X /> Not a match
          </Button>
        </div>
      )}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Held items
// ---------------------------------------------------------------------------
function VerificationEditor({ item }: { item: DeskItem }) {
  const { run, busy } = useDeskAction();
  const [q, setQ] = useState(item.verification_question ?? "");
  const [a, setA] = useState(item.verification_answer ?? "");
  return (
    <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Verification question" maxLength={200} aria-label="Verification question" />
      <Input value={a} onChange={(e) => setA(e.target.value)} placeholder="Expected answer" maxLength={200} aria-label="Expected answer" />
      <Button variant="outline" disabled={busy(item.id)} onClick={() => run(item.id, () => updateVerification({ itemId: item.id, question: q, answer: a }), "Verification saved")}>
        {busy(item.id) ? <Loader2 className="animate-spin" /> : <Check />} Save
      </Button>
    </div>
  );
}

function HeldRow({ item, canManage, withFinder }: { item: DeskItem; canManage: boolean; withFinder?: boolean }) {
  const { run, busy } = useDeskAction();
  const [editing, setEditing] = useState(false);
  return (
    <li className="rounded-2xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center gap-3">
        <ItemPhoto src={item.photo_src} category={item.item_category} alt={item.title} className="size-14 shrink-0 rounded-xl" />
        <div className="min-w-0 flex-1">
          <Link href={`/lost-found/${item.id}`} className="block truncate font-bold text-text hover:underline">{item.title}</Link>
          <p className="text-xs text-text-muted">
            {item.item_no} · found {timeAgo(item.created_at)} · {[item.building, item.spot].filter(Boolean).join(" · ") || "place not given"}
            {item.reporter ? ` · finder ${item.reporter.name}${item.reporter.roll_no ? ` (${item.reporter.roll_no})` : ""}` : ""}
          </p>
          {item.status === "claimed" && (
            <p className="mt-1 text-sm font-semibold text-success-fg">
              Approved for {item.claimant?.name ?? "the owner"}
              {item.claimant?.roll_no ? ` · roll ${item.claimant.roll_no}` : ""}. Check their college ID at handover.
            </p>
          )}
        </div>
        <LfStatusBadge status={item.status} />
        {canManage && (
          <div className="flex flex-wrap gap-2">
            {withFinder && (
              <Button size="sm" variant="outline" disabled={busy(item.id)} onClick={() => run(item.id, () => markReceived(item.id), "Marked as received at the Security Office")}>
                {busy(item.id) ? <Loader2 className="animate-spin" /> : <Inbox />} Mark received
              </Button>
            )}
            {!withFinder && item.status === "claimed" && (
              <Button size="sm" disabled={busy(item.id)} onClick={() => run(item.id, () => markReturned(item.id), "Marked as returned")}>
                {busy(item.id) ? <Loader2 className="animate-spin" /> : <PackageCheck />} Mark returned
              </Button>
            )}
            {withFinder && item.status === "claimed" && <span className="text-xs text-text-muted">Receive it from the finder first</span>}
            <Button size="sm" variant="ghost" onClick={() => setEditing((v) => !v)} aria-expanded={editing}>
              Verification <ChevronDown className={cn("transition-transform", editing && "rotate-180")} />
            </Button>
          </div>
        )}
      </div>
      {editing && canManage && <VerificationEditor item={item} />}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Expiry
// ---------------------------------------------------------------------------
function ExpiryRow({ item, canManage }: { item: DeskItem; canManage: boolean }) {
  const { run, busy } = useDeskAction();
  const overdue = item.age_days >= LF_EXPIRY_DAYS;
  return (
    <li className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-surface p-4">
      <div className="min-w-0 flex-1">
        <Link href={`/lost-found/${item.id}`} className="block truncate font-bold text-text hover:underline">{item.title}</Link>
        <p className="text-xs text-text-muted">{item.item_no} · {item.age_days} days old · {item.held_at === "with_finder" ? "with finder" : "at the Security Office"}</p>
      </div>
      <span
        className={cn(
          "rounded-full border px-2.5 py-0.5 text-xs font-bold",
          overdue ? "border-danger-fg/30 bg-danger-bg text-danger-fg" : "border-warning-fg/30 bg-warning-bg text-warning-fg",
        )}
      >
        {overdue ? `Expired ${item.age_days - LF_EXPIRY_DAYS}d ago` : `Expires in ${LF_EXPIRY_DAYS - item.age_days}d`}
      </span>
      {canManage && (
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={busy(item.id)} onClick={() => run(item.id, () => disposeItem({ itemId: item.id, disposition: "donated" }), "Marked as donated")}>
            <Gift /> Donated
          </Button>
          <Button size="sm" variant="outline" disabled={busy(item.id)} onClick={() => run(item.id, () => disposeItem({ itemId: item.id, disposition: "disposed" }), "Marked as disposed")}>
            <Archive /> Disposed
          </Button>
        </div>
      )}
    </li>
  );
}

// ---------------------------------------------------------------------------
// The desk
// ---------------------------------------------------------------------------
export function LostFoundDesk({ data, canManage }: { data: DeskData; canManage: boolean }) {
  const stats = [
    { label: "Claims to review", value: data.claims.length },
    { label: "Matches to confirm", value: data.matches.length },
    { label: "At the Security Office", value: data.held.length },
    { label: "Past / near expiry", value: data.expiry.length },
  ];

  return (
    <div className="space-y-10">
      {!canManage && (
        <p className="rounded-2xl border border-border bg-surface-accent p-3 text-sm text-text-muted">
          You can see everything here. Only the Security Officer can approve claims, confirm matches and hand items over.
        </p>
      )}

      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <li key={s.label} className="rounded-3xl border border-border bg-surface p-4">
            <p className="text-3xl font-extrabold tracking-tight text-text">{s.value}</p>
            <p className="eyebrow mt-1">{s.label}</p>
          </li>
        ))}
      </ul>

      <Section title="Pending claims" count={data.claims.length} hint="Compare the claimant's answer and lost report with the found item, then approve or reject.">
        {data.claims.length === 0 ? (
          <EmptyState icon={Handshake} title="No claims waiting" description="When someone taps “This is mine” on a found item it shows up here." />
        ) : (
          <ul className="space-y-4">{data.claims.map((c) => <ClaimCard key={c.claim.id} c={c} canManage={canManage} />)}</ul>
        )}
      </Section>

      <Section title="Suggested matches" count={data.matches.length} hint="AI found these lost / found pairs (70%+). Confirm to tell both people.">
        {data.matches.length === 0 ? (
          <EmptyState icon={Sparkles} title="No suggestions to confirm" description="New lost and found posts are compared automatically." />
        ) : (
          <ul className="space-y-4">{data.matches.map((m) => <MatchCard key={`${m.match.lost_id}-${m.match.found_id}`} m={m} canManage={canManage} />)}</ul>
        )}
      </Section>

      <Section title="Held at the Security Office" count={data.held.length} hint="Found items in your custody. Mark returned at handover after checking the owner's ID.">
        {data.held.length === 0 ? (
          <EmptyState icon={PackageCheck} title="Nothing is being held" description="Items handed in at the office show up here." />
        ) : (
          <ul className="space-y-2">{data.held.map((i) => <HeldRow key={i.id} item={i} canManage={canManage} />)}</ul>
        )}
      </Section>

      {data.withFinder.length > 0 && (
        <Section title="Still with the finder" count={data.withFinder.length} hint="Ask the finder to hand these in, then mark them received.">
          <ul className="space-y-2">{data.withFinder.map((i) => <HeldRow key={i.id} item={i} canManage={canManage} withFinder />)}</ul>
        </Section>
      )}

      <Section title={`${LF_EXPIRY_DAYS}-day expiry list`} count={data.expiry.length} hint="Unclaimed found items. After 30 days mark them disposed or donated.">
        {data.expiry.length === 0 ? (
          <EmptyState icon={Archive} title="Nothing is close to expiring" />
        ) : (
          <ul className="space-y-2">{data.expiry.map((i) => <ExpiryRow key={i.id} item={i} canManage={canManage} />)}</ul>
        )}
      </Section>

      <Section title="Activity log" hint="Every action with roll numbers (latest 40).">
        <details className="group rounded-3xl border border-border bg-surface">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-5 py-4 text-sm font-bold text-text">
            <History className="size-4" /> Show log <ChevronDown className="ml-auto size-4 transition-transform group-open:rotate-180" />
          </summary>
          <ul className="divide-y divide-border border-t border-border">
            {data.log.length === 0 && <li className="px-5 py-4 text-sm text-text-muted">Nothing logged yet.</li>}
            {data.log.map((l) => (
              <li key={l.id} className="px-5 py-3 text-sm">
                <p className="text-text">
                  <span className="font-bold">{l.actor_name ?? "System"}</span>
                  {l.actor_roll_no ? <span className="text-text-muted"> (roll {l.actor_roll_no})</span> : null}
                  <span className="text-text-muted"> · {l.action.replace(/_/g, " ")}</span>
                  {l.item_no ? <span className="font-mono text-xs text-text-muted"> · {l.item_no}</span> : null}
                </p>
                {l.detail && <p className="text-text-muted">{l.detail}</p>}
                <p className="text-xs text-text-muted">{formatDateTime(l.created_at)}</p>
              </li>
            ))}
          </ul>
        </details>
      </Section>
    </div>
  );
}
