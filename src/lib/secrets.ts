import { invoke } from "@tauri-apps/api/core";

// Stored in the OS credential store (Windows Credential Manager, macOS Keychain), never in a file.
export const getApiKey = () => invoke<string | null>("get_secret", { name: "anthropic_api_key" });
export const setApiKey = (value: string) => invoke<void>("set_secret", { name: "anthropic_api_key", value });
export const deleteApiKey = () => invoke<void>("delete_secret", { name: "anthropic_api_key" });
