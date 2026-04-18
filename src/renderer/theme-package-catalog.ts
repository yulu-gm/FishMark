import { createPreviewAssetUrl } from "../shared/preview-asset-url";
import type { ThemePackageRuntimeDescriptor } from "./theme-package-runtime";

export type ThemePackageDescriptor = Awaited<ReturnType<Window["yulora"]["listThemePackages"]>>[number];

export type ThemePackageRuntimeEntry = {
  id: string;
  source: "builtin" | "community";
  supports: { light: boolean; dark: boolean };
  tokens: Partial<Record<"light" | "dark", string>>;
  styles: Partial<Record<"ui" | "editor" | "markdown" | "titlebar", string>>;
};

export type ThemePackageFallbackReason = "missing-theme" | "unsupported-mode" | null;

export type ActiveThemePackageResolution = {
  requestedId: string | null;
  resolvedMode: "light" | "dark";
  descriptor: ThemePackageRuntimeDescriptor | null;
  fallbackReason: ThemePackageFallbackReason;
};

function toPreviewAssetUrl(rawPath: string | undefined): string | null {
  if (typeof rawPath !== "string" || rawPath.trim().length === 0) {
    return null;
  }

  return createPreviewAssetUrl(rawPath);
}

export function normalizeThemePackageDescriptor(
  entry: ThemePackageDescriptor
): ThemePackageRuntimeEntry {
  const tokens: Partial<Record<"light" | "dark", string>> = {};
  const styles: Partial<Record<"ui" | "editor" | "markdown" | "titlebar", string>> = {};

  const lightTokenUrl = toPreviewAssetUrl(entry.manifest.tokens.light);
  const darkTokenUrl = toPreviewAssetUrl(entry.manifest.tokens.dark);

  if (lightTokenUrl) {
    tokens.light = lightTokenUrl;
  }

  if (darkTokenUrl) {
    tokens.dark = darkTokenUrl;
  }

  for (const part of ["ui", "editor", "markdown", "titlebar"] as const) {
    const resolved = toPreviewAssetUrl(entry.manifest.styles[part]);

    if (resolved) {
      styles[part] = resolved;
    }
  }

  return {
    id: entry.id,
    source: entry.source,
    supports: entry.manifest.supports,
    tokens,
    styles
  };
}

function toRuntimePackageDescriptor(entry: ThemePackageRuntimeEntry): ThemePackageRuntimeDescriptor {
  return {
    id: entry.id,
    tokens: entry.tokens,
    styles: entry.styles
  };
}

function resolveBuiltinDefaultDescriptor(
  packages: ThemePackageRuntimeEntry[]
): ThemePackageRuntimeDescriptor | null {
  const builtinDefault = packages.find((entry) => entry.id === "default");
  return builtinDefault ? toRuntimePackageDescriptor(builtinDefault) : null;
}

export function resolveActiveThemePackage(
  selectedId: string | null,
  packages: ThemePackageRuntimeEntry[],
  mode: "light" | "dark"
): ActiveThemePackageResolution {
  const builtinDefaultDescriptor = resolveBuiltinDefaultDescriptor(packages);

  if (!selectedId) {
    return {
      requestedId: selectedId,
      resolvedMode: mode,
      descriptor: builtinDefaultDescriptor,
      fallbackReason: null
    };
  }

  const selected = packages.find((entry) => entry.id === selectedId) ?? null;

  if (!selected) {
    return {
      requestedId: selectedId,
      resolvedMode: mode,
      descriptor: builtinDefaultDescriptor,
      fallbackReason: "missing-theme"
    };
  }

  if (!selected.supports[mode]) {
    return {
      requestedId: selectedId,
      resolvedMode: mode,
      descriptor: builtinDefaultDescriptor,
      fallbackReason: "unsupported-mode"
    };
  }

  return {
    requestedId: selectedId,
    resolvedMode: mode,
    descriptor: toRuntimePackageDescriptor(selected),
    fallbackReason: null
  };
}
