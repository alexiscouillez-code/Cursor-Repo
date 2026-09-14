"use client";

import { useCallback, useRef, useState } from "react";
import {
  PuzzleImageProcessor,
  PuzzlePieceDetector,
} from "@/lib/vision/PuzzlePieceDetector";
import type { PuzzlePiece, PuzzleScan } from "@/types/puzzle";
import { PrimaryButton } from "@/components/ui/Sheet";

const TIPS = [
  "Surface contrastée (fond uni sombre ou clair)",
  "Bonne luminosité, sans contre-jour",
  "Utilise le flash si la pièce est mal éclairée",
  "Éviter les ombres portées",
  "Ne pas superposer les pièces",
];

type TorchCapableTrack = MediaStreamTrack & {
  getCapabilities?: () => MediaTrackCapabilities & { torch?: boolean };
  getSettings?: () => MediaTrackSettings & { torch?: boolean };
};

async function setTorch(track: MediaStreamTrack | null, enabled: boolean): Promise<boolean> {
  if (!track) return false;
  const capable = track as TorchCapableTrack;
  const caps = capable.getCapabilities?.();
  if (!caps || !("torch" in caps) || !caps.torch) return false;
  try {
    await track.applyConstraints({
      advanced: [{ torch: enabled } as unknown as MediaTrackConstraintSet],
    });
    return true;
  } catch {
    try {
      await track.applyConstraints({
        torch: enabled,
      } as unknown as MediaTrackConstraints);
      return true;
    } catch {
      return false;
    }
  }
}

function trackSupportsTorch(track: MediaStreamTrack | null): boolean {
  if (!track) return false;
  const capable = track as TorchCapableTrack;
  const caps = capable.getCapabilities?.();
  return Boolean(caps && "torch" in caps && caps.torch);
}

