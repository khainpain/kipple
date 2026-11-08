import { createServer } from "node:http";
import type { LookupAddress } from "node:dns";
import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";
import { fetchLink, GET, privateIp } from "./fetch.js";

describe("privateIp", () => {
  it("catches private IPv4", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "224.0.0.1", "198.18.0.1"]) expect(privateIp(ip), ip).toBe(true);
    for (const ip of ["8.8.8.8", "1.1.1.1", "172.32.0.1"]) expect(privateIp(ip), ip).toBe(false);
  });
  it("catches IPv6 forms that hide a private IPv4", () => {
    for (const ip of ["::1", "::", "::ffff:127.0.0.1", "::ffff:7f00:1", "0:0:0:0:0:ffff:a00:1", "64:ff9b::a9fe:a9fe", "2002:7f00:1::", "fc00::1", "fd12::1", "fe80::1", "fec0::1", "ff02::1", "2001:0:1::1"]) expect(privateIp(ip), ip).toBe(true);
    for (const ip of ["2606:4700:4700::1111", "::ffff:8.8.8.8", "2a00:1450:4001::200e"]) expect(privateIp(ip), ip).toBe(false);
  });
});

describe("GET", () => {
  const ask = (url: string, site = "same-origin") => GET(new Request(`https://kipple.test/api/fetch?url=${encodeURIComponent(url)}`, { headers: { "sec-fetch-site": site } }));

  it("refuses local addresses, written any way", async () => {
    const server = createServer((_q, r) => r.end("<title>secret</title>")).listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r));
    const port = (server.address() as AddressInfo).port;
    try {
      for (const host of ["127.0.0.1", "[::ffff:7f00:1]", "[::ffff:127.0.0.1]", "localhost"]) expect((await ask(`http://${host}:${port}/`)).status, host).toBe(400);
    } finally {
      server.close();
    }
  });

  it("refuses other sites", async () => expect((await ask("https://example.com", "cross-site")).status).toBe(403));
});

describe("GET limits", () => {
  const ask = (url: string, ip: string) =>
    fetchLink(new Request(`https://kipple.test/api/fetch?url=${encodeURIComponent(url)}`, { headers: { "sec-fetch-site": "same-origin", "x-real-ip": ip } }), opts);
  // Connects "slow.test" to a local test server; everything else is refused as in production.
  let port = 0;
  const opts = {
    deadlineMs: 300,
    lookup: (host: string, o: object, cb: (e: Error | null, a: string | LookupAddress[], f?: number) => void) =>
      host === "slow.test" ? ((o as { all?: boolean }).all ? cb(null, [{ address: "127.0.0.1", family: 4 }]) : cb(null, "127.0.0.1", 4)) : cb(new Error("no"), []),
  };

  it("gives up on a server that never finishes its answer", async () => {
    const server = createServer((_q, r) => {
      r.writeHead(200, { "content-type": "text/html" });
      r.write("<html><head>");
      // …and nothing more, ever.
    }).listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r));
    port = (server.address() as AddressInfo).port;
    try {
      const t = Date.now();
      const r = await ask(`http://slow.test:${port}/`, "192.0.2.50");
      expect(r.status).toBe(504);
      expect(Date.now() - t).toBeLessThan(3000);
    } finally {
      server.closeAllConnections();
      server.close();
    }
  });

  it("gives up on a server that never answers at all", async () => {
    const server = createServer(() => undefined).listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r));
    port = (server.address() as AddressInfo).port;
    try {
      expect((await ask(`http://slow.test:${port}/`, "192.0.2.51")).status).toBe(504);
    } finally {
      server.closeAllConnections();
      server.close();
    }
  });

  it("still serves a quick server", async () => {
    const server = createServer((_q, r) => r.writeHead(200, { "content-type": "text/html" }).end("<title>ok</title>")).listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r));
    port = (server.address() as AddressInfo).port;
    try {
      const r = await ask(`http://slow.test:${port}/`, "192.0.2.52");
      expect(r.status).toBe(200);
      expect(await r.text()).toBe("<title>ok</title>");
    } finally {
      server.close();
    }
  });

  it("refuses more than 120 requests a minute from one address", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 122; i++) statuses.push((await GET(new Request("https://kipple.test/api/fetch?url=nope", { headers: { "sec-fetch-site": "same-origin", "x-real-ip": "192.0.2.60" } }))).status);
    expect(statuses.slice(0, 120).every((s) => s === 400)).toBe(true);
    expect(statuses.slice(120)).toEqual([429, 429]);
    expect((await GET(new Request("https://kipple.test/api/fetch?url=nope", { headers: { "sec-fetch-site": "same-origin", "x-real-ip": "192.0.2.61" } }))).status).toBe(400);
  });
});
