// Contornos vectoriales a distancia constante de la llama oficial de Santander.
// El campo de distancia se usa solo durante la generación: el SVG final no
// contiene imágenes de mapa de bits y permanece nítido a cualquier escala.
const fs = require("node:fs");
const path = require("node:path");
const sharp = require("sharp");

const output = path.resolve(__dirname, "../public/card-brands");
const width = 1000;
const height = 630;
const symbolBox = { left: 496, top: 242, width: 146, height: 142 };

function distance1D(input) {
  const length = input.length;
  const result = new Float64Array(length);
  const sites = new Int32Array(length);
  const breaks = new Float64Array(length + 1);
  let k = 0;
  sites[0] = 0;
  breaks[0] = -Infinity;
  breaks[1] = Infinity;
  for (let q = 1; q < length; q++) {
    let crossing;
    do {
      const p = sites[k];
      crossing = ((input[q] + q * q) - (input[p] + p * p)) / (2 * (q - p));
      if (crossing > breaks[k]) break;
      k--;
    } while (k >= 0);
    k++;
    sites[k] = q;
    breaks[k] = crossing;
    breaks[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < length; q++) {
    while (breaks[k + 1] < q) k++;
    result[q] = (q - sites[k]) ** 2 + input[sites[k]];
  }
  return result;
}

function simplify(points, tolerance = .45) {
  if (points.length < 3) return points;
  const first = points[0], last = points.at(-1);
  let maxDistance = 0, index = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const [x, y] = points[i], dx = last[0] - first[0], dy = last[1] - first[1];
    const t = Math.max(0, Math.min(1, ((x - first[0]) * dx + (y - first[1]) * dy) / (dx * dx + dy * dy || 1)));
    const distance = Math.hypot(x - first[0] - t * dx, y - first[1] - t * dy);
    if (distance > maxDistance) { maxDistance = distance; index = i; }
  }
  if (maxDistance <= tolerance) return [first, last];
  return [...simplify(points.slice(0, index + 1), tolerance).slice(0, -1), ...simplify(points.slice(index), tolerance)];
}

const pointKey = point => point.map(value => Math.round(value * 1000)).join(",");
const coords = point => point.map(value => +value.toFixed(2)).join(" ");

function pathsFromSegments(segments) {
  const edges = new Map();
  for (const [index, segment] of segments.entries()) for (const point of segment) {
    const key = pointKey(point);
    if (!edges.has(key)) edges.set(key, []);
    edges.get(key).push(index);
  }
  const used = new Set();
  const paths = [];
  for (let first = 0; first < segments.length; first++) {
    if (used.has(first)) continue;
    const initial = segments[first];
    // Empezar por un extremo para conservar los contornos abiertos del borde.
    const pending = [...initial];
    let start = pending[0];
    const visited = new Set();
    while (pending.length) {
      const point = pending.pop(), key = pointKey(point);
      if (visited.has(key)) continue;
      visited.add(key);
      const adjacent = edges.get(key);
      if (adjacent.length === 1) { start = point; break; }
      for (const edge of adjacent) for (const next of segments[edge]) if (!visited.has(pointKey(next))) pending.push(next);
    }
    const points = [start];
    let point = start;
    while (true) {
      const next = edges.get(pointKey(point)).find(index => !used.has(index));
      if (next == null) break;
      used.add(next);
      const segment = segments[next];
      point = pointKey(segment[0]) === pointKey(point) ? segment[1] : segment[0];
      points.push(point);
    }
    const reduced = simplify(points);
    if (reduced.length < 3) continue;
    let d = `M ${coords(reduced[0])}`;
    for (let i = 1; i < reduced.length - 1; i++) {
      const middle = [(reduced[i][0] + reduced[i + 1][0]) / 2, (reduced[i][1] + reduced[i + 1][1]) / 2];
      d += ` Q ${coords(reduced[i])} ${coords(middle)}`;
    }
    d += ` L ${coords(reduced.at(-1))}`;
    paths.push(d);
  }
  return paths;
}

async function main() {
  const flame = await sharp(path.join(output, "santander-flame.svg")).resize(symbolBox.width, symbolBox.height).png().toBuffer();
  const { data } = await sharp({ create: { width, height, channels: 4, background: "#00000000" } }).composite([{ input: flame, left: symbolBox.left, top: symbolBox.top }]).raw().toBuffer({ resolveWithObject: true });
  const field = new Float64Array(width * height);
  for (let y = 0; y < height; y++) {
    const row = new Float64Array(width);
    for (let x = 0; x < width; x++) row[x] = data[(y * width + x) * 4 + 3] > 128 ? 0 : 1e12;
    field.set(distance1D(row), y * width);
  }
  for (let x = 0; x < width; x++) {
    const column = new Float64Array(height);
    for (let y = 0; y < height; y++) column[y] = field[y * width + x];
    const distances = distance1D(column);
    for (let y = 0; y < height; y++) field[y * width + x] = Math.sqrt(distances[y]);
  }
  const spacing = 8.5;
  const contours = new Map();
  for (let y = 0; y < height - 1; y++) for (let x = 0; x < width - 1; x++) {
    const corners = [[x,y], [x+1,y], [x+1,y+1], [x,y+1]];
    const values = [field[y*width+x], field[y*width+x+1], field[(y+1)*width+x+1], field[(y+1)*width+x]];
    const low = Math.ceil(Math.min(...values) / spacing), high = Math.floor(Math.max(...values) / spacing);
    for (let level = Math.max(low, 1); level <= high; level++) {
      const threshold = level * spacing, intersections = [];
      for (let edge = 0; edge < 4; edge++) {
        const next = (edge + 1) % 4;
        if ((values[edge] < threshold) === (values[next] < threshold)) continue;
        const t = (threshold - values[edge]) / (values[next] - values[edge]);
        intersections.push([corners[edge][0] + t * (corners[next][0] - corners[edge][0]), corners[edge][1] + t * (corners[next][1] - corners[edge][1])]);
      }
      if (!contours.has(level)) contours.set(level, []);
      for (let i = 0; i + 1 < intersections.length; i += 2) contours.get(level).push([intersections[i], intersections[i + 1]]);
    }
  }
  const paths = [...contours.values()].flatMap(pathsFromSegments);
  const flamePaths = fs.readFileSync(path.join(output, "santander-flame.svg"), "utf8").replace(/^<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="630" viewBox="0 0 1000 630"><defs><linearGradient id="pearl" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#b4cedc"/><stop offset=".35" stop-color="#dbb0cf"/><stop offset=".65" stop-color="#a9d7c6"/><stop offset="1" stop-color="#d9bcc8"/></linearGradient></defs><g fill="none" stroke="url(#pearl)" stroke-width="1.65" opacity=".8">${paths.map(d => `<path d="${d}"/>`).join("")}</g><svg x="${symbolBox.left}" y="${symbolBox.top}" width="${symbolBox.width}" height="${symbolBox.height}" viewBox="394 1827 32 31">${flamePaths}</svg></svg>`;
  fs.writeFileSync(path.join(output, "likeu-pearl-pattern.svg"), svg + "\n");
  console.log(`Trama LikeU: ${paths.length} contornos, ${Buffer.byteLength(svg)} bytes, sin mapas de bits.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
