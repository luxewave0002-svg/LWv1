import { NextRequest, NextResponse } from "next/server";
import { fal } from "@fal-ai/client";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase-server";

const FAL_KEY = process.env.FAL_API_KEY!;
const HISTORY_PREFIX = "LUMIVEIL_HISTORY::";

const MODEL_IDS: Record<string, string> = {
  grok: "xai/grok-imagine-video/image-to-video",
  seedance: "bytedance/seedance-2.0/fast/image-to-video",
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
    prompt: `${model === "seedance" ? "Seedance動画" : "Grok動画"}: ${prompt}`,
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

export async function POST(req: NextRequest) {
  try {
    if (!FAL_KEY) {
      return NextResponse.json({ error: "FAL_API_KEY is not configured" }, { status: 500 });
    }
    configureFal();

    const formData = await req.formData();
    const file = formData.get("file");
    const model = String(formData.get("model") ?? "grok");
    const prompt = String(formData.get("prompt") ?? "natural movement, cinematic");
    const duration = Number(formData.get("duration") ?? 5);
    const resolution = String(formData.get("resolution") ?? "720p");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }

    const modelId = MODEL_IDS[model];
    if (!modelId) {
      return NextResponse.json({ error: "invalid model" }, { status: 400 });
    }

    const imageUrl = await uploadToFal(file);
    const input: Record<string, unknown> = {
      image_url: imageUrl,
      prompt,
      resolution,
    };

    if (model === "seedance") {
      input.duration = String(Math.min(15, Math.max(4, duration || 5)));
      input.aspect_ratio = "auto";
      input.generate_audio = true;
    } else {
      input.duration = duration;
      input.aspect_ratio = "auto";
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
  const model = searchParams.get("model") ?? "grok";
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
      return NextResponse.json({ error: "FAL_API_KEY is not configured" }, { status: 500 });
    }
    configureFal();

    const statusData = await fal.queue.status(modelId, {
      requestId,
      logs: true,
    });

    if (statusData.status === "COMPLETED") {
      const result = await fal.queue.result(modelId, { requestId });
      const resultData = result.data as { video?: { url?: string } };
      const videoUrl = resultData.video?.url;
      if (!videoUrl) {
        throw new Error("result video url is missing");
      }
      const { user, client } = await getAuthenticatedContext(req);
      if (user) {
        const creditsUsed = model === "seedance" ? Math.max(1, Math.round(duration * 2)) : Math.max(1, Math.round(duration * (resolution === "480p" ? 1 : 2)));
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
