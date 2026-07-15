import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export const BUNDLE_PROVENANCE_FILE_NAME = "fishmark-bundle-provenance.json";
export const BUNDLE_PROVENANCE_SCHEMA_VERSION = 1;

const ROOT_FIELDS = new Set([
  "chunks",
  "hashAlgorithm",
  "payloadSha256",
  "schemaVersion"
]);
const CHUNK_FIELDS = new Set([
  "codeSha256",
  "dynamicImports",
  "fileName",
  "hasSourceMap",
  "imports",
  "isDynamicEntry",
  "isEntry",
  "mapFileName",
  "mapSha256",
  "moduleIds"
]);
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;

export function readBundleProvenanceEvidence(distDir, chunks) {
  const provenancePath = path.join(distDir, BUNDLE_PROVENANCE_FILE_NAME);
  if (!existsSync(provenancePath)) {
    return createResult(["bundle-provenance-missing"], new Map(), new Map());
  }

  let document;
  try {
    document = JSON.parse(readFileSync(provenancePath, "utf8"));
  } catch {
    return createResult(["bundle-provenance-json-invalid"], new Map(), new Map());
  }

  const rootIssues = validateRoot(document);
  if (!isRecord(document) || !Array.isArray(document.chunks)) {
    return createResult(rootIssues, new Map(), new Map());
  }

  const recordsByFileName = new Map();
  for (const [index, record] of document.chunks.entries()) {
    if (!isRecord(record) || typeof record.fileName !== "string") {
      rootIssues.push(`bundle-provenance-chunk-invalid:${index}`);
      continue;
    }
    if (recordsByFileName.has(record.fileName)) {
      rootIssues.push(`bundle-provenance-chunk-duplicate:${record.fileName}`);
      continue;
    }
    recordsByFileName.set(record.fileName, record);
  }

  const actualFileNames = new Set(chunks.map((chunk) => chunk.fileName));
  for (const fileName of actualFileNames) {
    if (!recordsByFileName.has(fileName)) {
      rootIssues.push(`bundle-provenance-chunk-missing:${fileName}`);
    }
  }
  for (const fileName of recordsByFileName.keys()) {
    if (!actualFileNames.has(fileName)) {
      rootIssues.push(`bundle-provenance-chunk-extra:${fileName}`);
    }
  }

  const chunkEvidenceByFileName = new Map();
  for (const chunk of chunks) {
    const record = recordsByFileName.get(chunk.fileName);
    if (!record) {
      chunkEvidenceByFileName.set(
        chunk.fileName,
        createChunkEvidence(chunk.fileName, [`bundle-provenance-chunk-missing:${chunk.fileName}`])
      );
      continue;
    }

    const issues = validateChunkRecord(distDir, chunk, record, recordsByFileName);
    rootIssues.push(...issues);
    chunkEvidenceByFileName.set(chunk.fileName, createChunkEvidence(chunk.fileName, issues));
  }

  return createResult(rootIssues, recordsByFileName, chunkEvidenceByFileName);
}

function validateRoot(document) {
  if (!isRecord(document)) {
    return ["bundle-provenance-root-invalid"];
  }

  const issues = validateOnlyFields(document, ROOT_FIELDS, "bundle-provenance-root-fields-invalid");
  if (document.schemaVersion !== BUNDLE_PROVENANCE_SCHEMA_VERSION) {
    issues.push("bundle-provenance-schema-version-invalid");
  }
  if (document.hashAlgorithm !== "sha256") {
    issues.push("bundle-provenance-hash-algorithm-invalid");
  }
  if (!SHA256_PATTERN.test(document.payloadSha256 ?? "")) {
    issues.push("bundle-provenance-payload-hash-invalid");
  }
  if (!Array.isArray(document.chunks)) {
    issues.push("bundle-provenance-chunks-invalid");
  } else {
    const payloadHash = sha256(JSON.stringify(document.chunks));
    if (document.payloadSha256 !== payloadHash) {
      issues.push("bundle-provenance-payload-hash-mismatch");
    }
    const fileNames = document.chunks.map((record) =>
      isRecord(record) && typeof record.fileName === "string" ? record.fileName : ""
    );
    if (!isStrictlyOrdinal(fileNames)) {
      issues.push("bundle-provenance-chunks-order-invalid");
    }
  }
  return issues;
}

