import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, relative, resolve } from "node:path";

import ts from "typescript";

import { compareOrdinal } from "./editor-foundation-order";

export type SourceImport = {
  kind: "dynamic-import" | "import" | "import-equals" | "import-type" | "re-export" | "require-call";
  specifier: string;
};

export type SourceReExport = {
  exportedName: string;
  importedName: string;
  specifier: string | null;
};

export type SourceParseDiagnostic = {
  code: number;
  column: number;
  line: number;
  message: string;
  offset: number;
};

export type SourceModuleAnalysis = {
  declaredSymbols: ReadonlySet<string>;
  exportedSymbols: ReadonlySet<string>;
  hasDefaultOrExportAssignment: boolean;
  hasMicromarkDocumentParse: boolean;
  hasStarReExport: boolean;
  imports: readonly SourceImport[];
  parseDiagnostics: readonly SourceParseDiagnostic[];
  reExports: readonly SourceReExport[];
};

export type CompleteInterfaceBuilderAnalysis = {
  ambiguousCanonicalBuilderReturns: number;
  canonicalBuilderDeclarations: number;
  interfaceConstructions: number;
  objectSpreadsInCanonicalBuilder: number;
  partialInterfaceCompositions: number;
  unsafeInterfaceAssertions: number;
};

type MicromarkBindingSource = "namespace" | "parse";

const sourceFilePattern = /\.(?:[cm]?[jt]sx?)$/iu;

export function collectSourceFiles(rootDir: string, sourcePath: string): string[] {
  const absoluteSourcePath = resolve(rootDir, sourcePath);
  if (statSync(absoluteSourcePath).isFile()) {
    return sourceFilePattern.test(absoluteSourcePath) ? [toRepoPath(rootDir, absoluteSourcePath)] : [];
  }

  const files: string[] = [];
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((left, right) =>
      compareOrdinal(left.name, right.name)
    )) {
      const absolutePath = resolve(directory, entry.name);
      if (entry.isDirectory()) {
        visit(absolutePath);
      } else if (entry.isFile() && sourceFilePattern.test(entry.name)) {
        files.push(toRepoPath(rootDir, absolutePath));
      }
    }
  };

  visit(absoluteSourcePath);
  return files.sort(compareOrdinal);
}

