/**
 * UpscalerJS wrapper — the only place that touches the `upscaler` + tfjs APIs.
 *
 * This module statically imports `upscaler` (which pulls in tfjs), so it MUST be
 * dynamically imported by the app to keep the initial bundle light.
 *
 * Public surface stays tiny:
 *   preloadBackend()  → warm tfjs backend, returns its name
 *   upscale(...)      → run ESRGAN at 2x or 4x, reporting progress, cancellable
 *   dispose()         → tear everything down (page unload)
 */

import Upscaler from 'upscaler';
import type { Tensor3D } from '@tensorflow/tfjs';
import type { BackendName, Scale, UpscaleResult } from '../types';
import { initBackend, getTf, backendLabel } from './backend';
import { loadModel } from './models';

type UpscalerInstance = InstanceType<typeof Upscaler>;

// Source-pixel caps per scale. The output is `src × scale²` pixels, and the
// whole output tensor has to be stitched together in memory before it can be
// rasterised to a PNG. Capping the OUTPUT at ~16 MP keeps that stitch from
// OOMing the tab (which is what made the page go unresponsive right at 100%
// and then restart from 0). 16 MP out ⇒ 4 MP in at 2×, 1 MP in at 4×.
const MAX_SRC_PIXELS: Record<Scale, number> = {
  2: 4_000_000, // ~4 MP → 16 MP output
  4: 1_000_000, // ~1 MP → 16 MP output
};

const instances = new Map<Scale, UpscalerInstance>();
let backendPromise: Promise<BackendName> | null = null;

export function preloadBackend(): Promise<BackendName> {
  if (!backendPromise) backendPromise = initBackend();
  return backendPromise;
}

async function getUpscaler(scale: Scale): Promise<UpscalerInstance> {
  const existing = instances.get(scale);
  if (existing) return existing;

  await preloadBackend();
  const model = await loadModel(scale);
  const inst = new Upscaler({ model });
  // Pre-compile shaders at the native patch size so the first real patch
  // doesn't pay the WebGL shader-compile penalty (several hundred ms).
  // Warmup is best-effort — if it OOMs on a weak GPU, the execute path will
  // just retry with a smaller patch.
  try {
    await inst.warmup({ patchSize: 128, padding: 4 });
  } catch {
    /* ignore — non-fatal */
  }
  instances.set(scale, inst);
  return inst;
}

interface ExecuteOptions {
  patchSize: number;
  padding: number;
}

// Patch sizes to try, in order. The ESRGAN-slim model's native patchSize is
// 128 — using it means ~4× fewer patches (and ~4× fewer synchronous
// ReadPixels stalls) than 64, which is the difference between seconds and
// tens of seconds on a real photo. We only drop to a smaller patch if the
// GPU runs out of memory at the larger one.
const PATCH_SIZES: ExecuteOptions[] = [
  { patchSize: 128, padding: 4 },
  { patchSize: 64, padding: 4 },
  { patchSize: 32, padding: 2 },
];

async function run(
  inst: UpscalerInstance,
  img: HTMLImageElement | HTMLCanvasElement,
  onProgress: (amount: number) => void,
  signal: AbortSignal,
  { patchSize, padding }: ExecuteOptions,
): Promise<Tensor3D> {
  // output: 'tensor' keeps the stitched result on the GPU and hands us a
  // Tensor3D. We then rasterise it to a PNG ourselves via async canvas.toBlob
  // — critically avoiding UpscalerJS's default `canvas.toDataURL()`, which is
  // synchronous and blocks the main thread ("page not responsive") on large
  // outputs. progressOutput stays 'base64' so the per-patch progress slices
  // are tiny strings (a single patch each), not tensors we'd have to dispose.
  return inst.execute(img, {
    output: 'tensor',
    patchSize,
    padding,
    progress: (amount: number) => onProgress(amount),
    progressOutput: 'base64',
    signal,
    awaitNextFrame: true,
  }) as Promise<Tensor3D>;
}

/**
 * Rasterise a [H,W,3] float tensor (values 0–255, UpscalerJS's output range)
 * to a PNG Blob without blocking the main thread.
 *
 * We replicate UpscalerJS's own `tensorAsBase64` conversion (clip to [0,255],
 * append an alpha=255 channel, materialise to an ImageData) but swap the
 * final synchronous `canvas.toDataURL()` for an async `canvas.toBlob()` —
 * that sync toDataURL was what froze the page ("not responsive") on large
 * outputs. The GPU readback uses async `tensor.data()` rather than
 * `dataSync()` so even the readback doesn't stall the main thread.
 */
