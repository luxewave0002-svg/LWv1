import { NextRequest, NextResponse } from "next/server";
import { generateImage } from "@/lib/fal";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);
const HISTORY_PREFIX = "LUMIVEIL_HISTORY::";

export async function POST(req: NextRequest) {
  try {
    const token = req.headers.get("authorization")?.replace("Bearer ", "");
    const { data: { user } } = await supabase.auth.getUser(token!);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { imageUrl, prompt, background, avatarId } = await req.json();
    if (!imageUrl || !prompt) {
      return NextResponse.json({ error: "imageUrlとpromptは必須です" }, { status: 400 });
    }

    const { data: shop } = await supabase
      .from("shops")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    const generatedUrl = await generateImage(imageUrl, prompt, background);

    await supabase.from("generation_history").insert({
      shop_id: shop?.id ?? user.id,
      avatar_id: avatarId || null,
      prompt: `${HISTORY_PREFIX}${JSON.stringify({ kind: "image", prompt, url: generatedUrl })}`,
      credits_used: 1,
    });

    return NextResponse.json({ url: generatedUrl });
  } catch (error) {
    console.error("Generation error:", error);
    return NextResponse.json({ error: "画像生成に失敗しました" }, { status: 500 });
  }
}
