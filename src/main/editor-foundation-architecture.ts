import { isAbsolute, relative, resolve } from "node:path";

import { compareOrdinal } from "./editor-foundation-order";
import {
  inspectRepositoryPath,
  normalizeFilesystemError,
  readRepositoryText
} from "./editor-foundation-repository-evidence";
import {
  analyzeSourceModule,
  collectSourceFiles,
  resolveImportRepoPath,
  resolveSourceModulePath,
  type SourceModuleAnalysis
} from "./editor-foundation-source-scan";

export type ArchitectureFinding = {
  code: string;
  message: string;
  path?: string;
  ruleId?: string;
};

export type EditorFoundationArchitectureResult = {
  findings: ArchitectureFinding[];
  ok: boolean;
};

export type ValidateEditorFoundationArchitectureOptions = {
  manifest: unknown;
  rootDir: string;
};

type ManifestRecord = Record<string, unknown>;

type ExactException = {
  id: string;
  importer: string;
  ruleId: string;
  specifier: string;
};

type RoadmapTaskEvidence = {
  complete: boolean;
  tasks: ReadonlySet<string>;
};

type ValidationContext = {
  analysisCache: Map<string, SourceModuleAnalysis | null>;
  failedSourceWalkPaths: Set<string>;
  findings: ArchitectureFinding[];
  roadmapEvidence: RoadmapTaskEvidence;
  rootDir: string;
  sourceEvidenceComplete: boolean;
  usedExceptionIds: Set<string>;
};

const supportedRuleKinds = new Set(["forbidden-imports", "public-package-entry"]);
const supportedBundleCheckKinds = new Set([
  "forbidden-initial-source-group",
  "maximum",
  "required-lazy-chunk"
]);
const bundleMaximumCheckIdsByMetric = new Map([
  ["editorChunkBytes", "bundle.max-editor-bytes"],
  ["editorChunkGzipBytes", "bundle.max-editor-gzip-bytes"],
  ["maxInitialChunkBytes", "bundle.max-initial-chunk-bytes"],
  ["maxInitialChunkGzipBytes", "bundle.max-initial-chunk-gzip-bytes"],
  ["totalInitialGzipBytes", "bundle.max-initial-gzip-bytes"],
  ["totalJsGzipBytes", "bundle.max-total-gzip-bytes"]
]);
const supportedLifecycleStates = new Set(["present", "present-until", "forbidden", "removed"]);
const supportedParserVisibilities = new Set(["public", "internal-export"]);
const forbiddenImportRuleFields = new Set([
  "forbiddenPackages",
  "forbiddenPaths",
  "id",
  "kind",
  "sourcePath",
  "state"
]);
const publicEntryRuleFields = new Set([
  "id",
  "kind",
  "packagesPath",
  "publicPrefix",
  "sourcePaths",
  "state"
]);

export function validateEditorFoundationArchitecture(
  options: ValidateEditorFoundationArchitectureOptions
): EditorFoundationArchitectureResult {
  const rootDir = resolve(options.rootDir);
  const findings: ArchitectureFinding[] = [];
  if (!isRecord(options.manifest)) {
    return createResult([
      {
        code: "invalid-manifest",
        message: "Architecture manifest must be a JSON object."
      }
    ]);
  }

  const manifest = options.manifest;
  if (manifest.schemaVersion !== 1) {
    findings.push({
      code: "unsupported-schema-version",
      message: `Expected architecture schemaVersion 1, received ${String(manifest.schemaVersion)}.`
    });
  }

  const roadmapEvidence = readRoadmapTasks(rootDir, manifest.roadmapPath, findings);
  const context: ValidationContext = {
    analysisCache: new Map(),
    failedSourceWalkPaths: new Set(),
    findings,
    roadmapEvidence,
    rootDir,
    sourceEvidenceComplete: true,
    usedExceptionIds: new Set()
  };
  const packages = readRecordArray(manifest, "packages", findings);
  const rules = readRecordArray(manifest, "rules", findings);
  const exceptions = readRecordArray(manifest, "exceptions", findings);
  const parserEntries = readRecordArray(manifest, "parserEntries", findings);
  const micromarkSites = readRecordArray(manifest, "micromarkDocumentSites", findings);
  const bundleChecks = validateBundlePolicy(manifest.bundlePolicy, context);

  validateUniqueIds(packages, rules, exceptions, parserEntries, micromarkSites, bundleChecks, findings);
  const activeRules = validateRules(rules, context);
  validatePackages(packages, activeRules, context);
  const validExceptions = validateExceptions(exceptions, activeRules, context);
  validateImports(activeRules, validExceptions, context);
  validateParserPolicy(manifest.parserPolicy, parserEntries, micromarkSites, context);
  validateStaleImportDebt(validExceptions, context);

  return createResult(findings);
}

