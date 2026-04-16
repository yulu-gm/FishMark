# TASK-038 Icon Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a repeatable SVG-to-PNG/ICO generation step for Electron packaging while keeping generated assets out of git.

**Architecture:** Keep the committed branding source in `assets/branding/*.svg`, add a dedicated icon generation script under `scripts/`, and wire Windows packaging to invoke that script before `electron-builder`. Verify the behavior with both config tests and a real generator integration test that writes into a temporary directory.

**Tech Stack:** Node.js, Electron packaging, Vitest, SVG rasterization helper, ICO generation helper

---

### Task 1: Lock the packaging contract with failing tests

**Files:**
- Modify: `src/main/package-scripts.test.ts`
- Create: `src/main/generate-icons.test.ts`

- [ ] **Step 1: Write the failing packaging assertions**

```ts
expect(packageJson.scripts?.["generate:icons"]).toBe("node scripts/generate-icons.mjs");
expect(packageJson.scripts?.["package:win"]).toContain("npm run generate:icons");
expect(config.win?.icon).toBe("build/icons/light/icon.ico");
```

- [ ] **Step 2: Write the failing generator integration test**

```ts
const outputDirectory = mkdtempSync(path.join(tmpdir(), "yulora-icons-"));
const result = spawnSync(process.execPath, ["scripts/generate-icons.mjs", "--out-dir", outputDirectory], {
  cwd: process.cwd(),
  encoding: "utf8"
});

expect(result.status).toBe(0);
expect(existsSync(path.join(outputDirectory, "light", "icon-32.png"))).toBe(true);
expect(existsSync(path.join(outputDirectory, "dark", "icon.ico"))).toBe(true);
```

- [ ] **Step 3: Run the target tests and confirm they fail for the expected reason**

Run: `npm run test -- src/main/package-scripts.test.ts src/main/generate-icons.test.ts`

Expected: FAIL because the `generate:icons` script, icon generator, and `win.icon` config do not exist yet.

### Task 2: Implement the generator and wire packaging

**Files:**
- Create: `scripts/generate-icons.mjs`
- Modify: `package.json`
- Modify: `electron-builder.json`
- Modify: `.gitignore`

- [ ] **Step 1: Add the build-time dependencies**

Run: `npm.cmd install --save-dev @resvg/resvg-js png-to-ico`

Expected: install succeeds and updates `package.json` / `package-lock.json`.

- [ ] **Step 2: Add the generator CLI**

```js
const ICON_SIZES = [32, 64, 128, 256, 512];
const ICO_SIZES = [32, 64, 128, 256];
const VARIANTS = [
  { name: "light", input: "assets/branding/yulora_logo_light.svg" },
  { name: "dark", input: "assets/branding/yulora_logo_dark.svg" }
];
```

The script should:

- parse `--out-dir`, defaulting to `build/icons`
- rasterize each SVG to the PNG sizes above
- write the PNG files under `<out-dir>/<variant>/`
- build `<out-dir>/<variant>/icon.ico` from the ICO sizes

- [ ] **Step 3: Wire package scripts and builder config**

```json
{
  "scripts": {
    "generate:icons": "node scripts/generate-icons.mjs",
    "package:win": "npm run build && npm run generate:icons && electron-builder --config electron-builder.json --win --x64"
  }
}
```

```json
{
  "win": {
    "icon": "build/icons/light/icon.ico"
  }
}
```

Also ignore `build/icons`.

- [ ] **Step 4: Run the target tests and confirm they pass**

Run: `npm run test -- src/main/package-scripts.test.ts src/main/generate-icons.test.ts`

Expected: PASS

### Task 3: Update packaging docs

**Files:**
- Modify: `docs/packaging.md`
- Modify: `docs/decision-log.md`
- Modify: `docs/progress.md`

- [ ] **Step 1: Document the new packaging prerequisite and source-of-truth rule**

Add:

- `assets/branding/*.svg` are the committed sources
- `npm run generate:icons` creates disposable PNG/ICO outputs
- `npm run package:win` now generates icons before invoking `electron-builder`

- [ ] **Step 2: Record the packaging decision**

Add a decision-log row describing why SVG stays committed while Windows icons are generated on demand.

- [ ] **Step 3: Update the task progress note**

Mention that `TASK-038` now includes a generated Windows icon pipeline but macOS icon assets are still pending.

### Task 4: Run the completion gate

**Files:**
- Modify: `docs/test-report.md`

- [ ] **Step 1: Run focused verification**

Run: `npm run test -- src/main/package-scripts.test.ts src/main/generate-icons.test.ts`

Expected: PASS

- [ ] **Step 2: Run repository gates**

Run:

- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run build`

Expected: PASS

- [ ] **Step 3: Record the verification evidence**

Add test-report rows for the icon generation tests and the repo-level gates.
