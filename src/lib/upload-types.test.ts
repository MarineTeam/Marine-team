import { describe, it, expect } from "vitest";
import {
  extensionOf,
  objectName,
  refusedUploadMessage,
  servePolicy,
  UPLOAD_TYPES,
  uploadType,
} from "./upload-types";

describe("extensionOf", () => {
  it("takes the last extension, lower-cased, without the dot", () => {
    expect(extensionOf("Notes.PDF")).toBe("pdf");
    expect(extensionOf("files/abc-Sunday.notes.epub")).toBe("epub");
  });

  it("ignores a query or fragment", () => {
    expect(extensionOf("files/a.pdf?download=1")).toBe("pdf");
    expect(extensionOf("files/a.pdf#page=3")).toBe("pdf");
  });

  it("is empty for no extension or a dotfile", () => {
    expect(extensionOf("README")).toBe("");
    expect(extensionOf(".htaccess")).toBe("");
    expect(extensionOf("files/")).toBe("");
  });
});

describe("uploadType", () => {
  it("knows the reader's formats and common media", () => {
    expect(uploadType("a.pdf")?.mime).toBe("application/pdf");
    expect(uploadType("a.epub")?.mime).toBe("application/epub+zip");
    expect(uploadType("a.mp3")?.kind).toBe("audio");
    expect(uploadType("a.png")?.kind).toBe("image");
  });

  it("refuses anything that can run as a page", () => {
    // The finding: an HTML upload served inline runs as this origin.
    for (const name of ["a.html", "a.htm", "a.svg", "a.xhtml", "a.js", "a.mjs", "a.xml", "a.swf"]) {
      expect(uploadType(name), name).toBeNull();
    }
  });

  it("refuses an unknown extension, and no extension", () => {
    expect(uploadType("a.exe")).toBeNull();
    expect(uploadType("a")).toBeNull();
  });

  it("is decided by the extension, not by a type the browser claims", () => {
    // There is no parameter for a claimed type at all, which is the point.
    expect(uploadType.length).toBe(1);
  });
});

describe("objectName", () => {
  it("keeps the id and the extension, and nothing of the client's name", () => {
    expect(objectName("id1", "My Sunday Notes (final).PDF")).toBe("files/id1.pdf");
  });

  it("cannot be steered out of the files/ prefix", () => {
    expect(objectName("id1", "../../zone-root.pdf")).toBe("files/id1.pdf");
    expect(objectName("id1", "a/b/c.pdf")).toBe("files/id1.pdf");
    expect(objectName("id1", "x.pdf?y=1#z")).toBe("files/id1.pdf");
  });

  it("is null for a refused type", () => {
    expect(objectName("id1", "index.html")).toBeNull();
  });
});

describe("servePolicy", () => {
  it("shows a reader format or media inline, with nosniff", () => {
    const pdf = servePolicy("files/x.pdf");
    expect(pdf).toMatchObject({ contentType: "application/pdf", inline: true });
    expect(pdf.headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(pdf.headers["Content-Security-Policy"]).toBeUndefined();
    expect(servePolicy("files/x.mp3").inline).toBe(true);
  });

  it("forces a download for a document", () => {
    const doc = servePolicy("files/x.docx");
    expect(doc.inline).toBe(false);
    expect(doc.headers["Content-Security-Policy"]).toBe("sandbox");
  });

  it("serves anything off the list as an opaque download that can't render", () => {
    // Files uploaded before the rule existed keep their old paths; this is
    // what happens to one of them named .html.
    const html = servePolicy("files/abc-evil.html");
    expect(html).toMatchObject({ contentType: "application/octet-stream", inline: false });
    expect(html.headers).toMatchObject({ "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "sandbox" });
    expect(servePolicy("files/abc-evil.svg").contentType).toBe("application/octet-stream");
  });

  it("never consults a stored MIME type", () => {
    expect(servePolicy.length).toBe(1);
  });
});

describe("the list itself", () => {
  it("has no type that a browser would render as a document with script", () => {
    // Named types rather than substrings: "openxmlformats" contains "xml"
    // and is a download of a zip, which is the point of the distinction.
    const executable = /^(text\/html|application\/xhtml\+xml|image\/svg\+xml|text\/xml|application\/xml)$|javascript|ecmascript/;
    for (const type of Object.values(UPLOAD_TYPES)) {
      expect(type.mime, type.ext).not.toMatch(executable);
    }
  });

  it("only shows inline what cannot carry a script", () => {
    for (const type of Object.values(UPLOAD_TYPES)) {
      if (type.inline) expect(["pdf", "epub", "audio", "image"]).toContain(type.kind);
    }
  });

  it("names the allowed extensions in the refusal", () => {
    expect(refusedUploadMessage()).toContain(".pdf");
    expect(refusedUploadMessage()).not.toContain(".html");
  });
});
