// @vitest-environment jsdom
import { act, StrictMode, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  DEFAULT_PREFERENCES,
  mergePreferences,
  type Preferences,
  type PreferencesUpdate,
  type UpdatePreferencesResult
} from "../../shared/preferences";
import { SettingsView } from "./settings-view";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

function checkbox(id: "brackets" | "markdown"): HTMLInputElement {
  const input = container.querySelector<HTMLInputElement>(`#settings-auto-pair-${id}`);
  expect(input).not.toBeNull();
  return input!;
}

async function clickButton(text: string): Promise<void> {
  const button = [...container.querySelectorAll("button")]
    .find((element) => element.textContent?.trim() === text);
  expect(button).toBeDefined();
  await act(async () => button!.click());
}

async function renderSettings(initial: Preferences = DEFAULT_PREFERENCES) {
  const onUpdate = vi.fn(async (patch: PreferencesUpdate, current: Preferences): Promise<UpdatePreferencesResult> => ({
    status: "success", preferences: mergePreferences(current, patch)
  }));
  function Harness() {
    const [preferences, setPreferences] = useState(initial);
    return (
      <SettingsView
        surfaceState="open"
        preferences={preferences}
        fontFamilies={[]}
        themePackages={[]}
        isRefreshingThemes={false}
        onRefreshThemes={async () => {}}
        onOpenThemesDirectory={async () => {}}
        onSelectTemporaryImageDirectory={async () => null}
        onOpenExternalLink={() => {}}
        onClose={() => {}}
        onUpdate={async (patch) => {
          const result = await onUpdate(patch, preferences);
          if (result.status === "success") setPreferences(result.preferences);
          return result;
        }}
      />
    );
  }
  await act(async () => root.render(<StrictMode><Harness /></StrictMode>));
  await clickButton("自动配对");
  return onUpdate;
}

it("shows pairing defaults with accessible English labels and saves each toggle immediately", async () => {
  const onUpdate = await renderSettings();
  expect(container.querySelector('[data-fishmark-settings-section="auto-pairing"]')).not.toBeNull();
  expect(checkbox("brackets").checked).toBe(true);
  expect(checkbox("markdown").checked).toBe(false);
  expect(document.getElementById(checkbox("brackets").getAttribute("aria-labelledby")!)?.textContent)
    .toBe("自动配对括号与引号");
  expect(document.getElementById(checkbox("markdown").getAttribute("aria-labelledby")!)?.textContent)
    .toBe("自动配对 Markdown 符号");
  expect(onUpdate).not.toHaveBeenCalled();

  await act(async () => checkbox("brackets").click());
  expect(onUpdate).toHaveBeenCalledTimes(1);
  expect(onUpdate.mock.calls[0]?.[0]).toEqual({ editing: { autoPairBrackets: false } });
  expect(checkbox("brackets").checked).toBe(false);
  expect(checkbox("markdown").checked).toBe(false);

  await act(async () => checkbox("markdown").click());
  expect(onUpdate).toHaveBeenCalledTimes(2);
  expect(onUpdate.mock.calls[1]?.[0]).toEqual({ editing: { autoPairMarkdown: true } });
  expect(checkbox("brackets").checked).toBe(false);
  expect(checkbox("markdown").checked).toBe(true);
  expect(container.querySelector(".settings-save-status")?.textContent).toBe("已保存更改");

  await clickButton("主题");
  await clickButton("自动配对");
  expect(checkbox("brackets").checked).toBe(false);
  expect(checkbox("markdown").checked).toBe(true);
});

it("restores both pairing defaults with the existing reset action", async () => {
  const onUpdate = await renderSettings(mergePreferences(DEFAULT_PREFERENCES, {
    editing: { autoPairBrackets: false, autoPairMarkdown: true }
  }));
  expect(checkbox("brackets").checked).toBe(false);
  expect(checkbox("markdown").checked).toBe(true);
  await clickButton("恢复默认值");
  expect(onUpdate).toHaveBeenCalledTimes(1);
  expect(onUpdate.mock.calls[0]?.[0].editing).toEqual({ autoPairBrackets: true, autoPairMarkdown: false });
  expect(checkbox("brackets").checked).toBe(true);
  expect(checkbox("markdown").checked).toBe(false);
});

it.each(["write-failed", "commit-failed", "rejected"] as const)(
  "retains the saved checkbox state and allows retry after %s",
  async (failure) => {
    const onUpdate = await renderSettings();
    if (failure === "rejected") onUpdate.mockRejectedValueOnce(new Error("Preferences unavailable"));
    else onUpdate.mockResolvedValueOnce({
      status: "error",
      error: { code: failure, message: "Preferences unavailable" },
      preferences: DEFAULT_PREFERENCES
    });

    await act(async () => checkbox("markdown").click());
    expect(checkbox("markdown").checked).toBe(false);
    expect(checkbox("brackets").checked).toBe(true);
    expect(checkbox("markdown").disabled).toBe(false);
    expect(container.querySelector('[role="alert"]')?.textContent).toBe("Preferences unavailable");
    expect(container.querySelector(".settings-save-status")?.textContent).not.toBe("已保存更改");

    await act(async () => checkbox("markdown").click());
    expect(checkbox("markdown").checked).toBe(true);
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(onUpdate).toHaveBeenCalledTimes(2);
  }
);

it("waits for persistence before enabling another partial pairing update", async () => {
  const onUpdate = await renderSettings();
  let finishSave!: (result: UpdatePreferencesResult) => void;
  onUpdate.mockImplementationOnce(() => new Promise((resolve) => { finishSave = resolve; }));

  await act(async () => checkbox("brackets").click());
  expect(checkbox("brackets").disabled).toBe(true);
  expect(checkbox("markdown").disabled).toBe(true);
  await act(async () => checkbox("markdown").click());
  expect(onUpdate).toHaveBeenCalledTimes(1);

  await act(async () => finishSave({
    status: "success",
    preferences: mergePreferences(DEFAULT_PREFERENCES, { editing: { autoPairBrackets: false } })
  }));
  expect(checkbox("brackets").checked).toBe(false);
  expect(checkbox("markdown").disabled).toBe(false);
  await act(async () => checkbox("markdown").click());
  expect(checkbox("brackets").checked).toBe(false);
  expect(checkbox("markdown").checked).toBe(true);
  expect(onUpdate).toHaveBeenCalledTimes(2);
});
