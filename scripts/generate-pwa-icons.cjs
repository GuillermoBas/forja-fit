const fs = require("fs")
const path = require("path")
const sharp = require("sharp")

const rootDir = path.resolve(__dirname, "..")
const publicDir = path.join(rootDir, "public")
const iconsDir = path.join(publicDir, "icons")
const sourceLogo = path.join(publicDir, "trainium-icon.png")

if (!fs.existsSync(sourceLogo)) {
  throw new Error("No source icon found in public/trainium-icon.png")
}

fs.mkdirSync(iconsDir, { recursive: true })

async function generateIcon(fileName, size, padding = 0) {
  const innerSize = size - padding * 2
  const image = await sharp(sourceLogo)
    .resize(innerSize, innerSize, {
      fit: "contain",
      background: { r: 248, g: 250, b: 252, alpha: 0 }
    })
    .png()
    .toBuffer()

  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 244, g: 246, b: 248, alpha: 1 }
    }
  })
    .composite([{ input: image, gravity: "center" }])
    .png()
    .toFile(path.join(iconsDir, fileName))
}

async function main() {
  await generateIcon("icon-192.png", 192, 0)
  await generateIcon("icon-512.png", 512, 0)
  await generateIcon("maskable-icon-512.png", 512, 72)
  await generateIcon("apple-touch-icon.png", 180, 0)
  await generateIcon("badge-96.png", 96, 8)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
