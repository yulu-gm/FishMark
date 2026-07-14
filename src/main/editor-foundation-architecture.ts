import { existsSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";

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

type ValidationContext = {
  analysisCache: Map<string, SourceModuleAnalysis>;
  findings: ArchitectureFinding[];
  roadmapTasks: ReadonlySet<string>;
  rootDir: string;
};

const supportedRuleKinds = new Set(["forbidden-imports", "public-package-entry"]);
const supportedLifecycleStates = new Set(["present", "present-until", "forbidden", "removed"]);
const supportedParserVisibilities = new Set(["public", "internal-export"]);

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

  const roadmapTasks = readRoadmapTasks(rootDir, manifest.roadmapPath, findings);
  const context: ValidationContext = {
    analysisCache: new Map(),
    findings,
    roadmapTasks,
    rootDir
  };
  const packages = readRecordArray(manifest, "packages", findings);
  const rules = readRecordArray(manifest, "rules", findings);
  const exceptions = readRecordArray(manifest, "exceptions", findings);
  const parserEntries = readRecordArray(manifest, "parserEntries", findings);
  const micromarkSites = readRecordArray(manifest, "micromarkDocumentSites", findings);

  validateUniqueIds(packages, rules, exceptions, parserEntries, micromarkSites, findings);
  const activeRules = validateRules(rules, context);
  validatePackages(packages, activeRules, context);
  const validExceptions = validateExceptions(exceptions, activeRules, context);
  validateImports(activeRules, validExceptions, context);
  validateParserPolicy(manifest.parserPolicy, parserEntries, micromarkSites, context);

  return createResult(findings);
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
      validateTemporaryAllowances(rule.temporaryAllowedPackages, id, context);
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
  const activeRuleIds = new Set(activeRules.map((rule) => readNonEmptyString(rule.id)).filter(isString));
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

    const exists = existsSync(resolve(context.rootDir, path));
    if (state === "active") {
      if (!exists) {
        context.findings.push({
          code: "active-package-missing",
          message: `Active package ${id} is missing at ${path}.`,
          path
        });
      }
      if (!boundaryRuleId || !activeRuleIds.has(boundaryRuleId)) {
        context.findings.push({
          code: "package-boundary-rule-missing",
          message: `Active package ${id} must reference an active boundary rule.`,
          path,
          ruleId: boundaryRuleId ?? undefined
        });
      }
    } else if (state === "planned") {
      if (exists) {
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

function validateTemporaryAllowances(value: unknown, ruleId: string | null, context: ValidationContext): void {
  if (value === undefined) {
    return;
  }
  if (!Array.isArray(value)) {
    context.findings.push({
      code: "invalid-temporary-allowance",
      message: `Rule ${ruleId ?? "<missing-id>"} temporaryAllowedPackages must be an array.`,
      ruleId: ruleId ?? undefined
    });
    return;
  }
  for (const allowance of value) {
    const allowanceId = isRecord(allowance) ? readNonEmptyString(allowance.id) : null;
    if (
      !isRecord(allowance) ||
      !allowanceId ||
      !readNonEmptyString(allowance.package) ||
      !readNonEmptyString(allowance.owner) ||
      !readNonEmptyString(allowance.reason)
    ) {
      context.findings.push({
        code: "invalid-temporary-allowance",
        message: `Rule ${ruleId ?? "<missing-id>"} has a malformed temporary package allowance.`,
        ruleId: ruleId ?? undefined
      });
      continue;
    }
    validateRetirementTask(allowance.retireIn, allowanceId, context);
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
  const usedExceptionIds = new Set<string>();
  const reportViolation = (ruleId: string, importer: string, specifier: string, code: string, message: string): void => {
    const exception = exceptionsByTarget.get(exceptionTarget(ruleId, importer, specifier));
    if (exception) {
      usedExceptionIds.add(exception.id);
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

  for (const exception of exceptions) {
    if (!usedExceptionIds.has(exception.id)) {
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
  for (const importer of collectSourceFiles(context.rootDir, sourcePath)) {
    for (const sourceImport of analyze(context, importer).imports) {
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
  const scannedFiles = new Set(sourcePaths.flatMap((sourcePath) => collectSourceFiles(context.rootDir, sourcePath)));
  for (const importer of [...scannedFiles].sort((left, right) => left.localeCompare(right))) {
    for (const sourceImport of analyze(context, importer).imports) {
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
  const enginePath = validateManifestPath(value.enginePath, "parserPolicy enginePath", context);
  const publicEntryPath = validateManifestPath(value.publicEntryPath, "parserPolicy publicEntryPath", context);
  const governedSourcePaths = validateStringArray(
    value.governedSourcePaths,
    "parserPolicy governedSourcePaths",
    context
  );
  for (const sourcePath of governedSourcePaths) {
    validateActiveRuleDirectory(sourcePath, "parserPolicy governed source path", context);
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

  const publicEntryAnalysis = existsSync(resolve(context.rootDir, publicEntryPath))
    ? analyze(context, publicEntryPath)
    : null;
  if (!publicEntryAnalysis) {
    context.findings.push({
      code: "parser-public-entry-missing",
      message: `Parser public entry is missing at ${publicEntryPath}.`,
      path: publicEntryPath
    });
    return;
  }
  if (publicEntryAnalysis.hasStarReExport) {
    context.findings.push({
      code: "unsupported-parser-star-export",
      message: `${publicEntryPath} uses export *, which prevents exact parser entry validation.`,
      path: publicEntryPath
    });
  }

  const publicExports = new Map<string, string>();
  for (const symbol of publicEntryAnalysis.exportedSymbols) {
    publicExports.set(symbol, publicEntryPath);
  }
  for (const reExport of publicEntryAnalysis.reExports) {
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
    validateParserEntry(entry, publicExports, registeredParserKeys, publicParserSymbols, context);
  }

  const reExportedNames = new Set<string>();
  for (const reExport of publicEntryAnalysis.reExports) {
    reExportedNames.add(reExport.exportedName);
    if (!reExport.specifier) {
      continue;
    }
    const sourceModule = resolveSourceModulePath(context.rootDir, publicEntryPath, reExport.specifier);
    if (!sourceModule) {
      continue;
    }
    const importsRegisteredParser = registeredParserKeys.has(parserKey(sourceModule, reExport.importedName));
    const importsParserNamedSymbol = reExport.importedName.startsWith("parse");
    const isExactRegisteredPublicExport =
      reExport.exportedName === reExport.importedName &&
      publicParserSymbols.has(reExport.exportedName) &&
      publicExports.get(reExport.exportedName) === sourceModule;
    if ((importsRegisteredParser || importsParserNamedSymbol) && !isExactRegisteredPublicExport) {
      context.findings.push({
        code: "unregistered-public-parser",
        message: `${publicEntryPath} re-exports parser ${reExport.importedName} as unregistered public surface ${reExport.exportedName}.`,
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

  const engineFiles = collectSourceFiles(context.rootDir, enginePath);
  for (const path of engineFiles) {
    if (path === publicEntryPath) {
      continue;
    }
    for (const symbol of analyze(context, path).exportedSymbols) {
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
    ...new Set(governedSourcePaths.flatMap((sourcePath) => collectSourceFiles(context.rootDir, sourcePath)))
  ].sort((left, right) => left.localeCompare(right));
  validateMicromarkDocumentSites(governedFiles, micromarkSites, context);
}

function validateParserEntry(
  entry: ManifestRecord,
  publicExports: ReadonlyMap<string, string>,
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
  const moduleExists = existsSync(resolve(context.rootDir, module));
  const moduleAnalysis = moduleExists ? analyze(context, module) : null;
  const moduleExportsSymbol = moduleAnalysis?.exportedSymbols.has(symbol) ?? false;
  const moduleDeclaresSymbol = moduleAnalysis?.declaredSymbols.has(symbol) ?? false;
  const publicExportModule = publicExports.get(symbol);
  const isPublic = publicExportModule !== undefined;

  if (lifecycle === "present" || lifecycle === "present-until") {
    if (!moduleExportsSymbol) {
      context.findings.push({
        code: "required-parser-symbol-missing",
        message: `Parser ${id} requires exported symbol ${symbol} in ${module}.`,
        path: module
      });
    }
    if (visibility === "public") {
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
    } else if (isPublic) {
      context.findings.push({
        code: "internal-parser-publicly-exported",
        message: `Internal parser ${symbol} must not be exported by the public entry.`,
        path: module
      });
    }
  } else if (lifecycle === "forbidden") {
    const forbiddenPresent = visibility === "public" ? isPublic : moduleExportsSymbol;
    if (forbiddenPresent) {
      context.findings.push({
        code: "forbidden-parser-symbol-present",
        message: `Forbidden parser ${id} is still present at visibility ${visibility}.`,
        path: module
      });
    }
  } else if (moduleDeclaresSymbol || moduleExportsSymbol || isPublic) {
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
  const detectedSites = new Set(
    engineFiles.filter((path) => analyze(context, path).hasMicromarkDocumentParse)
  );
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
      if (!detected) {
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
  rules.forEach((record) => {
    register(record, "rule");
    if (Array.isArray(record.temporaryAllowedPackages)) {
      for (const allowance of record.temporaryAllowedPackages) {
        if (isRecord(allowance)) {
          register(allowance, "temporary allowance");
        }
      }
    }
  });
  exceptions.forEach((record) => register(record, "exception"));
  parserEntries.forEach((record) => register(record, "parser"));
  micromarkSites.forEach((record) => register(record, "micromark site"));
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
  if (!context.roadmapTasks.has(retireIn)) {
    context.findings.push({
      code: "unknown-retirement-task",
      message: `${ownerId ?? "<missing-id>"} references retirement task ${retireIn}, which is absent from the roadmap.`
    });
    return false;
  }
  return true;
}

function readRoadmapTasks(rootDir: string, value: unknown, findings: ArchitectureFinding[]): Set<string> {
  const path = readNonEmptyString(value);
  if (!path || !isSafeManifestPath(rootDir, path)) {
    findings.push({ code: "invalid-path", message: `roadmapPath is invalid: ${String(value)}.` });
    return new Set();
  }
  const absolutePath = resolve(rootDir, path);
  if (!existsSync(absolutePath)) {
    findings.push({ code: "roadmap-missing", message: `Architecture roadmap is missing at ${path}.`, path });
    return new Set();
  }
  const tasks = new Set<string>();
  for (const match of readFileSync(absolutePath, "utf8").matchAll(/^####\s+(RF-\d{3}):/gmu)) {
    if (match[1]) {
      tasks.add(match[1]);
    }
  }
  return tasks;
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
  const path = validateManifestPath(value, label, context);
  if (!path) {
    return null;
  }
  const absolutePath = resolve(context.rootDir, path);
  if (!existsSync(absolutePath)) {
    context.findings.push({
      code: "active-rule-path-missing",
      message: `${label} must exist while its rule is active: ${path}.`,
      path
    });
  } else if (!statSync(absolutePath).isDirectory()) {
    context.findings.push({
      code: "active-rule-path-not-directory",
      message: `${label} must be a directory while its rule is active: ${path}.`,
      path
    });
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

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter(isString) : [];
}

function analyze(context: ValidationContext, path: string): SourceModuleAnalysis {
  const cached = context.analysisCache.get(path);
  if (cached) {
    return cached;
  }
  const analysis = analyzeSourceModule(context.rootDir, path);
  context.analysisCache.set(path, analysis);
  return analysis;
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

function isRecord(value: unknown): value is ManifestRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: string | null): value is string {
  return value !== null;
}

function createResult(findings: ArchitectureFinding[]): EditorFoundationArchitectureResult {
  const sortedFindings = [...findings].sort((left, right) =>
    findingSortKey(left).localeCompare(findingSortKey(right))
  );
  return { findings: sortedFindings, ok: sortedFindings.length === 0 };
}

function findingSortKey(finding: ArchitectureFinding): string {
  return [finding.code, finding.path ?? "", finding.ruleId ?? "", finding.message].join("|");
}
