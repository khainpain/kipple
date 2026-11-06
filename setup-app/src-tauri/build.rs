use std::{env, fs, path::PathBuf};

/// The NSIS setup.exe built by the main app is embedded into this exe.
/// CI copies it to payload/kipple-setup.exe (or points KIPPLE_PAYLOAD at it).
/// Without it (a local `cargo check`) an empty placeholder is embedded and Install reports an error.
fn main() {
    println!("cargo:rerun-if-env-changed=KIPPLE_PAYLOAD");
    println!("cargo:rerun-if-changed=payload/kipple-setup.exe");
    let manifest = PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap());
    let payload = env::var("KIPPLE_PAYLOAD")
        .map(PathBuf::from)
        .unwrap_or_else(|_| manifest.join("payload").join("kipple-setup.exe"));
    let payload = if payload.is_file() {
        payload
    } else {
        println!("cargo:warning=No payload at {}, embedding an empty placeholder", payload.display());
        let empty = PathBuf::from(env::var("OUT_DIR").unwrap()).join("empty-payload.exe");
        fs::write(&empty, b"").unwrap();
        empty
    };
    println!("cargo:rustc-env=KIPPLE_PAYLOAD_PATH={}", payload.display());
    tauri_build::build()
}
