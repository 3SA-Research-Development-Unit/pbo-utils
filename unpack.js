#!/usr/bin/env node

// Simple PBO unpacker in Node.js
// Usage: node unpackPbo.js input.pbo output_folder

const fs = require("fs");
const path = require("path");

// read a null-terminated string from buffer at given offset
function readCString(buf, offset) {
  let end = offset;
  while (end < buf.length && buf[end] !== 0) end++;
  return buf.toString("utf8", offset, end);
}

// read header structure
function readHeader(buf, offset) {
  const filename = readCString(buf, offset);
  offset += Buffer.byteLength(filename, "utf8") + 1;

  const packingMethod = buf.readUInt32LE(offset); offset += 4;
  const originalSize  = buf.readUInt32LE(offset); offset += 4;
  const reserved      = buf.readUInt32LE(offset); offset += 4;
  const timestamp     = buf.readUInt32LE(offset); offset += 4;
  const dataSize      = buf.readUInt32LE(offset); offset += 4;

  return {
    header: { filename, packingMethod, originalSize, reserved, timestamp, dataSize },
    offset
  };
}

function unpackPbo(inputPath, outputDir) {
  const buf = fs.readFileSync(inputPath);
  let offset = 0;
  let headers = [];
  let headerExtensions = {};

  let first = true;
  while (true) {
    const { header, offset: newOffset } = readHeader(buf, offset);
    offset = newOffset;

    if (header.packingMethod === 0x56657273) { // "Vers"
      if (!first) throw new Error("Unexpected Vers header");
      while (true) {
        const key = readCString(buf, offset);
        offset += Buffer.byteLength(key, "utf8") + 1;
        if (!key) break;
        const val = readCString(buf, offset);
        offset += Buffer.byteLength(val, "utf8") + 1;
        headerExtensions[key] = val;
      }
    } else if (header.filename === "") {
      break;
    } else {
      headers.push(header);
    }
    first = false;
  }

  // extract files
  fs.mkdirSync(outputDir, { recursive: true });
  if (Object.keys(headerExtensions).length > 0) {
    const prefixFile = path.join(outputDir, "$PBOPREFIX$");
    let prefixData = "";
    for (const [k, v] of Object.entries(headerExtensions)) {
      prefixData += `${k}=${v}\n`;
    }
    fs.writeFileSync(prefixFile, prefixData);
  }

  for (const h of headers) {
    const fileData = buf.slice(offset, offset + h.dataSize);
    offset += h.dataSize;
    const outPath = path.join(outputDir, h.filename.replace(/\\/g, path.sep));
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, fileData);
    console.log(`Extracted: ${h.filename} (${h.dataSize} bytes)`);
  }

  // read checksum (20 bytes SHA1)
  const checksum = buf.slice(offset + 1, offset + 21); // skip padding 0
  console.log("Checksum:", checksum.toString("hex"));
}

// CLI
if (process.argv.length < 4) {
  console.error("Usage: node unpackPbo.js <file.pbo> <output_dir>");
  process.exit(1);
}

const inputFile = process.argv[2];
const outputDir = process.argv[3];
unpackPbo(inputFile, outputDir);
