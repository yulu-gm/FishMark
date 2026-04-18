# Theme Packages

Theme packages are the only supported theme architecture in Yulora.

- Builtin packages ship from `src/renderer/theme-packages/`
- Renderer builds copy builtin packages into `dist/theme-packages/` so packaged apps can still scan them
- External packages live under `<userData>/themes/<id>/`
- Every package directory must contain `manifest.json`
- Directories without `manifest.json` are ignored
- Invalid manifests are skipped silently
- `default` is the required builtin fallback package

For the authoring workflow, production checklist, and AI-readable template, see `docs/theme-authoring-guide.md`.

## Runtime Overview

The current runtime works like this:

1. `main` scans builtin and community package roots.
2. `manifest.json` is parsed and normalized.
3. Any referenced path that escapes the package root is dropped.
4. Renderer converts normalized file paths into local preview asset URLs.
5. The selected package is resolved against the active light/dark mode.
6. If the selected package is missing or does not support that mode, renderer falls back to builtin `default`.
7. Renderer mounts theme stylesheets in stable order: `tokens`, `ui`, `titlebar`, `editor`, `markdown`.
8. Optional shader surfaces are mounted separately and may fall back to static CSS at runtime.

## Package Layout

The loader understands this structure:

```text
default/
  manifest.json
  tokens/
    light.css
    dark.css
  styles/
    ui.css
    editor.css
    markdown.css
    titlebar.css
  layout/
    titlebar.json
  shaders/
    workbench-background.glsl
    titlebar-backdrop.glsl
  assets/
    textures/
```

`manifest.json` is required. Other folders are optional at schema level, but not every optional field is useful in production.

## Manifest Contract

Supported manifest fields:

- `id`, `name`, `version`, `author`
- `supports.light` and `supports.dark`
- `tokens.light` and `tokens.dark`
- `styles.ui`, `styles.editor`, `styles.markdown`, `styles.titlebar`
- `layout.titlebar`
- `scene.id` and `scene.sharedUniforms`
- `parameters[]`
- `surfaces.workbenchBackground`, `surfaces.titlebarBackdrop`, `surfaces.welcomeHero`

Normalization rules that matter to package authors:

- `id` and `name` must be non-empty strings, otherwise the package is rejected
- missing `version` falls back to `1.0.0`
- missing `author` falls back to `null`
- `supports.light` / `supports.dark` default to `false` unless explicitly set to `true`
- only manifest paths inside the package root survive normalization
- slider/toggle parameter ids and shader uniform names must be valid identifiers
- duplicate parameter ids are ignored after the first valid entry

## Effective Vs Reserved Fields

Not every manifest field is consumed equally by the current renderer:

| Field | Current status |
| --- | --- |
| `tokens.*` | Active |
| `styles.ui` / `styles.editor` / `styles.markdown` | Active |
| `styles.titlebar` | Active on controlled titlebar platforms |
| `scene` | Active when a mounted shader surface uses it |
| `parameters` | Active; exposed to settings, CSS variables, and optional shader uniforms |
| `surfaces.workbenchBackground` | Active |
| `surfaces.titlebarBackdrop` | Active on controlled titlebar platforms |
| `surfaces.welcomeHero` | Reserved in schema, not mounted by the app yet |
| `layout.titlebar` | Normalized and packaged, but not consumed by renderer yet |

Theme authors should not depend on `layout.titlebar` or `surfaces.welcomeHero` until the runtime starts using them.

## Tokens, Styles, And Parameters

`tokens.light` and `tokens.dark` point to CSS files, not JSON tokens.

The effective styling contract is:

- `tokens/*.css` defines the base color and surface variables
- `styles/ui.css` defines UI-control variables and shell styling
- `styles/editor.css` defines editor font and caret variables plus editor-specific tuning
- `styles/markdown.css` defines rendered Markdown variables
- `styles/titlebar.css` is optional polish for the controlled titlebar shell
- `parameters[]` can drive both CSS variables and shader uniforms

Each active parameter is mirrored onto `document.documentElement.style` as:

- `--yulora-theme-parameter-<parameterId>`

If a parameter also declares `uniform`, the same effective value is passed into the shader scene.

## Shader Surfaces

Shader surfaces are declarative, not executable plugins. The runtime currently supports fragment shaders for:

- `workbenchBackground`
- `titlebarBackdrop`

Author expectations:

- the shader source must compile on its own
- `mainImage(...)` is supported and wrapped automatically
- plain fragment entrypoints are also supported
- the runtime injects common uniforms such as resolution, time, `u_themeMode`, and optional shared uniforms
- `u_themeMode` is a built-in float uniform: `0` for light mode, `1` for dark mode
- `iChannel0`, `iResolution`, and `iTime` are only injected when channel `0` is configured

Shader surfaces are always optional. If fetch, image decode, shader compilation, or mounting fails, the app falls back to static CSS and keeps running.

## Reference Packages

The builtin `default` package is the hard fallback baseline:

- explicit light and dark token files
- shared `ui.css`, `editor.css`, and `markdown.css`
- no shader dependency

The `rain-glass` fixture is the best current reference for advanced authoring:

- dark-only support
- CSS token and style files
- theme parameters
- shader-backed workbench/titlebar surfaces
- texture channel usage
- titlebar CSS polish

Its `layout/titlebar.json` is a packaging example only for now, not a live runtime feature.
