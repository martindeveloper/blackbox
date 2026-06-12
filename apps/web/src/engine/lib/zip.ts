const encoder = new TextEncoder();

interface ZipEntry {
  name: Uint8Array;
  data: Uint8Array;
  crc: number;
  offset: number;
}

export function createZip(files: Record<string, string>): Blob {
  const entries: ZipEntry[] = [];
  const localParts: Uint8Array[] = [];
  let offset = 0;

  for (const [name, contents] of Object.entries(files)) {
    const entry = {
      name: encoder.encode(name),
      data: encoder.encode(contents),
      crc: 0,
      offset,
    };
    entry.crc = crc32(entry.data);
    const header = localHeader(entry);
    localParts.push(header, entry.data);
    offset += header.byteLength + entry.data.byteLength;
    entries.push(entry);
  }

  const centralParts = entries.map(centralHeader);
  const centralSize = centralParts.reduce((sum, part) => sum + part.byteLength, 0);
  const end = endRecord(entries.length, centralSize, offset);
  return new Blob(
    [...(localParts as BlobPart[]), ...(centralParts as BlobPart[]), end as BlobPart],
    { type: "application/zip" },
  );
}

function localHeader(entry: ZipEntry): Uint8Array {
  const header = new Uint8Array(30 + entry.name.byteLength);
  const view = new DataView(header.buffer);
  view.setUint32(0, 0x04034b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 0x0800, true);
  view.setUint16(8, 0, true);
  view.setUint32(14, entry.crc, true);
  view.setUint32(18, entry.data.byteLength, true);
  view.setUint32(22, entry.data.byteLength, true);
  view.setUint16(26, entry.name.byteLength, true);
  header.set(entry.name, 30);
  return header;
}

function centralHeader(entry: ZipEntry): Uint8Array {
  const header = new Uint8Array(46 + entry.name.byteLength);
  const view = new DataView(header.buffer);
  view.setUint32(0, 0x02014b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 20, true);
  view.setUint16(8, 0x0800, true);
  view.setUint16(10, 0, true);
  view.setUint32(16, entry.crc, true);
  view.setUint32(20, entry.data.byteLength, true);
  view.setUint32(24, entry.data.byteLength, true);
  view.setUint16(28, entry.name.byteLength, true);
  view.setUint32(42, entry.offset, true);
  header.set(entry.name, 46);
  return header;
}

function endRecord(entryCount: number, centralSize: number, centralOffset: number): Uint8Array {
  const record = new Uint8Array(22);
  const view = new DataView(record.buffer);
  view.setUint32(0, 0x06054b50, true);
  view.setUint16(8, entryCount, true);
  view.setUint16(10, entryCount, true);
  view.setUint32(12, centralSize, true);
  view.setUint32(16, centralOffset, true);
  return record;
}

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}