function validateBundlePolicy(value: unknown, context: ValidationContext): ManifestRecord[] {
  if (!isRecord(value)) {
    context.findings.push({
      code: "invalid-bundle-policy",
      message: "Architecture manifest must declare a bundlePolicy object."
    });
    return [];
  }
  validateRecordFields(
    value,
    new Set(["checks", "schemaVersion"]),
    "invalid-bundle-policy-field",
    "Bundle policy",
    context
  );
  if (value.schemaVersion !== 1) {
    context.findings.push({
      code: "unsupported-bundle-policy-schema-version",
      message: `Expected bundlePolicy schemaVersion 1, received ${String(value.schemaVersion)}.`
    });
  }
  if (!Array.isArray(value.checks)) {
    context.findings.push({
      code: "invalid-bundle-policy",
      message: "Bundle policy checks must be an array."
    });
    return [];
  }
  if (value.checks.length === 0) {
    context.findings.push({
      code: "empty-bundle-policy-checks",
      message: "Bundle policy must contain at least one executable check."
    });
  }

  const checks: ManifestRecord[] = [];
  const semanticTargets = new Set<string>();
  for (const [index, candidate] of value.checks.entries()) {
    if (!isRecord(candidate)) {
      context.findings.push({
        code: "invalid-bundle-check",
        message: `Bundle policy check at index ${index} must be an object.`
      });
      continue;
    }
    checks.push(candidate);
    const id = readNonEmptyString(candidate.id);
    const kind = readNonEmptyString(candidate.kind);
    if (!kind || !supportedBundleCheckKinds.has(kind)) {
      context.findings.push({
        code: "unknown-bundle-check-kind",
        message: `Bundle check ${id ?? "<missing-id>"} has unsupported kind ${String(candidate.kind)}.`
      });
      continue;
    }

    let target: string | null = null;
    let canonicalId: string | null = null;
    if (kind === "maximum") {
      validateRecordFields(
        candidate,
        new Set(["id", "kind", "limit", "metric"]),
        "invalid-bundle-check-field",
        `Bundle check ${id ?? "<missing-id>"}`,
        context
      );
      const metric = readNonEmptyString(candidate.metric);
      const limit = candidate.limit;
      canonicalId = metric ? bundleMaximumCheckIdsByMetric.get(metric) ?? null : null;
      target = metric ? `${kind}|${metric}` : null;
      if (!canonicalId || !Number.isInteger(limit) || Number(limit) < 1) {
        context.findings.push({
          code: "invalid-bundle-check",
          message: `Maximum bundle check ${id ?? "<missing-id>"} requires a supported metric and positive integer limit.`
        });
      }
    } else if (kind === "required-lazy-chunk") {
      validateRecordFields(
        candidate,
        new Set(["id", "kind", "pattern"]),
        "invalid-bundle-check-field",
        `Bundle check ${id ?? "<missing-id>"}`,
        context
      );
      const pattern = readStableBundleTarget(candidate.pattern);
      canonicalId = pattern ? `bundle.required-lazy-chunk:${pattern}` : null;
      target = pattern ? `${kind}|${pattern}` : null;
      if (!pattern || !isValidRegularExpression(pattern)) {
        context.findings.push({
          code: "invalid-bundle-check",
          message: `Required lazy chunk check ${id ?? "<missing-id>"} requires a stable valid pattern.`
        });
      }
    } else {
      validateRecordFields(
        candidate,
        new Set(["group", "id", "kind"]),
        "invalid-bundle-check-field",
        `Bundle check ${id ?? "<missing-id>"}`,
        context
      );
      const group = readStableBundleTarget(candidate.group);
      canonicalId = group ? `bundle.forbidden-initial-source-group:${group}` : null;
      target = group ? `${kind}|${group}` : null;
      if (!group) {
        context.findings.push({
          code: "invalid-bundle-check",
          message: `Forbidden initial source group check ${id ?? "<missing-id>"} requires a stable group.`
        });
      }
    }

    if (id && canonicalId && id !== canonicalId) {
      context.findings.push({
        code: "noncanonical-bundle-check-id",
        message: `Bundle check ${id} must use canonical id ${canonicalId}.`
      });
    }
    if (target) {
      if (semanticTargets.has(target)) {
        context.findings.push({
          code: "duplicate-bundle-check-target",
          message: `Bundle policy repeats semantic target ${target}.`
        });
      }
      semanticTargets.add(target);
    }
  }
  return checks;
}

function validateRules(rules: readonly ManifestRecord[], context: ValidationContext): ManifestRecord[] {
  const activeRules: ManifestRecord[] = [];
  for (const rule of rules) {
    const id = readNonEmptyString(rule.id);
    const state = readNonEmptyString(rule.state);
    const kind = readNonEmptyString(rule.kind);
    if (state !== "active") {
      context.findings.push({
        code: "unknown-rule-state",
        message: `Rule ${id ?? "<missing-id>"} has unsupported state ${String(rule.state)}.`,
        ruleId: id ?? undefined
      });
      continue;
    }
    if (!kind || !supportedRuleKinds.has(kind)) {
      context.findings.push({
        code: "unknown-rule-kind",
        message: `Rule ${id ?? "<missing-id>"} has unsupported kind ${String(rule.kind)}.`,
        ruleId: id ?? undefined
      });
      continue;
    }
    validateRecordFields(
      rule,
      kind === "forbidden-imports" ? forbiddenImportRuleFields : publicEntryRuleFields,
      "unknown-rule-field",
      `Rule ${id ?? "<missing-id>"}`,
      context,
      id
    );
    activeRules.push(rule);

    if (kind === "forbidden-imports") {
      validateActiveRuleDirectory(rule.sourcePath, `rule ${id ?? "<missing-id>"} sourcePath`, context);
      validateStringArray(rule.forbiddenPackages, `rule ${id ?? "<missing-id>"} forbiddenPackages`, context);
      for (const path of validateStringArray(
        rule.forbiddenPaths,
        `rule ${id ?? "<missing-id>"} forbiddenPaths`,
        context
      )) {
        validateManifestPath(path, `rule ${id ?? "<missing-id>"} forbidden path`, context);
      }
    } else {
      const sourcePaths = validateStringArray(
        rule.sourcePaths,
        `rule ${id ?? "<missing-id>"} sourcePaths`,
        context
      );
      if (sourcePaths.length === 0) {
        context.findings.push({
          code: "active-rule-source-paths-empty",
          message: `Rule ${id ?? "<missing-id>"} must scan at least one source directory while active.`,
          ruleId: id ?? undefined
        });
      }
      for (const path of sourcePaths) {
        validateActiveRuleDirectory(path, `rule ${id ?? "<missing-id>"} source path`, context);
      }
      validateActiveRuleDirectory(rule.packagesPath, `rule ${id ?? "<missing-id>"} packagesPath`, context);
      if (!readNonEmptyString(rule.publicPrefix)) {
        context.findings.push({
          code: "invalid-rule",
          message: `Rule ${id ?? "<missing-id>"} must declare a non-empty publicPrefix.`,
          ruleId: id ?? undefined
        });
      }
    }
  }

  if (activeRules.length === 0) {
    context.findings.push({
      code: "empty-active-rules",
      message: "Architecture manifest must contain at least one valid active rule."
    });
  }
  return activeRules;
}

