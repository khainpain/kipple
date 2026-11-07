//! Telegram account access for «Отправить в Telegram».
//!
//! The app talks to Telegram directly over MTProto (the protocol Telegram's own apps use)
//! with the user's own account, so it can forward the original messages from Saved Messages.
//! There is no server in between. The only thing kept between launches is the session's
//! authorization key, stored in the OS credential store next to the Anthropic key.
//!
//! These commands are deliberately small (create the group, create a topic, forward, post a
//! note). The send loop, pacing and "what was already sent" bookkeeping live in TypeScript
//! (src/lib/telegram.ts) where they are easy to test.

use std::collections::HashMap;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use grammers_client::client::{LoginToken, PasswordToken};
use grammers_client::media::Downloadable;
use grammers_client::sender::{AutoSleep, ConnectionParams, SenderPool};
use grammers_client::session::storages::MemorySession;
use grammers_client::session::updates::UpdatesLike;
use grammers_client::session::{Session, SessionData};
use grammers_client::tl;
use grammers_client::{Client, InvocationError, SignInError};
use serde::Serialize;
use tokio::sync::{Mutex, MutexGuard};

const SERVICE: &str = "com.khainpain.savedboard";
const SESSION_KEY: &str = "telegram_session";
const API_ID_KEY: &str = "telegram_api_id";
const API_HASH_KEY: &str = "telegram_api_hash";

/// Optional app credentials baked in at build time (GitHub secrets TG_API_ID / TG_API_HASH),
/// so friends don't need their own from my.telegram.org. Values the user enters win.
const BUILT_IN_API_ID: Option<&str> = option_env!("TG_API_ID");
const BUILT_IN_API_HASH: Option<&str> = option_env!("TG_API_HASH");

struct Conn {
    client: Client,
    session: Arc<MemorySession>,
    api_id: i32,
    api_hash: String,
    login: Option<LoginToken>,
    password: Option<PasswordToken>,
    /// The QR login token being shown and when it expires (unix seconds).
    qr: Option<(Vec<u8>, i64)>,
    /// Set when Telegram sends updateLoginToken: the QR was scanned and accepted on the phone.
    qr_scanned: Arc<AtomicBool>,
}

#[derive(Default)]
pub struct TgState(Mutex<Option<Conn>>);

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TgStatus {
    /// api_id / api_hash are known (entered by the user or built in).
    has_api: bool,
    /// This build has api_id / api_hash baked in, so the user never has to enter them.
    built_in_api: bool,
    /// The user saved their own api_id / api_hash (Settings → Advanced); they win over the built-in ones.
    custom_api: bool,
    authorized: bool,
    name: Option<String>,
}

/// The signed-in account, for the sidebar header.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Account {
    name: String,
    username: Option<String>,
    /// The small (160×160) profile photo as JPEG bytes, if the user has one.
    photo: Option<Vec<u8>>,
}

