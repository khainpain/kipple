//! Link previews must not reach the user's own network (router pages, NAS, local dev servers).
//! The web view checks every address a link (and each redirect) goes to with `host_is_private`
//! before fetching it (src/lib/linkmeta.ts). Same rules as the web build's api/fetch.ts.

use std::net::{IpAddr, Ipv4Addr, Ipv6Addr, ToSocketAddrs};

fn private_v4(ip: Ipv4Addr) -> bool {
    let [a, b, c, _] = ip.octets();
    a == 0
        || a == 10
        || a == 127
        || a >= 224
        || (a == 100 && (64..=127).contains(&b)) // CGNAT
        || (a == 169 && b == 254) // link-local
        || (a == 172 && (16..=31).contains(&b))
        || (a == 192 && b == 168)
        || (a == 192 && b == 0 && c == 0)
        || (a == 198 && (b == 18 || b == 19))
}

fn v4_from(hi: u16, lo: u16) -> Ipv4Addr {
    Ipv4Addr::new((hi >> 8) as u8, hi as u8, (lo >> 8) as u8, lo as u8)
}

fn private_v6(ip: Ipv6Addr) -> bool {
    let g = ip.segments();
    if g[..6].iter().all(|&n| n == 0) {
        // ::, ::1 and the old IPv4-compatible form ::a.b.c.d
        return if g[6] == 0 && g[7] <= 1 { true } else { private_v4(v4_from(g[6], g[7])) };
    }
    if g[..5].iter().all(|&n| n == 0) && g[5] == 0xffff {
        return private_v4(v4_from(g[6], g[7])); // ::ffff:a.b.c.d
    }
    if g[0] == 0x64 && g[1] == 0xff9b {
        return private_v4(v4_from(g[6], g[7])); // NAT64
    }
    if g[0] == 0x2002 {
        return private_v4(v4_from(g[1], g[2])); // 6to4
    }
    if g[0] == 0x2001 && g[1] == 0 {
        return true; // Teredo
    }
    (g[0] & 0xfe00) == 0xfc00 // ULA
        || (g[0] & 0xffc0) == 0xfe80 // link-local
        || (g[0] & 0xffc0) == 0xfec0 // site-local
        || (g[0] & 0xff00) == 0xff00 // multicast
}

/// Loopback, private, link-local, CGNAT, ULA, multicast and other addresses that aren't the public internet.
pub fn private_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => private_v4(v4),
        IpAddr::V6(v6) => private_v6(v6),
    }
}

/// Whether `host` (a name or an IP literal, IPv6 with or without brackets) is or resolves to any
/// non-public address. Err when it doesn't resolve at all.
fn resolve_is_private(host: &str) -> Result<bool, String> {
    let host = host.trim().trim_start_matches('[').trim_end_matches(']');
    if host.is_empty() {
        return Ok(true);
    }
    if let Ok(ip) = host.parse::<IpAddr>() {
        return Ok(private_ip(ip));
    }
    let lower = host.to_ascii_lowercase();
    let lower = lower.trim_end_matches('.');
    if lower == "localhost" || lower.ends_with(".localhost") || lower.ends_with(".local") {
        return Ok(true);
    }
    let addrs: Vec<IpAddr> = (lower, 0u16).to_socket_addrs().map_err(|_| "RESOLVE_FAILED".to_string())?.map(|a| a.ip()).collect();
    if addrs.is_empty() {
        return Err("RESOLVE_FAILED".into());
    }
    Ok(addrs.into_iter().any(private_ip))
}

/// See the module comment. Resolution blocks, so it runs off the async runtime's workers.
#[tauri::command]
pub async fn host_is_private(host: String) -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(move || resolve_is_private(&host)).await.map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    fn p(s: &str) -> bool {
        private_ip(s.parse().unwrap())
    }

    #[test]
    fn private_addresses() {
        for ip in [
            "127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1", "100.127.255.255",
            "0.0.0.0", "224.0.0.1", "::1", "::", "fe80::1", "fc00::1", "fd12:3456::1", "::ffff:192.168.0.1", "::ffff:127.0.0.1",
            "64:ff9b::10.0.0.1", "2002:c0a8:0101::1", "2001:0::1", "ff02::1",
        ] {
            assert!(p(ip), "{ip} should be private");
        }
        for ip in ["8.8.8.8", "1.1.1.1", "172.32.0.1", "100.128.0.1", "2606:4700:4700::1111", "::ffff:8.8.8.8", "64:ff9b::8.8.8.8"] {
            assert!(!p(ip), "{ip} should be public");
        }
    }

    #[test]
    fn literal_hosts_and_local_names() {
        assert_eq!(resolve_is_private("[::1]"), Ok(true));
        assert_eq!(resolve_is_private("192.168.0.10"), Ok(true));
        assert_eq!(resolve_is_private("8.8.8.8"), Ok(false));
        assert_eq!(resolve_is_private("LOCALHOST."), Ok(true));
        assert_eq!(resolve_is_private("printer.local"), Ok(true));
        assert_eq!(resolve_is_private(""), Ok(true));
    }
}
