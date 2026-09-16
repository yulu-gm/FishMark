import type { SourceRange } from "./model/source-range";

// A read-only view over document text. `string` satisfies it structurally, and `MaskedSourceText`
// satisfies it lazily: masking container prefixes costs nothing until a slice is actually read,
// which is what keeps a document with thousands of containers linear instead of quadratic.
export interface SourceText {
  readonly length: number;
  slice(start?: number, end?: number): string;
  charAt(index: number): string;
  indexOf(searchString: string, position?: number): number;
}

class MaskedSourceText implements SourceText {
  constructor(
    private readonly base: SourceText,
    private readonly ranges: readonly SourceRange[]
  ) {}

  get length(): number {
    return this.base.length;
  }

  charAt(index: number): string {
    return this.isMasked(index) ? " " : this.base.charAt(index);
  }

  indexOf(searchString: string, position = 0): number {
    // Masking never touches line breaks, so searching for them stays exact.
    return this.base.indexOf(searchString, position);
  }

  slice(start = 0, end = this.base.length): string {
    const slice = this.base.slice(start, end);

    if (slice.length === 0 || !this.ranges.some((range) => range.startOffset < end && range.endOffset > start)) {
      return slice;
    }

    const characters = slice.split("");
    for (const range of this.ranges) {
      const maskStart = Math.max(0, range.startOffset - start);
      const maskEnd = Math.min(characters.length, range.endOffset - start);
      for (let index = maskStart; index < maskEnd; index += 1) {
        const character = characters[index];
        if (character !== "\n" && character !== "\r") {
          characters[index] = " ";
        }
      }
    }

    return characters.join("");
  }

  private isMasked(index: number): boolean {
    for (const range of this.ranges) {
      if (index >= range.startOffset && index < range.endOffset) {
        return true;
      }
    }

    return false;
  }
}

export function createMaskedSource(base: SourceText, ranges: readonly SourceRange[]): SourceText {
  if (ranges.length === 0) {
    return base;
  }

  return new MaskedSourceText(base, ranges);
}
