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
      .select("id, avatar_id, prompt, credits_used, created_at")
      .in("shop_id", shopIds)
      .order("created_at", { ascending: false })
      .limit(USER_HISTORY_LIMIT);

    if (error) {
      throw new Error(error.message);
    }

    const history = (data ?? []).map(item => {
      const parsed = parseHistoryPrompt(item.prompt);
      return {
        ...item,
        prompt: parsed.prompt,
        generated_image_url: parsed.url,
        media_type: parsed.kind,
      };
    });

    return NextResponse.json({ history, limit: USER_HISTORY_LIMIT });
  } catch (error) {
    const message = error instanceof Error ? error.message : "履歴を取得できませんでした";
    console.error("history fetch failed", message);
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

    return NextResponse.json({ success: true, deletedIds: (data ?? []).map(item => item.id) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "履歴の削除に失敗しました";
    console.error("history delete failed", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function parseHistoryPrompt(prompt: string | null) {
  if (!prompt?.startsWith(HISTORY_PREFIX)) {
    return { prompt, url: "", kind: "image" };
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
      kind: parsed.kind === "video" ? "video" : "image",
    };
  } catch {
    return { prompt, url: "", kind: "image" };
  }
}
