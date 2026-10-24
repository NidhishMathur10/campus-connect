"use client";

import { useEffect, useRef, useState } from "react";
import { CameraOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { normalizePickupCode } from "@/config/sports";

/** Minimal typing for the browser BarcodeDetector API (not in lib.dom yet). */
interface DetectorLike {
  detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>;
}
type DetectorCtor = (new (opts: { formats: string[] }) => DetectorLike) & { getSupportedFormats?: () => Promise<string[]> };

type ScanState = "starting" | "scanning" | "denied" | "failed";

const READER_ID = "pickup-qr-reader";

/**
 * Live camera QR reader. Uses the browser BarcodeDetector where it exists and falls back to html5-qrcode.
 * Prefers the back camera. Only ever reports a string that looks like a pickup code; anything else is ignored.
 */
export function QrScanner({ onCode, onManual }: { onCode: (code: string) => void; onManual: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const onCodeRef = useRef(onCode);
  const [state, setState] = useState<ScanState>("starting");
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    onCodeRef.current = onCode;
  }, [onCode]);

  useEffect(() => {
    let stopped = false;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    let html5: { stop: () => Promise<void>; clear: () => void; isScanning?: boolean } | null = null;

    const found = (raw: string) => {
      const code = normalizePickupCode(raw);
      if (!code || stopped) return;
      stopped = true;
      onCodeRef.current(code);
    };
    const fail = (err: unknown) => {
      if (stopped) return;
      const name = err instanceof Error ? err.name : "";
      setState(name === "NotAllowedError" || name === "SecurityError" || /permission|denied/i.test(String(err)) ? "denied" : "failed");
    };

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) return fail(new Error("unsupported"));
      const Detector = (window as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
      let useNative = false;
      if (Detector) {
        try {
          useNative = !Detector.getSupportedFormats || (await Detector.getSupportedFormats()).includes("qr_code");
        } catch {
          useNative = false;
        }
      }

      if (useNative && Detector) {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
          if (stopped) return stream.getTracks().forEach((t) => t.stop());
          const video = videoRef.current;
          if (!video) return;
          video.srcObject = stream;
          await video.play();
          setState("scanning");
          const detector = new Detector({ formats: ["qr_code"] });
          timer = setInterval(async () => {
            if (stopped || video.readyState < 2) return;
            try {
              const hits = await detector.detect(video);
              for (const h of hits) found(h.rawValue);
            } catch {
              /* a bad frame is fine, try the next one */
            }
          }, 250);
        } catch (err) {
          fail(err);
        }
        return;
      }

      // Fallback for browsers without BarcodeDetector (Safari, Firefox).
      setFallback(true);
      try {
        const { Html5Qrcode } = await import("html5-qrcode");
        if (stopped) return;
        const reader = new Html5Qrcode(READER_ID, { verbose: false });
        html5 = reader;
        await reader.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: (w, h) => ({ width: Math.round(Math.min(w, h) * 0.75), height: Math.round(Math.min(w, h) * 0.75) }) },
          (text) => found(text),
          () => {},
        );
        if (!stopped) setState("scanning");
      } catch (err) {
        fail(err);
      }
    }
    void start();

    return () => {
      stopped = true;
      if (timer) clearInterval(timer);
      stream?.getTracks().forEach((t) => t.stop());
      if (html5) {
        const h = html5;
        h.stop().then(() => h.clear()).catch(() => {});
      }
    };
  }, []);

  if (state === "denied" || state === "failed") {
    return (
      <div className="space-y-3 rounded-2xl bg-warning-bg p-4 text-warning-fg">
        <p className="flex items-center gap-2 font-bold">
          <CameraOff className="size-5" /> {state === "denied" ? "Camera access was blocked" : "Couldn't open the camera"}
        </p>
        <p className="text-sm">
          {state === "denied"
            ? "To scan, allow camera access for this site in your browser settings (the camera icon next to the address), then try again."
            : "This device or browser can't start the camera here. Nothing is wrong with the reservation."}{" "}
          You can type the 6-character code instead.
        </p>
        <Button onClick={onManual} className="w-full">Enter the code manually</Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="relative mx-auto aspect-square w-full max-w-sm overflow-hidden rounded-3xl border border-border bg-surface-inverse">
        {fallback ? <div id={READER_ID} className="size-full" /> : <video ref={videoRef} muted playsInline className="size-full object-cover" />}
        {state === "starting" && (
          <div className="absolute inset-0 grid place-items-center gap-2 bg-surface-inverse text-text-inverse">
            <div className="flex flex-col items-center gap-2 px-6 text-center text-sm">
              <Loader2 className="size-6 animate-spin" />
              Starting the camera… if your browser asks, tap <b>Allow</b> so we can read the QR code.
            </div>
          </div>
        )}
      </div>
      <p className="text-center text-sm text-text-muted">Hold the student&apos;s pickup QR inside the frame.</p>
      <Button variant="outline" className="w-full" onClick={onManual}>Enter the code manually instead</Button>
    </div>
  );
}
