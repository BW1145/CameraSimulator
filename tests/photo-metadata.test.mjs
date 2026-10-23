import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {crc32} from 'node:zlib';
import sharp from 'sharp';
import readExif from 'exif-reader';
import {DEFAULTS} from '../src/camera.js';
import {addPhotoMetadata} from '../src/photo-metadata.js';

const WIDTH = 12, HEIGHT = 8;
function snapshot(overrides = {}) {
  return {
    capturedAt: '2026-10-23T03:12:34.567Z',
    settings: {...DEFAULTS, mode: 'A', autoISO: true, aperture: 4, shutter: 1 / 125, iso: 100,
      wb: 6200, focus: 3.25, focal: 50, compensation: -1 / 3, metering: 'spot'},
    resolved: {aperture: 5.6, shutter: 1 / 8000, iso: 3200, deviation: 0.1, limited: false},
    scene: {id: 'barbershop', name: '理发店 🪞'}, source: {kind: 'photographic-plate', viewId: 'center', sourceSha256: 'abc'},
    simulationTime: 2.25, focusPoint: {x: 0.25, y: 0.75},
    rendering: {overlaysIncluded: false, exposureOffset: 0}, ...overrides,
  };
}
function freeze(object) {
  Object.values(object).forEach(value => { if (value && typeof value === 'object') freeze(value); });
  return Object.freeze(object);
}
async function encoded(format) {
  const pixels = Buffer.alloc(WIDTH * HEIGHT * 3);
  for (let i = 0; i < pixels.length; i++) pixels[i] = (i * 71) % 256;
  return sharp(pixels, {raw: {width: WIDTH, height: HEIGHT, channels: 3}})[format]().toBuffer();
}
function pngChunks(bytes) {
  const data = Buffer.from(bytes), chunks = [];
  for (let offset = 8; offset < data.length;) {
    const length = data.readUInt32BE(offset), type = data.toString('ascii', offset + 4, offset + 8);
    assert.equal(data.readUInt32BE(offset + length + 8), crc32(data.subarray(offset + 4, offset + length + 8)), `${type} CRC`);
    chunks.push({type, data: data.subarray(offset + 8, offset + length + 8)});
    offset += length + 12;
  }
  return chunks;
}
function jpegSegments(bytes) {
  const data = Buffer.from(bytes), segments = [];
  for (let offset = 2; offset < data.length;) {
    assert.equal(data[offset], 255);
    const marker = data[offset + 1];
    if (marker === 0xda) { segments.push({marker, data: data.subarray(offset)}); break; }
    const length = data.readUInt16BE(offset + 2);
    segments.push({marker, data: data.subarray(offset + 4, offset + length + 2)});
    offset += length + 2;
  }
  return segments;
}
function checkTiffAlignment(exif) {
  const buffer = Buffer.from(exif), bytes = buffer.toString('ascii', 0, 4) === 'Exif' ? buffer.subarray(6) : buffer;
  assert.equal(bytes.toString('ascii', 0, 2), 'MM');
  const sizes = {1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 10: 8};
  const visit = offset => {
    assert.equal(offset % 2, 0, 'IFD aligned');
    const count = bytes.readUInt16BE(offset);
    for (let i = 0; i < count; i++) {
      const pos = offset + 2 + i * 12, tag = bytes.readUInt16BE(pos), type = bytes.readUInt16BE(pos + 2);
      const size = sizes[type] * bytes.readUInt32BE(pos + 4), value = bytes.readUInt32BE(pos + 8);
      if (size > 4) { assert.equal(value % 2, 0, `tag ${tag} aligned`); assert.ok(value + size <= bytes.length); }
      if (tag === 34665) visit(value);
    }
  };
  visit(bytes.readUInt32BE(4));
}

