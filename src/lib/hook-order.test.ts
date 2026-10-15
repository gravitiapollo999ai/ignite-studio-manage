import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// Regression for React #310: hooks called after an early `return` inside a component.
const FILES = [
  "src/routes/_authenticated/admin/jobs.$jobId.tsx",
  "src/routes/_authenticated/jobs.$jobId.tsx",
  "src/routes/_authenticated/jobs.new.tsx",
  "src/components/link-source-upload.tsx",
  "src/components/spoofer-sync-card.tsx",
  "src/components/private-video-player.tsx",
  "src/components/ai-helper.tsx",
];

function hooksAfterReturn(src: string): string[] {
  const bad: string[] = [];
  let inComp = false, returned = false;
  src.split("\n").forEach((line, i) => {
    if (/^(export )?function [A-Z]/.test(line)) { inComp = true; returned = false; return; }
    if (/^\S/.test(line) && !/^}/.test(line)) inComp = false;
    if (!inComp) return;
    if (/^  if \(.*\) return\b/.test(line)) returned = true;
    if (returned && /^  (const|let)?.*\buse[A-Z]\w*\(/.test(line)) bad.push(`${i + 1}: ${line.trim()}`);
  });
  return bad;
}

describe("no hooks after conditional returns", () => {
  for (const f of FILES) it(f, () => expect(hooksAfterReturn(readFileSync(f, "utf8"))).toEqual([]));
  it("detector catches the original defect", () => {
    const broken = "function A() {\n  if (x) return null;\n  const r = useServerFn(fn);\n}\n";
    expect(hooksAfterReturn(broken)).toHaveLength(1);
  });
});
