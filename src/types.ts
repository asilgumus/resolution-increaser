/** Shared app types. */

export type Scale = 2 | 4;

/** Discriminated union for the workspace state machine. */
export type AppState =
  | 'idle'
  | 'image-loaded'
  | 'processing'
  | 'done'
  | 'downloading'
  | 'error';

/** A loaded source image plus its decoded dimensions. */
export interface LoadedImage {
  file: File;
  url: string; // object URL for the original
  element: HTMLImageElement;
  width: number;
  height: number;
}

/** Result of an upscale run. */
export interface UpscaleResult {
  blob: Blob;
  url: string; // object URL for the result
  width: number;
  height: number;
}

/** tfjs backend the run is executing on, surfaced to the user. */
export type BackendName = 'webgpu' | 'webgl' | 'wasm' | 'cpu';