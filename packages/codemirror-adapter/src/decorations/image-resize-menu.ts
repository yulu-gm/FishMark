const openMenus = new WeakMap<HTMLElement, () => void>();

export function closeImageResizeMenu(container: HTMLElement): void {
  openMenus.get(container)?.();
}

export function showImageResizeMenu(container: HTMLElement, x: number, y: number, select: (scale: number) => void): void {
  closeImageResizeMenu(container);
  const menu = document.createElement("div");
  menu.className = "cm-image-resize-menu";
  menu.setAttribute("role", "menu");
  menu.setAttribute("aria-label", "缩放图片");
  menu.addEventListener("mousedown", event => event.stopPropagation());
  for (const scale of [25, 50, 75, 100]) {
    const item = document.createElement("button");
    item.type = "button";
    item.setAttribute("role", "menuitem");
    item.textContent = `原图 ${scale}%`;
    item.addEventListener("click", event => { event.stopPropagation(); close(); select(scale / 100); });
    menu.appendChild(item);
  }
  const close = () => {
    document.removeEventListener("pointerdown", outside, true);
    document.removeEventListener("keydown", keydown, true);
    window.removeEventListener("blur", close);
    menu.remove();
    openMenus.delete(container);
  };
  const outside = (event: PointerEvent) => { if (!menu.contains(event.target as Node)) close(); };
  const keydown = (event: KeyboardEvent) => {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); }
  };
  container.appendChild(menu);
  menu.style.left = `${Math.max(0, Math.min(x, window.innerWidth - menu.offsetWidth))}px`;
  menu.style.top = `${Math.max(0, Math.min(y, window.innerHeight - menu.offsetHeight))}px`;
  document.addEventListener("pointerdown", outside, true);
  document.addEventListener("keydown", keydown, true);
  window.addEventListener("blur", close);
  openMenus.set(container, close);
  menu.querySelector<HTMLButtonElement>("button")?.focus();
}
