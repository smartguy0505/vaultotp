const shot = document.getElementById('shot');
const dim = document.getElementById('dim');
const box = document.getElementById('box');

let meta = null;
let dragging = false;
let startX = 0;
let startY = 0;
let current = null;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function setBox(x1, y1, x2, y2) {
  const left = Math.min(x1, x2);
  const top = Math.min(y1, y2);
  const width = Math.abs(x2 - x1);
  const height = Math.abs(y2 - y1);
  current = { left, top, width, height };
  if (width < 2 || height < 2) {
    box.style.display = 'none';
    dim.style.display = 'block';
    return;
  }
  dim.style.display = 'none';
  box.style.display = 'block';
  box.style.left = `${left}px`;
  box.style.top = `${top}px`;
  box.style.width = `${width}px`;
  box.style.height = `${height}px`;
}

function toImageRect(selection) {
  if (!meta || !selection) return null;
  const scaleX = meta.imageWidth / meta.displayWidth;
  const scaleY = meta.imageHeight / meta.displayHeight;
  const x = Math.round(selection.left * scaleX);
  const y = Math.round(selection.top * scaleY);
  const width = Math.round(selection.width * scaleX);
  const height = Math.round(selection.height * scaleY);
  return {
    x: clamp(x, 0, meta.imageWidth - 1),
    y: clamp(y, 0, meta.imageHeight - 1),
    width: clamp(width, 1, meta.imageWidth - x),
    height: clamp(height, 1, meta.imageHeight - y),
  };
}

function confirmSelection() {
  if (!current || current.width < 8 || current.height < 8) return;
  const rect = toImageRect(current);
  if (!rect) return;
  window.regionApi.confirm(rect);
}

function cancelSelection() {
  window.regionApi.cancel();
}

window.regionApi.onInit((payload) => {
  meta = payload;
  shot.src = payload.dataUrl;
  dim.style.display = 'block';
  box.style.display = 'none';
  current = null;
});

document.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  dragging = true;
  startX = e.clientX;
  startY = e.clientY;
  setBox(startX, startY, startX, startY);
});

document.addEventListener('mousemove', (e) => {
  if (!dragging) return;
  setBox(startX, startY, e.clientX, e.clientY);
});

document.addEventListener('mouseup', (e) => {
  if (!dragging || e.button !== 0) return;
  dragging = false;
  setBox(startX, startY, e.clientX, e.clientY);
  if (current && current.width >= 40 && current.height >= 40) {
    confirmSelection();
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    e.preventDefault();
    cancelSelection();
  } else if (e.key === 'Enter') {
    e.preventDefault();
    confirmSelection();
  }
});

document.addEventListener('dblclick', () => {
  confirmSelection();
});
