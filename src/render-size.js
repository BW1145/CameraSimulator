// Render at display density, bounded by total pixels rather than a small width.
// A tall composition and a wide composition share the same memory budget.
export function previewSize(cssWidth, aspect, dpr = 1) {
  const width = Math.max(1, cssWidth) * Math.min(2, Math.max(1, dpr));
  const scale = Math.min(1, Math.sqrt(3500000 / (width * width / aspect)));
  return [Math.round(width * scale), Math.round(width * scale / aspect)];
}

export function captureSize(aspect) {
  return aspect >= 1 ? [2048, Math.round(2048 / aspect)] : [Math.round(2048 * aspect), 2048];
}
