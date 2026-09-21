import type { Parser } from "@lezer/common";

export type CodeHighlightLanguageKey =
  | "cpp"
  | "css"
  | "go"
  | "html"
  | "java"
  | "javascript"
  | "json"
  | "jsx"
  | "markdown"
  | "python"
  | "rust"
  | "tsx"
  | "typescript";

type CodeHighlightParserLoader = () => Promise<Parser>;
type CodeHighlightParserLoadedListener = () => void;

const LANGUAGE_ALIASES: Record<string, CodeHighlightLanguageKey> = {
  "c++": "cpp",
  cc: "cpp",
  cpp: "cpp",
  cxx: "cpp",
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  javascript: "javascript",
  jsx: "jsx",
  ts: "typescript",
  typescript: "typescript",
  tsx: "tsx",
  py: "python",
  python: "python",
  rust: "rust",
  rs: "rust",
  go: "go",
  golang: "go",
  java: "java",
  json: "json",
  json5: "json",
  css: "css",
  scss: "css",
  html: "html",
  htm: "html",
  xml: "html",
  svg: "html",
  vue: "html",
  md: "markdown",
  markdown: "markdown"
};

const LANGUAGE_LOADERS: Record<CodeHighlightLanguageKey, CodeHighlightParserLoader> = {
  async cpp() {
    const module = await import("@codemirror/lang-cpp");
    return module.cppLanguage.parser;
  },
  async javascript() {
    const module = await import("@codemirror/lang-javascript");
    return module.javascriptLanguage.parser;
  },
  async jsx() {
    const module = await import("@codemirror/lang-javascript");
    return module.jsxLanguage.parser;
  },
  async typescript() {
    const module = await import("@codemirror/lang-javascript");
    return module.typescriptLanguage.parser;
  },
  async tsx() {
    const module = await import("@codemirror/lang-javascript");
    return module.tsxLanguage.parser;
  },
  async python() {
    const module = await import("@codemirror/lang-python");
    return module.pythonLanguage.parser;
  },
  async rust() {
    const module = await import("@codemirror/lang-rust");
    return module.rustLanguage.parser;
  },
  async go() {
    const module = await import("@codemirror/lang-go");
    return module.goLanguage.parser;
  },
  async java() {
    const module = await import("@codemirror/lang-java");
    return module.javaLanguage.parser;
  },
  async json() {
    const module = await import("@codemirror/lang-json");
    return module.jsonLanguage.parser;
  },
  async css() {
    const module = await import("@codemirror/lang-css");
    return module.cssLanguage.parser;
  },
  async html() {
    const module = await import("@codemirror/lang-html");
    return module.htmlLanguage.parser;
  },
  async markdown() {
    const module = await import("@codemirror/lang-markdown");
    return module.markdownLanguage.parser;
  }
};

const loadedParsers = new Map<CodeHighlightLanguageKey, Parser>();
const pendingLoads = new Map<CodeHighlightLanguageKey, Promise<Parser | null>>();
const listeners = new Set<CodeHighlightParserLoadedListener>();
let loaderGeneration = 0;

const loaderStats = {
  failedLoads: 0,
  loadedParsers: 0,
  requestedLoads: 0
};

export function resolveCodeHighlightLanguageKey(info: string | null): CodeHighlightLanguageKey | null {
  if (!info) return null;
  const rawKey = info.trim().toLowerCase().split(/\s+/u)[0];
  if (!rawKey) return null;
  return LANGUAGE_ALIASES[rawKey] ?? null;
}

export function requestCodeHighlightParser(key: CodeHighlightLanguageKey): Parser | null {
  const loadedParser = loadedParsers.get(key);

  if (loadedParser) {
    return loadedParser;
  }

  if (!pendingLoads.has(key)) {
    loaderStats.requestedLoads += 1;
    const generation = loaderGeneration;
    const load = LANGUAGE_LOADERS[key]()
      .then((parser) => {
        if (generation !== loaderGeneration) {
          return parser;
        }

        loadedParsers.set(key, parser);
        loaderStats.loadedParsers += 1;
        notifyCodeHighlightParserLoaded();
        return parser;
      })
      .catch(() => {
        if (generation === loaderGeneration) {
          loaderStats.failedLoads += 1;
        }
        return null;
      })
      .finally(() => {
        if (generation === loaderGeneration) {
          pendingLoads.delete(key);
        }
      });

    pendingLoads.set(key, load);
  }

  return null;
}

export function subscribeCodeHighlightParserLoaded(
  listener: CodeHighlightParserLoadedListener
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export async function waitForPendingCodeHighlightLanguageLoads(): Promise<void> {
  await Promise.all(Array.from(pendingLoads.values()));
}

export function clearCodeHighlightLanguageLoaderState(): void {
  loaderGeneration += 1;
  loadedParsers.clear();
  pendingLoads.clear();
  listeners.clear();
  loaderStats.failedLoads = 0;
  loaderStats.loadedParsers = 0;
  loaderStats.requestedLoads = 0;
}

export function getCodeHighlightLanguageLoaderStats(): Readonly<typeof loaderStats> {
  return { ...loaderStats };
}

function notifyCodeHighlightParserLoaded(): void {
  for (const listener of listeners) {
    listener();
  }
}
