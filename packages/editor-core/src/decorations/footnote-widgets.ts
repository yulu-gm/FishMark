import { Decoration, WidgetType } from "@codemirror/view";

import type { InlineFootnoteReference } from "@fishmark/markdown-engine";

export const INACTIVE_INLINE_FOOTNOTE_REFERENCE_IDENTIFIER_ATTRIBUTE = "data-footnote-identifier";
export const INACTIVE_INLINE_FOOTNOTE_REFERENCE_SELECTOR = ".cm-footnote-reference-preview";

class FootnoteReferenceWidget extends WidgetType {
  constructor(
    private readonly label: string,
    private readonly identifier: string
  ) {
    super();
  }

  override eq(other: WidgetType): boolean {
    return other instanceof FootnoteReferenceWidget &&
      other.label === this.label &&
      other.identifier === this.identifier;
  }

  override toDOM(): HTMLElement {
    const reference = document.createElement("sup");

    reference.className = "cm-footnote-reference-preview cm-inactive-inline-footnote-reference";
    reference.setAttribute(INACTIVE_INLINE_FOOTNOTE_REFERENCE_IDENTIFIER_ATTRIBUTE, this.identifier);
    reference.textContent = this.label;
    reference.title = `[^${this.identifier}]`;

    return reference;
  }

  override ignoreEvent(): boolean {
    return false;
  }
}

export function createInactiveFootnoteReferenceDecoration(
  node: InlineFootnoteReference,
  label: string
): Decoration {
  return Decoration.replace({
    widget: new FootnoteReferenceWidget(label, node.identifier)
  });
}
