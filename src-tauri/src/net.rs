//! Link previews must not reach the user's own network (router pages, NAS, local dev servers).
//! The desktop app fetches previews only through `preview_fetch` (src/lib/linkmeta.ts): every address,
//! the first and each redirect, is checked, and its resolver checks the very addresses it connects
//! to, so a DNS server answering differently the second time (DNS rebinding) gets nowhere.
//! Same rules as the web build's api/fetch.ts.
//! (Through a system proxy the proxy resolves names; then only the check before the request applies.)

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
    // Not 198.18.0.0/15: proxy clients in "fake IP" mode (Clash, sing-box) answer every name with
    // an address from it, and a link through such a proxy is the public internet, not the home network.
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
async fn host_is_private(host: String) -> Result<bool, String> {
    let lookup = tauri::async_runtime::spawn_blocking(move || resolve_is_private(&host));
    match tokio::time::timeout(std::time::Duration::from_secs(8), lookup).await {
        Ok(r) => r.map_err(|e| e.to_string())?,
        Err(_) => Err("RESOLVE_FAILED".into()),
    }
}

/// The resolver's refusal; found again in reqwest's error chain to tell it from other failures.
#[derive(Debug)]
struct PrivateHost;

impl std::fmt::Display for PrivateHost {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("PRIVATE_HOST")
    }
}

impl std::error::Error for PrivateHost {}

fn is_private_host_error(e: &(dyn std::error::Error + 'static)) -> bool {
    let mut cur = Some(e);
    while let Some(err) = cur {
        if err.is::<PrivateHost>() {
            return true;
        }
        cur = err.source();
    }
    false
}

/// Resolves names for preview_fetch and refuses the link's host when it points at a non-public
/// address, at the moment of connecting. Other names (a system proxy given by name, which may well
/// sit in the local network) resolve as usual.
struct PublicOnly {
    target: String,
}

impl reqwest::dns::Resolve for PublicOnly {
    fn resolve(&self, name: reqwest::dns::Name) -> reqwest::dns::Resolving {
        let host = name.as_str().to_string();
        let guard = host.eq_ignore_ascii_case(&self.target);
        Box::pin(async move {
            let addrs: Vec<std::net::SocketAddr> = tokio::net::lookup_host((host.as_str(), 0)).await?.collect();
            if guard && (addrs.is_empty() || addrs.iter().any(|a| private_ip(a.ip()))) {
                return Err(Box::new(PrivateHost) as Box<dyn std::error::Error + Send + Sync>);
            }
            Ok(Box::new(addrs.into_iter()) as reqwest::dns::Addrs)
        })
    }
}

const PREVIEW_MAX_BYTES: usize = 2_000_000;
const PREVIEW_MAX_REDIRECTS: usize = 5;

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewResponse {
    status: u16,
    /// Where the last redirect led.
    url: String,
    content_type: String,
    /// Base64 of at most PREVIEW_MAX_BYTES of the body.
    body: String,
}

/// A client for one hop: its resolver guards that hop's host.
fn preview_client(host: &str) -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .dns_resolver(std::sync::Arc::new(PublicOnly { target: host.trim_start_matches('[').trim_end_matches(']').to_string() }))
        .redirect(reqwest::redirect::Policy::none())
        .connect_timeout(std::time::Duration::from_secs(8))
        .timeout(std::time::Duration::from_secs(15))
        .user_agent("Mozilla/5.0 (compatible; Kipple/0.1; link preview)")
        .build()
        .map_err(|e| e.to_string())
}

/// Fetches a link (or its picture) for a preview: http(s) only, public addresses only (checked
/// for every redirect, and again when connecting), at most 5 redirects and 2 MB. "PRIVATE_HOST"
/// when a step leads into a home network.
#[tauri::command]
pub async fn preview_fetch(url: String, accept: Option<String>) -> Result<PreviewResponse, String> {
    use base64::Engine;
    let mut current = reqwest::Url::parse(&url).map_err(|e| e.to_string())?;
    for hop in 0..=PREVIEW_MAX_REDIRECTS {
        if !matches!(current.scheme(), "http" | "https") {
            return Err("PRIVATE_HOST".into());
        }
        let host = current.host_str().unwrap_or("").to_string();
        // IP literals never reach the resolver, and with a proxy the proxy resolves: check here too.
        if host_is_private(host.clone()).await? {
            return Err("PRIVATE_HOST".into());
        }
        let mut req = preview_client(&host)?.get(current.clone());
        if let Some(a) = &accept {
            req = req.header(reqwest::header::ACCEPT, a);
        }
        let mut res = req.send().await.map_err(|e| if is_private_host_error(&e) { "PRIVATE_HOST".to_string() } else { e.to_string() })?;
        let status = res.status();
        // A 3xx without a usable Location (304, 300) is the answer itself, as in the browser build.
        let location = res.headers().get(reqwest::header::LOCATION).and_then(|v| v.to_str().ok());
        if let (true, Some(loc)) = (status.is_redirection(), location) {
            if hop == PREVIEW_MAX_REDIRECTS {
                return Err("too many redirects".into());
            }
            current = current.join(loc).map_err(|e| e.to_string())?;
            continue;
        }
        let content_type = res.headers().get(reqwest::header::CONTENT_TYPE).and_then(|v| v.to_str().ok()).unwrap_or("").to_string();
        let mut body = Vec::new();
        while let Some(chunk) = res.chunk().await.map_err(|e| e.to_string())? {
            let room = PREVIEW_MAX_BYTES - body.len();
            body.extend_from_slice(&chunk[..chunk.len().min(room)]);
            if body.len() >= PREVIEW_MAX_BYTES {
                break;
            }
        }
        return Ok(PreviewResponse {
            status: status.as_u16(),
            url: current.to_string(),
            content_type,
            body: base64::engine::general_purpose::STANDARD.encode(body),
        });
    }
    Err("too many redirects".into())
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

    #[test]
    fn resolver_guards_only_the_links_host() {
        use reqwest::dns::Resolve;
        use std::str::FromStr;
        let name = || reqwest::dns::Name::from_str("localhost").unwrap();
        tauri::async_runtime::block_on(async {
            let refused = PublicOnly { target: "localhost".into() }.resolve(name()).await.err().expect("refused");
            assert!(is_private_host_error(refused.as_ref()));
            // A proxy given by name (here: not the link's host) may live in the local network.
            assert!(PublicOnly { target: "example.com".into() }.resolve(name()).await.is_ok());
        });
    }

    #[test]
    fn preview_fetch_refuses_private_and_odd_links() {
        tauri::async_runtime::block_on(async {
            for url in ["http://127.0.0.1:9/", "http://[::1]:9/", "http://localhost:9/", "file:///etc/passwd"] {
                assert_eq!(preview_fetch(url.into(), None).await.err().as_deref(), Some("PRIVATE_HOST"), "{url}");
            }
        });
    }
}