function validateChunkRecord(distDir, chunk, record, recordsByFileName) {
  const issues = validateOnlyFields(
    record,
    CHUNK_FIELDS,
    `bundle-provenance-chunk-fields-invalid:${chunk.fileName}`
  );
  if (!isSafeBundleFileName(record.fileName) || record.fileName !== chunk.fileName) {
    issues.push(`bundle-provenance-file-name-invalid:${chunk.fileName}`);
  }
  if (!SHA256_PATTERN.test(record.codeSha256 ?? "")) {
    issues.push(`bundle-provenance-code-hash-invalid:${chunk.fileName}`);
  } else if (record.codeSha256 !== sha256(chunk.source)) {
    issues.push(`bundle-provenance-code-hash-mismatch:${chunk.fileName}`);
  }
  issues.push(...validateSourceMapAttestation(distDir, chunk.fileName, record));
  if (typeof record.isEntry !== "boolean") {
    issues.push(`bundle-provenance-entry-flag-invalid:${chunk.fileName}`);
  }
  if (typeof record.isDynamicEntry !== "boolean") {
    issues.push(`bundle-provenance-dynamic-entry-flag-invalid:${chunk.fileName}`);
  }

  const imports = validateStringArray(record.imports, false);
  const dynamicImports = validateStringArray(record.dynamicImports, false);
  const moduleIds = validateStringArray(record.moduleIds, true);
  if (!imports.valid) {
    issues.push(`bundle-provenance-imports-invalid:${chunk.fileName}`);
  }
  if (!dynamicImports.valid) {
    issues.push(`bundle-provenance-dynamic-imports-invalid:${chunk.fileName}`);
  }
  if (!moduleIds.valid) {
    issues.push(`bundle-provenance-module-ids-invalid:${chunk.fileName}`);
  }

  if (imports.valid) {
    issues.push(
      ...validateDependencyEvidence(
        chunk.fileName,
        imports.values,
        chunk.staticImports,
        recordsByFileName,
        "imports"
      )
    );
  }
  if (dynamicImports.valid) {
    issues.push(
      ...validateDependencyEvidence(
        chunk.fileName,
        dynamicImports.values,
        chunk.dynamicImports,
        recordsByFileName,
        "dynamic-imports"
      )
    );
  }

  return sortUnique(issues);
}

function validateSourceMapAttestation(distDir, fileName, record) {
  if (typeof record.hasSourceMap !== "boolean") {
    return [`bundle-provenance-has-source-map-invalid:${fileName}`];
  }

  const expectedMapFileName = `${fileName}.map`;
  const expectedMapPath = path.join(distDir, ...expectedMapFileName.split("/"));
  const hasMapOnDisk = existsSync(expectedMapPath);
  if (!record.hasSourceMap) {
    const issues = [];
    if (record.mapFileName !== null || record.mapSha256 !== null) {
      issues.push(`bundle-provenance-mapless-fields-invalid:${fileName}`);
    }
    if (hasMapOnDisk) {
      issues.push(`bundle-provenance-mapless-disk-mismatch:${fileName}`);
    }
    return issues;
  }

  const issues = [];
  if (
    !isSafeBundleFileName(record.mapFileName) ||
    record.mapFileName !== expectedMapFileName
  ) {
    issues.push(`bundle-provenance-map-file-name-invalid:${fileName}`);
  }
  if (!SHA256_PATTERN.test(record.mapSha256 ?? "")) {
    issues.push(`bundle-provenance-map-hash-invalid:${fileName}`);
  }
  if (!hasMapOnDisk) {
    issues.push(`bundle-provenance-map-missing:${fileName}`);
  } else if (
    SHA256_PATTERN.test(record.mapSha256 ?? "") &&
    record.mapSha256 !== sha256(readFileSync(expectedMapPath))
  ) {
    issues.push(`bundle-provenance-map-hash-mismatch:${fileName}`);
  }
  return issues;
}

