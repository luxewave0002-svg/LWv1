import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase-server";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const ADMIN_HISTORY_LIMIT = 100;
const HISTORY_PREFIX = "LUMIVEIL_HISTORY::";

function getAdminEmails() {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map(email => email.trim().toLowerCase())
    .filter(Boolean);
}

export async function GET() {
  try {
    const cookieSupabase = await createServerSupabaseClient();
    const { data: { user } } = await cookieSupabase.auth.getUser();
    const email = user?.email?.toLowerCase();

    if (!email) {
      return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
    }

    if (!getAdminEmails().includes(email)) {
      return NextResponse.json({ error: "管理者権限が必要です" }, { status: 403 });
    }

    const { data, error } = await supabase
      .from("generation_history")
      .select("id, shop_id, avatar_id, prompt, credits_used, created_at")
      .order("created_at", { ascending: false })
      .limit(ADMIN_HISTORY_LIMIT);

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

    return NextResponse.json({ history, limit: ADMIN_HISTORY_LIMIT });
  } catch (error) {
    const message = error instanceof Error ? error.message : "管理者履歴を取得できませんでした";
    console.error("admin history fetch failed", message);
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
