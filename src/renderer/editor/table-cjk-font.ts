/** A local, character-restricted face keeps native editable text free of font spans. */
export function installTableCjkFont(document: Document, family: string | null): () => void {
  if (!family || typeof FontFace === "undefined" || !document.fonts) return () => {};
  const root = document.documentElement;
  let disposed = false;
  // Same Han/fullwidth coverage as the preview decorator, including supplementary Han.
  const face = new FontFace("FishMark Table CJK", `local(${JSON.stringify(family)})`, {
    unicodeRange: "U+2E80-2E99,U+2E9B-2EF3,U+2F00-2FD5,U+3000-303F,U+3400-4DBF,U+4E00-9FFF,U+F900-FA6D,U+FA70-FAD9,U+FF00-FFEF,U+16FE2-16FE3,U+16FF0-16FF1,U+20000-2A6DF,U+2A700-2B739,U+2B740-2B81D,U+2B820-2CEA1,U+2CEB0-2EBE0,U+2EBF0-2EE5D,U+2F800-2FA1D,U+30000-3134A,U+31350-323AF"
  });
  void face.load().then(() => {
    if (disposed) return;
    document.fonts.add(face);
    root.dataset.fishmarkTableCjkFont = "ready";
  }).catch(() => {
    // An unavailable local font leaves the existing preference/fallback path intact.
  });
  return () => {
    disposed = true;
    document.fonts.delete(face);
    delete root.dataset.fishmarkTableCjkFont;
  };
}
