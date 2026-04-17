# Theme Packages

Theme packages are local directories under `themes/<id>/` that declare styling, titlebar layout, and optional shader surfaces through a single `manifest.json`.

## Package Layout

The current loader understands this structure:

```text
rain-glass/
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

`manifest.json` is required. Other folders are optional, and the loader only normalizes referenced paths into the package root; it does not eagerly verify that every asset exists at scan time.

## Manifest Contract

Use the current manifest fields supported by the loader:

- `id`, `name`, `version`, `author`
- `supports.light` and `supports.dark`
- `tokens.light` and `tokens.dark`
- `styles.ui`, `styles.editor`, `styles.markdown`, `styles.titlebar`
- `layout.titlebar`
- `scene.id` and `scene.sharedUniforms`
- `surfaces.workbenchBackground`, `surfaces.titlebarBackdrop`, `surfaces.welcomeHero`

The loader resolves these values into local asset URLs and rejects malformed paths that escape the package root, so keep every path inside the package root.

## Tokens And Styles

In the current implementation, `tokens.light` and `tokens.dark` point to CSS stylesheets, not JSON token blobs. That keeps the sample package compatible with the renderer today. If you want to experiment with a future JSON-token format, treat it as an authoring-side conversion step until the loader grows support for it.

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

Shader surfaces are always optional from the app’s point of view. If the runtime cannot fetch, compile, or mount a surface, Yulora falls back to static styling. The app records the aggregate dynamic mode on the document element and warns once only when every active dynamic surface has fallen back.

When authoring a package:

- Prefer graceful visuals over heavy GPU work
- Keep shared uniforms small and numeric
- Avoid assumptions about wide compatibility or continuous animation
- Make the static CSS layer readable on its own, because fallback is part of the contract

## Sample Package Notes

The bundled `rain-glass` fixture shows the current contract end to end:

- CSS token files for light and dark modes
- A controlled titlebar layout
- Shared scene uniforms for both shader surfaces
- A workbench background and a titlebar backdrop

It is intentionally small so it can serve as a reference package for future theme authors.
