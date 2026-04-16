export type DocumentMetrics = {
  characterCount: number;
  meaningfulCharacterCount: number;
};

export function getDocumentMetrics(content: string): DocumentMetrics {
  const characterCount = countUnicodeScalars(content);
  const meaningfulCharacterCount = countMeaningfulCharacters(content);

  return {
    characterCount,
    meaningfulCharacterCount
  };
}

function countUnicodeScalars(value: string): number {
  return Array.from(value).length;
}

function countMeaningfulCharacters(value: string): number {
  const meaningfulChars = value.match(/[^\s]/gu);
  return meaningfulChars?.length ?? 0;
}