for (const format of ['jpeg', 'png']) {
  test(`${format}: independent sharp + exif-reader decode actual capture metadata and unchanged pixels`, async () => {
    const input = await encoded(format), original = Buffer.from(input), capture = freeze(snapshot());
    const before = JSON.stringify(capture);
    const output = await addPhotoMetadata(input, format, capture, WIDTH, HEIGHT);
    assert.ok(output instanceof Uint8Array); assert.deepEqual(input, original); assert.equal(JSON.stringify(capture), before);
    const metadata = await sharp(output).metadata();
    assert.equal(metadata.format, format); assert.equal(metadata.width, WIDTH); assert.equal(metadata.height, HEIGHT);
    assert.deepEqual(await sharp(output).raw().toBuffer(), await sharp(input).raw().toBuffer());
    const parsed = readExif(metadata.exif), photo = parsed.Photo;
    assert.equal(parsed.Image.Software, 'CameraSimulator'); assert.equal(parsed.Image.Orientation, 1);
    assert.match(parsed.Image.ImageDescription, /Simulated photograph.*UTC/);
    assert.equal(photo.ExposureTime, capture.resolved.shutter); assert.equal(photo.FNumber, capture.resolved.aperture);
    assert.equal(photo.ISOSpeedRatings, 3200); assert.equal(photo.ExposureProgram, 3);
    assert.equal(photo.ExposureBiasValue, -1 / 3); assert.equal(photo.SubjectDistance, 3.25);
    assert.equal(photo.FocalLength, 50); assert.equal(photo.MeteringMode, 3); assert.equal(photo.WhiteBalance, 1);
    assert.equal(photo.PixelXDimension, WIDTH); assert.equal(photo.PixelYDimension, HEIGHT);
    assert.equal(photo.DateTimeOriginal.toISOString(), '2026-10-23T03:12:34.000Z');
    assert.equal(photo.SubSecTimeOriginal, '567');
    assert.equal(parsed.Image.Make, undefined); assert.equal(parsed.Image.Model, undefined); assert.equal(parsed.GPSInfo, undefined);
    assert.equal(photo.MakerNote, undefined); assert.equal(photo.LensModel, undefined);
    assert.equal(photo.UserComment.subarray(0, 8).toString('binary'), 'ASCII\0\0\0');
    assert.ok([...photo.UserComment].every(byte => byte < 128));
    const extended = JSON.parse(photo.UserComment.subarray(8).toString('ascii'));
    assert.equal(extended.schema, 'camera-simulator/photo/v1'); assert.equal(extended.simulated, true);
    assert.equal(extended.capturedAt, capture.capturedAt); assert.equal(extended.exifDateTimeZone, 'UTC');
    assert.deepEqual(extended.settings, capture.settings); assert.deepEqual(extended.resolved, capture.resolved);
    assert.equal(extended.scene.name, capture.scene.name); assert.deepEqual(extended.source, capture.source);
    assert.deepEqual(extended.focusPoint, capture.focusPoint); assert.equal(extended.rendering.overlaysIncluded, false);
    checkTiffAlignment(metadata.exif);
    if (format === 'jpeg') {
      const a = jpegSegments(input), b = jpegSegments(output);
      assert.deepEqual(b.find(s => s.marker === 0xda), a.find(s => s.marker === 0xda));
      assert.equal(b.filter(s => s.marker === 0xe1 && s.data.toString('ascii', 0, 4) === 'Exif').length, 1);
      if (a[0].marker === 0xe0) assert.equal(b[0].marker, 0xe0);
    } else {
      const a = pngChunks(input), b = pngChunks(output);
      assert.deepEqual(b.filter(c => c.type === 'IDAT'), a.filter(c => c.type === 'IDAT'));
      assert.equal(b.filter(c => c.type === 'eXIf').length, 1);
      assert.ok(b.findIndex(c => c.type === 'eXIf') < b.findIndex(c => c.type === 'IDAT'));
      assert.equal(b.find(c => c.type === 'eXIf').data.toString('ascii', 0, 2), 'MM');
      const text = b.filter(c => c.type === 'iTXt').map(c => {
        const nullIndex = c.data.indexOf(0);
        assert.deepEqual(c.data.subarray(nullIndex, nullIndex + 5), Buffer.alloc(5));
        return [c.data.toString('ascii', 0, nullIndex), c.data.toString('utf8', nullIndex + 5)];
      });
      const comments = Object.fromEntries(text);
      assert.equal(comments.Software, 'CameraSimulator'); assert.equal(comments['Creation Time'], new Date(capture.capturedAt).toUTCString());
      assert.deepEqual(JSON.parse(comments.CameraSimulator), extended);
    }
    assert.deepEqual(await addPhotoMetadata(output, format, capture, WIDTH, HEIGHT), output, 'repeated metadata write replaces, not duplicates');
  });
}

test('all modes, metering choices and slow shutter values retain exact numeric semantics', async () => {
  const input = await encoded('jpeg');
  for (const [mode, program] of Object.entries({M: 1, P: 2, A: 3, S: 4})) {
    for (const [metering, number] of Object.entries({matrix: 5, center: 2, spot: 3})) {
      const capture = snapshot(); capture.settings = {...capture.settings, mode, metering, autoISO: false, compensation: 2 / 3};
      capture.resolved = {aperture: 2.8, shutter: 30, iso: 50};
      const bytes = await addPhotoMetadata(input, 'jpeg', capture, WIDTH, HEIGHT);
      const photo = readExif((await sharp(bytes).metadata()).exif).Photo;
      assert.equal(photo.ExposureProgram, program); assert.equal(photo.MeteringMode, number);
      assert.equal(photo.ExposureTime, 30); assert.equal(photo.FNumber, 2.8); assert.equal(photo.ISOSpeedRatings, 50);
      assert.equal(photo.ExposureBiasValue, mode === 'M' ? 0 : 2 / 3);
    }
  }
});

