import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";

export const runtime = "nodejs";

type Scope = "face" | "eyes_only" | "bust_up";
type Style = "blur" | "lens" | "mosaic" | "simple_mosaic";
type MaskShape = "face" | "capsule" | "oval";

type Region = {
  left: number;
  top: number;
  width: number;
  height: number;
  ellipseRx: number;
  ellipseRy: number;
  blurMask: number;
  maskShape: MaskShape;
};

type FacePoint = {
  x: number;
  y: number;
};

function clampRegion(
  left: number,
  top: number,
  width: number,
  height: number,
  imageWidth: number,
  imageHeight: number
) {
  const safeLeft = Math.max(0, Math.min(Math.floor(left), imageWidth - 1));
  const safeTop = Math.max(0, Math.min(Math.floor(top), imageHeight - 1));
  const safeWidth = Math.max(1, Math.min(Math.floor(width), imageWidth - safeLeft));
  const safeHeight = Math.max(1, Math.min(Math.floor(height), imageHeight - safeTop));

  return {
    left: safeLeft,
    top: safeTop,
    width: safeWidth,
    height: safeHeight,
  };
}

function expandRegion(
  region: Pick<Region, "left" | "top" | "width" | "height">,
  imageWidth: number,
  imageHeight: number,
  ratioX: number,
  ratioY: number
) {
  const padX = region.width * ratioX;
  const padY = region.height * ratioY;

  return clampRegion(
    region.left - padX,
    region.top - padY,
    region.width + padX * 2,
    region.height + padY * 2,
    imageWidth,
    imageHeight
  );
}

function regionForScope(scope: Scope, width: number, height: number): Region {
  if (scope === "eyes_only") {
    return {
      left: Math.floor(width * 0.2),
      top: Math.floor(height * 0.22),
      width: Math.max(1, Math.floor(width * 0.6)),
      height: Math.max(1, Math.floor(height * 0.22)),
      ellipseRx: 0.34,
      ellipseRy: 0.3,
      blurMask: 18,
      maskShape: "capsule",
    };
  }

  if (scope === "bust_up") {
    return {
      left: Math.floor(width * 0.14),
      top: Math.floor(height * 0.08),
      width: Math.max(1, Math.floor(width * 0.72)),
      height: Math.max(1, Math.floor(height * 0.68)),
      ellipseRx: 0.32,
      ellipseRy: 0.4,
      blurMask: 26,
      maskShape: "capsule",
    };
  }

  return {
    left: Math.floor(width * 0.2),
    top: Math.floor(height * 0.12),
    width: Math.max(1, Math.floor(width * 0.6)),
    height: Math.max(1, Math.floor(height * 0.62)),
    ellipseRx: 0.38,
    ellipseRy: 0.48,
    blurMask: 3,
    maskShape: "oval",
  };
}

function regionForFaceBox(
  scope: Scope,
  imageWidth: number,
  imageHeight: number,
  x: number,
  y: number,
  width: number,
  height: number
): Region {
  const padX = width * 0.08;
  const padY = height * 0.1;
  const faceX = x - padX;
  const faceY = y - padY;
  const faceWidth = width + padX * 2;
  const faceHeight = height + padY * 1.5;

  if (scope === "eyes_only") {
    return {
      ...clampRegion(
        faceX + faceWidth * 0.14,
        faceY + faceHeight * 0.2,
        faceWidth * 0.72,
        faceHeight * 0.2,
        imageWidth,
        imageHeight
      ),
      ellipseRx: 0.28,
      ellipseRy: 0.3,
      blurMask: 28,
      maskShape: "capsule",
    };
  }

  if (scope === "bust_up") {
    return {
      ...clampRegion(
        faceX + faceWidth * 0.22,
        faceY + faceHeight * 0.62,
        faceWidth * 0.56,
        faceHeight * 0.16,
        imageWidth,
        imageHeight
      ),
      ellipseRx: 0.28,
      ellipseRy: 0.3,
      blurMask: 26,
      maskShape: "capsule",
    };
  }

  return {
    ...clampRegion(faceX, faceY, faceWidth, faceHeight, imageWidth, imageHeight),
    ellipseRx: 0.38,
    ellipseRy: 0.48,
    blurMask: 3,
    maskShape: "oval",
  };
}

