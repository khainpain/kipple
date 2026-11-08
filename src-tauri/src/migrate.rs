//! Moving over from the old app identifier.
//!
//! Until v0.1.17 the app identifier was `com.khainpain.savedboard` (from the old name Saved Board).
//! It names the data folder, the credential-store entries and the web view's storage, so the
//! first launch with the new identifier copies all of that over. It runs before any window opens.
//!
//! Nothing old is deleted except the credential entries once their copy reads back: the old data
//! folder stays as it was, as a backup.

use std::path::Path;

/// The current app identifier (tauri.conf.json → identifier). Also the credential-store service.
pub const APP_ID: &str = "io.getkipple.app";
/// The identifier before the rename.
pub const OLD_APP_ID: &str = "com.khainpain.savedboard";

/// Every credential the app keeps (lib.rs and telegram.rs).
const SECRETS: &[&str] = &["anthropic_api_key", "kipple_install_id", "telegram_session", "telegram_api_id", "telegram_api_hash"];

/// Written into the new data folder once its files were copied over.
#[cfg_attr(not(windows), allow(dead_code))]
const MARKER: &str = "migrated-from-savedboard";

pub fn run() {
    #[cfg(not(windows))]
    move_secrets(false);
    #[cfg(windows)]
    {
        if let Some(roaming) = std::env::var_os("APPDATA") {
            let roaming = Path::new(&roaming);
            // Until the data has been copied, the old install is the one in use: its credentials
            // win over any left in the new place (e.g. after going back to an older version and
            // deleting the new folder to migrate again).
            move_secrets(!roaming.join(APP_ID).join(MARKER).exists());
            let _ = copy_data(&roaming.join(OLD_APP_ID), &roaming.join(APP_ID));
        }
        if let Some(local) = std::env::var_os("LOCALAPPDATA") {
            // The web view's localStorage: language, theme, panel sizes, view settings.
            let part = Path::new("EBWebView").join("Default").join("Local Storage");
            let local = Path::new(&local);
            let (from, to) = (local.join(OLD_APP_ID).join(&part), local.join(APP_ID).join(&part));
            if from.is_dir() && !to.exists() {
                let _ = copy_missing(&from, &to);
            }
        }
    }
}

/// Copies credentials to the new service name (over an existing one when `overwrite`); the old
/// entry goes once the copy reads back.
fn move_secrets(overwrite: bool) {
    for name in SECRETS {
        let (Ok(old), Ok(new)) = (keyring::Entry::new(OLD_APP_ID, name), keyring::Entry::new(APP_ID, name)) else { continue };
        let Ok(value) = old.get_password() else { continue };
        let missing = matches!(new.get_password(), Err(keyring::Error::NoEntry));
        if (overwrite || missing) && new.set_password(&value).is_err() {
            continue;
        }
        if new.get_password().is_ok_and(|v| v == value) {
            let _ = old.delete_credential();
        }
    }
}

/// Copies the old data folder into the new one (files already there are kept) and points the
/// library's downloaded photos at their new place. Done once; retried next launch if it fails.
#[cfg_attr(not(windows), allow(dead_code))]
fn copy_data(old: &Path, new: &Path) -> std::io::Result<()> {
    if !old.is_dir() || new.join(MARKER).exists() {
        return Ok(());
    }
    copy_missing(old, new)?;
    let library = new.join("library.json");
    if library.is_file() {
        let text = std::fs::read_to_string(&library)?;
        let fixed = repoint_media(&text);
        if fixed != text {
            let tmp = new.join("library.json.migrate");
            std::fs::write(&tmp, fixed)?;
            std::fs::rename(&tmp, &library)?;
        }
    }
    std::fs::write(new.join(MARKER), OLD_APP_ID)
}

/// Absolute photo paths in library.json (JSON text) moved from the old data folder to the new one.
#[cfg_attr(not(windows), allow(dead_code))]
fn repoint_media(json: &str) -> String {
    json.replace(&format!("{OLD_APP_ID}\\\\telegram-media"), &format!("{APP_ID}\\\\telegram-media"))
        .replace(&format!("{OLD_APP_ID}/telegram-media"), &format!("{APP_ID}/telegram-media"))
}

/// Copies a folder tree, skipping files that already exist at the destination.
#[cfg_attr(not(windows), allow(dead_code))]
fn copy_missing(from: &Path, to: &Path) -> std::io::Result<()> {
    std::fs::create_dir_all(to)?;
    for entry in std::fs::read_dir(from)? {
        let entry = entry?;
        let dest = to.join(entry.file_name());
        let kind = entry.file_type()?;
        if kind.is_dir() {
            copy_missing(&entry.path(), &dest)?;
        } else if kind.is_file() && !dest.exists() {
            std::fs::copy(entry.path(), &dest)?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn copies_old_data_once_and_repoints_photos() {
        let root = std::env::temp_dir().join(format!("kipple-migrate-test-{}", std::process::id()));
        let (old, new) = (root.join(OLD_APP_ID), root.join(APP_ID));
        std::fs::create_dir_all(old.join("telegram-media")).unwrap();
        std::fs::write(old.join("telegram-media").join("1.jpg"), "photo").unwrap();
        let lib = r#"{"path":"C:\\Users\\a\\AppData\\Roaming\\com.khainpain.savedboard\\telegram-media\\1.jpg"}"#;
        std::fs::write(old.join("library.json"), lib).unwrap();
        std::fs::create_dir_all(&new).unwrap();
        std::fs::write(new.join("settings.json"), "new").unwrap();
        std::fs::write(old.join("settings.json"), "old").unwrap();

        copy_data(&old, &new).unwrap();
        assert_eq!(std::fs::read_to_string(new.join("telegram-media").join("1.jpg")).unwrap(), "photo");
        assert_eq!(std::fs::read_to_string(new.join("settings.json")).unwrap(), "new", "existing files are kept");
        assert_eq!(
            std::fs::read_to_string(new.join("library.json")).unwrap(),
            r#"{"path":"C:\\Users\\a\\AppData\\Roaming\\io.getkipple.app\\telegram-media\\1.jpg"}"#
        );
        assert_eq!(std::fs::read_to_string(old.join("library.json")).unwrap(), lib, "the old folder stays as it was");

        // Once done, a later launch copies nothing again.
        std::fs::write(new.join("library.json"), "later").unwrap();
        std::fs::remove_file(new.join("telegram-media").join("1.jpg")).unwrap();
        copy_data(&old, &new).unwrap();
        assert_eq!(std::fs::read_to_string(new.join("library.json")).unwrap(), "later");
        assert!(!new.join("telegram-media").join("1.jpg").exists());
        std::fs::remove_dir_all(&root).unwrap();
    }
}