export function analyzeSourceModule(rootDir: string, path: string): SourceModuleAnalysis {
  const source = readFileSync(resolve(rootDir, path), "utf8");
  const sourceFile = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, scriptKindForPath(path));
  const parseDiagnostics = normalizeParseDiagnostics(sourceFile);
  const declaredSymbols = new Set<string>();
  const exportedSymbols = new Set<string>();
  const imports: SourceImport[] = [];
  const reExports: SourceReExport[] = [];
  const importedBindings = new Map<string, { importedName: string; specifier: string }>();
  const micromarkParseAliases = new Set<string>();
  const micromarkNamespaceAliases = new Set<string>();
  const micromarkParserVariables = new Set<string>();
  let hasDefaultOrExportAssignment = false;
  let hasStarReExport = false;

  for (const statement of sourceFile.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !isStringLiteralLike(statement.moduleSpecifier) ||
      !statement.importClause?.namedBindings ||
      !ts.isNamedImports(statement.importClause.namedBindings)
    ) {
      continue;
    }
    for (const element of statement.importClause.namedBindings.elements) {
      importedBindings.set(element.name.text, {
        importedName: (element.propertyName ?? element.name).text,
        specifier: statement.moduleSpecifier.text
      });
    }
  }

  for (const statement of sourceFile.statements) {
    if (
      ts.isExportAssignment(statement) ||
      (ts.canHaveModifiers(statement) &&
        (ts.getModifiers(statement)?.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword) ?? false))
    ) {
      hasDefaultOrExportAssignment = true;
    }
    if (ts.isImportDeclaration(statement) && isStringLiteralLike(statement.moduleSpecifier)) {
      imports.push({ kind: "import", specifier: statement.moduleSpecifier.text });
      if (statement.moduleSpecifier.text === "micromark") {
        const importClause = statement.importClause;
        const bindings = importClause?.namedBindings;
        if (bindings && ts.isNamedImports(bindings)) {
          for (const element of bindings.elements) {
            if ((element.propertyName ?? element.name).text === "parse") {
              micromarkParseAliases.add(element.name.text);
            }
          }
        } else if (bindings && ts.isNamespaceImport(bindings)) {
          micromarkNamespaceAliases.add(bindings.name.text);
        }
      }
      continue;
    }

    if (ts.isExportDeclaration(statement)) {
      const specifier = statement.moduleSpecifier && isStringLiteralLike(statement.moduleSpecifier)
        ? statement.moduleSpecifier.text
        : null;
      if (specifier !== null) {
        imports.push({ kind: "re-export", specifier });
      }

      if (!statement.exportClause) {
        if (specifier !== null) {
          hasStarReExport = true;
        }
        continue;
      }

      if (ts.isNamedExports(statement.exportClause)) {
        for (const element of statement.exportClause.elements) {
          const exportedName = element.name.text;
          if (exportedName === "default") {
            hasDefaultOrExportAssignment = true;
          }
          const localName = (element.propertyName ?? element.name).text;
          const importedBinding = specifier === null ? importedBindings.get(localName) : undefined;
          exportedSymbols.add(exportedName);
          reExports.push({
            exportedName,
            importedName: importedBinding?.importedName ?? localName,
            specifier: specifier ?? importedBinding?.specifier ?? null
          });
        }
      } else if (ts.isNamespaceExport(statement.exportClause)) {
        hasStarReExport = true;
      }
      continue;
    }

    collectTopLevelDeclarations(statement, declaredSymbols, exportedSymbols);
  }

  const visit = (node: ts.Node): void => {
    if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference) &&
      isStringLiteralLike(node.moduleReference.expression)
    ) {
      const specifier = node.moduleReference.expression.text;
      imports.push({ kind: "import-equals", specifier });
      if (specifier === "micromark") {
        micromarkNamespaceAliases.add(node.name.text);
      }
    }

    if (
      ts.isImportTypeNode(node) &&
      ts.isLiteralTypeNode(node.argument) &&
      isStringLiteralLike(node.argument.literal)
    ) {
      imports.push({ kind: "import-type", specifier: node.argument.literal.text });
    }

    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length >= 1
    ) {
      const specifier = readTransparentStringLiteral(node.arguments[0]);
      if (specifier !== null) {
        imports.push({ kind: "dynamic-import", specifier });
      }
    }

    // Without a type checker, a locally shadowed CommonJS loader cannot be
    // distinguished from Node dependency loading reliably. Literal calls are
    // treated conservatively as dependency evidence; non-literal calls are ignored.
    if (ts.isCallExpression(node) && node.arguments.length === 1) {
      const callee = unwrapTransparentExpression(node.expression);
      if (ts.isIdentifier(callee) && callee.text === "require") {
        const specifier = readTransparentStringLiteral(node.arguments[0]);
        if (specifier !== null) {
          imports.push({ kind: "require-call", specifier });
        }
      }
    }

    if (ts.isVariableDeclaration(node) && node.initializer) {
      const bindingSource = classifyMicromarkBindingSource(
        node.initializer,
        micromarkParseAliases,
        micromarkNamespaceAliases
      );
      if (bindingSource) {
        collectMicromarkBinding(
          node.name,
          bindingSource,
          micromarkParseAliases,
          micromarkNamespaceAliases
        );
      }
    }

    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      isMicromarkParseCall(node.initializer, micromarkParseAliases, micromarkNamespaceAliases)
    ) {
      micromarkParserVariables.add(node.name.text);
    }

    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  let hasMicromarkDocumentParse = false;
  const findDocumentParse = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const documentAccess = readStaticPropertyAccess(unwrapTransparentExpression(node.expression));
      const receiver = documentAccess
        ? unwrapTransparentExpression(documentAccess.receiver)
        : null;
      if (
        documentAccess?.name === "document" &&
        receiver !== null &&
        ((ts.isCallExpression(receiver) &&
          isMicromarkParseCall(receiver, micromarkParseAliases, micromarkNamespaceAliases)) ||
          (ts.isIdentifier(receiver) && micromarkParserVariables.has(receiver.text)))
      ) {
        hasMicromarkDocumentParse = true;
      }
    }
    ts.forEachChild(node, findDocumentParse);
  };
  findDocumentParse(sourceFile);

  return {
    declaredSymbols,
    exportedSymbols,
    hasDefaultOrExportAssignment,
    hasMicromarkDocumentParse,
    hasStarReExport,
    imports: imports.sort((left, right) =>
      compareOrdinal([left.kind, left.specifier].join("|"), [right.kind, right.specifier].join("|"))
    ),
    parseDiagnostics,
    reExports: reExports.sort((left, right) => compareOrdinal(left.exportedName, right.exportedName))
  };
}

