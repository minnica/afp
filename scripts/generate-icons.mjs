import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const iconDirectory = path.join(projectRoot, "public/icons");
const source = await readFile(path.join(iconDirectory, "app-icon.svg"), "utf8");
const maskableSource = source.replace("scale(1.12)", "scale(1)");

// Renderiza desde el vector con sobremuestreo; cada tamaño se exporta por separado.
async function renderPng(svg, size, withAlpha = false) {
  const image = sharp(Buffer.from(svg), { density: 216 })
    .resize(size, size, { kernel: sharp.kernel.lanczos3 });
  const opaqueImage = withAlpha ? image.ensureAlpha(1) : image.removeAlpha();
  return opaqueImage.png({ compressionLevel: 9 }).toBuffer();
}

const exports = [
  ["app-icon-v3-192.png", 192, source],
  ["app-icon-v3-512.png", 512, source],
  ["app-icon-v3-1024.png", 1024, source],
  ["app-icon-v3-maskable-512.png", 512, maskableSource],
  ["apple-touch-icon-v3.png", 180, source],
];

for (const [name, size, svg] of exports) {
  await writeFile(path.join(iconDirectory, name), await renderPng(svg, size));
  console.log(`${name}: ${size}×${size}`);
}

// ICO multirresolución con imágenes PNG: evita ampliar un favicon pequeño.
const sizes = [16, 32, 48, 64, 128, 256];
const images = await Promise.all(sizes.map((size) => renderPng(source, size, true)));
const header = Buffer.alloc(6 + sizes.length * 16);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
let offset = header.length;

images.forEach((image, index) => {
  const entry = 6 + index * 16;
  header.writeUInt8(sizes[index] === 256 ? 0 : sizes[index], entry);
  header.writeUInt8(sizes[index] === 256 ? 0 : sizes[index], entry + 1);
  header.writeUInt16LE(1, entry + 4);
  header.writeUInt16LE(32, entry + 6);
  header.writeUInt32LE(image.length, entry + 8);
  header.writeUInt32LE(offset, entry + 12);
  offset += image.length;
});

await writeFile(path.join(projectRoot, "src/app/favicon.ico"), Buffer.concat([header, ...images]));
console.log(`favicon.ico: ${sizes.join(", ")} px`);
