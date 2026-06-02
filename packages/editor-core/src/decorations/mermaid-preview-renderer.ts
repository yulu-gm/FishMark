import mermaid from "mermaid";

let initialized = false;
let nextRenderId = 0;

function ensureInitialized(): void {
  if (initialized) {
    return;
  }

  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    theme: "default"
  });
  initialized = true;
}

function createRenderId(): string {
  nextRenderId += 1;
  return `fishmark-mermaid-${nextRenderId}`;
}

function removeUnsafeSvgAttributes(root: ParentNode): void {
  root.querySelectorAll("*").forEach((element) => {
    Array.from(element.attributes).forEach((attribute) => {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim().toLowerCase();

      if (name.startsWith("on") || value.startsWith("javascript:")) {
        element.removeAttribute(attribute.name);
      }
    });
  });
}

export function createSanitizedMermaidSvgFragment(svg: string): DocumentFragment {
  const template = document.createElement("template");

  template.innerHTML = svg;
  template.content.querySelectorAll("script").forEach((script) => script.remove());
  removeUnsafeSvgAttributes(template.content);

  return template.content.cloneNode(true) as DocumentFragment;
}

export async function renderMermaidPreview(definition: string, container: HTMLElement): Promise<void> {
  ensureInitialized();

  const { svg } = await mermaid.render(createRenderId(), definition, container);

  container.replaceChildren(createSanitizedMermaidSvgFragment(svg));
}