async function tensorToPngBlob(
  tf: Awaited<ReturnType<typeof getTf>>,
  tensor: Tensor3D,
): Promise<Blob> {
  const [th, tw] = tensor.shape;

  // Build an RGBA tensor (alpha = 255) on the GPU, disposing intermediates.
  const fill = tf.fill([th, tw], 255).expandDims(2);
  let rgba: Tensor3D;
  try {
    const clipped = tensor.clipByValue(0, 255);
    rgba = clipped.concat([fill], 2) as Tensor3D;
    clipped.dispose();
  } finally {
    fill.dispose();
    tensor.dispose();
  }

  let data: Float32Array;
  try {
    data = (await rgba.data()) as Float32Array; // async readback, non-blocking
  } finally {
    rgba.dispose();
  }

  const imageData = new ImageData(tw, th);
  imageData.data.set(data); // Float32Array → Uint8ClampedArray (clamps/rounds)

  const canvas = document.createElement('canvas');
  canvas.width = tw;
  canvas.height = th;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas bağlamı oluşturulamadı.');
  ctx.putImageData(imageData, 0, 0);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('PNG kodlanamadı.'))),
      'image/png',
    );
  });
}

export async function upscale(
  img: HTMLImageElement | HTMLCanvasElement,
  scale: Scale,
  onProgress: (amount: number) => void,
  signal: AbortSignal,
): Promise<UpscaleResult> {
  const srcW = (img as HTMLImageElement).naturalWidth ?? (img as HTMLCanvasElement).width;
  const srcH = (img as HTMLImageElement).naturalHeight ?? (img as HTMLCanvasElement).height;
  const pixels = srcW * srcH;

  if (pixels > MAX_SRC_PIXELS[scale]) {
    const capMp = (MAX_SRC_PIXELS[scale] / 1_000_000).toFixed(0);
    throw new Error(
      scale === 4
        ? `4× için fotoğraf çok büyük (en fazla ~${capMp} megapiksel). 2× dene veya daha küçük bir görsel yükle.`
        : `Fotoğraf çok büyük (en fazla ~${capMp} megapiksel). Daha küçük bir görsel yükle.`,
    );
  }

  const backend = await preloadBackend();
  const inst = await getUpscaler(scale);

  let tensor: Tensor3D | undefined;
  let firstError: unknown = null;
  for (const opt of PATCH_SIZES) {
    if (signal.aborted) throw firstError ?? new Error('İptal edildi.');
    // Track whether patch processing finished. If execute rejects AFTER
    // reaching ~100%, the failure is in the final stitch/assembly (memory),
    // not in per-patch processing — a smaller patchSize won't help and would
    // just re-run everything from 0 (the loop the user got stuck in).
    let reachedEnd = false;
    try {
      tensor = await run(
        inst,
        img,
        (amount) => {
          if (amount >= 0.999) reachedEnd = true;
          onProgress(amount);
        },
        signal,
        opt,
      );
      break;
    } catch (err) {
      if (signal.aborted) throw err; // cancellation isn't an error to recover from
      if (firstError === null) firstError = err; // keep the real (native-patch) cause
      if (reachedEnd) break; // patches done → assembly error → stop retrying
    }
  }

  if (!tensor) {
    const detail = firstError instanceof Error ? firstError.message : 'Bilinmeyen hata.';
    // Include the backend so a recurring failure tells us *where* it broke
    // (e.g. "WASM ile işlenemedi" means WebGL/WebGPU both failed to init).
    throw new Error(`${backendLabel(backend)} ile işlenemedi: ${detail}`);
  }

  const tf = await getTf();
  const blob = await tensorToPngBlob(tf, tensor);
  return {
    blob,
    url: URL.createObjectURL(blob),
    width: srcW * scale,
    height: srcH * scale,
  };
}

/** Tear down all cached models + tfjs state. Safe to call multiple times. */
export async function dispose(): Promise<void> {
  for (const inst of instances.values()) {
    try {
      await inst.dispose();
    } catch {
      /* ignore */
    }
  }
  instances.clear();
  try {
    const tf = await getTf();
    tf.disposeVariables();
  } catch {
    /* ignore */
  }
}