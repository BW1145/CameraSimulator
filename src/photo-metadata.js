// This module writes only metadata for newly encoded simulator photographs.
// piexifjs serializes a small allowlisted EXIF object; it never reads image input.
const SOFTWARE = 'CameraSimulator';
const DESCRIPTION = 'Simulated photograph; EXIF dates are UTC.';
const JSON_KEYWORD = 'CameraSimulator';
const MAX_METADATA_BYTES = 48 * 1024;
const SETTINGS = 'aperture shutter iso wb mode autoISO compensation metering focal focus af x y z yaw pitch roll crop sensor grid level histogram zebra motion pause flash magnifier'.split(' ');
const SOURCE = 'kind pack sourceSha256 referenceFocal viewId imageWidth imageHeight detailLoaded flashLayerLoaded fanPresent'.split(' ');
const RENDERING = 'sourceView exposureOffset filmWidth cameraPosition cameraQuaternion overlaysIncluded'.split(' ');
const PROGRAM = {M: 1, P: 2, A: 3, S: 4};
const METERING = {matrix: 5, center: 2, spot: 3};
const encoder = new TextEncoder();
const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
let serializerPromise;

function pick(object, keys) {
  return Object.fromEntries(keys.filter(key => Object.hasOwn(object ?? {}, key)).map(key => [key, object[key]]));
}
function positive(value, label, max = 0xffffffff) {
  if (!Number.isFinite(value) || value <= 0 || value > max) throw new Error(`Invalid photograph ${label}`);
  return value;
}
function dimension(value) {
  if (!Number.isInteger(value)) throw new Error('Invalid photograph dimensions');
  return positive(value, 'dimensions');
}
function rational(value, signed = false) {
  if (!Number.isFinite(value) || (!signed && value < 0)) throw new Error('Invalid EXIF rational');
  let numerator, denominator;
  if (Number.isInteger(value)) { numerator = value; denominator = 1; }
  else if (Math.abs(value) < 1 && Math.abs(1 / Math.abs(value) - Math.round(1 / Math.abs(value))) < 1e-8) {
    numerator = Math.sign(value); denominator = Math.round(1 / Math.abs(value));
  } else if (Math.abs(value * 3 - Math.round(value * 3)) < 1e-8) {
    numerator = Math.round(value * 3); denominator = 3;
  } else { numerator = Math.round(value * 1000000); denominator = 1000000; }
  let a = Math.abs(numerator), b = denominator;
  while (b) [a, b] = [b, a % b];
  numerator /= a; denominator /= a;
  const limit = signed ? 0x7fffffff : 0xffffffff;
  if (Math.abs(numerator) > limit || denominator > limit) throw new Error('EXIF rational is too large');
  return [numerator, denominator];
}
// piexif 1.0.6 does not pad out-of-line TIFF values. A final extra NUL in
// our ASCII values keeps every offset even; string readers ignore padding.
function alignedAscii(text) { return (text.length + 1) % 2 ? text + '\0' : text; }
function binaryBytes(text) { return Uint8Array.from(text, character => character.charCodeAt(0)); }
function join(parts) {
  const output = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) { output.set(part, offset); offset += part.length; }
  return output;
}
function read32(bytes, offset) { return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset); }
function startsWith(bytes, prefix, offset = 0) { return prefix.every((value, index) => bytes[offset + index] === value); }

// Normalize two audited 1.0.6 serializer defects, ONLY for the own allowlisted
// big-endian IFD0 + ExifIFD layout above. This is not an imported-photo parser.
function normalizeExif(bytes) {
  const base = 6, view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (!startsWith(bytes, [69, 120, 105, 102, 0, 0, 77, 77, 0, 42])) throw new Error('Unexpected EXIF serializer header');
  const ifd0 = base + view.getUint32(base + 4), count0 = view.getUint16(ifd0);
  let ifd;
  for (let i = 0; i < count0; i++) {
    const entry = ifd0 + 2 + i * 12;
    if (view.getUint16(entry) === 34665) ifd = base + view.getUint32(entry + 8);
  }
  if (!ifd) throw new Error('EXIF serializer omitted the photograph IFD');
  const count = view.getUint16(ifd), valuesStart = ifd + 2 + count * 12;
  const output = join([bytes.subarray(0, valuesStart), new Uint8Array(4), bytes.subarray(valuesStart)]);
  const result = new DataView(output.buffer), sizes = {1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 10: 8};
  for (let i = 0; i < count; i++) {
    const entry = ifd + 2 + i * 12, tag = result.getUint16(entry), type = result.getUint16(entry + 2);
    const length = result.getUint32(entry + 4);
    if (!sizes[type]) throw new Error('Unexpected EXIF serializer field type');
    if (length * sizes[type] > 4) result.setUint32(entry + 8, result.getUint32(entry + 8) + 4);
    // 1.0.6 incorrectly declares UserComment ASCII and appends an ASCII NUL.
    if (tag === 37510) { result.setUint16(entry + 2, 7); result.setUint32(entry + 4, length - 1); }
  }
  return output;
}

