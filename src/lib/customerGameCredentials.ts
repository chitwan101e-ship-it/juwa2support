import type { SupabaseClient } from "@supabase/supabase-js";

export const GAME_CREDENTIAL_PLATFORMS = [
  "juwa",
  "orion_stars",
  "fire_kirin",
  "game_vault",
  "ultra_panda",
  "panda_master",
  "river_sweep",
  "loot",
  "highstake",
] as const;

export type GameCredentialPlatform = (typeof GAME_CREDENTIAL_PLATFORMS)[number];

export type CustomerGameCredential = {
  id: string;
  businessId: string;
  customerId: string;
  platform: GameCredentialPlatform;
  username: string;
  createdBy: string | null;
  updatedAt: string;
};

const PLATFORM_LABELS: Record<GameCredentialPlatform, string> = {
  juwa: "Juwa",
  orion_stars: "Orion Stars",
  fire_kirin: "Fire Kirin",
  game_vault: "Game Vault",
  ultra_panda: "Ultra Panda",
  panda_master: "Panda Master",
  river_sweep: "River Sweep",
  loot: "Loot",
  highstake: "Highstake",
};

export function gameCredentialPlatformLabel(platform: string): string {
  if ((GAME_CREDENTIAL_PLATFORMS as readonly string[]).includes(platform)) {
    return PLATFORM_LABELS[platform as GameCredentialPlatform];
  }
  return platform;
}

export function isGameCredentialPlatform(
  value: string
): value is GameCredentialPlatform {
  return (GAME_CREDENTIAL_PLATFORMS as readonly string[]).includes(value);
}

type CredentialRow = {
  id: string;
  business_id: string;
  customer_id: string;
  platform: string;
  username: string;
  created_by: string | null;
  updated_at: string;
};

function mapRow(row: CredentialRow): CustomerGameCredential | null {
  if (!isGameCredentialPlatform(row.platform)) return null;
  return {
    id: row.id,
    businessId: row.business_id,
    customerId: row.customer_id,
    platform: row.platform,
    username: row.username.trim(),
    createdBy: row.created_by,
    updatedAt: row.updated_at,
  };
}

/** Prefer Juwa, then first by platform order. */
export function pickPrimaryCredential(
  credentials: CustomerGameCredential[]
): CustomerGameCredential | null {
  if (credentials.length === 0) return null;
  const juwa = credentials.find((c) => c.platform === "juwa");
  if (juwa) return juwa;
  for (const platform of GAME_CREDENTIAL_PLATFORMS) {
    const hit = credentials.find((c) => c.platform === platform);
    if (hit) return hit;
  }
  return credentials[0] ?? null;
}

/** Ticket / legacy prefill: Juwa username, else first available. */
export function pickDefaultGameUsername(
  credentials: CustomerGameCredential[]
): string {
  return pickPrimaryCredential(credentials)?.username ?? "";
}

/** Compact header: "Juwa: Lucky99" or "Juwa: Lucky99 +2". */
export function formatCredentialsHeaderShort(
  credentials: CustomerGameCredential[]
): string {
  const primary = pickPrimaryCredential(credentials);
  if (!primary) return "";
  const label = gameCredentialPlatformLabel(primary.platform);
  const extra = credentials.length - 1;
  if (extra <= 0) return `${label}: ${primary.username}`;
  return `${label}: ${primary.username} +${extra}`;
}

export async function fetchCustomerGameCredentials(
  supabase: SupabaseClient,
  businessId: string,
  customerId: string
): Promise<CustomerGameCredential[]> {
  const { data, error } = await supabase
    .from("customer_game_credentials")
    .select("id, business_id, customer_id, platform, username, created_by, updated_at")
    .eq("business_id", businessId)
    .eq("customer_id", customerId)
    .order("created_at", { ascending: true });

  if (error) throw error;

  const mapped = ((data ?? []) as CredentialRow[])
    .map(mapRow)
    .filter((row): row is CustomerGameCredential => row != null);

  mapped.sort((a, b) => {
    const platformDiff =
      GAME_CREDENTIAL_PLATFORMS.indexOf(a.platform) -
      GAME_CREDENTIAL_PLATFORMS.indexOf(b.platform);
    if (platformDiff !== 0) return platformDiff;
    return a.username.localeCompare(b.username, undefined, { sensitivity: "base" });
  });
  return mapped;
}

export async function insertCustomerGameCredential(
  supabase: SupabaseClient,
  opts: {
    businessId: string;
    customerId: string;
    platform: GameCredentialPlatform;
    username: string;
    createdBy: string;
  }
): Promise<CustomerGameCredential> {
  const username = opts.username.trim();
  if (!username || username.length > 64) {
    throw new Error("Username must be 1–64 characters.");
  }

  const { data, error } = await supabase
    .from("customer_game_credentials")
    .insert({
      business_id: opts.businessId,
      customer_id: opts.customerId,
      platform: opts.platform,
      username,
      created_by: opts.createdBy,
    })
    .select("id, business_id, customer_id, platform, username, created_by, updated_at")
    .single();

  if (error) {
    if (error.code === "23505") {
      throw new Error("That username is already saved for this platform.");
    }
    throw error;
  }
  const mapped = mapRow(data as CredentialRow);
  if (!mapped) throw new Error("Invalid platform returned.");
  return mapped;
}

export async function updateCustomerGameCredential(
  supabase: SupabaseClient,
  opts: {
    id: string;
    platform: GameCredentialPlatform;
    username: string;
  }
): Promise<CustomerGameCredential> {
  const username = opts.username.trim();
  if (!username || username.length > 64) {
    throw new Error("Username must be 1–64 characters.");
  }

  const { data, error } = await supabase
    .from("customer_game_credentials")
    .update({
      platform: opts.platform,
      username,
      updated_at: new Date().toISOString(),
    })
    .eq("id", opts.id)
    .select("id, business_id, customer_id, platform, username, created_by, updated_at")
    .single();

  if (error) {
    if (error.code === "23505") {
      throw new Error("That username is already saved for this platform.");
    }
    throw error;
  }
  const mapped = mapRow(data as CredentialRow);
  if (!mapped) throw new Error("Invalid platform returned.");
  return mapped;
}

export async function deleteCustomerGameCredential(
  supabase: SupabaseClient,
  credentialId: string
): Promise<void> {
  const { error } = await supabase
    .from("customer_game_credentials")
    .delete()
    .eq("id", credentialId);
  if (error) throw error;
}