export function analyzeCompleteInterfaceBuilders(
  rootDir: string,
  paths: readonly string[],
  interfacePath: string,
  interfaceName: string,
  builderName: string
): ReadonlyMap<string, CompleteInterfaceBuilderAnalysis> {
  const absoluteInterfacePath = resolve(rootDir, interfacePath);
  const absolutePaths = [...new Set([...paths, interfacePath])].map((path) => resolve(rootDir, path));
  const program = ts.createProgram({
    rootNames: absolutePaths,
    options: {
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      skipLibCheck: true,
      target: ts.ScriptTarget.Latest
    }
  });
  const checker = program.getTypeChecker();
  const interfaceSource = program.getSourceFile(absoluteInterfacePath);
  if (!interfaceSource) {
    throw new Error(`Interface source could not be resolved: ${interfacePath}`);
  }
  const targetSymbol = findExportedTypeSymbol(interfaceSource, interfaceName, checker);
  if (!targetSymbol) {
    throw new Error(`Interface symbol could not be resolved: ${interfacePath}#${interfaceName}`);
  }

  const analyses = new Map<string, CompleteInterfaceBuilderAnalysis>();
  for (const path of paths) {
    const sourceFile = program.getSourceFile(resolve(rootDir, path));
    if (!sourceFile) {
      throw new Error(`Source file could not be resolved: ${path}`);
    }
    analyses.set(path, analyzeProgramSourceFile(sourceFile, checker, targetSymbol, builderName));
  }
  return analyses;
}