function parseStrength(rawStrength: string) {
  const strengthMap: Record<string, number> = {
    "1": 1,
    "2": 2,
    "3": 3,
    "4": 4,
    "5": 5,
    弱: 1,
    中: 3,
    強: 4,
    最強: 5,
  };

  const parsedStrength = strengthMap[rawStrength] ?? Number(rawStrength);
  return Number.isFinite(parsedStrength)
    ? Math.max(1, Math.min(5, parsedStrength))
    : 3;
}

function parseStyle(formData: FormData): Style {
  const style = String(formData.get("style") ?? "").trim();
  const mode = String(formData.get("mode") ?? "").trim();
  const raw = style || mode;

  if (raw === "blur" || raw === "ブラー") {
    return "blur";
  }

  if (raw === "lens" || raw === "gaussian" || raw === "ガウス") {
    return "lens";
  }

  if (raw === "simple" || raw === "simple_mosaic" || raw === "自動モザイク") {
    return "simple_mosaic";
  }

  return "mosaic";
}

function parseFacePolygon(raw: FormDataEntryValue | null, imageWidth: number, imageHeight: number): FacePoint[] | null {
  if (typeof raw !== "string" || !raw.trim()) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return null;
    }

    const points = parsed
      .map(point => {
        if (!point || typeof point !== "object") {
          return null;
        }

        const maybePoint = point as Partial<FacePoint>;
        const x = Number(maybePoint.x);
        const y = Number(maybePoint.y);

        if (!Number.isFinite(x) || !Number.isFinite(y)) {
          return null;
        }

        return {
          x: Math.max(0, Math.min(imageWidth, x)),
          y: Math.max(0, Math.min(imageHeight, y)),
        };
      })
      .filter((point): point is FacePoint => Boolean(point));

    return points.length >= 8 ? points : null;
  } catch {
    return null;
  }
}

function polygonToSvgPoints(points: FacePoint[], width: number, height: number, scaleX = 1.04, scaleY = 1.06) {
  const center = points.reduce(
    (acc, point) => ({ x: acc.x + point.x / points.length, y: acc.y + point.y / points.length }),
    { x: 0, y: 0 }
  );

  return points
    .map(point => {
      const expandedX = center.x + (point.x - center.x) * scaleX;
      const expandedY = center.y + (point.y - center.y) * scaleY;

      return {
        x: Math.max(0, Math.min(width, expandedX)),
        y: Math.max(0, Math.min(height, expandedY)),
      };
    })
    .map(point => `${point.x.toFixed(1)},${point.y.toFixed(1)}`)
    .join(" ");
}

function buildFacePath(region: Pick<Region, "left" | "top" | "width" | "height">) {
  const { left, top, width, height } = region;

  return [
    `M ${left + width * 0.5} ${top + height * 0.03}`,
    `C ${left + width * 0.26} ${top + height * 0.03}, ${left + width * 0.1} ${top + height * 0.18}, ${left + width * 0.08} ${top + height * 0.42}`,
    `C ${left + width * 0.06} ${top + height * 0.66}, ${left + width * 0.18} ${top + height * 0.86}, ${left + width * 0.5} ${top + height * 0.98}`,
    `C ${left + width * 0.82} ${top + height * 0.86}, ${left + width * 0.94} ${top + height * 0.66}, ${left + width * 0.92} ${top + height * 0.42}`,
    `C ${left + width * 0.9} ${top + height * 0.18}, ${left + width * 0.74} ${top + height * 0.03}, ${left + width * 0.5} ${top + height * 0.03} Z`,
  ].join(" ");
}

