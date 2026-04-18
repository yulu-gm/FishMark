# Theme Packages

Theme packages are the only supported theme architecture in Yulora.

- Builtin packages ship from `src/renderer/theme-packages/`
- External packages live under `<userData>/themes/<id>/`
- Every package directory must contain `manifest.json`
- Directories without `manifest.json` are ignored
- `default` is the only builtin package and is the required fallback package

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
```

`manifest.json` is required. Other folders are optional. The loader only normalizes referenced paths into the package root; it does not eagerly verify every referenced asset at scan time.

## Manifest Contract

Supported manifest fields:

- `id`, `name`, `version`, `author`
- `supports.light` and `supports.dark`
- `tokens.light` and `tokens.dark`
- `styles.ui`, `styles.editor`, `styles.markdown`, `styles.titlebar`
- `layout.titlebar`
- `scene.id` and `scene.sharedUniforms`
- `surfaces.workbenchBackground`, `surfaces.titlebarBackdrop`, `surfaces.welcomeHero`

The loader resolves these values into local asset URLs and rejects malformed paths that escape the package root, so every referenced file must stay inside the package directory.

## Tokens And Styles

`tokens.light` and `tokens.dark` point to CSS stylesheets, not JSON token blobs.

Theme CSS should stay focused on stable variables and host styling:

- `tokens/*.css` define color and surface variables
- `styles/ui.css` defines global UI control tokens
- `styles/editor.css` and `styles/markdown.css` tune document rendering
- `styles/titlebar.css` customizes the controlled titlebar shell

## Shader Surfaces

Shader surfaces are declarative, not executable. The manifest can request a surface for:

- `workbenchBackground`
- `titlebarBackdrop`
- `welcomeHero`

Each surface should point at a fragment shader that compiles without extra runtime glue. Keep the shader self-contained, use `mainImage(...)` or a valid fragment entrypoint, and expect the runtime to provide common uniforms such as resolution, time, and shared scene values.

## Fallback And Performance

Shader surfaces are always optional. If the runtime cannot fetch, compile, or mount a surface, Yulora falls back to static styling. The app records the aggregate dynamic mode on the document element and dedupes the warning for the current theme and dynamic state when every active dynamic surface has fallen back.

When authoring a package:

- Prefer graceful visuals over heavy GPU work
- Keep shared uniforms small and numeric
- Avoid assumptions about wide compatibility or continuous animation
- Make the static CSS layer readable on its own, because fallback is part of the contract

## Reference Packages

The builtin `default` package shows the required fallback baseline:

- Explicit light and dark token files
- Shared `ui.css`, `editor.css`, and `markdown.css`
- No compatibility bridge to legacy family directories

The `rain-glass` fixture shows the current external package contract end to end:

- CSS token files for light and dark modes
- A controlled titlebar layout
- Shared scene uniforms for both shader surfaces
- A workbench background and a titlebar backdrop
