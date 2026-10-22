"use client";
// BarcodeScanner (BUTCHER_FLOW §9.4, W5): the phone's camera — BarcodeDetector where the browser has it, otherwise
// @zxing/browser — and, for the counter station, a USB scanner that types fast and ends with Enter. Typing the code
// is always possible. Hands back what was read, classified (W6): a SoloR label or a scale label.
import { useEffect, useRef, useState } from "react";
import { BottomSheet } from "../../ui";
import { he } from "@/lib/i18n/he";
import { classifyScan, type Scan } from "@/lib/barcode";

type Detector = { detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]> };

export function BarcodeScanner({ open, onClose, onScan, title }: {
  open: boolean; onClose: () => void; onScan: (scan: Scan) => void; title?: string;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [camera, setCamera] = useState<"starting" | "on" | "off">("starting");
  const [typed, setTyped] = useState("");
  const done = useRef(false);

  const finish = (text: string) => {
    if (done.current || !text.trim()) return;
    done.current = true;
    navigator.vibrate?.(60);
    onScan(classifyScan(text));
  };

  // the camera
  useEffect(() => {
    if (!open) return;
    done.current = false;
    let stream: MediaStream | null = null;
    let stopZxing: (() => void) | null = null;
    let timer: number | undefined;
    let alive = true;
    (async () => {
      try {
        const el = video.current;
        if (!el || !navigator.mediaDevices?.getUserMedia) throw new Error("no camera");
        const Native = (window as unknown as { BarcodeDetector?: new (o: object) => Detector }).BarcodeDetector;
        if (Native) {
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
          if (!alive) return;
          el.srcObject = stream;
          await el.play();
          setCamera("on");
          const det = new Native({ formats: ["ean_13", "qr_code", "code_128", "ean_8"] });
          const tick = async () => {
            if (!alive) return;
            try {
              const found = await det.detect(el);
              if (found[0]?.rawValue) return finish(found[0].rawValue);
            } catch { /* frame not ready */ }
            timer = window.setTimeout(tick, 200);
          };
          tick();
        } else {
          const { BrowserMultiFormatReader } = await import("@zxing/browser");
          const reader = new BrowserMultiFormatReader();
          const controls = await reader.decodeFromConstraints({ video: { facingMode: "environment" } }, el, (res) => {
            if (res) finish(res.getText());
          });
          if (!alive) return controls.stop();
          stopZxing = () => controls.stop();
          setCamera("on");
        }
      } catch {
        if (alive) setCamera("off");
      }
    })();
    return () => {
      alive = false;
      window.clearTimeout(timer);
      stopZxing?.();
      stream?.getTracks().forEach((t) => t.stop());
      setCamera("starting");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // a USB scanner types quickly and ends with Enter, wherever the focus is
  useEffect(() => {
    if (!open) return;
    let buf = "";
    let last = 0;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;      // the typed field handles itself
      const now = Date.now();
      if (now - last > 80) buf = "";
      last = now;
      if (e.key === "Enter") { if (buf.length >= 4) finish(buf); buf = ""; return; }
      if (e.key.length === 1) buf += e.key;
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;
  return (
    <BottomSheet open onClose={onClose} title={title ?? he.flow.scanner}>
      <div className="flex flex-col gap-3 pb-2">
        <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-black">
          <video ref={video} muted playsInline className="h-full w-full object-cover" />
          {camera === "on" && <div aria-hidden className="pointer-events-none absolute inset-x-[12%] top-1/2 h-[2px] -translate-y-1/2 bg-[#e3262e] shadow-[0_0_12px_#e3262e]" />}
          {camera === "off" && <p className="absolute inset-x-4 top-1/2 m-0 -translate-y-1/2 text-center text-sm text-white/80">{he.flow.noCamera}</p>}
        </div>
        <p className="m-0 text-center text-sm text-stone">{he.flow.usbReady}</p>
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); finish(typed); }}>
          <input className="sr-cinput ltr flex-1" inputMode="text" autoComplete="off" placeholder={he.flow.typed} aria-label={he.flow.typed}
            value={typed} onChange={(e) => setTyped(e.target.value)} />
          <button type="submit" className="sr-cchip" disabled={!typed.trim()}>{he.flow.find}</button>
        </form>
      </div>
    </BottomSheet>
  );
}
