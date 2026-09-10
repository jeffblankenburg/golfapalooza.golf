/**
 * Lightweight EXIF DateTimeOriginal parser — no npm dependencies.
 * Reads the first 128KB of a JPEG to extract the date the photo was taken.
 * Must be called BEFORE compressImage() since Canvas export strips EXIF.
 */

const EXIF_DATE_ORIGINAL = 0x9003; // DateTimeOriginal
const EXIF_DATE_TIME = 0x0132; // DateTime (fallback)
const EXIF_SUB_IFD_POINTER = 0x8769;

/**
 * Extract the date a photo was taken from EXIF metadata.
 * Returns null if the file isn't JPEG, has no EXIF, or parsing fails.
 */
export async function extractExifDate(file: File): Promise<Date | null> {
  try {
    // Only parse JPEG files (iOS converts HEIC to JPEG via file input)
    if (!file.type.startsWith("image/jpeg") && !file.name.toLowerCase().match(/\.jpe?g$/)) {
      return null;
    }

    // Read first 128KB — EXIF is always at the start
    const slice = file.slice(0, 128 * 1024);
    const buffer = await slice.arrayBuffer();
    const view = new DataView(buffer);

    // Check JPEG SOI marker
    if (view.getUint16(0) !== 0xffd8) return null;

    // Find APP1 (EXIF) marker
    let offset = 2;
    while (offset < view.byteLength - 4) {
      const marker = view.getUint16(offset);
      if (marker === 0xffe1) {
        // APP1 found
        return parseExifBlock(view, offset + 4);
      }
      // Skip to next marker
      const segLen = view.getUint16(offset + 2);
      offset += 2 + segLen;
    }

    return null;
  } catch {
    return null;
  }
}

function parseExifBlock(view: DataView, offset: number): Date | null {
  // Check "Exif\0\0" header
  if (
    view.getUint8(offset) !== 0x45 || // E
    view.getUint8(offset + 1) !== 0x78 || // x
    view.getUint8(offset + 2) !== 0x69 || // i
    view.getUint8(offset + 3) !== 0x66 || // f
    view.getUint8(offset + 4) !== 0x00 ||
    view.getUint8(offset + 5) !== 0x00
  ) {
    return null;
  }

  const tiffStart = offset + 6;

  // Determine byte order
  const byteOrder = view.getUint16(tiffStart);
  const littleEndian = byteOrder === 0x4949; // "II"
  if (!littleEndian && byteOrder !== 0x4d4d) return null; // "MM"

  // Validate TIFF magic number
  if (view.getUint16(tiffStart + 2, littleEndian) !== 0x002a) return null;

  // Get IFD0 offset
  const ifd0Offset = view.getUint32(tiffStart + 4, littleEndian);

  // Parse IFD0 looking for ExifSubIFD pointer and DateTime
  let dateTime: string | null = null;
  const exifSubIFDOffset = parseIFD(
    view,
    tiffStart,
    tiffStart + ifd0Offset,
    littleEndian,
    (tag, valueOffset, count) => {
      if (tag === EXIF_DATE_TIME) {
        dateTime = readString(view, valueOffset, count);
      }
      if (tag === EXIF_SUB_IFD_POINTER) {
        return view.getUint32(valueOffset, littleEndian);
      }
      return undefined;
    }
  );

  // Parse Exif SubIFD for DateTimeOriginal
  if (exifSubIFDOffset != null) {
    let dateOriginal: string | null = null;
    parseIFD(
      view,
      tiffStart,
      tiffStart + exifSubIFDOffset,
      littleEndian,
      (tag, valueOffset, count) => {
        if (tag === EXIF_DATE_ORIGINAL) {
          dateOriginal = readString(view, valueOffset, count);
        }
        return undefined;
      }
    );
    if (dateOriginal) return parseExifDateString(dateOriginal);
  }

  // Fall back to IFD0 DateTime
  if (dateTime) return parseExifDateString(dateTime);

  return null;
}

function parseIFD(
  view: DataView,
  tiffStart: number,
  ifdOffset: number,
  littleEndian: boolean,
  callback: (tag: number, valueOffset: number, count: number) => number | undefined
): number | undefined {
  if (ifdOffset + 2 > view.byteLength) return undefined;

  const entryCount = view.getUint16(ifdOffset, littleEndian);
  let result: number | undefined;

  for (let i = 0; i < entryCount; i++) {
    const entryOffset = ifdOffset + 2 + i * 12;
    if (entryOffset + 12 > view.byteLength) break;

    const tag = view.getUint16(entryOffset, littleEndian);
    const format = view.getUint16(entryOffset + 2, littleEndian);
    const count = view.getUint32(entryOffset + 4, littleEndian);

    // Calculate byte size of value
    const bytesPerComponent = [0, 1, 1, 2, 4, 8, 1, 1, 2, 4, 8, 4, 8][format] || 1;
    const totalBytes = count * bytesPerComponent;

    // If value fits in 4 bytes, it's inline; otherwise it's an offset
    const valueOffset =
      totalBytes <= 4
        ? entryOffset + 8
        : tiffStart + view.getUint32(entryOffset + 8, littleEndian);

    const r = callback(tag, valueOffset, count);
    if (r !== undefined) result = r;
  }

  return result;
}

