import { expect, it } from "vitest";
import { resolveResourceThemeSelection } from "./resource-theme-policy";
import type { ThemePackageDescriptor } from "../shared/theme-package";
import { DEFAULT_PREFERENCES } from "../shared/preferences";

function descriptor(id: string, dark: boolean): ThemePackageDescriptor {
  return { id, kind: "manifest-package", source: "community", packageRoot: `/themes/${id}`, manifest: {
    id, name: id, contractVersion: 2, author: null, version: "1", supports: { light: true, dark },
    tokens: {}, styles: {}, layout: { titlebar: null }, scene: null, parameters: [], surfaces: {}
  } };
}
it.each([null, "missing", "light-only", "default"])("selects the default fallback and gates effects for %s", (selectedId) => {
  const packages = [descriptor("default", true), descriptor("light-only", false)];
  const theme = { ...DEFAULT_PREFERENCES.theme, selectedId, mode: "system" as const, effectsMode: "full" as const };
  const main = resolveResourceThemeSelection(theme, packages, true);
  expect(main.mode).toBe("dark"); expect(main.descriptor?.id).toBe("default");
  expect(main.effects).toBe(selectedId === "default");
  expect(resolveResourceThemeSelection({ ...theme, effectsMode: "off" }, packages, true).effects).toBe(false);
});
