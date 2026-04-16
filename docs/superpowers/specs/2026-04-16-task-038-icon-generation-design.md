# TASK-038 Icon Generation Design

**Goal:** Add a repeatable icon asset pipeline for Electron packaging that keeps SVG as the only committed source of truth and generates Windows-ready bitmap assets only when needed.

## Context

The repository now has two committed brand source files:

- `assets/branding/yulora_logo_light.svg`
- `assets/branding/yulora_logo_dark.svg`

The Windows packaging flow already uses `electron-builder`, but the installer still falls back to the default Electron icon. We need a packaging-safe way to generate PNG and ICO assets from the SVG logos without committing generated binaries into the repository.

## Requirements

- Keep the committed brand source of truth in SVG only.
- Generate both `light` and `dark` variants in one command.
- Produce a PNG set for each variant at `32`, `64`, `128`, `256`, and `512`.
- Produce a Windows `icon.ico` for each variant.
- Use `light` as the default icon for `electron-builder`.
- Generate assets during packaging instead of storing them in git.
- Keep the diff focused on packaging and branding automation only.

## Approach

### Option A: Commit generated PNG/ICO assets

- Export PNG and ICO once and store them in the repo.
- Point `electron-builder` at the committed icon files.

Pros:

- Simplest runtime packaging setup
- No extra generation step during packaging

Cons:

- Generated binaries become duplicated sources of truth
- Logo updates require manual re-export and file churn
- Harder to trust that committed icons match the SVG source

### Option B: Generate icons from SVG on demand

- Add a script that rasterizes SVG into PNG sizes and builds `icon.ico`.
- Run the script before `electron-builder`.
- Keep generated files in an ignored build directory.

Pros:

- SVG remains the only committed design source
- Packaging stays reproducible
- Future macOS icon generation can extend the same pipeline

Cons:

- Adds a small build-time dependency surface
- Packaging now depends on the generation step succeeding

### Recommended

Choose Option B.

It matches the project's local-first and reversible workflow: source assets stay minimal, generated outputs are disposable, and Windows packaging can consume a proper `.ico` without hand-maintained binaries.

## File And Data Flow

### Source assets

- `assets/branding/yulora_logo_light.svg`
- `assets/branding/yulora_logo_dark.svg`

### Generated outputs

- `build/icons/light/icon-32.png`
- `build/icons/light/icon-64.png`
- `build/icons/light/icon-128.png`
- `build/icons/light/icon-256.png`
- `build/icons/light/icon-512.png`
- `build/icons/light/icon.ico`
- `build/icons/dark/...` with the same shape

`build/icons/` stays ignored and is regenerated on demand.

### Packaging flow

1. `npm run build`
2. `npm run generate:icons`
3. `electron-builder --config electron-builder.json --win --x64`

`electron-builder.json` points `win.icon` at `build/icons/light/icon.ico`.

## Validation Strategy

- Add a packaging test that verifies `package.json` contains `generate:icons` and that `package:win` invokes it before `electron-builder`.
- Add a packaging config test that verifies `electron-builder.json` points Windows packaging at the generated `light` icon.
- Add an integration-style script test that runs the generator into a temporary output directory and verifies:
  - both `light` and `dark` directories are created
  - PNG files for `32`, `64`, `128`, `256`, `512` exist
  - each variant also produces `icon.ico`

## Risks

1. SVG rasterization can drift if the generator uses a rendering path with different semantics from Chromium. This is acceptable for the current logos because they use simple vector primitives and solid fills.
2. Windows `.ico` files typically embed only a subset of sizes. We will still generate the full PNG set, but build the `.ico` from Windows-relevant square PNG sizes.
3. Packaging can fail if icon generation silently stops working. This is why the repository needs a real generator test instead of config-only coverage.

## Out Of Scope

- macOS `.icns` generation
- Linux icon integration
- runtime theme switching between light and dark icons
- favicon or website asset generation

