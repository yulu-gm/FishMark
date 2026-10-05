import type { Dispatch, SetStateAction } from "react";
import type { DraftState } from "./settings-inputs";
import { SettingsGroup, SettingsRow } from "./SettingsFields";
export function AutosaveSettings({ draft, setDraft, handleIdleDelayCommit }: {
  draft: DraftState;
  setDraft: Dispatch<SetStateAction<DraftState>>;
  handleIdleDelayCommit: () => void;
}) {
  return (
    <SettingsGroup
      title="自动保存"
      description="停止输入后等待的时长，单位毫秒。"
    >
      <SettingsRow>
        <label
          className="settings-label"
          htmlFor="settings-autosave-delay"
        >
          <span>空闲触发时长</span>
          <span className="settings-hint">范围 100 - 60000 ms。</span>
        </label>
        <input
          id="settings-autosave-delay"
          className="settings-input settings-input-narrow"
          type="number"
          min={100}
          max={60000}
          value={draft.autosaveIdleDelayMs}
          onChange={(event) =>
            setDraft((current) => ({ ...current, autosaveIdleDelayMs: event.target.value }))
          }
          onBlur={handleIdleDelayCommit}
        />
      </SettingsRow>
    </SettingsGroup>
  );
}
