// Image loading, rotation and export helpers built on <canvas>.

export async function fileToCanvas(file, maxDim = 2000) {
  const src = await decode(file);
  const scale = Math.min(1, maxDim / Math.max(src.width, src.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(src.width * scale);
  canvas.height = Math.round(src.height * scale);
  canvas.getContext('2d').drawImage(src, 0, 0, canvas.width, canvas.height);
  if (src.close) src.close();
  return canvas;
}

async function decode(file) {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      // Fall through to <img>, which handles more formats on some browsers.
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Rotates a canvas by 90° clockwise (dir = 1) or anticlockwise (dir = -1).
export function rotate90(src, dir = 1) {
  const c = document.createElement('canvas');
  c.width = src.height;
  c.height = src.width;
  const ctx = c.getContext('2d');
  ctx.translate(c.width / 2, c.height / 2);
  ctx.rotate((dir * Math.PI) / 2);
  ctx.drawImage(src, -src.width / 2, -src.height / 2);
  return c;
}

export function crop(src, { x, y, w, h }) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  c.getContext('2d').drawImage(src, x, y, w, h, 0, 0, c.width, c.height);
  return c;
}

// Downscales to fit maxDim and encodes as JPEG. Returns { blob, aspect } where aspect = width / height.
export function toJpeg(src, maxDim = 1200, quality = 0.85) {
  const scale = Math.min(1, maxDim / Math.max(src.width, src.height));
  let c = src;
  if (scale < 1) {
    c = document.createElement('canvas');
    c.width = Math.round(src.width * scale);
    c.height = Math.round(src.height * scale);
    const ctx = c.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src, 0, 0, c.width, c.height);
  }
  return new Promise((resolve, reject) => {
    c.toBlob((blob) => (blob ? resolve({ blob, aspect: c.width / c.height }) : reject(new Error('Could not encode image'))), 'image/jpeg', quality);
  });
}
