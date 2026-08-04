export type TextChange = {
  readonly from: number;
  readonly to: number;
  readonly insert: string;
};

export interface TextBuffer {
  readonly length: number;
  apply(changes: readonly TextChange[]): TextBuffer;
  equals(other: TextBuffer): boolean;
  slice(from: number, to?: number): string;
  toString(): string;
}

export type TextBufferFactory = (value: string) => TextBuffer;

class StringTextBuffer implements TextBuffer {
  readonly length: number;

  constructor(private readonly value: string) {
    this.length = value.length;
    Object.freeze(this);
  }

  apply(changes: readonly TextChange[]): TextBuffer {
    validateTextChanges(changes, this.length);

    if (changes.length === 0) {
      return this;
    }

    const segments: string[] = [];
    let cursor = 0;

    for (const change of changes) {
      segments.push(this.value.slice(cursor, change.from), change.insert);
      cursor = change.to;
    }
    segments.push(this.value.slice(cursor));

    return new StringTextBuffer(segments.join(""));
  }

  equals(other: TextBuffer): boolean {
    return this === other ||
      (this.length === other.length && this.value === other.toString());
  }

  slice(from: number, to?: number): string {
    return this.value.slice(from, to);
  }

  toString(): string {
    return this.value;
  }
}

export function createStringTextBuffer(value: string): TextBuffer {
  return new StringTextBuffer(value);
}

export function validateTextChanges(
  changes: readonly TextChange[],
  bufferLength: number
): void {
  if (!Number.isSafeInteger(bufferLength) || bufferLength < 0) {
    throw new RangeError(
      "Text buffer length must be a non-negative safe integer."
    );
  }

  let previousTo = 0;

  for (const change of changes) {
    if (typeof change !== "object" || change === null) {
      throw new TypeError("Text change must be a non-null object.");
    }
    if (typeof change.insert !== "string") {
      throw new TypeError("Text change insert must be a string.");
    }
    if (!Number.isSafeInteger(change.from) || !Number.isSafeInteger(change.to)) {
      throw new RangeError("Text change positions must be safe integers.");
    }
    if (change.from < 0 || change.to < 0 || change.from > bufferLength || change.to > bufferLength) {
      throw new RangeError("Text change positions are outside buffer bounds.");
    }
    if (change.from > change.to) {
      throw new RangeError("Text change has an invalid range.");
    }
    if (change.from < previousTo) {
      throw new RangeError("Text changes must be sorted and non-overlapping.");
    }
    previousTo = change.to;
  }
}
