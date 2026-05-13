// Run once: node scripts/generate-icons.mjs
// Requires: npm install canvas --save-dev

import { createCanvas } from 'canvas'
import { writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const outDir = join(__dirname, '../public/icons')
mkdirSync(outDir, { recursive: true })

function drawIcon(size) {
  const canvas = createCanvas(size, size)
  const ctx = canvas.getContext('2d')
  const r = size * 0.18

  // rounded background
  ctx.fillStyle = '#09090b'
  ctx.beginPath()
  ctx.moveTo(r, 0)
  ctx.lineTo(size - r, 0)
  ctx.quadraticCurveTo(size, 0, size, r)
  ctx.lineTo(size, size - r)
  ctx.quadraticCurveTo(size, size, size - r, size)
  ctx.lineTo(r, size)
  ctx.quadraticCurveTo(0, size, 0, size - r)
  ctx.lineTo(0, r)
  ctx.quadraticCurveTo(0, 0, r, 0)
  ctx.fill()

  // book
  const bx = size * 0.28, by = size * 0.18
  const bw = size * 0.44, bh = size * 0.62
  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  ctx.roundRect(bx, by, bw, bh, size * 0.04)
  ctx.fill()

  // spine
  ctx.fillStyle = '#d4d4d8'
  ctx.fillRect(bx, by, size * 0.045, bh)

  // lines
  ctx.fillStyle = '#71717a';
  [0.37, 0.46, 0.55, 0.64].forEach((y) => {
    ctx.beginPath()
    ctx.roundRect(bx + size * 0.1, size * y, bw * 0.62, size * 0.024, 2)
    ctx.fill()
  })

  return canvas.toBuffer('image/png')
}

writeFileSync(join(outDir, 'icon-192.png'), drawIcon(192))
writeFileSync(join(outDir, 'icon-512.png'), drawIcon(512))
console.log('✅ Icons written to public/icons/')