async function exifPayload(snapshot, width, height, format) {
  const settings = snapshot?.settings, resolved = snapshot?.resolved;
  if (!settings || !resolved) throw new Error('Photograph capture settings are missing');
  const date = new Date(snapshot.capturedAt);
  if (typeof snapshot.capturedAt !== 'string' || !snapshot.capturedAt.endsWith('Z') || !Number.isFinite(date.valueOf())) {
    throw new Error('Photograph capture time must be an ISO UTC timestamp');
  }
  positive(resolved.aperture, 'aperture'); positive(resolved.shutter, 'shutter');
  positive(resolved.iso, 'ISO', 65535);
  if (!Number.isInteger(resolved.iso)) throw new Error('Photograph ISO must be an integer');
  positive(settings.focal, 'focal length'); positive(settings.focus, 'focus distance');
  positive(settings.wb, 'white balance');
  if (!Object.hasOwn(PROGRAM, settings.mode) || !Number.isFinite(settings.compensation)) throw new Error('Invalid photograph exposure settings');
  const extended = {
    schema: 'camera-simulator/photo/v1', simulated: true, software: SOFTWARE,
    capturedAt: date.toISOString(), exifDateTimeZone: 'UTC', width, height, format,
    settings: pick(settings, SETTINGS),
    resolved: pick(resolved, ['aperture', 'shutter', 'iso', 'deviation', 'limited']),
    scene: pick(snapshot.scene, ['id', 'name']), source: pick(snapshot.source, SOURCE),
    simulationTime: snapshot.simulationTime, focusPoint: pick(snapshot.focusPoint, ['x', 'y']),
    rendering: pick(snapshot.rendering, RENDERING),
  };
  const json = JSON.stringify(extended);
  // UserComment's declared ASCII encoding must remain ASCII even for Chinese
  // scene names. JSON escapes preserve all Unicode without a private encoding.
  const asciiJson = json.replace(/[\u007f-\uffff]/g, c => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
  if (asciiJson.length > MAX_METADATA_BYTES) throw new Error('Photograph metadata is too large');
  const comment = 'ASCII\0\0\0' + asciiJson + (asciiJson.length % 2 ? ' ' : '');
  const timestamp = date.toISOString().slice(0, 19).replaceAll('-', ':').replace('T', ' ');
  const compensation = settings.mode === 'M' && !settings.autoISO ? 0 : settings.compensation;
  serializerPromise ??= import('piexifjs').catch(error => { serializerPromise = undefined; throw error; });
  const imported = await serializerPromise;
  const piexif = imported.default ?? imported;
  // Numeric IDs are explicitly allowlisted: never copy source-image tags or
  // pretend this software image came from a camera manufacturer, lens, or GPS.
  const exif = {
    '0th': {
      270: alignedAscii(DESCRIPTION), 274: 1, 282: [96, 1], 283: [96, 1],
      296: 2, 305: alignedAscii(SOFTWARE), 306: timestamp,
      ...(format === 'jpeg' ? {531: 1} : {}),
    },
    Exif: {
      33434: rational(resolved.shutter), 33437: rational(resolved.aperture),
      34850: PROGRAM[settings.mode], 34855: resolved.iso,
      36864: '0220', 36867: timestamp, 36868: timestamp,
      37121: format === 'jpeg' ? '\x01\x02\x03\0' : '\x04\x05\x06\0',
      37380: rational(compensation, true), 37382: rational(settings.focus),
      37383: METERING[settings.metering] ?? 0, 37386: rational(settings.focal),
      37510: comment, 37521: date.toISOString().slice(20, 23),
      40960: '0100', 40961: 1, 40962: width, 40963: height,
      41986: settings.mode === 'M' ? 1 : 0, 41987: 1,
    },
  };
  const bytes = normalizeExif(binaryBytes(piexif.dump(exif)));
  if (bytes.length > 65533) throw new Error('EXIF exceeds a JPEG APP1 segment');
  return {bytes, json, capturedAt: extended.capturedAt};
}

function writeJpeg(bytes, exif) {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes.at(-2) !== 0xff || bytes.at(-1) !== 0xd9) {
    throw new Error('Invalid encoded JPEG photograph');
  }
  const segment = new Uint8Array(exif.length + 4);
  segment.set([0xff, 0xe1, (exif.length + 2) >>> 8, (exif.length + 2) & 255]);
  segment.set(exif, 4);
  const parts = [bytes.subarray(0, 2)];
  let offset = 2, inserted = false, sawScan = false;
  while (offset < bytes.length) {
    const start = offset;
    if (bytes[offset++] !== 0xff) throw new Error('Invalid JPEG marker');
    while (bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];
    if (marker === 0xda) {
      if (!inserted) parts.push(segment);
      parts.push(bytes.subarray(start)); sawScan = true; break;
    }
    if (marker === 0xd8 || marker === 0xd9 || marker === 0 || offset + 2 > bytes.length) throw new Error('Invalid JPEG segment');
    const length = bytes[offset] * 256 + bytes[offset + 1];
    if (length < 2 || offset + length > bytes.length) throw new Error('Truncated JPEG segment');
    // Keep a leading JFIF APP0 first, and do not remove unrelated APP1/XMP.
    if (!inserted && marker !== 0xe0) { parts.push(segment); inserted = true; }
    if (!(marker === 0xe1 && length >= 8 && startsWith(bytes, [69, 120, 105, 102, 0, 0], offset + 2))) {
      parts.push(bytes.subarray(start, offset + length));
    }
    offset += length;
  }
  if (!sawScan) throw new Error('JPEG photograph has no image scan');
  return join(parts);
}

