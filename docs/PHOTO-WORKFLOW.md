# Session photo workflow

## Scope

The toolbar's **拍照** makes a fresh photograph (2048 pixels on its long edge), rather than downloading immediately. **回看** opens the session-only review dialog. It supports actual shooting parameters, fit/100% pixel viewing, selection of two photos for comparison, and download. The main camera preview and collapsed advanced controls retain their previous layout.

The recent collection holds at most eight lossless PNG masters and 64 MiB of encoded image data. It is not a persistent gallery: refreshing clears it. Only the one or two displayed originals are decoded for review; recent-photo selectors are text. Eviction is transactional and does not evict a photo currently displayed, compared, or being exported. Failed captures leave the previous collection intact.

## Pixels and parameters

`app.js` retains the existing layer preparation/revision loop and frame-pacer serialization. It resolves focus and automatic exposure, draws a fresh capture with guidance overlays disabled, and freezes `photo-snapshot.js` state in the same synchronous turn as `toBlob`. Preview dimensions and zebra state restore immediately; capture serialization remains until encoding finishes. The snapshot never references live scene/slider objects. Requested flash with no loaded flash layer fails clearly; detail fallback records the actual texture dimensions instead of claiming the requested detail source loaded.

`photo-export.js` never reads the live camera canvas. Full-size PNG reuses the stored lossless image; smaller images and JPEG decode the retained master once. JPEG undergoes exactly one lossy encoding. Exports are capped at the stored dimensions (original/2048 or 1024 long edge); no upscale adds apparent detail. Format and quality options remain folded by default.

`photo-metadata.js` adds standard JPEG EXIF and PNG eXIf/iTXt without re-encoding the image. See [metadata implementation and limitations](photo-metadata.md). These are simulated photographs, not physical camera sensor records, and contain no invented camera model, lens identity, GPS or user identity.

## Validation

- Node tests cover immutable actual exposure/focus/source, null/throw encoding failures, no-upscale sizing, one JPEG encoding, unchanged decoded PNG pixels, metadata decoding/containers, and bounded protected eviction.
- Browser tests cover the full capture/review/export flow, automatic exposure metadata, mutation during delayed encoding, unchanged retained pixels after later edits, null failure recovery, comparison, mobile dimensions/100% viewing, modal close/focus, and preview-area preservation.
- `.github/workflows/photo-review.yml` is a read-only isolated-branch workflow. It captures review and matched baseline/candidate layout screenshots, then runs the complete existing regression suite in three shards. It does not deploy or merge. Browser validation must use this supported CI route; no local browser execution is assumed.
