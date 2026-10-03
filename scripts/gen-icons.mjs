// Генерация PNG-иконок приложения (180/192/512) без внешних зависимостей.
// Логотип: тёмный квадрат, буква «Н» (наряды), зелёный индикатор статуса.
// Запуск: node scripts/gen-icons.mjs

import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

function crc32(buf) {
  let table = 0
  const tables = []
  for (let n = 0; n < 256; n++) {
    table = n
    for (let k = 0; k < 8; k++) table = table & 1 ? 0xedb88320 ^ (table >>> 1) : table >>> 1
    tables[n] = table >>> 0
  }
  let crc = 0xffffffff
  for (const b of buf) crc = tables[(crc ^ b) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const t = Buffer.from(type, 'ascii')
  const c = Buffer.alloc(4)
  c.writeUInt32BE(crc32(Buffer.concat([t, data])))
  return Buffer.concat([len, t, data, c])
}

function makePng(size) {
  const px = Buffer.alloc(size * size * 4)
  const set = (x, y, [r, g, b]) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return
    const i = (y * size + x) * 4
    px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = 255
  }
  const rect = (x0, y0, x1, y1, col) => {
    for (let y = Math.round(y0 * size); y < Math.round(y1 * size); y++)
      for (let x = Math.round(x0 * size); x < Math.round(x1 * size); x++) set(x, y, col)
  }
  const circle = (cx, cy, r, col) => {
    const R = r * size, CX = cx * size, CY = cy * size
    for (let y = Math.floor(CY - R); y <= CY + R; y++)
      for (let x = Math.floor(CX - R); x <= CX + R; x++)
        if ((x - CX) ** 2 + (y - CY) ** 2 <= R * R) set(x, y, col)
  }

  rect(0, 0, 1, 1, [23, 23, 23])          // фон neutral-900
  const W = [255, 255, 255]
  rect(0.30, 0.20, 0.42, 0.80, W)          // левая вертикаль «Н»
  rect(0.58, 0.20, 0.70, 0.80, W)          // правая вертикаль
  rect(0.30, 0.44, 0.70, 0.56, W)          // перекладина
  circle(0.78, 0.78, 0.09, [34, 197, 94])  // зелёная точка «свободен»

  const stride = size * 4 + 1
  const raw = Buffer.alloc(stride * size)
  for (let y = 0; y < size; y++) {
    raw[y * stride] = 0 // фильтр: none
    px.copy(raw, y * stride + 1, y * size * 4, (y + 1) * size * 4)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8  // bit depth
  ihdr[9] = 6  // RGBA
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

mkdirSync(join(root, 'public'), { recursive: true })
for (const [name, size] of [
  ['apple-touch-icon.png', 180],
  ['icon-192.png', 192],
  ['icon-512.png', 512],
]) {
  const file = join(root, 'public', name)
  writeFileSync(file, makePng(size))
  console.log(`${name}: ${size}x${size} OK`)
}
