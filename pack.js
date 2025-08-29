#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

function writeCString(bufs, str) {
  bufs.push(Buffer.from(str, "utf8"));
  bufs.push(Buffer.from([0]));
}

function writeUInt32LE(bufs, val) {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(val, 0);
  bufs.push(b);
}

function packPbo(inputDir, outputFile) {
  let buffers = [];
  let files = [];

  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else {
        const relPath = path.relative(inputDir, fullPath).replace(/\\/g, "/");
        const data = fs.readFileSync(fullPath);
        files.push({ relPath, data });
      }
    }
  }

  walk(inputDir);

  // headers
  for (const f of files) {
    writeCString(buffers, f.relPath);
    writeUInt32LE(buffers, 0);                // packingMethod
    writeUInt32LE(buffers, f.data.length);    // originalSize
    writeUInt32LE(buffers, 0);                // reserved
    writeUInt32LE(buffers, Math.floor(Date.now()/1000)); // timestamp
    writeUInt32LE(buffers, f.data.length);    // dataSize
  }

  // header terminator
  writeCString(buffers, "");
  for (let i = 0; i < 5; i++) writeUInt32LE(buffers, 0);

  // file data
  for (const f of files) {
    buffers.push(f.data);
  }

  // padding
  buffers.push(Buffer.from([0]));

  // checksum
  const tmp = Buffer.concat(buffers);
  const sha1 = crypto.createHash("sha1").update(tmp).digest();
  buffers.push(sha1);

  // write file
  fs.writeFileSync(outputFile, Buffer.concat(buffers));
  console.log(`Packed ${files.length} files into ${outputFile}`);
}

// CLI
if (process.argv.length < 4) {
  console.error("Usage: node packPbo.js <input_folder> <output.pbo>");
  process.exit(1);
}

packPbo(process.argv[2], process.argv[3]);
