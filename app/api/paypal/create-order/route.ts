import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { TOPUP_PACKS, TRIAL_INVITE_CODE, type TopupPackId } from "@/lib/credit-packs";
import { createPayPalOrder } from "@/lib/paypal";
import { createServerSupabaseClient } from "@/lib/supabase-server";

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
    const { packId, inviteCode } = await req.json();
    const pack = TOPUP_PACKS[packId as TopupPackId];
    if (!pack) {
      return NextResponse.json({ error: "無効なチャージパックです" }, { status: 400 });
    }

    if (pack.amount <= 0) {
      return NextResponse.json({ error: "このプランは招待コードで適用してください" }, { status: 400 });
    }

    if (pack.requiresInviteCode && String(inviteCode ?? "").trim() !== TRIAL_INVITE_CODE) {
      return NextResponse.json({ error: "招待コードが正しくありません" }, { status: 403 });
    }

    const user = await getAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json({ error: "ログイン状態が切れています。もう一度ログインしてください。" }, { status: 401 });
    }

    const order = await createPayPalOrder({
      amount: pack.amount,
      credits: pack.credits,
      packId,
      packName: pack.name,
      userId: user.id,
    });

    const approveUrl = order.links?.find((link: { rel: string; href: string }) => link.rel === "approve")?.href;
    if (!approveUrl) {
      throw new Error("PayPal approve URL not found");
    }

    return NextResponse.json({ orderId: order.id, url: approveUrl });
  } catch (error) {
    const message = error instanceof Error ? error.message : "PayPal決済ページを作成できませんでした";
    console.error("paypal create order failed", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
