import { NextRequest, NextResponse } from "next/server";
import { fal } from "@fal-ai/client";
import { createClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

const FAL_KEY = process.env.FAL_API_KEY!;
const GROK_EDIT_MODEL = "xai/grok-imagine-image/edit";
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);
const FACE_PRESERVATION_PROMPT =
  "Identity lock: preserve the exact same person from the input image. Keep the face, facial structure, eyes, nose, mouth, jawline, expression, hairstyle, hairline, skin tone, age, and body proportions unchanged. Do not beautify, replace, redraw, stylize, retouch, or reinterpret the face. Edit only the requested non-identity details and keep the image photorealistic.";
const WATERMARK_REMOVAL_PROMPT =
  "Remove all watermarks, logos, text overlays, captions, signatures, brand marks, and UI artifacts from the image. Do not add any watermark, logo, text, caption, signature, or brand mark to the result.";

async function uploadToFal(file: File): Promise<string> {
  fal.config({ credentials: FAL_KEY });
  return fal.storage.upload(file, { lifecycle: { expiresIn: "1d" } });
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const cause = error.cause instanceof Error ? ` (${error.cause.message})` : "";
    return `${error.name}: ${error.message}${cause}`;
  }

  return String(error);
}

function getFalEditError(status: number, body: string) {
  let message = body;

  try {
    const parsed = JSON.parse(body) as { detail?: Array<{ msg?: string }> | string };
    if (Array.isArray(parsed.detail)) {
      message = parsed.detail.map(item => item.msg).filter(Boolean).join(" / ");
    } else if (typeof parsed.detail === "string") {
      message = parsed.detail;
    }
  } catch {
    // Fall back to the raw response body below.
  }

  if (message.includes("content could not be processed")) {
    return "Grok側の安全フィルターで編集できませんでした。露出や性的表現を弱めて、別の表現で試してください。";
  }

  const redacted = message.replace(/data:image\/[^"'\s]+/g, "[uploaded image]");
  return `Grok編集に失敗しました。(${status}) ${redacted.slice(0, 240)}`;
}

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

async function saveGenerationHistory(userId: string, prompt: string, generatedUrl: string) {
  const { data: shop } = await supabase
    .from("shops")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();

  const { error } = await supabase.from("generation_history").insert({
    shop_id: shop?.id ?? userId,
    avatar_id: null,
    prompt: `AI編集: ${prompt}`,
    generated_image_url: generatedUrl,
    credits_used: 1,
  });

  if (error) {
    console.error("edit history insert failed", error.message);
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!FAL_KEY) {
      return NextResponse.json({ error: "FAL_API_KEY is not configured" }, { status: 500 });
    }

    const formData = await req.formData();
    const file = formData.get("file");
    const prompt = String(formData.get("prompt") ?? "").trim();
    const resolution = String(formData.get("resolution") ?? "1k");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }

    if (!prompt) {
      return NextResponse.json({ error: "prompt is required" }, { status: 400 });
    }

    if (resolution !== "1k" && resolution !== "2k") {
      return NextResponse.json({ error: "invalid resolution" }, { status: 400 });
    }

    const imageUrl = await uploadToFal(file);
    const response = await fetch(`https://fal.run/${GROK_EDIT_MODEL}`, {
      method: "POST",
      headers: {
        "Authorization": `Key ${FAL_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt: `${FACE_PRESERVATION_PROMPT}\n${WATERMARK_REMOVAL_PROMPT}\n\n${prompt}`,
        image_urls: [imageUrl],
        num_images: 1,
        aspect_ratio: "auto",
        resolution,
        output_format: "jpeg",
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(getFalEditError(response.status, text));
    }

    const data = await response.json();
    const url = data.images?.[0]?.url;
    if (!url) throw new Error("URL not found");

    const user = await getAuthenticatedUser(req);
    if (user) {
      await saveGenerationHistory(user.id, prompt, url);
    }

    return NextResponse.json({ url, revisedPrompt: data.revised_prompt ?? "" });
  } catch (error) {
    const msg = getErrorMessage(error);
    console.error("edit route failed", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
