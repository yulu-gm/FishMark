// 1-based line lookup shared by parsing and projection. An offset exactly at a
// line start belongs to that line. Each lookup owns its line-start offsets.
export function createLineLookup(source: string): (offset: number) => number {
  const lineStarts: number[] = [0];

  for (let offset = 0; offset < source.length; offset += 1) {
    if (source[offset] === "\n") {
      lineStarts.push(offset + 1);
    }
  }

  return (offset: number): number => {
    let low = 0;
    let high = lineStarts.length - 1;

    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      if (lineStarts[middle]! <= offset) {
        low = middle;
      } else {
        high = middle - 1;
      }
    }

    return low + 1;
  };
}
