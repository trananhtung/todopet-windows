//! Which network addresses the calendar fetcher may connect to.
//!
//! Calendar links are user input that Rust fetches with the app's own network access, so a link (or a
//! redirect, or a DNS answer) must never point the request at this machine or the local network: the
//! router admin page, a NAS, a dev server on localhost. Only globally routable unicast addresses pass.

use std::net::{IpAddr, Ipv4Addr, Ipv6Addr};
use url::{Host, Url};

/// Why a request target was refused. The messages never contain the address itself (calendar links are
/// secrets).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Refused {
    NotHttps,
    NoHost,
    PrivateAddress,
}

impl Refused {
    pub fn message(self) -> &'static str {
        match self {
            Refused::NotHttps => "Only https:// addresses are allowed",
            Refused::NoHost => "The address has no host",
            Refused::PrivateAddress => "The address is on this computer or a local network",
        }
    }
}

impl std::fmt::Display for Refused {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.message())
    }
}

impl std::error::Error for Refused {}

/// True for addresses on the public internet; false for loopback, private (RFC 1918), CGNAT, link-local,
/// unique-local, unspecified, multicast, broadcast, documentation and other special-purpose ranges.
/// IPv6 forms that embed an IPv4 address (mapped, compatible, NAT64, 6to4) are judged by that address.
pub fn is_public_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => is_public_v4(v4),
        IpAddr::V6(v6) => is_public_v6(v6),
    }
}

fn is_public_v4(ip: Ipv4Addr) -> bool {
    let [a, b, c, _] = ip.octets();
    let special = a == 0 // "this network", includes 0.0.0.0
        || a == 10 // private
        || (a == 100 && (64..=127).contains(&b)) // CGNAT 100.64.0.0/10
        || a == 127 // loopback
        || (a == 169 && b == 254) // link-local
        || (a == 172 && (16..=31).contains(&b)) // private
        || (a == 192 && b == 0 && c == 0) // IETF protocol assignments
        || (a == 192 && b == 0 && c == 2) // documentation
        || (a == 192 && b == 88 && c == 99) // 6to4 relay anycast
        || (a == 192 && b == 168) // private
        || (a == 198 && (b == 18 || b == 19)) // benchmarking
        || (a == 198 && b == 51 && c == 100) // documentation
        || (a == 203 && b == 0 && c == 113) // documentation
        || a >= 224; // multicast 224/4, reserved 240/4, broadcast
    !special
}

fn is_public_v6(ip: Ipv6Addr) -> bool {
    let seg = ip.segments();
    // ::ffff:a.b.c.d (mapped) and ::a.b.c.d (deprecated compatible form; also covers :: and ::1).
    if seg[..5].iter().all(|&s| s == 0) && (seg[5] == 0 || seg[5] == 0xffff) {
        return is_public_v4(embedded_v4(seg[6], seg[7]));
    }
    // NAT64 well-known prefix 64:ff9b::/96 reaches the embedded IPv4 address.
    if seg[..6] == [0x64, 0xff9b, 0, 0, 0, 0] {
        return is_public_v4(embedded_v4(seg[6], seg[7]));
    }
    // 6to4 2002:AABB:CCDD::/48 reaches AA.BB.CC.DD.
    if seg[0] == 0x2002 {
        return is_public_v4(embedded_v4(seg[1], seg[2]));
    }
    let special = (seg[0] == 0x64 && seg[1] == 0xff9b && seg[2] == 1) // local-use NAT64 64:ff9b:1::/48
        || (seg[0] == 0x100 && seg[1..4] == [0, 0, 0]) // discard-only 100::/64
        || (seg[0] == 0x2001 && seg[1] == 0xdb8) // documentation
        || (seg[0] & 0xfe00) == 0xfc00 // unique local fc00::/7
        || (seg[0] & 0xffc0) == 0xfe80 // link-local fe80::/10
        || (seg[0] & 0xffc0) == 0xfec0 // site-local fec0::/10 (deprecated)
        || (seg[0] & 0xff00) == 0xff00; // multicast
    !special
}

fn embedded_v4(hi: u16, lo: u16) -> Ipv4Addr {
    let [a, b] = hi.to_be_bytes();
    let [c, d] = lo.to_be_bytes();
    Ipv4Addr::new(a, b, c, d)
}

/// `localhost` and `*.localhost` always mean this computer (RFC 6761), whatever DNS says.
pub fn is_localhost_name(domain: &str) -> bool {
    let d = domain.trim_end_matches('.').to_ascii_lowercase();
    d == "localhost" || d.ends_with(".localhost")
}

