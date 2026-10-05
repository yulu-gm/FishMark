import type { Dispatch, SetStateAction } from "react";
import type { DraftState } from "./settings-inputs";
import { SettingsGroup, SettingsRow } from "./SettingsFields";
export function RecentFilesSettings({ draft, setDraft, handleRecentFilesMaxCommit }: {
  draft: DraftState;
  setDraft: Dispatch<SetStateAction<DraftState>>;
  handleRecentFilesMaxCommit: () => void;
}) {
  return (
    <SettingsGroup
      title="最近文件"
      description="记录最近打开过的文档数量上限。"
    >
      <SettingsRow>
        <label
          className="settings-label"
          htmlFor="settings-recent-max"
        >
          <span>最多保留条数</span>
          <span className="settings-hint">范围 0 - 100，设为 0 会隐藏最近文件列表。</span>
        </label>
        <input
          id="settings-recent-max"
          className="settings-input settings-input-narrow"
          type="number"
          min={0}
          max={100}
          value={draft.recentFilesMaxEntries}
          onChange={(event) =>
            setDraft((current) => ({
              ...current,
              recentFilesMaxEntries: event.target.value
            }))
          }
          onBlur={handleRecentFilesMaxCommit}
        />
      </SettingsRow>
    </SettingsGroup>
  );
}
