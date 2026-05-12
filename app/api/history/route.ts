import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase-server";

const USER_HISTORY_LIMIT = 50;
const HISTORY_PREFIX = "LUMIVEIL_HISTORY::";

function createBearerSupabaseClient(token: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        headers: { Authorization: `Bearer ${token}` },
      },
    }
  );
}

function createAdminSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

async function getAuthenticatedContext(req: NextRequest): Promise<{ user: User | null; client: SupabaseClient }> {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (token) {
    const tokenSupabase = createBearerSupabaseClient(token);
    const { data: { user } } = await tokenSupabase.auth.getUser(token);
    if (user) return { user, client: tokenSupabase };
  }

  const cookieSupabase = await createServerSupabaseClient();
  const { data: { user } } = await cookieSupabase.auth.getUser();
  return { user, client: cookieSupabase };
}

function parseHistoryPrompt(prompt: string | null) {
  if (!prompt?.startsWith(HISTORY_PREFIX)) {
    return { prompt, url: "", kind: "image" as "image" | "video" };
  }

  try {
    const parsed = JSON.parse(prompt.slice(HISTORY_PREFIX.length)) as {
      prompt?: string;
      url?: string;
      kind?: string;
    };

    return {
      prompt: parsed.prompt ?? null,
      url: parsed.url ?? "",
      kind: parsed.kind === "video" ? "video" as const : "image" as const,
    };
  } catch {
    return { prompt, url: "", kind: "image" as const };
  }
}

export async function GET(req: NextRequest) {
  try {
    const { user, client } = await getAuthenticatedContext(req);
    if (!user) {
      return NextResponse.json({ error: "ログイン状態が切れています。もう一度ログインしてください。" }, { status: 401 });
    }

    const { data: shop, error: shopError } = await client
      .from("shops")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (shopError) {
      throw new Error(shopError.message);
    }

    const shopIds = Array.from(new Set([user.id, shop?.id].filter(Boolean)));

    const { data, error } = await client
      .from("generation_history")
      .select("id, avatar_id, prompt, image_urls, credits_used, created_at, settings")
      .in("shop_id", shopIds)
      .order("created_at", { ascending: false })
      .limit(USER_HISTORY_LIMIT);

    if (error) {
      throw new Error(error.message);
    }

    const history = (data ?? []).map((item: any) => {
      const parsed = parseHistoryPrompt(item.prompt);
      const imageUrls = Array.isArray(item.image_urls) ? item.image_urls : [];
      const generatedImageUrl = imageUrls[0] ?? parsed.url ?? "";
      const mediaType =
        item?.settings?.media_type === "video" || parsed.kind === "video"
          ? "video"
          : "image";

      return {
        id: item.id,
        avatar_id: item.avatar_id,
        prompt: parsed.prompt,
        generated_image_url: generatedImageUrl,
        media_type: mediaType,
        credits_used: item.credits_used,
        created_at: item.created_at,
      };
    });

    return NextResponse.json({ history, limit: USER_HISTORY_LIMIT });
  } catch (error) {
    const message = error instanceof Error ? error.message : "履歴を取得できませんでした";
    console.error("history fetch failed", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { user, client } = await getAuthenticatedContext(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const {
      prompt,
      generated_image_url,
      media_type,
      credits_used,
      avatar_id,
    } = body ?? {};

    const { data: shop, error: shopError } = await client
      .from("shops")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (shopError) {
      throw new Error(shopError.message);
    }

    const shop_id = shop?.id || user.id;

    const cleanPrompt = typeof prompt === "string" ? prompt : "";
    const cleanUrl = typeof generated_image_url === "string" ? generated_image_url : "";
    const cleanMediaType = media_type === "video" ? "video" : "image";
    const cleanCreditsUsed = typeof credits_used === "number" ? credits_used : 1;
    const cleanAvatarId = typeof avatar_id === "string" && avatar_id.length > 0 ? avatar_id : null;

    if (!cleanUrl) {
      throw new Error("generated_image_url がありません");
    }

    const historyPrompt = `${HISTORY_PREFIX}${JSON.stringify({
      prompt: cleanPrompt,
      url: cleanUrl,
      kind: cleanMediaType,
    })}`;

    const adminClient = createAdminSupabaseClient();

    const { error } = await adminClient.from("generation_history").insert({
      shop_id,
      avatar_id: cleanAvatarId,
      prompt: historyPrompt,
      image_urls: [cleanUrl],
      settings: { media_type: cleanMediaType },
      credits_used: cleanCreditsUsed,
    });

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "履歴の保存に失敗しました";
    console.error("history save failed", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { user, client } = await getAuthenticatedContext(req);
    if (!user) {
      return NextResponse.json({ error: "ログイン状態が切れています。もう一度ログインしてください。" }, { status: 401 });
    }

    const body = await req.json();
    const ids = Array.isArray(body.ids)
      ? body.ids.filter((id: unknown): id is string => typeof id === "string" && id.length > 0)
      : [];

    if (ids.length === 0) {
      return NextResponse.json({ error: "削除する履歴を選択してください。" }, { status: 400 });
    }

    const { data: shop, error: shopError } = await client
      .from("shops")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (shopError) {
      throw new Error(shopError.message);
    }

    const shopIds = Array.from(new Set([user.id, shop?.id].filter(Boolean)));

    const { data, error } = await client
      .from("generation_history")
      .delete()
      .in("id", ids)
      .in("shop_id", shopIds)
      .select("id");

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({ success: true, deletedIds: (data ?? []).map((item: any) => item.id) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "履歴の削除に失敗しました";
    console.error("history delete failed", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
