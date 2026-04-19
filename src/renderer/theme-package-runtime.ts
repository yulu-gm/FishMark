export const THEME_STYLE_ORDER = ["tokens", "ui", "titlebar", "editor", "markdown"] as const;

type ThemeAppearanceMode = "light" | "dark";
type ThemeStylePart = (typeof THEME_STYLE_ORDER)[number];

export type ThemePackageRuntimeDescriptor = {
  id: string;
  tokens: Partial<Record<ThemeAppearanceMode, string>>;
  styles: Partial<Record<Exclude<ThemeStylePart, "tokens">, string>>;
};

type ThemePackageRuntime = {
  applyPackage: (themePackage: ThemePackageRuntimeDescriptor | null, mode: ThemeAppearanceMode) => void;
  clear: () => void;
};

function createThemeLink(document: Document, part: ThemeStylePart): HTMLLinkElement {
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.dataset.yuloraThemePart = part;
  link.setAttribute("data-yulora-theme-runtime", "active");
  return link;
}

function syncThemeLink(
  document: Document,
  mountedLinks: Map<ThemeStylePart, HTMLLinkElement>,
  part: ThemeStylePart,
  nextUrl: string | null,
  previousNode: HTMLLinkElement | null
): HTMLLinkElement | null {
  const existingLink = mountedLinks.get(part) ?? null;

  if (!nextUrl) {
    if (existingLink) {
      existingLink.remove();
      mountedLinks.delete(part);
    }
    return previousNode;
  }

  const link = existingLink ?? createThemeLink(document, part);
  if (link.getAttribute("href") !== nextUrl) {
    link.setAttribute("href", nextUrl);
  }

  if (!link.isConnected) {
    document.head.appendChild(link);
  }

  if (previousNode === null) {
    if (document.head.lastChild !== link) {
      document.head.appendChild(link);
    }
  } else if (link.previousSibling !== previousNode) {
    document.head.insertBefore(link, previousNode.nextSibling);
  }

  mountedLinks.set(part, link);
  return link;
}

export function createThemePackageRuntime(document: Document): ThemePackageRuntime {
  const mountedLinks = new Map<ThemeStylePart, HTMLLinkElement>();

  function clear(): void {
    for (const part of THEME_STYLE_ORDER) {
      const link = mountedLinks.get(part);
      if (!link) {
        continue;
      }

      link.remove();
      mountedLinks.delete(part);
    }
  }

  function applyPackage(
    themePackage: ThemePackageRuntimeDescriptor | null,
    mode: ThemeAppearanceMode
  ): void {
    if (!themePackage) {
      clear();
      return;
    }

    const partUrls = {
      tokens: themePackage.tokens[mode] ?? null,
      ui: themePackage.styles.ui ?? null,
      titlebar: themePackage.styles.titlebar ?? null,
      editor: themePackage.styles.editor ?? null,
      markdown: themePackage.styles.markdown ?? null
    };

    let previousNode: HTMLLinkElement | null = null;

    for (const part of THEME_STYLE_ORDER) {
      previousNode = syncThemeLink(document, mountedLinks, part, partUrls[part], previousNode);
    }
  }

  return {
    applyPackage,
    clear
  };
}
