// Kipple Setup: a small branded window for the first install.
// It carries the regular NSIS setup.exe inside and runs it silently (/S), the same way
// the auto-updater does, so installs and updates go through one and the same installer.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::path::PathBuf;
use std::process::Command;

use serde::Serialize;
use tauri::Manager;

static PAYLOAD: &[u8] = include_bytes!(env!("KIPPLE_PAYLOAD_PATH"));

const PRODUCT: &str = "Kipple";
const UNINSTALL_KEY: &str = r"Software\Microsoft\Windows\CurrentVersion\Uninstall\Kipple";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Info {
    version: String,
    installed_version: Option<String>,
    install_dir: String,
}

/// What we know before installing: the version inside, and an existing install, if any.
#[tauri::command]
fn info(app: tauri::AppHandle) -> Info {
    let existing = read_install();
    Info {
        version: app.package_info().version.to_string(),
        installed_version: existing.as_ref().and_then(|i| i.version.clone()),
        install_dir: existing
            .map(|i| i.dir)
            .unwrap_or_else(default_dir)
            .display()
            .to_string(),
    }
}

#[tauri::command]
fn pick_dir(app: tauri::AppHandle, current: String) -> Option<String> {
    use tauri_plugin_dialog::DialogExt;
    let picked = app
        .dialog()
        .file()
        .set_directory(&current)
        .blocking_pick_folder()?;
    let mut dir = picked.into_path().ok()?;
    // Picking "D:\Apps" means "D:\Apps\Kipple", like every other installer.
    if dir.file_name().is_none_or(|n| n != PRODUCT) {
        dir.push(PRODUCT);
    }
    Some(dir.display().to_string())
}

/// Runs the embedded setup.exe silently into `dir` and waits for it.
#[tauri::command]
async fn install(app: tauri::AppHandle, dir: String, desktop_shortcut: bool) -> Result<(), String> {
    // Known folder, so a Desktop moved to OneDrive is found too.
    let desktop = app.path().desktop_dir().ok();
    let drop_shortcut = if desktop_shortcut { None } else { desktop };
    tauri::async_runtime::spawn_blocking(move || run_setup(&dir, drop_shortcut))
        .await
        .map_err(|e| e.to_string())?
}

/// Starts the installed app and closes this window.
#[tauri::command]
fn launch(app: tauri::AppHandle) -> Result<(), String> {
    let installed = read_install().ok_or("Kipple is not installed")?;
    let exe = installed.dir.join(installed.exe);
    Command::new(&exe)
        .current_dir(&installed.dir)
        .spawn()
        .map_err(|e| format!("{}: {e}", exe.display()))?;
    app.exit(0);
    Ok(())
}

fn run_setup(dir: &str, drop_shortcut_in: Option<PathBuf>) -> Result<(), String> {
    if PAYLOAD.is_empty() {
        return Err("This build has no installer inside".into());
    }
    let setup = write_payload()?;
    let mut cmd = Command::new(&setup);
    cmd.arg("/S");
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
        // NSIS wants /D= last and without quotes, even with spaces in the path.
        cmd.raw_arg(format!("/D={dir}"));
    }
    let status = cmd.status().map_err(|e| e.to_string());
    let _ = std::fs::remove_file(&setup);
    let status = status?;
    if !status.success() {
        return Err(format!("setup exited with code {}", status.code().unwrap_or(-1)));
    }
    // The silent NSIS install always makes a desktop shortcut; drop it if it wasn't wanted.
    if let Some(desktop) = drop_shortcut_in {
        let _ = std::fs::remove_file(desktop.join(format!("{PRODUCT}.lnk")));
    }
    Ok(())
}

fn write_payload() -> Result<PathBuf, String> {
    let path = std::env::temp_dir().join(format!("kipple-setup-{}.exe", std::process::id()));
    std::fs::write(&path, PAYLOAD).map_err(|e| e.to_string())?;
    Ok(path)
}

/// Without WebView2 this window can't draw itself, so fall back to the classic wizard.
fn run_classic_wizard() {
    if let Ok(setup) = write_payload() {
        let _ = Command::new(&setup).status();
        let _ = std::fs::remove_file(setup);
    }
}

struct Installed {
    dir: PathBuf,
    exe: String,
    version: Option<String>,
}

#[cfg(windows)]
fn read_install() -> Option<Installed> {
    use winreg::{RegKey, enums::HKEY_CURRENT_USER};
    let key = RegKey::predef(HKEY_CURRENT_USER).open_subkey(UNINSTALL_KEY).ok()?;
    let dir: String = key.get_value("InstallLocation").ok()?;
    let dir = PathBuf::from(dir.trim_matches('"'));
    let exe = key
        .get_value::<String, _>("MainBinaryName")
        .unwrap_or_else(|_| format!("{PRODUCT}.exe"));
    Some(Installed {
        dir,
        exe,
        version: key.get_value("DisplayVersion").ok(),
    })
}

#[cfg(not(windows))]
fn read_install() -> Option<Installed> {
    let _ = UNINSTALL_KEY;
    None
}

fn default_dir() -> PathBuf {
    std::env::var_os("LOCALAPPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(std::env::temp_dir)
        .join(PRODUCT)
}

fn main() {
    if tauri::webview_version().is_err() {
        run_classic_wizard();
        return;
    }
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![info, pick_dir, install, launch])
        .run(tauri::generate_context!())
        .expect("error while running Kipple Setup");
}
