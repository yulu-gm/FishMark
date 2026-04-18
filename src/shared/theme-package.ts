export type ThemeEffectsMode = "auto" | "full" | "off";
export type ThemeSurfaceSlot = "workbenchBackground" | "titlebarBackdrop" | "welcomeHero";
export type ThemeStylePart = "ui" | "editor" | "markdown" | "titlebar";
export type ThemeSurfaceRenderSettings = {
  renderScale?: number;
  frameRate?: number;
};

export type ThemeSurfaceDescriptor = {
  kind: "fragment";
  scene: string;
  shader: string;
  channels?: ThemeSurfaceChannels;
  render?: ThemeSurfaceRenderSettings;
};

type ThemeSurfaceImageDescriptor = { type: "image"; src: string };
type ThemeSurfaceChannels = Partial<Record<"0", ThemeSurfaceImageDescriptor>>;

export type ThemeParameterSliderDescriptor = {
  id: string;
  label: string;
  type: "slider";
  min: number;
  max: number;
  step: number;
  default: number;
  uniform?: string;
  description?: string;
};

export type ThemeParameterToggleDescriptor = {
  id: string;
  label: string;
  type: "toggle";
  default: boolean;
  uniform?: string;
  description?: string;
};

export type ThemeParameterDescriptor =
  | ThemeParameterSliderDescriptor
  | ThemeParameterToggleDescriptor;

export type ThemePackageManifest = {
  id: string;
  name: string;
  version: string;
  author: string | null;
  supports: { light: boolean; dark: boolean };
  tokens: Partial<Record<"light" | "dark", string>>;
  styles: Partial<Record<ThemeStylePart, string>>;
  layout: { titlebar: string | null };
  scene: { id: string; sharedUniforms: Record<string, number>; render?: ThemeSurfaceRenderSettings } | null;
  surfaces: Partial<Record<ThemeSurfaceSlot, ThemeSurfaceDescriptor>>;
  parameters: ThemeParameterDescriptor[];
};

