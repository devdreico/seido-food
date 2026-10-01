const fs = require("fs/promises");
const path = require("path");
const { minify } = require("terser");
const CleanCSS = require("clean-css");

const root = path.resolve(__dirname, "..");

const jsFiles = [
    "Js/store.js",
    "Js/catalogo.js",
    "Js/checkin.js",
    "Js/gracias.js",
    "Js/loader.js",
    "Js/pago-error.js",
    "Js/pasarela.js",
    "Js/ui-enhancements.js"
];

const cssFiles = ["Css/style.css"];

async function minifyJs(file) {
    const source = await fs.readFile(path.join(root, file), "utf8");
    const result = await minify(source, {
        compress: {
            passes: 2,
            drop_console: false
        },
        mangle: true,
        ecma: 2020,
        format: {
            comments: false
        }
    });

    const target = path.join(root, file.replace(/\.js$/, ".min.js"));
    await fs.writeFile(target, result.code || "", "utf8");
}

async function minifyCss(file) {
    const source = await fs.readFile(path.join(root, file), "utf8");
    const result = new CleanCSS({ level: 2, returnPromise: false }).minify(source);

    if (result.errors && result.errors.length > 0) {
        throw new Error(`CSS minify failed for ${file}: ${result.errors.join("; ")}`);
    }

    const target = path.join(root, file.replace(/\.css$/, ".min.css"));
    await fs.writeFile(target, result.styles || "", "utf8");
}

async function main() {
    await Promise.all(jsFiles.map(minifyJs));
    await Promise.all(cssFiles.map(minifyCss));
    console.log("Static assets minified.");
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
