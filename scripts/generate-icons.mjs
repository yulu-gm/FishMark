import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

import { Resvg } from "@resvg/resvg-js";

const PNG_SIZES = [16, 24, 32, 48, 64, 128, 256, 512];
const FILE_ICON_PNG_SIZES = [16, 24, 32, 48, 64, 128, 256, 512, 1024];
const ICO_SIZES = new Set([16, 24, 32, 48, 64, 128, 256]);
const MARK_SOURCE = "assets/branding/fishmark_mark.svg";
const FILE_ICON_SOURCE = "assets/branding/fishmark_file_icon.svg";
const FILE_ICON_OUTPUT_DIRECTORY = "file";
const FILE_ICON_BASENAME = "markdown";
const FISH_FILL_RADIUS = 245;
const ICNS_ENTRIES = [
  { size: 16, type: "icp4" },
  { size: 32, type: "icp5" },
  { size: 64, type: "icp6" },
  { size: 128, type: "ic07" },
  { size: 256, type: "ic08" },
  { size: 512, type: "ic09" },
  { size: 1024, type: "ic10" },
  { size: 32, type: "ic11" },
  { size: 64, type: "ic12" },
  { size: 256, type: "ic13" },
  { size: 512, type: "ic14" }
];
const VARIANTS = [
  {
    name: "light",
    color: "#111827",
    baseColor: "#ffffff"
  },
  {
    name: "dark",
    color: "#f8fafc",
    baseColor: "#111827"
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

function createIconSvg(svgSource, variant) {
  return svgSource
    .toString("utf8")
    .replace(
      /(<svg\b[^>]*>)/u,
      `$1\n  <circle cx="300" cy="300" r="${FISH_FILL_RADIUS}" fill="${variant.baseColor}" />`
    )
    .replaceAll("currentColor", variant.color);
}

async function generateVariant(variant, outputDirectory) {
  const sourcePath = path.join(process.cwd(), MARK_SOURCE);
  const variantOutputDirectory = path.join(outputDirectory, variant.name);
  const svgSource = createIconSvg(readFileSync(sourcePath), variant);
  const icoImages = [];

  mkdirSync(variantOutputDirectory, { recursive: true });

  for (const size of PNG_SIZES) {
    const outputPath = path.join(variantOutputDirectory, `icon-${size}.png`);
    const pngBuffer = renderPng(svgSource, size);

    writeFileSync(outputPath, pngBuffer);

    if (ICO_SIZES.has(size)) {
      icoImages.push({ size, buffer: pngBuffer });
    }
  }

  writeFileSync(path.join(variantOutputDirectory, "icon.ico"), createIcoBuffer(icoImages));
}

async function generateFileIcon(outputDirectory) {
  const sourcePath = path.join(process.cwd(), FILE_ICON_SOURCE);
  const fileIconOutputDirectory = path.join(outputDirectory, FILE_ICON_OUTPUT_DIRECTORY);
  const svgSource = readFileSync(sourcePath, "utf8");
  const icoImages = [];
  const renderedPngs = new Map();

  mkdirSync(fileIconOutputDirectory, { recursive: true });

  for (const size of FILE_ICON_PNG_SIZES) {
    const pngBuffer = renderPng(svgSource, size);

    writeFileSync(path.join(fileIconOutputDirectory, `icon-${size}.png`), pngBuffer);
    renderedPngs.set(size, pngBuffer);

    if (ICO_SIZES.has(size)) {
      icoImages.push({ size, buffer: pngBuffer });
    }
  }

  const icnsImages = ICNS_ENTRIES.map((entry) => {
    const buffer = renderedPngs.get(entry.size);

    if (!buffer) {
      throw new Error(`Missing ${entry.size}px PNG for ${entry.type} ICNS entry.`);
    }

    return {
      type: entry.type,
      buffer
    };
  });

  writeFileSync(
    path.join(fileIconOutputDirectory, `${FILE_ICON_BASENAME}.ico`),
    createIcoBuffer(icoImages)
  );
  writeFileSync(
    path.join(fileIconOutputDirectory, `${FILE_ICON_BASENAME}.icns`),
    createIcnsBuffer(icnsImages)
  );
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

function createIcnsBuffer(images) {
  const chunks = images.map((image) => {
    const header = Buffer.alloc(8);

    header.write(image.type, 0, "ascii");
    header.writeUInt32BE(image.buffer.length + header.length, 4);

    return Buffer.concat([header, image.buffer]);
  });
  const totalLength = 8 + chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const header = Buffer.alloc(8);

  header.write("icns", 0, "ascii");
  header.writeUInt32BE(totalLength, 4);

  return Buffer.concat([header, ...chunks]);
}

async function main() {
  const { outputDirectory } = parseArguments(process.argv.slice(2));
  const resolvedOutputDirectory = path.resolve(process.cwd(), outputDirectory);

  for (const variant of VARIANTS) {
    await generateVariant(variant, resolvedOutputDirectory);
  }

  await generateFileIcon(resolvedOutputDirectory);

  console.log(`Generated icon assets in ${resolvedOutputDirectory}`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
