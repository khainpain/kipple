import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";
import { GET, privateIp } from "./fetch.js";

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
