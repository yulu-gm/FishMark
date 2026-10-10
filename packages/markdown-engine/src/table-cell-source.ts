/** Table pipes are decoded before inline parsing; boundaries retain source coordinates. */
export function projectTableCellSource(raw: string): { text: string; boundaries: number[] } {
  const boundaries = [0];
  let text = "";
  for (let index = 0; index < raw.length; index += 1) {
    if (raw[index] === "\\" && raw[index + 1] === "|") index += 1;
    text += raw[index];
    boundaries.push(index + 1);
  }
  return { text, boundaries };
}