#[derive(Serialize)]
#[serde(tag = "status", rename_all = "camelCase")]
pub enum SignInResult {
    Ok { name: String },
    Password { hint: Option<String> },
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Board {
    channel_id: i64,
    /// A string because it doesn't fit in a JavaScript number.
    access_hash: String,
    created: bool,
}

fn keyring(name: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new(SERVICE, name).map_err(|e| e.to_string())
}

fn read_secret(name: &str) -> Option<String> {
    keyring(name).ok()?.get_password().ok().filter(|s| !s.trim().is_empty())
}

/// CI passes an empty string when the secrets aren't set.
fn built_in_api() -> Option<(&'static str, &'static str)> {
    match (BUILT_IN_API_ID, BUILT_IN_API_HASH) {
        (Some(id), Some(hash)) if !id.trim().is_empty() && !hash.trim().is_empty() => Some((id, hash)),
        _ => None,
    }
}

fn custom_api() -> bool {
    read_secret(API_ID_KEY).is_some() && read_secret(API_HASH_KEY).is_some()
}

fn api_credentials() -> Option<(i32, String)> {
    let (id, hash) = match (read_secret(API_ID_KEY), read_secret(API_HASH_KEY)) {
        (Some(id), Some(hash)) => (id, hash),
        _ => built_in_api().map(|(id, hash)| (id.to_string(), hash.to_string()))?,
    };
    Some((id.trim().parse().ok()?, hash.trim().to_string()))
}

/// Turns Telegram errors into short codes the UI understands: `FLOOD_WAIT:<seconds>` for
/// rate limits, the RPC name (e.g. `PHONE_CODE_INVALID`) for API errors.
fn err(e: InvocationError) -> String {
    match e {
        InvocationError::Rpc(rpc) if rpc.code == 420 => format!("FLOOD_WAIT:{}", rpc.value.unwrap_or(30)),
        InvocationError::Rpc(rpc) => match rpc.value {
            Some(v) => format!("{}_{}", rpc.name, v),
            None => rpc.name,
        },
        other => other.to_string(),
    }
}

fn random_id() -> i64 {
    static COUNTER: AtomicU64 = AtomicU64::new(0);
    let nanos = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_nanos() as u64).unwrap_or(0);
    let mut x = nanos ^ COUNTER.fetch_add(1, Ordering::Relaxed).wrapping_mul(0x9E37_79B9_7F4A_7C15);
    // splitmix64 finaliser: spreads close timestamps apart.
    x = (x ^ (x >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
    x = (x ^ (x >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
    (x ^ (x >> 31)) as i64
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

fn unhex(s: &str) -> Option<[u8; 256]> {
    if s.len() != 512 {
        return None;
    }
    let mut out = [0u8; 256];
    for (i, b) in out.iter_mut().enumerate() {
        *b = u8::from_str_radix(s.get(i * 2..i * 2 + 2)?, 16).ok()?;
    }
    Some(out)
}

/// Rebuilds the session from the saved "<dc>:<hex auth key>" (about 520 characters, small
/// enough for Windows Credential Manager).
fn load_session() -> MemorySession {
    let mut data = SessionData::default();
    if let Some(saved) = read_secret(SESSION_KEY)
        && let Some((dc, key)) = saved.split_once(':')
        && let (Ok(dc), Some(key)) = (dc.parse::<i32>(), unhex(key))
        && let Some(opt) = data.dc_options.get_mut(&dc)
    {
        opt.auth_key = Some(key);
        data.home_dc = dc;
    }
    MemorySession::from(data)
}

fn save_session(session: &MemorySession) -> Result<(), String> {
    let dc = session.home_dc_id().map_err(|e| e.to_string())?;
    let key = session
        .dc_option(dc)
        .map_err(|e| e.to_string())?
        .and_then(|o| o.auth_key)
        .ok_or("нет ключа сессии")?;
    keyring(SESSION_KEY)?.set_password(&format!("{dc}:{}", hex(&key))).map_err(|e| e.to_string())
}

fn forget_session() {
    if let Ok(e) = keyring(SESSION_KEY) {
        let _ = e.delete_credential();
    }
}

fn connect() -> Result<Conn, String> {
    let (api_id, api_hash) = api_credentials().ok_or("NO_API")?;
    let session = Arc::new(load_session());
    let params = ConnectionParams {
        device_model: "Kipple".into(),
        app_version: env!("CARGO_PKG_VERSION").into(),
        // Short rate-limit waits are slept through here; longer ones go back to the UI,
        // which shows the pause and resumes by itself.
        retry_policy: Box::new(AutoSleep { threshold: Duration::from_secs(15), ..Default::default() }),
        ..Default::default()
    };
    let pool = SenderPool::with_configuration(Arc::clone(&session), api_id, params);
    let client = Client::new(pool.handle);
    tauri::async_runtime::spawn(pool.runner.run());
    // The only update we care about is updateLoginToken (QR sign-in confirmed on the phone);
    // everything else is drained and dropped.
    let qr_scanned = Arc::new(AtomicBool::new(false));
    let flag = Arc::clone(&qr_scanned);
    let mut updates = pool.updates;
    tauri::async_runtime::spawn(async move {
        while let Some(u) = updates.recv().await {
            if let UpdatesLike::Updates(u) = u
                && updates_parts(u).0.iter().any(|u| matches!(u, tl::enums::Update::LoginToken))
            {
                flag.store(true, Ordering::Relaxed);
            }
        }
    });
    Ok(Conn { client, session, api_id, api_hash, login: None, password: None, qr: None, qr_scanned })
}

/// Locks the connection, opening it on first use.
async fn conn(state: &TgState) -> Result<Connected<'_>, String> {
    let mut guard = state.0.lock().await;
    if guard.is_none() {
        *guard = Some(connect()?);
    }
    Ok(Connected(guard))
}

struct Connected<'a>(MutexGuard<'a, Option<Conn>>);

impl std::ops::Deref for Connected<'_> {
    type Target = Conn;
    fn deref(&self) -> &Conn {
        self.0.as_ref().expect("connected")
    }
}

impl std::ops::DerefMut for Connected<'_> {
    fn deref_mut(&mut self) -> &mut Conn {
        self.0.as_mut().expect("connected")
    }
}

fn user_name(u: &tl::enums::User) -> String {
    match u {
        tl::enums::User::User(u) => {
            let name = [u.first_name.as_deref(), u.last_name.as_deref()].into_iter().flatten().collect::<Vec<_>>().join(" ");
            if name.is_empty() { u.username.clone().unwrap_or_default() } else { name }
        }
        tl::enums::User::Empty(_) => String::new(),
    }
}

async fn me(client: &Client) -> Result<Option<String>, InvocationError> {
    let req = tl::functions::users::GetUsers { id: vec![tl::enums::InputUser::UserSelf] };
    match client.invoke(&req).await {
        Ok(users) => Ok(users.first().map(user_name)),
        Err(InvocationError::Rpc(e)) if e.code == 401 => Ok(None),
        Err(e) => Err(e),
    }
}

#[tauri::command]
pub async fn tg_status(state: tauri::State<'_, TgState>) -> Result<TgStatus, String> {
    let built_in_api = built_in_api().is_some();
    let custom_api = custom_api();
    if api_credentials().is_none() {
        return Ok(TgStatus { has_api: false, built_in_api, custom_api, authorized: false, name: None });
    }
    // Without a saved session there's nothing to check, and no reason to connect yet.
    let connected = state.0.lock().await.is_some();
    if read_secret(SESSION_KEY).is_none() && !connected {
        return Ok(TgStatus { has_api: true, built_in_api, custom_api, authorized: false, name: None });
    }
    let c = conn(&state).await?;
    let name = me(&c.client).await.map_err(err)?;
    Ok(TgStatus { has_api: true, built_in_api, custom_api, authorized: name.is_some(), name })
}

/// The small profile photo of the signed-in user.
struct OwnPhoto {
    photo_id: i64,
    dc_id: i32,
}

impl Downloadable for OwnPhoto {
    fn to_raw_input_location(&self) -> Option<tl::enums::InputFileLocation> {
        Some(tl::types::InputPeerPhotoFileLocation { big: false, peer: tl::enums::InputPeer::PeerSelf, photo_id: self.photo_id }.into())
    }

