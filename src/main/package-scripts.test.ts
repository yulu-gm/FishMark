import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("package scripts", () => {
  it("waits for the shared Electron build output before launching the app in dev", () => {
    const packageJsonPath = path.join(process.cwd(), "package.json");
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
      scripts?: Record<string, string>;
    };

    expect(packageJson.scripts?.["dev:electron"]).toContain(
      "dist-electron/shared/open-markdown-file.js"
    );
    expect(packageJson.scripts?.["dev:electron"]).toContain(
      "dist-electron/shared/save-markdown-file.js"
    );
  });

  it("defines a dedicated dev entry for the test workbench mode", () => {
    const packageJsonPath = path.join(process.cwd(), "package.json");
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
      scripts?: Record<string, string>;
    };

    expect(packageJson.scripts?.["dev:test-workbench"]).toContain("npm:dev:electron:test-workbench");
    expect(packageJson.scripts?.["dev:test-workbench"]).toContain("npm:dev:renderer:test-workbench");
    expect(packageJson.scripts?.["dev:renderer:test-workbench"]).toContain("--port 5174");
    expect(packageJson.scripts?.["dev:electron:test-workbench"]).toContain(
      "YULORA_START_MODE=test-workbench"
    );
    expect(packageJson.scripts?.["dev:electron:test-workbench"]).toContain(
      "VITE_DEV_SERVER_URL=http://localhost:5174"
    );
  });

  it("uses watch-specific tsconfig files for the long-running TypeScript dev compilers", () => {
    const packageJsonPath = path.join(process.cwd(), "package.json");
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
      scripts?: Record<string, string>;
    };

    expect(packageJson.scripts?.["dev:main"]).toContain("tsconfig.electron.watch.json");
    expect(packageJson.scripts?.["dev:cli"]).toContain("tsconfig.cli.watch.json");
  });

  it("stores watch-mode tsbuildinfo files separately from the clean build cache", () => {
    const electronWatchConfigPath = path.join(process.cwd(), "tsconfig.electron.watch.json");
    const electronWatchConfig = JSON.parse(readFileSync(electronWatchConfigPath, "utf8")) as {
      extends?: string;
      compilerOptions?: {
        tsBuildInfoFile?: string;
      };
    };
    const cliWatchConfigPath = path.join(process.cwd(), "tsconfig.cli.watch.json");
    const cliWatchConfig = JSON.parse(readFileSync(cliWatchConfigPath, "utf8")) as {
      extends?: string;
      compilerOptions?: {
        incremental?: boolean;
        tsBuildInfoFile?: string;
      };
    };

    expect(electronWatchConfig.extends).toBe("./tsconfig.electron.json");
    expect(electronWatchConfig.compilerOptions?.tsBuildInfoFile).toBe(".tmp/tsconfig.electron.watch.tsbuildinfo");
    expect(cliWatchConfig.extends).toBe("./tsconfig.cli.json");
    expect(cliWatchConfig.compilerOptions?.incremental).toBe(true);
    expect(cliWatchConfig.compilerOptions?.tsBuildInfoFile).toBe(".tmp/tsconfig.cli.watch.tsbuildinfo");
  });

  it("uses cross-env via npm bin resolution instead of a hard-coded node_modules path", () => {
    const packageJsonPath = path.join(process.cwd(), "package.json");
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
      scripts?: Record<string, string>;
    };

    expect(packageJson.scripts?.["dev:electron"]).toContain("cross-env VITE_DEV_SERVER_URL=http://localhost:5173");
    expect(packageJson.scripts?.["dev:electron"]).not.toContain("node ./node_modules/cross-env/");
    expect(packageJson.scripts?.["dev:electron:test-workbench"]).toContain(
      "cross-env YULORA_START_MODE=test-workbench VITE_DEV_SERVER_URL=http://localhost:5174"
    );
    expect(packageJson.scripts?.["dev:electron:test-workbench"]).not.toContain(
      "node ./node_modules/cross-env/"
    );
  });

  it("lets vite derive the dev port from the environment", () => {
    const viteConfigPath = path.join(process.cwd(), "vite.config.ts");
    const viteConfigSource = readFileSync(viteConfigPath, "utf8");

    expect(viteConfigSource).toContain("YULORA_DEV_SERVER_PORT");
  });

  it("uses relative asset URLs for the renderer build output", () => {
    const viteConfigPath = path.join(process.cwd(), "vite.config.ts");
    const viteConfigSource = readFileSync(viteConfigPath, "utf8");

    expect(viteConfigSource).toContain('base: "./"');
  });

  it("does not import local shared modules from the preload source", () => {
    const preloadPath = path.join(process.cwd(), "src", "preload", "preload.ts");
    const preloadSource = readFileSync(preloadPath, "utf8");

    expect(preloadSource).not.toContain("from \"./");
    expect(preloadSource).not.toContain("from './");
    expect(preloadSource).not.toContain("from \"../");
    expect(preloadSource).not.toContain("from '../");
  });

  it("defines a Windows packaging entry that builds before invoking electron-builder", () => {
    const packageJsonPath = path.join(process.cwd(), "package.json");
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
      scripts?: Record<string, string>;
    };

    expect(packageJson.scripts?.["package:win"]).toContain("npm run build");
    expect(packageJson.scripts?.["package:win"]).toContain("npm run generate:icons");
    expect(packageJson.scripts?.["package:win"]).toContain("node scripts/build-win-release.mjs package");
  });

  it("defines a macOS packaging entry that builds before invoking electron-builder", () => {
    const packageJsonPath = path.join(process.cwd(), "package.json");
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
      scripts?: Record<string, string>;
    };

    expect(packageJson.scripts?.["package:mac"]).toContain("npm run build");
    expect(packageJson.scripts?.["package:mac"]).toContain("npm run generate:icons");
    expect(packageJson.scripts?.["package:mac"]).toContain("electron-builder --config electron-builder.json");
    expect(packageJson.scripts?.["package:mac"]).toContain("--mac");
    expect(packageJson.scripts?.["package:mac"]).toContain("--dir");
  });

  it("defines a Windows release entry that reuses the dedicated packaging script", () => {
    const packageJsonPath = path.join(process.cwd(), "package.json");
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
      scripts?: Record<string, string>;
    };

    expect(packageJson.scripts?.["release:win"]).toContain("npm run build");
    expect(packageJson.scripts?.["release:win"]).toContain("npm run generate:icons");
    expect(packageJson.scripts?.["release:win"]).toContain("node scripts/build-win-release.mjs release");
  });

  it("defines a dedicated icon generation script", () => {
    const packageJsonPath = path.join(process.cwd(), "package.json");
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
      scripts?: Record<string, string>;
    };

    expect(packageJson.scripts?.["generate:icons"]).toBe("node scripts/generate-icons.mjs");
  });

  it("stores the Windows installer configuration in a dedicated electron-builder config file", () => {
    const configPath = path.join(process.cwd(), "electron-builder.json");
    const config = JSON.parse(readFileSync(configPath, "utf8")) as {
      appId?: string;
      electronVersion?: string;
      electronLanguages?: string[];
      publish?: Array<{
        provider?: string;
        owner?: string;
        repo?: string;
        releaseType?: string;
      }>;
      productName?: string;
      directories?: { output?: string };
      files?: string[];
      extraResources?: Array<
        | string
        | {
            from?: string;
            to?: string;
            filter?: string[];
          }
      >;
      win?: {
        icon?: string;
        signAndEditExecutable?: boolean;
        target?: Array<{
          target?: string;
          arch?: string[];
        }>;
      };
      nsis?: {
        oneClick?: boolean;
        allowToChangeInstallationDirectory?: boolean;
      };
    };

    expect(config.appId).toBe("com.yulora.app");
    expect(config.electronVersion).toBe("41.2.0");
    expect(config.electronLanguages).toEqual(["en-US", "zh-CN", "zh-TW"]);
    expect(config.productName).toBe("Yulora");
    expect(config.publish).toEqual([
      {
        provider: "github",
        owner: "yulu-gm",
        repo: "Yulora",
        releaseType: "release"
      }
    ]);
    expect(config.directories?.output).toBe("release");
    expect(config.files).toEqual(
      expect.arrayContaining([
        "dist/**/*",
        "dist-electron/**/*",
        "!dist-electron/**/*.d.ts",
        "!src{,/**}",
        "!tests{,/**}",
        "!docs{,/**}",
        "!reports{,/**}"
      ])
    );
    expect(config.files).not.toContain("dist-cli/**/*");
    expect(config.files).not.toContain("!dist-cli/**/*.map");
    expect(config.extraResources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          from: "build/icons",
          to: "icons"
        })
      ])
    );
    expect(config.win?.icon).toBe("build/icons/light/icon.ico");
    expect(config.win?.target).toEqual([
      {
        target: "nsis",
        arch: ["x64"]
      }
    ]);
    expect(config.win?.signAndEditExecutable).toBe(false);
    expect(config.nsis).toMatchObject({
      oneClick: false,
      allowToChangeInstallationDirectory: true
    });
  });

  it("declares Markdown document associations for the macOS app bundle", () => {
    const configPath = path.join(process.cwd(), "electron-builder.json");
    const config = JSON.parse(readFileSync(configPath, "utf8")) as {
      mac?: {
        category?: string;
        icon?: string;
        fileAssociations?: Array<{
          ext?: string[];
          mimeType?: string;
          name?: string;
          role?: string;
        }>;
      };
    };

    expect(config.mac?.category).toBe("public.app-category.productivity");
    expect(config.mac?.icon).toBe("build/icons/light/icon-512.png");
    expect(config.mac?.fileAssociations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ext: ["md", "markdown"],
          mimeType: "text/markdown",
          name: "Markdown Document",
          role: "Editor"
        })
      ])
    );
  });

  it("keeps renderer libraries as build-time dependencies while allowing required main-process runtime packages", () => {
    const packageJsonPath = path.join(process.cwd(), "package.json");
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };

    expect(packageJson.dependencies).toEqual(
      expect.objectContaining({
        "electron-updater": expect.any(String)
      })
    );
    expect(packageJson.dependencies).not.toEqual(
      expect.objectContaining({
        "@codemirror/commands": expect.any(String),
        "@codemirror/state": expect.any(String),
        "@codemirror/view": expect.any(String),
        "micromark": expect.any(String),
        "react": expect.any(String),
        "react-dom": expect.any(String)
      })
    );
    expect(packageJson.devDependencies).toEqual(
      expect.objectContaining({
        "@codemirror/commands": expect.any(String),
        "@codemirror/state": expect.any(String),
        "@codemirror/view": expect.any(String),
        "micromark": expect.any(String),
        "react": expect.any(String),
        "react-dom": expect.any(String)
      })
    );
  });

  it("does not package the CLI-driven test harness into the Windows installer payload", () => {
    const configPath = path.join(process.cwd(), "electron-builder.json");
    const config = JSON.parse(readFileSync(configPath, "utf8")) as {
      files?: string[];
    };

    expect(config.files ?? []).not.toEqual(
      expect.arrayContaining(["dist-cli/**/*", "!dist-cli/**/*.map"])
    );
  });

  it("ignores the release output directory", () => {
    const gitignorePath = path.join(process.cwd(), ".gitignore");
    const gitignoreSource = readFileSync(gitignorePath, "utf8");

    expect(gitignoreSource).toContain("release");
  });

  it("centralizes Windows batch entries under tools/", () => {
    const batchPath = path.join(process.cwd(), "tools", "package-win.bat");
    const batchSource = readFileSync(batchPath, "utf8");
    const legacyRootPath = path.join(process.cwd(), "package-win.bat");

    expect(batchSource).toContain("@echo off");
    expect(batchSource).toContain('cd /d "%~dp0\\.."');
    expect(batchSource).toContain("call npm.cmd run package:win");
    expect(existsSync(legacyRootPath)).toBe(false);
  });

  it("uses a dedicated Windows packaging script that disables the unstable asar integrity write and handles GitHub release upload", () => {
    const scriptPath = path.join(process.cwd(), "scripts", "build-win-release.mjs");
    const scriptSource = readFileSync(scriptPath, "utf8");

    expect(scriptSource).toContain("disableAsarIntegrity: true");
    expect(scriptSource).toContain("git credential fill");
    expect(scriptSource).toContain("Published GitHub Release");
    expect(scriptSource).toContain("patchWindowsExecutableIcon");
  });

  it("centralizes the Windows dev app entry under tools/", () => {
    const batchPath = path.join(process.cwd(), "tools", "dev-app.bat");
    const batchSource = readFileSync(batchPath, "utf8");
    const syncScriptPath = path.join(process.cwd(), "scripts", "sync-dev-themes.mjs");
    const syncScriptSource = readFileSync(syncScriptPath, "utf8");
    const legacyRootPath = path.join(process.cwd(), "dev-app.bat");

    expect(batchSource).toContain("@echo off");
    expect(batchSource).toContain('cd /d "%~dp0\\.."');
    expect(batchSource).toContain("node scripts/sync-dev-themes.mjs");
    expect(batchSource).toContain("call npm run dev");
    expect(syncScriptSource).toContain("Yulora-dev");
    expect(syncScriptSource).toContain("fixtures");
    expect(syncScriptSource).toContain("themes");
    expect(existsSync(legacyRootPath)).toBe(false);
  });

  it("centralizes the macOS dev app entry under tools/", () => {
    const shellPath = path.join(process.cwd(), "tools", "dev-app.sh");
    const shellSource = readFileSync(shellPath, "utf8");
    const legacyHyphenPath = path.join(process.cwd(), "dev-app.sh");
    const legacyUnderscorePath = path.join(process.cwd(), "dev_app.sh");

    expect(shellSource).toContain("#!/usr/bin/env bash");
    expect(shellSource).toContain('cd "$(dirname "$0")/.."');
    expect(shellSource).toContain("node scripts/sync-dev-themes.mjs");
    expect(shellSource).toContain("npm run dev");
    expect(existsSync(legacyHyphenPath)).toBe(false);
    expect(existsSync(legacyUnderscorePath)).toBe(false);
  });

  it("skips syncing dev themes when the fixture themes directory is missing", () => {
    const tempRoot = mkdtempSync(path.join(os.tmpdir(), "yulora-sync-dev-themes-"));

    try {
      const scriptsDirectory = path.join(tempRoot, "scripts");
      const appDataDirectory =
        process.platform === "win32"
          ? path.join(tempRoot, "appdata")
          : process.platform === "darwin"
            ? path.join(tempRoot, "home", "Library", "Application Support")
            : path.join(tempRoot, "xdg-config");
      const targetThemesDirectory = path.join(appDataDirectory, "Yulora-dev", "themes");
      const scriptSourcePath = path.join(process.cwd(), "scripts", "sync-dev-themes.mjs");
      const tempScriptPath = path.join(scriptsDirectory, "sync-dev-themes.mjs");
      const env = { ...process.env };

      mkdirSync(scriptsDirectory, { recursive: true });
      mkdirSync(appDataDirectory, { recursive: true });
      cpSync(scriptSourcePath, tempScriptPath);

      if (process.platform === "win32") {
        env.APPDATA = appDataDirectory;
      } else {
        env.HOME = path.join(tempRoot, "home");
        delete env.APPDATA;

        if (process.platform === "linux") {
          env.XDG_CONFIG_HOME = appDataDirectory;
        } else {
          delete env.XDG_CONFIG_HOME;
        }
      }

      expect(() =>
        execFileSync(process.execPath, [tempScriptPath], {
          cwd: tempRoot,
          env,
          stdio: "pipe"
        })
      ).not.toThrow();

      expect(existsSync(targetThemesDirectory)).toBe(true);
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("centralizes the macOS packaging entry under tools/", () => {
    const shellPath = path.join(process.cwd(), "tools", "package-macos.sh");
    const shellSource = readFileSync(shellPath, "utf8");
    const legacyRootPath = path.join(process.cwd(), "package-macos.sh");

    expect(shellSource).toContain("#!/usr/bin/env bash");
    expect(shellSource).toContain('cd "$(dirname "$0")/.."');
    expect(shellSource).toContain('if [[ "$(uname)" != "Darwin" ]]');
    expect(shellSource).toContain("npm run package:mac");
    expect(shellSource).not.toContain("macOS packaging is not implemented yet");
    expect(existsSync(legacyRootPath)).toBe(false);
  });

  it("provides release wrappers under tools/", () => {
    const windowsReleasePath = path.join(process.cwd(), "tools", "release-win.bat");
    const windowsReleaseSource = readFileSync(windowsReleasePath, "utf8");
    const macosReleasePath = path.join(process.cwd(), "tools", "release-macos.sh");
    const macosReleaseSource = readFileSync(macosReleasePath, "utf8");

    expect(windowsReleaseSource).toContain("@echo off");
    expect(windowsReleaseSource).toContain('cd /d "%~dp0\\.."');
    expect(windowsReleaseSource).toContain("call npm.cmd run release:win");
    expect(macosReleaseSource).toContain("#!/usr/bin/env bash");
    expect(macosReleaseSource).toContain('cd "$(dirname "$0")/.."');
    expect(macosReleaseSource).toContain("macOS release is not implemented yet");
    expect(macosReleaseSource).toContain("exit 1");
  });
});
