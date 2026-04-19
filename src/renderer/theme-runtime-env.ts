import {
  THEME_RUNTIME_ENV_CSS_VARS,
  THEME_RUNTIME_THEME_MODE_ATTRIBUTE
} from "../shared/theme-style-contract";

type ThemeMode = "light" | "dark";

export type ThemeRuntimeEnv = {
  wordCount: number;
  focusMode: 0 | 1;
  themeMode: ThemeMode;
  viewport: {
    width: number;
    height: number;
  };
};

export function buildThemeRuntimeEnv(input: {
  wordCount: number;
  isFocusModeActive: boolean;
  themeMode: ThemeMode;
  viewport: ThemeRuntimeEnv["viewport"];
}): ThemeRuntimeEnv {
  return {
    wordCount: input.wordCount,
    focusMode: input.isFocusModeActive ? 1 : 0,
    themeMode: input.themeMode,
    viewport: input.viewport
  };
}

export function applyThemeRuntimeEnv(root: HTMLElement, env: ThemeRuntimeEnv): void {
  root.setAttribute(THEME_RUNTIME_THEME_MODE_ATTRIBUTE, env.themeMode);
  root.style.setProperty(THEME_RUNTIME_ENV_CSS_VARS.wordCount, String(env.wordCount));
  root.style.setProperty(THEME_RUNTIME_ENV_CSS_VARS.focusMode, String(env.focusMode));
  root.style.setProperty(THEME_RUNTIME_ENV_CSS_VARS.viewportWidth, String(env.viewport.width));
  root.style.setProperty(THEME_RUNTIME_ENV_CSS_VARS.viewportHeight, String(env.viewport.height));
}

export function clearThemeRuntimeEnv(root: HTMLElement): void {
  root.removeAttribute(THEME_RUNTIME_THEME_MODE_ATTRIBUTE);
  root.style.removeProperty(THEME_RUNTIME_ENV_CSS_VARS.wordCount);
  root.style.removeProperty(THEME_RUNTIME_ENV_CSS_VARS.focusMode);
  root.style.removeProperty(THEME_RUNTIME_ENV_CSS_VARS.viewportWidth);
  root.style.removeProperty(THEME_RUNTIME_ENV_CSS_VARS.viewportHeight);
}