function validatePackages(
  packages: readonly ManifestRecord[],
  activeRules: readonly ManifestRecord[],
  context: ValidationContext
): void {
  const activeRulesById = new Map(
    activeRules
      .map((rule) => [readNonEmptyString(rule.id), rule] as const)
      .filter((entry): entry is readonly [string, ManifestRecord] => entry[0] !== null)
  );
  const boundaryRuleClaims = new Map<string, string[]>();
  for (const targetPackage of packages) {
    if (readNonEmptyString(targetPackage.state) !== "active") {
      continue;
    }
    const boundaryRuleId = readNonEmptyString(targetPackage.boundaryRuleId);
    const packageId = readNonEmptyString(targetPackage.id);
    if (boundaryRuleId && packageId) {
      const claims = boundaryRuleClaims.get(boundaryRuleId) ?? [];
      claims.push(packageId);
      boundaryRuleClaims.set(boundaryRuleId, claims);
    }
  }
  for (const targetPackage of packages) {
    const id = readNonEmptyString(targetPackage.id) ?? "<missing-id>";
    const path = validateManifestPath(targetPackage.path, `package ${id} path`, context);
    const state = readNonEmptyString(targetPackage.state);
    const boundaryRuleId = readNonEmptyString(targetPackage.boundaryRuleId);
    if (!readNonEmptyString(targetPackage.publicEntry)) {
      context.findings.push({
        code: "invalid-package-entry",
        message: `Package ${id} must declare a publicEntry.`
      });
    }
    if (!path) {
      continue;
    }

    if (state === "active") {
      const inspection = inspectRepositoryPath(context.rootDir, path);
      if (inspection.kind === "missing") {
        context.findings.push({
          code: "active-package-missing",
          message: `Active package ${id} is missing at ${path}.`,
          path
        });
      } else if (inspection.kind === "error") {
        reportFilesystemAccessError(`active package ${id}`, path, inspection.errorCode, context);
      } else if (inspection.kind !== "directory") {
        context.findings.push({
          code: "active-package-not-directory",
          message: `Active package ${id} must resolve to a directory at ${path}.`,
          path
        });
      }
      const boundaryRule = boundaryRuleId ? activeRulesById.get(boundaryRuleId) : undefined;
      if (!boundaryRuleId || !boundaryRule) {
        context.findings.push({
          code: "package-boundary-rule-missing",
          message: `Active package ${id} must reference an active boundary rule.`,
          path,
          ruleId: boundaryRuleId ?? undefined
        });
      } else {
        if (readNonEmptyString(boundaryRule.kind) !== "forbidden-imports") {
          context.findings.push({
            code: "package-boundary-rule-wrong-kind",
            message: `Active package ${id} must reference an active forbidden-imports rule.`,
            path,
            ruleId: boundaryRuleId
          });
        }
        const ruleSourcePath = readNonEmptyString(boundaryRule.sourcePath);
        if (!ruleSourcePath || normalizeRepoPath(ruleSourcePath) !== normalizeRepoPath(path)) {
          context.findings.push({
            code: "package-boundary-rule-source-mismatch",
            message: `Active package ${id} path ${path} must match boundary rule sourcePath ${ruleSourcePath ?? "<missing>"}.`,
            path,
            ruleId: boundaryRuleId
          });
        }
        const claims = boundaryRuleClaims.get(boundaryRuleId) ?? [];
        if (claims.length > 1) {
          context.findings.push({
            code: "package-boundary-rule-reused",
            message: `Boundary rule ${boundaryRuleId} is claimed by multiple active packages: ${claims.sort(compareOrdinal).join(", ")}.`,
            path,
            ruleId: boundaryRuleId
          });
        }
      }
    } else if (state === "planned") {
      const inspection = inspectRepositoryPath(context.rootDir, path);
      if (inspection.kind === "error") {
        reportFilesystemAccessError(`planned package ${id}`, path, inspection.errorCode, context);
      } else if (inspection.kind !== "missing") {
        context.findings.push({
          code: "planned-package-present",
          message: `Planned package ${id} now exists at ${path}; activate its package state and boundary rule in the same change.`,
          path,
          ruleId: boundaryRuleId ?? undefined
        });
      }
    } else {
      context.findings.push({
        code: "unknown-package-state",
        message: `Package ${id} has unsupported state ${String(targetPackage.state)}.`,
        path
      });
    }
  }
}

function validateExceptions(
  exceptions: readonly ManifestRecord[],
  activeRules: readonly ManifestRecord[],
  context: ValidationContext
): ExactException[] {
  const activeRuleIds = new Set(activeRules.map((rule) => readNonEmptyString(rule.id)).filter(isString));
  const exactExceptions: ExactException[] = [];
  const exactTargets = new Set<string>();
  for (const exception of exceptions) {
    const id = readNonEmptyString(exception.id);
    const ruleId = readNonEmptyString(exception.ruleId);
    const importer = readNonEmptyString(exception.importer);
    const specifier = readNonEmptyString(exception.specifier);
    let valid = true;
    if (
      !id ||
      !ruleId ||
      !importer ||
      !specifier ||
      !readNonEmptyString(exception.owner) ||
      !readNonEmptyString(exception.reason) ||
      hasWildcard(importer) ||
      hasWildcard(specifier)
    ) {
      context.findings.push({
        code: "invalid-exception",
        message: `Exception ${id ?? "<missing-id>"} must use exact importer/specifier values and declare owner and reason.`,
        ruleId: ruleId ?? undefined
      });
      valid = false;
    }
    if (importer && !validateManifestPath(importer, `exception ${id ?? "<missing-id>"} importer`, context)) {
      valid = false;
    }
    if (importer && specifier && specifier.startsWith(".")) {
      const resolvedSpecifier = resolveImportRepoPath(context.rootDir, importer, specifier);
      if (!resolvedSpecifier || isEscapingRepoPath(resolvedSpecifier)) {
        context.findings.push({
          code: "invalid-exception",
          message: `Exception ${id ?? "<missing-id>"} specifier escapes the repository.`,
          path: importer,
          ruleId: ruleId ?? undefined
        });
        valid = false;
      }
    }
    if (ruleId && !activeRuleIds.has(ruleId)) {
      context.findings.push({
        code: "exception-rule-missing",
        message: `Exception ${id ?? "<missing-id>"} references inactive or missing rule ${ruleId}.`,
        path: importer ?? undefined,
        ruleId
      });
      valid = false;
    }
    if (!validateRetirementTask(exception.retireIn, id, context)) {
      valid = false;
    }
    if (!valid || !id || !ruleId || !importer || !specifier) {
      continue;
    }
    const exactTarget = exceptionTarget(ruleId, importer, specifier);
    if (exactTargets.has(exactTarget)) {
      context.findings.push({
        code: "invalid-exception",
        message: `Exception ${id} duplicates an existing exact rule/importer/specifier target.`,
        path: importer,
        ruleId
      });
      continue;
    }
    exactTargets.add(exactTarget);
    exactExceptions.push({ id, importer, ruleId, specifier });
  }
  return exactExceptions;
}

