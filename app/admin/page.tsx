"use client";

import { useCallback, useEffect, useState } from "react";

type AdminHistoryItem = {
  id: string;
  shop_id: string | null;
  avatar_id: string | null;
  prompt: string | null;
  generated_image_url: string;
  media_type?: "image" | "video";
  credits_used: number | null;
  created_at: string;
};

function isVideoHistoryUrl(url: string) {
  const cleanUrl = url.split("?")[0].toLowerCase();
  return cleanUrl.endsWith(".mp4") || cleanUrl.endsWith(".webm") || cleanUrl.endsWith(".mov");
}

export default function AdminPage() {
  const [items, setItems] = useState<AdminHistoryItem[]>([]);
  const [limit, setLimit] = useState(100);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");

  const loadHistory = useCallback(async () => {
    setLoading(true);
    setStatus("");
    try {
      const res = await fetch("/api/admin/history");
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error ?? "管理者履歴を取得できませんでした");
      }

      setItems(data.history ?? []);
      setLimit(Number(data.limit ?? 100));
    } catch (error) {
      setItems([]);
      setStatus(error instanceof Error ? error.message : "管理者履歴を取得できませんでした");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  return (
    <main style={{ minHeight: "100vh", background: "#071e28", color: "#f0ece4", fontFamily: "var(--font-lumiveil-sans)", padding: 18 }}>
      <div style={{ maxWidth: 1180, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
        <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ color: "#c9a84c", fontSize: 11, letterSpacing: "0.08em", fontWeight: 500, marginBottom: 6 }}>LUMIVEIL ADMIN</div>
            <h1 style={{ fontSize: 24, fontWeight: 500, margin: 0 }}>生成履歴</h1>
            <p style={{ marginTop: 6, color: "#9ba8ae", fontSize: 13 }}>管理者は全ユーザーの生成画像・動画を最新{limit}件まで確認できます。</p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <a href="/admin/accounts" style={smallButtonStyle}>アカウント管理</a>
            <a href="/" style={smallButtonStyle}>アプリへ戻る</a>
            <button onClick={() => void loadHistory()} disabled={loading} style={smallButtonStyle}>
              {loading ? "更新中..." : "更新"}
            </button>
          </div>
        </header>

        {status ? (
          <div style={{ ...panelStyle, color: status.includes("権限") || status.includes("ログイン") ? "#b84242" : "#171717" }}>
            {status}
          </div>
        ) : null}

        {loading ? (
          <div style={panelStyle}>読み込み中...</div>
        ) : items.length > 0 ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: 14 }}>
            {items.map(item => {
              const hasMedia = Boolean(item.generated_image_url);
              const isVideo = item.media_type === "video" || isVideoHistoryUrl(item.generated_image_url);

              return (
              <article key={item.id} style={{ ...panelStyle, padding: 0, overflow: "hidden" }}>
                <div style={{ display: "block", aspectRatio: "3 / 4", background: "#111", overflow: "hidden" }}>
                  {!hasMedia ? (
                    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#aaa", fontSize: 12, padding: 16, textAlign: "center" }}>
                      メディアURL未保存
                    </div>
                  ) : isVideo ? (
                    <video src={item.generated_image_url} controls muted playsInline style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                  ) : (
                    <a href={item.generated_image_url} target="_blank" rel="noreferrer" style={{ display: "block", width: "100%", height: "100%" }}>
                      <img src={item.generated_image_url} alt={item.prompt ?? "生成画像"} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                    </a>
                  )}
                </div>
                <div style={{ padding: 12 }}>
                  <div style={{ color: "#6a6258", fontSize: 11, marginBottom: 8 }}>
                    {new Date(item.created_at).toLocaleString("ja-JP", {
                      year: "numeric",
                      month: "2-digit",
                      day: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                  <div style={{ color: "#171717", fontSize: 12, lineHeight: 1.6, minHeight: 42, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                    {item.prompt || "プロンプトなし"}
                  </div>
                  <div style={{ color: "#6a6258", fontSize: 10, lineHeight: 1.6, marginTop: 10 }}>
                    <div>shop: {item.shop_id ?? "-"}</div>
                    <div>avatar: {item.avatar_id ?? "-"}</div>
                    <div>{item.credits_used ?? 1} credit</div>
                  </div>
                </div>
              </article>
              );
            })}
          </div>
        ) : (
          <div style={panelStyle}>生成履歴はまだありません。</div>
        )}
      </div>
    </main>
  );
}

const panelStyle = {
  background: "#d0cabd",
  borderRadius: 8,
  padding: 14,
  border: "1px solid #9f9686",
  color: "#171717",
};

const smallButtonStyle = {
  padding: "8px 10px",
  borderRadius: 8,
  background: "#b0a898",
  border: "1px solid #a89e8e",
  color: "#111",
  fontWeight: 500,
  fontSize: 11,
  cursor: "pointer",
  textDecoration: "none",
};
