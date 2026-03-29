/**
 * Client-side image compression and thumbnail generation utilities.
 * Runs in the browser using Canvas API.
 */

const MAX_VIDEO_SIZE = 50 * 1024 * 1024; // 50MB

/**
 * Compress an image file by resizing to maxDimension on longest side.
 * Returns a JPEG blob.
 */
export async function compressImage(
  file: File,
  maxDimension = 1920,
  quality = 0.85
): Promise<{ blob: Blob; width: number; height: number }> {
  const img = await loadImage(file);

  let { width, height } = img;
  if (width > maxDimension || height > maxDimension) {
    if (width > height) {
      height = Math.round((height * maxDimension) / width);
      width = maxDimension;
    } else {
      width = Math.round((width * maxDimension) / height);
      height = maxDimension;
    }
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0, width, height);

  const blob = await canvasToBlob(canvas, "image/jpeg", quality);
  return { blob, width, height };
}

/**
 * Generate a square thumbnail from an image file.
 * Crops center and resizes to `size` x `size`.
 */
export async function generateThumbnail(
  file: File,
  size = 400
): Promise<Blob> {
  const img = await loadImage(file);

  const minDim = Math.min(img.width, img.height);
  const sx = (img.width - minDim) / 2;
  const sy = (img.height - minDim) / 2;

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, size, size);

  return canvasToBlob(canvas, "image/jpeg", 0.8);
}

/**
 * Extract the first frame of a video file as a JPEG blob.
 * Adds video to DOM (hidden) for iOS Safari compatibility.
 */
export async function extractVideoFrame(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    video.autoplay = false;
    // Hide but keep in DOM — iOS Safari requires this
    video.style.position = "fixed";
    video.style.top = "-9999px";
    video.style.width = "1px";
    video.style.height = "1px";
    video.style.opacity = "0";
    document.body.appendChild(video);

    const url = URL.createObjectURL(file);

    const cleanup = () => {
      URL.revokeObjectURL(url);
      video.remove();
    };

    // Timeout: if frame extraction takes >15s, bail out
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("Video frame extraction timed out"));
    }, 15000);

    video.onloadeddata = () => {
      // Seek to 0.5s or 0 if very short
      video.currentTime = Math.min(0.5, video.duration / 2);
    };

    video.onseeked = () => {
      clearTimeout(timeout);
      const canvas = document.createElement("canvas");
      canvas.width = Math.min(video.videoWidth, 800);
      canvas.height = Math.round(
        (canvas.width * video.videoHeight) / video.videoWidth
      );
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      cleanup();
      canvasToBlob(canvas, "image/jpeg", 0.8).then(resolve).catch(reject);
    };

    video.onerror = () => {
      clearTimeout(timeout);
      cleanup();
      reject(new Error("Failed to load video"));
    };

    video.src = url;
    video.load();
  });
}

/**
 * Validate video file size.
 * Returns an error message if invalid, null if OK.
 */
export function validateVideo(file: File): string | null {
  if (file.size > MAX_VIDEO_SIZE) {
    const sizeMB = Math.round(file.size / 1024 / 1024);
    return `Video is ${sizeMB}MB. Maximum is 50MB.`;
  }
  return null;
}

/**
 * Determine if a file is a video based on MIME type.
 */
export function isVideoFile(file: File): boolean {
  return file.type.startsWith("video/");
}

// --- Helpers ---

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load image"));
    };
    img.src = url;
  });
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Canvas toBlob failed"));
      },
      type,
      quality
    );
  });
}
