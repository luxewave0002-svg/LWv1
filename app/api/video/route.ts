import { NextRequest, NextResponse } from "next/server";

const FAL_KEY = process.env.FAL_API_KEY!;

const MODEL_IDS: Record<string, string> = {
  grok: "xai/grok-imagine-video/image-to-video",
  seedance: "bytedance/seedance-2.0/fast/image-to-video",
};

async function fileToDataUri(file: File): Promise<string> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const contentType = file.type || "image/jpeg";
  return `data:${contentType};base64,${buffer.toString("base64")}`;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const cause = error.cause instanceof Error ? ` (${error.cause.message})` : "";
    return `${error.name}: ${error.message}${cause}`;
  }

  return String(error);
}

export async function POST(req: NextRequest) {
  try {
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

    const imageUrl = await fileToDataUri(file);
    const input: Record<string, unknown> = {
      image_url: imageUrl,
      prompt,
      resolution,
    };

    if (model === "seedance") {
      input.duration = String(duration);
      input.aspect_ratio = "auto";
      input.generate_audio = true;
    } else {
      input.duration = duration;
      input.aspect_ratio = "auto";
    }

    const res = await fetch(`https://queue.fal.run/${modelId}`, {
      method: "POST",
      headers: {
        Authorization: `Key ${FAL_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`fal queue submit failed: ${text}`);
    }

    const data = await res.json();
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

  if (!requestId) {
    return NextResponse.json({ error: "requestId is required" }, { status: 400 });
  }

  const modelId = MODEL_IDS[model];
  if (!modelId) {
    return NextResponse.json({ error: "invalid model" }, { status: 400 });
  }

  try {
    const statusRes = await fetch(
      `https://queue.fal.run/${modelId}/requests/${requestId}/status`,
      { headers: { Authorization: `Key ${FAL_KEY}` } }
    );
    if (!statusRes.ok) throw new Error("status check failed");
    const statusData = await statusRes.json();

    if (statusData.status === "COMPLETED") {
      const resultRes = await fetch(
        `https://queue.fal.run/${modelId}/requests/${requestId}`,
        { headers: { Authorization: `Key ${FAL_KEY}` } }
      );
      const result = await resultRes.json();
      return NextResponse.json({ status: "completed", videoUrl: result.video?.url });
    }

    if (statusData.status === "FAILED") {
      return NextResponse.json({ status: "failed", error: "生成に失敗しました" });
    }

    return NextResponse.json({ status: "processing", queue_position: statusData.queue_position });
  } catch (error) {
    console.error("video poll failed", error);
    return NextResponse.json({ error: "ステータス確認に失敗しました" }, { status: 500 });
  }
}
