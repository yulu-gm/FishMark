export const THEME_PARTS = ["tokens", "ui", "editor", "markdown"] as const;

export type ThemePart = (typeof THEME_PARTS)[number];
export type ThemeAppearanceMode = "light" | "dark";

export type ThemeDescriptor = {
  id: string;
  source: "builtin" | "community";
  partUrls: Partial<Record<ThemePart, string>>;
};

type ThemeRuntime = {
  applyTheme: (theme: ThemeDescriptor | null) => void;
  clear: () => void;
};

const BUILTIN_THEME_PART_URLS: Record<ThemeAppearanceMode, Record<ThemePart, string>> = {
  light: {
    tokens: new URL("./styles/themes/default/light/tokens.css", import.meta.url).href,
    ui: new URL("./styles/themes/default/light/ui.css", import.meta.url).href,
    editor: new URL("./styles/themes/default/light/editor.css", import.meta.url).href,
    markdown: new URL("./styles/themes/default/light/markdown.css", import.meta.url).href
  },
  dark: {
    tokens: new URL("./styles/themes/default/dark/tokens.css", import.meta.url).href,
    ui: new URL("./styles/themes/default/dark/ui.css", import.meta.url).href,
    editor: new URL("./styles/themes/default/dark/editor.css", import.meta.url).href,
    markdown: new URL("./styles/themes/default/dark/markdown.css", import.meta.url).href
  }
};

function createThemeLink(document: Document, part: ThemePart): HTMLLinkElement {
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.dataset.yuloraThemePart = part;
  link.setAttribute("data-yulora-theme-runtime", "active");
  return link;
}

export function resolveBuiltinThemeDescriptor(
  mode: ThemeAppearanceMode
): ThemeDescriptor {
  return {
    id: "default",
    source: "builtin",
    partUrls: BUILTIN_THEME_PART_URLS[mode]
  };
}

export function createThemeRuntime(document: Document): ThemeRuntime {
  const mountedLinks = new Map<ThemePart, HTMLLinkElement>();

  function clear(): void {
    for (const part of THEME_PARTS) {
      const link = mountedLinks.get(part);
      if (!link) {
        continue;
      }

      link.remove();
      mountedLinks.delete(part);
    }
  }

  function applyTheme(theme: ThemeDescriptor | null): void {
    if (!theme) {
      clear();
      return;
    }

    let previousNode: HTMLLinkElement | null = null;

    for (const part of THEME_PARTS) {
      const nextUrl = theme.partUrls[part];
      const existingLink = mountedLinks.get(part) ?? null;

      if (!nextUrl) {
        if (existingLink) {
          existingLink.remove();
          mountedLinks.delete(part);
        }
        continue;
      }

      const link = existingLink ?? createThemeLink(document, part);
      if (link.getAttribute("href") !== nextUrl) {
        link.setAttribute("href", nextUrl);
      }

      if (!link.isConnected) {
        document.head.appendChild(link);
      }

      const anchor = previousNode?.nextSibling ?? document.head.firstChild;
      if (link.previousSibling !== previousNode || (previousNode === null && document.head.firstChild !== link)) {
        document.head.insertBefore(link, anchor);
      }

      mountedLinks.set(part, link);
      previousNode = link;
    }
  }

  return {
    applyTheme,
    clear
  };
}
