import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const FAL_KEY = process.env.FAL_API_KEY!;
const GROK_EDIT_MODEL = "xai/grok-imagine-image/edit";

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

export async function POST(req: NextRequest) {
  try {
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

    const imageUrl = await fileToDataUri(file);
    const response = await fetch(`https://fal.run/${GROK_EDIT_MODEL}`, {
      method: "POST",
      headers: {
        "Authorization": `Key ${FAL_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt,
        image_urls: [imageUrl],
        num_images: 1,
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

    return NextResponse.json({ url, revisedPrompt: data.revised_prompt ?? "" });
  } catch (error) {
    const msg = getErrorMessage(error);
    console.error("edit route failed", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
