#!/usr/bin/env node
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { readBundleProvenanceEvidence } from "./bundle-provenance-evidence.mjs";

const DEFAULT_TOP_GROUP_LIMIT = 20;
const REPORT_SCHEMA_VERSION = 1;
const BUNDLE_EVIDENCE_SCOPE = "emitted-renderer-output";
const SOURCE_GRAPH_AUTHORITY = "editor-foundation-architecture-guard";
const SOURCE_GROUP_AUTHORITY = "bundle-provenance-module-ids";
const BASE64_VLQ_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const CONTRACT_SCHEMA_VERSION = 1;
const MAXIMUM_CHECK_BY_METRIC = new Map([
  ["editorChunkBytes", { id: "bundle.max-editor-bytes", optionName: "maxEditorBytes" }],
  ["editorChunkGzipBytes", { id: "bundle.max-editor-gzip-bytes", optionName: "maxEditorGzipBytes" }],
  ["maxInitialChunkBytes", { id: "bundle.max-initial-chunk-bytes", optionName: "maxInitialChunkBytes" }],
  [
    "maxInitialChunkGzipBytes",
    { id: "bundle.max-initial-chunk-gzip-bytes", optionName: "maxInitialChunkGzipBytes" }
  ],
  ["totalInitialGzipBytes", { id: "bundle.max-initial-gzip-bytes", optionName: "maxInitialGzipBytes" }],
  ["totalJsGzipBytes", { id: "bundle.max-total-gzip-bytes", optionName: "maxTotalGzipBytes" }]
]);
const AD_HOC_POLICY_FLAGS = new Set([
  "--forbid-initial-source-group",
  "--max-editor-bytes",
  "--max-editor-gzip-bytes",
  "--max-initial-chunk-bytes",
  "--max-initial-chunk-gzip-bytes",
  "--max-initial-gzip-bytes",
  "--max-total-gzip-bytes",
  "--require-lazy-chunk"
]);

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
    contractPath: null,
    distDir: "dist",
    json: false,
    policyArgumentCount: 0,
    topGroupLimit: DEFAULT_TOP_GROUP_LIMIT
  };

  for (let index = 0; index < argv.length; index += 1) {
    const entry = argv[index];
    if (AD_HOC_POLICY_FLAGS.has(entry)) {
      options.policyArgumentCount += 1;
    }

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

    if (entry === "--contract") {
      const nextValue = argv[index + 1];
      if (!nextValue) {
        throw new Error("--contract requires a manifest path.");
      }
      if (options.contractPath !== null) {
        throw new Error("--contract may be declared only once.");
      }
      options.contractPath = nextValue;
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

  options.budget.forbiddenInitialSourceGroups = sortUnique(
    options.budget.forbiddenInitialSourceGroups
  );
  options.budget.requiredLazyChunkPatterns = sortUnique(
    options.budget.requiredLazyChunkPatterns
  );
  if (options.contractPath !== null && options.policyArgumentCount > 0) {
    throw new Error("--contract cannot be combined with ad-hoc bundle policy flags.");
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

function readBundleContract(contractPath) {
  const absolutePath = path.resolve(process.cwd(), contractPath);
  let source;
  let manifest;
  try {
    source = readFileSync(absolutePath, "utf8");
    manifest = JSON.parse(source);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid bundle contract: cannot read ${displayContractPath(absolutePath)}: ${message}`);
  }
  if (!isRecord(manifest) || manifest.schemaVersion !== CONTRACT_SCHEMA_VERSION) {
    throw new Error(
      `Invalid bundle contract: architecture schemaVersion must be ${CONTRACT_SCHEMA_VERSION}.`
    );
  }
  const policy = manifest.bundlePolicy;
  if (!isRecord(policy)) {
    throw new Error("Invalid bundle contract: bundlePolicy must be an object.");
  }
  assertOnlyFields(policy, new Set(["checks", "schemaVersion"]), "bundlePolicy");
  if (policy.schemaVersion !== CONTRACT_SCHEMA_VERSION) {
    throw new Error(
      `Invalid bundle contract: bundlePolicy schemaVersion must be ${CONTRACT_SCHEMA_VERSION}.`
    );
  }
  if (!Array.isArray(policy.checks) || policy.checks.length === 0) {
    throw new Error("Invalid bundle contract: bundlePolicy checks must be a non-empty array.");
  }

  const budget = {
    forbiddenInitialSourceGroups: [],
    maxEditorBytes: null,
    maxEditorGzipBytes: null,
    maxInitialChunkBytes: null,
    maxInitialChunkGzipBytes: null,
    maxInitialGzipBytes: null,
    maxTotalGzipBytes: null,
    requiredLazyChunkPatterns: []
  };
  const checkIds = new Set();
  const semanticTargets = new Set();
  for (const [index, check] of policy.checks.entries()) {
    if (!isRecord(check)) {
      throw new Error(`Invalid bundle contract: check at index ${index} must be an object.`);
    }
    const id = readNonEmptyString(check.id);
    const kind = readNonEmptyString(check.kind);
    if (!id || !kind) {
      throw new Error(`Invalid bundle contract: check at index ${index} requires id and kind.`);
    }
    if (checkIds.has(id)) {
      throw new Error(`Invalid bundle contract: duplicate check id ${id}.`);
    }
    checkIds.add(id);

    let canonicalId;
    let semanticTarget;
    if (kind === "maximum") {
      assertOnlyFields(check, new Set(["id", "kind", "limit", "metric"]), `check ${id}`);
      const metric = readNonEmptyString(check.metric);
      const maximumCheck = metric ? MAXIMUM_CHECK_BY_METRIC.get(metric) : undefined;
      if (!metric || !maximumCheck || !Number.isInteger(check.limit) || check.limit < 1) {
        throw new Error(
          `Invalid bundle contract: maximum check ${id} requires a supported metric and positive integer limit.`
        );
      }
      canonicalId = maximumCheck.id;
      semanticTarget = `${kind}|${metric}`;
      budget[maximumCheck.optionName] = check.limit;
    } else if (kind === "required-lazy-chunk") {
      assertOnlyFields(check, new Set(["id", "kind", "pattern"]), `check ${id}`);
      const pattern = readStableContractTarget(check.pattern);
      if (!pattern) {
        throw new Error(`Invalid bundle contract: required lazy chunk check ${id} has an invalid pattern.`);
      }
      try {
        void new RegExp(pattern, "u");
      } catch {
        throw new Error(`Invalid bundle contract: required lazy chunk check ${id} has an invalid pattern.`);
      }
      canonicalId = `bundle.required-lazy-chunk:${pattern}`;
      semanticTarget = `${kind}|${pattern}`;
      budget.requiredLazyChunkPatterns.push(pattern);
    } else if (kind === "forbidden-initial-source-group") {
      assertOnlyFields(check, new Set(["group", "id", "kind"]), `check ${id}`);
      const group = readStableContractTarget(check.group);
      if (!group) {
        throw new Error(`Invalid bundle contract: forbidden source group check ${id} has an invalid group.`);
      }
      canonicalId = `bundle.forbidden-initial-source-group:${group}`;
      semanticTarget = `${kind}|${group}`;
      budget.forbiddenInitialSourceGroups.push(group);
    } else {
      throw new Error(`Invalid bundle contract: check ${id} has unknown kind ${kind}.`);
    }
    if (id !== canonicalId) {
      throw new Error(`Invalid bundle contract: check ${id} must use canonical id ${canonicalId}.`);
    }
    if (semanticTargets.has(semanticTarget)) {
      throw new Error(`Invalid bundle contract: duplicate semantic target ${semanticTarget}.`);
    }
    semanticTargets.add(semanticTarget);
  }

  budget.forbiddenInitialSourceGroups.sort(compareOrdinal);
  budget.requiredLazyChunkPatterns.sort(compareOrdinal);
  return {
    budget,
    checkIds: [...checkIds].sort(compareOrdinal),
    identity: {
      architectureSchemaVersion: manifest.schemaVersion,
      bundlePolicySchemaVersion: policy.schemaVersion,
      path: displayContractPath(absolutePath),
      sha256: createHash("sha256").update(source).digest("hex")
    }
  };
}

function assertOnlyFields(record, allowedFields, label) {
  const unsupported = Object.keys(record).filter((field) => !allowedFields.has(field)).sort(compareOrdinal);
  if (unsupported.length > 0) {
    throw new Error(
      `Invalid bundle contract: ${label} declares unsupported field(s): ${unsupported.join(", ")}.`
    );
  }
}

function readStableContractTarget(value) {
  return typeof value === "string" && /^[A-Za-z0-9@._/+*-]+$/u.test(value) ? value : null;
}

function readNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function displayContractPath(absolutePath) {
  const relativePath = path.relative(process.cwd(), absolutePath);
  return (relativePath.startsWith("..") ? absolutePath : relativePath).replaceAll("\\", "/");
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
    .sort(compareOrdinal)
    .map((fileName) => readChunk(path.join(assetsDir, fileName), fileName))
    .sort(compareChunks);
  const provenance = readBundleProvenanceEvidence(
    input.distDir,
    chunks.map((chunk) => ({
      dynamicImports: chunk.dynamicImports,
      fileName: `assets/${chunk.name}`,
      source: chunk.source,
      staticImports: chunk.staticImports
    }))
  );
  for (const chunk of chunks) {
    const provenanceFileName = `assets/${chunk.name}`;
    const provenanceRecord = provenance.recordsByFileName.get(provenanceFileName);
    chunk.provenanceEvidence = provenance.chunkEvidenceByFileName.get(provenanceFileName) ?? {
      file: provenanceFileName,
      issues: [...provenance.evidence.issues],
      status: "INCOMPLETE"
    };
    chunk.provenanceSourceGroups = readProvenanceSourceGroups(provenanceRecord);
    chunk.sourceMapEvidence = attestSourceMapEvidence(
      chunk.sourceMapEvidence,
      provenanceRecord
    );
    delete chunk.source;
  }
  const chunkByName = new Map(chunks.map((chunk) => [chunk.name, chunk]));
  const topSourceGroups = readTopSourceGroups(chunks, input.topGroupLimit);
  const editorChunk = chunks.find((chunk) => chunk.role === "editor") ?? chunks[0] ?? null;
  const initialClosureRoots = sortUnique(
    [...htmlInitialChunkNames, editorChunk?.name].filter(Boolean)
  );
  const initialChunkNames = resolveStaticChunkClosure(
    chunkByName,
    initialClosureRoots
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
    initialClosureRoots,
    initialChunks,
    lazyChunks,
    reactChunks,
    provenanceEvidence: provenance.evidence,
    topSourceGroups,
    totalInitialGzipBytes: sum(initialChunks.map((chunk) => chunk.gzipBytes)),
    totalJsBytes: sum(chunks.map((chunk) => chunk.bytes)),
    totalJsGzipBytes: sum(chunks.map((chunk) => chunk.gzipBytes))
  };
}

function readChunk(filePath, fileName) {
  const source = readFileSync(filePath);
  const sourceText = source.toString("utf8");
  const sourceMap = readChunkSourceGroups(`${filePath}.map`, `${fileName}.map`, sourceText);

  return {
    bytes: statSync(filePath).size,
    dynamicImports: readDynamicChunkImports(sourceText),
    gzipBytes: gzipSync(source).length,
    staticImports: readStaticChunkImports(sourceText),
    name: fileName,
    role: classifyChunk(fileName),
    source,
    sourceGroups: sourceMap.sourceGroups,
    sourceMapEvidence: sourceMap.evidence
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

  return Array.from(chunks).sort(compareOrdinal);
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

  return Array.from(imports).sort(compareOrdinal);
}

function resolveStaticChunkClosure(chunkByName, roots) {
  const visited = new Set();
  const pending = sortUnique(roots.filter(Boolean)).reverse();

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
    pending.push(...[...chunk.staticImports].sort(compareOrdinal).reverse());
  }

  return visited;
}

function readChunkSourceGroups(mapPath, mapName, generatedSource) {
  if (!existsSync(mapPath)) {
    return {
      evidence: createSourceMapEvidence(mapName, ["source-map-missing"]),
      sourceGroups: []
    };
  }

  let map;
  try {
    map = JSON.parse(readFileSync(mapPath, "utf8"));
  } catch {
    return {
      evidence: createSourceMapEvidence(mapName, ["source-map-json-invalid"]),
      sourceGroups: []
    };
  }

  const issues = validateSourceMapEvidence(map, generatedSource);
  return {
    evidence: createSourceMapEvidence(mapName, issues),
    sourceGroups: issues.length === 0 ? readSourceGroupsFromMap(map) : []
  };
}

function readDynamicChunkImports(sourceText) {
  const imports = new Set();
  const dynamicImportPattern = /\bimport\s*\(\s*["'\x60]\.\/([^"'\x60]+\.js)["'\x60]\s*\)/gu;

  for (const match of sourceText.matchAll(dynamicImportPattern)) {
    if (match[1]) {
      imports.add(match[1]);
    }
  }

  return Array.from(imports).sort(compareOrdinal);
}

function createSourceMapEvidence(mapName, issues) {
  const sortedIssues = sortUnique(issues);
  return {
    map: mapName,
    issues: sortedIssues,
    status: sortedIssues.length === 0 ? "COMPLETE" : "INCOMPLETE"
  };
}

function attestSourceMapEvidence(evidence, provenanceRecord) {
  if (
    isRecord(provenanceRecord) &&
    provenanceRecord.hasSourceMap === false &&
    evidence.status === "INCOMPLETE" &&
    JSON.stringify(evidence.issues) === JSON.stringify(["source-map-missing"])
  ) {
    return {
      map: null,
      issues: [],
      status: "NOT_EMITTED"
    };
  }

  if (
    isRecord(provenanceRecord) &&
    provenanceRecord.facade === true &&
    Array.isArray(provenanceRecord.moduleIds) &&
    provenanceRecord.moduleIds.length === 0 &&
    typeof provenanceRecord.facadeModuleId === "string" &&
    provenanceRecord.facadeModuleId.length > 0 &&
    evidence.status === "INCOMPLETE" &&
    evidence.issues.length > 0 &&
    evidence.issues.every((issue) =>
      issue === "source-map-mappings-empty" || issue === "source-map-sources-empty"
    )
  ) {
    return {
      map: evidence.map,
      issues: [],
      status: "FACADE"
    };
  }

  return evidence;
}

function validateSourceMapEvidence(map, generatedSource) {
  if (!map || typeof map !== "object" || Array.isArray(map)) {
    return ["source-map-root-invalid"];
  }

  const issues = [];
  const hasVersion = Object.prototype.hasOwnProperty.call(map, "version");
  const hasMappings = Object.prototype.hasOwnProperty.call(map, "mappings");
  const hasNames = Object.prototype.hasOwnProperty.call(map, "names");
  const names = map.names;
  const sources = map.sources;
  const sourcesContent = map.sourcesContent;

  if (!hasVersion) {
    issues.push("source-map-version-missing");
  } else if (map.version !== 3) {
    issues.push("source-map-version-invalid");
  }
  if (!hasMappings) {
    issues.push("source-map-mappings-missing");
  } else if (typeof map.mappings !== "string") {
    issues.push("source-map-mappings-invalid");
  }
  if (!hasNames) {
    issues.push("source-map-names-missing");
  } else if (!Array.isArray(names)) {
    issues.push("source-map-names-invalid");
  }
  if (!Array.isArray(sources)) {
    issues.push("source-map-sources-missing");
  }
  if (!Array.isArray(sourcesContent)) {
    issues.push("source-map-sources-content-missing");
  }

  if (typeof map.mappings === "string") {
    issues.push(...validateSourceMapMappings(map.mappings, generatedSource, sources, names));
  }

  if (Array.isArray(names)) {
    names.forEach((name, index) => {
      if (typeof name !== "string" || name.length === 0) {
        issues.push(`source-map-name-invalid:${index}`);
      }
    });
  }

  if (Array.isArray(sources) && Array.isArray(sourcesContent)) {
    if (sources.length === 0) {
      issues.push("source-map-sources-empty");
    }
    if (sources.length !== sourcesContent.length) {
      issues.push("source-map-source-count-mismatch");
    }

    sources.forEach((source, index) => {
      if (typeof source !== "string" || source.length === 0) {
        issues.push(`source-map-source-invalid:${index}`);
      }
      if (index >= sourcesContent.length || sourcesContent[index] === undefined || sourcesContent[index] === null) {
        issues.push(`source-map-content-missing:${index}`);
      } else if (typeof sourcesContent[index] !== "string") {
        issues.push(`source-map-content-invalid:${index}`);
      }
    });
  }

  if (Object.prototype.hasOwnProperty.call(map, "ignoreList")) {
    issues.push(...validateSourceMapIgnoreList(map.ignoreList, sources, "ignore-list"));
  }
  if (Object.prototype.hasOwnProperty.call(map, "x_google_ignoreList")) {
    issues.push(
      ...validateSourceMapIgnoreList(map.x_google_ignoreList, sources, "google-ignore-list")
    );
  }

  return sortUnique(issues);
}

function validateSourceMapIgnoreList(value, sources, label) {
  if (!Array.isArray(value)) {
    return [`source-map-${label}-invalid`];
  }

  const issues = [];
  let previousIndex = -1;
  for (const [entryIndex, sourceIndex] of value.entries()) {
    if (
      !Number.isInteger(sourceIndex) ||
      sourceIndex < 0 ||
      sourceIndex <= previousIndex
    ) {
      issues.push(`source-map-${label}-entry-invalid:${entryIndex}`);
      continue;
    }
    previousIndex = sourceIndex;
    if (Array.isArray(sources) && sourceIndex >= sources.length) {
      issues.push(`source-map-${label}-reference-invalid:${entryIndex}`);
    }
  }
  return issues;
}

function validateSourceMapMappings(mappings, generatedSource, sources, names) {
  if (generatedSource.length > 0 && mappings.length === 0) {
    return ["source-map-mappings-empty"];
  }

  if (mappings.length === 0) {
    return [];
  }

  let previousSourceIndex = 0;
  let previousOriginalLine = 0;
  let previousOriginalColumn = 0;
  let previousNameIndex = 0;
  let hasSourceReference = false;
  let hasInvalidNameReference = false;
  let hasInvalidSourceReference = false;
  const generatedLines = splitGeneratedSourceLines(generatedSource);
  const segmentsByGeneratedLine = [];

  try {
    for (const [generatedLineIndex, generatedLine] of mappings.split(";").entries()) {
      let generatedColumn = 0;
      const decodedSegments = [];
      segmentsByGeneratedLine[generatedLineIndex] = decodedSegments;

      if (generatedLine.length === 0) {
        continue;
      }

      for (const encodedSegment of generatedLine.split(",")) {
        if (encodedSegment.length === 0) {
          throw new Error("empty source-map segment");
        }

        const segment = decodeBase64VlqSegment(encodedSegment);
        if (segment.length !== 1 && segment.length !== 4 && segment.length !== 5) {
          throw new Error("invalid source-map segment field count");
        }
        if (segment[0] < 0) {
          throw new Error("generated columns must be ordinal");
        }

        generatedColumn += segment[0];
        if (!Number.isSafeInteger(generatedColumn)) {
          throw new Error("generated column overflow");
        }

        if (segment.length === 1) {
          decodedSegments.push({ column: generatedColumn, hasSourceReference: false });
          continue;
        }

        hasSourceReference = true;
        decodedSegments.push({ column: generatedColumn, hasSourceReference: true });
        previousSourceIndex += segment[1];
        previousOriginalLine += segment[2];
        previousOriginalColumn += segment[3];

        if (
          !Number.isSafeInteger(previousSourceIndex) ||
          !Number.isSafeInteger(previousOriginalLine) ||
          !Number.isSafeInteger(previousOriginalColumn) ||
          previousOriginalLine < 0 ||
          previousOriginalColumn < 0
        ) {
          throw new Error("invalid source-map source position");
        }

        if (
          Array.isArray(sources) &&
          (previousSourceIndex < 0 || previousSourceIndex >= sources.length)
        ) {
          hasInvalidSourceReference = true;
        }

        if (segment.length === 5) {
          previousNameIndex += segment[4];
          if (!Number.isSafeInteger(previousNameIndex) || previousNameIndex < 0) {
            throw new Error("invalid source-map name index");
          }
          if (Array.isArray(names) && previousNameIndex >= names.length) {
            hasInvalidNameReference = true;
          }
        }
      }
    }
  } catch {
    return ["source-map-mappings-malformed"];
  }

  const issues = [];
  if (generatedSource.length > 0 && !hasSourceReference) {
    issues.push("source-map-mappings-unmapped");
  }
  if (hasInvalidNameReference) {
    issues.push("source-map-name-reference-invalid");
  }
  if (hasInvalidSourceReference) {
    issues.push("source-map-source-reference-invalid");
  }
  for (const [lineIndex, encodedSegments] of segmentsByGeneratedLine.entries()) {
    if (lineIndex >= generatedLines.length && encodedSegments.length > 0) {
      issues.push(`source-map-generated-line-reference-invalid:${lineIndex + 1}`);
    }
  }
  return issues;
}

function splitGeneratedSourceLines(source) {
  return source.split(/\r\n|[\n\r\u2028\u2029]/u);
}

function decodeBase64VlqSegment(encodedSegment) {
  const values = [];
  let value = 0;
  let shift = 0;
  let continuing = false;

  for (const character of encodedSegment) {
    const digit = BASE64_VLQ_ALPHABET.indexOf(character);
    if (digit < 0) {
      throw new Error("invalid base64 VLQ digit");
    }

    continuing = (digit & 32) !== 0;
    value += (digit & 31) * 2 ** shift;
    if (!Number.isSafeInteger(value)) {
      throw new Error("base64 VLQ overflow");
    }

    if (continuing) {
      shift += 5;
      if (shift > 50) {
        throw new Error("base64 VLQ overflow");
      }
      continue;
    }

    const isNegative = value % 2 === 1;
    const magnitude = Math.floor(value / 2);
    values.push(isNegative ? -magnitude : magnitude);
    value = 0;
    shift = 0;
  }

  if (continuing) {
    throw new Error("unterminated base64 VLQ value");
  }

  return values;
}

function readTopSourceGroups(chunks, limit) {
  const sourceGroupBytes = new Map();

  for (const chunk of chunks) {
    if (chunk.sourceMapEvidence.status !== "COMPLETE") {
      continue;
    }

    for (const group of chunk.sourceGroups) {
      sourceGroupBytes.set(group.group, (sourceGroupBytes.get(group.group) ?? 0) + group.bytes);
    }
  }

  return Array.from(sourceGroupBytes.entries())
    .map(([group, bytes]) => ({ bytes, group }))
    .sort((left, right) => right.bytes - left.bytes || compareOrdinal(left.group, right.group))
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
    .sort((left, right) => right.bytes - left.bytes || compareOrdinal(left.group, right.group));
}

function readProvenanceSourceGroups(record) {
  if (!isRecord(record) || !Array.isArray(record.moduleIds)) {
    return [];
  }

  const sourceIds = record.moduleIds.filter(
    (moduleId) => typeof moduleId === "string" && moduleId.length > 0
  );
  if (
    record.facade === true &&
    typeof record.facadeModuleId === "string" &&
    record.facadeModuleId.length > 0
  ) {
    sourceIds.push(record.facadeModuleId);
  }

  return sortUnique(sourceIds.map((moduleId) => resolveSourceGroup(moduleId)));
}

function resolveSourceGroup(source) {
  source = source.replaceAll("\\", "/");
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

  addMaxCheck(
    checks,
    "bundle.max-editor-bytes",
    "editorChunkBytes",
    report.editorChunk?.bytes ?? 0,
    budgetOptions.maxEditorBytes
  );
  addMaxCheck(
    checks,
    "bundle.max-editor-gzip-bytes",
    "editorChunkGzipBytes",
    report.editorChunk?.gzipBytes ?? 0,
    budgetOptions.maxEditorGzipBytes
  );
  addMaxCheck(
    checks,
    "bundle.max-initial-chunk-bytes",
    "maxInitialChunkBytes",
    Math.max(0, ...report.initialChunks.map((chunk) => chunk.bytes)),
    budgetOptions.maxInitialChunkBytes
  );
  addMaxCheck(
    checks,
    "bundle.max-initial-chunk-gzip-bytes",
    "maxInitialChunkGzipBytes",
    Math.max(0, ...report.initialChunks.map((chunk) => chunk.gzipBytes)),
    budgetOptions.maxInitialChunkGzipBytes
  );
  addMaxCheck(
    checks,
    "bundle.max-initial-gzip-bytes",
    "totalInitialGzipBytes",
    report.totalInitialGzipBytes,
    budgetOptions.maxInitialGzipBytes
  );
  addMaxCheck(
    checks,
    "bundle.max-total-gzip-bytes",
    "totalJsGzipBytes",
    report.totalJsGzipBytes,
    budgetOptions.maxTotalGzipBytes
  );

  for (const pattern of budgetOptions.requiredLazyChunkPatterns) {
    const matcher = new RegExp(pattern, "u");
    const matchingChunks = report.lazyChunks
      .filter((chunk) => matcher.test(chunk.name))
      .map((chunk) => chunk.name)
      .sort(compareOrdinal);
    checks.push({
      actual: matchingChunks,
      id: `bundle.required-lazy-chunk:${pattern}`,
      kind: "required-lazy-chunk",
      limit: { minimumMatchingChunks: 1 },
      name: `requiredLazyChunk:${pattern}`,
      pattern,
      status: matchingChunks.length > 0 ? "PASS" : "FAIL"
    });
  }

  for (const group of budgetOptions.forbiddenInitialSourceGroups) {
    const matchingChunks = report.initialChunks
      .filter((chunk) => chunk.provenanceSourceGroups.includes(group))
      .map((chunk) => chunk.name)
      .sort(compareOrdinal);
    const missingEvidenceChunks = report.initialChunks
      .filter(
        (chunk) =>
          chunk.provenanceEvidence.status !== "COMPLETE"
      )
      .map((chunk) => chunk.name)
      .sort(compareOrdinal);
    const evidenceStatus =
      report.initialChunks.length > 0 &&
      report.provenanceEvidence.status === "COMPLETE" &&
      missingEvidenceChunks.length === 0
        ? "COMPLETE"
        : "INCOMPLETE";
    const invalidSourceMapChunks = report.initialChunks
      .filter((chunk) => chunk.sourceMapEvidence.status === "INCOMPLETE")
      .map((chunk) => chunk.name)
      .sort(compareOrdinal);
    const failed =
      evidenceStatus !== "COMPLETE" ||
      matchingChunks.length > 0 ||
      invalidSourceMapChunks.length > 0;

    checks.push({
      actual: {
        evidenceStatus,
        invalidSourceMapChunks,
        matchingChunks,
        missingEvidenceChunks
      },
      group,
      id: `bundle.forbidden-initial-source-group:${group}`,
      kind: "forbidden-initial-source-group",
      limit: {
        evidenceStatus: "COMPLETE",
        matchingChunks: []
      },
      name: `forbiddenInitialSourceGroup:${group}`,
      status: failed ? "FAIL" : "PASS"
    });
  }

  if (checks.length === 0) {
    return null;
  }

  checks.sort((left, right) => compareOrdinal(left.id, right.id));

  return {
    checks,
    status: checks.every((check) => check.status === "PASS") ? "PASS" : "FAIL"
  };
}

function addMaxCheck(checks, id, name, actual, limit) {
  if (limit === null) {
    return;
  }

  checks.push({
    actual,
    id,
    kind: "maximum",
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
      `  - ${check.name} actual=${formatCheckValue(check.actual)} limit=${formatCheckValue(check.limit)} status=${check.status}`
    )
  ].join("\n");
}

function formatCheckValue(value) {
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

function buildBundleEvidence(report, budget) {
  const checks = budget?.checks ?? [];
  const initialChunks = [...report.initialChunks].sort((left, right) =>
    compareOrdinal(left.name, right.name)
  );
  const lazyRequirements = checks
    .filter((check) => check.kind === "required-lazy-chunk")
    .map((check) => ({
      checkId: check.id,
      matchingChunks: check.actual,
      pattern: check.pattern,
      status: check.status
    }));

  return {
    appliedCheckIds: checks.map((check) => check.id),
    checks,
    evidenceScope: BUNDLE_EVIDENCE_SCOPE,
    initialSourceGroups: collectInitialSourceGroups(initialChunks),
    initialStaticImportClosure: {
      chunks: initialChunks.map((chunk) => ({
        name: chunk.name,
        staticImports: [...chunk.staticImports].sort(compareOrdinal)
      })),
      roots: [...report.initialClosureRoots].sort(compareOrdinal)
    },
    lazyRequirements,
    provenanceEvidence: report.provenanceEvidence,
    provenanceChunkEvidence: initialChunks.map((chunk) => ({
      chunk: chunk.name,
      ...chunk.provenanceEvidence
    })),
    sourceGraphAuthority: SOURCE_GRAPH_AUTHORITY,
    sourceGroupAuthority: SOURCE_GROUP_AUTHORITY,
    sourceMapEvidence: initialChunks.map((chunk) => ({
      chunk: chunk.name,
      ...chunk.sourceMapEvidence
    })),
    status: budget?.status ?? "PASS"
  };
}

function collectInitialSourceGroups(initialChunks) {
  const groups = new Map();

  for (const chunk of initialChunks) {
    for (const sourceGroup of chunk.provenanceSourceGroups) {
      const entry = groups.get(sourceGroup) ?? { chunks: new Set() };
      entry.chunks.add(chunk.name);
      groups.set(sourceGroup, entry);
    }
  }

  return Array.from(groups.entries())
    .map(([group, entry]) => ({
      chunks: Array.from(entry.chunks).sort(compareOrdinal),
      group
    }))
    .sort((left, right) => compareOrdinal(left.group, right.group));
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

function compareOrdinal(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareChunks(left, right) {
  return right.bytes - left.bytes || compareOrdinal(left.name, right.name);
}

function sortUnique(values) {
  return Array.from(new Set(values)).sort(compareOrdinal);
}

function main() {
  const options = parseArguments(process.argv.slice(2));
  const contract = options.contractPath === null ? null : readBundleContract(options.contractPath);
  const report = readRendererBundleReport({
    distDir: path.resolve(process.cwd(), options.distDir),
    topGroupLimit: options.topGroupLimit
  });
  const budget = evaluateBundleBudget(report, contract?.budget ?? options.budget);
  if (
    contract &&
    JSON.stringify(budget?.checks.map((check) => check.id) ?? []) !==
      JSON.stringify(contract.checkIds)
  ) {
    throw new Error("Invalid bundle contract: not all declared checks were applied.");
  }
  const output = {
    schemaVersion: REPORT_SCHEMA_VERSION,
    ...report,
    budget,
    bundleEvidence: buildBundleEvidence(report, budget),
    contract: contract?.identity ?? null
  };

  if (options.json) {
    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
    if (budget?.status === "FAIL") {
      process.exitCode = 1;
    }
    return;
  }

  const contractSummary = contract
    ? `bundleContract=${contract.identity.path} sha256=${contract.identity.sha256}`
    : "bundleContract=ad-hoc";
  process.stdout.write(`${formatReport(report)}\n${contractSummary}\n${formatBudget(budget)}\n`);
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
