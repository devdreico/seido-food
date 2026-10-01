const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const root = path.resolve(__dirname, "..");
const logoDir = path.join(root, "Assets", "Img", "logo");

const sourceSets = [
    {
        source: path.join(logoDir, "logo-fondo-transparente.png"),
        baseName: "logo-fondo-transparente"
    },
    {
        source: path.join(logoDir, "logo-fondo-blanco.png"),
        baseName: "logo-fondo-blanco"
    }
];

const variantsBySize = [
    { width: 320, avif: { quality: 56, effort: 7 }, webp: { quality: 76, effort: 6 }, png: { compressionLevel: 9, quality: 90 } },
    { width: 640, avif: { quality: 60, effort: 7 }, webp: { quality: 78, effort: 6 }, png: { compressionLevel: 9, quality: 90 } }
];

async function buildVariant(input, target, format, width, options) {
    let pipeline = sharp(input).resize({ width });

    if (format === "avif") {
        pipeline = pipeline.avif(options);
    } else if (format === "webp") {
        pipeline = pipeline.webp(options);
    } else {
        pipeline = pipeline.png(options);
    }

    await pipeline.toFile(target);
}

async function main() {
    for (const set of sourceSets) {
        if (!fs.existsSync(set.source)) {
            throw new Error(`Source logo not found: ${set.source}`);
        }
    }

    for (const set of sourceSets) {
        for (const item of variantsBySize) {
            await buildVariant(
                set.source,
                path.join(logoDir, `${set.baseName}-${item.width}.avif`),
                "avif",
                item.width,
                item.avif
            );
            await buildVariant(
                set.source,
                path.join(logoDir, `${set.baseName}-${item.width}.webp`),
                "webp",
                item.width,
                item.webp
            );
            await buildVariant(
                set.source,
                path.join(logoDir, `${set.baseName}-${item.width}.png`),
                "png",
                item.width,
                item.png
            );
        }
    }

    const basePng = path.join(logoDir, "logo-fondo-transparente-320.png");

    // Favicon and touch icons are generated from optimized source to avoid oversized icons.
    await sharp(basePng).resize(32, 32, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png({ compressionLevel: 9 }).toFile(path.join(logoDir, "favicon-32.png"));
    await sharp(basePng).resize(16, 16, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png({ compressionLevel: 9 }).toFile(path.join(logoDir, "favicon-16.png"));
    await sharp(basePng).resize(180, 180, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 1 } }).png({ compressionLevel: 9 }).toFile(path.join(logoDir, "apple-touch-icon.png"));

    console.log("Optimized assets generated successfully.");
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
