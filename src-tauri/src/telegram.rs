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
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use grammers_client::client::{LoginToken, PasswordToken};
use grammers_client::sender::{AutoSleep, ConnectionParams, SenderPool};
use grammers_client::session::storages::MemorySession;
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
    api_hash: String,
    login: Option<LoginToken>,
    password: Option<PasswordToken>,
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
        device_model: "Saved Board".into(),
        app_version: env!("CARGO_PKG_VERSION").into(),
        // Short rate-limit waits are slept through here; longer ones go back to the UI,
        // which shows the pause and resumes by itself.
        retry_policy: Box::new(AutoSleep { threshold: Duration::from_secs(15), ..Default::default() }),
        ..Default::default()
    };
    let pool = SenderPool::with_configuration(Arc::clone(&session), api_id, params);
    let client = Client::new(pool.handle);
    drop(pool.updates); // we never read incoming updates
    tauri::async_runtime::spawn(pool.runner.run());
    Ok(Conn { client, session, api_hash, login: None, password: None })
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
