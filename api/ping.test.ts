import { describe, expect, it } from "vitest";
import { redis } from "./_lib/quota.js";
import { POST } from "./ping.js";

const ping = { v: "0.1.18", os: "windows", lang: "en", cohort: "2026-W40", age: "14-29", library: "1k-5k", ai: "off", week: false, events: {} };

const send = (ip: string, type = "application/json", body: unknown = ping) =>
  POST(new Request("https://kipple.test/api/ping", { method: "POST", headers: { "content-type": type, "x-real-ip": ip }, body: JSON.stringify(body) }));

const active = async () => (await redis([["GET", `kt:d:${new Date().toISOString().slice(0, 10)}\u0000active`]]))[0] ?? 0;

describe("POST /api/ping", () => {
  it("accepts the app's JSON ping", async () => {
    const before = await active();
    expect((await send("198.51.100.1")).status).toBe(204);
    expect(await active()).toBe(before + 1);
  });

  it("refuses a body that isn't sent as JSON, so other sites can't post it without a preflight", async () => {
    for (const type of ["text/plain", "application/x-www-form-urlencoded", "multipart/form-data; boundary=x"]) {
      expect((await send("198.51.100.2", type)).status, type).toBe(415);
    }
  });

  it("accepts JSON with a charset", async () => {
    expect((await send("198.51.100.3", "application/json; charset=utf-8")).status).toBe(204);
  });

  it("counts only a few pings from one address a day, and still answers 204 so the app doesn't retry", async () => {
    const before = await active();
    const statuses = [];
    for (let i = 0; i < 12; i++) statuses.push((await send("198.51.100.4")).status);
    expect(statuses.every((s) => s === 204)).toBe(true);
    expect(await active()).toBe(before + 5);
  });
});