    fn dc_id(&self) -> Option<i32> {
        Some(self.dc_id)
    }
}

/// Name, @username and avatar of the signed-in account, or None when nobody is signed in.
/// Like tg_status, it doesn't connect when there's no saved session.
#[tauri::command]
pub async fn tg_account(state: tauri::State<'_, TgState>) -> Result<Option<Account>, String> {
    if api_credentials().is_none() {
        return Ok(None);
    }
    let connected = state.0.lock().await.is_some();
    if read_secret(SESSION_KEY).is_none() && !connected {
        return Ok(None);
    }
    let c = conn(&state).await?;
    let req = tl::functions::users::GetUsers { id: vec![tl::enums::InputUser::UserSelf] };
    let user = match c.client.invoke(&req).await {
        Ok(users) => match users.into_iter().next() {
            Some(tl::enums::User::User(u)) => u,
            _ => return Ok(None),
        },
        Err(InvocationError::Rpc(e)) if e.code == 401 => return Ok(None),
        Err(e) => return Err(err(e)),
    };
    let name = user_name(&tl::enums::User::User(user.clone()));
    let photo = match &user.photo {
        Some(tl::enums::UserProfilePhoto::Photo(p)) => {
            let mut bytes = Vec::new();
            let mut download = c.client.iter_download(&OwnPhoto { photo_id: p.photo_id, dc_id: p.dc_id });
            // The avatar is a nice-to-have: a failed download just shows initials.
            loop {
                match download.next().await {
                    Ok(Some(chunk)) => bytes.extend(chunk),
                    Ok(None) => break Some(bytes),
                    Err(_) => break None,
                }
            }
        }
        _ => None,
    };
    Ok(Some(Account { name, username: user.username.clone(), photo: photo.filter(|b| !b.is_empty()) }))
}

/// Saves the user's own api_id / api_hash (from my.telegram.org) and reconnects with them.
#[tauri::command]
pub async fn tg_set_api(state: tauri::State<'_, TgState>, api_id: String, api_hash: String) -> Result<(), String> {
    let id = api_id.trim();
    let hash = api_hash.trim();
    if id.parse::<i32>().is_err() || hash.len() != 32 || !hash.chars().all(|c| c.is_ascii_hexdigit()) {
        return Err("API_INVALID".into());
    }
    keyring(API_ID_KEY)?.set_password(id).map_err(|e| e.to_string())?;
    keyring(API_HASH_KEY)?.set_password(hash).map_err(|e| e.to_string())?;
    if let Some(old) = state.0.lock().await.take() {
        old.client.disconnect();
    }
    Ok(())
}

/// Forgets the user's own api_id / api_hash, so the built-in ones are used again.
#[tauri::command]
pub async fn tg_clear_api(state: tauri::State<'_, TgState>) -> Result<(), String> {
    for name in [API_ID_KEY, API_HASH_KEY] {
        if let Ok(e) = keyring(name) {
            let _ = e.delete_credential();
        }
    }
    if let Some(old) = state.0.lock().await.take() {
        old.client.disconnect();
    }
    Ok(())
}

#[tauri::command]
pub async fn tg_request_code(state: tauri::State<'_, TgState>, phone: String) -> Result<(), String> {
    let mut c = conn(&state).await?;
    let hash = c.api_hash.clone();
    let token = c.client.request_login_code(phone.trim(), &hash).await.map_err(err)?;
    c.login = Some(token);
    c.password = None;
    Ok(())
}

fn finish_login(c: &Conn, name: String) -> Result<SignInResult, String> {
    save_session(&c.session)?;
    Ok(SignInResult::Ok { name })
}

#[tauri::command]
pub async fn tg_sign_in(state: tauri::State<'_, TgState>, code: String) -> Result<SignInResult, String> {
    let mut c = conn(&state).await?;
    let token = c.login.take().ok_or("NO_CODE_REQUESTED")?;
    match c.client.sign_in(&token, code.trim()).await {
        Ok(user) => finish_login(&c, user.full_name()),
        Err(SignInError::PasswordRequired(p)) => {
            let hint = p.hint().map(str::to_string);
            c.password = Some(p);
            Ok(SignInResult::Password { hint })
        }
        Err(SignInError::InvalidCode) => {
            c.login = Some(token);
            Err("PHONE_CODE_INVALID".into())
        }
        Err(SignInError::SignUpRequired) => Err("SIGN_UP_REQUIRED".into()),
        Err(SignInError::InvalidPassword(_)) => Err("PASSWORD_HASH_INVALID".into()),
        Err(SignInError::Other(e)) => Err(err(e)),
    }
}

#[tauri::command]
pub async fn tg_check_password(state: tauri::State<'_, TgState>, password: String) -> Result<SignInResult, String> {
    let mut c = conn(&state).await?;
    let token = c.password.take().ok_or("NO_PASSWORD_REQUESTED")?;
    match c.client.check_password(token, password.as_bytes()).await {
        Ok(user) => finish_login(&c, user.full_name()),
        Err(SignInError::InvalidPassword(p)) => {
            c.password = Some(p);
            Err("PASSWORD_HASH_INVALID".into())
        }
        Err(SignInError::Other(e)) => Err(err(e)),
        Err(_) => Err("SIGN_IN_FAILED".into()),
    }
}

/// What the QR tile should show next.
#[derive(Serialize)]
#[serde(tag = "status", rename_all = "camelCase")]
pub enum QrResult {
    /// Show this `tg://login?token=…` link as a QR code until `expires` (unix seconds).
    Qr { url: String, expires: i64 },
    Ok { name: String },
    Password { hint: Option<String> },
}

const B64URL: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/// base64url without padding, as Telegram expects in `tg://login?token=`.
fn base64url(bytes: &[u8]) -> String {
    let mut out = String::with_capacity(bytes.len().div_ceil(3) * 4);
    for chunk in bytes.chunks(3) {
        let n = (u32::from(chunk[0]) << 16) | (u32::from(*chunk.get(1).unwrap_or(&0)) << 8) | u32::from(*chunk.get(2).unwrap_or(&0));
        for i in 0..=chunk.len() {
            out.push(B64URL[(n >> (18 - 6 * i) & 63) as usize] as char);
        }
    }
    out
}

fn qr_url(token: &[u8]) -> String {
    format!("tg://login?token={}", base64url(token))
}

fn now_secs() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs() as i64).unwrap_or(0)
}

/// Asks the phone's account for the cloud password, keeping the token for `tg_check_password`.
async fn password_step(c: &mut Conn) -> Result<QrResult, String> {
    let p: tl::types::account::Password = c.client.invoke(&tl::functions::account::GetPassword {}).await.map_err(err)?.into();
    let token = PasswordToken::new(p);
    let hint = token.hint().map(str::to_string);
    c.password = Some(token);
    c.qr = None;
    Ok(QrResult::Password { hint })
}

/// The QR was confirmed on the phone: keep the session and report who signed in.
fn qr_authorized(c: &mut Conn, auth: tl::enums::auth::Authorization) -> Result<QrResult, String> {
    c.qr = None;
    match auth {
        tl::enums::auth::Authorization::Authorization(a) => {
            let name = user_name(&a.user);
            save_session(&c.session)?;
            Ok(QrResult::Ok { name })
        }
        tl::enums::auth::Authorization::SignUpRequired(_) => Err("SIGN_UP_REQUIRED".into()),
    }
}

