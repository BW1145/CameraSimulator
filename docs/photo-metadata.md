# Photograph metadata

`addPhotoMetadata(bytes, format, snapshot, width, height)` asynchronously returns
new `Uint8Array` bytes. Format is `jpeg` or `png`; input is a freshly encoded
simulator photograph, not an arbitrary uploaded image. Snapshot and image input
are unchanged, and pixel data is never decoded/recompressed by the adapter.

## Pinned serializer and source audit

**piexifjs 1.0.6**, MIT, zero runtime dependencies, is lazy-loaded only on export.
Only `dump()` receives our allowlisted tags: no library image parsing, imported
metadata, thumbnails, GPS or MakerNotes. It is mature but **not actively
maintained**; the old stable release is an explicit tradeoff, not a maintenance
claim. Reader-only exif-js/exifr/ExifReader cannot write these tags, while a
Perl/WASM ExifTool runtime is disproportionate here.
[Package/license](https://www.npmjs.com/package/piexifjs),
[API](https://piexifjs.readthedocs.io/en/latest/functions.html).

Installed `piexif.js` SHA-256:
`a799f6ecca79d2b39c14f38d95ad83907f4aa0d064dc17a7148877d1f5bd2d0d`.
The complete MIT notice is in `public/licenses/piexifjs.txt`, automatically copied
into the built distribution. Do not unpin the library without repeating this audit.

Independent ExifTool validation caught two published serializer defects:

- UserComment is incorrectly typed ASCII rather than UNDEFINED.
- The EXIF IFD lacks its trailing four-byte zero next-IFD pointer, overlapping the
  first rational value with the expected IFD extent.

A bounded post-serialization normalization fixes **our known two-IFD output**:
insert the pointer, adjust this IFD's out-of-line offsets, correct UserComment's
type/count. Library internals are not changed. Controlled strings are padded
before serialization to keep TIFF offsets even; the library does not do that.
This is not a general TIFF codec. Loading failures remain retryable.

## Values and limitations

Software is exactly `CameraSimulator`; description says **simulated photograph**.
Standard exposure tags use actual `snapshot.resolved` aperture, shutter seconds
and ISO. Other tags store exposure program (M/P/A/S = 1/2/3/4), signed exposure
compensation, focus distance in metres, focal length in mm, metering
(matrix/center/spot = 5/2/3), upright orientation and actual output dimensions.
Ignored compensation in M without Auto ISO is recorded as zero. No camera/lens
identity, author, serial number or location is fabricated.
[Tag definitions](https://exiv2.org/tags.html).

WhiteBalance is **1 (manual)**, not a Kelvin number. Kelvin and simulator-specific
state are preserved in the bounded JSON schema `camera-simulator/photo/v1`:
`settings`, `resolved`, `scene`, `source`, `simulationTime`, `focusPoint`,
`rendering`, dimensions, format, `simulated: true` and `capturedAt`.
UserComment has the standard eight-byte ASCII prefix; JSON Unicode escapes
preserve Chinese names. PNG iTXt uses UTF-8.

EXIF dates are capture-time **UTC**, with subseconds in SubSecTimeOriginal. This
old serializer does not expose OffsetTime tags. The description and JSON
`exifDateTimeZone: "UTC"` declare the convention; `capturedAt` preserves exact ISO
UTC with milliseconds. Generic viewers may interpret the bare EXIF date as local.

JPEG APP1 preserves leading JFIF and all compressed scan bytes. PNG contains one
standard eXIf (TIFF without the JPEG EXIF prefix) and uncompressed iTXt Software,
Description, Creation Time and CameraSimulator JSON before IDAT. Creation Time
uses RFC1123 for older reader compatibility; ISO precision remains in JSON.
Repeated writes replace this adapter's metadata. JPEG reader interoperability is
wider; PNG eXIf/text display varies by application.
[PNG standard](https://www.w3.org/TR/png-3/).

## Independent verification

`tests/photo-metadata.test.mjs` independently uses existing sharp and dev-only
**exif-reader 2.0.3** (MIT, zero runtime dependencies), plus Node native zlib CRC32.
It verifies actual tags, Unicode/timestamps, no fabricated identity/GPS, even
TIFF offsets, dimensions, untouched pixels/scan/IDAT, Uint8Array views, repeat
writes, all modes/meters and rejected invalid input.

```sh
PHOTO_EXIFTOOL=/path/to/exiftool node --test tests/photo-metadata.test.mjs
```

2026-10-23: **6/6 passed, no skips**, including ExifTool **13.59** installed only in
`/tmp`, not shipped. Both formats returned `Validate: 0 0 0`, no warnings, with
correct exposure, dates and Kelvin JSON. CI installs system ExifTool. Without a
local binary the optional integration test explicitly skips; other independent
reader tests still run.
[sharp](https://sharp.pixelplumbing.com/api-input/),
[exif-reader](https://github.com/devongovett/exif-reader),
[ExifTool](https://exiftool.org/).
