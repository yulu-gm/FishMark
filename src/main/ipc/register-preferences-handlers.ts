import type { IpcRegistration } from "./ipc-lifecycle";
import type { AuthorizeIpcSender } from "./ipc-sender";
import * as request from "./request-validation";
import { GET_PREFERENCES_CHANNEL, UPDATE_PREFERENCES_CHANNEL, SELECT_TEMPORARY_IMAGE_DIRECTORY_CHANNEL, type PreferencesUpdate } from "../../shared/preferences";
import type { createPreferencesService } from "../preferences-service";

export function registerPreferencesHandlers({ ipc, authorize, service, selectTemporaryDirectory }: {
  ipc: IpcRegistration;
  authorize: AuthorizeIpcSender;
  service: Pick<ReturnType<typeof createPreferencesService>, "getPreferences" | "updatePreferences">;
  selectTemporaryDirectory(): Promise<string | null>;
}): void {
  ipc.handle(GET_PREFERENCES_CHANNEL, async (event, ...args) => {
    const check = authorize(event, ["product", "editor-test", "test-workbench"]);
    request.noArguments(args);
    const result = await service.getPreferences();
    check();
    return result;
  });
  ipc.handle(UPDATE_PREFERENCES_CHANNEL, async (event, ...args) => {
    const check = authorize(event, ["product", "editor-test", "test-workbench"]);
    const value = request.oneArgument(args);
    validatePreferencesPatch(value);
    const result = await service.updatePreferences(value);
    check();
    return result;
  });
  ipc.handle(SELECT_TEMPORARY_IMAGE_DIRECTORY_CHANNEL, async (event, ...args) => {
    const check = authorize(event, ["product", "editor-test", "test-workbench"]);
    request.noArguments(args);
    const result = await selectTemporaryDirectory();
    check();
    return result;
  });
}

function validatePreferencesPatch(value: unknown): asserts value is PreferencesUpdate {
  request.record(value);
  const sections: Record<string, Record<string, "number" | "nullable-number" | "nullable-string" | "mode" | "effects" | "parameters">> = {
    autosave: { idleDelayMs: "number" }, recentFiles: { maxEntries: "number" },
    ui: { fontFamily: "nullable-string", fontSize: "nullable-number", sidePanelWidth: "nullable-number" },
    document: { fontFamily: "nullable-string", cjkFontFamily: "nullable-string", fontSize: "nullable-number" },
    images: { temporaryDirectory: "nullable-string" },
    theme: { mode: "mode", selectedId: "nullable-string", effectsMode: "effects", parameters: "parameters" }
  };
  for (const [section, patch] of Object.entries(value)) {
    const fields = sections[section];
    if (!fields || !Object.hasOwn(sections, section)) request.invalidRequest();
    request.record(patch);
    for (const [key, field] of Object.entries(patch)) {
      if (!Object.hasOwn(fields, key)) request.invalidRequest();
      const kind = fields[key];
      if (kind === "parameters") {
        request.record(field);
        for (const parameters of Object.values(field)) {
          request.record(parameters);
          if (Object.values(parameters).some((number) => typeof number !== "number" || !Number.isFinite(number))) request.invalidRequest();
        }
      } else if (kind === "mode") {
        if (!["system", "light", "dark"].includes(field as string)) request.invalidRequest();
      } else if (kind === "effects") {
        if (!["auto", "full", "off"].includes(field as string)) request.invalidRequest();
      } else if (kind === "nullable-string") {
        if (field !== null && typeof field !== "string") request.invalidRequest();
      } else if (!(field === null && kind === "nullable-number") &&
                 (typeof field !== "number" || !Number.isFinite(field))) request.invalidRequest();
    }
  }
}