/// QR sign-in (auth.exportLoginToken). The UI calls this about every 1.5 seconds while the QR
/// tile is visible: it returns the current code while it is still valid, a fresh one when it
/// has expired, and the result once the code was scanned and confirmed on the phone.
/// Telegram announces the scan with updateLoginToken; the token is re-exported then, and also
/// whenever it expires, so a missed update only delays sign-in to the next refresh (~30 s).
#[tauri::command]
pub async fn tg_qr_poll(state: tauri::State<'_, TgState>) -> Result<QrResult, String> {
    let mut c = conn(&state).await?;
    let scanned = c.qr_scanned.swap(false, Ordering::Relaxed);
    if !scanned
        && let Some((token, expires)) = &c.qr
        && *expires > now_secs() + 2
    {
        return Ok(QrResult::Qr { url: qr_url(token), expires: *expires });
    }
    let req = tl::functions::auth::ExportLoginToken { api_id: c.api_id, api_hash: c.api_hash.clone(), except_ids: vec![] };
    let mut answer = c.client.invoke(&req).await;
    // The account lives on another data centre: switch there and import the token.
    if let Ok(tl::enums::auth::LoginToken::MigrateTo(m)) = &answer {
        let dc = m.dc_id;
        c.session.set_home_dc_id(dc).await.map_err(|e| e.to_string())?;
        answer = c.client.invoke_in_dc(dc, &tl::functions::auth::ImportLoginToken { token: m.token.clone() }).await;
    }
    match answer {
        Ok(tl::enums::auth::LoginToken::Token(t)) => {
            let url = qr_url(&t.token);
            c.qr = Some((t.token, i64::from(t.expires)));
            Ok(QrResult::Qr { url, expires: i64::from(t.expires) })
        }
        Ok(tl::enums::auth::LoginToken::Success(s)) => qr_authorized(&mut c, s.authorization),
        Ok(tl::enums::auth::LoginToken::MigrateTo(_)) => Err("QR_MIGRATE_LOOP".into()),
        Err(e) if e.is("SESSION_PASSWORD_NEEDED") => password_step(&mut c).await,
        Err(e) => Err(err(e)),
    }
}

/// Stops showing the QR (switched to phone sign-in or left the screen).
#[tauri::command]
pub async fn tg_qr_cancel(state: tauri::State<'_, TgState>) -> Result<(), String> {
    if let Some(c) = state.0.lock().await.as_mut() {
        c.qr = None;
        c.qr_scanned.store(false, Ordering::Relaxed);
    }
    Ok(())
}

/// Ends the session on Telegram's side (it disappears from «Активные сеансы») and forgets it here.
#[tauri::command]
pub async fn tg_logout(state: tauri::State<'_, TgState>) -> Result<(), String> {
    let mut guard = state.0.lock().await;
    if let Some(c) = guard.take() {
        let _ = c.client.sign_out().await;
        c.client.disconnect();
    }
    forget_session();
    Ok(())
}

fn parse_hash(access_hash: &str) -> Result<i64, String> {
    access_hash.parse().map_err(|_| "BAD_ACCESS_HASH".to_string())
}

fn input_channel(channel_id: i64, access_hash: i64) -> tl::enums::InputChannel {
    tl::types::InputChannel { channel_id, access_hash }.into()
}

fn input_peer(channel_id: i64, access_hash: &str) -> Result<tl::enums::InputPeer, String> {
    Ok(tl::types::InputPeerChannel { channel_id, access_hash: parse_hash(access_hash)? }.into())
}

fn updates_parts(u: tl::enums::Updates) -> (Vec<tl::enums::Update>, Vec<tl::enums::Chat>) {
    use tl::enums::Updates as U;
    match u {
        U::Updates(x) => (x.updates, x.chats),
        U::Combined(x) => (x.updates, x.chats),
        U::UpdateShort(x) => (vec![x.update], vec![]),
        _ => (vec![], vec![]),
    }
}

/// Message ids Telegram assigned to what we sent, in the order of our random ids.
fn sent_ids(updates: &[tl::enums::Update], random_ids: &[i64]) -> Vec<i32> {
    let mut by_random = HashMap::new();
    for u in updates {
        if let tl::enums::Update::MessageId(m) = u {
            by_random.insert(m.random_id, m.id);
        }
    }
    random_ids.iter().filter_map(|r| by_random.get(r).copied()).collect()
}

/// Checks that the board group still exists (the user may have deleted or left it), or creates it.
#[tauri::command]
pub async fn tg_ensure_board(
    state: tauri::State<'_, TgState>,
    channel_id: Option<i64>,
    access_hash: Option<String>,
    title: String,
    about: String,
) -> Result<Board, String> {
    let c = conn(&state).await?;
    if let (Some(id), Some(hash_str)) = (channel_id, access_hash) {
        let hash = parse_hash(&hash_str)?;
        let req = tl::functions::channels::GetChannels { id: vec![input_channel(id, hash)] };
        if let Ok(tl::enums::messages::Chats::Chats(chats)) = c.client.invoke(&req).await {
            let alive = chats.chats.iter().any(|ch| matches!(ch, tl::enums::Chat::Channel(ch) if ch.id == id && !ch.left));
            if alive {
                return Ok(Board { channel_id: id, access_hash: hash_str, created: false });
            }
        }
    }
    let req = tl::functions::channels::CreateChannel {
        broadcast: false,
        megagroup: true,
        for_import: false,
        forum: true,
        title,
        about,
        geo_point: None,
        address: None,
        ttl_period: None,
    };
    let (_, chats) = updates_parts(c.client.invoke(&req).await.map_err(err)?);
    for ch in chats {
        if let tl::enums::Chat::Channel(ch) = ch
            && let Some(hash) = ch.access_hash
        {
            return Ok(Board { channel_id: ch.id, access_hash: hash.to_string(), created: true });
        }
    }
    Err("CREATE_CHANNEL_NO_RESULT".into())
}

/// Creates a topic and returns its id (the id of the topic's first service message).
#[tauri::command]
pub async fn tg_create_topic(
    state: tauri::State<'_, TgState>,
    channel_id: i64,
    access_hash: String,
    title: String,
    icon_color: Option<i32>,
) -> Result<i32, String> {
    let c = conn(&state).await?;
    let rid = random_id();
    let req = tl::functions::messages::CreateForumTopic {
        title_missing: false,
        peer: input_peer(channel_id, &access_hash)?,
        title,
        icon_color,
        icon_emoji_id: None,
        random_id: rid,
        send_as: None,
    };
    let (updates, _) = updates_parts(c.client.invoke(&req).await.map_err(err)?);
    if let Some(id) = sent_ids(&updates, &[rid]).first() {
        return Ok(*id);
    }
    for u in &updates {
        if let tl::enums::Update::NewChannelMessage(m) = u
            && let tl::enums::Message::Service(s) = &m.message
            && matches!(s.action, tl::enums::MessageAction::TopicCreate(_))
        {
            return Ok(s.id);
        }
    }
    Err("CREATE_TOPIC_NO_RESULT".into())
}

