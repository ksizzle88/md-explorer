import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { extractLinksFromLine, findBacklinks, collectMdFiles } from "./linkScanner";

describe("extractLinksFromLine", () => {
  it("extracts wiki-style links", () => {
    expect(extractLinksFromLine("See [[My Note]] for details")).toEqual(["My Note"]);
  });

  it("extracts wiki links with aliases", () => {
    expect(extractLinksFromLine("See [[My Note|alias text]] here")).toEqual(["My Note"]);
  });

  it("extracts multiple wiki links", () => {
    expect(extractLinksFromLine("[[A]] and [[B]]")).toEqual(["A", "B"]);
  });

  it("extracts markdown links to .md files", () => {
    expect(extractLinksFromLine("See [notes](./notes.md) here")).toEqual(["./notes.md"]);
  });

  it("strips fragment from markdown links", () => {
    expect(extractLinksFromLine("[sec](other.md#heading)")).toEqual(["other.md"]);
  });

  it("ignores http/https links", () => {
    expect(extractLinksFromLine("[site](https://example.com/page.md)")).toEqual([]);
  });

  it("handles mixed wiki and markdown links", () => {
    const result = extractLinksFromLine("[[Foo]] and [bar](bar.md)");
    expect(result).toEqual(["Foo", "bar.md"]);
  });

  it("returns empty for lines with no links", () => {
    expect(extractLinksFromLine("Just some plain text")).toEqual([]);
  });

  it("handles wiki links with whitespace", () => {
    expect(extractLinksFromLine("[[  My Note  ]]")).toEqual(["My Note"]);
  });

  it("handles relative paths with directories", () => {
    expect(extractLinksFromLine("[x](../docs/readme.md)")).toEqual(["../docs/readme.md"]);
  });
});

describe("findBacklinks", () => {
  let tmpDir: string;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "backlinks-test-"));

    // Create test files
    fs.writeFileSync(path.join(tmpDir, "target.md"), "# Target\nSome content\n");
    fs.writeFileSync(
      path.join(tmpDir, "linker1.md"),
      "# Linker 1\nSee [[target]] for info\nAnother line\n",
    );
    fs.writeFileSync(
      path.join(tmpDir, "linker2.md"),
      "# Linker 2\nCheck [target](target.md) here\nAlso [[target]] again\n",
    );
    fs.writeFileSync(path.join(tmpDir, "unrelated.md"), "# Unrelated\nNo links here\n");

    // Nested directory
    fs.mkdirSync(path.join(tmpDir, "sub"));
    fs.writeFileSync(
      path.join(tmpDir, "sub", "nested.md"),
      "# Nested\nLink to [[target]] from subdir\n",
    );
    fs.writeFileSync(
      path.join(tmpDir, "sub", "relative.md"),
      "# Relative\nSee [t](../target.md) for more\n",
    );
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("finds wiki-link backlinks", () => {
    const mdFiles = collectMdFiles(tmpDir);
    const backlinks = findBacklinks(path.join(tmpDir, "target.md"), mdFiles);
    const sources = backlinks.map(b => path.basename(b.sourceFile));
    expect(sources).toContain("linker1.md");
  });

  it("finds markdown-link backlinks", () => {
    const mdFiles = collectMdFiles(tmpDir);
    const backlinks = findBacklinks(path.join(tmpDir, "target.md"), mdFiles);
    const sources = backlinks.map(b => path.basename(b.sourceFile));
    expect(sources).toContain("linker2.md");
  });

  it("includes correct line numbers", () => {
    const mdFiles = collectMdFiles(tmpDir);
    const backlinks = findBacklinks(path.join(tmpDir, "target.md"), mdFiles);
    const linker1 = backlinks.find(b => path.basename(b.sourceFile) === "linker1.md");
    expect(linker1?.lineNumber).toBe(2);
  });

  it("finds multiple backlinks from same file", () => {
    const mdFiles = collectMdFiles(tmpDir);
    const backlinks = findBacklinks(path.join(tmpDir, "target.md"), mdFiles);
    const fromLinker2 = backlinks.filter(b => path.basename(b.sourceFile) === "linker2.md");
    expect(fromLinker2.length).toBe(2);
  });

  it("does not include self-references", () => {
    const mdFiles = collectMdFiles(tmpDir);
    const backlinks = findBacklinks(path.join(tmpDir, "target.md"), mdFiles);
    const self = backlinks.find(b => path.basename(b.sourceFile) === "target.md");
    expect(self).toBeUndefined();
  });

  it("excludes unrelated files", () => {
    const mdFiles = collectMdFiles(tmpDir);
    const backlinks = findBacklinks(path.join(tmpDir, "target.md"), mdFiles);
    const unrelated = backlinks.find(b => path.basename(b.sourceFile) === "unrelated.md");
    expect(unrelated).toBeUndefined();
  });

  it("finds backlinks from nested directories via wiki links", () => {
    const mdFiles = collectMdFiles(tmpDir);
    const backlinks = findBacklinks(path.join(tmpDir, "target.md"), mdFiles);
    const nested = backlinks.find(b => path.basename(b.sourceFile) === "nested.md");
    expect(nested).toBeDefined();
  });

  it("finds backlinks via relative paths from subdirectories", () => {
    const mdFiles = collectMdFiles(tmpDir);
    const backlinks = findBacklinks(path.join(tmpDir, "target.md"), mdFiles);
    const relative = backlinks.find(b => path.basename(b.sourceFile) === "relative.md");
    expect(relative).toBeDefined();
  });

  it("returns empty for a file with no backlinks", () => {
    const mdFiles = collectMdFiles(tmpDir);
    const backlinks = findBacklinks(path.join(tmpDir, "unrelated.md"), mdFiles);
    expect(backlinks).toEqual([]);
  });
});

describe("collectMdFiles", () => {
  let tmpDir: string;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "collect-test-"));
    fs.writeFileSync(path.join(tmpDir, "a.md"), "# A\n");
    fs.writeFileSync(path.join(tmpDir, "b.txt"), "not md\n");
    fs.mkdirSync(path.join(tmpDir, "sub"));
    fs.writeFileSync(path.join(tmpDir, "sub", "c.md"), "# C\n");
    fs.mkdirSync(path.join(tmpDir, "node_modules"));
    fs.writeFileSync(path.join(tmpDir, "node_modules", "d.md"), "# D\n");
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("collects .md files recursively", () => {
    const files = collectMdFiles(tmpDir);
    const names = files.map(f => path.basename(f));
    expect(names).toContain("a.md");
    expect(names).toContain("c.md");
  });

  it("excludes non-md files", () => {
    const files = collectMdFiles(tmpDir);
    const names = files.map(f => path.basename(f));
    expect(names).not.toContain("b.txt");
  });

  it("prunes node_modules", () => {
    const files = collectMdFiles(tmpDir);
    const names = files.map(f => path.basename(f));
    expect(names).not.toContain("d.md");
  });
});
