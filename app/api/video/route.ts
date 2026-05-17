import { NextRequest, NextResponse } from "next/server";
import { fal } from "@fal-ai/client";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase-server";

const FAL_KEY = process.env.FAL_KEY || process.env.FAL_API_KEY || "";
const HISTORY_PREFIX = "LUMIVEIL_HISTORY::";

const MODEL_IDS: Record<string, string> = {
  "grok-imagine": "xai/grok-imagine-video/image-to-video",
  grok: "xai/grok-imagine-video/image-to-video",
  seedance: "bytedance/seedance-2.0/fast/image-to-video",
  "wan-i2v-flash": "wan/v2.6/image-to-video/flash",
  "wan-reference-to-video": "wan/v2.6/reference-to-video",
};

const MODEL_LABELS: Record<string, string> = {
  "grok-imagine": "Grok動画",
  grok: "Grok動画",
  seedance: "Seedance動画",
  "wan-i2v-flash": "Wan Flash動画",
  "wan-reference-to-video": "Wan Reference動画",
};

async function uploadToFal(file: File): Promise<string> {
  fal.config({ credentials: FAL_KEY });
  return fal.storage.upload(file, { lifecycle: { expiresIn: "1d" } });
}

function configureFal() {
  fal.config({ credentials: FAL_KEY });
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const cause = error.cause instanceof Error ? ` (${error.cause.message})` : "";
    return `${error.name}: ${error.message}${cause}`;
  }

  return String(error);
}

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

async function saveVideoHistory({
  client,
  userId,
  model,
  prompt,
  videoUrl,
  creditsUsed,
}: {
  client: SupabaseClient;
  userId: string;
  model: string;
  prompt: string;
  videoUrl: string;
  creditsUsed: number;
}) {
  const { data: shop } = await client
    .from("shops")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  const shopId = shop?.id ?? userId;
  const historyPrompt = encodeHistoryPrompt({
    kind: "video",
    prompt: `${MODEL_LABELS[model] ?? "動画"}: ${prompt}`,
    url: videoUrl,
  });

  const { data: existing } = await client
    .from("generation_history")
    .select("id")
    .eq("shop_id", shopId)
    .eq("prompt", historyPrompt)
    .maybeSingle();

  if (existing) return;

  const { error } = await client.from("generation_history").insert({
    shop_id: shopId,
    avatar_id: null,
    prompt: historyPrompt,
    credits_used: creditsUsed,
  });

  if (error) {
    console.error("video history insert failed", error.message);
  }
}

function encodeHistoryPrompt(input: { kind: "image" | "video"; prompt: string; url: string }) {
  return `${HISTORY_PREFIX}${JSON.stringify(input)}`;
}

function getVideoCreditsUsed(model: string, duration: number, resolution: string) {
  if (model === "wan-i2v-flash") return Math.max(1, Math.round(duration * 1));
  if (model === "wan-reference-to-video") return Math.max(1, Math.round(duration * (resolution === "1080p" ? 3 : 2)));
  if (model === "seedance") return Math.max(1, Math.round(duration * 2));
  return Math.max(1, Math.round(duration * (resolution === "480p" ? 1 : 2)));
}

function mapCharacterReferences(prompt: string) {
  return prompt.replace(/\bcharacter([123])\b/gi, "@Video$1");
}

export async function POST(req: NextRequest) {
  try {
    if (!FAL_KEY) {
      return NextResponse.json({ error: "FAL_KEY is not configured" }, { status: 500 });
    }
    configureFal();

    const formData = await req.formData();
    const file = formData.get("file");
    const model = String(formData.get("model") ?? "grok-imagine");
    const prompt = String(formData.get("prompt") ?? "natural movement, cinematic");
    const duration = Number(formData.get("duration") ?? 5);
    const resolution = String(formData.get("resolution") ?? "720p");
    const aspectRatio = String(formData.get("aspectRatio") ?? "9:16");
    const referenceVideoUrls = [1, 2, 3]
      .map(index => String(formData.get(`referenceVideoUrl${index}`) ?? "").trim())
      .filter(Boolean);

    const modelId = MODEL_IDS[model];
    if (!modelId) {
      return NextResponse.json({ error: "invalid model" }, { status: 400 });
    }

    const input: Record<string, unknown> = {
      prompt,
      resolution,
    };

    if (model === "wan-reference-to-video") {
      if (referenceVideoUrls.length === 0) {
        return NextResponse.json({ error: "reference video url is required" }, { status: 400 });
      }
      input.prompt = mapCharacterReferences(prompt);
      input.video_urls = referenceVideoUrls;
      input.aspect_ratio = aspectRatio;
      input.duration = String(duration === 10 ? 10 : 5);
    } else {
      if (!(file instanceof File)) {
        return NextResponse.json({ error: "file is required" }, { status: 400 });
      }
      input.image_url = await uploadToFal(file);
    }

    if (model === "seedance") {
      input.duration = Math.min(15, Math.max(4, duration || 5));
      input.aspect_ratio = "auto";
      input.generate_audio = true;
    } else if (model === "wan-i2v-flash") {
      input.duration = String(duration === 10 ? 10 : 5);
    } else if (model === "grok" || model === "grok-imagine") {
      input.duration = duration;
      input.aspect_ratio = aspectRatio;
    }

    const data = await fal.queue.submit(modelId, {
      input,
      priority: "normal",
      storageSettings: { expiresIn: "1d" },
      startTimeout: 900,
    });

    return NextResponse.json({ requestId: data.request_id, model });
  } catch (error) {
    const msg = getErrorMessage(error);
    console.error("video submit failed", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const requestId = searchParams.get("requestId");
  const model = searchParams.get("model") ?? "grok-imagine";
  const prompt = searchParams.get("prompt") ?? "video generation";
  const duration = Number(searchParams.get("duration") ?? 5);
  const resolution = searchParams.get("resolution") ?? "720p";

  if (!requestId) {
    return NextResponse.json({ error: "requestId is required" }, { status: 400 });
  }

  const modelId = MODEL_IDS[model];
  if (!modelId) {
    return NextResponse.json({ error: "invalid model" }, { status: 400 });
  }

  try {
    if (!FAL_KEY) {
      return NextResponse.json({ error: "FAL_KEY is not configured" }, { status: 500 });
    }
    configureFal();

    const statusData = await fal.queue.status(modelId, {
      requestId,
      logs: true,
    });

    if (statusData.status === "COMPLETED") {
      const result = await fal.queue.result(modelId, { requestId });
      const resultData = result.data as { video?: { url?: string }; videos?: Array<{ url?: string }> };
      const videoUrl = resultData.video?.url ?? resultData.videos?.[0]?.url;
      if (!videoUrl) {
        throw new Error("result video url is missing");
      }
      const { user, client } = await getAuthenticatedContext(req);
      if (user) {
        const creditsUsed = getVideoCreditsUsed(model, duration, resolution);
        await saveVideoHistory({
          client,
          userId: user.id,
          model,
          prompt,
          videoUrl,
          creditsUsed,
        });
      }
      return NextResponse.json({ status: "completed", videoUrl });
    }

    return NextResponse.json({
      status: "processing",
      queue_position: statusData.status === "IN_QUEUE" ? statusData.queue_position : undefined,
      falStatus: statusData.status,
      logs: "logs" in statusData ? statusData.logs?.slice(-3).map(log => log.message) : [],
    });
  } catch (error) {
    const msg = getErrorMessage(error);
    console.error("video poll failed", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
