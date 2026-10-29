"use client";
// S1 — recording the butchering (BUTCHER_FLOW §5). The parent is created as the screen opens and the recording
// starts by itself: a live view, a running clock and the red "מקליט" dot, pause / resume, and "הפסק הקלטה".
// Stopping goes on to the photos of the cut (BUTCHER_FLOW_v2 §3); the video goes on uploading in the background. When the browser cannot record, the phone's own camera does
// (a file capture). A recording that did not save says so: "המשך בלי סרטון" / "הקלט שוב".
// The camera (founders 28.10.2026): a camera on a cable (the shop's OBSBOT) is taken over the tablet's own, the
// butcher can pick another from the list (kept on the device), and a video shot elsewhere can be uploaded instead.
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
import { cameraConstraints, externalCamera, recordsInApp, saveCamera, savedCamera, setRecordsInApp } from "@/lib/camera";
import type { Parent } from "@/lib/types";

type Phase = "starting" | "camera" | "recording" | "paused" | "native" | "failed" | "busy" | "app";

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
  const uploadInput = useRef<HTMLInputElement>(null);
  const started = useRef(false);
  const [cams, setCams] = useState<MediaDeviceInfo[]>([]);
  const [camId, setCamId] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);

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

  // the camera: live view and recording in the browser where it can — the chosen camera, or one on a cable, or the back one
  const openCamera = useCallback(async () => {
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") throw new Error("unsupported");
      const want = savedCamera();
      let s = await navigator.mediaDevices.getUserMedia({ video: cameraConstraints(want), audio: true })
        .catch(() => (want ? (saveCamera(null), navigator.mediaDevices.getUserMedia({ video: cameraConstraints(null), audio: true })) : Promise.reject()));
      // the names show only once the camera is allowed: now a camera on a cable can be found and taken
      const all = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "videoinput");
      setCams(all);
      const plugged = !want ? externalCamera(all) : null;
      if (plugged && s.getVideoTracks()[0]?.getSettings().deviceId !== plugged) {
        const t = await navigator.mediaDevices.getUserMedia({ video: cameraConstraints(plugged), audio: true }).catch(() => null);
        if (t) { s.getTracks().forEach((x) => x.stop()); s = t; saveCamera(plugged); }
      }
      setCamId(s.getVideoTracks()[0]?.getSettings().deviceId ?? null);
      stream.current = s;
      if (video.current) { video.current.srcObject = s; await video.current.play().catch(() => {}); }
      const mime = MIME.find((m) => MediaRecorder.isTypeSupported(m));
      const wide = (s.getVideoTracks()[0]?.getSettings().width ?? 0) >= 1600;
      const r = new MediaRecorder(s, mime ? { mimeType: mime, videoBitsPerSecond: wide ? 4_000_000 : 2_500_000 } : undefined);
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
  // a shop that records in the camera's own app gets the upload screen, no camera of the tablet
  useEffect(() => { if (parent && phase === "starting") { if (recordsInApp()) setPhase("app"); else openCamera(); } }, [parent, phase, openCamera]);
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

  // another camera: what was recorded so far is dropped and the recording starts again on it
  function switchCamera(id: string) {
    setPicking(false);
    if (id === camId) return;
    saveCamera(id);
    const r = rec.current;
    if (r && r.state !== "inactive") { r.ondataavailable = null; r.onstop = null; try { r.stop(); } catch { /* ignore */ } }
    rec.current = null;
    chunks.current = [];
    stream.current?.getTracks().forEach((t) => t.stop());
    setPhase("starting");
  }

  // the camera's own app from now on (kept on the tablet), or back to recording here
  function recordInApp(on: boolean) {
    setRecordsInApp(on);
    const r = rec.current;
    if (r && r.state !== "inactive") { r.ondataavailable = null; r.onstop = null; try { r.stop(); } catch { /* ignore */ } }
    rec.current = null;
    chunks.current = [];
    stream.current?.getTracks().forEach((t) => t.stop());
    setPhase(on ? "app" : "starting");
  }

  // a video shot elsewhere (the camera's own app): it stands for the recording
  function uploaded(f: File) {
    const r = rec.current;
    if (r && r.state !== "inactive") { r.ondataavailable = null; r.onstop = null; try { r.stop(); } catch { /* ignore */ } }
    stream.current?.getTracks().forEach((t) => t.stop());
    finish(f);
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
          // still recording: it is this very screen, so take it up here (the page does not open again)
          if (data && (data as Parent).status === "recording") { setInProgress(null); setParent(data as Parent); return; }
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
      ) : phase === "app" ? (
        <>
          <button type="button" className="sr-cbtn sr-cbtn--new" onClick={() => uploadInput.current?.click()}>{he.flow.uploadIt}</button>
          <button type="button" className="sr-cbtn sr-cbtn--quiet" onClick={() => finish(null)}>{he.flow.continueWithout}</button>
        </>
      ) : phase === "native" ? (
        <>
          <button type="button" className="sr-cbtn sr-cbtn--new" onClick={() => fileInput.current?.click()}>{he.flow.openCamera}</button>
          <button type="button" className="sr-cbtn sr-cbtn--quiet" onClick={() => finish(null)}>{he.flow.continueWithout}</button>
        </>
      ) : null}>
      <input ref={fileInput} hidden type="file" accept="video/*" capture="environment"
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) finish(f); }} />
      <input ref={uploadInput} hidden type="file" accept="video/*"
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) uploaded(f); }} />

      {phase === "app" ? (
        <div className="flex flex-col gap-3 rounded-3xl bg-ink-2 p-5 text-start">
          <b className="text-[19px]">{he.flow.inAppTitle}</b>
          <ol className="m-0 flex list-none flex-col gap-2.5 p-0 text-[16px] leading-snug">
            {he.flow.inAppSteps.map((t, i) => (
              <li key={i} className="flex gap-3"><span className="grid size-7 shrink-0 place-items-center rounded-full bg-brand text-sm font-black text-on-brand">{i + 1}</span>{t}</li>
            ))}
          </ol>
        </div>
      ) : (
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
        {live && cams.length > 1 && (
          <button type="button" onClick={() => setPicking(true)}
            className="absolute end-3 bottom-3 flex min-h-11 max-w-[70%] items-center gap-2 rounded-full bg-black/65 px-4 text-sm font-bold text-white">
            <span aria-hidden>⟳</span>
            <span className="truncate">{he.flow.camera}: {camName(cams, camId)}</span>
          </button>
        )}
        {picking && (
          <div className="absolute inset-0 flex flex-col justify-end bg-black/60 p-3" role="dialog" aria-label={he.flow.cameraPick}>
            <div className="flex flex-col gap-2 rounded-2xl bg-ink-2 p-3 text-start">
              <b className="text-[17px]">{he.flow.cameraPick}</b>
              <span className="text-[13px] text-stone">{he.flow.cameraRestart}</span>
              {cams.map((c, i) => (
                <button key={c.deviceId} type="button" onClick={() => switchCamera(c.deviceId)} aria-pressed={c.deviceId === camId}
                  className="sr-cbtn sr-cbtn--quiet !justify-start aria-pressed:!bg-brand aria-pressed:!text-on-brand">
                  {c.label || he.flow.cameraN(i + 1)}
                </button>
              ))}
              <button type="button" className="min-h-11 text-sm font-semibold text-stone underline" onClick={() => setPicking(false)}>{he.app.cancel}</button>
            </div>
          </div>
        )}
        {(phase === "starting" || phase === "busy" || !parent) && <div className="absolute inset-0 grid place-items-center text-white"><Spinner /></div>}
        {phase === "native" && <p className="absolute inset-x-6 top-1/2 m-0 -translate-y-1/2 text-center text-white/85">{he.flow.cameraOff}</p>}
        {phase === "failed" && <p className="absolute inset-x-6 top-1/2 m-0 -translate-y-1/2 text-center text-xl font-bold text-white">{he.flow.recFailed}</p>}
      </div>
      )}
      {parent && (live || phase === "native") && (
        <button type="button" className="min-h-11 self-center text-sm font-semibold underline" onClick={() => uploadInput.current?.click()}>{he.flow.uploadVideo}</button>
      )}
      {parent && (live || phase === "native") && (
        <button type="button" className="min-h-11 self-center text-sm font-semibold underline" onClick={() => recordInApp(true)}>{he.flow.inApp}</button>
      )}
      {parent && phase === "app" && (
        <button type="button" className="min-h-11 self-center text-sm font-semibold underline" onClick={() => recordInApp(false)}>{he.flow.recordHere}</button>
      )}
      {parent && <button type="button" className="min-h-11 self-center text-sm font-semibold text-stone underline" onClick={() => setDiscarding(true)}>{he.flow.discard}</button>}
      <ConfirmDialog open={discarding} text={he.flow.discard} confirmLabel={he.flow.discard} danger
        onConfirm={discard} onCancel={() => setDiscarding(false)} />
    </FlowScreen>
  );
}

/** the camera's name as the tablet gives it, shortened */
function camName(cams: MediaDeviceInfo[], id: string | null): string {
  const i = cams.findIndex((c) => c.deviceId === id);
  if (i < 0) return he.flow.cameraN(1);
  return (cams[i].label || he.flow.cameraN(i + 1)).replace(/\s*\([0-9a-f]{4}:[0-9a-f]{4}\)\s*$/i, "");
}

export default function Page() {
  return <Suspense><Recording /></Suspense>;
}
