"use client";
// S1 — recording the butchering (BUTCHER_FLOW §5). The parent is created as the screen opens and the recording
// starts by itself: a live view, a running clock and the red "מקליט" dot, pause / resume, and "הפסק הקלטה".
// Stopping goes on to the photos of the cut (BUTCHER_FLOW_v2 §3); the video goes on uploading in the background. When the browser cannot record, the phone's own camera does
// (a file capture). A recording that did not save says so: "המשך בלי סרטון" / "הקלט שוב".
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useButcher } from "@/components/butcher/ButcherShell";
import { FlowScreen, parentStep } from "@/components/butcher/flow/FlowScreen";
import { ConfirmDialog, Spinner } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { he } from "@/lib/i18n/he";
import { errorCode, errorText } from "@/lib/errors";
import { supabaseBrowser } from "@/lib/supabase/client";
import { uploadParentVideo } from "@/lib/video-upload";
import type { Parent } from "@/lib/types";

type Phase = "starting" | "camera" | "recording" | "paused" | "native" | "failed" | "busy";

const MIME = ["video/mp4;codecs=avc1", "video/mp4", "video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];

function Recording() {
  const { butcher } = useButcher();
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const [parent, setParent] = useState<Parent | null>(null);
  const [inProgress, setInProgress] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("starting");
  const [secs, setSecs] = useState(0);
  const [discarding, setDiscarding] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  const started = useRef(false);

  // the parent: the one being resumed, or a new one (R17: another open one must be paused explicitly)
  const start = useCallback(async (pause: boolean) => {
    const sb = supabaseBrowser();
    const id = params.get("id");
    if (id) {
      const { data } = await sb.from("parents").select("*").eq("id", id).maybeSingle();
      if (data && (data as Parent).status !== "recording") return router.replace(parentStep(data as Parent));
      if (data) return setParent(data as Parent);
    }
    const { data, error } = await sb.rpc("start_parent", { p_pause_current: pause });
    if (error) {
      if (errorCode(error) === "PARENT_IN_PROGRESS") return setInProgress(error.details ?? "");
      toast(errorText(error), { tone: "error" });
      return router.replace("/butcher");
    }
    setInProgress(null);
    setParent(data as Parent);
  }, [params, router, toast]);
  useEffect(() => { if (!started.current) { started.current = true; start(false); } }, [start]);

  // the camera: live view and recording in the browser where it can
  const openCamera = useCallback(async () => {
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") throw new Error("unsupported");
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment", width: { ideal: 1280 } }, audio: true });
      stream.current = s;
      if (video.current) { video.current.srcObject = s; await video.current.play().catch(() => {}); }
      const mime = MIME.find((m) => MediaRecorder.isTypeSupported(m));
      const r = new MediaRecorder(s, mime ? { mimeType: mime, videoBitsPerSecond: 2_500_000 } : undefined);
      chunks.current = [];
      r.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data); };
      rec.current = r;
      r.start(1000);
      setSecs(0);
      setPhase("recording");
    } catch {
      setPhase("native");
    }
  }, []);
  useEffect(() => { if (parent && phase === "starting") openCamera(); }, [parent, phase, openCamera]);
  useEffect(() => () => stream.current?.getTracks().forEach((t) => t.stop()), []);

  useEffect(() => {
    if (phase !== "recording") return;
    const t = window.setInterval(() => setSecs((x) => x + 1), 1000);
    return () => window.clearInterval(t);
  }, [phase]);

  // "הפסק הקלטה": the photos now, the video after (in the background)
  async function finish(file: Blob | null) {
    if (!parent) return;
    setPhase("busy");
    const { data, error } = await supabaseBrowser().rpc("stop_recording", { p_parent_id: parent.id });
    if (error) { toast(errorText(error), { tone: "error" }); return setPhase(file ? "failed" : "native"); }
    const p = data as Parent;
    if (file) uploadParentVideo(file, butcher.id, p.id);
    router.replace(`/butcher/parent/${p.id}/photos`);
  }

  function stop() {
    const r = rec.current;
    if (!r) return;
    r.onstop = () => {
      stream.current?.getTracks().forEach((t) => t.stop());
      const blob = new Blob(chunks.current, { type: r.mimeType || "video/webm" });
      if (!blob.size) return setPhase("failed");
      finish(blob);
    };
    try { r.stop(); } catch { setPhase("failed"); }
  }

  function again() {
    stream.current?.getTracks().forEach((t) => t.stop());
    setPhase("starting");
  }

  async function discard() {
    if (!parent) return;
    stream.current?.getTracks().forEach((t) => t.stop());
    await supabaseBrowser().rpc("discard_parent", { p_parent_id: parent.id });
    router.replace("/butcher");
  }

  if (inProgress !== null) {
    return (
      <FlowScreen title={he.flow.inProgress}>
        <p className="m-0 text-[17px]">{he.flow.inProgressHint}</p>
        <button type="button" className="sr-cbtn sr-cbtn--new" onClick={async () => {
          const { data } = await supabaseBrowser().from("parents").select("*").eq("id", inProgress).maybeSingle();
          router.replace(data ? parentStep(data as Parent) : "/butcher");
        }}>{he.flow.backToIt}</button>
        <button type="button" className="sr-cbtn sr-cbtn--quiet" onClick={() => start(true)}>{he.flow.pauseAndNew}</button>
      </FlowScreen>
    );
  }

  const mm = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
  const live = phase === "recording" || phase === "paused";
  return (
    <FlowScreen title={he.flow.recTitle} sub={he.flow.recHint} back={null}
      footer={live ? (
        <>
          <button type="button" className="sr-cbtn sr-cbtn--new" onClick={stop}>{he.flow.stop}</button>
          <button type="button" className="sr-cbtn sr-cbtn--quiet" onClick={() => {
            const r = rec.current; if (!r) return;
            if (phase === "recording") { r.pause(); setPhase("paused"); } else { r.resume(); setPhase("recording"); }
          }}>{phase === "recording" ? he.flow.pause : he.flow.resumeRec}</button>
        </>
      ) : phase === "failed" ? (
        <>
          <button type="button" className="sr-cbtn sr-cbtn--new" onClick={() => finish(null)}>{he.flow.continueWithout}</button>
          <button type="button" className="sr-cbtn sr-cbtn--quiet" onClick={again}>{he.flow.recAgain}</button>
        </>
      ) : phase === "native" ? (
        <>
          <button type="button" className="sr-cbtn sr-cbtn--new" onClick={() => fileInput.current?.click()}>{he.flow.openCamera}</button>
          <button type="button" className="sr-cbtn sr-cbtn--quiet" onClick={() => finish(null)}>{he.flow.continueWithout}</button>
        </>
      ) : null}>
      <input ref={fileInput} hidden type="file" accept="video/*" capture="environment"
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) finish(f); }} />

      <div className="relative aspect-[3/4] max-h-[62dvh] overflow-hidden rounded-3xl bg-black">
        <video ref={video} muted playsInline className="h-full w-full object-cover" />
        {live && (
          <div className="absolute inset-x-3 top-3 flex items-center justify-between">
            <span className="flex items-center gap-2 rounded-full bg-black/60 px-3 py-1.5 text-sm font-bold text-white">
              <span className={phase === "recording" ? "live-dot" : "size-2.5 rounded-full bg-white/60"} />
              {phase === "recording" ? he.flow.recording : he.flow.recPaused}
            </span>
            <span className="ltr rounded-full bg-black/60 px-3 py-1.5 font-[family-name:var(--font-plex-mono)] text-lg font-bold text-white">{mm}</span>
          </div>
        )}
        {(phase === "starting" || phase === "busy" || !parent) && <div className="absolute inset-0 grid place-items-center text-white"><Spinner /></div>}
        {phase === "native" && <p className="absolute inset-x-6 top-1/2 m-0 -translate-y-1/2 text-center text-white/85">{he.flow.cameraOff}</p>}
        {phase === "failed" && <p className="absolute inset-x-6 top-1/2 m-0 -translate-y-1/2 text-center text-xl font-bold text-white">{he.flow.recFailed}</p>}
      </div>
      {parent && <button type="button" className="min-h-11 self-center text-sm font-semibold text-stone underline" onClick={() => setDiscarding(true)}>{he.flow.discard}</button>}
      <ConfirmDialog open={discarding} text={he.flow.discard} confirmLabel={he.flow.discard} danger
        onConfirm={discard} onCancel={() => setDiscarding(false)} />
    </FlowScreen>
  );
}

export default function Page() {
  return <Suspense><Recording /></Suspense>;
}
