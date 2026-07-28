/** Image loading, decoding, and download helpers. Pure DOM, no ML. */

import type { LoadedImage } from '../types';

const ACCEPTED = new Set(['image/png', 'image/jpeg', 'image/webp']);

export function isAcceptedType(file: File): boolean {
  return ACCEPTED.has(file.type) || /\.(png|jpe?g|webp)$/i.test(file.name);
}

/** Decode a File into an HTMLImageElement with known dimensions. */
export function loadImage(file: File): Promise<LoadedImage> {
  return new Promise((resolve, reject) => {
    if (!isAcceptedType(file)) {
      reject(new Error('Bu dosya türü desteklenmiyor. PNG, JPG veya WebP dene.'));
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      if (!img.naturalWidth || !img.naturalHeight) {
        URL.revokeObjectURL(url);
        reject(new Error('Bu dosya okunamadı, bozuk olabilir.'));
        return;
      }
      resolve({ file, url, element: img, width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Görüntü açılamadı.'));
    };
    img.src = url;
  });
}

/** Decode a base64 data URL into a Blob. */
export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl);
  return res.blob();
}

/** Trigger a browser download of a Blob. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Give the browser a beat before revoking.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Format a dimension pair, e.g. "800 × 600". */
export function dims(w: number, h: number): string {
  return `${w} × ${h}`;
}

/** Human file size, e.g. "1.2 MB". */
export function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Derive a download filename from the original, with a suffix. */
export function suffixedName(originalName: string, scale: number): string {
  const dot = originalName.lastIndexOf('.');
  const stem = dot > 0 ? originalName.slice(0, dot) : originalName || 'resim';
  return `${stem}_${scale}x.png`;
}