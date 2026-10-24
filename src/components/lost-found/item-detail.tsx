import Link from "next/link";
import { ArrowLeft, CalendarDays, CheckCircle2, ClipboardCheck, EyeOff, Lock, Sparkles, Tag } from "lucide-react";
import { Confetti } from "@/components/common/celebrate";
import { PhotoAnalysisBox } from "@/components/tickets/ai-bits";
import { Button } from "@/components/ui/button";
import { LF_HELD_LABELS } from "@/config/lost-found";
import { formatDateTime, timeAgo } from "@/lib/format";
import type { ItemDetail } from "@/lib/lost-found/queries";
import { ClaimForm } from "./claim-form";
import { ItemPhoto, LfCategoryBadge, LfHeldBadge, LfStatusBadge, LfTypeBadge, PlaceLine } from "./item-bits";
import { CloseLostButton } from "./owner-actions";

function Fact({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div>
      <dt className="eyebrow">{label}</dt>
      <dd className="mt-0.5 text-sm font-semibold text-text">{value}</dd>
    </div>
  );
}

/** Item page: the listing, the viewer's match / claim state, and (staff only) who reported and claimed it. */
export function ItemDetailView({ detail }: { detail: ItemDetail }) {
  const { item } = detail;
  const open = item.status === "open" || item.status === "matched";

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <Link href="/lost-found" className="inline-flex items-center gap-1.5 text-sm font-semibold text-text-muted hover:text-text">
        <ArrowLeft className="size-4" /> Lost &amp; Found
      </Link>

      <div className="grid animate-slide-up gap-5 md:grid-cols-5">
        <ItemPhoto src={item.photo_src} blurred={item.photo_blurred} category={item.item_category} alt={item.title} className="h-64 rounded-3xl border border-border md:col-span-2 md:h-full md:min-h-72" />

        <div className="space-y-4 rounded-3xl border border-border bg-surface p-5 shadow-sm sm:p-6 md:col-span-3">
          <div className="flex flex-wrap gap-1.5">
            <LfTypeBadge type={item.type} />
            <LfCategoryBadge category={item.item_category} />
            <LfStatusBadge status={item.status} />
            {item.type === "found" && item.held_at && <LfHeldBadge heldAt={item.held_at} />}
          </div>
          <div>
            <p className="font-mono text-xs font-semibold text-text-muted">{item.item_no}</p>
            <h1 className="text-2xl font-extrabold tracking-tight text-text sm:text-3xl">{item.title}</h1>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <PlaceLine building={item.building} spot={item.spot} />
            <span className="inline-flex items-center gap-1 text-sm text-text-muted">
              <CalendarDays className="size-3.5" /> {item.type === "lost" ? "Lost" : "Found"} {formatDateTime(item.happened_at)}
            </span>
          </div>
          <p className="text-text">{item.description}</p>

          <dl className="grid grid-cols-2 gap-4">
            <Fact label="Colour" value={item.color} />
            <Fact label="Brand" value={item.brand} />
            <Fact label="Distinguishing marks" value={item.marks} />
          </dl>

          {item.sensitive && !detail.viewerIsMine && !detail.viewerIsStaff && (
            <p className="flex items-start gap-2 rounded-2xl bg-surface-accent p-3 text-sm text-text-muted">
              <EyeOff className="mt-0.5 size-4 shrink-0 text-text" />
              This looks like a valuable or ID item, so the photo is blurred and the brand and marks are hidden. The Security Officer checks the owner before handing it over.
            </p>
          )}
          {item.sensitive && (detail.viewerIsMine || detail.viewerIsStaff) && (
            <p className="flex items-start gap-2 rounded-2xl bg-surface-accent p-3 text-sm text-text-muted">
              <Lock className="mt-0.5 size-4 shrink-0 text-text" />
              Marked as a valuable / ID item: other people see a blurred photo and no brand or marks.
            </p>
          )}
          <p className="text-xs text-text-muted">Posted {timeAgo(item.created_at)}</p>
        </div>
      </div>

      {/* The viewer's own lost report matches this found item */}
      {detail.linkedLostId && detail.linkedScore != null && open && (
        <section className="animate-slide-up rounded-3xl border border-violet-fg/40 bg-violet-bg p-5 text-violet-fg">
          <p className="flex items-center gap-2 font-extrabold"><Sparkles className="size-5" /> This could be your lost item</p>
          <p className="mt-1 text-sm">
            It matches your lost report with {Math.round(detail.linkedScore * 100)}% confidence
            {detail.matches.find((m) => m.match.lost_id === detail.linkedLostId)?.match.reason
              ? `: ${detail.matches.find((m) => m.match.lost_id === detail.linkedLostId)?.match.reason}`
              : "."}
          </p>
        </section>
      )}

      {/* Claim state */}
      {item.type === "found" && !detail.viewerIsMine && (
        <section className="animate-slide-up space-y-3 rounded-3xl border border-border bg-surface p-5 shadow-sm sm:p-6">
          {detail.myClaim?.status === "pending" && (
            <p className="flex items-start gap-2 font-semibold text-text">
              <ClipboardCheck className="mt-0.5 size-5 shrink-0 text-accent-text" />
              Your claim is waiting for the Security Officer. We&apos;ll notify you as soon as it&apos;s reviewed.
            </p>
          )}
          {detail.myClaim?.status === "approved" && (
            <div className="relative space-y-1">
              <Confetti count={18} className="top-3" />
              <p className="flex items-center gap-2 font-extrabold text-success-fg"><CheckCircle2 className="size-5" /> Your claim was approved</p>
              <p className="text-text">{detail.pickup_note ?? "Collect it from the Security Office. Bring your college ID card."}</p>
              {item.status === "returned" && <p className="text-sm text-text-muted">The handover has been recorded.</p>}
            </div>
          )}
          {detail.myClaim?.status === "rejected" && (
            <p className="font-semibold text-text">
              Your earlier claim wasn&apos;t approved{detail.myClaim.review_note ? `: ${detail.myClaim.review_note}` : "."}{" "}
              {detail.canClaim ? "If it really is yours, you can try again with more detail." : ""}
            </p>
          )}
          {detail.canClaim && <ClaimForm itemId={item.id} question={detail.verification_question} />}
          {!detail.canClaim && !detail.myClaim && !open && (
            <p className="text-sm text-text-muted">This item is no longer open for claims.</p>
          )}
        </section>
      )}

      {/* My own post */}
      {detail.viewerIsMine && (
        <section className="animate-slide-up space-y-3 rounded-3xl border border-border bg-surface p-5 shadow-sm sm:p-6">
          <p className="eyebrow">Your post</p>
          {item.type === "found" ? (
            <div className="space-y-2 text-sm text-text">
              <p>{item.held_at ? LF_HELD_LABELS[item.held_at] : ""}. {item.held_at === "with_finder" ? "Please hand it to the Security Office so the owner can collect it." : "The owner collects it there after the Security Officer verifies them."}</p>
              {detail.verification_question && <p><span className="font-semibold">Verification question:</span> {detail.verification_question}</p>}
            </div>
          ) : open || item.status === "claimed" ? (
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-sm text-text-muted">Got your item back? Close this report so nobody keeps looking.</p>
              <CloseLostButton itemId={item.id} />
            </div>
          ) : (
            <p className="text-sm text-text-muted">This report is closed.</p>
          )}
          {item.status === "claimed" && detail.pickup_note && (
            <p className="rounded-2xl bg-success-bg p-3 text-sm font-semibold text-success-fg">{detail.pickup_note}</p>
          )}
          {detail.photoAnalysis?.observed && <PhotoAnalysisBox analysis={detail.photoAnalysis} />}
        </section>
      )}

      {/* Possible matches */}
      {detail.matches.length > 0 && (
        <section className="animate-slide-up space-y-3">
          <h2 className="eyebrow">Possible matches</h2>
          <ul className="space-y-2">
            {detail.matches.map(({ match, other }) => (
              <li key={`${match.lost_id}-${match.found_id}`}>
                <Link href={`/lost-found/${other.id}`} className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-surface p-4 transition-colors hover:border-accent-blue">
                  <ItemPhoto src={other.photo_src} blurred={false} category={other.item_category} alt={other.title} className="size-14 shrink-0 rounded-xl" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold text-text">{other.title}</p>
                    <p className="text-xs text-text-muted">{other.item_no} · {other.type === "found" ? "Found" : "Lost"} at {[other.building, other.spot].filter(Boolean).join(" · ") || "unknown place"}</p>
                    {match.reason && <p className="mt-1 text-sm text-text-muted">{match.reason}</p>}
                  </div>
                  <span className="inline-flex items-center gap-1 rounded-full bg-violet-bg px-2.5 py-1 text-xs font-bold text-violet-fg">
                    <Tag className="size-3" /> {Math.round(match.score * 100)}% match
                    {match.status === "confirmed" ? " · confirmed" : ""}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Security Office / warden: who reported and claimed it, with roll numbers */}
      {detail.viewerIsStaff && (
        <section className="animate-slide-up space-y-3 rounded-3xl border border-border bg-surface p-5 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="eyebrow">Security Office view</p>
            <Button asChild size="sm" variant="outline"><Link href="/lost-found/desk">Open the desk</Link></Button>
          </div>
          <dl className="grid gap-4 sm:grid-cols-2">
            <Fact label="Reported by" value={detail.reporter ? `${detail.reporter.name}${detail.reporter.roll_no ? ` · roll ${detail.reporter.roll_no}` : ""}` : null} />
            <Fact label="Private description" value={item.description} />
            <Fact label="Verification question" value={detail.verification_question} />
            <Fact label="Expected answer" value={detail.verification_answer} />
            <Fact label="Pickup note" value={detail.pickup_note} />
          </dl>
          {detail.photoAnalysis?.observed && <PhotoAnalysisBox analysis={detail.photoAnalysis} />}
          {detail.claims.length > 0 && (
            <div className="space-y-2">
              <p className="eyebrow">Claims</p>
              <ul className="space-y-2">
                {detail.claims.map(({ claim, claimant }) => (
                  <li key={claim.id} className="rounded-2xl border border-border bg-surface-2 p-3 text-sm">
                    <p className="font-bold text-text">
                      {claimant?.name ?? "Unknown"}{claimant?.roll_no ? ` · roll ${claimant.roll_no}` : ""}{" "}
                      <span className="font-normal text-text-muted">· {claim.status} · {timeAgo(claim.created_at)}</span>
                    </p>
                    <p className="mt-1 text-text-muted">&ldquo;{claim.answer}&rdquo;</p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
