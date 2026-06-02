#!/usr/bin/env node
import { gzipSync } from "node:zlib";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_TOP_GROUP_LIMIT = 20;

function parseArguments(argv) {
  const options = {
    budget: {
      forbiddenInitialSourceGroups: [],
      maxEditorBytes: null,
      maxEditorGzipBytes: null,
      maxInitialChunkBytes: null,
      maxInitialChunkGzipBytes: null,
      maxInitialGzipBytes: null,
      maxTotalGzipBytes: null,
      requiredLazyChunkPatterns: []
    },
    distDir: "dist",
    json: false,
    topGroupLimit: DEFAULT_TOP_GROUP_LIMIT
  };

  for (let index = 0; index < argv.length; index += 1) {
    const entry = argv[index];

    if (entry === "--json") {
      options.json = true;
      continue;
    }

    if (entry === "--dist") {
      const nextValue = argv[index + 1];
      if (!nextValue) {
        throw new Error("--dist requires a directory path.");
      }
      options.distDir = nextValue;
      index += 1;
      continue;
    }

    if (entry === "--top") {
      const nextValue = Number(argv[index + 1]);
      if (!Number.isInteger(nextValue) || nextValue < 1) {
        throw new Error("--top requires a positive integer.");
      }
      options.topGroupLimit = nextValue;
      index += 1;
      continue;
    }

    if (entry === "--max-editor-bytes") {
      options.budget.maxEditorBytes = parsePositiveIntegerArgument(argv, index, entry);
      index += 1;
      continue;
    }

    if (entry === "--max-editor-gzip-bytes") {
      options.budget.maxEditorGzipBytes = parsePositiveIntegerArgument(argv, index, entry);
      index += 1;
      continue;
    }

    if (entry === "--max-initial-chunk-bytes") {
      options.budget.maxInitialChunkBytes = parsePositiveIntegerArgument(argv, index, entry);
      index += 1;
      continue;
    }

    if (entry === "--max-initial-chunk-gzip-bytes") {
      options.budget.maxInitialChunkGzipBytes = parsePositiveIntegerArgument(argv, index, entry);
      index += 1;
      continue;
    }

    if (entry === "--max-initial-gzip-bytes") {
      options.budget.maxInitialGzipBytes = parsePositiveIntegerArgument(argv, index, entry);
      index += 1;
      continue;
    }

    if (entry === "--max-total-gzip-bytes") {
      options.budget.maxTotalGzipBytes = parsePositiveIntegerArgument(argv, index, entry);
      index += 1;
      continue;
    }

    if (entry === "--require-lazy-chunk") {
      const nextValue = argv[index + 1];
      if (!nextValue) {
        throw new Error("--require-lazy-chunk requires a chunk name pattern.");
      }
      options.budget.requiredLazyChunkPatterns.push(nextValue);
      index += 1;
      continue;
    }

    if (entry === "--forbid-initial-source-group") {
      const nextValue = argv[index + 1];
      if (!nextValue) {
        throw new Error("--forbid-initial-source-group requires a source group name.");
      }
      options.budget.forbiddenInitialSourceGroups.push(nextValue);
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${entry}`);
  }

  return options;
}

function parsePositiveIntegerArgument(argv, index, name) {
  const nextValue = Number(argv[index + 1]);
  if (!Number.isInteger(nextValue) || nextValue < 1) {
    throw new Error(`${name} requires a positive integer.`);
  }

  return nextValue;
}

function readRendererBundleReport(input) {
  const assetsDir = path.join(input.distDir, "assets");

  if (!existsSync(assetsDir)) {
    throw new Error(`Renderer assets directory not found: ${assetsDir}`);
  }

  const indexHtmlPath = path.join(input.distDir, "index.html");
  const htmlInitialChunkNames = existsSync(indexHtmlPath)
    ? readHtmlInitialChunkNames(readFileSync(indexHtmlPath, "utf8"))
    : [];
  const chunks = readdirSync(assetsDir)
    .filter((fileName) => fileName.endsWith(".js"))
    .map((fileName) => readChunk(path.join(assetsDir, fileName), fileName))
    .sort((left, right) => right.bytes - left.bytes);
  const chunkByName = new Map(chunks.map((chunk) => [chunk.name, chunk]));
  const topSourceGroups = readTopSourceGroups(assetsDir, input.topGroupLimit);
  const editorChunk = chunks.find((chunk) => chunk.role === "editor") ?? chunks[0] ?? null;
  const initialChunkNames = resolveStaticChunkClosure(
    chunkByName,
    [...htmlInitialChunkNames, editorChunk?.name].filter(Boolean)
  );
  for (const chunk of chunks) {
    chunk.isInitial = initialChunkNames.has(chunk.name);
  }
  const initialChunks = chunks.filter((chunk) => initialChunkNames.has(chunk.name));
  const reactChunks = chunks.filter((chunk) => chunk.role === "react-entry" || chunk.role === "react-runtime");
  const lazyChunks = chunks.filter((chunk) => !initialChunkNames.has(chunk.name));

  return {
    chunks,
    editorChunk,
    htmlInitialChunks: chunks.filter((chunk) => htmlInitialChunkNames.includes(chunk.name)),
    initialChunks,
    lazyChunks,
    reactChunks,
    topSourceGroups,
    totalInitialGzipBytes: sum(initialChunks.map((chunk) => chunk.gzipBytes)),
    totalJsBytes: sum(chunks.map((chunk) => chunk.bytes)),
    totalJsGzipBytes: sum(chunks.map((chunk) => chunk.gzipBytes))
  };
}

function readChunk(filePath, fileName) {
  const source = readFileSync(filePath);
  const sourceText = source.toString("utf8");

  return {
    bytes: statSync(filePath).size,
    gzipBytes: gzipSync(source).length,
    staticImports: readStaticChunkImports(sourceText),
    name: fileName,
    role: classifyChunk(fileName),
    sourceGroups: readChunkSourceGroups(`${filePath}.map`)
  };
}

function classifyChunk(fileName) {
  if (/^App-[\w-]+\.js$/u.test(fileName)) {
    return "editor";
  }

  if (/^index-[\w-]+\.js$/u.test(fileName)) {
    return "react-entry";
  }

  if (/^jsx-runtime-[\w-]+\.js$/u.test(fileName)) {
    return "react-runtime";
  }

  if (/^settings-view/u.test(fileName)) {
    return "settings";
  }

  if (/^preferences-/u.test(fileName)) {
    return "shared-preferences";
  }

  return "lazy";
}

function readHtmlInitialChunkNames(html) {
  const chunks = new Set();

  for (const match of html.matchAll(/(?:src|href)="\.\/assets\/([^"]+\.js)"/gu)) {
    if (match[1]) {
      chunks.add(match[1]);
    }
  }

  return Array.from(chunks);
}

function readStaticChunkImports(sourceText) {
  const imports = new Set();
  const fromImportPattern = /\b(?:import|export)(?!\s*\()[^;]*?\bfrom\s*["']\.\/([^"']+\.js)["']/gu;
  const sideEffectImportPattern = /\bimport\s*["']\.\/([^"']+\.js)["']/gu;

  for (const match of sourceText.matchAll(fromImportPattern)) {
    if (match[1]) {
      imports.add(match[1]);
    }
  }

  for (const match of sourceText.matchAll(sideEffectImportPattern)) {
    if (match[1]) {
      imports.add(match[1]);
    }
  }

  return Array.from(imports);
}

function resolveStaticChunkClosure(chunkByName, roots) {
  const visited = new Set();
  const pending = roots.filter(Boolean);

  while (pending.length > 0) {
    const name = pending.pop();

    if (!name || visited.has(name)) {
      continue;
    }

    const chunk = chunkByName.get(name);
    if (!chunk) {
      continue;
    }

    visited.add(name);
    pending.push(...chunk.staticImports);
  }

  return visited;
}

function readChunkSourceGroups(mapPath) {
  if (!existsSync(mapPath)) {
    return [];
  }

  const map = JSON.parse(readFileSync(mapPath, "utf8"));
  return readSourceGroupsFromMap(map);
}

function readTopSourceGroups(assetsDir, limit) {
  const sourceGroupBytes = new Map();

  for (const fileName of readdirSync(assetsDir)) {
    if (!fileName.endsWith(".js.map")) {
      continue;
    }

    for (const group of readSourceGroupsFromMap(JSON.parse(readFileSync(path.join(assetsDir, fileName), "utf8")))) {
      sourceGroupBytes.set(group.group, (sourceGroupBytes.get(group.group) ?? 0) + group.bytes);
    }
  }

  return Array.from(sourceGroupBytes.entries())
    .map(([group, bytes]) => ({ bytes, group }))
    .sort((left, right) => right.bytes - left.bytes || left.group.localeCompare(right.group))
    .slice(0, limit);
}

function readSourceGroupsFromMap(map) {
  const sourceGroupBytes = new Map();
  const sources = Array.isArray(map.sources) ? map.sources : [];
  const sourcesContent = Array.isArray(map.sourcesContent) ? map.sourcesContent : [];

  sources.forEach((source, index) => {
    const content = typeof sourcesContent[index] === "string" ? sourcesContent[index] : "";
    const group = resolveSourceGroup(source);
    sourceGroupBytes.set(group, (sourceGroupBytes.get(group) ?? 0) + Buffer.byteLength(content));
  });

  return Array.from(sourceGroupBytes.entries())
    .map(([group, bytes]) => ({ bytes, group }))
    .sort((left, right) => right.bytes - left.bytes || left.group.localeCompare(right.group));
}

function resolveSourceGroup(source) {
  const nodeModulesMarker = "node_modules/";
  const nodeModulesIndex = source.lastIndexOf(nodeModulesMarker);

  if (nodeModulesIndex >= 0) {
    const packagePath = source.slice(nodeModulesIndex + nodeModulesMarker.length);
    const [firstSegment, secondSegment] = packagePath.split("/");

    if (firstSegment?.startsWith("@") && secondSegment) {
      return `${firstSegment}/${secondSegment}`;
    }

    return firstSegment ?? "node_modules";
  }

  const packagesMarker = "packages/";
  const packagesIndex = source.indexOf(packagesMarker);

  if (packagesIndex >= 0) {
    return source.slice(packagesIndex + packagesMarker.length).split("/")[0] ?? "packages";
  }

  if (source.includes("src/renderer/")) {
    return "src/renderer";
  }

  if (source.includes("src/shared/")) {
    return "src/shared";
  }

  if (source.includes("src/main/")) {
    return "src/main";
  }

  return "other";
}

function formatReport(report) {
  const lines = [
    "FishMark renderer bundle report",
    `totalJsBytes=${report.totalJsBytes}`,
    `totalJsGzipBytes=${report.totalJsGzipBytes}`,
    `totalInitialGzipBytes=${report.totalInitialGzipBytes}`,
    `editorChunk=${formatChunk(report.editorChunk)}`,
    `htmlInitialChunks=${report.htmlInitialChunks.map(formatChunk).join(", ") || "none"}`,
    `initialChunks=${report.initialChunks.map(formatChunk).join(", ") || "none"}`,
    `reactChunks=${report.reactChunks.map(formatChunk).join(", ") || "none"}`,
    `lazyChunks=${report.lazyChunks.map(formatChunk).join(", ") || "none"}`,
    "chunks:",
    ...report.chunks.map((chunk) => `  - ${formatChunk(chunk)} role=${chunk.role} initial=${chunk.isInitial ? "true" : "false"}`)
  ];

  if (report.topSourceGroups.length > 0) {
    lines.push("topSourceGroups:");
    lines.push(...report.topSourceGroups.map((group) => `  - ${group.group}: ${group.bytes}`));
  } else {
    lines.push("topSourceGroups: none (run a sourcemap build to enable source grouping)");
  }

  return lines.join("\n");
}

function evaluateBundleBudget(report, budgetOptions) {
  const checks = [];

  addMaxCheck(checks, "editorChunkBytes", report.editorChunk?.bytes ?? 0, budgetOptions.maxEditorBytes);
  addMaxCheck(
    checks,
    "editorChunkGzipBytes",
    report.editorChunk?.gzipBytes ?? 0,
    budgetOptions.maxEditorGzipBytes
  );
  addMaxCheck(
    checks,
    "maxInitialChunkBytes",
    Math.max(0, ...report.initialChunks.map((chunk) => chunk.bytes)),
    budgetOptions.maxInitialChunkBytes
  );
  addMaxCheck(
    checks,
    "maxInitialChunkGzipBytes",
    Math.max(0, ...report.initialChunks.map((chunk) => chunk.gzipBytes)),
    budgetOptions.maxInitialChunkGzipBytes
  );
  addMaxCheck(
    checks,
    "totalInitialGzipBytes",
    report.totalInitialGzipBytes,
    budgetOptions.maxInitialGzipBytes
  );
  addMaxCheck(
    checks,
    "totalJsGzipBytes",
    report.totalJsGzipBytes,
    budgetOptions.maxTotalGzipBytes
  );

  for (const pattern of budgetOptions.requiredLazyChunkPatterns) {
    const matcher = new RegExp(pattern, "u");
    const actual = report.lazyChunks.some((chunk) => matcher.test(chunk.name)) ? 1 : 0;
    checks.push({
      actual,
      limit: 1,
      name: `requiredLazyChunk:${pattern}`,
      status: actual === 1 ? "PASS" : "FAIL"
    });
  }

  for (const group of budgetOptions.forbiddenInitialSourceGroups) {
    const hasSourceMaps = report.initialChunks.some((chunk) => chunk.sourceGroups.length > 0);
    const matchingChunks = report.initialChunks
      .filter((chunk) => chunk.sourceGroups.some((sourceGroup) => sourceGroup.group === group))
      .map((chunk) => chunk.name);
    const failed = !hasSourceMaps || matchingChunks.length > 0;

    checks.push({
      actual: matchingChunks.join(", ") || (hasSourceMaps ? "none" : "missing sourcemaps"),
      limit: "none",
      name: `forbiddenInitialSourceGroup:${group}`,
      status: failed ? "FAIL" : "PASS"
    });
  }

  if (checks.length === 0) {
    return null;
  }

  return {
    checks,
    status: checks.every((check) => check.status === "PASS") ? "PASS" : "FAIL"
  };
}

function addMaxCheck(checks, name, actual, limit) {
  if (limit === null) {
    return;
  }

  checks.push({
    actual,
    limit,
    name,
    status: actual <= limit ? "PASS" : "FAIL"
  });
}

function formatBudget(budget) {
  if (!budget) {
    return "bundleBudget=not configured";
  }

  return [
    `bundleBudget=${budget.status}`,
    "budget:",
    ...budget.checks.map((check) =>
      `  - ${check.name} actual=${check.actual} limit=${check.limit} status=${check.status}`
    )
  ].join("\n");
}

function formatChunk(chunk) {
  if (!chunk) {
    return "none";
  }

  return `${chunk.name} bytes=${chunk.bytes} gzipBytes=${chunk.gzipBytes}`;
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

function main() {
  const options = parseArguments(process.argv.slice(2));
  const report = readRendererBundleReport({
    distDir: path.resolve(process.cwd(), options.distDir),
    topGroupLimit: options.topGroupLimit
  });
  const budget = evaluateBundleBudget(report, options.budget);
  const output = {
    ...report,
    budget
  };

  if (options.json) {
    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
    if (budget?.status === "FAIL") {
      process.exitCode = 1;
    }
    return;
  }

  process.stdout.write(`${formatReport(report)}\n${formatBudget(budget)}\n`);
  if (budget?.status === "FAIL") {
    process.exitCode = 1;
  }
}

const entryPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
const currentPath = fileURLToPath(import.meta.url);

if (entryPath === currentPath) {
  try {
    main();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}