const crcTable = Uint32Array.from({length: 256}, (_, n) => {
  for (let bit = 0; bit < 8; bit++) n = (n & 1) ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const bytes = new Uint8Array(data.length + 12), view = new DataView(bytes.buffer);
  view.setUint32(0, data.length); bytes.set(encoder.encode(type), 4); bytes.set(data, 8);
  view.setUint32(data.length + 8, crc32(bytes.subarray(4, data.length + 8)));
  return bytes;
}
function textChunk(keyword, text) { return chunk('iTXt', join([encoder.encode(keyword), new Uint8Array(5), encoder.encode(text)])); }
function writePng(bytes, metadata, width, height) {
  if (!startsWith(bytes, PNG_SIGNATURE)) throw new Error('Invalid encoded PNG photograph');
  const parts = [bytes.subarray(0, 8)], keywords = new Set(['Software', 'Description', 'Creation Time', JSON_KEYWORD]);
  let offset = 8, sawHeader = false, sawData = false, sawEnd = false;
  while (offset + 12 <= bytes.length) {
    const length = read32(bytes, offset), end = offset + length + 12;
    if (length > 0x7fffffff || end > bytes.length) throw new Error('Truncated PNG chunk');
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    const data = bytes.subarray(offset + 8, end - 4);
    if (!sawHeader && type !== 'IHDR') throw new Error('PNG does not start with IHDR');
    if (type === 'IHDR') {
      if (sawHeader || length !== 13 || read32(data, 0) !== width || read32(data, 4) !== height) throw new Error('PNG dimensions do not match photograph');
      sawHeader = true; parts.push(bytes.subarray(offset, end));
      parts.push(chunk('eXIf', metadata.bytes.subarray(6)), textChunk('Software', SOFTWARE),
        textChunk('Description', DESCRIPTION), textChunk('Creation Time', new Date(metadata.capturedAt).toUTCString()), textChunk(JSON_KEYWORD, metadata.json));
    } else {
      const separator = data.indexOf(0);
      const ownedText = ['iTXt', 'tEXt', 'zTXt'].includes(type) && separator >= 0 && separator <= 79 &&
        keywords.has(String.fromCharCode(...data.subarray(0, separator)));
      if (type !== 'eXIf' && !ownedText) parts.push(bytes.subarray(offset, end));
      if (type === 'IDAT') sawData = true;
      if (type === 'IEND') { if (length !== 0 || end !== bytes.length) throw new Error('Invalid PNG ending'); sawEnd = true; break; }
    }
    offset = end;
  }
  if (!sawHeader || !sawData || !sawEnd) throw new Error('Incomplete PNG photograph');
  return join(parts);
}

/** Add capture-time EXIF (and PNG iTXt) without decoding/re-encoding pixels.
 * Only accepts a newly encoded photograph, not arbitrary user-uploaded images.
 * The source bytes and immutable snapshot are never modified.
 */
export async function addPhotoMetadata(bytes, format, snapshot, width, height) {
  if (!(bytes instanceof Uint8Array)) throw new TypeError('Photograph bytes must be Uint8Array');
  if (format !== 'jpeg' && format !== 'png') throw new Error('Unsupported photograph format');
  dimension(width); dimension(height);
  const metadata = await exifPayload(snapshot, width, height, format);
  return format === 'jpeg' ? writeJpeg(bytes, metadata.bytes) : writePng(bytes, metadata, width, height);
}