function validateImports(
  activeRules: readonly ManifestRecord[],
  exceptions: readonly ExactException[],
  context: ValidationContext
): void {
  const exceptionsByTarget = new Map(
    exceptions.map((exception) => [exceptionTarget(exception.ruleId, exception.importer, exception.specifier), exception])
  );
  const reportViolation = (ruleId: string, importer: string, specifier: string, code: string, message: string): void => {
    const exception = exceptionsByTarget.get(exceptionTarget(ruleId, importer, specifier));
    if (exception) {
      context.usedExceptionIds.add(exception.id);
      return;
    }
    context.findings.push({ code, message, path: importer, ruleId });
  };

  for (const rule of activeRules) {
    const id = readNonEmptyString(rule.id);
    const kind = readNonEmptyString(rule.kind);
    if (!id || !kind || !supportedRuleKinds.has(kind)) {
      continue;
    }
    if (kind === "forbidden-imports") {
      validateForbiddenImports(rule, id, reportViolation, context);
    } else {
      validatePublicPackageImports(rule, id, reportViolation, context);
    }
  }
}

function validateStaleImportDebt(
  exceptions: readonly ExactException[],
  context: ValidationContext
): void {
  if (!context.sourceEvidenceComplete) {
    return;
  }
  for (const exception of exceptions) {
    if (!context.usedExceptionIds.has(exception.id)) {
      context.findings.push({
        code: "stale-exception",
        message: `Exception ${exception.id} no longer matches a real architecture violation and must be removed.`,
        path: exception.importer,
        ruleId: exception.ruleId
      });
    }
  }

}

function validateForbiddenImports(
  rule: ManifestRecord,
  ruleId: string,
  reportViolation: (ruleId: string, importer: string, specifier: string, code: string, message: string) => void,
  context: ValidationContext
): void {
  const sourcePath = readNonEmptyString(rule.sourcePath);
  if (!sourcePath || !isSafeManifestPath(context.rootDir, sourcePath)) {
    return;
  }
  const forbiddenPackages = stringArray(rule.forbiddenPackages);
  const forbiddenPaths = stringArray(rule.forbiddenPaths);
  for (const importer of collectSources(context, sourcePath)) {
    const analysis = analyze(context, importer);
    if (!analysis) {
      continue;
    }
    for (const sourceImport of analysis.imports) {
      const packageViolation = forbiddenPackages.some((pattern) => packagePatternMatches(pattern, sourceImport.specifier));
      const resolvedPath = resolveImportRepoPath(context.rootDir, importer, sourceImport.specifier);
      const pathViolation =
        resolvedPath !== null && forbiddenPaths.some((path) => pathIsWithin(resolvedPath, normalizeRepoPath(path)));
      if (packageViolation || pathViolation) {
        reportViolation(
          ruleId,
          importer,
          sourceImport.specifier,
          "forbidden-import",
          `${importer} imports forbidden dependency ${sourceImport.specifier} (${sourceImport.kind}).`
        );
      }
    }
  }
}

function validatePublicPackageImports(
  rule: ManifestRecord,
  ruleId: string,
  reportViolation: (ruleId: string, importer: string, specifier: string, code: string, message: string) => void,
  context: ValidationContext
): void {
  const sourcePaths = stringArray(rule.sourcePaths);
  const packagesPath = readNonEmptyString(rule.packagesPath);
  const publicPrefix = readNonEmptyString(rule.publicPrefix);
  if (!packagesPath || !publicPrefix) {
    return;
  }
  const scannedFiles = new Set(sourcePaths.flatMap((sourcePath) => collectSources(context, sourcePath)));
  for (const importer of [...scannedFiles].sort(compareOrdinal)) {
    const analysis = analyze(context, importer);
    if (!analysis) {
      continue;
    }
    for (const sourceImport of analysis.imports) {
      let isViolation = false;
      if (sourceImport.specifier.startsWith(publicPrefix)) {
        const publicPackageName = sourceImport.specifier.slice(publicPrefix.length);
        isViolation = publicPackageName.length === 0 || publicPackageName.includes("/");
      } else {
        const resolvedPath = resolveImportRepoPath(context.rootDir, importer, sourceImport.specifier);
        const targetPackage = resolvedPath
          ? packageNameForInternalSource(resolvedPath, normalizeRepoPath(packagesPath))
          : null;
        const importerPackage = packageNameForImporter(importer, normalizeRepoPath(packagesPath));
        isViolation = targetPackage !== null && targetPackage !== importerPackage;
      }

      if (isViolation) {
        reportViolation(
          ruleId,
          importer,
          sourceImport.specifier,
          "non-public-package-import",
          `${importer} imports package internals via ${sourceImport.specifier}; use the public ${publicPrefix}<package> entry.`
        );
      }
    }
  }
}

