"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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

async function setTorch(
  track: MediaStreamTrack | null,
  enabled: boolean,
): Promise<boolean> {
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

async function requestCameraStream(): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Caméra non supportée sur ce navigateur");
  }

  const attempts: MediaStreamConstraints[] = [
    {
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1280 },
        height: { ideal: 960 },
      },
      audio: false,
    },
    {
      video: { facingMode: "environment" },
      audio: false,
    },
    {
      video: true,
      audio: false,
    },
  ];

  let lastError: unknown;
  for (const constraints of attempts) {
    try {
      return await navigator.mediaDevices.getUserMedia(constraints);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("Impossible d'ouvrir la caméra");
}

export function ScannerPanel({
  puzzleId,
  onDetected,
  initialPreview,
}: {
  puzzleId: string;
  onDetected: (payload: {
    scan: PuzzleScan;
    pieces: PuzzlePiece[];
    warnings: string[];
  }) => void;
  /** Last scan image so the viewport is not empty after reload. */
  initialPreview?: string | null;
}) {
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);

  const [previewOverride, setPreviewOverride] = useState<string | null>(null);
  const preview = previewOverride ?? initialPreview ?? null;
  const [rotation, setRotation] = useState(0);
  const [status, setStatus] = useState<
    "idle" | "camera" | "analyzing" | "done" | "error"
  >("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [flashOn, setFlashOn] = useState(false);
  const [flashAvailable, setFlashAvailable] = useState(false);
  const [flashBusy, setFlashBusy] = useState(false);
  const [startingLive, setStartingLive] = useState(false);

  const processor = useRef(new PuzzleImageProcessor());
  const detector = useRef(new PuzzlePieceDetector());

  const stopCamera = useCallback(async () => {
    const track = trackRef.current;
    if (track) {
      await setTorch(track, false);
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    trackRef.current = null;
    const video = videoRef.current;
    if (video) {
      video.srcObject = null;
    }
    setCameraOn(false);
    setFlashOn(false);
    setFlashAvailable(false);
  }, []);

  // Attach stream only after <video> is mounted (fixes black / empty preview)
  useEffect(() => {
    if (!cameraOn) return;
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!video || !stream) return;

    video.srcObject = stream;
    video.muted = true;
    video.setAttribute("playsinline", "true");
    video.setAttribute("webkit-playsinline", "true");

    const play = async () => {
      try {
        await video.play();
      } catch {
        // Autoplay can fail until a gesture; user already tapped Photo/Live
        try {
          await video.play();
        } catch {
          setMessage(
            "Aperçu caméra bloqué — utilise Photo (appareil natif) ou Importer.",
          );
        }
      }
    };
    void play();

    return () => {
      // Don't stop tracks here — stopCamera owns lifecycle
    };
  }, [cameraOn]);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const startLiveCamera = async () => {
    setStartingLive(true);
    setMessage("Ouverture de la caméra…");
    try {
      await stopCamera();
      const stream = await requestCameraStream();
      streamRef.current = stream;
      const track = stream.getVideoTracks()[0] ?? null;
      trackRef.current = track;
      const supportsTorch = trackSupportsTorch(track);
      setFlashAvailable(supportsTorch);
      setFlashOn(false);
      setCameraOn(true);
      setStatus("camera");
      setMessage(
        supportsTorch
          ? "Caméra live — active le flash si besoin, puis Capturer."
          : "Caméra live prête — Capturer pour prendre la photo.",
      );
    } catch (error) {
      setStatus("error");
      setCameraOn(false);
      const name =
        error instanceof DOMException ? error.name : "";
      if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        setMessage(
          "Permission caméra refusée. Autorise l'accès dans Réglages, ou utilise Photo / Importer.",
        );
      } else if (name === "NotFoundError" || name === "DevicesNotFoundError") {
        setMessage("Aucune caméra trouvée — utilise Photo ou Importer.");
      } else {
        setMessage(
          "Caméra live indisponible dans ce navigateur — utilise Photo (appareil natif).",
        );
      }
      // Fallback: open native camera capture
      cameraInputRef.current?.click();
    } finally {
      setStartingLive(false);
    }
  };

  /** Reliable path on iOS / in-app browsers: system camera UI */
  const openNativeCamera = () => {
    setMessage("Ouverture de l'appareil photo…");
    cameraInputRef.current?.click();
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
    if (!video.videoWidth) {
      setMessage("Flux vidéo pas prêt — attends l'aperçu ou utilise Photo.");
      return;
    }

    let pulsed = false;
    if (flashAvailable && !flashOn) {
      pulsed = await setTorch(trackRef.current, true);
      if (pulsed) {
        await new Promise((r) => setTimeout(r, 180));
      }
    } else if (flashOn) {
      await new Promise((r) => setTimeout(r, 80));
    }

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
    setPreviewOverride(dataUrl);

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
    await stopCamera();
    const reader = new FileReader();
    reader.onload = () => {
      setPreviewOverride(String(reader.result));
      setRotation(0);
      setStatus("idle");
      setMessage("Image prête — lance Valider & analyser.");
    };
    reader.onerror = () => {
      setStatus("error");
      setMessage("Impossible de lire cette image.");
    };
    reader.readAsDataURL(file);
  };

  const rotate = async () => {
    if (!preview) return;
    const next = (rotation + 90) % 360;
    const rotated = await processor.current.rotateDataUrl(preview, 90);
    setPreviewOverride(rotated);
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

  const showLive = cameraOn;
  const showPreview = !showLive && Boolean(preview);

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
        {/* Always mounted so refs work when live starts */}
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className={`aspect-[4/3] w-full bg-black object-cover ${
            showLive ? "block" : "hidden"
          }`}
        />

        {showPreview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={preview!}
            alt="Aperçu scan"
            className="aspect-[4/3] w-full object-contain"
          />
        ) : null}

        {!showLive && !showPreview ? (
          <div className="flex aspect-[4/3] items-center justify-center bg-[radial-gradient(circle_at_30%_20%,#1a2330,transparent_50%),linear-gradient(160deg,#0b0d10,#121820)]">
            <p className="px-6 text-center text-sm text-zinc-400">
              Photographie ou importe un lot de pièces
            </p>
          </div>
        ) : null}

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
            >
              {flashOn ? "Flash ON" : "Flash"}
            </button>
          </div>
        )}

        {status === "analyzing" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/70">
            <div className="animate-pulse text-sm text-cyan-200">
              Analyse des pièces…
            </div>
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

      {/* Native camera (capture) — most reliable on iPhone */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0] ?? null;
          e.target.value = "";
          void onFile(file);
        }}
      />

      {/* Gallery only */}
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0] ?? null;
          e.target.value = "";
          void onFile(file);
        }}
      />

      <div className="flex flex-wrap gap-2">
        {!cameraOn ? (
          <>
            <PrimaryButton
              disabled={startingLive}
              onClick={() => openNativeCamera()}
            >
              Photo
            </PrimaryButton>
            <PrimaryButton
              variant="ghost"
              disabled={startingLive}
              onClick={() => void startLiveCamera()}
            >
              {startingLive ? "Ouverture…" : "Caméra live"}
            </PrimaryButton>
          </>
        ) : (
          <PrimaryButton onClick={() => void captureFromCamera()}>
            Capturer
          </PrimaryButton>
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
        <PrimaryButton
          variant="ghost"
          onClick={() => galleryInputRef.current?.click()}
        >
          Importer
        </PrimaryButton>
        <PrimaryButton
          variant="ghost"
          disabled={!preview || cameraOn}
          onClick={() => void rotate()}
        >
          Rotation
        </PrimaryButton>
      </div>

      <PrimaryButton
        disabled={!preview || status === "analyzing" || cameraOn}
        onClick={() => void analyze()}
      >
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
