import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect } from "./product-fixture.mjs";

// Only this fixture's real native prompt is answered; no OS key/mouse injection,
// Electron dialog replacement or fabricated response is used.
export async function chooseClosePrompt(product, choice, trigger) {
  const before = (await product.mainEvidence()).filter(e => e.event === "dialog:message-box").length;
  const output = product.testInfo.outputPath(`launch-${product.current.index}-close-prompt-${before + 1}.json`);
  let child;
  const done = new Promise(resolveDone => {
    child = execFile("pwsh.exe", ["-NoProfile", "-File", resolve("tests/e2e/windows-close-dialog.ps1"),
      "-TelemetryPath", product.current.telemetryPath, "-OutputPath", output, "-Choice", choice, "-PromptIndex", String(before + 1)],
    { windowsHide: true, timeout: 30_000 }, (error, stdout, stderr) => resolveDone({ error: error?.message, stdout, stderr }));
  });
  try {
    await trigger();
    const result = await done;
    await product.testInfo.attach(`native-close-${before + 1}`, { path: output, contentType: "application/json" });
    expect(result, JSON.stringify(result)).not.toHaveProperty("error", expect.any(String));
    const proof = JSON.parse(await readFile(output, "utf8"));
    expect(proof.status).toBe("passed");
    expect(proof.identity.pid).toBe(product.current.identity.pid);
    await expect.poll(async () => (await product.mainEvidence()).filter(e => e.event === "dialog:message-box-returned").length).toBe(before + 1);
    const actual = (await product.mainEvidence()).filter(e => e.event === "dialog:message-box-returned").at(-1);
    expect(actual.detail.result.response).toBe(["Save", "Don't Save", "Cancel"].indexOf(choice));
    return proof;
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill();
    await done;
  }
}
