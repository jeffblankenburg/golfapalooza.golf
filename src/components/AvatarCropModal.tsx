"use client";

import { useState, useCallback, useEffect } from "react";
import Cropper, { type Area } from "react-easy-crop";

export function AvatarCropModal({
  file,
  onCancel,
  onConfirm,
  title = "Crop Photo",
}: {
  file: File;
  onCancel: () => void;
  onConfirm: (blob: Blob) => void | Promise<void>;
  title?: string;
}) {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setImageSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const onCropComplete = useCallback((_: Area, pixels: Area) => {
    setCroppedAreaPixels(pixels);
  }, []);

  const handleConfirm = async () => {
    if (!imageSrc || !croppedAreaPixels) return;
    setSaving(true);
    try {
      const blob = await getCroppedBlob(imageSrc, croppedAreaPixels, file.type);
      await onConfirm(blob);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col pt-14 pb-[calc(4rem+env(safe-area-inset-bottom))]">
      <div className="flex items-center justify-between px-4 h-14 text-white flex-shrink-0">
        <button
          onClick={onCancel}
          disabled={saving}
          className="text-sm font-medium px-2 py-1 active:opacity-70 disabled:opacity-50"
        >
          Cancel
        </button>
        <span className="text-sm font-semibold">{title}</span>
        <button
          onClick={handleConfirm}
          disabled={saving || !croppedAreaPixels}
          className="text-sm font-semibold text-green-400 px-2 py-1 active:opacity-70 disabled:opacity-40"
        >
          {saving ? "Saving…" : "Done"}
        </button>
      </div>

      <div className="relative flex-1 bg-black">
        {imageSrc && (
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={1}
            cropShape="round"
            showGrid={false}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
            restrictPosition={false}
          />
        )}
      </div>

      <div className="px-6 py-5 bg-black flex-shrink-0">
        <input
          type="range"
          min={1}
          max={4}
          step={0.01}
          value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
          className="w-full accent-green-500"
        />
      </div>
    </div>
  );
}

async function getCroppedBlob(
  imageSrc: string,
  pixels: Area,
  mimeType: string
): Promise<Blob> {
  const image = await loadImage(imageSrc);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unsupported");

  // Cap output at 512px on the long edge — avatar display is ~96px max.
  const maxOut = 512;
  const size = Math.min(maxOut, pixels.width);
  canvas.width = size;
  canvas.height = size;

  ctx.drawImage(
    image,
    pixels.x,
    pixels.y,
    pixels.width,
    pixels.height,
    0,
    0,
    size,
    size
  );

  const outType = mimeType === "image/png" ? "image/png" : "image/jpeg";
  const quality = outType === "image/jpeg" ? 0.9 : undefined;

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Failed to encode image"))),
      outType,
      quality
    );
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