function analyzeProgramSourceFile(
  sourceFile: ts.SourceFile,
  checker: ts.TypeChecker,
  targetSymbol: ts.Symbol,
  builderName: string
): CompleteInterfaceBuilderAnalysis {
  const canonicalBuilderNodes = new Set<RuntimeFunctionLike>();
  const interfaceConstructionNodes = new Set<ts.Node>();
  const returnedEvidenceOwners = new Map<ts.Node, RuntimeFunctionLike>();
  const returnedLocalOwners = new Map<ts.VariableDeclaration, RuntimeFunctionLike>();
  const returnAnalyses = new Map<RuntimeFunctionLike, RuntimeFunctionReturnAnalysis>();
  let partialInterfaceCompositions = 0;
  let unsafeInterfaceAssertions = 0;

  const collectFunctions = (node: ts.Node): void => {
    if (isRuntimeFunctionLike(node)) {
      const returnAnalysis = analyzeRuntimeFunctionReturn(node, checker);
      returnAnalyses.set(node, returnAnalysis);
      const hasDeclaredTarget = typeReferencesTarget(node.type, checker, targetSymbol) ||
        contextualFunctionTypeReturnsTarget(node, checker, targetSymbol);
      const hasReturnedTarget = [...returnAnalysis.typeEvidence].some((evidence) =>
        typeReferencesTarget(evidence.type, checker, targetSymbol)
      ) || [...returnAnalysis.localDeclarations].some((declaration) =>
        typeReferencesTarget(declaration.type, checker, targetSymbol)
      );
      if (hasDeclaredTarget || hasReturnedTarget) {
        interfaceConstructionNodes.add(node);
        for (const evidence of returnAnalysis.typeEvidence) {
          returnedEvidenceOwners.set(evidence, node);
        }
        for (const declaration of returnAnalysis.localDeclarations) {
          returnedLocalOwners.set(declaration, node);
        }
        if (readFunctionLikeName(node) === builderName) {
          canonicalBuilderNodes.add(node);
        }
      }
    }
    ts.forEachChild(node, collectFunctions);
  };
  collectFunctions(sourceFile);

  const visit = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && node.initializer) {
      if (
        typeReferencesTarget(node.type, checker, targetSymbol) &&
        !(node.type && ts.isFunctionTypeNode(node.type))
      ) {
        interfaceConstructionNodes.add(returnedLocalOwners.get(node) ?? node);
      }
      if (
        node.type &&
        ts.isFunctionTypeNode(node.type) &&
        typeReferencesTarget(node.type.type, checker, targetSymbol)
      ) {
        const initializer = unwrapTransparentExpression(node.initializer);
        const construction = isRuntimeFunctionLike(initializer) ? initializer : node;
        interfaceConstructionNodes.add(construction);
        if (isRuntimeFunctionLike(initializer) && readFunctionLikeName(initializer) === builderName) {
          canonicalBuilderNodes.add(initializer);
        }
      }
    }
    if (ts.isSatisfiesExpression(node) && typeReferencesTarget(node.type, checker, targetSymbol)) {
      interfaceConstructionNodes.add(
        returnedEvidenceOwners.get(node) ?? findRuntimeConstructionOwner(node)
      );
    }
    if (
      (ts.isAsExpression(node) || ts.isTypeAssertionExpression(node)) &&
      typeReferencesTarget(node.type, checker, targetSymbol)
    ) {
      interfaceConstructionNodes.add(
        returnedEvidenceOwners.get(node) ?? findRuntimeConstructionOwner(node)
      );
      unsafeInterfaceAssertions += 1;
    }
    if (ts.isTypeReferenceNode(node) && typeIsPartialTarget(node, checker, targetSymbol)) {
      partialInterfaceCompositions += 1;
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  let objectSpreadsInCanonicalBuilder = 0;
  let ambiguousCanonicalBuilderReturns = 0;
  for (const builder of canonicalBuilderNodes) {
    const returnAnalysis = returnAnalyses.get(builder);
    if (!returnAnalysis || returnAnalysis.ambiguous || !returnAnalysis.objectLiteral) {
      ambiguousCanonicalBuilderReturns += 1;
      continue;
    }
    objectSpreadsInCanonicalBuilder += returnAnalysis.objectLiteral.properties.filter(
      ts.isSpreadAssignment
    ).length;
  }

  return {
    ambiguousCanonicalBuilderReturns,
    canonicalBuilderDeclarations: canonicalBuilderNodes.size,
    interfaceConstructions: interfaceConstructionNodes.size,
    objectSpreadsInCanonicalBuilder,
    partialInterfaceCompositions,
    unsafeInterfaceAssertions
  };
}

type TargetTypeEvidence = ts.AsExpression | ts.SatisfiesExpression | ts.TypeAssertion;

type RuntimeFunctionReturnAnalysis = {
  ambiguous: boolean;
  localDeclarations: ReadonlySet<ts.VariableDeclaration>;
  objectLiteral: ts.ObjectLiteralExpression | null;
  typeEvidence: ReadonlySet<TargetTypeEvidence>;
};

function analyzeRuntimeFunctionReturn(
  builder: RuntimeFunctionLike,
  checker: ts.TypeChecker
): RuntimeFunctionReturnAnalysis {
  const returnedExpressions: ts.Expression[] = [];
  let hasEmptyReturn = false;
  if (ts.isBlock(builder.body)) {
    const visit = (node: ts.Node): void => {
      if (node !== builder.body && isRuntimeFunctionLike(node)) {
        return;
      }
      if (ts.isReturnStatement(node)) {
        if (node.expression) {
          returnedExpressions.push(node.expression);
        } else {
          hasEmptyReturn = true;
        }
        return;
      }
      ts.forEachChild(node, visit);
    };
    visit(builder.body);
  } else {
    returnedExpressions.push(builder.body);
  }

  if (hasEmptyReturn || returnedExpressions.length !== 1) {
    return {
      ambiguous: true,
      localDeclarations: new Set(),
      objectLiteral: null,
      typeEvidence: new Set()
    };
  }
  return resolveReturnedExpression(returnedExpressions[0]!, builder, checker, new Set());
}