function validateParserPolicy(
  value: unknown,
  parserEntries: readonly ManifestRecord[],
  micromarkSites: readonly ManifestRecord[],
  context: ValidationContext
): void {
  if (!isRecord(value)) {
    context.findings.push({ code: "invalid-parser-policy", message: "Manifest parserPolicy must be an object." });
    return;
  }
  const enginePath = validateExistingDirectory(
    value.enginePath,
    "parserPolicy enginePath",
    "parser-engine-path-missing",
    "parser-engine-path-not-directory",
    context
  );
  const publicEntryPath = validateExistingFile(
    value.publicEntryPath,
    "parserPolicy publicEntryPath",
    "parser-public-entry-missing",
    "parser-public-entry-not-file",
    context
  );
  const governedSourcePaths = validateStringArray(
    value.governedSourcePaths,
    "parserPolicy governedSourcePaths",
    context
  );
  for (const sourcePath of governedSourcePaths) {
    validateActiveRuleDirectory(sourcePath, "parserPolicy governed source path", context);
  }
  if (governedSourcePaths.length === 0) {
    context.findings.push({
      code: "parser-governed-source-paths-empty",
      message: "parserPolicy must govern at least one existing source directory."
    });
  }
  if (!enginePath || !publicEntryPath || governedSourcePaths.length === 0) {
    return;
  }
  if (parserEntries.length === 0) {
    context.findings.push({ code: "empty-parser-entries", message: "Parser policy must register current parser entries." });
  }
  if (micromarkSites.length === 0) {
    context.findings.push({
      code: "empty-micromark-document-sites",
      message: "Parser policy must register direct micromark document parse sites."
    });
  }

  const publicEntryAnalysis = analyze(context, publicEntryPath);
  const publicEntryEvidenceComplete = publicEntryAnalysis !== null;
  if (publicEntryAnalysis?.hasStarReExport) {
    context.findings.push({
      code: "unsupported-parser-star-export",
      message: `${publicEntryPath} uses export *, which prevents exact parser entry validation.`,
      path: publicEntryPath
    });
  }
  if (publicEntryAnalysis?.hasDefaultOrExportAssignment) {
    context.findings.push({
      code: "unsupported-parser-export-assignment",
      message: `${publicEntryPath} uses a default or export assignment, which prevents exact parser entry validation.`,
      path: publicEntryPath
    });
  }

  const publicExports = new Map<string, string>();
  for (const symbol of publicEntryAnalysis?.exportedSymbols ?? []) {
    publicExports.set(symbol, publicEntryPath);
  }
  for (const reExport of publicEntryAnalysis?.reExports ?? []) {
    if (reExport.specifier) {
      publicExports.set(
        reExport.exportedName,
        resolveSourceModulePath(context.rootDir, publicEntryPath, reExport.specifier) ?? publicEntryPath
      );
    }
  }

  const registeredParserKeys = new Set<string>();
  const publicParserSymbols = new Set<string>();
  for (const entry of parserEntries) {
    validateParserEntry(
      entry,
      publicExports,
      publicEntryEvidenceComplete,
      registeredParserKeys,
      publicParserSymbols,
      context
    );
  }

  const reExportedNames = new Set<string>();
  for (const reExport of publicEntryAnalysis?.reExports ?? []) {
    if (!reExport.specifier) {
      continue;
    }
    reExportedNames.add(reExport.exportedName);
    const sourceModule = resolveSourceModulePath(context.rootDir, publicEntryPath, reExport.specifier);
    if (!sourceModule) {
      continue;
    }
    const importsRegisteredParser = registeredParserKeys.has(parserKey(sourceModule, reExport.importedName));
    const importsParserNamedSymbol = reExport.importedName.startsWith("parse");
    const exportsParserNamedSurface = reExport.exportedName.startsWith("parse");
    const isExactRegisteredPublicExport =
      reExport.exportedName === reExport.importedName &&
      publicParserSymbols.has(reExport.exportedName) &&
      publicExports.get(reExport.exportedName) === sourceModule;
    if (
      (importsRegisteredParser || importsParserNamedSymbol || exportsParserNamedSurface) &&
      !isExactRegisteredPublicExport
    ) {
      context.findings.push({
        code: "unregistered-public-parser",
        message: `${publicEntryPath} re-exports ${reExport.importedName} as unregistered parser surface ${reExport.exportedName}.`,
        path: publicEntryPath
      });
    }
  }

  for (const [symbol] of publicExports) {
    if (!reExportedNames.has(symbol) && symbol.startsWith("parse") && !publicParserSymbols.has(symbol)) {
      context.findings.push({
        code: "unregistered-public-parser",
        message: `${publicEntryPath} publicly exports unregistered parser ${symbol}.`,
        path: publicEntryPath
      });
    }
  }

  const engineFiles = collectSources(context, enginePath);
  for (const path of engineFiles) {
    if (path === publicEntryPath) {
      continue;
    }
    const analysis = analyze(context, path);
    if (!analysis) {
      continue;
    }
    for (const symbol of analysis.exportedSymbols) {
      if (symbol.startsWith("parse") && !registeredParserKeys.has(parserKey(path, symbol))) {
        context.findings.push({
          code: "unregistered-document-parser-export",
          message: `${path} exports document parser ${symbol} without a parser registry entry.`,
          path
        });
      }
    }
  }

  const governedFiles = [
    ...new Set(governedSourcePaths.flatMap((sourcePath) => collectSources(context, sourcePath)))
  ].sort(compareOrdinal);
  validateMicromarkDocumentSites(governedFiles, micromarkSites, context);
}

