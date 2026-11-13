import { useState } from "react";
import type { EditingPreferences, PreferencesUpdate } from "../../../shared/preferences";
import { SettingsGroup, SettingsRow } from "./SettingsFields";

const PAIRING_OPTIONS = [
  {
    key: "autoPairBrackets",
    id: "settings-auto-pair-brackets",
    label: "自动配对括号与引号",
    description: "输入左括号或引号时补全另一侧；选中文字时包裹选区。"
  },
  {
    key: "autoPairMarkdown",
    id: "settings-auto-pair-markdown",
    label: "自动配对 Markdown 符号",
    description: "自动配对星号、下划线、反引号和美元符号。"
  }
] as const;

export function EditingSettings({ editing, applyPatch }: {
  editing: EditingPreferences;
  applyPatch: (patch: PreferencesUpdate) => Promise<void>;
}) {
  const [isSaving, setIsSaving] = useState(false);

  async function updatePairing(key: keyof EditingPreferences, checked: boolean): Promise<void> {
    // 保存期间禁用两个开关，避免并行提交的部分更新覆盖彼此。
    setIsSaving(true);
    try {
      await applyPatch({ editing: { [key]: checked } });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <SettingsGroup
      title="自动配对"
      description="选择输入时自动补全的符号，修改后立即保存。"
    >
      {PAIRING_OPTIONS.map(({ key, id, label, description }) => (
        <SettingsRow key={key}>
          <label className="settings-label" htmlFor={id}>
            <span id={`${id}-label`}>{label}</span>
            <span className="settings-hint" id={`${id}-hint`}>{description}</span>
          </label>
          <label className="settings-toggle">
            <input
              id={id}
              type="checkbox"
              aria-labelledby={`${id}-label`}
              aria-describedby={`${id}-hint`}
              checked={editing[key]}
              disabled={isSaving}
              onChange={(event) => void updatePairing(key, event.target.checked)}
            />
            <span className="settings-toggle-label">{editing[key] ? "开启" : "关闭"}</span>
          </label>
        </SettingsRow>
      ))}
    </SettingsGroup>
  );
}
