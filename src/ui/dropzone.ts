/** Dropzone controller: click + drag/drop, hands a File back to the app. */

export interface DropzoneHandle {
  disable(): void;
  enable(): void;
}

export function initDropzone(
  root: HTMLElement,
  input: HTMLInputElement,
  onFile: (file: File) => void,
): DropzoneHandle {
  root.addEventListener('click', () => input.click());

  input.addEventListener('change', () => {
    const f = input.files?.[0];
    if (f) onFile(f);
    input.value = ''; // allow re-selecting the same file
  });

  // Drag events — only react when a file is being dragged.
  let dragging = 0;
  root.addEventListener('dragenter', (e) => {
    if (!hasFiles(e)) return;
    dragging++;
    root.classList.add('is-drag');
    e.preventDefault();
  });
  root.addEventListener('dragover', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault(); // enables drop
  });
  root.addEventListener('dragleave', () => {
    dragging = Math.max(0, dragging - 1);
    if (dragging === 0) root.classList.remove('is-drag');
  });
  root.addEventListener('drop', (e) => {
    dragging = 0;
    root.classList.remove('is-drag');
    e.preventDefault();
    const f = e.dataTransfer?.files?.[0];
    if (f) onFile(f);
  });

  // Prevent the browser from navigating away on a missed drop.
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => e.preventDefault());

  return {
    disable: () => (root.style.pointerEvents = 'none'),
    enable: () => (root.style.pointerEvents = ''),
  };
}

function hasFiles(e: DragEvent): boolean {
  return Array.from(e.dataTransfer?.types ?? []).includes('Files');
}