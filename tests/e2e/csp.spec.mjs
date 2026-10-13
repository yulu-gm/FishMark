import { createServer } from "node:http";
import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { test, expect } from "./product-fixture.mjs";

test("CSP blocks injected scripts event handlers eval and unrelated network requests", async ({ product }) => {
  const content = "CSP protected document\n";
  await product.seed(content, 60_000);
  const page = await product.launch(content);
  const consoleErrors = [];
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  await page.evaluate(() => {
    window.__rf903CspViolations = [];
    document.addEventListener("securitypolicyviolation", (event) => window.__rf903CspViolations.push({
      effectiveDirective: event.effectiveDirective, blockedURI: event.blockedURI,
      originalPolicy: event.originalPolicy, disposition: event.disposition
    }));
    const script = document.createElement("script");
    script.textContent = "window.__rf903InlineExecuted = true";
    document.head.append(script);
    script.remove();
  });
  // Same operation on the previous release executes. Keep this first to make
  // the baseline fail on behavior before any network test is attempted.
  expect(await page.evaluate(() => window.__rf903InlineExecuted)).toBeUndefined();
  await expect.poll(() => consoleErrors.length).toBe(1);
  expect(consoleErrors[0]).toMatch(/^Executing inline script violates the following Content Security Policy directive 'script-src 'self''\./);
  await product.expectCspConsoleError(consoleErrors[0]);

  await page.evaluate(() => {
    const button = document.createElement("button");
    button.setAttribute("onclick", "window.__rf903HandlerExecuted = true");
    document.body.append(button);
    button.click();
    button.remove();
  });
  expect(await page.evaluate(() => window.__rf903HandlerExecuted)).toBeUndefined();
  await expect.poll(() => consoleErrors.length).toBe(2);
  expect(consoleErrors[1]).toMatch(/^Executing inline event handler violates the following Content Security Policy directive 'script-src-attr 'none''\./);
  await product.expectCspConsoleError(consoleErrors[1]);

  const customScriptPath = join(dirname(product.documentPath), "untrusted.js");
  await writeFile(customScriptPath, "window.__rf903CustomExecuted = true");
  const customScriptUrl = `fishmark-asset://preview?path=${encodeURIComponent(customScriptPath.replace(/\\/g, "/"))}`;
  await page.evaluate(async (url) => {
    const script = document.createElement("script");
    script.src = url;
    await new Promise((done) => { script.onload = done; script.onerror = done; document.head.append(script); });
    script.remove();
  }, customScriptUrl);
  expect(await page.evaluate(() => window.__rf903CustomExecuted)).toBeUndefined();
  await expect.poll(() => consoleErrors.length).toBe(3);
  expect(consoleErrors[2]).toContain("violates the following Content Security Policy directive");
  expect(consoleErrors[2]).toContain("script-src 'self'");
  expect(consoleErrors[2]).toContain("fishmark-asset://preview");
  await product.expectCspConsoleError(consoleErrors[2]);

  const cdp = await product.current.app.context().newCDPSession(page);
  let evalProof;
  try {
    evalProof = await cdp.send("Runtime.evaluate", {
      expression: '(() => { try { eval("window.__rf903EvalExecuted = true"); return { executed: true }; } catch (error) { return { name: error.name, message: error.message }; } })()',
      allowUnsafeEvalBlockedByCSP: false, returnByValue: true
    });
  } finally { await cdp.detach(); }
  expect(evalProof.exceptionDetails).toBeUndefined();
  expect(evalProof.result.value.name).toBe("EvalError");
  expect(evalProof.result.value.message).toContain("unsafe-eval");
  expect(await page.evaluate(() => window.__rf903EvalExecuted)).toBeUndefined();

  const requests = [];
  const server = createServer((request, response) => {
    requests.push(request.url);
    response.writeHead(200, { "content-type": "text/javascript", "access-control-allow-origin": "*" });
    response.end("window.__rf903RemoteExecuted = true");
  });
  await new Promise((done, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", done); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    await page.evaluate(async (url) => {
      const script = document.createElement("script");
      script.src = url;
      await new Promise((done) => { script.onload = done; script.onerror = done; document.head.append(script); });
      script.remove();
    }, `${origin}/untrusted.js`);
    expect(await page.evaluate(() => window.__rf903RemoteExecuted)).toBeUndefined();
    await expect.poll(() => consoleErrors.length).toBe(4);
    expect(consoleErrors[3]).toContain(`Loading the script '${origin}/untrusted.js' violates the following Content Security Policy directive: "script-src 'self'"`);
    await product.expectCspConsoleError(consoleErrors[3]);

    const fetchProof = await page.evaluate(async (url) => {
      try { await fetch(url); return { allowed: true }; }
      catch (error) { return { name: error.name, message: error.message }; }
    }, `${origin}/unrelated-data`);
    expect(fetchProof.name).toBe("TypeError");
    await expect.poll(() => consoleErrors.length).toBe(6);
    expect(consoleErrors[4]).toContain(`Connecting to '${origin}/unrelated-data' violates the following Content Security Policy directive: "connect-src fishmark-asset://preview"`);
    expect(consoleErrors[5]).toBe(`Fetch API cannot load ${origin}/unrelated-data. Refused to connect because it violates the document's Content Security Policy.`);
    await product.expectCspConsoleError(consoleErrors[4]);
    await product.expectCspConsoleError(consoleErrors[5]);
    expect(requests).toEqual([]);
    await expect.poll(() => page.evaluate(() => window.__rf903CspViolations.length)).toBe(6);
    const violations = await page.evaluate(() => window.__rf903CspViolations);
    expect(violations.map(({ effectiveDirective, blockedURI, disposition }) => ({ effectiveDirective, blockedURI, disposition }))).toEqual([
      { effectiveDirective: "script-src-elem", blockedURI: "inline", disposition: "enforce" },
      { effectiveDirective: "script-src-attr", blockedURI: "inline", disposition: "enforce" },
      { effectiveDirective: "script-src-elem", blockedURI: "fishmark-asset", disposition: "enforce" },
      { effectiveDirective: "script-src", blockedURI: "eval", disposition: "enforce" },
      { effectiveDirective: "script-src-elem", blockedURI: `${origin}/untrusted.js`, disposition: "enforce" },
      { effectiveDirective: "connect-src", blockedURI: `${origin}/unrelated-data`, disposition: "enforce" }
    ]);
    expect(new Set(violations.map((violation) => violation.originalPolicy)).size).toBe(1);
    await product.testInfo.attach("csp-negative-proof", { body: JSON.stringify({ evalProof, violations, consoleErrors, origin, requests }, null, 2), contentType: "application/json" });
  } finally { await new Promise((done, reject) => server.close((error) => error ? reject(error) : done())); }
  await product.append("continued");
  await product.manualSave();
  await product.expectSaved(content + "continued");
  await product.normalClose();
});
