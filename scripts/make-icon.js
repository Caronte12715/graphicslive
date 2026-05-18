/**
 * make-icon.js
 * Genera icon.ico para Windows usando sharp + escritura manual del formato ICO
 * Sin dependencias nativas problemáticas
 */
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const SOURCE   = path.resolve(__dirname, '..', 'assets', 'icons', 'source.png');
const DEST_ICO = path.resolve(__dirname, '..', 'assets', 'icons', 'icon.ico');

// ICO solo requiere potencias de 2 (y 256 como máximo sin PNG embedding)
const SIZES = [16, 24, 32, 48, 64, 128, 256];

/**
 * Construye un archivo .ico desde buffers PNG.
 * Formato ICO: https://en.wikipedia.org/wiki/ICO_(file_format)
 */
function buildIco(entries) {
  // entries: [{ width, height, pngBuffer }]
  const count = entries.length;

  // Tamaño del header: 6 bytes
  // Tamaño del directorio: count * 16 bytes
  const dirOffset = 6 + count * 16;
  let dataOffset = dirOffset;

  // Calcular offsets de imagen
  const images = entries.map(e => {
    const offset = dataOffset;
    dataOffset += e.pngBuffer.length;
    return { ...e, offset };
  });

  const totalSize = dataOffset;
  const buf = Buffer.alloc(totalSize);
  let pos = 0;

  // ICO Header (6 bytes)
  buf.writeUInt16LE(0, pos);        // Reserved = 0
  buf.writeUInt16LE(1, pos + 2);    // Type = 1 (ICO)
  buf.writeUInt16LE(count, pos + 4);// Image count
  pos += 6;

  // Directory entries (16 bytes each)
  for (const img of images) {
    buf.writeUInt8(img.width === 256 ? 0 : img.width, pos);    // Width (0 = 256)
    buf.writeUInt8(img.height === 256 ? 0 : img.height, pos+1); // Height
    buf.writeUInt8(0, pos+2);   // Color count (0 = no palette)
    buf.writeUInt8(0, pos+3);   // Reserved
    buf.writeUInt16LE(1, pos+4);// Color planes
    buf.writeUInt16LE(32, pos+6);// Bits per pixel
    buf.writeUInt32LE(img.pngBuffer.length, pos+8);  // Image size
    buf.writeUInt32LE(img.offset, pos+12); // Offset from start
    pos += 16;
  }

  // Image data (PNG chunks embebidos directamente — formato válido)
  for (const img of images) {
    img.pngBuffer.copy(buf, pos);
    pos += img.pngBuffer.length;
  }

  return buf;
}

async function main() {
  console.log('📦 Generando íconos...');
  const entries = [];

  for (const size of SIZES) {
    const pngBuffer = await sharp(SOURCE)
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
    entries.push({ width: size, height: size, pngBuffer });
    console.log(`  ✓ ${size}×${size} (${(pngBuffer.length/1024).toFixed(1)} KB)`);
  }

  console.log('🔄 Construyendo icon.ico...');
  const icoBuffer = buildIco(entries);
  fs.writeFileSync(DEST_ICO, icoBuffer);
  console.log(`  ✓ icon.ico → ${(icoBuffer.length/1024).toFixed(1)} KB`);
  console.log(`  📍 ${DEST_ICO}`);
  console.log('✅ ¡Listo!');
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
