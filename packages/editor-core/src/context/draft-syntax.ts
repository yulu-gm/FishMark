import { splitTableLine } from "@fishmark/markdown-engine";

import { parseBlockquoteLine, parseCodeFenceLine, parseListLine } from "../commands/line-parsers";

export type DraftSyntax =
  | {
      type: "codeFenceOpener";
      containerPrefix: string;
      contentPrefix: string;
      indent: string;
      fence: string;
      info: string | null;
    }
  | {
      type: "blockquoteMarker";
      containerPrefix: string;
      committedPrefix: string;
    }
  | {
      type: "listMarker";
      containerPrefix: string;
      contentPrefix: string;
      indent: string;
      marker: string;
      task: null | {
        checked: boolean;
      };
    }
  | {
      type: "tableHeader";
      containerPrefix: string;
      cells: readonly string[];
    };

type StrippedContainerLine = {
  containerPrefix: string;
  contentPrefix: string;
  content: string;
};

export function detectDraftSyntax(lineText: string): DraftSyntax | null {
  const stripped = stripSupportedContainerPrefix(lineText);
  const codeFence = detectCodeFenceOpener(stripped);

  if (codeFence) {
    return codeFence;
  }

  const blockquoteMarker = detectBlockquoteMarker(lineText);

  if (blockquoteMarker) {
    return blockquoteMarker;
  }

  const listMarker = detectListMarker(stripped);

  if (listMarker) {
    return listMarker;
  }

  return detectTableHeader(stripped);
}

function stripSupportedContainerPrefix(lineText: string): StrippedContainerLine {
  const blockquote = parseBlockquoteLine(lineText);

  if (!blockquote || blockquote.content.length === 0) {
    return {
      containerPrefix: "",
      contentPrefix: "",
      content: lineText
    };
  }

  return {
    containerPrefix: blockquote.sourcePrefix,
    contentPrefix: ensureTrailingPadding(blockquote.sourcePrefix),
    content: blockquote.content
  };
}

function detectCodeFenceOpener(stripped: StrippedContainerLine): DraftSyntax | null {
  const codeFence = parseCodeFenceLine(stripped.content);

  if (!codeFence) {
    return null;
  }

  const info = stripped.content.slice(codeFence.indent.length + codeFence.fence.length).trim();

  return {
    type: "codeFenceOpener",
    containerPrefix: stripped.containerPrefix,
    contentPrefix: stripped.contentPrefix,
    indent: codeFence.indent,
    fence: codeFence.fence,
    info: info.length > 0 ? info : null
  };
}

function detectBlockquoteMarker(lineText: string): DraftSyntax | null {
  const blockquote = parseBlockquoteLine(lineText);

  if (!blockquote) {
    return /^[ \t]{0,3}>$/u.test(lineText)
      ? {
          type: "blockquoteMarker",
          containerPrefix: "",
          committedPrefix: `${lineText} `
        }
      : null;
  }

  if (
    blockquote.content.trim().length === 0 &&
    blockquote.contentStartOffset === blockquote.markerEnd &&
    lineText.length === blockquote.markerEnd
  ) {
    return {
      type: "blockquoteMarker",
      containerPrefix: getBlockquoteContainerPrefixBeforeLastMarker(lineText, blockquote.markers),
      committedPrefix: `${blockquote.sourcePrefix} `
    };
  }

  if (blockquote.content === ">") {
    return {
      type: "blockquoteMarker",
      containerPrefix: blockquote.sourcePrefix,
      committedPrefix: `${blockquote.sourcePrefix}> `
    };
  }

  return null;
}

function detectListMarker(stripped: StrippedContainerLine): DraftSyntax | null {
  const list = parseListLine(stripped.content);

  if (!list || list.content.length > 0) {
    return null;
  }

  return {
    type: "listMarker",
    containerPrefix: stripped.containerPrefix,
    contentPrefix: stripped.contentPrefix,
    indent: list.indent,
    marker: list.marker,
    task: list.task
  };
}

function detectTableHeader(stripped: StrippedContainerLine): DraftSyntax | null {
  const pipeCount = stripped.content.match(/\|/gu)?.length ?? 0;

  if (pipeCount < 2) {
    return null;
  }

  const segments = splitTableLine(stripped.content);

  if (segments.length < 2) {
    return null;
  }

  const cells = segments.map((segment) => segment.text.trim());

  if (cells.every((cell) => cell.length === 0)) {
    return null;
  }

  return {
    type: "tableHeader",
    containerPrefix: stripped.containerPrefix,
    cells
  };
}

function ensureTrailingPadding(prefix: string): string {
  return prefix.endsWith(" ") || prefix.endsWith("\t") ? prefix : `${prefix} `;
}

function getBlockquoteContainerPrefixBeforeLastMarker(
  lineText: string,
  markers: readonly { markerStart: number }[]
): string {
  const lastMarker = markers.at(-1);

  if (!lastMarker || markers.length <= 1) {
    return "";
  }

  return lineText.slice(0, lastMarker.markerStart);
}
