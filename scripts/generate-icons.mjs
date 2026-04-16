import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

import { Resvg } from "@resvg/resvg-js";
import pngToIco from "png-to-ico";

const PNG_SIZES = [32, 64, 128, 256, 512];
const ICO_SIZES = new Set([32, 64, 128, 256]);
const VARIANTS = [
  {
    name: "light",
    source: "assets/branding/yulora_logo_light.svg"
  },
  {
    name: "dark",
    source: "assets/branding/yulora_logo_dark.svg"
  }
];

function parseArguments(argv) {
  let outputDirectory = "build/icons";

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === "--out-dir") {
      const value = argv[index + 1];

      if (!value) {
        throw new Error("Missing value for --out-dir.");
      }

      outputDirectory = value;
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${argument}`);
  }

  return { outputDirectory };
}

function renderPng(svgSource, size) {
  const renderer = new Resvg(svgSource, {
    fitTo: {
      mode: "width",
      value: size
    }
  });

  return renderer.render().asPng();
}

async function generateVariant(variant, outputDirectory) {
  const sourcePath = path.join(process.cwd(), variant.source);
  const variantOutputDirectory = path.join(outputDirectory, variant.name);
  const svgSource = readFileSync(sourcePath);
  const icoInputPaths = [];

  mkdirSync(variantOutputDirectory, { recursive: true });

  for (const size of PNG_SIZES) {
    const outputPath = path.join(variantOutputDirectory, `icon-${size}.png`);
    const pngBuffer = renderPng(svgSource, size);

    writeFileSync(outputPath, pngBuffer);

    if (ICO_SIZES.has(size)) {
      icoInputPaths.push(outputPath);
    }
  }

  const icoBuffer = await pngToIco(icoInputPaths);
  writeFileSync(path.join(variantOutputDirectory, "icon.ico"), icoBuffer);
}

async function main() {
  const { outputDirectory } = parseArguments(process.argv.slice(2));
  const resolvedOutputDirectory = path.resolve(process.cwd(), outputDirectory);

  for (const variant of VARIANTS) {
    await generateVariant(variant, resolvedOutputDirectory);
  }

  console.log(`Generated icon assets in ${resolvedOutputDirectory}`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