export function ScannerPanel({
  puzzleId,
  onDetected,
}: {
  puzzleId: string;
  onDetected: (payload: {
    scan: PuzzleScan;
    pieces: PuzzlePiece[];
    warnings: string[];
  }) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [rotation, setRotation] = useState(0);
  const [status, setStatus] = useState<"idle" | "camera" | "analyzing" | "done" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [flashOn, setFlashOn] = useState(false);
  const [flashAvailable, setFlashAvailable] = useState(false);
  const [flashBusy, setFlashBusy] = useState(false);

  const processor = useRef(new PuzzleImageProcessor());
  const detector = useRef(new PuzzlePieceDetector());

  const stopCamera = useCallback(async () => {
    const track = trackRef.current;
    if (track) {
      await setTorch(track, false);
      track.stop();
    }
    const video = videoRef.current;
    const stream = video?.srcObject as MediaStream | null;
    stream?.getTracks().forEach((t) => t.stop());
    if (video) video.srcObject = null;
    trackRef.current = null;
    setCameraOn(false);
    setFlashOn(false);
    setFlashAvailable(false);
  }, []);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1440 },
        },
        audio: false,
      });
      const track = stream.getVideoTracks()[0] ?? null;
      trackRef.current = track;
      const supportsTorch = trackSupportsTorch(track);
      setFlashAvailable(supportsTorch);
      setFlashOn(false);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraOn(true);
      setStatus("camera");
      setMessage(
        supportsTorch
          ? "Flash disponible — active-le si la lumière est insuffisante."
          : "Flash non disponible sur cet appareil / navigateur.",
      );
    } catch {
      setStatus("error");
      setMessage("Caméra indisponible — importe une photo depuis la galerie.");
    }
  };

  const toggleFlash = async () => {
    if (!flashAvailable || flashBusy) return;
    setFlashBusy(true);
    const next = !flashOn;
    const ok = await setTorch(trackRef.current, next);
    setFlashBusy(false);
    if (!ok) {
      setFlashAvailable(false);
      setFlashOn(false);
      setMessage("Impossible d'activer le flash sur cet appareil.");
      return;
    }
    setFlashOn(next);
    setMessage(next ? "Flash allumé." : "Flash éteint.");
  };

  const captureFromCamera = async () => {
    const video = videoRef.current;
    if (!video) return;

    // Brief torch pulse if flash was off but available — improves low-light shots
    let pulsed = false;
    if (flashAvailable && !flashOn) {
      pulsed = await setTorch(trackRef.current, true);
      if (pulsed) {
        await new Promise((r) => setTimeout(r, 180));
      }
    } else if (flashOn) {
      // keep continuous torch for a short settle before shutter
      await new Promise((r) => setTimeout(r, 80));
    }

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
    setPreview(dataUrl);

    if (pulsed) {
      await setTorch(trackRef.current, false);
    }
    await stopCamera();
    setStatus("idle");
    setMessage("Photo capturée — vérifie l'aperçu puis lance l'analyse.");
  };

  const onFile = async (file: File | null) => {
    if (!file) return;
    if (file.size > 12 * 1024 * 1024) {
      setMessage("Image trop lourde (max 12 Mo).");
      setStatus("error");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setPreview(String(reader.result));
      setRotation(0);
      setStatus("idle");
      setMessage(null);
    };
    reader.readAsDataURL(file);
  };

  const rotate = async () => {
    if (!preview) return;
    const next = (rotation + 90) % 360;
    const rotated = await processor.current.rotateDataUrl(preview, 90);
    setPreview(rotated);
    setRotation(next);
  };

  const analyze = async () => {
    if (!preview) return;
    setStatus("analyzing");
    setMessage("Analyse des pièces…");
    try {
      const dataUrl = preview;
      const img = await processor.current.loadImageElement(dataUrl);
      const imageData = await processor.current.toImageData(img, 1400);
      const scanId = crypto.randomUUID();
      const result = await detector.current.detectFromImageData(imageData, {
        puzzleId,
        scanId,
      });

      const scan: PuzzleScan = {
        id: scanId,
        puzzleId,
        imageDataUrl: dataUrl,
        width: imageData.width,
        height: imageData.height,
        pieceCount: result.pieceCount,
        status: result.pieceCount ? "done" : "failed",
        error: result.pieceCount ? undefined : "Aucune pièce détectée",
        createdAt: Date.now(),
      };

      setStatus(result.pieceCount ? "done" : "error");
      setMessage(
        result.pieceCount
          ? `${result.pieceCount} pièce${result.pieceCount > 1 ? "s" : ""} détectée${result.pieceCount > 1 ? "s" : ""}.`
          : "Aucune pièce détectée.",
      );
      onDetected({
        scan,
        pieces: result.pieces,
        warnings: result.warnings,
      });
    } catch (e) {
      setStatus("error");
      setMessage(e instanceof Error ? e.message : "Échec de l'analyse");
    }
  };

  return (
    <div className="space-y-4 pb-24">
      <div className="rounded-2xl border border-white/10 bg-[#12151a] p-4">
        <p className="mb-2 text-xs uppercase tracking-[0.2em] text-cyan-400/80">
          Conseils de capture
        </p>
        <ul className="space-y-1.5 text-sm text-zinc-300">
          {TIPS.map((tip) => (
            <li key={tip} className="flex gap-2">
              <span className="text-cyan-500">•</span>
              <span>{tip}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-black">
        {cameraOn ? (
          <video ref={videoRef} playsInline muted className="aspect-[4/3] w-full object-cover" />
        ) : preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="Aperçu scan" className="aspect-[4/3] w-full object-contain" />
        ) : (
          <div className="flex aspect-[4/3] items-center justify-center bg-[radial-gradient(circle_at_30%_20%,#1a2330,transparent_50%),linear-gradient(160deg,#0b0d10,#121820)]">
            <p className="px-6 text-center text-sm text-zinc-400">
              Photographie ou importe un lot de pièces
            </p>
          </div>
        )}

        {cameraOn && (
          <div className="absolute right-3 top-3 flex flex-col gap-2">
            <button
              type="button"
              disabled={!flashAvailable || flashBusy}
              onClick={() => void toggleFlash()}
              className={`min-h-12 min-w-12 rounded-full border px-3 text-xs font-semibold tracking-wide shadow-lg backdrop-blur ${
                flashOn
                  ? "border-amber-300/60 bg-amber-400 text-black"
                  : flashAvailable
                    ? "border-white/20 bg-black/55 text-white"
                    : "border-white/10 bg-black/40 text-zinc-500"
              }`}
              aria-pressed={flashOn}
              aria-label={flashOn ? "Éteindre le flash" : "Allumer le flash"}
              title={
                flashAvailable
                  ? flashOn
                    ? "Éteindre le flash"
                    : "Allumer le flash"
                  : "Flash non disponible"
              }
            >
              {flashOn ? "Flash ON" : "Flash"}
            </button>
          </div>
        )}

        {status === "analyzing" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/70">
            <div className="animate-pulse text-sm text-cyan-200">Analyse des pièces…</div>
          </div>
        )}
      </div>

      {message && (
        <p
          className={`text-sm ${status === "error" ? "text-rose-300" : "text-cyan-200"}`}
        >
          {message}
        </p>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
      />

      <div className="flex flex-wrap gap-2">
        {!cameraOn ? (
          <PrimaryButton onClick={() => void startCamera()}>Photo</PrimaryButton>
        ) : (
          <PrimaryButton onClick={() => void captureFromCamera()}>Capturer</PrimaryButton>
        )}
        {cameraOn && (
          <PrimaryButton
            variant={flashOn ? "primary" : "ghost"}
            disabled={!flashAvailable || flashBusy}
            onClick={() => void toggleFlash()}
          >
            {flashOn ? "Flash ON" : "Flash"}
          </PrimaryButton>
        )}
        <PrimaryButton variant="ghost" onClick={() => inputRef.current?.click()}>
          Importer
        </PrimaryButton>
        <PrimaryButton variant="ghost" disabled={!preview} onClick={() => void rotate()}>
          Rotation
        </PrimaryButton>
      </div>

      <PrimaryButton disabled={!preview || status === "analyzing"} onClick={() => void analyze()}>
        Valider & analyser
      </PrimaryButton>

      {cameraOn && (
        <PrimaryButton variant="ghost" onClick={() => void stopCamera()}>
          Fermer la caméra
        </PrimaryButton>
      )}
    </div>
  );
}