function validateParserEntry(
  entry: ManifestRecord,
  publicExports: ReadonlyMap<string, string>,
  publicEntryEvidenceComplete: boolean,
  registeredParserKeys: Set<string>,
  publicParserSymbols: Set<string>,
  context: ValidationContext
): void {
  const id = readNonEmptyString(entry.id) ?? "<missing-id>";
  const module = validateManifestPath(entry.module, `parser ${id} module`, context);
  const symbol = readNonEmptyString(entry.symbol);
  const visibility = readNonEmptyString(entry.visibility);
  if (!module || !symbol || !visibility || !supportedParserVisibilities.has(visibility)) {
    context.findings.push({
      code: "invalid-parser-entry",
      message: `Parser ${id} must declare module, symbol, and supported visibility.`,
      path: module ?? undefined
    });
    return;
  }
  if (!readNonEmptyString(entry.role) || !readNonEmptyString(entry.scope)) {
    context.findings.push({
      code: "invalid-parser-entry",
      message: `Parser ${id} must declare role and scope.`,
      path: module
    });
  }
  registeredParserKeys.add(parserKey(module, symbol));
  if (visibility === "public") {
    publicParserSymbols.add(symbol);
  }

  const lifecycle = readLifecycle(entry.lifecycle, id, context);
  if (!lifecycle) {
    return;
  }
  const moduleInspection = inspectRepositoryPath(context.rootDir, module);
  let moduleAnalysis: SourceModuleAnalysis | null = null;
  if (moduleInspection.kind === "file") {
    moduleAnalysis = analyze(context, module);
  } else if (moduleInspection.kind === "error") {
    reportFilesystemAccessError(`parser ${id} module`, module, moduleInspection.errorCode, context);
  } else if (moduleInspection.kind !== "missing") {
    context.findings.push({
      code: "parser-module-not-file",
      message: `Parser ${id} module must be a readable file: ${module}.`,
      path: module
    });
  } else if (lifecycle === "present" || lifecycle === "present-until") {
    context.findings.push({
      code: "parser-module-missing",
      message: `Parser ${id} requires a module file at ${module}.`,
      path: module
    });
  }
  const moduleEvidenceComplete = moduleInspection.kind === "file" && moduleAnalysis !== null;
  const moduleExportsSymbol = moduleAnalysis?.exportedSymbols.has(symbol) ?? false;
  const moduleDeclaresSymbol = moduleAnalysis?.declaredSymbols.has(symbol) ?? false;
  const publicExportModule = publicExports.get(symbol);
  const isPublic = publicExportModule !== undefined;

  if (lifecycle === "present" || lifecycle === "present-until") {
    if (moduleEvidenceComplete && !moduleExportsSymbol) {
      context.findings.push({
        code: "required-parser-symbol-missing",
        message: `Parser ${id} requires exported symbol ${symbol} in ${module}.`,
        path: module
      });
    }
    if (visibility === "public" && publicEntryEvidenceComplete) {
      if (!isPublic) {
        context.findings.push({
          code: "required-public-parser-export-missing",
          message: `Parser ${id} requires ${symbol} to be exported by the public entry.`,
          path: module
        });
      } else if (publicExportModule !== module) {
        context.findings.push({
          code: "parser-public-module-mismatch",
          message: `Parser ${symbol} is publicly exported from ${publicExportModule}, expected ${module}.`,
          path: module
        });
      }
    } else if (visibility !== "public" && publicEntryEvidenceComplete && isPublic) {
      context.findings.push({
        code: "internal-parser-publicly-exported",
        message: `Internal parser ${symbol} must not be exported by the public entry.`,
        path: module
      });
    }
  } else if (lifecycle === "forbidden") {
    const forbiddenPresent = visibility === "public"
      ? publicEntryEvidenceComplete && isPublic
      : moduleEvidenceComplete && moduleExportsSymbol;
    if (forbiddenPresent) {
      context.findings.push({
        code: "forbidden-parser-symbol-present",
        message: `Forbidden parser ${id} is still present at visibility ${visibility}.`,
        path: module
      });
    }
  } else if (
    (moduleEvidenceComplete && (moduleDeclaresSymbol || moduleExportsSymbol)) ||
    (publicEntryEvidenceComplete && isPublic)
  ) {
    context.findings.push({
      code: "removed-parser-symbol-present",
      message: `Removed parser ${id} still exists in source or the public entry.`,
      path: module
    });
  }
}

function validateMicromarkDocumentSites(
  engineFiles: readonly string[],
  sites: readonly ManifestRecord[],
  context: ValidationContext
): void {
  const detectedSites = new Set<string>();
  for (const path of engineFiles) {
    const analysis = analyze(context, path);
    if (analysis?.hasMicromarkDocumentParse) {
      detectedSites.add(path);
    }
  }
  const detectionEvidenceComplete = context.sourceEvidenceComplete;
  const registeredPresentSites = new Set<string>();
  for (const site of sites) {
    const id = readNonEmptyString(site.id) ?? "<missing-id>";
    const module = validateManifestPath(site.module, `micromark site ${id} module`, context);
    const lifecycle = readLifecycle(site.lifecycle, id, context);
    if (!module || !lifecycle) {
      continue;
    }
    const detected = detectedSites.has(module);
    if (lifecycle === "present" || lifecycle === "present-until") {
      registeredPresentSites.add(module);
      if (!detected && detectionEvidenceComplete) {
        context.findings.push({
          code: "required-micromark-document-site-missing",
          message: `Registered micromark document site ${id} is no longer present and its registry entry is stale.`,
          path: module
        });
      }
    } else if (detected) {
      context.findings.push({
        code: lifecycle === "removed" ? "removed-micromark-document-site-present" : "forbidden-micromark-document-site-present",
        message: `Micromark document site ${id} violates lifecycle state ${lifecycle}.`,
        path: module
      });
    }
  }
  for (const detected of detectedSites) {
    if (!registeredPresentSites.has(detected)) {
      context.findings.push({
        code: "unregistered-micromark-document-site",
        message: `${detected} directly invokes micromark document parsing without a registry entry.`,
        path: detected
      });
    }
  }
}

function readLifecycle(value: unknown, ownerId: string, context: ValidationContext): string | null {
  if (!isRecord(value)) {
    context.findings.push({
      code: "invalid-lifecycle",
      message: `${ownerId} must declare a lifecycle object.`
    });
    return null;
  }
  const state = readNonEmptyString(value.state);
  if (!state || !supportedLifecycleStates.has(state)) {
    context.findings.push({
      code: "unknown-lifecycle-state",
      message: `${ownerId} has unsupported lifecycle state ${String(value.state)}.`
    });
    return null;
  }
  if (state === "present-until") {
    validateRetirementTask(value.retireIn, ownerId, context);
  }
  return state;
}

