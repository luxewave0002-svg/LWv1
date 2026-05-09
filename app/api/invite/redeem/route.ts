import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { TRIAL_FREE_CREDITS, TRIAL_FREE_IMAGE_GENERATIONS, TRIAL_FREE_VIDEO_GENERATIONS, TRIAL_INVITE_CODE } from "@/lib/credit-packs";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function getAuthenticatedUser(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (token) {
    const { data: { user } } = await supabase.auth.getUser(token);
    if (user) return user;
  }

  const cookieSupabase = await createServerSupabaseClient();
  const { data: { user } } = await cookieSupabase.auth.getUser();
  return user;
}

export async function POST(req: NextRequest) {
  try {
    const { inviteCode } = await req.json();
    if (String(inviteCode ?? "").trim() !== TRIAL_INVITE_CODE) {
      return NextResponse.json({ error: "招待コードが正しくありません" }, { status: 403 });
    }

    const user = await getAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
    }

    const transactionId = `invite:${TRIAL_INVITE_CODE}:${user.id}`;
    const { data: existingTransaction } = await supabase
      .from("credit_transactions")
      .select("id")
      .eq("stripe_id", transactionId)
      .maybeSingle();

    const { data: shop } = await supabase
      .from("shops")
      .select("id, credits")
      .eq("user_id", user.id)
      .maybeSingle();

    if (existingTransaction) {
      return NextResponse.json({
        success: true,
        alreadyRedeemed: true,
        credits: shop?.credits ?? 0,
      });
    }

    if (shop) {
      const nextCredits = Number(shop.credits ?? 0) + TRIAL_FREE_CREDITS;
      await supabase.from("shops").update({ credits: nextCredits }).eq("id", shop.id);
      await supabase.from("credit_transactions").insert({
        shop_id: shop.id,
        type: "topup",
        amount: TRIAL_FREE_CREDITS,
        description: `招待コード無料お試し（画像${TRIAL_FREE_IMAGE_GENERATIONS}枚・動画${TRIAL_FREE_VIDEO_GENERATIONS}本相当 / 管理者負担）`,
        stripe_id: transactionId,
      });

      return NextResponse.json({ success: true, credits: nextCredits });
    }

    const { data: newShop } = await supabase
      .from("shops")
      .insert({ user_id: user.id, name: "新規店舗", plan: "free", credits: TRIAL_FREE_CREDITS })
      .select("id")
      .single();

    if (newShop) {
      await supabase.from("credit_transactions").insert({
        shop_id: newShop.id,
        type: "topup",
        amount: TRIAL_FREE_CREDITS,
        description: `招待コード無料お試し（画像${TRIAL_FREE_IMAGE_GENERATIONS}枚・動画${TRIAL_FREE_VIDEO_GENERATIONS}本相当 / 管理者負担）`,
        stripe_id: transactionId,
      });
    }

    return NextResponse.json({ success: true, credits: TRIAL_FREE_CREDITS });
  } catch (error) {
    const message = error instanceof Error ? error.message : "招待コードの適用に失敗しました";
    console.error("invite redeem failed", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
