import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("GitHub Pages site", () => {
  it("keeps the marketing homepage in a separate static site entry", () => {
    const siteIndexPath = path.join(process.cwd(), "site", "index.html");
    const rendererIndexPath = path.join(process.cwd(), "src", "renderer", "index.html");

    expect(existsSync(siteIndexPath)).toBe(true);
    expect(readFileSync(rendererIndexPath, "utf8")).toContain('id="root"');

    const siteIndexSource = readFileSync(siteIndexPath, "utf8");

    expect(siteIndexSource).toContain("<title>FishMark");
    expect(siteIndexSource).toContain("https://github.com/yulu-gm/FishMark");
    expect(siteIndexSource).toContain("https://github.com/yulu-gm/FishMark/releases");
  });

  it("defines targets for the homepage navigation anchors", () => {
    const siteIndexPath = path.join(process.cwd(), "site", "index.html");
    const siteIndexSource = readFileSync(siteIndexPath, "utf8");

    for (const anchorId of ["features", "shortcuts", "syntax", "download"]) {
      expect(siteIndexSource).toContain(`href="#${anchorId}"`);
      expect(siteIndexSource).toContain(`id="${anchorId}"`);
    }
  });

  it("adds safe rel attributes to links that open a new tab", () => {
    const siteIndexPath = path.join(process.cwd(), "site", "index.html");
    const siteIndexSource = readFileSync(siteIndexPath, "utf8");
    const blankLinks = Array.from(siteIndexSource.matchAll(/<a\b[^>]*target="_blank"[^>]*>/g)).map(
      (match) => match[0]
    );

    expect(blankLinks.length).toBeGreaterThan(0);
    for (const link of blankLinks) {
      expect(link).toContain('rel="noopener noreferrer"');
    }
  });

  it("shows customer-facing capabilities without the implementation stack", () => {
    const siteIndexPath = path.join(process.cwd(), "site", "index.html");
    const siteIndexSource = readFileSync(siteIndexPath, "utf8");

    expect(siteIndexSource).toContain("多标签页工作区");
    expect(siteIndexSource).toContain("剪贴板粘贴图片");
    expect(siteIndexSource).toContain("查找替换与 HTML 导出");
    expect(siteIndexSource).toContain("当前支持的 Markdown 语法");

    for (const implementationDetail of [
      "技术栈",
      "Electron",
      "React",
      "TypeScript",
      "CodeMirror",
      "micromark",
      "Vitest"
    ]) {
      expect(siteIndexSource).not.toContain(implementationDetail);
    }
  });

  it("documents the currently advertised Markdown syntax support", () => {
    const siteIndexPath = path.join(process.cwd(), "site", "index.html");
    const siteIndexSource = readFileSync(siteIndexPath, "utf8");

    for (const syntaxLabel of [
      "标题",
      "段落",
      "加粗与斜体",
      "删除线",
      "行内代码",
      "代码块",
      "引用块",
      "列表与任务",
      "分割线",
      "链接与图片",
      "表格"
    ]) {
      expect(siteIndexSource).toContain(syntaxLabel);
    }
  });

  it("keeps the original homepage rhythm and motion hooks", () => {
    const siteIndexPath = path.join(process.cwd(), "site", "index.html");
    const siteIndexSource = readFileSync(siteIndexPath, "utf8");

    expect(siteIndexSource).toContain('class="editor-frame fade-up"');
    expect(siteIndexSource).toContain('class="phil-card fade-up"');
    expect(siteIndexSource).toContain('class="feat-card fade-up"');
    expect(siteIndexSource).toContain('class="shortcuts-grid"');
    expect(siteIndexSource).toContain("const observer = new IntersectionObserver");
    expect(siteIndexSource).toContain("@keyframes blink");
  });

  it("uses light neutral styling and avoids stale homepage phrasing", () => {
    const siteIndexPath = path.join(process.cwd(), "site", "index.html");
    const siteIndexSource = readFileSync(siteIndexPath, "utf8");

    expect(siteIndexSource).toContain("--bg: #f8fafc");
    expect(siteIndexSource).toContain("--icon: #aebccc");
    expect(siteIndexSource).toContain("color: var(--icon)");
    expect(siteIndexSource).not.toContain("本地优先");
    expect(siteIndexSource).not.toContain("local-first");
    expect(siteIndexSource).not.toContain("Local-first");
    expect(siteIndexSource).not.toContain("而非");
    expect(siteIndexSource).not.toContain("不是");
    expect(siteIndexSource).not.toContain("https://github.com/yulu-gm/FishMark/releases/tag/v0.2.2-mac-beta");
  });

  it("publishes the static site directory through GitHub Pages Actions", () => {
    const workflowPath = path.join(process.cwd(), ".github", "workflows", "pages.yml");

    expect(existsSync(workflowPath)).toBe(true);

    const workflowSource = readFileSync(workflowPath, "utf8");

    expect(workflowSource).toContain("github-pages");
    expect(workflowSource).toContain("branches: [main]");
    expect(workflowSource).toContain("actions/configure-pages");
    expect(workflowSource).toContain("actions/upload-pages-artifact");
    expect(workflowSource).toContain("path: site");
    expect(workflowSource).toContain("actions/deploy-pages");
  });
});
