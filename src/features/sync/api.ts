import { invoke } from "@tauri-apps/api/core";

export async function greetFromRust(name: string) {
  return invoke<string>("greet", { name });
}
