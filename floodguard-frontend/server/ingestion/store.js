import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export async function writeLatestSignals(filePath, signals) {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(signals, null, 2)}\n`, "utf8");
}

export async function readLatestSignals(filePath) {
  const content = await readFile(filePath, "utf8");
  return JSON.parse(content);
}
