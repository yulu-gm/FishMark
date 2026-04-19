import type { ThemePackageManifest, ThemeParameterDescriptor } from "../shared/theme-package";

const THEME_PARAMETER_CSS_VARIABLES_ATTRIBUTE = "data-yulora-theme-parameter-css-variables";
const THEME_PARAMETER_CSS_VAR_PREFIX = "--yulora-theme-parameter-";

export function clearThemeParameterCssVariables(root: HTMLElement): void {
  const variables = root.getAttribute(THEME_PARAMETER_CSS_VARIABLES_ATTRIBUTE);

  if (!variables) {
    return;
  }

  for (const variable of variables.split(",")) {
    const trimmed = variable.trim();

    if (trimmed.length === 0) {
      continue;
    }

    root.style.removeProperty(trimmed);
  }

  root.removeAttribute(THEME_PARAMETER_CSS_VARIABLES_ATTRIBUTE);
}

function toThemeParameterCssVariable(parameterId: string): string {
  return `${THEME_PARAMETER_CSS_VAR_PREFIX}${parameterId}`;
}

function resolveParameterDefaultValue(parameter: ThemeParameterDescriptor): number {
  if (parameter.type === "toggle") {
    return parameter.default ? 1 : 0;
  }

  return parameter.default;
}

export function resolveEffectiveThemeParameterValue(
  parameter: ThemeParameterDescriptor,
  parameterOverrides: Record<string, number> | undefined
): number {
  const overrideValue = parameterOverrides?.[parameter.id];

  if (typeof overrideValue !== "number" || !Number.isFinite(overrideValue)) {
    return resolveParameterDefaultValue(parameter);
  }

  if (parameter.type === "toggle") {
    return overrideValue > 0.5 ? 1 : 0;
  }

  return Math.min(Math.max(overrideValue, parameter.min), parameter.max);
}

export function applyThemeParameterCssVariables(
  root: HTMLElement,
  manifest: ThemePackageManifest | null,
  parameterOverrides: Record<string, number> | undefined
): void {
  clearThemeParameterCssVariables(root);

  if (!manifest) {
    return;
  }

  const appliedVariables: string[] = [];

  for (const parameter of manifest.parameters ?? []) {
    const variableName = toThemeParameterCssVariable(parameter.id);
    root.style.setProperty(
      variableName,
      String(resolveEffectiveThemeParameterValue(parameter, parameterOverrides))
    );
    appliedVariables.push(variableName);
  }

  if (appliedVariables.length > 0) {
    root.setAttribute(THEME_PARAMETER_CSS_VARIABLES_ATTRIBUTE, appliedVariables.join(","));
  }
}