function validateUniqueIds(
  packages: readonly ManifestRecord[],
  rules: readonly ManifestRecord[],
  exceptions: readonly ManifestRecord[],
  parserEntries: readonly ManifestRecord[],
  micromarkSites: readonly ManifestRecord[],
  bundleChecks: readonly ManifestRecord[],
  findings: ArchitectureFinding[]
): void {
  const seen = new Set<string>();
  const register = (record: ManifestRecord, category: string): void => {
    const id = readNonEmptyString(record.id);
    if (!id) {
      findings.push({ code: "invalid-id", message: `${category} entry must declare a non-empty id.` });
      return;
    }
    if (seen.has(id)) {
      findings.push({ code: "duplicate-id", message: `Duplicate architecture manifest id: ${id}.` });
    }
    seen.add(id);
  };
  packages.forEach((record) => register(record, "package"));
  rules.forEach((record) => register(record, "rule"));
  exceptions.forEach((record) => register(record, "exception"));
  parserEntries.forEach((record) => register(record, "parser"));
  micromarkSites.forEach((record) => register(record, "micromark site"));
  bundleChecks.forEach((record) => register(record, "bundle check"));
}

function validateRetirementTask(value: unknown, ownerId: string | null, context: ValidationContext): boolean {
  const retireIn = readNonEmptyString(value);
  if (!retireIn) {
    context.findings.push({
      code: "missing-retirement-task",
      message: `${ownerId ?? "<missing-id>"} must declare a retirement task.`
    });
    return false;
  }
  if (!/^RF-\d{3}$/u.test(retireIn)) {
    context.findings.push({
      code: "invalid-retirement-task",
      message: `${ownerId ?? "<missing-id>"} retirement task must use the RF-000 format.`
    });
    return false;
  }
  if (!context.roadmapEvidence.complete) {
    return true;
  }
  if (!context.roadmapEvidence.tasks.has(retireIn)) {
    context.findings.push({
      code: "unknown-retirement-task",
      message: `${ownerId ?? "<missing-id>"} references retirement task ${retireIn}, which is absent from the roadmap.`
    });
    return false;
  }
  return true;
}

