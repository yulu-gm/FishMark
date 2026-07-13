import type { TestScenario } from "../scenario";

export const appShellStartupScenario: TestScenario = {
  id: "app-shell-startup",
  title: "App shell starts with editor window visible",
  summary:
    "Launches the desktop shell and confirms the editor window renders with the empty workspace state.",
  surface: "editor",
  tags: ["smoke", "editor"],
  execution: { kind: "headless" },
  preconditions: ["dist artifacts built", "no prior editor window open"],
  steps: [
    {
      id: "launch-dev-shell",
      title: "Launch the desktop shell in editor mode",
      kind: "setup"
    },
    {
      id: "wait-for-empty-workspace",
      title: "Wait for the empty workspace hero to render",
      kind: "assertion",
      description: "Confirms the renderer mounts and the preload bridge is attached."
    },
    {
      id: "close-shell",
      title: "Close the window and confirm clean exit",
      kind: "teardown"
    }
  ]
};