async function buildFullImageMask(
  imageWidth: number,
  imageHeight: number,
  region: Region,
  polygon?: FacePoint[] | null
) {
  const filterPad = region.blurMask * 3;
  const capsuleX = region.left + region.width * 0.12;
  const capsuleY = region.top + region.height * 0.18;
  const capsuleWidth = region.width * 0.76;
  const capsuleHeight = region.height * 0.64;
  const capsuleRadius = Math.min(capsuleWidth, capsuleHeight) * 0.42;

  let shapeMarkup = `<ellipse cx="${region.left + region.width / 2}" cy="${region.top + region.height / 2}" rx="${region.width * region.ellipseRx}" ry="${region.height * region.ellipseRy}" fill="white" filter="url(#soft)" />`;

  if (polygon?.length) {
    const scaleX = region.maskShape === "capsule" ? 1.45 : 1.04;
    const scaleY = region.maskShape === "capsule" ? 1.9 : 1.06;
    shapeMarkup = `<polygon points="${polygonToSvgPoints(polygon, imageWidth, imageHeight, scaleX, scaleY)}" fill="white" filter="url(#soft)" />`;
  } else if (region.maskShape === "face") {
    shapeMarkup = `<path d="${buildFacePath(region)}" fill="white" filter="url(#soft)" />`;
  } else if (region.maskShape === "capsule") {
    shapeMarkup = `<rect x="${capsuleX}" y="${capsuleY}" width="${capsuleWidth}" height="${capsuleHeight}" rx="${capsuleRadius}" ry="${capsuleRadius}" fill="white" filter="url(#soft)" />`;
  }

  const maskSvg = Buffer.from(`
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="${imageWidth}"
      height="${imageHeight}"
      viewBox="0 0 ${imageWidth} ${imageHeight}"
    >
      <rect width="100%" height="100%" fill="black" fill-opacity="0" />
      <defs>
        <filter
          id="soft"
          x="${-filterPad}"
          y="${-filterPad}"
          width="${imageWidth + filterPad * 2}"
          height="${imageHeight + filterPad * 2}"
          filterUnits="userSpaceOnUse"
          color-interpolation-filters="sRGB"
        >
          <feGaussianBlur stdDeviation="${region.blurMask}" />
        </filter>
      </defs>
      ${shapeMarkup}
    </svg>
  `);

  return sharp(maskSvg)
    .resize(imageWidth, imageHeight)
    .ensureAlpha()
    .extractChannel("alpha")
    .raw()
    .toBuffer();
}

function hasUsableMask(alphaMask: Buffer, region: Region) {
  let activePixels = 0;

  for (const value of alphaMask) {
    if (value > 12) {
      activePixels += 1;
    }
  }

  return activePixels >= Math.max(64, region.width * region.height * 0.08);
}

async function buildSoftMask(
  width: number,
  height: number,
  ellipseRx: number,
  ellipseRy: number,
  blurMask: number,
  maskShape: MaskShape,
  polygon?: FacePoint[] | null
) {
  const filterPad = blurMask * 3;
  const facePath = [
    `M ${width * 0.5} ${height * 0.03}`,
    `C ${width * 0.26} ${height * 0.03}, ${width * 0.1} ${height * 0.18}, ${width * 0.08} ${height * 0.42}`,
    `C ${width * 0.06} ${height * 0.66}, ${width * 0.18} ${height * 0.86}, ${width * 0.5} ${height * 0.98}`,
    `C ${width * 0.82} ${height * 0.86}, ${width * 0.94} ${height * 0.66}, ${width * 0.92} ${height * 0.42}`,
    `C ${width * 0.9} ${height * 0.18}, ${width * 0.74} ${height * 0.03}, ${width * 0.5} ${height * 0.03} Z`,
  ].join(" ");
  const capsuleX = width * 0.12;
  const capsuleY = height * 0.18;
  const capsuleWidth = width * 0.76;
  const capsuleHeight = height * 0.64;
  const capsuleRadius = Math.min(capsuleWidth, capsuleHeight) * 0.42;

  let shapeMarkup = `<ellipse cx="${width / 2}" cy="${height / 2}" rx="${width * ellipseRx}" ry="${height * ellipseRy}" fill="white" filter="url(#soft)" />`;

  if (polygon?.length) {
    shapeMarkup = `<polygon points="${polygonToSvgPoints(polygon, width, height)}" fill="white" filter="url(#soft)" />`;
  } else if (maskShape === "face") {
    shapeMarkup = `<path d="${facePath}" fill="white" filter="url(#soft)" />`;
  } else if (maskShape === "capsule") {
    shapeMarkup = `<rect x="${capsuleX}" y="${capsuleY}" width="${capsuleWidth}" height="${capsuleHeight}" rx="${capsuleRadius}" ry="${capsuleRadius}" fill="white" filter="url(#soft)" />`;
  }

  const maskSvg = Buffer.from(`
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="${width}"
      height="${height}"
      viewBox="0 0 ${width} ${height}"
    >
      <rect width="100%" height="100%" fill="black" fill-opacity="0" />
      <defs>
        <filter
          id="soft"
          x="${-filterPad}"
          y="${-filterPad}"
          width="${width + filterPad * 2}"
          height="${height + filterPad * 2}"
          filterUnits="userSpaceOnUse"
          color-interpolation-filters="sRGB"
        >
          <feGaussianBlur stdDeviation="${blurMask}" />
        </filter>
      </defs>
      ${shapeMarkup}
    </svg>
  `);

  return sharp(maskSvg)
    .resize(width, height)
    .ensureAlpha()
    .extractChannel("alpha")
    .raw()
    .toBuffer();
}