function readRoadmapTasks(
  rootDir: string,
  value: unknown,
  findings: ArchitectureFinding[]
): RoadmapTaskEvidence {
  const path = readNonEmptyString(value);
  if (!path || !isSafeManifestPath(rootDir, path)) {
    findings.push({ code: "invalid-path", message: `roadmapPath is invalid: ${String(value)}.` });
    return { complete: false, tasks: new Set() };
  }
  const inspection = inspectRepositoryPath(rootDir, path);
  if (inspection.kind === "missing") {
    findings.push({ code: "roadmap-missing", message: `Architecture roadmap is missing at ${path}.`, path });
    return { complete: false, tasks: new Set() };
  }
  if (inspection.kind === "error") {
    findings.push({
      code: "roadmap-read-error",
      message: `Architecture roadmap could not be inspected at ${path} (${inspection.errorCode}).`,
      path
    });
    return { complete: false, tasks: new Set() };
  }
  if (inspection.kind !== "file") {
    findings.push({
      code: "roadmap-not-file",
      message: `Architecture roadmap must be a readable file at ${path}.`,
      path
    });
    return { complete: false, tasks: new Set() };
  }

  const textEvidence = readRepositoryText(rootDir, path);
  if (textEvidence.kind === "unavailable") {
    findings.push({
      code: "roadmap-read-error",
      message: `Architecture roadmap could not be read at ${path} (${textEvidence.errorCode}).`,
      path
    });
    return { complete: false, tasks: new Set() };
  }
  const tasks = new Set<string>();
  for (const match of textEvidence.source.matchAll(/^####\s+(RF-\d{3}):/gmu)) {
    if (match[1]) {
      tasks.add(match[1]);
    }
  }
  return { complete: true, tasks };
}

function validateManifestPath(value: unknown, label: string, context: ValidationContext): string | null {
  const path = readNonEmptyString(value);
  if (!path || !isSafeManifestPath(context.rootDir, path)) {
    context.findings.push({
      code: "invalid-path",
      message: `${label} must be a repository-relative path that does not escape the root: ${String(value)}.`
    });
    return null;
  }
  return normalizeRepoPath(path);
}

function validateActiveRuleDirectory(value: unknown, label: string, context: ValidationContext): string | null {
  return validateExistingDirectory(
    value,
    label,
    "active-rule-path-missing",
    "active-rule-path-not-directory",
    context
  );
}

function validateExistingDirectory(
  value: unknown,
  label: string,
  missingCode: string,
  wrongKindCode: string,
  context: ValidationContext
): string | null {
  const path = validateManifestPath(value, label, context);
  if (!path) {
    return null;
  }
  const inspection = inspectRepositoryPath(context.rootDir, path);
  if (inspection.kind === "missing") {
    context.findings.push({
      code: missingCode,
      message: `${label} must exist as a directory: ${path}.`,
      path
    });
    return null;
  }
  if (inspection.kind === "error") {
    reportFilesystemAccessError(label, path, inspection.errorCode, context);
    return null;
  }
  if (inspection.kind !== "directory") {
    context.findings.push({
      code: wrongKindCode,
      message: `${label} must be a directory: ${path}.`,
      path
    });
    return null;
  }
  return path;
}

function validateExistingFile(
  value: unknown,
  label: string,
  missingCode: string,
  wrongKindCode: string,
  context: ValidationContext
): string | null {
  const path = validateManifestPath(value, label, context);
  if (!path) {
    return null;
  }
  const inspection = inspectRepositoryPath(context.rootDir, path);
  if (inspection.kind === "missing") {
    context.findings.push({
      code: missingCode,
      message: `${label} must exist as a file: ${path}.`,
      path
    });
    return null;
  }
  if (inspection.kind === "error") {
    reportFilesystemAccessError(label, path, inspection.errorCode, context);
    return null;
  }
  if (inspection.kind !== "file") {
    context.findings.push({
      code: wrongKindCode,
      message: `${label} must be a file: ${path}.`,
      path
    });
    return null;
  }
  return path;
}

function isSafeManifestPath(rootDir: string, path: string): boolean {
  if (isAbsolute(path) || hasWildcard(path)) {
    return false;
  }
  const relativePath = relative(resolve(rootDir), resolve(rootDir, path));
  return relativePath.length > 0 && !isEscapingRepoPath(relativePath);
}

function isEscapingRepoPath(path: string): boolean {
  const normalized = normalizeRepoPath(path);
  return normalized === ".." || normalized.startsWith("../") || isAbsolute(path);
}

function readRecordArray(
  manifest: ManifestRecord,
  key: string,
  findings: ArchitectureFinding[]
): ManifestRecord[] {
  const value = manifest[key];
  if (!Array.isArray(value)) {
    findings.push({ code: "invalid-manifest", message: `Manifest ${key} must be an array.` });
    return [];
  }
  const records: ManifestRecord[] = [];
  for (const item of value) {
    if (!isRecord(item)) {
      findings.push({ code: "invalid-manifest", message: `Manifest ${key} entries must be objects.` });
    } else {
      records.push(item);
    }
  }
  return records;
}

function validateStringArray(value: unknown, label: string, context: ValidationContext): string[] {
  if (!Array.isArray(value) || !value.every((entry) => readNonEmptyString(entry) !== null)) {
    context.findings.push({ code: "invalid-rule", message: `${label} must be an array of non-empty strings.` });
    return [];
  }
  return value as string[];
}

function validateRecordFields(
  record: ManifestRecord,
  allowedFields: ReadonlySet<string>,
  code: string,
  label: string,
  context: ValidationContext,
  ruleId?: string | null
): void {
  for (const field of Object.keys(record).sort(compareOrdinal)) {
    if (!allowedFields.has(field)) {
      context.findings.push({
        code,
        message: `${label} declares unsupported field ${field}.`,
        ruleId: ruleId ?? undefined
      });
    }
  }
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter(isString) : [];
}

function analyze(context: ValidationContext, path: string): SourceModuleAnalysis | null {
  if (context.analysisCache.has(path)) {
    return context.analysisCache.get(path) ?? null;
  }
  let analysis: SourceModuleAnalysis;
  try {
    analysis = analyzeSourceModule(context.rootDir, path);
  } catch (error) {
    context.sourceEvidenceComplete = false;
    context.findings.push({
      code: "source-analysis-error",
      message: `Source module ${path} could not be read or analyzed (${normalizeFilesystemError(error)}).`,
      path
    });
    context.analysisCache.set(path, null);
    return null;
  }
  for (const diagnostic of analysis.parseDiagnostics) {
    context.findings.push({
      code: "source-parse-error",
      message: `${path}:${diagnostic.line}:${diagnostic.column} TS${diagnostic.code}: ${diagnostic.message}`,
      path
    });
  }
  if (analysis.parseDiagnostics.length > 0) {
    context.sourceEvidenceComplete = false;
    context.analysisCache.set(path, null);
    return null;
  }
  context.analysisCache.set(path, analysis);
  return analysis;
}

function collectSources(context: ValidationContext, sourcePath: string): string[] {
  try {
    return collectSourceFiles(context.rootDir, sourcePath);
  } catch (error) {
    const path = normalizeRepoPath(sourcePath);
    context.sourceEvidenceComplete = false;
    if (!context.failedSourceWalkPaths.has(path)) {
      context.failedSourceWalkPaths.add(path);
      context.findings.push({
        code: "source-walk-error",
        message: `Source path ${path} could not be scanned (${normalizeFilesystemError(error)}).`,
        path
      });
    }
    return [];
  }
}

function reportFilesystemAccessError(
  label: string,
  path: string,
  errorCode: string,
  context: ValidationContext
): void {
  context.findings.push({
    code: "filesystem-access-error",
    message: `${label} could not be inspected at ${path} (${errorCode}).`,
    path
  });
}


function packagePatternMatches(pattern: string, specifier: string): boolean {
  if (pattern.endsWith("/*")) {
    return specifier.startsWith(pattern.slice(0, -1));
  }
  return specifier === pattern || specifier.startsWith(`${pattern}/`);
}

function packageNameForInternalSource(path: string, packagesPath: string): string | null {
  const prefix = `${packagesPath}/`;
  if (!path.startsWith(prefix)) {
    return null;
  }
  const remainder = path.slice(prefix.length);
  const [packageName, sourceDirectory] = remainder.split("/");
  return packageName && sourceDirectory === "src" ? packageName : null;
}

function packageNameForImporter(path: string, packagesPath: string): string | null {
  const prefix = `${packagesPath}/`;
  if (!path.startsWith(prefix)) {
    return null;
  }
  return path.slice(prefix.length).split("/")[0] ?? null;
}

function pathIsWithin(path: string, parent: string): boolean {
  return path === parent || path.startsWith(`${parent}/`);
}

function parserKey(module: string, symbol: string): string {
  return `${module}#${symbol}`;
}

function exceptionTarget(ruleId: string, importer: string, specifier: string): string {
  return `${ruleId}\0${importer}\0${specifier}`;
}

function hasWildcard(value: string): boolean {
  return /[*?[\]{}]/u.test(value);
}

function normalizeRepoPath(path: string): string {
  return path.replaceAll("\\", "/").replace(/^\.\//u, "").replace(/\/$/u, "");
}

function readNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function readStableBundleTarget(value: unknown): string | null {
  const target = readNonEmptyString(value);
  return target && /^[A-Za-z0-9@._/+*-]+$/u.test(target) ? target : null;
}

function isValidRegularExpression(value: string): boolean {
  try {
    void new RegExp(value, "u");
    return true;
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is ManifestRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: string | null): value is string {
  return value !== null;
}

function createResult(findings: ArchitectureFinding[]): EditorFoundationArchitectureResult {
  const sortedFindings = [...findings].sort((left, right) =>
    compareOrdinal(findingSortKey(left), findingSortKey(right))
  );
  return { findings: sortedFindings, ok: sortedFindings.length === 0 };
}

function findingSortKey(finding: ArchitectureFinding): string {
  return [finding.code, finding.path ?? "", finding.ruleId ?? "", finding.message].join("|");
}
