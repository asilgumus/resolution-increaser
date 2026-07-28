/**
 * tfjs backend selection: WebGL -> WebGPU -> WASM.
 *
 * tfjs (not UpscalerJS) owns backends. We import it dynamically so the big ML
 * bundle only loads once the user actually interacts.
 *
 * IMPORTANT: the WASM backend must be imported lazily *only inside the wasm
 * branch*. Importing it unconditionally breaks under Vite because Vite mangles
 * the CJS `wasmWorkerContents` named export that `backend_wasm.js` relies on.
 * On any GPU-capable browser WebGL succeeds first and the wasm module is never
 * touched.
 */
import type { BackendName } from '../types';

let initialized: BackendName | null = null;

async function tryBackend(name: BackendName): Promise<boolean> {
  const tf = await import('@tensorflow/tfjs');
  try {
    if (await tf.setBackend(name)) {
      await tf.ready();
      return true;
    }
  } catch {
    /* try next */
  }
  return false;
}

/** Lazily import + configure the WASM backend (last-resort fallback only). */
async function tryWasm(): Promise<boolean> {
  const tf = await import('@tensorflow/tfjs');
  try {
    const wasm = await import('@tensorflow/tfjs-backend-wasm');
    wasm.setWasmPaths(
      'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-backend-wasm@4.11.0/dist/',
    );
    if (await tf.setBackend('wasm')) {
      await tf.ready();
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

export async function initBackend(): Promise<BackendName> {
  if (initialized) return initialized;

  // WebGL first — most stable in tfjs 4.11, fast enough for photo upscaling.
  if (await tryBackend('webgl')) {
    initialized = 'webgl';
    return initialized;
  }
  // WebGPU second — experimental, faster where it works.
  // Register the webgpu backend package before trying it.
  try {
    await import('@tensorflow/tfjs-backend-webgpu');
  } catch {
    /* ignore */
  }
  if (await tryBackend('webgpu')) {
    initialized = 'webgpu';
    return initialized;
  }
  // Last resort: software WASM via CDN (slow, but works without a GPU).
  if (await tryWasm()) {
    initialized = 'wasm';
    return initialized;
  }

  // Nothing worked. Fall through to whatever tfjs picked (likely cpu).
  const tf = await import('@tensorflow/tfjs');
  await tf.ready();
  initialized = (tf.getBackend() as BackendName) || 'cpu';
  return initialized;
}

/** For status display: friendly label for a backend name. */
export function backendLabel(name: BackendName): string {
  switch (name) {
    case 'webgpu': return 'WebGPU';
    case 'webgl': return 'WebGL';
    case 'wasm': return 'WASM (yazılım)';
    default: return name;
  }
}

export async function getTf() {
  return await import('@tensorflow/tfjs');
}