function validateDependencyEvidence(
  fromFileName,
  provenanceDependencies,
  generatedDependencies,
  recordsByFileName,
  kind
) {
  const issues = [];
  const normalizedProvenance = provenanceDependencies.map((dependency) =>
    normalizeDependencyFileName(fromFileName, dependency)
  );
  if (normalizedProvenance.some((dependency) => dependency === null)) {
    issues.push(`bundle-provenance-${kind}-target-invalid:${fromFileName}`);
    return issues;
  }
  const normalizedGenerated = generatedDependencies.map((dependency) =>
    normalizeDependencyFileName(fromFileName, dependency)
  );
  if (normalizedGenerated.some((dependency) => dependency === null)) {
    issues.push(`bundle-provenance-${kind}-generated-target-invalid:${fromFileName}`);
    return issues;
  }
  if (
    JSON.stringify(sortUnique(normalizedProvenance)) !==
    JSON.stringify(sortUnique(normalizedGenerated))
  ) {
    issues.push(`bundle-provenance-${kind}-mismatch:${fromFileName}`);
  }
  for (const dependency of normalizedProvenance) {
    if (!recordsByFileName.has(dependency)) {
      issues.push(`bundle-provenance-${kind}-closure-missing:${fromFileName}->${dependency}`);
    }
  }
  return issues;
}

function normalizeDependencyFileName(fromFileName, dependency) {
  if (typeof dependency !== "string" || dependency.length === 0 || dependency.includes("\\")) {
    return null;
  }
  const normalized = dependency.includes("/")
    ? path.posix.normalize(dependency)
    : path.posix.join(path.posix.dirname(fromFileName), dependency);
  return isSafeBundleFileName(normalized) ? normalized : null;
}

function validateStringArray(value, requireNonEmpty) {
  if (
    !Array.isArray(value) ||
    (requireNonEmpty && value.length === 0) ||
    value.some((entry) => typeof entry !== "string" || entry.length === 0) ||
    !isStrictlyOrdinal(value)
  ) {
    return { valid: false, values: [] };
  }
  return { valid: true, values: value };
}

function isStrictlyOrdinal(values) {
  return values.every((value, index) => index === 0 || compareOrdinal(values[index - 1], value) < 0);
}

function isSafeBundleFileName(value) {
  return typeof value === "string" &&
    value.length > 0 &&
    (value.endsWith(".js") || value.endsWith(".js.map")) &&
    !value.startsWith("/") &&
    !value.includes("\\") &&
    path.posix.normalize(value) === value &&
    !value.split("/").includes("..");
}

function validateOnlyFields(record, allowedFields, issuePrefix) {
  const unsupported = Object.keys(record).filter((field) => !allowedFields.has(field));
  const missing = [...allowedFields].filter(
    (field) => !Object.prototype.hasOwnProperty.call(record, field)
  );
  return unsupported.length === 0 && missing.length === 0
    ? []
    : [`${issuePrefix}:${sortUnique([...unsupported, ...missing]).join(",")}`];
}

function createChunkEvidence(fileName, issues) {
  const sortedIssues = sortUnique(issues);
  return {
    file: fileName,
    issues: sortedIssues,
    status: sortedIssues.length === 0 ? "COMPLETE" : "INCOMPLETE"
  };
}

function createResult(issues, recordsByFileName, chunkEvidenceByFileName) {
  const sortedIssues = sortUnique(issues);
  return {
    chunkEvidenceByFileName,
    evidence: {
      file: BUNDLE_PROVENANCE_FILE_NAME,
      issues: sortedIssues,
      status: sortedIssues.length === 0 ? "COMPLETE" : "INCOMPLETE"
    },
    recordsByFileName
  };
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sortUnique(values) {
  return Array.from(new Set(values)).sort(compareOrdinal);
}

function compareOrdinal(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}