/// Checks a URL the calendar fetcher is about to request (the link itself or a redirect target): HTTPS,
/// a host, and no literal private address or `localhost`. Domain names are checked again after DNS
/// resolution, since only the resolver sees the addresses they point to.
pub fn check_target(url: &Url) -> Result<(), Refused> {
    if url.scheme() != "https" {
        return Err(Refused::NotHttps);
    }
    match url.host() {
        None => Err(Refused::NoHost),
        Some(Host::Domain("")) => Err(Refused::NoHost),
        Some(Host::Domain(d)) if is_localhost_name(d) => Err(Refused::PrivateAddress),
        Some(Host::Domain(_)) => Ok(()),
        Some(Host::Ipv4(ip)) if is_public_v4(ip) => Ok(()),
        Some(Host::Ipv6(ip)) if is_public_v6(ip) => Ok(()),
        Some(_) => Err(Refused::PrivateAddress),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn public(s: &str) -> bool {
        is_public_ip(s.parse().unwrap())
    }

    #[test]
    fn ipv4_ranges() {
        for addr in [
            "8.8.8.8",
            "1.1.1.1",
            "142.250.72.14",
            "100.63.255.255",
            "100.128.0.0",
            "172.15.255.255",
            "172.32.0.0",
            "223.255.255.255",
            "198.17.0.1",
            "198.20.0.1",
        ] {
            assert!(public(addr), "{addr}");
        }
        for addr in [
            "0.0.0.0",
            "0.1.2.3",
            "10.0.0.1",
            "10.255.255.255",
            "100.64.0.1",
            "100.127.255.255",
            "127.0.0.1",
            "127.255.255.254",
            "169.254.169.254",
            "172.16.0.1",
            "172.31.255.255",
            "192.0.0.8",
            "192.0.2.1",
            "192.168.1.1",
            "198.18.0.1",
            "198.51.100.7",
            "203.0.113.9",
            "224.0.0.1",
            "239.255.255.250",
            "240.0.0.1",
            "255.255.255.255",
        ] {
            assert!(!public(addr), "{addr}");
        }
    }

    #[test]
    fn ipv6_ranges() {
        for addr in [
            "2001:4860:4860::8888",
            "2606:4700:4700::1111",
            "2a00:1450:4001:80b::200e",
            "64:ff9b::808:808",
            "2002:808:808::1",
            "::ffff:8.8.8.8",
        ] {
            assert!(public(addr), "{addr}");
        }
        for addr in [
            "::",
            "::1",
            "::ffff:127.0.0.1",
            "::ffff:10.0.0.1",
            "::ffff:192.168.0.1",
            "::ffff:169.254.169.254",
            "::127.0.0.1",
            "64:ff9b::7f00:1",
            "64:ff9b::a00:1",
            "64:ff9b:1::1",
            "2002:7f00:1::1",
            "2002:c0a8:101::1",
            "100::1",
            "2001:db8::1",
            "fc00::1",
            "fd12:3456:789a::1",
            "fe80::1",
            "febf::1",
            "fec0::1",
            "ff02::1",
        ] {
            assert!(!public(addr), "{addr}");
        }
    }

    #[test]
    fn localhost_names() {
        assert!(is_localhost_name("localhost"));
        assert!(is_localhost_name("LOCALHOST."));
        assert!(is_localhost_name("app.localhost"));
        assert!(!is_localhost_name("localhost.example.com"));
        assert!(!is_localhost_name("mylocalhost"));
    }

    #[test]
    fn targets() {
        let check = |s: &str| check_target(&Url::parse(s).unwrap());
        assert_eq!(check("https://calendar.google.com/calendar/ical/x/basic.ics"), Ok(()));
        assert_eq!(check("https://8.8.8.8/a.ics"), Ok(()));
        assert_eq!(check("https://[2606:4700:4700::1111]/a.ics"), Ok(()));
        assert_eq!(check("http://calendar.google.com/a.ics"), Err(Refused::NotHttps));
        assert_eq!(check("webcal://calendar.google.com/a.ics"), Err(Refused::NotHttps));
        for addr in [
            "https://localhost/a.ics",
            "https://cal.localhost/a.ics",
            "https://127.0.0.1/a.ics",
            "https://127.1/a.ics",
            "https://0x7f000001/a.ics",
            "https://2130706433/a.ics",
            "https://0177.0.0.1/a.ics",
            "https://127.0.0.1./a.ics",
            "https://10.1.2.3:8443/a.ics",
            "https://169.254.169.254/latest/meta-data",
            "https://[::1]/a.ics",
            "https://[::ffff:127.0.0.1]/a.ics",
            "https://[fd00::1]/a.ics",
            "https://user:pw@192.168.1.1/a.ics",
        ] {
            assert_eq!(check(addr), Err(Refused::PrivateAddress), "{addr}");
        }
    }
}
