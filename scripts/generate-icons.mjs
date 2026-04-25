import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

import { Resvg } from "@resvg/resvg-js";
import { PNG } from "pngjs";

const PNG_SIZES = [32, 64, 128, 256, 512];
const SOURCE_PNG_SIZE = Math.max(...PNG_SIZES);
const ICO_SIZES = new Set([32, 64, 128, 256]);
const VARIANTS = [
  {
    name: "light",
    source: "assets/branding/fishmark_logo_light.svg"
  },
  {
    name: "dark",
    source: "assets/branding/fishmark_logo_dark.svg"
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

function resizePng(sourcePng, size) {
  if (sourcePng.width === size && sourcePng.height === size) {
    return PNG.sync.write(sourcePng);
  }

  const targetPng = new PNG({ width: size, height: size });

  for (let targetY = 0; targetY < size; targetY += 1) {
    const sourceY = Math.min(
      sourcePng.height - 1,
      Math.floor((targetY * sourcePng.height) / size)
    );

    for (let targetX = 0; targetX < size; targetX += 1) {
      const sourceX = Math.min(
        sourcePng.width - 1,
        Math.floor((targetX * sourcePng.width) / size)
      );
      const sourceOffset = (sourceY * sourcePng.width + sourceX) * 4;
      const targetOffset = (targetY * size + targetX) * 4;

      targetPng.data[targetOffset] = sourcePng.data[sourceOffset];
      targetPng.data[targetOffset + 1] = sourcePng.data[sourceOffset + 1];
      targetPng.data[targetOffset + 2] = sourcePng.data[sourceOffset + 2];
      targetPng.data[targetOffset + 3] = sourcePng.data[sourceOffset + 3];
    }
  }

  return PNG.sync.write(targetPng);
}

async function generateVariant(variant, outputDirectory) {
  const sourcePath = path.join(process.cwd(), variant.source);
  const variantOutputDirectory = path.join(outputDirectory, variant.name);
  const svgSource = readFileSync(sourcePath);
  const sourcePng = PNG.sync.read(renderPng(svgSource, SOURCE_PNG_SIZE));
  const icoImages = [];

  mkdirSync(variantOutputDirectory, { recursive: true });

  for (const size of PNG_SIZES) {
    const outputPath = path.join(variantOutputDirectory, `icon-${size}.png`);
    const pngBuffer = resizePng(sourcePng, size);

    writeFileSync(outputPath, pngBuffer);

    if (ICO_SIZES.has(size)) {
      icoImages.push({ size, buffer: pngBuffer });
    }
  }

  writeFileSync(path.join(variantOutputDirectory, "icon.ico"), createIcoBuffer(icoImages));
}

function createIcoBuffer(images) {
  const headerSize = 6;
  const directoryEntrySize = 16;
  const header = Buffer.alloc(headerSize);
  const directoryEntries = [];
  const imageBuffers = images.map((image) => image.buffer);
  let imageOffset = headerSize + directoryEntrySize * images.length;

  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);

  for (const image of images) {
    const directoryEntry = Buffer.alloc(directoryEntrySize);

    directoryEntry.writeUInt8(image.size >= 256 ? 0 : image.size, 0);
    directoryEntry.writeUInt8(image.size >= 256 ? 0 : image.size, 1);
    directoryEntry.writeUInt8(0, 2);
    directoryEntry.writeUInt8(0, 3);
    directoryEntry.writeUInt16LE(1, 4);
    directoryEntry.writeUInt16LE(32, 6);
    directoryEntry.writeUInt32LE(image.buffer.length, 8);
    directoryEntry.writeUInt32LE(imageOffset, 12);

    directoryEntries.push(directoryEntry);
    imageOffset += image.buffer.length;
  }

  return Buffer.concat([header, ...directoryEntries, ...imageBuffers]);
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
