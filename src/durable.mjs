// Line-delimited logs. A final fragment without its newline is an interrupted append:
// it is cut off and never parsed, so a crash mid-write cannot poison the record.
import { existsSync, readFileSync, truncateSync } from "node:fs";

export function readCompleteLines(file) {
  if (!existsSync(file)) return { lines: [], recovered: false };
  const text = readFileSync(file, "utf8");
  const end = text.lastIndexOf("\n") + 1;
  const recovered = end < text.length;
  if (recovered) truncateSync(file, end);
  return { lines: text.slice(0, end).split("\n").filter(Boolean), recovered };
}
