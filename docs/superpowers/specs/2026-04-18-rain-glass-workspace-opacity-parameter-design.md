# Theme Parameter To CSS Variable Bridge Design

## Context

`Rain Glass` already exposes theme parameters through the existing settings UI.

Today that parameter pipeline only affects shader uniforms:

- theme parameters are declared in the theme manifest
- settings UI renders sliders and toggles for the active theme
- user overrides are stored in preferences
- renderer applies those overrides to shader uniforms

The current workspace glass shell is pure CSS, so there is no way to tune its translucency from the same theme parameter UI.

That limitation is larger than `Rain Glass` itself:

- any theme can already declare parameters
- those parameters already persist and appear in the existing settings UI
- but CSS-only theme styling cannot consume them in a structured way

So the missing piece is not a `Rain Glass`-only hook. It is a theme-parameter-to-CSS bridge that any theme can opt into.

## Goal

Add a cross-theme bridge that exposes active theme parameter values as CSS custom properties on the document root.

The first user-facing use of that bridge is a `Rain Glass` parameter that controls workspace glass shell opacity from the existing theme parameter UI.

The user should be able to adjust how transparent or solid the integrated workspace glass area feels without introducing a new preferences surface, and future themes should be able to reuse the same contract.

## Non-Goals

- No new standalone preferences UI
- No new parameter type beyond the existing slider
- No change to shader runtime behavior except preserving current parameter support
- No theme-specific renderer hook that bypasses the shared parameter system

## User Outcome

After this change:

- `Rain Glass` shows a slider for workspace glass opacity
- moving the slider updates the workspace glass shell transparency
- the value persists through the existing theme parameter preferences flow
- other themes can reference the same CSS variable bridge without new renderer work

## Approach

Bridge active theme parameter values into CSS variables on the document root.

Recommended implementation:

- add a new slider parameter in `rain-glass/manifest.json`, for example `workspaceGlassOpacity`
- keep storing the value through the existing `preferences.theme.parameters` path
- in the renderer, expose every active theme parameter as a root-level CSS variable
- in `rain-glass/styles/ui.css`, use that CSS variable when building the workspace shell background and related translucency

This keeps the current settings panel and preferences model intact while extending theme parameters from shader-only control into CSS styling.

## CSS Contract

The renderer should expose active theme parameter values as CSS custom properties on the document root for the active theme only.

Naming requirements:

- The prefix must be generic, not theme-specific
- The format must be stable across themes
- The suffix should derive directly from the manifest parameter id so authors can predict it
- The renderer should clear variables that no longer belong to the active theme

Recommended format:

- `--yulora-theme-parameter-<parameterId>`

Examples:

- `--yulora-theme-parameter-workspaceGlassOpacity`
- `--yulora-theme-parameter-rainAmount`
- `--yulora-theme-parameter-enableLightning`

For this change, `Rain Glass` needs:

- `--yulora-theme-parameter-workspaceGlassOpacity`

The CSS should provide a fallback value matching the current visual default so the theme still renders correctly when no override exists.

The bridge should expose normalized effective values, not raw unchecked input:

- slider parameters resolve to a bounded numeric value
- toggle parameters resolve to `0` or `1`
- defaults apply when the user has not overridden the value

## Files In Scope

- `fixtures/themes/rain-glass/manifest.json`
- `fixtures/themes/rain-glass/styles/ui.css`
- `src/renderer/editor/App.tsx`
- relevant renderer tests for theme parameter application and UI persistence

## Validation

Manual or automated validation should confirm:

- the new slider appears in the active theme parameter panel
- changing the slider updates workspace glass transparency
- the chosen value persists in preferences
- existing shader parameter behavior still works
- CSS variables are scoped to the active theme parameter set and cleaned up when the active theme changes
