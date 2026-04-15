export const STARTUP_OPEN_PATH_ARGUMENT_PREFIX = "--yulora-startup-open-path=";

export function formatStartupOpenPathArgument(targetPath: string): string {
  return `${STARTUP_OPEN_PATH_ARGUMENT_PREFIX}${encodeURIComponent(targetPath)}`;
}

export function resolveStartupOpenPathFromArgv(argv: string[]): string | null {
  const startupArgument = argv.find((entry) => entry.startsWith(STARTUP_OPEN_PATH_ARGUMENT_PREFIX));
  const encodedPath = startupArgument?.slice(STARTUP_OPEN_PATH_ARGUMENT_PREFIX.length);

  if (!encodedPath) {
    return null;
  }

  try {
    return decodeURIComponent(encodedPath);
  } catch {
    return encodedPath;
  }
}

export function resolveMarkdownLaunchPathFromArgv(argv: string[]): string | null {
  const launchPath = [...argv]
    .reverse()
    .find((entry) => !entry.startsWith("-") && /\.(md|markdown)$/i.test(entry));

  return launchPath ?? null;
}
