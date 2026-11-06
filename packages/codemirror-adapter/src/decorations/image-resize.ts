/** Build a conservative source edit. Unsupported syntax is left untouched. */
export function resizeImageSource(input: {
  source: string;
  from: number;
  to: number;
  kind: "markdown" | "html";
  href: string | null;
  alt: string;
  title: string | null;
  width: number;
}): string | null {
  const { source, from, to, kind, href, alt, title } = input;
  const width = Math.round(input.width);
  if (!Number.isFinite(width) || width < 1 || from < 0 || to > source.length || from >= to) return null;
  const original = source.slice(from, to);
  if (kind === "markdown") {
    // Preserve reference and formatted-alt semantics instead of converting them.
    if (!href ||
        !original.startsWith(`![${alt}](`) || (alt.includes("[") || alt.includes("]") || alt.includes("\\")) || /[<&"\\\n\r]/u.test(href + alt + (title ?? ""))) return null;
    return `<img src="${href}" alt="${alt}"${title === null ? "" : ` title="${title}"`} width="${width}" />`;
  }
  // Only mutate a single tag with unambiguous attributes. Keep unrelated CSS
  // declarations and attributes; width, height and zoom define the old size.
  const tags = [...original.matchAll(/<img\b[^>]*\/?>/giu)];
  const match = tags[0];
  if (tags.length !== 1 || !match || match.index === undefined) return null;
  let tag = match[0];
  const closing = /\s*\/?>$/u.exec(tag);
  if (!closing || closing.index === undefined) return null;
  const attributeSource = tag.slice(4, closing.index);
  const attributePattern = /\s+([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/gy;
  const edits: { from: number; to: number; insert: string }[] = [];
  const seen = new Set<string>();
  let position = 0;
  while (position < attributeSource.length) {
    attributePattern.lastIndex = position;
    const attribute = attributePattern.exec(attributeSource);
    if (!attribute || !attribute[1]) return null;
    const name = attribute[1].toLowerCase();
    if (["width", "height", "style"].includes(name)) {
      if (seen.has(name)) return null;
      seen.add(name);
      let insert = "";
      if (name === "style") {
        if (attribute[2] === undefined && attribute[3] === undefined) return null;
        const styleValue = attribute[2] ?? attribute[3] ?? "";
        if (/[()"']/u.test(styleValue)) return null;
        const declarations = styleValue.split(";");
        if (declarations.some(part => part.trim() && !/^[\w-]+\s*:/u.test(part.trim()))) return null;
        const remaining = declarations.filter(part => !/^\s*(?:width|height|zoom)\s*:/iu.test(part));
        if (remaining.some(part => part.trim())) insert = ` style="${remaining.join(";")}"`;
      }
      edits.push({ from: 4 + position, to: 4 + attributePattern.lastIndex, insert });
    }
    position = attributePattern.lastIndex;
  }
  for (const edit of edits.reverse()) tag = tag.slice(0, edit.from) + edit.insert + tag.slice(edit.to);
  tag = tag.replace(/\s*\/?>$/u, ` width="${width}" />`);
  return original.slice(0, match.index) + tag + original.slice(match.index + match[0].length);
}
