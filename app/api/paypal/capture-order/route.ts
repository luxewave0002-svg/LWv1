import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { TOPUP_PACKS, type TopupPackId } from "@/lib/credit-packs";
import { capturePayPalOrder } from "@/lib/paypal";
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

async function isAlreadyProcessed(orderId: string) {
  const { data } = await supabase
    .from("credit_transactions")
    .select("id")
    .eq("stripe_id", `paypal:${orderId}`)
    .single();

  return !!data;
}

export async function POST(req: NextRequest) {
  try {
    const { orderId } = await req.json();
    if (!orderId) {
      return NextResponse.json({ error: "orderId is required" }, { status: 400 });
    }

    const user = await getAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json({ error: "ログイン状態が切れています。もう一度ログインしてください。" }, { status: 401 });
    }

    if (await isAlreadyProcessed(orderId)) {
      const { data: shop } = await supabase
        .from("shops")
        .select("credits")
        .eq("user_id", user.id)
        .single();

      return NextResponse.json({ success: true, credits: shop?.credits ?? 0, alreadyProcessed: true });
    }

    const capture = await capturePayPalOrder(orderId);
    if (capture.status !== "COMPLETED") {
      return NextResponse.json({ error: "PayPal決済が完了していません" }, { status: 400 });
    }

    const unit = capture.purchase_units?.[0];
    const customId = String(unit?.payments?.captures?.[0]?.custom_id ?? unit?.custom_id ?? "");
    const [userId, packId] = customId.split(":");
    const pack = TOPUP_PACKS[packId as TopupPackId];

    if (userId !== user.id || !pack) {
      return NextResponse.json({ error: "PayPal注文情報が一致しません" }, { status: 400 });
    }

    const { data: shop } = await supabase
      .from("shops")
      .select("id, credits")
      .eq("user_id", user.id)
      .single();

    if (shop) {
      const nextCredits = Number(shop.credits ?? 0) + pack.credits;
      await supabase.from("shops").update({ credits: nextCredits }).eq("id", shop.id);
      await supabase.from("credit_transactions").insert({
        shop_id: shop.id,
        type: "topup",
        amount: pack.credits,
        description: `PayPal ${pack.name}クレジットチャージ`,
        stripe_id: `paypal:${orderId}`,
      });

      return NextResponse.json({ success: true, credits: nextCredits });
    }

    const { data: newShop } = await supabase
      .from("shops")
      .insert({ user_id: user.id, name: "新規店舗", plan: "free", credits: pack.credits })
      .select("id")
      .single();

    if (newShop) {
      await supabase.from("credit_transactions").insert({
        shop_id: newShop.id,
        type: "topup",
        amount: pack.credits,
        description: `PayPal ${pack.name}クレジットチャージ`,
        stripe_id: `paypal:${orderId}`,
      });
    }

    return NextResponse.json({ success: true, credits: pack.credits });
  } catch (error) {
    const message = error instanceof Error ? error.message : "PayPal決済の確定に失敗しました";
    console.error("paypal capture order failed", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
