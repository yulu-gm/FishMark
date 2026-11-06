import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { WorkspaceTabStripItem } from "../../../shared/workspace";
import type { WorkspaceTabFileInput } from "../../../shared/workspace-tab-file";

export type WorkspaceTabMenuTarget = { tabId: string; x: number; y: number; trigger: HTMLElement };

export function WorkspaceTabMenu({ target, tab, platform, onDismiss, onClose, onSave, onFile }: {
  target: WorkspaceTabMenuTarget;
  tab: WorkspaceTabStripItem;
  platform: NodeJS.Platform;
  onDismiss(): void;
  onClose(tabId: string): void | Promise<void>;
  onSave(tabId: string): Promise<void>;
  onFile(input: WorkspaceTabFileInput): Promise<void>;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(tab.name);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const bounds = menu.getBoundingClientRect();
    menu.style.left = `${Math.max(4, Math.min(target.x, window.innerWidth - bounds.width - 4))}px`;
    menu.style.top = `${Math.max(4, Math.min(target.y, window.innerHeight - bounds.height - 4))}px`;
    menu.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
  }, [target]);

  useEffect(() => {
    if (renaming) {
      dialogRef.current?.showModal();
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(0, Math.max(0, tab.name.lastIndexOf(".")) || tab.name.length);
      return;
    }
    const outside = (event: PointerEvent) => { if (!menuRef.current?.contains(event.target as Node)) onDismiss(); };
    window.addEventListener("pointerdown", outside, true);
    window.addEventListener("blur", onDismiss);
    window.addEventListener("resize", onDismiss);
    return () => {
      window.removeEventListener("pointerdown", outside, true);
      window.removeEventListener("blur", onDismiss);
      window.removeEventListener("resize", onDismiss);
    };
  }, [renaming, onDismiss, tab.name]);

  function dismiss() { onDismiss(); if (target.trigger.isConnected) target.trigger.focus(); }
  async function run(operation: () => void | Promise<void>) {
    if (busy) return;
    setBusy(true); setError("");
    try { await operation(); dismiss(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "操作失败，请重试。"); }
    finally { setBusy(false); }
  }

  return createPortal(renaming ? (
    <dialog ref={dialogRef} className="workspace-tab-rename" aria-labelledby="workspace-tab-rename-title"
      onCancel={event => { event.preventDefault(); if (!busy) dismiss(); }}>
      <form onSubmit={event => { event.preventDefault(); void run(() => onFile({ tabId: tab.tabId, command: "rename", name })); }}>
        <h2 id="workspace-tab-rename-title">重命名文件</h2>
        <label htmlFor="workspace-tab-name">文件名</label>
        <input ref={inputRef} id="workspace-tab-name" value={name} disabled={busy} autoComplete="off"
          onChange={event => setName(event.target.value)} />
        <p className="workspace-tab-rename-hint">在原目录中重命名，未保存的编辑会保留。</p>
        {error && <p role="alert">{error}</p>}
        <div className="workspace-tab-rename-actions">
          <button type="button" disabled={busy} onClick={dismiss}>取消</button>
          <button type="submit" disabled={busy || !name.trim()}>{busy ? "正在重命名…" : "重命名"}</button>
        </div>
      </form>
    </dialog>
  ) : (
    <div ref={menuRef} className="workspace-tab-menu" role="menu" aria-label={`${tab.name} 页签菜单`}
      style={{ left: target.x, top: target.y }} onContextMenu={event => event.preventDefault()}
      onKeyDown={event => {
        if (event.key === "Escape" || event.key === "Tab") { event.preventDefault(); dismiss(); return; }
        if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
        const index = items.indexOf(document.activeElement as HTMLButtonElement);
        const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
        items[next]?.focus();
      }}>
      <button role="menuitem" disabled={busy} onClick={() => void run(() => onClose(tab.tabId))}>关闭</button>
      <button role="menuitem" disabled={busy} onClick={() => void run(() => onSave(tab.tabId))}>保存</button>
      <button role="menuitem" disabled={busy || tab.path === null} onClick={() => setRenaming(true)}>重命名…</button>
      <div role="separator" />
      <button role="menuitem" disabled={busy || tab.path === null} onClick={() => void run(() => onFile({ tabId: tab.tabId, command: "copy-path" }))}>复制文件路径</button>
      <button role="menuitem" disabled={busy || tab.path === null} onClick={() => void run(() => onFile({ tabId: tab.tabId, command: "reveal" }))}>
        {platform === "darwin" ? "在 Finder 中显示" : platform === "win32" ? "在资源管理器中打开" : "在文件管理器中打开"}
      </button>
      {tab.path === null && <p className="workspace-tab-menu-hint">保存后可重命名、复制路径及定位文件</p>}
      {error && <p role="alert">{error}</p>}
    </div>
  ), document.body);
}