test('Uint8Array views respect byteOffset and metadata excludes arbitrary extra properties', async () => {
  const input = await encoded('png'), wrapper = new Uint8Array(input.length + 10); wrapper.set(input, 4);
  const capture = snapshot(); capture.settings.secret = 'not metadata'; capture.source.private = 'not metadata';
  const bytes = await addPhotoMetadata(wrapper.subarray(4, 4 + input.length), 'png', capture, WIDTH, HEIGHT);
  const comment = readExif((await sharp(bytes).metadata()).exif).Photo.UserComment;
  const json = JSON.parse(comment.subarray(8).toString('ascii'));
  assert.equal(json.settings.secret, undefined); assert.equal(json.source.private, undefined);
});

test('invalid formats, snapshots, byte streams, dimensions and oversized comments reject', async () => {
  const jpeg = await encoded('jpeg'), png = await encoded('png');
  await assert.rejects(addPhotoMetadata(jpeg, 'webp', snapshot(), WIDTH, HEIGHT), /Unsupported/);
  await assert.rejects(addPhotoMetadata([], 'jpeg', snapshot(), WIDTH, HEIGHT), /Uint8Array/);
  await assert.rejects(addPhotoMetadata(jpeg, 'jpeg', snapshot(), 0, HEIGHT), /dimensions/);
  await assert.rejects(addPhotoMetadata(png, 'png', snapshot(), WIDTH + 1, HEIGHT), /dimensions/);
  await assert.rejects(addPhotoMetadata(jpeg, 'jpeg', snapshot({capturedAt: 'invalid'}), WIDTH, HEIGHT), /capture time/);
  await assert.rejects(addPhotoMetadata(jpeg, 'jpeg', snapshot({resolved: {aperture: 4, shutter: NaN, iso: 100}}), WIDTH, HEIGHT), /shutter/);
  await assert.rejects(addPhotoMetadata(jpeg.subarray(0, 20), 'jpeg', snapshot(), WIDTH, HEIGHT), /JPEG/);
  await assert.rejects(addPhotoMetadata(png.subarray(0, 30), 'png', snapshot(), WIDTH, HEIGHT), /PNG/);
  await assert.rejects(addPhotoMetadata(jpeg, 'jpeg', snapshot({scene: {name: 'x'.repeat(60000)}}), WIDTH, HEIGHT), /too large/);
});

// Opt-in to a system/temporary ExifTool executable without shipping Perl/WASM.
// PHOTO_EXIFTOOL=/path/to/exiftool node --test tests/photo-metadata.test.mjs
const exiftool = process.env.PHOTO_EXIFTOOL ?? 'exiftool';
const available = spawnSync(exiftool, ['-ver'], {encoding: 'utf8'});
test('ExifTool independently decodes and validates both containers', {skip: available.status !== 0}, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'camera-exif-test-'));
  try {
    for (const format of ['jpeg', 'png']) {
      const path = join(directory, `photograph.${format}`);
      await writeFile(path, await addPhotoMetadata(await encoded(format), format, snapshot(), WIDTH, HEIGHT));
      const result = spawnSync(exiftool, ['-json', '-n', '-validate', '-warning', '-a', '-all', path], {encoding: 'utf8'});
      assert.equal(result.status, 0, result.stderr);
      const tags = JSON.parse(result.stdout)[0];
      assert.equal(tags.Software, 'CameraSimulator'); assert.equal(tags.ExposureTime, 1 / 8000);
      assert.equal(tags.FNumber, 5.6); assert.equal(tags.ISO, 3200); assert.equal(tags.WhiteBalance, 1);
      assert.equal(tags.SubjectDistance, 3.25); assert.ok(Math.abs(tags.ExposureCompensation + 1 / 3) < 1e-9);
      assert.equal(tags.DateTimeOriginal, '2026:10:23 03:12:34');
      assert.equal(JSON.parse(tags.UserComment).settings.wb, 6200);
      assert.equal(tags.Make, undefined); assert.equal(tags.Model, undefined); assert.equal(tags.GPSLatitude, undefined);
      assert.equal(tags.Validate, '0 0 0', JSON.stringify(tags));
      assert.equal(tags.Warning, undefined, JSON.stringify(tags));
    }
  } finally { await rm(directory, {recursive: true, force: true}); }
});
