/**
 * Client-side image compression and thumbnail generation utilities.
 * Runs in the browser using Canvas API.
 */

const MAX_VIDEO_SIZE = 100 * 1024 * 1024; // 100MB
const SKIP_COMPRESS_MAX_SIZE = 50 * 1024 * 1024; // 50MB — skip if already reasonable

interface CompressVideoOptions {
  maxHeight?: number;
  bitrate?: number;
  onProgress?: (pct: number) => void;
}

/**
 * Compress a video to 720p max height at ~2.5Mbps using Canvas + MediaRecorder.
 * Plays the video in real-time and re-encodes frame by frame.
 * Skips compression if video is already ≤720p AND <10MB.
 */
export async function compressVideo(
  file: File,
  options: CompressVideoOptions = {}
): Promise<{ blob: Blob; width: number; height: number }> {
  const { maxHeight = 720, bitrate = 2_500_000, onProgress } = options;

  // Load video to read metadata
  const video = document.createElement("video");
  video.preload = "auto";
  video.muted = true;
  video.playsInline = true;
  // Hidden but in DOM for iOS Safari compatibility
  video.style.position = "fixed";
  video.style.top = "-9999px";
  video.style.width = "1px";
  video.style.height = "1px";
  video.style.opacity = "0";
  document.body.appendChild(video);

  const url = URL.createObjectURL(file);
  video.src = url;

  const cleanup = () => {
    URL.revokeObjectURL(url);
    video.pause();
    video.remove();
  };

  let audioCtx: AudioContext | null = null;

  try {
    // Wait for metadata
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("Failed to load video for compression"));
      video.load();
    });

    const origW = video.videoWidth;
    const origH = video.videoHeight;
    const duration = video.duration;

    // Skip compression if already small enough — but always re-encode
    // .mov / QuickTime files (e.g. Live Photos) to ensure browser-compatible
    // H.264 MP4 output with proper audio
    const isMov = file.name.toLowerCase().endsWith(".mov") || file.type === "video/quicktime";
    if (!isMov && origH <= maxHeight && file.size < SKIP_COMPRESS_MAX_SIZE) {
      cleanup();
      return { blob: file, width: origW, height: origH };
    }

    // Calculate target dimensions (scale to maxHeight, maintain aspect ratio)
    let targetH = Math.min(origH, maxHeight);
    let targetW = Math.round((origW * targetH) / origH);
    // Ensure even dimensions (codec requirement)
    targetW = targetW & ~1;
    targetH = targetH & ~1;

    // Set up canvas for frame drawing
    const canvas = document.createElement("canvas");
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext("2d")!;

    // Capture video stream from canvas at 30fps
    const canvasStream = canvas.captureStream(30);

    // Capture audio via Web Audio API — works on both Chrome and Safari,
    // even when the video element is muted (muted only silences speakers,
    // Web Audio still processes the audio data).
    try {
      audioCtx = new AudioContext();
      const source = audioCtx.createMediaElementSource(video);
      const dest = audioCtx.createMediaStreamDestination();
      source.connect(dest);
      // Don't connect to audioCtx.destination — keeps compression silent
      for (const track of dest.stream.getAudioTracks()) {
        canvasStream.addTrack(track);
      }
    } catch {
      // Fallback: try captureStream (Chrome)
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const videoStream = (video as any).captureStream?.() || (video as any).mozCaptureStream?.();
        if (videoStream) {
          for (const track of videoStream.getAudioTracks()) {
            canvasStream.addTrack(track);
          }
        }
      } catch {
        console.warn("Video compression: could not capture audio track");
      }
    }

    // Choose MIME type
    let mimeType = "video/mp4";
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      mimeType = "video/webm;codecs=vp9";
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = "video/webm";
      }
    }

    // Set up MediaRecorder
    const chunks: Blob[] = [];
    const recorder = new MediaRecorder(canvasStream, {
      mimeType,
      videoBitsPerSecond: bitrate,
    });
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    // Keep video muted — autoplay policy blocks unmuted playback without user gesture.
    // Audio capture via captureStream() / Web Audio API works regardless of muted state.

    // Start recording and playback
    const compressPromise = new Promise<Blob>((resolve, reject) => {
      // Safety timeout: 2x duration + 10s
      const timeout = setTimeout(() => {
        cancelAnimationFrame(animFrame);
        if (recorder.state === "recording") recorder.stop();
      }, (duration * 2 + 10) * 1000);

      recorder.onstop = () => {
        clearTimeout(timeout);
        resolve(new Blob(chunks, { type: mimeType.split(";")[0] }));
      };
      recorder.onerror = (e) => {
        clearTimeout(timeout);
        reject(e);
      };

      recorder.start(100); // collect data every 100ms
      video.currentTime = 0;
      video.play().catch((err) => {
        clearTimeout(timeout);
        reject(err);
      });

      // Draw frames to canvas
      let animFrame: number;
      const drawFrame = () => {
        if (video.ended || video.paused) return;
        ctx.drawImage(video, 0, 0, targetW, targetH);
        if (onProgress && duration > 0) {
          onProgress(Math.min((video.currentTime / duration) * 100, 100));
        }
        animFrame = requestAnimationFrame(drawFrame);
      };
      drawFrame();

      video.onended = () => {
        cancelAnimationFrame(animFrame);
        // Draw final frame
        ctx.drawImage(video, 0, 0, targetW, targetH);
        onProgress?.(100);
        recorder.stop();
      };
    });

    const blob = await compressPromise;
    audioCtx?.close().catch(() => {});
    cleanup();

    return { blob, width: targetW, height: targetH };
  } catch (err) {
    audioCtx?.close().catch(() => {});
    cleanup();
    throw err;
  }
}

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
      // Crop center-square and resize to 400x400 (matches photo thumbnails)
      const size = 400;
      const minDim = Math.min(video.videoWidth, video.videoHeight);
      const sx = (video.videoWidth - minDim) / 2;
      const sy = (video.videoHeight - minDim) / 2;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(video, sx, sy, minDim, minDim, 0, 0, size, size);

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
    return `Video is ${sizeMB}MB. Maximum is 100MB.`;
  }
  return null;
}

/**
 * Determine if a file is a video based on MIME type.
 */
export function isVideoFile(file: File): boolean {
  return file.type.startsWith("video/");
}

/**
 * Get file extension from a MIME type (e.g. "video/mp4" → "mp4").
 */
export function getExtFromMime(mime: string): string {
  const map: Record<string, string> = {
    "video/mp4": "mp4",
    "video/webm": "webm",
    "image/jpeg": "jpg",
    "image/png": "png",
  };
  return map[mime] || mime.split("/")[1] || "bin";
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
