// Coordinates are expressed in the full photographic frame, before cropping.
export function detailRegion(width, height, x, y, outputWidth, outputHeight, zoom = 2.5, dpr = 1) {
  const density = Math.min(2, Math.max(1, dpr));
  const fullWidth = Math.max(1, Math.round(width * zoom * density));
  const fullHeight = Math.max(1, Math.round(height * zoom * density));
  const w = Math.min(fullWidth, Math.round(outputWidth * density));
  const h = Math.min(fullHeight, Math.round(outputHeight * density));
  const left = Math.max(0, Math.min(fullWidth - w, Math.round(x * fullWidth - w / 2)));
  const top = Math.max(0, Math.min(fullHeight - h, Math.round(y * fullHeight - h / 2)));
  // Include the complete lens kernel, including foreground silhouettes.
  const halo = Math.ceil(fullWidth * .08) + 2;
  const x0 = Math.max(0, left - halo), y0 = Math.max(0, top - halo);
  const x1 = Math.min(fullWidth, left + w + halo), y1 = Math.min(fullHeight, top + h + halo);
  return {fullWidth, fullHeight, width:x1-x0, height:y1-y0, originX:x0, originY:fullHeight-y1,
    spanX:(x1-x0)/fullWidth, spanY:(y1-y0)/fullHeight,
    centerX:(x0+x1)/fullWidth-1, centerY:1-(y0+y1)/fullHeight,
    readX:left-x0, readY:y1-top-h, outputWidth:w, outputHeight:h};
}
