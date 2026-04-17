import { execFile } from "node:child_process";

export type RunCommandResult = {
  stdout: string;
  stderr: string;
};

export type RunCommand = (
  file: string,
  args: string[]
) => Promise<RunCommandResult>;

export type FontCatalogService = {
  listFontFamilies: () => Promise<string[]>;
};

export type CreateFontCatalogServiceInput = {
  platform: NodeJS.Platform;
  runCommand?: RunCommand;
};

const DEFAULT_WINDOWS_COMMAND = {
  file: "powershell.exe",
  args: [
    "-NoProfile",
    "-Command",
    "Add-Type -AssemblyName PresentationCore; [System.Windows.Media.Fonts]::SystemFontFamilies | ForEach-Object { $_.Source }"
  ]
} as const;

const DEFAULT_MACOS_COMMAND = {
  file: "system_profiler",
  args: ["SPFontsDataType", "-json"]
} as const;

export function createFontCatalogService(
  input: CreateFontCatalogServiceInput
): FontCatalogService {
  const runCommand = input.runCommand ?? defaultRunCommand;

  async function listFontFamilies(): Promise<string[]> {
    try {
      if (input.platform === "win32") {
        const result = await runCommand(
          DEFAULT_WINDOWS_COMMAND.file,
          [...DEFAULT_WINDOWS_COMMAND.args]
        );
        return normalizeFontFamilies(result.stdout.split(/\r?\n/u));
      }

      if (input.platform === "darwin") {
        const result = await runCommand(
          DEFAULT_MACOS_COMMAND.file,
          [...DEFAULT_MACOS_COMMAND.args]
        );
        return normalizeFontFamilies(parseMacOsFontFamilies(result.stdout));
      }

      return [];
    } catch {
      return [];
    }
  }

  return {
    listFontFamilies
  };
}

async function defaultRunCommand(
  file: string,
  args: string[]
): Promise<RunCommandResult> {
  return new Promise((resolve, reject) => {
    execFile(file, args, { encoding: "utf8", windowsHide: true }, (error, stdout, stderr) => {
      if (error) {
        reject(error);
        return;
      }

      resolve({
        stdout,
        stderr
      });
    });
  });
}

function parseMacOsFontFamilies(stdout: string): string[] {
  const parsed = JSON.parse(stdout) as {
    SPFontsDataType?: Array<{ family?: unknown }>;
  };

  return (parsed.SPFontsDataType ?? [])
    .map((entry) => (typeof entry.family === "string" ? entry.family : ""))
    .filter((family) => family.length > 0);
}

function normalizeFontFamilies(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter((value) => value.length > 0))].sort(
    (left, right) => left.localeCompare(right)
  );
}