/// Forwards messages from Saved Messages into a topic, keeping albums together.
/// Returns the new message ids; an empty list means none of the originals exist any more.
#[tauri::command]
pub async fn tg_forward(
    state: tauri::State<'_, TgState>,
    channel_id: i64,
    access_hash: String,
    topic_id: i32,
    ids: Vec<i32>,
) -> Result<Vec<i32>, String> {
    let c = conn(&state).await?;
    let random_ids: Vec<i64> = ids.iter().map(|_| random_id()).collect();
    let req = tl::functions::messages::ForwardMessages {
        silent: true,
        background: false,
        with_my_score: false,
        drop_author: false,
        drop_media_captions: false,
        noforwards: false,
        allow_paid_floodskip: false,
        from_ephemeral: false,
        from_peer: tl::enums::InputPeer::PeerSelf,
        id: ids,
        random_id: random_ids.clone(),
        to_peer: input_peer(channel_id, &access_hash)?,
        top_msg_id: Some(topic_id),
        reply_to: None,
        schedule_date: None,
        schedule_repeat_period: None,
        send_as: None,
        quick_reply_shortcut: None,
        effect: None,
        video_timestamp: None,
        allow_paid_stars: None,
        suggested_post: None,
    };
    match c.client.invoke(&req).await {
        Ok(u) => Ok(sent_ids(&updates_parts(u).0, &random_ids)),
        Err(e) if e.is("MESSAGE_ID_INVALID") || e.is("MESSAGE_IDS_EMPTY") => Ok(vec![]),
        Err(e) => Err(err(e)),
    }
}

/// Posts the card's note (title, summary, hashtags) as a reply to the forwarded message.
/// `bold_len` makes the first characters (the title) bold; it counts UTF-16 units like JS strings.
#[tauri::command]
pub async fn tg_send_note(
    state: tauri::State<'_, TgState>,
    channel_id: i64,
    access_hash: String,
    topic_id: i32,
    reply_to: i32,
    text: String,
    bold_len: i32,
) -> Result<i32, String> {
    let c = conn(&state).await?;
    let rid = random_id();
    let entities = (bold_len > 0).then(|| vec![tl::types::MessageEntityBold { offset: 0, length: bold_len }.into()]);
    let req = tl::functions::messages::SendMessage {
        no_webpage: true,
        silent: true,
        background: false,
        clear_draft: false,
        noforwards: false,
        update_stickersets_order: false,
        invert_media: false,
        allow_paid_floodskip: false,
        peer: input_peer(channel_id, &access_hash)?,
        reply_to: Some(
            tl::types::InputReplyToMessage {
                reply_to_msg_id: reply_to,
                top_msg_id: Some(topic_id),
                reply_to_peer_id: None,
                quote_text: None,
                quote_entities: None,
                quote_offset: None,
                monoforum_peer_id: None,
                todo_item_id: None,
                poll_option: None,
            }
            .into(),
        ),
        message: text,
        random_id: rid,
        reply_markup: None,
        entities,
        schedule_date: None,
        schedule_repeat_period: None,
        send_as: None,
        quick_reply_shortcut: None,
        effect: None,
        allow_paid_stars: None,
        suggested_post: None,
        rich_message: None,
    };
    let u = c.client.invoke(&req).await.map_err(err)?;
    use tl::enums::Updates as U;
    match u {
        U::UpdateShortSentMessage(m) => Ok(m.id),
        other => sent_ids(&updates_parts(other).0, &[rid]).first().copied().ok_or_else(|| "SEND_NO_RESULT".into()),
    }
}

// ---- Loading Saved Messages straight from Telegram -------------------------------------
//
// The import used to need a Telegram Desktop export (result.json). After signing in, the app
// can read Saved Messages itself: tg_saved_page pages through the history (newest first) and
// tg_saved_photos downloads the pictures into the app's folder. Turning these messages into
// cards happens in TypeScript (src/lib/tgImport.ts), with the same parser as the export.

