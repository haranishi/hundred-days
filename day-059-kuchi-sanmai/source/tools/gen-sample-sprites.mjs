// Original, procedural sample artwork. No downloaded art, fonts, or network requests.
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const output = fileURLToPath(new URL('../public/sample/', import.meta.url))
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage()
  await page.route('**/*', (route) => route.abort())
  for (const state of ['closed', 'small', 'open', 'blink']) {
    const encoded = await page.evaluate((face) => {
      const canvas = document.createElement('canvas')
      canvas.width = 512
      canvas.height = 640
      const ctx = canvas.getContext('2d')
      const ink = '#173d39'
      const mint = '#8ce6c3'
      const pale = '#e3f8ee'
      const coral = '#ffa894'
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      function shape(fill, draw, stroke = ink, width = 6) {
        ctx.beginPath()
        draw()
        ctx.fillStyle = fill
        ctx.fill()
        if (stroke) {
          ctx.strokeStyle = stroke
          ctx.lineWidth = width
          ctx.stroke()
        }
      }
      function round(x, y, w, h, r, fill, stroke = ink, line = 6) {
        shape(fill, () => ctx.roundRect(x, y, w, h, r), stroke, line)
      }
      function ellipse(x, y, rx, ry, fill, stroke = ink, line = 6) {
        shape(fill, () => ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2), stroke, line)
      }
      function line(points, color = ink, width = 6) {
        ctx.beginPath()
        ctx.moveTo(points[0][0], points[0][1])
        for (const [x, y] of points.slice(1)) ctx.lineTo(x, y)
        ctx.strokeStyle = color
        ctx.lineWidth = width
        ctx.stroke()
      }

      // Feet and arms, behind the body.
      round(181, 497, 58, 56, 22, pale)
      round(275, 497, 58, 56, 22, pale)
      round(160, 541, 91, 37, 18, mint)
      round(268, 541, 90, 37, 18, mint)
      shape(mint, () => {
        ctx.moveTo(178, 386)
        ctx.bezierCurveTo(135, 391, 125, 428, 118, 471)
        ctx.quadraticCurveTo(105, 496, 85, 479)
        ctx.bezierCurveTo(84, 418, 102, 371, 166, 355)
        ctx.closePath()
      })
      ellipse(108, 479, 27, 28, pale)
      line([[95, 474], [92, 482]], '#82b9a6', 4)
      shape(mint, () => {
        ctx.moveTo(341, 362)
        ctx.bezierCurveTo(374, 347, 395, 320, 391, 286)
        ctx.quadraticCurveTo(409, 269, 426, 288)
        ctx.bezierCurveTo(431, 347, 401, 388, 346, 401)
        ctx.closePath()
      })
      // Raised mitten.
      shape(pale, () => {
        ctx.moveTo(390, 299)
        ctx.lineTo(382, 278)
        ctx.quadraticCurveTo(378, 263, 390, 259)
        ctx.quadraticCurveTo(399, 257, 404, 275)
        ctx.lineTo(403, 244)
        ctx.quadraticCurveTo(406, 229, 417, 238)
        ctx.lineTo(422, 268)
        ctx.lineTo(429, 250)
        ctx.quadraticCurveTo(439, 239, 446, 252)
        ctx.lineTo(440, 288)
        ctx.quadraticCurveTo(432, 314, 406, 315)
        ctx.quadraticCurveTo(396, 313, 390, 299)
      })
      round(163, 347, 187, 167, 53, mint)
      round(184, 367, 145, 109, 36, pale, null)
      ellipse(256, 418, 26, 26, '#ffffff', '#6ccfa9', 4)
      line([[249, 404], [267, 419], [253, 434]], '#36a987', 6)
      ellipse(216, 492, 4, 4, ink, null)
      ellipse(235, 492, 4, 4, ink, null)
      ellipse(254, 492, 4, 4, ink, null)
      // Ears, antenna and head are identical across all four files.
      round(80, 194, 43, 84, 18, mint)
      round(389, 194, 43, 84, 18, mint)
      line([[256, 133], [256, 91]], ink, 10)
      ellipse(256, 72, 22, 22, coral)
      ellipse(249, 65, 6, 6, '#fff3ea', null)
      round(108, 125, 296, 225, 65, pale)
      round(127, 146, 258, 182, 51, mint, null)
      round(132, 151, 248, 169, 47, ink, null)
      // Reflected highlight on the display.
      shape('#27534c', () => {
        ctx.moveTo(160, 163)
        ctx.lineTo(250, 163)
        ctx.lineTo(178, 230)
        ctx.lineTo(144, 230)
        ctx.lineTo(144, 197)
        ctx.quadraticCurveTo(144, 175, 160, 163)
      }, null)
      if (face === 'blink') {
        ctx.strokeStyle = pale
        ctx.lineWidth = 10
        for (const x of [205, 307]) {
          ctx.beginPath()
          ctx.moveTo(x - 14, 221)
          ctx.quadraticCurveTo(x, 232, x + 14, 221)
          ctx.stroke()
        }
      } else {
        ellipse(205, 219, 14, 23, pale, null)
        ellipse(307, 219, 14, 23, pale, null)
        ellipse(201, 211, 4, 6, '#ffffff', null)
        ellipse(303, 211, 4, 6, '#ffffff', null)
      }
      ellipse(168, 256, 15, 7, '#6ca08d', null)
      ellipse(344, 256, 15, 7, '#6ca08d', null)
      if (face === 'open') {
        ellipse(256, 276, 25, 28, '#0b2320', pale, 4)
        shape(coral, () => {
          ctx.ellipse(256, 291, 18, 10, 0, Math.PI, Math.PI * 2)
          ctx.quadraticCurveTo(256, 308, 238, 291)
        }, null)
      } else if (face === 'small') {
        ellipse(256, 275, 13, 12, '#0b2320', pale, 4)
      } else {
        ctx.beginPath()
        ctx.moveTo(236, 270)
        ctx.quadraticCurveTo(256, 288, 276, 270)
        ctx.lineWidth = 5
        ctx.strokeStyle = pale
        ctx.stroke()
      }
      return canvas.toDataURL('image/png').split(',')[1]
    }, state)
    const name = state === 'blink' ? 'blink.png' : `mouth-${state}.png`
    await writeFile(`${output}/${name}`, Buffer.from(encoded, 'base64'))
    console.log(`Generated ${name} (512 × 640)`)
  }
} finally {
  await browser.close()
}