async function applySoftMask(
  source: Buffer,
  width: number,
  height: number,
  ellipseRx: number,
  ellipseRy: number,
  blurMask: number,
  maskShape: MaskShape,
  polygon?: FacePoint[] | null
) {
  const alphaMask = await buildSoftMask(width, height, ellipseRx, ellipseRy, blurMask, maskShape, polygon);
  return applyAlphaMask(source, alphaMask, width, height);
}

async function applyBlur(
  source: Buffer,
  style: Style,
  strength: number,
  width: number,
  height: number,
  ellipseRx: number,
  ellipseRy: number,
  blurMask: number,
  maskShape: MaskShape,
  polygon?: FacePoint[] | null
) {
  const sigma = style === "lens" ? Math.max(14, strength * 8) : Math.max(10, strength * 6);

  const region = await sharp(source).blur(sigma).png().toBuffer();

  return applySoftMask(region, width, height, ellipseRx, ellipseRy, blurMask, maskShape, polygon);
}

async function applyPixelate(
  source: Buffer,
  strength: number,
  width: number,
  height: number,
  ellipseRx: number,
  ellipseRy: number,
  blurMask: number,
  maskShape: MaskShape,
  polygon?: FacePoint[] | null
) {
  const block = Math.max(18, Math.floor(24 * strength));
  const downW = Math.max(3, Math.floor(width / block));
  const downH = Math.max(3, Math.floor(height / block));

  const pixelated = await sharp(source)
    .resize(downW, downH, { kernel: "nearest" })
    .resize(width, height, { kernel: "nearest" })
    .png()
    .toBuffer();

  return applySoftMask(pixelated, width, height, ellipseRx, ellipseRy, blurMask, maskShape, polygon);
}

async function applySimplePixelate(
  source: Buffer,
  strength: number,
  width: number,
  height: number,
  ellipseRx: number,
  ellipseRy: number,
  blurMask: number,
  maskShape: MaskShape,
  polygon?: FacePoint[] | null
) {
  const shortSide = Math.min(width, height);
  const ratioByStrength = [0.16, 0.22, 0.28, 0.34, 0.42];
  const ratio = ratioByStrength[Math.max(0, Math.min(4, strength - 1))];
  const blockSize = Math.max(1, Math.round(shortSide * ratio));
  const downW = Math.max(2, Math.floor(width / blockSize));
  const downH = Math.max(2, Math.floor(height / blockSize));

  const preBlurred = await sharp(source)
    .blur(Math.max(10, strength * 7))
    .modulate({ saturation: 0.65, brightness: 1.03 })
    .png()
    .toBuffer();

  const pixelated = await sharp(preBlurred)
    .resize(downW, downH, { kernel: "nearest" })
    .resize(width, height, { kernel: "nearest" })
    .blur(1.2)
    .png()
    .toBuffer();

  return applySoftMask(pixelated, width, height, ellipseRx, ellipseRy, blurMask, maskShape, polygon);
}

async function applyFullImageEffect(
  source: Buffer,
  style: Style,
  strength: number,
  imageWidth: number,
  imageHeight: number,
  region: Region
) {
  if (style === "simple_mosaic") {
    const shortSide = Math.min(region.width, region.height);
    const ratioByStrength = [0.16, 0.22, 0.28, 0.34, 0.42];
    const ratio = ratioByStrength[Math.max(0, Math.min(4, strength - 1))];
    const blockSize = Math.max(1, Math.round(shortSide * ratio));
    const downW = Math.max(2, Math.floor(imageWidth / blockSize));
    const downH = Math.max(2, Math.floor(imageHeight / blockSize));
    const preBlurred = await sharp(source)
      .blur(Math.max(10, strength * 7))
      .modulate({ saturation: 0.65, brightness: 1.03 })
      .png()
      .toBuffer();

    return sharp(preBlurred)
      .resize(downW, downH, { kernel: "nearest" })
      .resize(imageWidth, imageHeight, { kernel: "nearest" })
      .blur(1.2)
      .png()
      .toBuffer();
  }

  if (style === "mosaic") {
    const block = Math.max(18, Math.floor(24 * strength));
    const downW = Math.max(3, Math.floor(imageWidth / block));
    const downH = Math.max(3, Math.floor(imageHeight / block));

    return sharp(source)
      .resize(downW, downH, { kernel: "nearest" })
      .resize(imageWidth, imageHeight, { kernel: "nearest" })
      .png()
      .toBuffer();
  }

  const sigma = style === "lens" ? Math.max(14, strength * 8) : Math.max(10, strength * 6);

  return sharp(source).blur(sigma).png().toBuffer();
}

