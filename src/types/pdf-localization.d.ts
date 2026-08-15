declare module 'arabic-persian-reshaper' {
  export const ArabicShaper: { convertArabic(value: string): string };
}
declare module 'bidi-js' {
  type Levels = { levels: Uint8Array; paragraphs: Array<{ start: number; end: number; level: number }> };
  type Bidi = {
    getEmbeddingLevels(text: string, direction?: 'ltr' | 'rtl'): Levels;
    getReorderSegments(text: string, levels: Levels, start?: number, end?: number): Array<[number, number]>;
  };
  export default function bidiFactory(): Bidi;
}
