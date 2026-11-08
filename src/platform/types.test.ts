import { describe, expect, it } from "vitest";
import { normalizePath, resolveInside, RUNNABLE } from "./types";

describe("normalizePath", () => {
  it("resolves . and .. and unifies separators", () => {
    expect(normalizePath("C:\\exp\\photos\\..\\files\\.\\a.pdf")).toBe("C:\\exp\\files\\a.pdf");
    expect(normalizePath("/home/u/exp//photos/../a.jpg")).toBe("/home/u/exp/a.jpg");
    expect(normalizePath("\\\\nas\\share\\exp\\a.jpg")).toBe("\\\\nas\\share\\exp\\a.jpg");
  });

  it("refuses to climb above the root", () => {
    expect(normalizePath("C:\\..\\x")).toBeNull();
    expect(normalizePath("/../etc")).toBeNull();
  });
});

describe("resolveInside", () => {
  const exp = "C:\\Users\\a\\Downloads\\Telegram Desktop\\ChatExport_2026";
  it("allows files inside the export folder", () => {
    expect(resolveInside([exp], exp, "files/report.pdf")).toBe(`${exp}\\files\\report.pdf`);
  });

  it("refuses paths that escape it", () => {
    expect(resolveInside([exp], exp, "../../../.ssh/id_rsa")).toBeNull();
    expect(resolveInside([exp], exp, "files/../../ChatExport_2026_evil/x.exe")).toBeNull();
    expect(resolveInside([exp], exp, "C:\\Windows\\System32\\calc.exe")).toBeNull();
    expect(resolveInside([exp], exp, "\\\\attacker\\share\\x.exe")).toBeNull();
    expect(resolveInside([exp], exp, "")).toBeNull();
  });

  it("allows absolute paths under another allowed folder (photos loaded from Telegram), case-insensitively on Windows", () => {
    const media = "C:\\Users\\a\\AppData\\Roaming\\io.getkipple.app\\telegram-media";
    expect(resolveInside([exp, media], "", "c:\\users\\a\\appdata\\roaming\\io.getkipple.app\\telegram-media\\42\\7.jpg")).not.toBeNull();
    expect(resolveInside(["", media], "", "C:\\Users\\a\\AppData\\Roaming\\io.getkipple.app\\library.json")).toBeNull();
  });

  it("works with POSIX paths", () => {
    expect(resolveInside(["/home/u/exp"], "/home/u/exp", "photos/a.jpg")).toBe("/home/u/exp/photos/a.jpg");
    expect(resolveInside(["/home/u/exp"], "/home/u/exp", "../exp2/a.jpg")).toBeNull();
    expect(resolveInside(["/home/u/exp"], "/home/u/exp", "/Home/u/exp/a.jpg")).toBeNull();
  });
});

describe("RUNNABLE", () => {
  it("catches files Windows would run, not documents", () => {
    for (const f of ["setup.exe", "x.BAT", "a.lnk", "b.hta", "c.js", "d.scr", "e.msi", "f.url"]) expect(RUNNABLE.test(f), f).toBe(true);
    for (const f of ["report.pdf", "photo.jpg", "notes.txt", "song.mp3", "deck.pptx", "exe", "archive.zip"]) expect(RUNNABLE.test(f), f).toBe(false);
  });
});