async function applyFullImageMask(
  source: Buffer,
  alphaMask: Buffer,
  imageWidth: number,
  imageHeight: number
) {
  return applyAlphaMask(source, alphaMask, imageWidth, imageHeight);
}

async function applyAlphaMask(
  source: Buffer,
  alphaMask: Buffer,
  width: number,
  height: number
) {
  const sourceRaw = await sharp(source)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const rgba = Buffer.alloc(width * height * 4);

  for (let i = 0; i < width * height; i += 1) {
    const sourceIndex = i * sourceRaw.info.channels;
    const rgbaIndex = i * 4;

    rgba[rgbaIndex] = sourceRaw.data[sourceIndex];
    rgba[rgbaIndex + 1] = sourceRaw.data[sourceIndex + 1];
    rgba[rgbaIndex + 2] = sourceRaw.data[sourceIndex + 2];
    rgba[rgbaIndex + 3] = alphaMask[i] ?? 0;
  }

  return sharp(rgba, { raw: { width, height, channels: 4 } })
    .png()
    .toBuffer();
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file");
    const scope = String(formData.get("scope") ?? "face") as Scope;
    const style = parseStyle(formData);
    const boxMode = String(formData.get("boxMode") ?? "");
    const x = Number(formData.get("x"));
    const y = Number(formData.get("y"));
    const width = Number(formData.get("width"));
    const height = Number(formData.get("height"));
    const strength = parseStrength(String(formData.get("strength") ?? "3"));

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const normalizedBytes = await sharp(bytes).rotate().png().toBuffer();
    const meta = await sharp(normalizedBytes).metadata();
    const imageWidth = meta.width ?? 0;
    const imageHeight = meta.height ?? 0;

    if (!imageWidth || !imageHeight) {
      return NextResponse.json({ error: "invalid image" }, { status: 400 });
    }

    const regionPolygon = parseFacePolygon(
      formData.get("regionPolygon") ?? formData.get("facePolygon"),
      imageWidth,
      imageHeight
    );
    let region: Region;

    if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(width) && Number.isFinite(height)) {
      if (boxMode === "region") {
        region = {
          ...clampRegion(x, y, width, height, imageWidth, imageHeight),
          ellipseRx: scope === "face" ? 0.38 : 0.3,
          ellipseRy: scope === "face" ? 0.48 : 0.3,
          blurMask: scope === "face" ? 3 : 26,
          maskShape: scope === "face" ? "oval" : "capsule",
        };
      } else {
        region = regionForFaceBox(scope, imageWidth, imageHeight, x, y, width, height);
      }
    } else {
      region = regionForScope(scope, imageWidth, imageHeight);
    }

    if (style === "simple_mosaic") {
      const expanded = expandRegion(
        region,
        imageWidth,
        imageHeight,
        scope === "face" ? 0.02 : 0.12,
        scope === "face" ? 0.02 : 0.14
      );

      region = {
        ...region,
        ...expanded,
      };
    }

    const fullEffect = await applyFullImageEffect(normalizedBytes, style, strength, imageWidth, imageHeight, region);
    let alphaMask = await buildFullImageMask(imageWidth, imageHeight, region, regionPolygon);
    if (regionPolygon && !hasUsableMask(alphaMask, region)) {
      alphaMask = await buildFullImageMask(imageWidth, imageHeight, region);
    }
    const maskedEffect = await applyFullImageMask(fullEffect, alphaMask, imageWidth, imageHeight);

    const output = await sharp(normalizedBytes)
      .composite([
        {
          input: maskedEffect,
          left: 0,
          top: 0,
        },
      ])
      .png()
      .toBuffer();

    return new NextResponse(new Uint8Array(output), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("mosaic route failed", error);
    return NextResponse.json({ error: "mosaic failed" }, { status: 500 });
  }
}