function resolveReturnedExpression(
  expression: ts.Expression,
  builder: RuntimeFunctionLike,
  checker: ts.TypeChecker,
  seenSymbols: Set<ts.Symbol>
): RuntimeFunctionReturnAnalysis {
  const typeEvidence = new Set<TargetTypeEvidence>();
  let candidate = expression;
  while (
    ts.isAwaitExpression(candidate) ||
    ts.isParenthesizedExpression(candidate) ||
    ts.isAsExpression(candidate) ||
    ts.isTypeAssertionExpression(candidate) ||
    ts.isNonNullExpression(candidate) ||
    ts.isSatisfiesExpression(candidate)
  ) {
    if (
      ts.isAsExpression(candidate) ||
      ts.isTypeAssertionExpression(candidate) ||
      ts.isSatisfiesExpression(candidate)
    ) {
      typeEvidence.add(candidate);
    }
    candidate = candidate.expression;
  }

  if (ts.isObjectLiteralExpression(candidate)) {
    return {
      ambiguous: false,
      localDeclarations: new Set(),
      objectLiteral: candidate,
      typeEvidence
    };
  }
  if (!ts.isIdentifier(candidate)) {
    return {
      ambiguous: true,
      localDeclarations: new Set(),
      objectLiteral: null,
      typeEvidence
    };
  }

  const referencedSymbol = checker.getSymbolAtLocation(candidate);
  if (!referencedSymbol) {
    return {
      ambiguous: true,
      localDeclarations: new Set(),
      objectLiteral: null,
      typeEvidence
    };
  }
  const symbol = resolveAliasedSymbol(referencedSymbol, checker);
  if (seenSymbols.has(symbol)) {
    return {
      ambiguous: true,
      localDeclarations: new Set(),
      objectLiteral: null,
      typeEvidence
    };
  }
  seenSymbols.add(symbol);
  const declarations = (symbol.declarations ?? []).filter(ts.isVariableDeclaration);
  const declaration = declarations.length === 1 ? declarations[0] : undefined;
  if (
    !declaration?.initializer ||
    !isConstVariableDeclaration(declaration) ||
    findOwningRuntimeFunction(declaration) !== builder ||
    declaration.pos >= expression.pos ||
    isSymbolReassignedInBuilder(symbol, builder, checker)
  ) {
    return {
      ambiguous: true,
      localDeclarations: new Set(),
      objectLiteral: null,
      typeEvidence
    };
  }

  const resolved = resolveReturnedExpression(declaration.initializer, builder, checker, seenSymbols);
  return {
    ambiguous: resolved.ambiguous,
    localDeclarations: new Set([declaration, ...resolved.localDeclarations]),
    objectLiteral: resolved.objectLiteral,
    typeEvidence: new Set([...typeEvidence, ...resolved.typeEvidence])
  };
}

function contextualFunctionTypeReturnsTarget(
  node: RuntimeFunctionLike,
  checker: ts.TypeChecker,
  targetSymbol: ts.Symbol
): boolean {
  const parent = node.parent;
  return ts.isVariableDeclaration(parent) &&
    parent.type !== undefined &&
    ts.isFunctionTypeNode(parent.type) &&
    typeReferencesTarget(parent.type.type, checker, targetSymbol);
}

function findRuntimeConstructionOwner(node: ts.Node): ts.Node {
  let candidate: ts.Node | undefined = node.parent;
  while (candidate) {
    if (isRuntimeFunctionLike(candidate)) {
      return node;
    }
    if (ts.isVariableDeclaration(candidate) && candidate.initializer) {
      return candidate;
    }
    candidate = candidate.parent;
  }
  return node;
}

function findOwningRuntimeFunction(node: ts.Node): RuntimeFunctionLike | null {
  let candidate: ts.Node | undefined = node.parent;
  while (candidate) {
    if (isRuntimeFunctionLike(candidate)) {
      return candidate;
    }
    candidate = candidate.parent;
  }
  return null;
}

function isConstVariableDeclaration(declaration: ts.VariableDeclaration): boolean {
  return ts.isVariableDeclarationList(declaration.parent) &&
    (declaration.parent.flags & ts.NodeFlags.Const) !== 0;
}

