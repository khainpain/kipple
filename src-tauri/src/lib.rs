mod telegram;

const SERVICE: &str = "com.khainpain.savedboard";

/// The only secrets the web view may touch. The Telegram session and api keys live in the same
/// store but are read only by Rust (telegram.rs): if a page ever ran someone else's script,
/// it still couldn't take the Telegram session, which is full access to the account.
const WEBVIEW_SECRETS: &[&str] = &["anthropic_api_key", "kipple_install_id"];

fn entry(name: &str) -> Result<keyring::Entry, String> {
    if !WEBVIEW_SECRETS.contains(&name) {
        return Err(format!("secret {name:?} is not available here"));
    }
    keyring::Entry::new(SERVICE, name).map_err(|e| e.to_string())
}

/// Reads a secret (the Anthropic API key, the install id) from the OS credential store.
#[tauri::command]
fn get_secret(name: String) -> Result<Option<String>, String> {
    match entry(&name)?.get_password() {
        Ok(v) => Ok(Some(v)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
fn set_secret(name: String, value: String) -> Result<(), String> {
    entry(&name)?.set_password(&value).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_secret(name: String) -> Result<(), String> {
    match entry(&name)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_process::init())
        .manage(telegram::TgState::default())
        .setup(|app| {
            // Checks GitHub Releases for a newer signed build; the UI asks before installing.
            #[cfg(desktop)]
            app.handle().plugin(tauri_plugin_updater::Builder::new().build())?;
            let _ = app;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_secret,
            set_secret,
            delete_secret,
            telegram::tg_status,
            telegram::tg_account,
            telegram::tg_set_api,
            telegram::tg_clear_api,
            telegram::tg_request_code,
            telegram::tg_sign_in,
            telegram::tg_check_password,
            telegram::tg_qr_poll,
            telegram::tg_qr_cancel,
            telegram::tg_logout,
            telegram::tg_ensure_board,
            telegram::tg_create_topic,
            telegram::tg_forward,
            telegram::tg_send_note,
            telegram::tg_saved_page,
            telegram::tg_source_link,
            telegram::tg_saved_photos,
            telegram::tg_forget_media
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
