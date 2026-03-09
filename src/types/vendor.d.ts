declare module "pdf-parse-fixed" {
  const pdf: (dataBuffer: Buffer) => Promise<{ text: string }>;
  export default pdf;
}

declare module "pptx-parser" {
  export function parse(filePath: string): Promise<{
    slides: Array<{
      content: Array<{ text?: string }>;
    }>;
  }>;
}