const THEME_MODES = ["light", "dark"] as const;
const THEME_STYLE_PARTS = ["ui", "editor", "markdown", "titlebar"] as const;
const THEME_SURFACE_SLOTS = ["workbenchBackground", "titlebarBackdrop", "welcomeHero"] as const;
const THEME_SURFACE_CHANNELS = ["0"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeSlashes(value: string): string {
  return value.trim().replace(/\\/g, "/");
}

function normalizePackageRoot(packageRoot: string): string {
  return normalizeSlashes(packageRoot).replace(/\/+$/, "");
}

type AbsolutePackagePath =
  | {
      kind: "posix";
      path: string;
    }
  | {
      kind: "windows";
      drive: string;
      path: string;
    };

function parseWindowsAbsolutePath(value: string): { drive: string; path: string } | null {
  const match = value.match(/^([A-Za-z]):\/(.*)$/);

  if (!match) {
    return null;
  }

  const [, drive, absolutePath] = match;
  if (drive === undefined || absolutePath === undefined) {
    return null;
  }

  return {
    drive: drive.toUpperCase(),
    path: `/${absolutePath}`
  };
}

function resolvePosixRelativeParts(parts: string[]): string | null {
  const normalized: string[] = [];

  for (const part of parts) {
    if (part === "" || part === ".") {
      continue;
    }

    if (part === "..") {
      if (normalized.length === 0) {
        return null;
      }

      normalized.pop();
      continue;
    }

    normalized.push(part);
  }

  return normalized.join("/");
}

function normalizeRelativePath(raw: string): string | null {
  const normalized = resolvePosixRelativeParts(raw.replace(/\/+$/, "").split("/"));

  return normalized === "" ? null : normalized;
}

function normalizeAbsolutePath(raw: string): AbsolutePackagePath | null {
  if (raw.startsWith("/")) {
    const normalized = resolvePosixRelativeParts(raw.slice(1).replace(/\/+$/, "").split("/"));

    return normalized === null ? null : { kind: "posix", path: `/${normalized}` };
  }

  const windows = parseWindowsAbsolutePath(raw);
  if (!windows) {
    return null;
  }

  const normalized = resolvePosixRelativeParts(windows.path.slice(1).replace(/\/+$/, "").split("/"));

  return normalized === null
    ? null
    : { kind: "windows", drive: windows.drive, path: `${windows.drive}:/${normalized}` };
}

function isPathInsidePackageRoot(
  absolutePath: AbsolutePackagePath,
  normalizedRoot: string
): boolean {
  const normalizedRootValue = normalizeSlashes(normalizedRoot);

  if (absolutePath.kind === "posix") {
    if (absolutePath.path === normalizedRootValue) {
      return true;
    }

    if (normalizedRootValue.startsWith("/") && absolutePath.path.startsWith(`${normalizedRootValue}/`)) {
      return true;
    }

    return false;
  }

  const rootMatch = parseWindowsAbsolutePath(normalizedRootValue);
  if (!rootMatch || rootMatch.drive !== absolutePath.drive) {
    return false;
  }

  const rootPath = `${rootMatch.drive}:/${rootMatch.path.replace(/^\/+/, "")}`;
  if (absolutePath.path === rootPath) {
    return true;
  }

  return absolutePath.path.startsWith(`${rootPath}/`);
}

function normalizePackagePath(raw: unknown, packageRoot: string): string | null {
  if (typeof raw !== "string") {
    return null;
  }

  const normalized = normalizeSlashes(raw);

  if (normalized.length === 0) {
    return null;
  }

  const absolute = normalizeAbsolutePath(normalized);
  if (absolute !== null) {
    const normalizedRoot = normalizePackageRoot(packageRoot);
    return isPathInsidePackageRoot(absolute, normalizedRoot) ? absolute.path : null;
  }

  const normalizedRoot = normalizePackageRoot(packageRoot);
  const relative = normalizeRelativePath(normalized);

  if (relative === null) {
    return null;
  }

  return `${normalizedRoot}/${relative}`;
}

function normalizeModePaths(raw: unknown, packageRoot: string): Partial<Record<"light" | "dark", string>> {
  const source = isRecord(raw) ? raw : {};

  return THEME_MODES.reduce<Record<"light" | "dark", string>>(
    (paths, mode) => {
      const resolved = normalizePackagePath(source[mode], packageRoot);

      if (resolved !== null) {
        paths[mode] = resolved;
      }

      return paths;
    },
    {} as Record<"light" | "dark", string>
  );
}

function normalizeStylePaths(raw: unknown, packageRoot: string): Partial<Record<ThemeStylePart, string>> {
  const source = isRecord(raw) ? raw : {};

  return THEME_STYLE_PARTS.reduce<Partial<Record<ThemeStylePart, string>>>((paths, part) => {
    const resolved = normalizePackagePath(source[part], packageRoot);

    if (resolved !== null) {
      paths[part] = resolved;
    }

    return paths;
  }, {});
}

function normalizeSurfaceDescriptor(
  raw: unknown,
  packageRoot: string
): ThemeSurfaceDescriptor | null {
  if (!isRecord(raw)) {
    return null;
  }

  if (raw.kind !== "fragment") {
    return null;
  }

  const scene = typeof raw.scene === "string" ? raw.scene : null;
  if (typeof scene !== "string" || scene.trim().length === 0) {
    return null;
  }

  const shader = normalizePackagePath(raw.shader, packageRoot);
  if (shader === null) {
    return null;
  }

  const channels = normalizeSurfaceChannels(raw.channels, packageRoot);
  const render = normalizeSurfaceRenderSettings(raw.render);

  const descriptor: ThemeSurfaceDescriptor = {
    kind: "fragment",
    scene,
    shader
  };

  if (Object.keys(channels).length > 0) {
    descriptor.channels = channels;
  }

  if (render) {
    descriptor.render = render;
  }

  return descriptor;
}

function normalizeSurfaceChannels(
  raw: unknown,
  packageRoot: string
): ThemeSurfaceChannels {
  const source = isRecord(raw) ? raw : {};
  const channels: ThemeSurfaceChannels = {};

  for (const channel of THEME_SURFACE_CHANNELS) {
    const normalized = normalizeSurfaceChannel(source[channel], packageRoot);
    if (normalized !== null) {
      channels[channel] = normalized;
    }
  }

  return channels;
}

function normalizeSurfaceChannel(
  raw: unknown,
  packageRoot: string
): ThemeSurfaceImageDescriptor | null {
  if (!isRecord(raw)) {
    return null;
  }

  if (raw.type !== "image") {
    return null;
  }

  const src = normalizePackagePath(raw.src, packageRoot);
  if (src === null) {
    return null;
  }

  return {
    type: "image",
    src
  };
}

function normalizeSurfaces(raw: unknown, packageRoot: string): Partial<Record<ThemeSurfaceSlot, ThemeSurfaceDescriptor>> {
  const source = isRecord(raw) ? raw : {};

  return THEME_SURFACE_SLOTS.reduce<Partial<Record<ThemeSurfaceSlot, ThemeSurfaceDescriptor>>>(
    (surfaces, slot) => {
      const surface = normalizeSurfaceDescriptor(source[slot], packageRoot);

      if (surface !== null) {
        surfaces[slot] = surface;
      }

      return surfaces;
    },
    {}
  );
}

function normalizeSupports(raw: unknown): { light: boolean; dark: boolean } {
  const source = isRecord(raw) ? raw : {};

  return {
    light: source.light === true,
    dark: source.dark === true
  };
}

function normalizeSurfaceRenderSettings(raw: unknown): ThemeSurfaceRenderSettings | undefined {
  if (!isRecord(raw)) {
    return undefined;
  }

  const render: ThemeSurfaceRenderSettings = {};

  if (
    typeof raw.renderScale === "number" &&
    Number.isFinite(raw.renderScale) &&
    raw.renderScale > 0 &&
    raw.renderScale <= 1
  ) {
    render.renderScale = raw.renderScale;
  }

  if (typeof raw.frameRate === "number" && Number.isFinite(raw.frameRate) && raw.frameRate > 0) {
    render.frameRate = raw.frameRate;
  }

  return Object.keys(render).length > 0 ? render : undefined;
}

function normalizeThemeScene(raw: unknown): ThemePackageManifest["scene"] {
  if (!isRecord(raw)) {
    return null;
  }

  if (typeof raw.id !== "string" || raw.id.trim().length === 0) {
    return null;
  }

  const sharedUniformsSource = isRecord(raw.sharedUniforms) ? raw.sharedUniforms : {};

  const sharedUniforms: Record<string, number> = {};
  for (const key in sharedUniformsSource) {
    if (typeof sharedUniformsSource[key] !== "number") {
      continue;
    }

    sharedUniforms[key] = sharedUniformsSource[key];
  }

  const render = normalizeSurfaceRenderSettings(raw.render);

  return {
    id: raw.id.trim(),
    sharedUniforms,
    ...(render ? { render } : {})
  };
}

function normalizeThemeParameter(raw: unknown): ThemeParameterDescriptor | null {
  if (!isRecord(raw)) {
    return null;
  }

  const id = typeof raw.id === "string" ? raw.id.trim() : "";
  if (id.length === 0 || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(id)) {
    return null;
  }

  const label = typeof raw.label === "string" ? raw.label.trim() : "";
  if (label.length === 0) {
    return null;
  }

  const uniform = typeof raw.uniform === "string" ? raw.uniform.trim() : "";
  if (uniform.length > 0 && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(uniform)) {
    return null;
  }

  const description = typeof raw.description === "string" ? raw.description.trim() : undefined;

  if (raw.type === "toggle") {
    return {
      id,
      label,
      type: "toggle",
      default: raw.default === true,
      ...(uniform ? { uniform } : {}),
      ...(description ? { description } : {})
    };
  }

  if (raw.type === "slider") {
    const min = typeof raw.min === "number" && Number.isFinite(raw.min) ? raw.min : 0;
    const max = typeof raw.max === "number" && Number.isFinite(raw.max) ? raw.max : 1;
    if (max <= min) {
      return null;
    }

    const step = typeof raw.step === "number" && raw.step > 0 && Number.isFinite(raw.step) ? raw.step : 0.01;
    const defaultValue =
      typeof raw.default === "number" && Number.isFinite(raw.default)
        ? Math.min(Math.max(raw.default, min), max)
        : min;

    return {
      id,
      label,
      type: "slider",
      min,
      max,
      step,
      default: defaultValue,
      ...(uniform ? { uniform } : {}),
      ...(description ? { description } : {})
    };
  }

  return null;
}

function normalizeThemeParameters(raw: unknown): ThemeParameterDescriptor[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  const seenIds = new Set<string>();
  const parameters: ThemeParameterDescriptor[] = [];

  for (const entry of raw) {
    const parameter = normalizeThemeParameter(entry);
    if (parameter === null || seenIds.has(parameter.id)) {
      continue;
    }

    seenIds.add(parameter.id);
    parameters.push(parameter);
  }

  return parameters;
}

export function normalizeThemePackageManifest(
  raw: unknown,
  packageRoot: string
): ThemePackageManifest | null {
  const source = isRecord(raw) ? raw : null;

  if (
    !source ||
    typeof source.id !== "string" ||
    typeof source.name !== "string" ||
    source.id.trim().length === 0 ||
    source.name.trim().length === 0
  ) {
    return null;
  }

  return {
    id: source.id.trim(),
    name: source.name.trim(),
    version: typeof source.version === "string" ? source.version : "1.0.0",
    author: typeof source.author === "string" ? source.author : null,
    supports: normalizeSupports(source.supports),
    tokens: normalizeModePaths(source.tokens, packageRoot),
    styles: normalizeStylePaths(source.styles, packageRoot),
    layout: {
      titlebar: normalizePackagePath(isRecord(source.layout) ? source.layout.titlebar : null, packageRoot)
    },
    scene: normalizeThemeScene(source.scene),
    surfaces: normalizeSurfaces(source.surfaces, packageRoot),
    parameters: normalizeThemeParameters(source.parameters)
  };
}
