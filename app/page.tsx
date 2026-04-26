"use client";

import { detectFaceRegions, type FacePoint, type FaceRegions } from "@/lib/faceDetector";
import { type CSSProperties, useCallback, useState } from "react";

type TabId = "generate" | "avatar" | "mosaic" | "edit" | "video" | "history" | "plan";
type MosaicBox = { x: number; y: number; width: number; height: number };
type ImageSize = { width: number; height: number };
type MosaicMode = "blur" | "gaussian" | "simple";

const NAV_ITEMS: Array<{ id: TabId; label: string; icon: string }> = [
  { id: "generate", label: "画像生成", icon: "*" },
  { id: "avatar", label: "キャスト登録", icon: "A" },
  { id: "mosaic", label: "モザイク", icon: "M" },
  { id: "edit", label: "AI編集", icon: "E" },
  { id: "video", label: "動画生成", icon: "V" },
  { id: "history", label: "履歴", icon: "H" },
  { id: "plan", label: "プラン", icon: "P" },
];

const AREAS = ["顔全体", "目元のみ", "口元のみ"] as const;
const STRENGTHS = ["弱", "中", "強", "最強"] as const;
const NUDGE_STEP = 2;
const RESIZE_STEP = 4;

export default function Home() {
  const [tab, setTab] = useState<TabId>("mosaic");
  const [mosaicSrc, setMosaicSrc] = useState<string | null>(null);
  const [mosaicImage, setMosaicImage] = useState<string | null>(null);
  const [mosaicImageSize, setMosaicImageSize] = useState<ImageSize | null>(null);
  const [mosaicRegions, setMosaicRegions] = useState<FaceRegions | null>(null);
  const [mosaicBox, setMosaicBox] = useState<MosaicBox | null>(null);
  const [mosaicArea, setMosaicArea] = useState<(typeof AREAS)[number]>("顔全体");
  const [mosaicStrength, setMosaicStrength] = useState<(typeof STRENGTHS)[number]>("中");
  const [mosaicStage, setMosaicStage] = useState("");
  const [mosaicLoading, setMosaicLoading] = useState(false);

  const buildRegionBox = useCallback((regions: FaceRegions, area: (typeof AREAS)[number]) => {
    if (area === "目元のみ") {
      return regions.eyesBox;
    }

    if (area === "口元のみ") {
      return regions.mouthBox;
    }

    return regions.faceBox;
  }, []);

  const clampMosaicRegion = useCallback(
    (region: MosaicBox) => {
      if (!mosaicImageSize) {
        return region;
      }

      const width = Math.max(1, Math.min(Math.round(region.width), mosaicImageSize.width));
      const height = Math.max(1, Math.min(Math.round(region.height), mosaicImageSize.height));

      return {
        x: Math.max(0, Math.min(Math.round(region.x), mosaicImageSize.width - width)),
        y: Math.max(0, Math.min(Math.round(region.y), mosaicImageSize.height - height)),
        width,
        height,
      };
    },
    [mosaicImageSize]
  );

  const resetMosaic = useCallback(() => {
    setMosaicSrc(null);
    setMosaicImage(null);
    setMosaicImageSize(null);
    setMosaicRegions(null);
    setMosaicBox(null);
    setMosaicStage("");
    setMosaicLoading(false);
  }, []);

  const handleMosaicUpload = useCallback(
    async (file: File) => {
      const objectUrl = URL.createObjectURL(file);
      setMosaicSrc(objectUrl);
      setMosaicImage(null);
      setMosaicRegions(null);
      setMosaicBox(null);

      const bitmap = await createImageBitmap(file);
      const imageSize = { width: bitmap.width, height: bitmap.height };
      bitmap.close();
      setMosaicImageSize(imageSize);

      setMosaicStage("MediaPipe Face Landmarker で顔を検出中...");
      try {
        const regions = await detectFaceRegions(file);
        setMosaicRegions(regions);
        setMosaicBox(regions ? buildRegionBox(regions, mosaicArea) : null);
        setMosaicStage(regions ? "顔輪郭を検出しました。必要なら枠を微調整してください。" : "顔が見つかりませんでした。");
      } catch {
        setMosaicStage("顔検出に失敗しました。位置は手動で微調整できます。");
      }
    },
    [buildRegionBox, mosaicArea]
  );

  const redetectMosaicFace = useCallback(async () => {
    if (!mosaicSrc) return;

    setMosaicStage("MediaPipe Face Landmarker で再検出中...");
    try {
      const response = await fetch(mosaicSrc);
      const blob = await response.blob();
      const file = new File([blob], "mosaic-redetect.jpg", { type: blob.type || "image/jpeg" });
      const regions = await detectFaceRegions(file);
      setMosaicRegions(regions);
      setMosaicBox(regions ? buildRegionBox(regions, mosaicArea) : null);
      setMosaicStage(regions ? "再検出しました。必要なら枠を微調整してください。" : "顔が見つかりませんでした。");
    } catch {
      setMosaicStage("再検出に失敗しました。");
    }
  }, [buildRegionBox, mosaicArea, mosaicSrc]);

  const nudgeMosaicBox = useCallback(
    (dx: number, dy: number) => {
      setMosaicBox(current => {
        if (!current) return current;
        return clampMosaicRegion({
          ...current,
          x: current.x + dx,
          y: current.y + dy,
        });
      });
    },
    [clampMosaicRegion]
  );

  const resizeMosaicBox = useCallback(
    (delta: number) => {
      setMosaicBox(current => {
        if (!current) return current;
        const nextWidth = current.width + delta;
        const nextHeight = current.height + delta;
        const centerX = current.x + current.width / 2;
        const centerY = current.y + current.height / 2;

        return clampMosaicRegion({
          x: centerX - nextWidth / 2,
          y: centerY - nextHeight / 2,
          width: nextWidth,
          height: nextHeight,
        });
      });
    },
    [clampMosaicRegion]
  );

  const buildAdjustedPolygon = useCallback(
    (
      polygon: FacePoint[] | undefined,
      baseBox: MosaicBox,
      currentBox: MosaicBox
    ): FacePoint[] | null => {
      if (!polygon?.length) {
        return null;
      }

      return polygon.map(point => ({
        x: currentBox.x + ((point.x - baseBox.x) / baseBox.width) * currentBox.width,
        y: currentBox.y + ((point.y - baseBox.y) / baseBox.height) * currentBox.height,
      }));
    },
    []
  );

  const runMosaic = useCallback(
    async (mode: MosaicMode) => {
      if (!mosaicSrc || !mosaicBox) return;

      setMosaicLoading(true);
      setMosaicStage(
        mode === "blur"
          ? "ブラー加工中..."
          : mode === "gaussian"
            ? "ガウス加工中..."
            : "自動モザイク加工中..."
      );

      try {
        const response = await fetch(mosaicSrc);
        const blob = await response.blob();
        const file = new File([blob], "mosaic.jpg", { type: blob.type || "image/jpeg" });

        const modeMap: Record<MosaicMode, string> = {
          blur: "ブラー",
          gaussian: "ガウス",
          simple: "自動モザイク",
        };

        const strengthMap: Record<(typeof STRENGTHS)[number], string> = {
          弱: "1",
          中: "2",
          強: "3",
          最強: "4",
        };

        const scope =
          mosaicArea === "顔全体" ? "face" : mosaicArea === "目元のみ" ? "eyes_only" : "bust_up";

        const formData = new FormData();
        formData.append("file", file);
        formData.append("mode", modeMap[mode]);
        formData.append("boxMode", "region");
        formData.append("x", String(mosaicBox.x));
        formData.append("y", String(mosaicBox.y));
        formData.append("width", String(mosaicBox.width));
        formData.append("height", String(mosaicBox.height));
        formData.append("scope", scope);
        formData.append("strength", strengthMap[mosaicStrength]);

        if (mosaicRegions) {
          const polygon =
            mosaicArea === "顔全体"
              ? buildAdjustedPolygon(mosaicRegions.facePolygon, mosaicRegions.faceBox, mosaicBox)
              : mosaicArea === "目元のみ"
                ? buildAdjustedPolygon(mosaicRegions.eyesPolygon, mosaicRegions.eyesBox, mosaicBox)
                : buildAdjustedPolygon(mosaicRegions.mouthPolygon, mosaicRegions.mouthBox, mosaicBox);

          if (polygon) {
            formData.append("regionPolygon", JSON.stringify(polygon));
          }
        }

        const apiRes = await fetch("/api/mosaic", { method: "POST", body: formData });
        if (!apiRes.ok) {
          throw new Error("モザイク処理に失敗しました");
        }

        const resultBlob = await apiRes.blob();
        setMosaicImage(URL.createObjectURL(resultBlob));
        setMosaicStage("加工が完了しました。");
      } catch (error) {
        const message = error instanceof Error ? error.message : "モザイク処理に失敗しました";
        setMosaicStage(message);
      } finally {
        setMosaicLoading(false);
      }
    },
    [buildAdjustedPolygon, mosaicArea, mosaicBox, mosaicRegions, mosaicSrc, mosaicStrength]
  );

  const renderPlaceholder = (title: string, body: string) => (
    <div style={panelStyle}>
      <div style={{ fontSize: 18, fontWeight: 700, color: "#f0ece4", marginBottom: 12 }}>{title}</div>
      <div style={{ fontSize: 13, color: "#b8c0c4", lineHeight: 1.8 }}>{body}</div>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "#071e28", color: "#f0ece4", fontFamily: "'Hiragino Sans', 'Yu Gothic', sans-serif" }}>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .sidebar { display: flex; }
        .bottom-nav { display: none !important; }
        @media (max-width: 820px) {
          .layout-grid { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 680px) {
          .sidebar { display: none !important; }
          .bottom-nav { display: flex !important; position: fixed; bottom: 0; left: 0; right: 0; background: #0a2535; border-top: 1px solid #1a3d4d; z-index: 100; }
          .main-content { padding-bottom: 80px !important; }
        }
      `}</style>

      <div style={{ background: "#071e28", borderBottom: "1px solid #1a3d4d", padding: "0 24px", height: 56, display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 50 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 28, height: 28, background: "linear-gradient(135deg,#c9a84c,#8b6914)", borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 900, color: "#071e28" }}>L</div>
          <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: "0.12em" }}>LUMIVEIL</span>
        </div>
        <div style={{ background: "rgba(201,168,76,0.1)", border: "1px solid rgba(201,168,76,0.25)", borderRadius: 20, padding: "4px 12px", fontSize: 12, color: "#c9a84c" }}>
          ◆ 487 クレジット
        </div>
      </div>

      <div style={{ display: "flex", minHeight: "calc(100vh - 56px)" }}>
        <div className="sidebar" style={{ width: 200, background: "#071e28", borderRight: "1px solid #1a3d4d", flexDirection: "column", padding: "20px 0", flexShrink: 0 }}>
          {NAV_ITEMS.map(item => (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              style={{
                width: "100%",
                padding: "12px 20px",
                border: "none",
                background: tab === item.id ? "rgba(201,168,76,0.08)" : "transparent",
                borderLeft: tab === item.id ? "2px solid #c9a84c" : "2px solid transparent",
                color: tab === item.id ? "#c9a84c" : "#9ba8ae",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 10,
                fontSize: 13,
                textAlign: "left",
              }}
            >
              <span style={{ fontSize: 16 }}>{item.icon}</span>
              {item.label}
            </button>
          ))}
        </div>

        <div className="main-content" style={{ flex: 1, padding: 24, overflowY: "auto" }}>
          {tab !== "mosaic"
            ? renderPlaceholder(
                NAV_ITEMS.find(item => item.id === tab)?.label ?? "LUMIVEIL",
                "この画面は順次移植中です。まずはモザイク機能を安定させ、MediaPipe Face Landmarker と微調整UIを優先しています。"
              )
            : null}

          {tab === "mosaic" ? (
            <div className="layout-grid" style={{ display: "grid", gridTemplateColumns: "1.15fr 0.85fr", gap: 20 }}>
              <div style={panelStyle}>
                <div style={sectionLabelStyle}>プレビュー</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: "#1a1a1a", marginBottom: 10 }}>MediaPipe Face Landmarker</div>
                <div style={{ fontSize: 12, color: "#4e4a43", marginBottom: 14 }}>
                  顔輪郭、目元、口元の領域を検出し、必要なら手動で微調整してからブラーやガウスを適用できます。
                </div>

                <label style={uploadButtonStyle}>
                  画像を選択する
                  <input
                    type="file"
                    accept="image/*"
                    style={{ display: "none" }}
                    onChange={event => {
                      const file = event.target.files?.[0];
                      if (file) {
                        void handleMosaicUpload(file);
                      }
                    }}
                  />
                </label>

                {mosaicSrc ? (
                  <div style={{ marginTop: 14, position: "relative", background: "#000", borderRadius: 12, overflow: "hidden" }}>
                    <img src={mosaicSrc} alt="preview" style={{ width: "100%", maxHeight: 480, objectFit: "contain", display: "block" }} />
                    {mosaicBox && mosaicImageSize ? (
                      <div
                        style={{
                          position: "absolute",
                          left: `${(mosaicBox.x / mosaicImageSize.width) * 100}%`,
                          top: `${(mosaicBox.y / mosaicImageSize.height) * 100}%`,
                          width: `${(mosaicBox.width / mosaicImageSize.width) * 100}%`,
                          height: `${(mosaicBox.height / mosaicImageSize.height) * 100}%`,
                          border: "2px solid #f0c85a",
                          borderRadius: mosaicArea === "顔全体" ? "999px" : 12,
                          boxShadow: "0 0 0 9999px rgba(0,0,0,0.18)",
                          pointerEvents: "none",
                        }}
                      />
                    ) : null}
                  </div>
                ) : (
                  <div
                    style={{
                      marginTop: 14,
                      minHeight: 280,
                      borderRadius: 12,
                      border: "1px dashed #9b927f",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#5f5648",
                      background: "rgba(0,0,0,0.03)",
                      fontSize: 13,
                    }}
                  >
                    画像をアップロードすると、ここに検出枠が表示されます。
                  </div>
                )}

                {mosaicStage ? (
                  <div
                    style={{
                      marginTop: 14,
                      padding: "12px 14px",
                      borderRadius: 10,
                      background: "rgba(201,168,76,0.16)",
                      border: "1px solid rgba(201,168,76,0.35)",
                      color: "#6f5310",
                      fontSize: 12,
                      fontWeight: 700,
                    }}
                  >
                    {mosaicStage}
                  </div>
                ) : null}
              </div>

              <div style={{ ...panelStyle, display: "flex", flexDirection: "column", gap: 16 }}>
                <div>
                  <div style={sectionLabelStyle}>加工範囲</div>
                  <div style={buttonRowStyle}>
                    {AREAS.map(area => (
                      <button
                        key={area}
                        onClick={() => {
                          setMosaicArea(area);
                          setMosaicImage(null);
                          setMosaicBox(mosaicRegions ? buildRegionBox(mosaicRegions, area) : null);
                        }}
                        style={choiceButtonStyle(mosaicArea === area)}
                      >
                        {area}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div style={sectionLabelStyle}>強度</div>
                  <div style={buttonRowStyle}>
                    {STRENGTHS.map(level => (
                      <button key={level} onClick={() => setMosaicStrength(level)} style={choiceButtonStyle(mosaicStrength === level)}>
                        {level}
                      </button>
                    ))}
                  </div>
                </div>

                <div style={{ padding: 12, borderRadius: 10, background: "rgba(0,0,0,0.04)", border: "1px solid #a89e8e" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 10 }}>
                    <div>
                      <div style={sectionLabelStyle}>検出枠の調整</div>
                      <div style={{ fontSize: 11, color: "#6a6258" }}>移動 2px / サイズ 4px ずつ</div>
                    </div>
                    <button onClick={() => void redetectMosaicFace()} style={smallButtonStyle}>
                      顔を再検出
                    </button>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8, maxWidth: 220 }}>
                    <div />
                    <button onClick={() => nudgeMosaicBox(0, -NUDGE_STEP)} style={smallButtonStyle}>
                      上
                    </button>
                    <div />
                    <button onClick={() => nudgeMosaicBox(-NUDGE_STEP, 0)} style={smallButtonStyle}>
                      左
                    </button>
                    <button onClick={() => nudgeMosaicBox(0, NUDGE_STEP)} style={smallButtonStyle}>
                      下
                    </button>
                    <button onClick={() => nudgeMosaicBox(NUDGE_STEP, 0)} style={smallButtonStyle}>
                      右
                    </button>
                  </div>
                  <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                    <button onClick={() => resizeMosaicBox(-RESIZE_STEP)} style={smallButtonStyle}>
                      縮小
                    </button>
                    <button onClick={() => resizeMosaicBox(RESIZE_STEP)} style={smallButtonStyle}>
                      拡大
                    </button>
                  </div>
                </div>

                <div>
                  <div style={sectionLabelStyle}>エフェクト</div>
                  <div style={{ fontSize: 11, color: "#6a6258", marginBottom: 8 }}>自動モザイクは顔の輪郭に沿って広めに隠します。</div>
                  <div style={{ display: "flex", gap: 10 }}>
                    <button onClick={() => void runMosaic("blur")} style={actionButtonStyle} disabled={!mosaicSrc || !mosaicBox || mosaicLoading}>
                      ブラー
                    </button>
                    <button onClick={() => void runMosaic("gaussian")} style={actionButtonStyle} disabled={!mosaicSrc || !mosaicBox || mosaicLoading}>
                      ガウス
                    </button>
                    <button onClick={() => void runMosaic("simple")} style={actionButtonStyle} disabled={!mosaicSrc || !mosaicBox || mosaicLoading}>
                      自動モザイク
                    </button>
                  </div>
                </div>

                <button onClick={resetMosaic} style={{ ...smallButtonStyle, width: "100%" }}>
                  リセット
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {mosaicImage && mosaicSrc ? (
        <div
          onClick={() => setMosaicImage(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
        >
          <div
            onClick={event => event.stopPropagation()}
            style={{ width: "min(980px, 92vw)", background: "#102733", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 14, padding: 18 }}
          >
            <div style={{ fontSize: 14, fontWeight: 700, color: "#f0ece4", marginBottom: 14 }}>比較表示</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14 }}>
              <PreviewCard label="加工前" src={mosaicSrc} />
              <PreviewCard label="加工後" src={mosaicImage} />
            </div>
            <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 16 }}>
              <a
                href={mosaicImage}
                download="mosaic.png"
                style={{ ...actionButtonStyle, textDecoration: "none", display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 120 }}
              >
                保存
              </a>
              <button onClick={() => setMosaicImage(null)} style={{ ...smallButtonStyle, minWidth: 120 }}>
                閉じる
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="bottom-nav" style={{ justifyContent: "space-around" }}>
        {NAV_ITEMS.map(item => (
          <button
            key={item.id}
            onClick={() => setTab(item.id)}
            style={{
              flex: 1,
              padding: "10px 0",
              border: "none",
              background: "transparent",
              cursor: "pointer",
              color: tab === item.id ? "#c9a84c" : "#7e8d94",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 3,
              borderTop: tab === item.id ? "2px solid #c9a84c" : "2px solid transparent",
            }}
          >
            <span style={{ fontSize: 18 }}>{item.icon}</span>
            <span style={{ fontSize: 9 }}>{item.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function PreviewCard({ label, src }: { label: string; src: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: "#c9a84c" }}>{label}</div>
      <div
        style={{
          height: 320,
          borderRadius: 12,
          overflow: "hidden",
          background: "#000",
          border: "1px solid rgba(255,255,255,0.08)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <img src={src} alt={label} style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} />
      </div>
    </div>
  );
}

const panelStyle: CSSProperties = {
  background: "#c8c2b4",
  borderRadius: 12,
  padding: 18,
  border: "1px solid #a89e8e",
};

const sectionLabelStyle: CSSProperties = {
  fontSize: 11,
  color: "#444",
  marginBottom: 8,
  letterSpacing: "0.05em",
  fontWeight: 700,
};

const uploadButtonStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  width: "100%",
  padding: "12px 0",
  borderRadius: 8,
  background: "#b0a898",
  border: "1px solid #a89e8e",
  color: "#111",
  fontWeight: 700,
  fontSize: 13,
  cursor: "pointer",
};

const buttonRowStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
};

const choiceButtonStyle = (active: boolean): CSSProperties => ({
  flex: 1,
  minWidth: 88,
  padding: "10px 0",
  borderRadius: 8,
  background: active ? "rgba(201,168,76,0.3)" : "rgba(0,0,0,0.06)",
  border: active ? "1px solid #c9a84c" : "1px solid #a89e8e",
  color: "#111",
  fontWeight: 600,
  fontSize: 12,
  cursor: "pointer",
});

const actionButtonStyle: CSSProperties = {
  flex: 1,
  padding: "12px 0",
  borderRadius: 8,
  background: "linear-gradient(135deg, #c9a84c, #8b6914)",
  border: "none",
  color: "#071e28",
  fontWeight: 700,
  fontSize: 13,
  cursor: "pointer",
};

const smallButtonStyle: CSSProperties = {
  padding: "10px 12px",
  borderRadius: 8,
  background: "#b0a898",
  border: "1px solid #a89e8e",
  color: "#111",
  fontWeight: 700,
  fontSize: 12,
  cursor: "pointer",
};
