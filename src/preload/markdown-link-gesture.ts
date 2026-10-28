export interface MarkdownLinkGesture {
  consume(href: string): boolean;
}

export function installMarkdownLinkGesture(target: Window): MarkdownLinkGesture {
  let pending: string | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  // 在隔离世界记录真实输入，renderer 无法用 dispatchEvent 或直接调用 bridge 伪造授权。
  target.addEventListener("mousedown", (event) => {
    pending = null;
    clearTimeout(timer);
    if (!event.isTrusted || event.button !== 0 || (!event.ctrlKey && !event.metaKey)) return;
    const element = event.target instanceof Element ? event.target : null;
    const link = element?.closest("[data-fishmark-link-href]");
    if (!link?.closest(".cm-editor")) return;
    pending = link.getAttribute("data-fishmark-link-href");
    timer = setTimeout(() => { pending = null; }, 0);
  }, true);
  return {
    consume(href) {
      const accepted = pending !== null && pending === href;
      pending = null;
      clearTimeout(timer);
      return accepted;
    }
  };
}