function isSymbolReassignedInBuilder(
  symbol: ts.Symbol,
  builder: RuntimeFunctionLike,
  checker: ts.TypeChecker
): boolean {
  let reassigned = false;
  const targetContainsSymbol = (node: ts.Node): boolean => {
    if (ts.isIdentifier(node)) {
      const candidate = checker.getSymbolAtLocation(node);
      return candidate !== undefined && resolveAliasedSymbol(candidate, checker) === symbol;
    }
    return node.getChildren().some(targetContainsSymbol);
  };
  const visit = (node: ts.Node): void => {
    if (reassigned || (node !== builder.body && isRuntimeFunctionLike(node))) {
      return;
    }
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
      node.operatorToken.kind <= ts.SyntaxKind.LastAssignment &&
      targetContainsSymbol(node.left)
    ) {
      reassigned = true;
      return;
    }
    if (
      (ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) &&
      (node.operator === ts.SyntaxKind.PlusPlusToken ||
        node.operator === ts.SyntaxKind.MinusMinusToken) &&
      targetContainsSymbol(node.operand)
    ) {
      reassigned = true;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(builder.body);
  return reassigned;
}

function findExportedTypeSymbol(
  sourceFile: ts.SourceFile,
  interfaceName: string,
  checker: ts.TypeChecker
): ts.Symbol | null {
  const moduleSymbol = checker.getSymbolAtLocation(sourceFile);
  const exported = moduleSymbol
    ? checker.getExportsOfModule(moduleSymbol).find((symbol) => symbol.name === interfaceName)
    : undefined;
  return exported ? resolveAliasedSymbol(exported, checker) : null;
}

function typeReferencesTarget(
  type: ts.TypeNode | undefined,
  checker: ts.TypeChecker,
  targetSymbol: ts.Symbol,
  seen = new Set<ts.Symbol>()
): boolean {
  if (!type) {
    return false;
  }
  if (ts.isParenthesizedTypeNode(type) || ts.isTypeOperatorNode(type)) {
    return typeReferencesTarget(type.type, checker, targetSymbol, seen);
  }
  if (!ts.isTypeReferenceNode(type)) {
    return false;
  }

  const wrapperName = readEntityNameTail(type.typeName);
  if (wrapperName === "Partial" || wrapperName === "Pick") {
    return false;
  }
  if (wrapperName === "Readonly" || wrapperName === "Required") {
    return typeReferencesTarget(type.typeArguments?.[0], checker, targetSymbol, seen);
  }

  const symbolAtReference = checker.getSymbolAtLocation(type.typeName);
  if (!symbolAtReference) {
    return false;
  }
  const symbol = resolveAliasedSymbol(symbolAtReference, checker);
  if (symbol === targetSymbol) {
    return true;
  }
  if (seen.has(symbol)) {
    return false;
  }
  seen.add(symbol);
  for (const declaration of symbol.declarations ?? []) {
    if (
      ts.isTypeAliasDeclaration(declaration) &&
      typeReferencesTarget(declaration.type, checker, targetSymbol, seen)
    ) {
      return true;
    }
  }
  return false;
}

function typeIsPartialTarget(
  type: ts.TypeReferenceNode,
  checker: ts.TypeChecker,
  targetSymbol: ts.Symbol
): boolean {
  const wrapperName = readEntityNameTail(type.typeName);
  return (wrapperName === "Partial" || wrapperName === "Pick") &&
    typeReferencesTarget(type.typeArguments?.[0], checker, targetSymbol);
}

function resolveAliasedSymbol(symbol: ts.Symbol, checker: ts.TypeChecker): ts.Symbol {
  return (symbol.flags & ts.SymbolFlags.Alias) !== 0 ? checker.getAliasedSymbol(symbol) : symbol;
}

function readEntityNameTail(name: ts.EntityName): string {
  return ts.isIdentifier(name) ? name.text : name.right.text;
}

export function resolveImportRepoPath(rootDir: string, importer: string, specifier: string): string | null {
  if (specifier.startsWith(".")) {
    return toRepoPath(rootDir, resolve(rootDir, dirname(importer), specifier));
  }
  if (specifier.startsWith("src/") || specifier.startsWith("packages/") || specifier.startsWith("fixtures/")) {
    return toRepoPath(rootDir, resolve(rootDir, specifier));
  }
  return null;
}

export function resolveSourceModulePath(rootDir: string, importer: string, specifier: string): string | null {
  const unresolved = resolveImportRepoPath(rootDir, importer, specifier);
  if (!unresolved) {
    return null;
  }

  const candidates = extname(unresolved).length > 0
    ? [unresolved]
    : [`${unresolved}.ts`, `${unresolved}.tsx`, `${unresolved}.mts`, `${unresolved}.cts`, `${unresolved}/index.ts`];
  return candidates.find((candidate) => existsSync(resolve(rootDir, candidate))) ?? unresolved;
}

export function toRepoPath(rootDir: string, absolutePath: string): string {
  return relative(resolve(rootDir), resolve(absolutePath)).replaceAll("\\", "/");
}

function collectTopLevelDeclarations(
  statement: ts.Statement,
  declaredSymbols: Set<string>,
  exportedSymbols: Set<string>
): void {
  const isExported =
    ts.canHaveModifiers(statement) &&
    (ts.getModifiers(statement)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) ?? false);
  if (
    (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement) || ts.isInterfaceDeclaration(statement)) &&
    statement.name
  ) {
    declaredSymbols.add(statement.name.text);
    if (isExported) {
      exportedSymbols.add(statement.name.text);
    }
    return;
  }

  if (ts.isVariableStatement(statement)) {
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name)) {
        declaredSymbols.add(declaration.name.text);
        if (isExported) {
          exportedSymbols.add(declaration.name.text);
        }
      }
    }
  }
}

