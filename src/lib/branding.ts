interface ExtractedPalette {
  brandColor: string;
  accentColor: string;
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  return [h * 60, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0;
  let g = 0;
  let b = 0;
  if (hp < 1) [r, g, b] = [c, x, 0];
  else if (hp < 2) [r, g, b] = [x, c, 0];
  else if (hp < 3) [r, g, b] = [0, c, x];
  else if (hp < 4) [r, g, b] = [0, x, c];
  else if (hp < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const m = l - c / 2;
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

export async function extractBrandColors(file: File): Promise<ExtractedPalette> {
  const fallback: ExtractedPalette = { brandColor: "#0f766e", accentColor: "#f59e0b" };
  try {
    const dataUrl = await readImage(file);
    const img = await loadImage(dataUrl);
    const canvas = document.createElement("canvas");
    const size = 72;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return fallback;
    ctx.drawImage(img, 0, 0, size, size);
    const { data } = ctx.getImageData(0, 0, size, size);
    const buckets = new Map<string, { count: number; r: number; g: number; b: number }>();
    for (let i = 0; i < data.length; i += 4) {
      const a = data[i + 3];
      if (a < 160) continue;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      if (max > 245 && min > 235) continue; // white
      if (max < 18) continue; // black
      const key = `${r >> 4}-${g >> 4}-${b >> 4}`;
      const current = buckets.get(key);
      if (current) {
        current.count += 1;
        current.r += r;
        current.g += g;
        current.b += b;
      } else {
        buckets.set(key, { count: 1, r, g, b });
      }
    }
    const palette = [...buckets.values()]
      .sort((a, b) => b.count - a.count)
      .slice(0, 24)
      .map((bucket) => {
        const r = bucket.r / bucket.count;
        const g = bucket.g / bucket.count;
        const b = bucket.b / bucket.count;
        const [h, s, l] = rgbToHsl(r, g, b);
        return { r, g, b, h, s, l, count: bucket.count };
      });

    const candidates = palette.filter((c) => c.s >= 0.18 && c.l > 0.12 && c.l < 0.9);
    const primary = candidates[0] ?? palette[0];
    let accent = candidates.find(
      (c) =>
        Math.abs(c.h - primary.h) > 35 &&
        Math.abs(c.h - primary.h) < 325 &&
        c.l > 0.2 &&
        c.count > 2,
    );
    if (!accent) {
      const [, ps, pl] = rgbToHsl(primary.r, primary.g, primary.b);
      accent = { ...primary, h: (primary.h + 38) % 360, s: Math.min(0.9, ps + 0.1), l: Math.max(0.42, Math.min(0.62, pl + 0.18)), count: 1 };
    }

    const [ph, ps, pl] = rgbToHsl(primary.r, primary.g, primary.b);
    const brandRgb = hslToRgb(ph, Math.max(0.42, ps), Math.min(0.48, Math.max(0.26, pl)));
    const [ah, as, al] = [accent.h, accent.s, accent.l];
    const accentRgb = hslToRgb(ah, Math.max(0.55, as), Math.min(0.6, Math.max(0.42, al)));
    return {
      brandColor: rgbToHex(...brandRgb),
      accentColor: rgbToHex(...accentRgb),
    };
  } catch {
    return fallback;
  }
}

export function readImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

export async function compressPhoto(file: File, maxSide = 1400): Promise<string> {
  const dataUrl = await readImage(file);
  const img = await loadImage(dataUrl);
  const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.76);
}
