"use client";
// The frame of every flow screen (BUTCHER_FLOW §5): a back button and the title, the background video upload bar,
// the content, and one big primary action at the bottom — busy hands, large type, little to read.
import Link from "next/link";
import { clsx } from "clsx";
import { IconBack } from "../../icons";
import { Spinner } from "../../ui";
import { he } from "@/lib/i18n/he";
import { retryVideoUpload, useVideoUpload } from "@/lib/video-upload";

export function FlowScreen({ title, sub, back = "/butcher", children, footer, wide }: {
  title: React.ReactNode; sub?: React.ReactNode; back?: string | null; children: React.ReactNode;
  /** the primary action(s), pinned at the bottom */
  footer?: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <main className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 flex items-center gap-2 bg-ink/95 px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2 backdrop-blur">
        {back && (
          <Link href={back} aria-label={he.app.back} className="grid size-12 shrink-0 place-items-center rounded-full bg-ink-2 shadow-[var(--shadow-card)]">
            <IconBack />
          </Link>
        )}
        <div className="min-w-0">
          <h1 className="m-0 truncate text-[22px] font-black leading-7">{title}</h1>
          {sub && <p className="m-0 truncate text-sm text-stone">{sub}</p>}
        </div>
      </header>
      <UploadBar />
      <div className={clsx("flex flex-1 flex-col gap-4 px-4 pt-2 pb-6", wide ? "lg:px-8" : "lg:mx-auto lg:w-full lg:max-w-[560px]")}>{children}</div>
      {footer && (
        <div className="sticky bottom-0 z-20 flex flex-col gap-2 border-t border-line bg-ink/95 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur lg:px-[max(1rem,calc((100%-560px)/2))]">
          {footer}
        </div>
      )}
    </main>
  );
}

/** The cutting video going up in the background (S1), on every screen until it is done. */
function UploadBar() {
  const up = useVideoUpload();
  if (!up) return null;
  return (
    <div className="mx-4 mb-1 flex items-center gap-2 text-xs font-semibold" role="status">
      {up.status === "error" ? (
        <>
          <span className="flex-1 text-sold">{he.flow.videoFailed}</span>
          <button type="button" className="min-h-9 px-2 underline" onClick={retryVideoUpload}>{he.app.retry}</button>
        </>
      ) : (
        <>
          <span className="shrink-0 text-stone">{up.status === "done" ? he.flow.videoUploaded : he.flow.videoUploading(up.pct)}</span>
          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink-3">
            <span className="block h-full bg-[var(--status-ready)] transition-[width]" style={{ width: `${up.status === "done" ? 100 : up.pct}%` }} />
          </span>
        </>
      )}
    </div>
  );
}

export function FlowLoading({ state, onRetry }: { state: "loading" | "notfound" | "error"; onRetry?: () => void }) {
  return (
    <div className="grid min-h-dvh place-items-center p-6 text-center text-stone">
      {state === "loading" ? <Spinner /> : (
        <div className="flex flex-col items-center gap-3">
          <p className="m-0">{state === "notfound" ? he.flow.notFound : he.app.errorLoad}</p>
          {onRetry && <button type="button" className="sr-cchip" onClick={onRetry}>{he.app.retry}</button>}
          <Link href="/butcher" className="sr-cchip">{he.app.back}</Link>
        </div>
      )}
    </div>
  );
}

/** Where a parent in work continues (BUTCHER_FLOW_v2 §3: video → photos → clip → details → sale mode → trays / block). */
export function parentStep(p: { id: string; status: string; sale_mode: string | null; code: number | null }): string {
  if (p.status === "recording") return `/butcher/parent/new?id=${p.id}`;
  if (p.status === "closed") return `/butcher/parent/${p.id}/summary`;
  if (p.code == null) return `/butcher/parent/${p.id}/photos`;
  if (p.status === "details" || p.sale_mode == null) return `/butcher/parent/${p.id}/details`;
  return p.sale_mode === "block" ? `/butcher/parent/${p.id}/block` : `/butcher/parent/${p.id}/units`;
}