function isMicromarkParseCall(
  expression: ts.Expression,
  parseAliases: ReadonlySet<string>,
  namespaceAliases: ReadonlySet<string>
): boolean {
  const candidate = unwrapTransparentExpression(expression);
  if (!ts.isCallExpression(candidate)) {
    return false;
  }
  return isMicromarkParseReference(
    candidate.expression,
    parseAliases,
    namespaceAliases
  );
}

function classifyMicromarkBindingSource(
  expression: ts.Expression,
  parseAliases: ReadonlySet<string>,
  namespaceAliases: ReadonlySet<string>
): MicromarkBindingSource | null {
  const candidate = unwrapTransparentExpression(expression);
  if (isMicromarkModuleExpression(candidate)) {
    return "namespace";
  }
  if (isMicromarkParseReference(candidate, parseAliases, namespaceAliases)) {
    return "parse";
  }
  return ts.isIdentifier(candidate) && namespaceAliases.has(candidate.text)
    ? "namespace"
    : null;
}

function collectMicromarkBinding(
  binding: ts.BindingName,
  source: MicromarkBindingSource,
  parseAliases: Set<string>,
  namespaceAliases: Set<string>
): void {
  if (ts.isIdentifier(binding)) {
    (source === "namespace" ? namespaceAliases : parseAliases).add(binding.text);
    return;
  }
  if (source !== "namespace" || !ts.isObjectBindingPattern(binding)) {
    return;
  }

  for (const element of binding.elements) {
    if (element.dotDotDotToken || !ts.isIdentifier(element.name)) {
      continue;
    }
    const importedName = element.propertyName
      ? readStaticPropertyName(element.propertyName)
      : element.name.text;
    if (importedName === "parse") {
      parseAliases.add(element.name.text);
    }
  }
}

function isMicromarkParseReference(
  expression: ts.Expression,
  parseAliases: ReadonlySet<string>,
  namespaceAliases: ReadonlySet<string>
): boolean {
  const candidate = unwrapTransparentExpression(expression);
  if (ts.isIdentifier(candidate)) {
    return parseAliases.has(candidate.text);
  }
  const access = readStaticPropertyAccess(candidate);
  if (!access || access.name !== "parse") {
    return false;
  }

  const receiver = unwrapTransparentExpression(access.receiver);
  return (
    isMicromarkModuleExpression(receiver) ||
    (ts.isIdentifier(receiver) && namespaceAliases.has(receiver.text))
  );
}

function readStaticPropertyAccess(
  expression: ts.Expression
): { name: string; receiver: ts.Expression } | null {
  const candidate = unwrapTransparentExpression(expression);
  if (ts.isPropertyAccessExpression(candidate)) {
    return { name: candidate.name.text, receiver: candidate.expression };
  }
  if (
    ts.isElementAccessExpression(candidate) &&
    isStringLiteralLike(unwrapTransparentExpression(candidate.argumentExpression))
  ) {
    const argument = unwrapTransparentExpression(candidate.argumentExpression);
    return {
      name: (argument as ts.StringLiteralLike).text,
      receiver: candidate.expression
    };
  }
  return null;
}

