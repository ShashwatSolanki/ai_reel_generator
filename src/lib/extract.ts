import fs from "fs";
import path from "path";
import pdf from "pdf-parse-fixed";

export async function extractText(filePath: string): Promise<string> {
  const extension = path.extname(filePath).toLowerCase();

  if (extension === ".pdf") {
    const buffer = fs.readFileSync(filePath);
    const data = await pdf(buffer);
    return data.text;
  }

  if (extension === ".pptx") {
    const { parse } = await import("pptx-parser");
    const result = await parse(filePath);

    let text = "";
    result.slides.forEach((slide: any) => {
      slide.content.forEach((item: any) => {
        if (item.text) text += item.text + "\n";
      });
    });

    return text;
  }

  throw new Error("Unsupported file type");
}