/// A link-ish piece of a message's text. Offsets count UTF-16 units, like JavaScript strings.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedEntity {
    /// "url", "text_url" or "hashtag"; other formatting is dropped.
    kind: &'static str,
    offset: i32,
    length: i32,
    url: Option<String>,
}

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SavedMedia {
    /// photo, video_file, animation, voice_message, video_message, audio_file, sticker,
    /// document, poll, location or contact (the names Telegram Desktop's export uses).
    kind: String,
    width: Option<i32>,
    height: Option<i32>,
    mime: Option<String>,
    size: Option<i64>,
    duration: Option<f64>,
    file_name: Option<String>,
    emoji: Option<String>,
    poll_question: Option<String>,
    poll_answers: Option<Vec<String>>,
    latitude: Option<f64>,
    longitude: Option<f64>,
    first_name: Option<String>,
    last_name: Option<String>,
    phone: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedMessage {
    id: i32,
    /// Unix seconds.
    date: i32,
    text: String,
    entities: Vec<SavedEntity>,
    forwarded_from: Option<String>,
    /// Messages sent together as an album share this id.
    grouped_id: Option<String>,
    media: Option<SavedMedia>,
    /// The message has a link preview with a picture (Telegram's own copy of the page's
    /// og:image); tg_saved_photos downloads it like a photo.
    web_photo: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedPage {
    messages: Vec<SavedMessage>,
    /// The lowest message id on this page (service messages included): the offset for the next
    /// page. None when the page is empty, i.e. everything down to min_id has been read.
    next_offset: Option<i32>,
    /// Roughly how many messages there are in total (above min_id), for the progress bar.
    total: Option<i32>,
}

fn entity(e: &tl::enums::MessageEntity) -> Option<SavedEntity> {
    use tl::enums::MessageEntity as E;
    match e {
        E::Url(u) => Some(SavedEntity { kind: "url", offset: u.offset, length: u.length, url: None }),
        E::TextUrl(u) => Some(SavedEntity { kind: "text_url", offset: u.offset, length: u.length, url: Some(u.url.clone()) }),
        E::Hashtag(h) => Some(SavedEntity { kind: "hashtag", offset: h.offset, length: h.length, url: None }),
        _ => None,
    }
}

fn text_of(t: &tl::enums::TextWithEntities) -> String {
    let tl::enums::TextWithEntities::Entities(t) = t;
    t.text.clone()
}

fn largest_size(sizes: &[tl::enums::PhotoSize]) -> Option<(String, i32, i32)> {
    sizes
        .iter()
        .filter_map(|s| match s {
            tl::enums::PhotoSize::Size(s) => Some((s.r#type.clone(), s.w, s.h)),
            tl::enums::PhotoSize::Progressive(s) => Some((s.r#type.clone(), s.w, s.h)),
            _ => None,
        })
        .max_by_key(|(_, w, h)| w * h)
}

fn document_media(d: &tl::types::Document, round: bool, voice: bool) -> SavedMedia {
    use tl::enums::DocumentAttribute as A;
    let mut m = SavedMedia { kind: "document".into(), mime: Some(d.mime_type.clone()), size: Some(d.size), ..Default::default() };
    let mut animated = false;
    for a in &d.attributes {
        match a {
            A::Filename(f) => m.file_name = Some(f.file_name.clone()),
            A::ImageSize(s) => {
                m.width = Some(s.w);
                m.height = Some(s.h);
            }
            A::Animated => animated = true,
            A::Sticker(s) => {
                m.kind = "sticker".into();
                m.emoji = Some(s.alt.clone()).filter(|a| !a.is_empty());
            }
            A::Video(v) => {
                m.width = Some(v.w);
                m.height = Some(v.h);
                m.duration = Some(v.duration);
                if m.kind == "document" {
                    m.kind = if v.round_message || round { "video_message" } else { "video_file" }.into();
                }
            }
            A::Audio(a) => {
                m.duration = Some(a.duration as f64);
                if m.kind == "document" {
                    m.kind = if a.voice || voice { "voice_message" } else { "audio_file" }.into();
                }
            }
            _ => {}
        }
    }
    if animated && m.kind != "sticker" {
        m.kind = "animation".into();
    }
    m
}

fn media_of(media: &tl::enums::MessageMedia) -> Option<SavedMedia> {
    use tl::enums::MessageMedia as M;
    match media {
        M::Photo(p) => {
            let (width, height) = match &p.photo {
                Some(tl::enums::Photo::Photo(ph)) => largest_size(&ph.sizes).map(|(_, w, h)| (Some(w), Some(h))).unwrap_or((None, None)),
                _ => (None, None),
            };
            Some(SavedMedia { kind: "photo".into(), width, height, ..Default::default() })
        }
        M::Document(d) => match &d.document {
            Some(tl::enums::Document::Document(doc)) => Some(document_media(doc, d.round, d.voice)),
            _ => None,
        },
        M::Poll(p) => {
            let tl::enums::Poll::Poll(poll) = &p.poll;
            Some(SavedMedia {
                kind: "poll".into(),
                poll_question: Some(text_of(&poll.question)),
                poll_answers: Some(poll.answers.iter().map(|a| text_of(&a.text())).collect()),
                ..Default::default()
            })
        }
        M::Geo(g) => geo(&g.geo),
        M::GeoLive(g) => geo(&g.geo),
        M::Venue(v) => geo(&v.geo),
        M::Contact(c) => Some(SavedMedia {
            kind: "contact".into(),
            first_name: Some(c.first_name.clone()),
            last_name: Some(c.last_name.clone()),
            phone: Some(c.phone_number.clone()),
            ..Default::default()
        }),
        _ => None,
    }
}

fn geo(g: &tl::enums::GeoPoint) -> Option<SavedMedia> {
    match g {
        tl::enums::GeoPoint::Point(p) => Some(SavedMedia { kind: "location".into(), latitude: Some(p.lat), longitude: Some(p.long), ..Default::default() }),
        _ => None,
    }
}

/// Who the message was forwarded (or saved) from, by name.
fn forwarded_from(h: &tl::enums::MessageFwdHeader, names: &HashMap<i64, String>) -> Option<String> {
    let tl::enums::MessageFwdHeader::Header(h) = h;
    let peer_name = |p: &Option<tl::enums::Peer>| -> Option<String> {
        let id = match p.as_ref()? {
            tl::enums::Peer::User(u) => u.user_id,
            tl::enums::Peer::Chat(c) => c.chat_id,
            tl::enums::Peer::Channel(c) => c.channel_id,
        };
        names.get(&id).cloned()
    };
    h.from_name.clone().or_else(|| peer_name(&h.from_id)).or_else(|| h.saved_from_name.clone()).or_else(|| peer_name(&h.saved_from_id))
}

fn chat_title(c: &tl::enums::Chat) -> Option<(i64, String)> {
    match c {
        tl::enums::Chat::Chat(c) => Some((c.id, c.title.clone())),
        tl::enums::Chat::Channel(c) => Some((c.id, c.title.clone())),
        tl::enums::Chat::Forbidden(c) => Some((c.id, c.title.clone())),
        tl::enums::Chat::ChannelForbidden(c) => Some((c.id, c.title.clone())),
        _ => None,
    }
}

fn saved_message(m: &tl::types::Message, names: &HashMap<i64, String>) -> SavedMessage {
    SavedMessage {
        id: m.id,
        date: m.date,
        text: m.message.clone(),
        entities: m.entities.iter().flatten().filter_map(entity).collect(),
        forwarded_from: m.fwd_from.as_ref().and_then(|h| forwarded_from(h, names)),
        grouped_id: m.grouped_id.map(|g| g.to_string()),
        media: m.media.as_ref().and_then(media_of),
        web_photo: m.media.as_ref().and_then(photo_of).is_some_and(|(_, web)| web),
    }
}

/// The picture to download for a message: its photo, or the picture of its link preview
/// (`true` in the second place).
fn photo_of(media: &tl::enums::MessageMedia) -> Option<(&tl::types::Photo, bool)> {
    match media {
        tl::enums::MessageMedia::Photo(p) => match &p.photo {
            Some(tl::enums::Photo::Photo(photo)) => Some((photo, false)),
            _ => None,
        },
        tl::enums::MessageMedia::WebPage(w) => match &w.webpage {
            tl::enums::WebPage::Page(page) => match &page.photo {
                Some(tl::enums::Photo::Photo(photo)) => Some((photo, true)),
                _ => None,
            },
            _ => None,
        },
        _ => None,
    }
}

/// One page (up to 100) of Saved Messages, newest first, older than `offset_id` (0 = from the
/// newest) and newer than `min_id` (0 = all the way back).
#[tauri::command]
pub async fn tg_saved_page(state: tauri::State<'_, TgState>, offset_id: i32, min_id: i32) -> Result<SavedPage, String> {
    let c = conn(&state).await?;
    let req = tl::functions::messages::GetHistory {
        peer: tl::enums::InputPeer::PeerSelf,
        offset_id,
        offset_date: 0,
        add_offset: 0,
        limit: 100,
        max_id: 0,
        min_id,
        hash: 0,
    };
    use tl::enums::messages::Messages as R;
    let (messages, users, chats, total) = match c.client.invoke(&req).await.map_err(err)? {
        R::Messages(m) => {
            let n = m.messages.len() as i32;
            (m.messages, m.users, m.chats, Some(n))
        }
        R::Slice(m) => (m.messages, m.users, m.chats, Some(m.count)),
        R::ChannelMessages(m) => (m.messages, m.users, m.chats, Some(m.count)),
        R::NotModified(_) => (vec![], vec![], vec![], None),
    };
    let mut names: HashMap<i64, String> = HashMap::new();
    for u in &users {
        if let tl::enums::User::User(user) = u {
            names.insert(user.id, user_name(u));
        }
    }
    names.extend(chats.iter().filter_map(chat_title));
    let next_offset = messages.iter().map(|m| m.id()).min();
    let messages = messages
        .iter()
        .filter_map(|m| match m {
            tl::enums::Message::Message(m) => Some(saved_message(m, &names)),
            _ => None,
        })
        .collect();
    Ok(SavedPage { messages, next_offset, total })
}

/// A t.me link to the post a saved message was forwarded from, when that was a channel or
/// a supergroup: `t.me/<username>/<post>` for public ones, `t.me/c/<id>/<post>` (opens only
/// for members) otherwise. None for anything else (forwards from people, own notes).
///
/// Telegram can't link to a message inside Saved Messages itself (a link with a message id
/// only scrolls to the post in channels), so the original post is the closest thing.
#[tauri::command]
pub async fn tg_source_link(state: tauri::State<'_, TgState>, id: i32) -> Result<Option<String>, String> {
    let c = conn(&state).await?;
    let req = tl::functions::messages::GetMessages {
        id: vec![tl::types::InputMessageId { id }.into()],
    };
    use tl::enums::messages::Messages as R;
    let (messages, chats) = match c.client.invoke(&req).await.map_err(err)? {
        R::Messages(m) => (m.messages, m.chats),
        R::Slice(m) => (m.messages, m.chats),
        R::ChannelMessages(m) => (m.messages, m.chats),
        R::NotModified(_) => return Ok(None),
    };
    let Some(tl::enums::Message::Message(m)) = messages.into_iter().next() else {
        return Ok(None);
    };
    let Some(tl::enums::MessageFwdHeader::Header(h)) = m.fwd_from else {
        return Ok(None);
    };
    Ok(source_link(&h, &chats))
}

/// The original post first (who wrote it), else where it was saved from.
fn source_link(h: &tl::types::MessageFwdHeader, chats: &[tl::enums::Chat]) -> Option<String> {
    let channel = |p: &Option<tl::enums::Peer>| match p {
        Some(tl::enums::Peer::Channel(c)) => Some(c.channel_id),
        _ => None,
    };
    let (channel_id, post) = match (channel(&h.from_id), h.channel_post) {
        (Some(c), Some(post)) => (c, post),
        _ => (channel(&h.saved_from_peer)?, h.saved_from_msg_id?),
    };
    let username = chats.iter().find_map(|c| match c {
        tl::enums::Chat::Channel(ch) if ch.id == channel_id => public_username(ch),
        _ => None,
    });
    Some(match username {
        Some(u) => format!("https://t.me/{u}/{post}"),
        None => format!("https://t.me/c/{channel_id}/{post}"),
    })
}

fn public_username(ch: &tl::types::Channel) -> Option<String> {
    ch.username.clone().or_else(|| {
        ch.usernames.iter().flatten().find_map(|u| {
            let tl::enums::Username::Username(u) = u;
            u.active.then(|| u.username.clone())
        })
    })
}

/// A photo size to download: a custom location so we can ask for the ~800px version
/// instead of grammers' default (the largest).
struct PhotoFile {
    location: tl::enums::InputFileLocation,
    dc_id: i32,
}

impl Downloadable for PhotoFile {
    fn to_raw_input_location(&self) -> Option<tl::enums::InputFileLocation> {
        Some(self.location.clone())
    }

    fn dc_id(&self) -> Option<i32> {
        Some(self.dc_id)
    }
}

/// The size to keep: "x" (800px on the long side) when Telegram has it, else the largest
/// one that's no bigger than 1280px, else whatever is largest.
fn pick_photo_size(sizes: &[tl::enums::PhotoSize]) -> Option<String> {
    let all: Vec<(String, i32, i32)> = sizes
        .iter()
        .filter_map(|s| match s {
            tl::enums::PhotoSize::Size(s) => Some((s.r#type.clone(), s.w, s.h)),
            tl::enums::PhotoSize::Progressive(s) => Some((s.r#type.clone(), s.w, s.h)),
            _ => None,
        })
        .collect();
    if let Some((t, _, _)) = all.iter().find(|(t, _, _)| t == "x") {
        return Some(t.clone());
    }
    all.iter()
        .filter(|(_, w, h)| (*w).max(*h) <= 1280)
        .max_by_key(|(_, w, h)| w * h)
        .or_else(|| all.iter().max_by_key(|(_, w, h)| w * h))
        .map(|(t, _, _)| t.clone())
}

fn media_dir(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    use tauri::Manager;
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?.join("telegram-media");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedPhoto {
    id: i32,
    /// Absolute path of the downloaded JPEG.
    path: String,
}

/// Downloads the photos (or link preview pictures) of these Saved Messages into the app's folder (telegram-media/<id>.jpg)
/// and returns where each one went. Photos already on disk are not downloaded again, so an
/// interrupted run picks up where it stopped. Messages without a photo, or that no longer
/// exist, are left out of the result.
#[tauri::command]
pub async fn tg_saved_photos(app: tauri::AppHandle, state: tauri::State<'_, TgState>, ids: Vec<i32>) -> Result<Vec<SavedPhoto>, String> {
    let dir = media_dir(&app)?;
    let mut out = Vec::new();
    let mut todo = Vec::new();
    for id in ids {
        let path = dir.join(format!("{id}.jpg"));
        if path.metadata().map(|m| m.len() > 0).unwrap_or(false) {
            out.push(SavedPhoto { id, path: path.to_string_lossy().into_owned() });
        } else {
            todo.push(id);
        }
    }
    if todo.is_empty() {
        return Ok(out);
    }
    let c = conn(&state).await?;
    // Fresh copies of the messages: a photo's file_reference expires, so the one from the
    // history page may be stale by now.
    let req = tl::functions::messages::GetMessages { id: todo.iter().map(|&id| tl::types::InputMessageId { id }.into()).collect() };
    use tl::enums::messages::Messages as R;
    let messages = match c.client.invoke(&req).await.map_err(err)? {
        R::Messages(m) => m.messages,
        R::Slice(m) => m.messages,
        R::ChannelMessages(m) => m.messages,
        R::NotModified(_) => vec![],
    };
    for m in messages {
        let tl::enums::Message::Message(m) = m else { continue };
        let Some((photo, _)) = m.media.as_ref().and_then(photo_of) else { continue };
        let Some(thumb_size) = pick_photo_size(&photo.sizes) else { continue };
        let file = PhotoFile {
            location: tl::types::InputPhotoFileLocation {
                id: photo.id,
                access_hash: photo.access_hash,
                file_reference: photo.file_reference.clone(),
                thumb_size,
            }
            .into(),
            dc_id: photo.dc_id,
        };
        let mut bytes = Vec::new();
        let mut download = c.client.iter_download(&file);
        while let Some(chunk) = download.next().await.map_err(err)? {
            bytes.extend(chunk);
        }
        if bytes.is_empty() {
            continue;
        }
        let path = dir.join(format!("{}.jpg", m.id));
        let tmp = dir.join(format!("{}.jpg.part", m.id));
        std::fs::write(&tmp, &bytes).map_err(|e| e.to_string())?;
        std::fs::rename(&tmp, &path).map_err(|e| e.to_string())?;
        out.push(SavedPhoto { id: m.id, path: path.to_string_lossy().into_owned() });
    }
    Ok(out)
}

/// Deletes the downloaded photos (Settings → «Удалить все данные»).
#[tauri::command]
pub async fn tg_forget_media(app: tauri::AppHandle) -> Result<(), String> {
    let dir = media_dir(&app)?;
    std::fs::remove_dir_all(&dir).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn header(from: Option<tl::enums::Peer>, post: Option<i32>, saved: Option<tl::enums::Peer>, saved_msg: Option<i32>) -> tl::types::MessageFwdHeader {
        tl::types::MessageFwdHeader {
            imported: false,
            saved_out: false,
            from_id: from,
            from_name: None,
            date: 0,
            channel_post: post,
            post_author: None,
            saved_from_peer: saved,
            saved_from_msg_id: saved_msg,
            saved_from_id: None,
            saved_from_name: None,
            saved_date: None,
            psa_type: None,
        }
    }

    fn channel(id: i64) -> Option<tl::enums::Peer> {
        Some(tl::types::PeerChannel { channel_id: id }.into())
    }

    #[test]
    fn source_link_points_at_the_channel_post() {
        // Without the channel's username at hand: the members-only form.
        assert_eq!(source_link(&header(channel(42), Some(7), None, None), &[]).as_deref(), Some("https://t.me/c/42/7"));
        // The original post wins over where it was saved from.
        assert_eq!(source_link(&header(channel(42), Some(7), channel(9), Some(3)), &[]).as_deref(), Some("https://t.me/c/42/7"));
        // Forwarded from a person, but saved from a channel's comments or a supergroup.
        let person = Some(tl::types::PeerUser { user_id: 5 }.into());
        assert_eq!(source_link(&header(person.clone(), None, channel(9), Some(3)), &[]).as_deref(), Some("https://t.me/c/9/3"));
        // A person's message with nowhere to link to.
        assert_eq!(source_link(&header(person, None, None, None), &[]), None);
    }

    #[test]
    fn qr_url_is_base64url_without_padding() {
        assert_eq!(base64url(b""), "");
        assert_eq!(base64url(b"f"), "Zg");
        assert_eq!(base64url(b"fo"), "Zm8");
        assert_eq!(base64url(b"foo"), "Zm9v");
        assert_eq!(base64url(b"foob"), "Zm9vYg");
        // Bytes that hit the URL-safe characters (+ and / in plain base64).
        assert_eq!(base64url(&[0xfb, 0xff, 0xbf]), "-_-_");
        assert_eq!(qr_url(&[0xfb, 0xff]), "tg://login?token=-_8");
    }

    fn size(t: &str, w: i32, h: i32) -> tl::enums::PhotoSize {
        tl::types::PhotoSize { r#type: t.into(), w, h, size: 0 }.into()
    }

    #[test]
    fn picks_the_800px_photo_size() {
        let sizes = vec![size("s", 90, 60), size("m", 320, 213), size("x", 800, 533), size("y", 1280, 853), size("w", 2560, 1706)];
        assert_eq!(pick_photo_size(&sizes).as_deref(), Some("x"));
        let no_x = vec![size("m", 320, 213), size("y", 1280, 853), size("w", 2560, 1706)];
        assert_eq!(pick_photo_size(&no_x).as_deref(), Some("y"));
        let only_big = vec![size("w", 2560, 1706)];
        assert_eq!(pick_photo_size(&only_big).as_deref(), Some("w"));
        assert_eq!(pick_photo_size(&[]), None);
    }
}
