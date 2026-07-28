/**
 * App bootstrap + state machine. Direct DOM show/hide, no framework.
 *
 *   idle → image-loaded → processing → done → downloading
 *                                  └→ error
 */

import './styles.css';
import type { LoadedImage, UpscaleResult } from './types';
import { $ } from './util/dom';
import {
  dims,
  downloadBlob,
  humanSize,
  loadImage,
  suffixedName,
} from './util/image';
import { initDropzone } from './ui/dropzone';
import { initScalePicker } from './ui/scale-picker';
import { initProgress } from './ui/progress-bar';
import { initCompare } from './ui/compare-slider';
import { backendLabel } from './upscaler/backend';

// Heavy module (pulls in tfjs + upscaler). Load on first use only.
type UpscalerMod = typeof import('./upscaler');
let upscalerMod: Promise<UpscalerMod> | null = null;
const getUpscalerMod = (): Promise<UpscalerMod> => (upscalerMod ??= import('./upscaler'));

// ---- DOM ----
const dropzone = $('#dropzone');
const fileInput = $('#file-input') as HTMLInputElement;
const controls = $('#controls');
const previewImg = $('#preview-img') as HTMLImageElement;
const previewMeta = $('#preview-meta');
const scalePickerEl = $('#scale-picker');
const upscaleBtn = $('#upscale-btn') as HTMLButtonElement;
const cancelBtn = $('#cancel-btn') as HTMLButtonElement;
const replaceBtn = $('#replace-btn') as HTMLButtonElement;
const progressEl = $('#progress');
const progressFill = $('#progress-fill');
const progressStatus = $('#progress-status');
const errorbox = $('#errorbox');
const errorTitle = $('#error-title');
const errorMsg = $('#error-msg');
const retryBtn = $('#retry-btn') as HTMLButtonElement;
const resultEl = $('#result');
const resultMeta = $('#result-meta');
const downloadBtn = $('#download-btn') as HTMLButtonElement;
const restartBtn = $('#restart-btn') as HTMLButtonElement;
const compareEl = $('#compare');
const beforeImg = $('#before-img') as HTMLImageElement;
const afterImg = $('#after-img') as HTMLImageElement;
const compareHandle = $('#compare-handle') as HTMLButtonElement;
const workspace = $('#workspace');

// ---- controllers ----
const progress = initProgress(progressEl, progressFill, progressStatus);
const scalePicker = initScalePicker(scalePickerEl, () => {});
const compare = initCompare(compareEl, beforeImg, afterImg, compareHandle);

// ---- state ----
let loaded: LoadedImage | null = null;
let result: UpscaleResult | null = null;
let abortController: AbortController | null = null;

// ---- helpers ----
function setState(state: 'idle' | 'image-loaded' | 'processing' | 'done' | 'error') {
  workspace.setAttribute('aria-busy', state === 'processing' ? 'true' : 'false');
  dropzone.hidden = state !== 'idle';
  controls.hidden = state !== 'image-loaded' && state !== 'processing';
  errorbox.hidden = state !== 'error';
  resultEl.hidden = state !== 'done';

  const busy = state === 'processing';
  upscaleBtn.disabled = busy;
  replaceBtn.disabled = busy;
  cancelBtn.hidden = !busy;
  scalePicker.disable(busy);

  if (state === 'processing') progress.show();
  else progress.hide();
}

function showError(title: string, msg: string) {
  errorTitle.textContent = title;
  errorMsg.textContent = msg;
  setState('error');
}

function resetToIdle() {
  if (abortController) abortController.abort();
  if (loaded) {
    URL.revokeObjectURL(loaded.url);
    loaded = null;
  }
  if (result) {
    URL.revokeObjectURL(result.url);
    result = null;
  }
  previewImg.src = '';
  progress.reset();
  setState('idle');
}

// ---- file loading ----
async function handleFile(file: File) {
  if (errorbox.hidden === false || resultEl.hidden === false) {
    // Coming back from error/result: clear previous state first.
    if (result) {
      URL.revokeObjectURL(result.url);
      result = null;
    }
  }
  try {
    const img = await loadImage(file);
    if (loaded) URL.revokeObjectURL(loaded.url);
    loaded = img;
    previewImg.src = img.url;
    previewMeta.textContent = `${dims(img.width, img.height)} · ${humanSize(file.size)}`;
    setState('image-loaded');
  } catch (e) {
    showError('Fotoğraf açılamadı.', e instanceof Error ? e.message : 'Bilinmeyen hata.');
  }
}

initDropzone(dropzone, fileInput, handleFile);

// ---- upscale ----
async function runUpscale() {
  if (!loaded) return;
  const scale = scalePicker.get();
  const img = loaded.element;

  abortController = new AbortController();
  setState('processing');
  progress.reset();
  progress.setAmount(0);

  let seenProgress = false;
  try {
    const mod = getUpscalerMod();
    // Eagerly report the backend so the status line isn't empty during model fetch.
    mod
      .then(({ preloadBackend }) => preloadBackend())
      .then((b) => {
        if (!seenProgress) progress.setStatus(`${backendLabel(b)} üzerinde hazırlanıyor…`);
      })
      .catch(() => {});

    const { upscale } = await mod;
    const res = await upscale(
      img,
      scale,
      (amount) => {
        if (!seenProgress) seenProgress = true;
        progress.setAmount(amount);
        const pct = Math.round(amount * 100);
        progress.setStatus(`İşleniyor… %${pct}`);
      },
      abortController.signal,
    );

    result = res;
    compare.setImages(loaded.url, res.url, res.width, res.height);
    resultMeta.textContent = `${dims(loaded.width, loaded.height)} → ${dims(res.width, res.height)} · ${humanSize(res.blob.size)} PNG`;
    setState('done');
  } catch (e) {
    if (abortController?.signal.aborted) {
      // User cancelled — return to the loaded image, not an error.
      setState('image-loaded');
      return;
    }
    showError(
      'Yükseltme başarısız oldu.',
      e instanceof Error ? e.message : 'Bilinmeyen hata.',
    );
  } finally {
    abortController = null;
  }
}

upscaleBtn.addEventListener('click', runUpscale);
cancelBtn.addEventListener('click', () => abortController?.abort());
replaceBtn.addEventListener('click', () => fileInput.click());

// ---- error retry ----
retryBtn.addEventListener('click', () => {
  if (loaded) setState('image-loaded');
  else setState('idle');
});

// ---- result: download + restart ----
downloadBtn.addEventListener('click', () => {
  if (!result || !loaded) return;
  const name = suffixedName(loaded.file.name, scalePicker.get());
  downloadBlob(result.blob, name);
  const original = downloadBtn.textContent;
  downloadBtn.textContent = 'İndirildi ✓';
  downloadBtn.disabled = true;
  setTimeout(() => {
    downloadBtn.textContent = original;
    downloadBtn.disabled = false;
  }, 1600);
});

restartBtn.addEventListener('click', resetToIdle);

// ---- teardown ----
window.addEventListener('beforeunload', () => {
  if (upscalerMod) void upscalerMod.then(({ dispose }) => dispose());
});

setState('idle');