export const PREPARE_MARKDOWN_LINK_CHANNEL = "fishmark:prepare-markdown-link";

export type PrepareMarkdownLinkInput = { tabId: string; href: string };

// 网络协议仍交给原有外链接口；本地入口只接受相对 Markdown 路径。
export function isRelativeMarkdownLink(href: string): boolean {
  const value = href.trim();
  if (!value || /^[a-z][a-z0-9+.-]*:/i.test(value) || /^[\\/#?]/.test(value)) return false;
  try {
    const pathname = decodeURIComponent(value.split(/[?#]/, 1)[0]!);
    const hasControl = Array.from(pathname).some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);
    return !hasControl && !pathname.includes(":") && !/^[\\/]/.test(pathname) && /\.(md|markdown)$/i.test(pathname);
  } catch { return false; }
}
