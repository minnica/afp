// Recorta únicamente marcas y motivos; nunca publica la pantalla de Wallet
// ni las terminaciones que aparecen debajo de los plásticos.
const path = require("node:path");
const sharp = require("sharp");

const root = path.resolve(__dirname, "..");
const references = path.join(root, "estados_cuenta/_soporte/referencias_tarjetas");
const output = path.join(root, "public/card-brands");

async function crop(source, name, bounds) {
  await sharp(path.join(references, source)).extract(bounds).webp({ quality: 88 }).toFile(path.join(output, name));
}

async function mask(source, name, bounds, color, getAlpha) {
  const { data, info } = await sharp(path.join(references, source)).extract(bounds).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let index = 0; index < data.length; index += 4) {
    const alpha = getAlpha(data[index], data[index + 1], data[index + 2]);
    data[index] = color[0];
    data[index + 1] = color[1];
    data[index + 2] = color[2];
    data[index + 3] = Math.max(0, Math.min(255, Math.round(alpha)));
  }
  await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).webp({ lossless: true }).toFile(path.join(output, name));
}

async function main() {
  await crop("bbva.jpeg", "bbva-platinum-motif.webp", { left: 248, top: 576, width: 230, height: 213 });
  await mask("hsbc-zero.png", "hsbc-zero-motif.webp", { left: 220, top: 92, width: 150, height: 145 }, [255, 255, 255], (r, g, b) => (Math.min(r, g, b) - 239) * 16);
  await mask("joy.jpeg", "banamex-wordmark.webp", { left: 78, top: 516, width: 284, height: 60 }, [255, 255, 255], (r, g, b) => (Math.min(r, g, b) - 75) * 4);
  const petals = { left: 370, top: 486, width: 304, height: 284 };
  const { data, info } = await sharp(path.join(references, "joy.jpeg")).extract(petals).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let index = 0; index < data.length; index += 4) {
    // El recorte empieza después de la marca; solo conserva los pétalos rojos.
    data[index + 3] = Math.max(0, Math.min(255, Math.round((data[index] - Math.max(data[index + 1], data[index + 2]) - 15) * 4)));
  }
  await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).webp({ quality: 90 }).toFile(path.join(output, "joy-reference-petals.webp"));
  // LikeU y Santander usan trazos del folleto oficial y una trama SVG generada
  // por generate-likeu-pattern.cjs; no volver a obtenerlos desde la captura.
  await mask("didi.jpeg", "didi-card-wordmark.webp", { left: 72, top: 510, width: 140, height: 43 }, [255, 255, 255], (r, g, b) => (Math.min(r, g, b) - 110) * 1.8);
  await crop("mercadopago.png", "mercado-pago-motif.webp", { left: 260, top: 804, width: 435, height: 315 });
  console.log("Seis recursos de marcas y motivos preparados desde las referencias locales; LikeU conserva sus SVG.");
}

main().catch(error => { console.error(error); process.exitCode = 1; });