function readString(view: DataView, offset: number, count: number): string | null {
  if (offset + count > view.byteLength) return null;
  let str = "";
  for (let i = 0; i < count - 1; i++) {
    // -1 to skip null terminator
    str += String.fromCharCode(view.getUint8(offset + i));
  }
  return str;
}

/**
 * Extract the creation date from a video file.
 *
 * Uses two sources and picks the most reliable:
 *   1. `mvhd` atom in the MP4/MOV container
 *   2. `file.lastModified` (filesystem date — on iOS this is the recording date)
 *
 * The `mvhd` date is the container creation time, which resets when a video is
 * re-encoded, saved from a messaging app, or downloaded. `file.lastModified`
 * is often more stable. We pick the OLDER of the two (more likely to be the
 * original recording date) and discard anything within the last 60 seconds
 * (clear re-encoding artifact).
 */
export async function extractVideoDate(file: File): Promise<Date | null> {
  try {
    if (!file.type.startsWith("video/")) return null;

    const now = Date.now();
    const ONE_MINUTE = 60 * 1000;

    // Source 1: mvhd atom
    let mvhdDate: Date | null = null;
    mvhdDate = await extractMvhdDate(file, 0, Math.min(128 * 1024, file.size));
    if (!mvhdDate && file.size > 128 * 1024) {
      mvhdDate = await extractMvhdDate(
        file,
        Math.max(0, file.size - 256 * 1024),
        file.size
      );
    }

    // Source 2: file.lastModified (filesystem date)
    let fileDate: Date | null = null;
    if (file.lastModified && Math.abs(now - file.lastModified) > ONE_MINUTE) {
      const d = new Date(file.lastModified);
      if (!isNaN(d.getTime()) && d.getFullYear() >= 1990) {
        fileDate = d;
      }
    }

    // Discard mvhd date if it's within the last 60 seconds (re-encoding artifact)
    if (mvhdDate && Math.abs(now - mvhdDate.getTime()) < ONE_MINUTE) {
      mvhdDate = null;
    }

    // Pick the older date (more likely to be the original recording)
    if (mvhdDate && fileDate) {
      return mvhdDate.getTime() < fileDate.getTime() ? mvhdDate : fileDate;
    }
    return mvhdDate || fileDate;
  } catch {
    return null;
  }
}

// Mac epoch: January 1, 1904
const MAC_EPOCH = new Date("1904-01-01T00:00:00Z").getTime();

async function extractMvhdDate(
  file: File,
  start: number,
  end: number
): Promise<Date | null> {
  const slice = file.slice(start, end);
  const buffer = await slice.arrayBuffer();
  const view = new DataView(buffer);
  const len = view.byteLength;

  // Walk atoms looking for 'moov'
  let offset = 0;
  while (offset + 8 <= len) {
    const size = view.getUint32(offset);
    const type = String.fromCharCode(
      view.getUint8(offset + 4),
      view.getUint8(offset + 5),
      view.getUint8(offset + 6),
      view.getUint8(offset + 7)
    );

    if (size < 8) break; // invalid atom

    if (type === "moov") {
      // Search inside moov for mvhd
      return findMvhd(view, offset + 8, offset + Math.min(size, len - offset));
    }

    offset += size;
  }

  return null;
}

function findMvhd(view: DataView, start: number, end: number): Date | null {
  let offset = start;

  while (offset + 8 <= end) {
    const size = view.getUint32(offset);
    const type = String.fromCharCode(
      view.getUint8(offset + 4),
      view.getUint8(offset + 5),
      view.getUint8(offset + 6),
      view.getUint8(offset + 7)
    );

    if (size < 8) break;

    if (type === "mvhd") {
      // mvhd atom found — parse creation time
      const version = view.getUint8(offset + 8);
      let creationTime: number;

      if (version === 0) {
        // 32-bit timestamps
        creationTime = view.getUint32(offset + 12);
      } else {
        // version 1: 64-bit timestamps — read high and low 32-bit words
        const high = view.getUint32(offset + 12);
        const low = view.getUint32(offset + 16);
        creationTime = high * 0x100000000 + low;
      }

      if (creationTime === 0) return null;

      // Convert from Mac epoch (seconds since 1904-01-01) to JS Date
      const ms = MAC_EPOCH + creationTime * 1000;
      const date = new Date(ms);

      // Sanity check
      if (isNaN(date.getTime()) || date.getFullYear() < 1990 || date.getFullYear() > 2100) {
        return null;
      }

      return date;
    }

    offset += size;
  }

  return null;
}

/** Parse EXIF date format "YYYY:MM:DD HH:MM:SS" into a Date */
function parseExifDateString(s: string): Date | null {
  // Format: "2024:09:15 14:30:00"
  const match = s.match(/^(\d{4}):(\d{2}):(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/);
  if (!match) return null;

  const [, year, month, day, hour, min, sec] = match;
  const d = new Date(
    parseInt(year),
    parseInt(month) - 1,
    parseInt(day),
    parseInt(hour),
    parseInt(min),
    parseInt(sec)
  );

  // Sanity check — reject obviously invalid dates
  if (isNaN(d.getTime()) || d.getFullYear() < 1990) return null;

  return d;
}
