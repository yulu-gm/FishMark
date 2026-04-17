import type { ThemeEffectsMode } from "../../shared/theme-package";
import { ThemeSurfaceHost, type ThemeSurfaceHostDescriptor } from "./ThemeSurfaceHost";
import type { TitlebarItem, TitlebarLayoutDescriptor, TitlebarSlot } from "./titlebar-layout";
import type { ThemeSurfaceRuntimeMode } from "../shader/theme-surface-runtime";

type TitlebarHostProps = {
  platform: NodeJS.Platform;
  layout: TitlebarLayoutDescriptor;
  title: string;
  isDirty: boolean;
  effectsMode: ThemeEffectsMode;
  titlebarSurface: ThemeSurfaceHostDescriptor | null;
  onTitlebarSurfaceRuntimeModeChange?: (mode: ThemeSurfaceRuntimeMode | null) => void;
};

function renderTitlebarItem(
  item: TitlebarItem,
  input: Pick<TitlebarHostProps, "platform" | "title" | "isDirty">
) {
  switch (item) {
    case "app-icon":
      return (
        <span
          className="app-titlebar-app-icon"
          aria-hidden="true"
        >
          Y
        </span>
      );
    case "document-title":
      return (
        <span
          className="app-titlebar-document-title"
          title={input.title}
        >
          {input.title}
        </span>
      );
    case "dirty-indicator":
      return (
        <span
          className="app-titlebar-dirty-indicator"
          data-state={input.isDirty ? "dirty" : "saved"}
          aria-label={input.isDirty ? "Unsaved changes" : "All changes saved"}
          title={input.isDirty ? "Unsaved changes" : "All changes saved"}
        />
      );
    case "theme-toggle":
      return (
        <span className="app-titlebar-theme-toggle">
          Theme
        </span>
      );
    case "window-actions":
      return (
        <span
          className="app-titlebar-window-actions"
          data-platform={input.platform}
          aria-hidden="true"
        />
      );
  }
}

function TitlebarSlotView({
  slot,
  platform,
  items,
  isDragRegion,
  title,
  isDirty
}: {
  slot: TitlebarSlot;
  platform: NodeJS.Platform;
  items: TitlebarItem[];
  isDragRegion: boolean;
  title: string;
  isDirty: boolean;
}) {
  return (
    <div
      className="app-titlebar-slot"
      data-yulora-titlebar-slot={slot}
      data-yulora-drag-region={isDragRegion ? "true" : "false"}
    >
      {items.map((item) => (
        <div
          key={`${slot}-${item}`}
          className="app-titlebar-item"
          data-yulora-titlebar-item={item}
        >
          {renderTitlebarItem(item, {
            platform,
            title,
            isDirty
          })}
        </div>
      ))}
    </div>
  );
}

export function TitlebarHost({
  platform,
  layout,
  title,
  isDirty,
  effectsMode,
  titlebarSurface,
  onTitlebarSurfaceRuntimeModeChange
}: TitlebarHostProps) {
  return (
    <header
      className="app-titlebar"
      data-yulora-role="titlebar"
      data-platform={platform}
      data-compact-when-narrow={layout.compactWhenNarrow ? "true" : "false"}
      style={{ height: `${layout.height}px` }}
    >
      {titlebarSurface ? (
        <ThemeSurfaceHost
          surface="titlebarBackdrop"
          descriptor={titlebarSurface}
          effectsMode={effectsMode}
          onRuntimeModeChange={onTitlebarSurfaceRuntimeModeChange}
        />
      ) : null}

      {(["leading", "center", "trailing"] as const).map((slot) => (
        <TitlebarSlotView
          key={slot}
          slot={slot}
          platform={platform}
          items={layout.slots[slot]}
          isDragRegion={layout.dragRegions.includes(slot)}
          title={title}
          isDirty={isDirty}
        />
      ))}
    </header>
  );
}
