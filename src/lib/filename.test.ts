import { describe, expect, it } from "vitest";
import { titleFromFilename } from "./filename";

describe("titleFromFilename", () => {
  it("drops the extension", () => {
    expect(titleFromFilename("sermon-notes.pdf")).toBe("sermon-notes");
  });

  it("drops only the last extension", () => {
    expect(titleFromFilename("2026.01.05.sermon.pdf")).toBe("2026.01.05.sermon");
  });

  it("keeps a name that has no extension", () => {
    expect(titleFromFilename("handout")).toBe("handout");
  });

  it("treats a leading dot as part of the name, not a separator", () => {
    // Stripping here would leave an empty title, which is worse than a
    // slightly odd one.
    expect(titleFromFilename(".gitignore")).toBe(".gitignore");
  });

  it("strips a directory path if one comes through", () => {
    expect(titleFromFilename("C:\\Users\\pastor\\sermon.pdf")).toBe("sermon");
    expect(titleFromFilename("folder/sub/sermon.pdf")).toBe("sermon");
  });

  it("leaves separators and capitalisation alone", () => {
    // Deliberate: rewriting these is guessing at what someone meant to call
    // the file, and a wrong guess is harder to fix than the raw name.
    expect(titleFromFilename("Week_03--Romans_8.pdf")).toBe("Week_03--Romans_8");
  });

  it("handles empty and whitespace input without producing junk", () => {
    expect(titleFromFilename("")).toBe("");
    expect(titleFromFilename("  spaced .pdf")).toBe("spaced");
  });
});