function isMicromarkModuleExpression(expression: ts.Expression): boolean {
  const candidate = unwrapTransparentExpression(expression);
  if (!ts.isCallExpression(candidate) || candidate.arguments.length < 1) {
    return false;
  }
  const specifier = readTransparentStringLiteral(candidate.arguments[0]);
  if (specifier !== "micromark") {
    return false;
  }

  const callee = unwrapTransparentExpression(candidate.expression);
  return (
    callee.kind === ts.SyntaxKind.ImportKeyword ||
    (ts.isIdentifier(callee) &&
      callee.text === "require" &&
      candidate.arguments.length === 1)
  );
}

function unwrapTransparentExpression(expression: ts.Expression): ts.Expression {
  let candidate = expression;
  while (
    ts.isAwaitExpression(candidate) ||
    ts.isParenthesizedExpression(candidate) ||
    ts.isAsExpression(candidate) ||
    ts.isTypeAssertionExpression(candidate) ||
    ts.isNonNullExpression(candidate) ||
    ts.isSatisfiesExpression(candidate)
  ) {
    candidate = candidate.expression;
  }
  return candidate;
}

function readTransparentStringLiteral(expression: ts.Expression | undefined): string | null {
  if (!expression) {
    return null;
  }
  const candidate = unwrapTransparentExpression(expression);
  return isStringLiteralLike(candidate) ? candidate.text : null;
}

function readStaticPropertyName(name: ts.PropertyName): string | null {
  if (ts.isIdentifier(name) || isStringLiteralLike(name)) {
    return name.text;
  }
  if (ts.isComputedPropertyName(name)) {
    const expression = unwrapTransparentExpression(name.expression);
    return isStringLiteralLike(expression) ? expression.text : null;
  }
  return null;
}

function isStringLiteralLike(node: ts.Node | undefined): node is ts.StringLiteralLike {
  return node !== undefined && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node));
}

type RuntimeFunctionLike = (
  | ts.ArrowFunction
  | ts.FunctionDeclaration
  | ts.FunctionExpression
  | ts.GetAccessorDeclaration
  | ts.MethodDeclaration
) & { readonly body: ts.ConciseBody };

function isRuntimeFunctionLike(node: ts.Node): node is RuntimeFunctionLike {
  return (
    ts.isArrowFunction(node) ||
    ts.isFunctionExpression(node) ||
    ts.isGetAccessorDeclaration(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isFunctionDeclaration(node)
  ) && node.body !== undefined;
}

function readFunctionLikeName(node: RuntimeFunctionLike): string | null {
  if (
    (ts.isFunctionDeclaration(node) ||
      ts.isFunctionExpression(node) ||
      ts.isGetAccessorDeclaration(node) ||
      ts.isMethodDeclaration(node)) &&
    node.name
  ) {
    return readStaticPropertyName(node.name);
  }
  const parent = node.parent;
  if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) {
    return parent.name.text;
  }
  if (ts.isPropertyAssignment(parent)) {
    return readStaticPropertyName(parent.name);
  }
  return null;
}

function scriptKindForPath(path: string): ts.ScriptKind {
  if (/\.tsx$/iu.test(path)) {
    return ts.ScriptKind.TSX;
  }
  if (/\.jsx$/iu.test(path)) {
    return ts.ScriptKind.JSX;
  }
  if (/\.[cm]?js$/iu.test(path)) {
    return ts.ScriptKind.JS;
  }
  return ts.ScriptKind.TS;
}

function normalizeParseDiagnostics(sourceFile: ts.SourceFile): SourceParseDiagnostic[] {
  const diagnostics = (
    sourceFile as ts.SourceFile & { parseDiagnostics?: readonly ts.Diagnostic[] }
  ).parseDiagnostics ?? [];
  return diagnostics
    .map((diagnostic) => {
      const offset = diagnostic.start ?? 0;
      const position = sourceFile.getLineAndCharacterOfPosition(offset);
      return {
        code: diagnostic.code,
        column: position.character + 1,
        line: position.line + 1,
        message: ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
        offset
      };
    })
    .sort(
      (left, right) =>
        left.offset - right.offset ||
        left.code - right.code ||
        compareOrdinal(left.message, right.message)
    );
}
