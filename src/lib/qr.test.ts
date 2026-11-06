import { describe, expect, it } from "vitest";
import { qrPath } from "./qr";

describe("qrPath", () => {
  it("draws a level-H code for a Telegram login link", () => {
    // 32-byte token, base64url without padding: what tg_qr_poll returns.
    const url = "tg://login?token=AQIDBAUGBwgJCgsMDQ4PEBESExQVFhcYGRobHB0eHyA";
    const { size, d } = qrPath(url);
    // 59 bytes at level H fit version 7 (45×45 modules), small enough for a 164px tile.
    expect(size).toBe(45);
    // Finder pattern: the top-left corner module is dark.
    expect(d.startsWith("M0 0h1v1h-1z")).toBe(true);
  });
});
