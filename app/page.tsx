"use client";

import { detectFaceRegions, type FacePoint, type FaceRegions } from "@/lib/faceDetector";
import { TOPUP_PACKS, type TopupPackId } from "@/lib/credit-packs";
import { createClient } from "@/lib/supabase";
import { type CSSProperties, useCallback, useEffect, useRef, useState } from "react";

type TabId = "generate" | "avatar" | "mosaic" | "edit" | "video" | "history" | "plan";
type MosaicBox = { x: number; y: number; width: number; height: number };
type ImageSize = { width: number; height: number };
type MosaicMode = "blur" | "gaussian" | "simple";
type VideoModel = "grok" | "seedance";
type EditResolution = "1k" | "2k";
type RegisteredAvatar = {
  id: string;
  name: string;
  face_image_url: string | null;
  created_at: string;
  status: string;
};
type GenerationHistoryItem = {
  id: string;
  avatar_id: string | null;
  prompt: string | null;
  generated_image_url: string;
  credits_used: number | null;
  created_at: string;
};

const NAV_ITEMS: Array<{ id: TabId; label: string; mobileLabel: string }> = [
  { id: "generate", label: "画像生成（工事中）", mobileLabel: "生成" },
  { id: "avatar", label: "キャスト登録", mobileLabel: "キャスト" },
  { id: "mosaic", label: "モザイク", mobileLabel: "モザイク" },
  { id: "edit", label: "AI編集", mobileLabel: "編集" },
  { id: "video", label: "動画生成", mobileLabel: "動画" },
  { id: "history", label: "履歴", mobileLabel: "履歴" },
  { id: "plan", label: "プラン", mobileLabel: "プラン" },
];

const AREAS = ["顔全体", "目元のみ", "口元のみ"] as const;
const STRENGTHS = ["弱", "中", "強", "最強"] as const;
const NUDGE_STEP = 2;
const RESIZE_STEP = 4;
const PHOTO_CREDITS_ESTIMATE = 1;
const VIDEO_CREDITS_ESTIMATE = 8;
const MAX_AVATARS = 200;
const TOPUP_PACK_LIST = Object.entries(TOPUP_PACKS).map(([id, pack]) => ({ id: id as TopupPackId, ...pack }));

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

  const [avatarName, setAvatarName] = useState("");
  const [avatarFiles, setAvatarFiles] = useState<File[]>([]);
  const [avatarPreviews, setAvatarPreviews] = useState<string[]>([]);
  const [avatarLoading, setAvatarLoading] = useState(false);
  const [avatarStatus, setAvatarStatus] = useState("");
  const [avatars, setAvatars] = useState<RegisteredAvatar[]>([]);
  const [avatarListLoading, setAvatarListLoading] = useState(false);

  const [editFile, setEditFile] = useState<File | null>(null);
  const [editSrc, setEditSrc] = useState<string | null>(null);
  const [editPrompt, setEditPrompt] = useState("顔、表情、目鼻口、輪郭、髪型は元画像のまま維持。ロゴ、透かし、文字は削除。背景とライティングだけを自然に整えて、高品質に仕上げる");
  const [editResolution, setEditResolution] = useState<EditResolution>("1k");
  const [editLoading, setEditLoading] = useState(false);
  const [editResult, setEditResult] = useState<string | null>(null);
  const [editStatus, setEditStatus] = useState("");

  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [videoModel, setVideoModel] = useState<VideoModel>("grok");
  const [videoPrompt, setVideoPrompt] = useState("natural movement, cinematic");
  const [videoDuration, setVideoDuration] = useState(5);
  const [videoResolution, setVideoResolution] = useState("720p");
  const [videoLoading, setVideoLoading] = useState(false);
  const [videoResult, setVideoResult] = useState<string | null>(null);
  const [videoRequestId, setVideoRequestId] = useState<string | null>(null);
  const [videoStatus, setVideoStatus] = useState("");
  const videoPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const paypalCaptureStartedRef = useRef(false);
  const [credits, setCredits] = useState<number | null>(null);
  const [topupLoadingPack, setTopupLoadingPack] = useState<TopupPackId | null>(null);
  const [topupStatus, setTopupStatus] = useState("");
  const [trialInviteCode, setTrialInviteCode] = useState("");
  const [historyItems, setHistoryItems] = useState<GenerationHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyStatus, setHistoryStatus] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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
          中: "3",
          強: "4",
          最強: "5",
        };

        const scope =
          mosaicArea === "顔全体" ? "face" : mosaicArea === "目元のみ" ? "eyes_only" : "mouth_only";

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

  const getAuthToken = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase.auth.getSession();
    const now = Math.floor(Date.now() / 1000);
    const session = data.session;

    if (session?.access_token && (!session.expires_at || session.expires_at > now + 60)) {
      return session.access_token;
    }

    const { data: refreshed, error } = await supabase.auth.refreshSession();
    if (error) {
      return null;
    }

    return refreshed.session?.access_token ?? null;
  }, []);

  const loadCredits = useCallback(async () => {
    try {
      const token = await getAuthToken();
      if (!token) return;

      const res = await fetch("/api/credits", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error ?? "クレジット残高を取得できませんでした");
      }

      setCredits(Number(data.credits ?? 0));
    } catch {
      setCredits(null);
    }
  }, [getAuthToken]);

  const handleLogout = useCallback(async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  }, []);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    setHistoryStatus("");
    try {
      const token = await getAuthToken();
      if (!token) {
        setHistoryItems([]);
        setHistoryStatus("ログイン状態を確認できませんでした。ページを再読み込みしてもう一度お試しください。");
        return;
      }

      const res = await fetch("/api/history", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        if (res.status === 401) {
          setHistoryItems([]);
          setHistoryStatus("ログイン状態を確認できませんでした。ページを再読み込みしてもう一度お試しください。");
          return;
        }
        throw new Error(data.error ?? "履歴を取得できませんでした");
      }

      setHistoryItems(data.history ?? []);
    } catch (error) {
      setHistoryItems([]);
      setHistoryStatus(error instanceof Error ? error.message : "履歴を取得できませんでした");
    } finally {
      setHistoryLoading(false);
    }
  }, [getAuthToken]);

  const loadCurrentUser = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase.auth.getUser();
    setUserEmail(data.user?.email ?? "");
  }, []);

  const startTopupCheckout = useCallback(async (packId: TopupPackId) => {
    setTopupLoadingPack(packId);
    setTopupStatus("PayPal決済ページを準備中...");
    try {
      const pack = TOPUP_PACKS[packId];
      const inviteCode = pack.requiresInviteCode ? trialInviteCode.trim() : undefined;
      if (pack.requiresInviteCode && !inviteCode) {
        throw new Error("お試しプランは招待コードを入力してください。");
      }

      const token = await getAuthToken();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;

      const res = await fetch("/api/paypal/create-order", {
        method: "POST",
        headers,
        body: JSON.stringify({ packId, inviteCode }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        if (res.status === 401) {
          throw new Error("ログイン状態が切れています。もう一度ログインしてからチャージしてください。");
        }
        throw new Error(data.error ?? "PayPal決済ページを作成できませんでした");
      }

      window.location.href = data.url;
    } catch (error) {
      setTopupStatus(error instanceof Error ? error.message : "PayPal決済ページを作成できませんでした");
      setTopupLoadingPack(null);
    }
  }, [getAuthToken, trialInviteCode]);

  const loadAvatars = useCallback(async () => {
    setAvatarListLoading(true);
    try {
      const token = await getAuthToken();
      if (!token) {
        setAvatarStatus("ログインが必要です。");
        return;
      }

      const res = await fetch("/api/avatar", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error ?? "キャスト一覧を取得できませんでした");
      }

      setAvatars(data.avatars ?? []);
    } catch (error) {
      setAvatarStatus(error instanceof Error ? error.message : "キャスト一覧を取得できませんでした");
    } finally {
      setAvatarListLoading(false);
    }
  }, [getAuthToken]);

  const handleAvatarFiles = useCallback((files: FileList | null) => {
    const selected = Array.from(files ?? []).filter(file => file.type.startsWith("image/"));
    setAvatarFiles(selected);
    setAvatarPreviews(current => {
      current.forEach(url => URL.revokeObjectURL(url));
      return selected.map(file => URL.createObjectURL(file));
    });
    setAvatarStatus("");
  }, []);

  const submitAvatar = useCallback(async () => {
    if (!avatarName.trim() || avatarFiles.length === 0) return;
    if (avatars.length >= MAX_AVATARS) {
      setAvatarStatus(`登録済みキャストは${MAX_AVATARS}人までです。`);
      return;
    }

    setAvatarLoading(true);
    setAvatarStatus("キャストを登録中...");
    try {
      const token = await getAuthToken();
      if (!token) {
        throw new Error("ログインが必要です。");
      }

      const formData = new FormData();
      formData.append("castName", avatarName.trim());
      avatarFiles.forEach(file => formData.append("photos", file));

      const res = await fetch("/api/avatar", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error ?? "キャスト登録に失敗しました");
      }

      setAvatarName("");
      setAvatarFiles([]);
      setAvatarPreviews(current => {
        current.forEach(url => URL.revokeObjectURL(url));
        return [];
      });
      setAvatarStatus("キャストを登録しました。");
      await loadAvatars();
    } catch (error) {
      setAvatarStatus(error instanceof Error ? error.message : "キャスト登録に失敗しました");
    } finally {
      setAvatarLoading(false);
    }
  }, [avatarFiles, avatarName, avatars.length, getAuthToken, loadAvatars]);

  const resetAvatarForm = useCallback(() => {
    setAvatarName("");
    setAvatarFiles([]);
    setAvatarStatus("");
    setAvatarPreviews(current => {
      current.forEach(url => URL.revokeObjectURL(url));
      return [];
    });
  }, []);

  const handleVideoUpload = useCallback((file: File) => {
    setVideoFile(file);
    setVideoSrc(URL.createObjectURL(file));
    setVideoResult(null);
    setVideoStatus("");
  }, []);

  const handleEditUpload = useCallback((file: File) => {
    setEditFile(file);
    setEditSrc(URL.createObjectURL(file));
    setEditResult(null);
    setEditStatus("");
  }, []);

  const submitEdit = useCallback(async () => {
    if (!editFile) return;

    setEditLoading(true);
    setEditStatus("Grok Imagine で編集中...");

    try {
      const formData = new FormData();
      formData.append("file", editFile);
      formData.append("prompt", editPrompt);
      formData.append("resolution", editResolution);

      const res = await fetch("/api/edit", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error ?? "編集に失敗しました");
      }

      setEditResult(data.url);
      setEditStatus("編集が完了しました。");
    } catch (error) {
      setEditStatus(error instanceof Error ? error.message : "編集に失敗しました");
    } finally {
      setEditLoading(false);
    }
  }, [editFile, editPrompt, editResolution]);

  const resetEdit = useCallback(() => {
    setEditFile(null);
    setEditSrc(null);
    setEditResult(null);
    setEditStatus("");
  }, []);

  const submitVideo = useCallback(async () => {
    if (!videoFile) return;
    setVideoLoading(true);
    setVideoStatus("画像をアップロード中...");
    try {
      const formData = new FormData();
      formData.append("file", videoFile);
      formData.append("model", videoModel);
      formData.append("prompt", videoPrompt);
      formData.append("duration", String(videoDuration));
      formData.append("resolution", videoResolution);
      const res = await fetch("/api/video", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error ?? "提出に失敗しました");
      setVideoRequestId(data.requestId);
      setVideoStatus("生成キューに追加しました。しばらくお待ちください...");
    } catch (error) {
      setVideoStatus(error instanceof Error ? error.message : "エラーが発生しました");
      setVideoLoading(false);
    }
  }, [videoDuration, videoFile, videoModel, videoPrompt, videoResolution]);

  useEffect(() => {
    if (!videoRequestId) return;
    videoPollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/video?requestId=${videoRequestId}&model=${videoModel}`);
        const data = await res.json();
        if (data.status === "completed") {
          clearInterval(videoPollRef.current!);
          setVideoRequestId(null);
          setVideoResult(data.videoUrl);
          setVideoLoading(false);
          setVideoStatus("完成！");
        } else if (data.status === "failed") {
          clearInterval(videoPollRef.current!);
          setVideoRequestId(null);
          setVideoLoading(false);
          setVideoStatus("生成に失敗しました");
        } else {
          const pos = (data as { queue_position?: number }).queue_position;
          setVideoStatus(pos != null ? `生成中... (キュー位置: ${pos})` : "生成中...");
        }
      } catch {
        // keep polling on transient errors
      }
    }, 5000);
    return () => { if (videoPollRef.current) clearInterval(videoPollRef.current); };
  }, [videoRequestId, videoModel]);

  useEffect(() => {
    if (tab === "avatar") {
      void loadAvatars();
    }
  }, [loadAvatars, tab]);

  useEffect(() => {
    if (tab === "history") {
      void loadHistory();
    }
  }, [loadHistory, tab]);

  useEffect(() => {
    void loadCredits();
  }, [loadCredits]);

  useEffect(() => {
    void loadCurrentUser();
  }, [loadCurrentUser]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const paypalStatus = params.get("paypal");
    const orderId = params.get("token");

    if (paypalStatus === "canceled") {
      setTab("plan");
      setTopupStatus("PayPal決済をキャンセルしました。");
      window.history.replaceState({}, "", window.location.pathname);
      return;
    }

    if (paypalStatus !== "success" || !orderId || paypalCaptureStartedRef.current) {
      return;
    }

    paypalCaptureStartedRef.current = true;
    setTab("plan");
    setTopupStatus("PayPal決済を確認中...");

    void (async () => {
      try {
        const token = await getAuthToken();
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (token) headers.Authorization = `Bearer ${token}`;

        const res = await fetch("/api/paypal/capture-order", {
          method: "POST",
          headers,
          body: JSON.stringify({ orderId }),
        });
        const data = await res.json();
        if (!res.ok || data.error) {
          if (res.status === 401) {
            throw new Error("ログイン状態が切れています。もう一度ログインしてからPayPal決済を確定してください。");
          }
          throw new Error(data.error ?? "PayPal決済の確定に失敗しました");
        }

        setCredits(Number(data.credits ?? 0));
        setTopupStatus(data.alreadyProcessed ? "このPayPal決済は反映済みです。" : "PayPalチャージが完了しました。");
        window.history.replaceState({}, "", window.location.pathname);
      } catch (error) {
        setTopupStatus(error instanceof Error ? error.message : "PayPal決済の確定に失敗しました");
      }
    })();
  }, [getAuthToken]);

  const renderPlaceholder = (title: string, body: string) => (
    <div style={panelStyle}>
      <div style={{ fontSize: 18, fontWeight: 500, color: "#f0ece4", marginBottom: 12 }}>{title}</div>
      <div style={{ fontSize: 13, color: "#b8c0c4", lineHeight: 1.8 }}>{body}</div>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "#071e28", color: "#f0ece4", fontFamily: "var(--font-lumiveil-sans)" }}>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .sidebar { display: flex; }
        .mobile-menu-button { display: none !important; }
        .mobile-email { display: block; }
        @media (max-width: 820px) {
          .layout-grid { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 680px) {
          .sidebar { display: none !important; }
          .mobile-menu-button { display: inline-flex !important; }
          .mobile-email { display: none !important; }
          .main-content { padding-bottom: 18px !important; }
        }
      `}</style>

      <div style={{ background: "#071e28", borderBottom: "1px solid #163645", padding: "0 16px", height: 48, display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 50 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            className="mobile-menu-button"
            aria-label="メニューを開く"
            aria-expanded={mobileMenuOpen}
            onClick={() => setMobileMenuOpen(current => !current)}
            style={{
              width: 32,
              height: 32,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 8,
              border: "1px solid rgba(201,168,76,0.28)",
              background: "rgba(255,255,255,0.04)",
              color: "#f0ece4",
              cursor: "pointer",
              flexDirection: "column",
              gap: 4,
            }}
          >
            <span style={{ width: 15, height: 1, background: "currentColor", display: "block" }} />
            <span style={{ width: 15, height: 1, background: "currentColor", display: "block" }} />
            <span style={{ width: 15, height: 1, background: "currentColor", display: "block" }} />
          </button>
          <div style={{ width: 24, height: 24, background: "#c9a84c", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 500, color: "#071e28" }}>L</div>
          <span style={{ fontSize: 14, fontWeight: 500, letterSpacing: "0.08em" }}>LUMIVEIL</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ background: "rgba(201,168,76,0.1)", border: "1px solid rgba(201,168,76,0.25)", borderRadius: 999, padding: "3px 10px", fontSize: 11, color: "#c9a84c" }}>
            ◆ {credits == null ? "--" : credits.toLocaleString("ja-JP")} クレジット
          </div>
          {userEmail ? (
            <div
              className="mobile-email"
              title={userEmail}
              style={{
                maxWidth: 220,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                color: "#b8c0c4",
                fontSize: 11,
              }}
            >
              {userEmail}
            </div>
          ) : null}
          <button
            onClick={() => void handleLogout()}
            style={{
              padding: "5px 10px",
              borderRadius: 999,
              border: "1px solid rgba(255,255,255,0.18)",
              background: "rgba(255,255,255,0.04)",
              color: "#b8c0c4",
              fontSize: 11,
              fontWeight: 500,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            ログアウト
          </button>
        </div>
      </div>

      {mobileMenuOpen ? (
        <div
          onClick={() => setMobileMenuOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.46)",
            zIndex: 80,
          }}
        >
          <nav
            aria-label="スマホメニュー"
            onClick={event => event.stopPropagation()}
            style={{
              width: "min(82vw, 300px)",
              height: "100%",
              background: "#071e28",
              borderRight: "1px solid #163645",
              padding: "64px 0 18px",
              boxShadow: "18px 0 42px rgba(0,0,0,0.32)",
            }}
          >
            {NAV_ITEMS.map(item => (
              <button
                key={item.id}
                onClick={() => {
                  setTab(item.id);
                  setMobileMenuOpen(false);
                }}
                style={{
                  width: "100%",
                  padding: "13px 18px",
                  border: "none",
                  background: tab === item.id ? "rgba(201,168,76,0.1)" : "transparent",
                  borderLeft: tab === item.id ? "3px solid #c9a84c" : "3px solid transparent",
                  color: tab === item.id ? "#c9a84c" : "#d8dde0",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  fontSize: 14,
                  textAlign: "left",
                  fontFamily: "inherit",
                }}
              >
                {item.label}
              </button>
            ))}
          </nav>
        </div>
      ) : null}

      <div style={{ display: "flex", minHeight: "calc(100vh - 48px)" }}>
        <div className="sidebar" style={{ width: 168, background: "#071e28", borderRight: "1px solid #163645", flexDirection: "column", padding: "12px 0", flexShrink: 0 }}>
          {NAV_ITEMS.map(item => (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              style={{
                width: "100%",
                padding: "10px 14px",
                border: "none",
                background: tab === item.id ? "rgba(201,168,76,0.08)" : "transparent",
                borderLeft: tab === item.id ? "2px solid #c9a84c" : "2px solid transparent",
                color: tab === item.id ? "#c9a84c" : "#9ba8ae",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 12,
                textAlign: "left",
              }}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="main-content" style={{ flex: 1, padding: 16, overflowY: "auto" }}>
          {tab === "generate"
            ? renderPlaceholder(
                NAV_ITEMS.find(item => item.id === tab)?.label ?? "LUMIVEIL",
                "この画面は順次移植中です。まずはモザイク機能を安定させ、MediaPipe Face Landmarker と微調整UIを優先しています。"
              )
            : null}

          {tab === "history" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={panelStyle}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <div>
                    <div style={sectionLabelStyle}>生成履歴</div>
                    <div style={{ fontSize: 20, fontWeight: 500, color: "#171717", marginBottom: 6 }}>生成した画像</div>
                    <div style={{ fontSize: 12, color: "#4e4a43", lineHeight: 1.7 }}>
                      アカウントに紐づいた画像生成の結果を新しい順に最大50件まで表示します。
                    </div>
                  </div>
                  <button onClick={() => void loadHistory()} disabled={historyLoading} style={smallButtonStyle}>
                    {historyLoading ? "更新中..." : "更新"}
                  </button>
                </div>
              </div>

              {historyStatus ? (
                <div
                  style={{
                    padding: "10px 12px",
                    borderRadius: 8,
                    background: "rgba(201,168,76,0.14)",
                    border: "1px solid rgba(201,168,76,0.35)",
                    color: historyStatus.includes("ログイン") || historyStatus.includes("取得できません") ? "#b84242" : "#6f5310",
                    fontSize: 12,
                    fontWeight: 500,
                  }}
                >
                  {historyStatus}
                </div>
              ) : null}

              {historyLoading ? (
                <div style={panelStyle}>
                  <div style={{ minHeight: 220, display: "flex", alignItems: "center", justifyContent: "center", color: "#5f5648", fontSize: 13 }}>
                    履歴を読み込み中...
                  </div>
                </div>
              ) : historyItems.length > 0 ? (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 14 }}>
                  {historyItems.map(item => (
                    <div key={item.id} style={{ ...panelStyle, padding: 0, overflow: "hidden" }}>
                      <a
                        href={item.generated_image_url}
                        target="_blank"
                        rel="noreferrer"
                        style={{ display: "block", aspectRatio: "3 / 4", background: "#111", overflow: "hidden" }}
                      >
                        <img
                          src={item.generated_image_url}
                          alt={item.prompt ?? "生成画像"}
                          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                        />
                      </a>
                      <div style={{ padding: 12 }}>
                        <div style={{ fontSize: 11, color: "#6a6258", marginBottom: 8 }}>
                          {new Date(item.created_at).toLocaleString("ja-JP", {
                            year: "numeric",
                            month: "2-digit",
                            day: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </div>
                        <div
                          style={{
                            minHeight: 42,
                            color: "#171717",
                            fontSize: 12,
                            lineHeight: 1.6,
                            display: "-webkit-box",
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: "vertical",
                            overflow: "hidden",
                          }}
                        >
                          {item.prompt || "プロンプトなし"}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 12 }}>
                          <span style={{ fontSize: 11, color: "#6a6258" }}>
                            {item.credits_used ?? 1} credit
                          </span>
                          <a
                            href={item.generated_image_url}
                            download
                            style={{ ...smallButtonStyle, textDecoration: "none", display: "inline-flex", alignItems: "center", justifyContent: "center" }}
                          >
                            保存
                          </a>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={panelStyle}>
                  <div
                    style={{
                      minHeight: 260,
                      borderRadius: 12,
                      border: "1px dashed #9b927f",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#5f5648",
                      background: "rgba(0,0,0,0.03)",
                      fontSize: 13,
                      textAlign: "center",
                      padding: 20,
                    }}
                  >
                    まだ生成履歴はありません。
                  </div>
                </div>
              )}
            </div>
          ) : null}

          {tab === "plan" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={panelStyle}>
                <div style={sectionLabelStyle}>クレジット</div>
                <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontSize: 22, fontWeight: 500, color: "#171717", marginBottom: 6 }}>クレジットチャージ</div>
                    <div style={{ fontSize: 12, color: "#4e4a43", lineHeight: 1.7 }}>
                      画像生成、AI編集、動画生成、キャスト登録に使うクレジットを追加できます。
                      目安は写真1枚あたり約{PHOTO_CREDITS_ESTIMATE}クレジット、動画1本あたり約{VIDEO_CREDITS_ESTIMATE}クレジットです。
                    </div>
                  </div>
                  <div style={{ minWidth: 140, padding: "10px 12px", borderRadius: 8, background: "rgba(0,0,0,0.07)", border: "1px solid #a89e8e" }}>
                    <div style={{ fontSize: 10, color: "#6a6258", fontWeight: 500, marginBottom: 4 }}>現在の残高</div>
                    <div style={{ fontSize: 20, color: "#111", fontWeight: 500 }}>
                      {credits == null ? "--" : credits.toLocaleString("ja-JP")}
                    </div>
                  </div>
                </div>
              </div>

              {topupStatus ? (
                <div
                  style={{
                    padding: "10px 12px",
                    borderRadius: 8,
                    background: "rgba(201,168,76,0.14)",
                    border: "1px solid rgba(201,168,76,0.35)",
                    color: topupStatus.includes("必要") || topupStatus.includes("できません") || topupStatus.includes("正しく") ? "#b84242" : "#6f5310",
                    fontSize: 12,
                    fontWeight: 500,
                  }}
                >
                  {topupStatus}
                </div>
              ) : null}

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 14 }}>
                {TOPUP_PACK_LIST.map(pack => (
                  <div key={pack.id} style={panelStyle}>
                    <div style={{ display: "flex", flexDirection: "column", minHeight: 168 }}>
                      <div style={sectionLabelStyle}>{pack.caption}</div>
                      <div style={{ fontSize: 18, fontWeight: 500, color: "#171717", marginBottom: 8 }}>{pack.name}</div>
                      <div style={{ fontSize: 28, fontWeight: 500, color: "#111", lineHeight: 1 }}>
                        {pack.credits.toLocaleString("ja-JP")}
                      </div>
                      <div style={{ fontSize: 11, color: "#6a6258", marginTop: 4 }}>クレジット</div>
                      <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 8, background: "rgba(0,0,0,0.06)", border: "1px solid rgba(0,0,0,0.08)" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12, color: "#171717", marginBottom: 6 }}>
                          <span>写真</span>
                          <strong style={{ fontWeight: 500 }}>約{Math.floor(pack.credits / PHOTO_CREDITS_ESTIMATE).toLocaleString("ja-JP")}枚</strong>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12, color: "#171717" }}>
                          <span>動画</span>
                          <strong style={{ fontWeight: 500 }}>約{Math.floor(pack.credits / VIDEO_CREDITS_ESTIMATE).toLocaleString("ja-JP")}本</strong>
                        </div>
                        <div style={{ marginTop: 6, fontSize: 10, color: "#6a6258", lineHeight: 1.5 }}>
                          画質・動画サイズ・動画の長さによって異なります。
                        </div>
                      </div>
                      {pack.requiresInviteCode ? (
                        <label style={{ display: "flex", flexDirection: "column", gap: 7, marginTop: 12 }}>
                          <span style={sectionLabelStyle}>招待コード</span>
                          <input
                            value={trialInviteCode}
                            onChange={event => setTrialInviteCode(event.target.value)}
                            placeholder="招待コードを入力"
                            style={{
                              width: "100%",
                              padding: "9px 10px",
                              borderRadius: 8,
                              border: "1px solid #a89e8e",
                              background: "rgba(0,0,0,0.06)",
                              color: "#111",
                              fontSize: 12,
                              fontFamily: "inherit",
                              outline: "none",
                            }}
                          />
                        </label>
                      ) : null}
                      <div style={{ marginTop: "auto", paddingTop: 18 }}>
                        <div style={{ marginBottom: 10 }}>
                          {pack.originalAmount ? (
                            <div style={{ fontSize: 11, color: "#6a6258", textDecoration: "line-through", marginBottom: 2 }}>
                              ¥{pack.originalAmount.toLocaleString("ja-JP")}
                            </div>
                          ) : null}
                          <div style={{ fontSize: 16, fontWeight: 500, color: "#111" }}>
                            ¥{pack.amount.toLocaleString("ja-JP")}
                          </div>
                        </div>
                        <button
                          onClick={() => void startTopupCheckout(pack.id)}
                          disabled={topupLoadingPack != null}
                          style={{
                            ...actionButtonStyle,
                            width: "100%",
                            opacity: topupLoadingPack != null ? 0.55 : 1,
                            cursor: topupLoadingPack != null ? "not-allowed" : "pointer",
                          }}
                        >
                          {topupLoadingPack === pack.id ? "準備中..." : "PayPalでチャージ"}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {tab === "avatar" ? (
            <div className="layout-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
              <div style={panelStyle}>
                <div style={sectionLabelStyle}>キャスト情報</div>
                <div style={{ fontSize: 18, fontWeight: 650, color: "#171717", marginBottom: 14 }}>キャスト登録</div>

                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <label style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <span style={sectionLabelStyle}>キャスト名</span>
                    <input
                      value={avatarName}
                      onChange={event => setAvatarName(event.target.value)}
                      placeholder="例: LUXE WAVE"
                      style={{
                        width: "100%",
                        padding: "11px 12px",
                        borderRadius: 8,
                        border: "1px solid #a89e8e",
                        background: "rgba(0,0,0,0.06)",
                        color: "#111",
                        fontSize: 13,
                        fontFamily: "inherit",
                        outline: "none",
                      }}
                    />
                  </label>

                  <div>
                    <div style={sectionLabelStyle}>写真</div>
                    <label style={uploadButtonStyle}>
                      写真を選択する
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        style={{ display: "none" }}
                        onChange={event => handleAvatarFiles(event.target.files)}
                      />
                    </label>
                    <div style={{ marginTop: 8, fontSize: 11, color: "#6a6258" }}>
                      正面が分かる写真を1枚以上アップロードしてください。登録には50クレジット使用します。キャスト履歴は最大{MAX_AVATARS}人まで残せます。
                    </div>
                  </div>

                  {avatarPreviews.length > 0 ? (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(92px, 1fr))", gap: 10 }}>
                      {avatarPreviews.map((src, index) => (
                        <div key={src} style={{ borderRadius: 10, overflow: "hidden", background: "#000", border: "1px solid rgba(0,0,0,0.16)", aspectRatio: "1 / 1" }}>
                          <img src={src} alt={`登録写真 ${index + 1}`} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div
                      style={{
                        minHeight: 180,
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
                      選択した写真のプレビューが表示されます。
                    </div>
                  )}

                  {avatarStatus ? (
                    <div
                      style={{
                        padding: "10px 12px",
                        borderRadius: 8,
                        background: "rgba(0,0,0,0.06)",
                        color: avatarStatus.includes("失敗") || avatarStatus.includes("不足") || avatarStatus.includes("必要") ? "#b84242" : "#4a7c50",
                        fontSize: 12,
                        fontWeight: 500,
                      }}
                    >
                      {avatarStatus}
                    </div>
                  ) : null}

                  <div style={{ display: "flex", gap: 10 }}>
                    <button
                      onClick={() => void submitAvatar()}
                      disabled={!avatarName.trim() || avatarFiles.length === 0 || avatarLoading || avatars.length >= MAX_AVATARS}
                      style={{
                        ...actionButtonStyle,
                        opacity: !avatarName.trim() || avatarFiles.length === 0 || avatarLoading || avatars.length >= MAX_AVATARS ? 0.5 : 1,
                        cursor: !avatarName.trim() || avatarFiles.length === 0 || avatarLoading || avatars.length >= MAX_AVATARS ? "not-allowed" : "pointer",
                      }}
                    >
                      {avatarLoading ? "登録中..." : avatars.length >= MAX_AVATARS ? "上限に達しました" : "登録する"}
                    </button>
                    <button onClick={resetAvatarForm} style={{ ...smallButtonStyle, flex: 1 }}>
                      リセット
                    </button>
                  </div>
                </div>
              </div>

              <div style={panelStyle}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 14 }}>
                  <div>
                    <div style={sectionLabelStyle}>登録済み</div>
                    <div style={{ fontSize: 18, fontWeight: 650, color: "#171717" }}>キャスト一覧</div>
                    <div style={{ marginTop: 4, fontSize: 11, color: "#6a6258" }}>
                      {avatars.length}/{MAX_AVATARS} 人
                    </div>
                  </div>
                  <button onClick={() => void loadAvatars()} style={smallButtonStyle} disabled={avatarListLoading}>
                    更新
                  </button>
                </div>

                {avatarListLoading ? (
                  <div style={{ fontSize: 13, color: "#5f5648" }}>読み込み中...</div>
                ) : avatars.length > 0 ? (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 12 }}>
                    {avatars.map(avatar => (
                      <div key={avatar.id} style={{ borderRadius: 10, overflow: "hidden", background: "rgba(0,0,0,0.06)", border: "1px solid #a89e8e" }}>
                        <div style={{ aspectRatio: "1 / 1", background: "#111" }}>
                          {avatar.face_image_url ? (
                            <img src={avatar.face_image_url} alt={avatar.name} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                          ) : null}
                        </div>
                        <div style={{ padding: 10 }}>
                          <div style={{ fontSize: 13, fontWeight: 650, color: "#111", marginBottom: 4 }}>{avatar.name}</div>
                          <div style={{ fontSize: 10, color: "#6a6258" }}>
                            {avatar.status} / {new Date(avatar.created_at).toLocaleDateString("ja-JP")}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div
                    style={{
                      minHeight: 220,
                      borderRadius: 12,
                      border: "1px dashed #9b927f",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#5f5648",
                      background: "rgba(0,0,0,0.03)",
                      fontSize: 13,
                      textAlign: "center",
                      padding: 20,
                    }}
                  >
                    まだ登録済みキャストはありません。
                  </div>
                )}
              </div>
            </div>
          ) : null}

          {tab === "mosaic" ? (
            <div className="layout-grid" style={{ display: "grid", gridTemplateColumns: "1.15fr 0.85fr", gap: 20 }}>
              <div style={panelStyle}>
                <div style={sectionLabelStyle}>プレビュー</div>

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
                      fontWeight: 500,
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

          {tab === "edit" ? (
            <div className="layout-grid" style={{ display: "grid", gridTemplateColumns: "1.15fr 0.85fr", gap: 20 }}>
              <div style={panelStyle}>
                <div style={sectionLabelStyle}>元画像</div>
                <label style={uploadButtonStyle}>
                  画像を選択する
                  <input
                    type="file"
                    accept="image/*"
                    style={{ display: "none" }}
                    onChange={event => {
                      const file = event.target.files?.[0];
                      if (file) {
                        handleEditUpload(file);
                      }
                    }}
                  />
                </label>

                {editSrc ? (
                  <div style={{ marginTop: 14, borderRadius: 10, overflow: "hidden", background: "#000", border: "1px solid rgba(255,255,255,0.08)" }}>
                    <img src={editSrc} alt="編集前" style={{ width: "100%", maxHeight: 360, objectFit: "contain", display: "block" }} />
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
                    画像をアップロードすると、ここにプレビューが表示されます。
                  </div>
                )}

                {editResult ? (
                  <div style={{ marginTop: 20 }}>
                    <div style={{ ...sectionLabelStyle, marginBottom: 10 }}>編集後</div>
                    <div style={{ borderRadius: 10, overflow: "hidden", background: "#000", border: "1px solid rgba(255,255,255,0.08)" }}>
                      <img src={editResult} alt="編集後" style={{ width: "100%", maxHeight: 460, objectFit: "contain", display: "block" }} />
                    </div>
                    <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
                      <a
                        href={editResult}
                        download="grok-edit.jpg"
                        style={{ ...actionButtonStyle, textDecoration: "none", display: "inline-flex", alignItems: "center", justifyContent: "center", flex: 1 }}
                      >
                        ダウンロード
                      </a>
                      <button onClick={() => setEditResult(null)} style={{ ...smallButtonStyle, flex: 1 }}>
                        結果をクリア
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div style={panelStyle}>
                  <div style={sectionLabelStyle}>モデル</div>
                  <div style={{ fontSize: 18, fontWeight: 500, color: "#1a1a1a", marginBottom: 8 }}>Grok Imagine Image Edit</div>
                  <div style={{ fontSize: 12, color: "#4e4a43", lineHeight: 1.7 }}>
                    画像をもとに、プロンプトで背景、質感、明るさ、服装や雰囲気などを編集します。
                  </div>
                </div>

                <div style={panelStyle}>
                  <div style={sectionLabelStyle}>プロンプト</div>
                  <textarea
                    value={editPrompt}
                    onChange={event => setEditPrompt(event.target.value)}
                    rows={5}
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      borderRadius: 8,
                      background: "rgba(0,0,0,0.08)",
                      border: "1px solid #a89e8e",
                      color: "#111",
                      fontSize: 12,
                      fontFamily: "inherit",
                      resize: "vertical",
                    }}
                  />
                </div>

                <div style={panelStyle}>
                  <div style={sectionLabelStyle}>解像度</div>
                  <div style={buttonRowStyle}>
                    {(["1k", "2k"] as EditResolution[]).map(resolution => (
                      <button
                        key={resolution}
                        onClick={() => setEditResolution(resolution)}
                        style={choiceButtonStyle(editResolution === resolution)}
                      >
                        {resolution}
                      </button>
                    ))}
                  </div>
                  <div style={{ marginTop: 8, fontSize: 11, color: "#6a6258" }}>
                    Grok Image Edit — $0.022 / image
                  </div>
                </div>

                <div style={panelStyle}>
                  {editStatus ? (
                    <div
                      style={{
                        marginBottom: 12,
                        fontSize: 12,
                        color: editStatus.includes("失敗") || editStatus.includes("Error") || editStatus.includes("できません") ? "#e06060" : "#4a8a6a",
                        background: "rgba(0,0,0,0.06)",
                        borderRadius: 8,
                        padding: "8px 12px",
                      }}
                    >
                      {editStatus}
                    </div>
                  ) : null}
                  <button
                    onClick={() => void submitEdit()}
                    disabled={!editFile || !editPrompt.trim() || editLoading}
                    style={{
                      ...actionButtonStyle,
                      width: "100%",
                      opacity: !editFile || !editPrompt.trim() || editLoading ? 0.5 : 1,
                      cursor: !editFile || !editPrompt.trim() || editLoading ? "not-allowed" : "pointer",
                    }}
                  >
                    {editLoading ? "編集中..." : "AI編集する"}
                  </button>
                  <button onClick={resetEdit} style={{ ...smallButtonStyle, width: "100%", marginTop: 10 }}>
                    リセット
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {tab === "video" ? (
            <div className="layout-grid" style={{ display: "grid", gridTemplateColumns: "1.15fr 0.85fr", gap: 20 }}>
              <div style={panelStyle}>
                <div style={sectionLabelStyle}>元画像</div>
                <label style={uploadButtonStyle}>
                  画像を選択する
                  <input
                    type="file"
                    accept="image/*"
                    style={{ display: "none" }}
                    onChange={e => e.target.files?.[0] && handleVideoUpload(e.target.files[0])}
                  />
                </label>

                {videoSrc && (
                  <div style={{ marginTop: 14, borderRadius: 10, overflow: "hidden", background: "#000", border: "1px solid rgba(255,255,255,0.08)" }}>
                    <img src={videoSrc} alt="元画像" style={{ width: "100%", maxHeight: 360, objectFit: "contain", display: "block" }} />
                  </div>
                )}

                {videoResult && (
                  <div style={{ marginTop: 20 }}>
                    <div style={{ ...sectionLabelStyle, marginBottom: 10 }}>生成された動画</div>
                    <video
                      src={videoResult}
                      controls
                      autoPlay
                      loop
                      style={{ width: "100%", borderRadius: 10, background: "#000" }}
                    />
                    <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
                      <a
                        href={videoResult}
                        download="video.mp4"
                        style={{ ...actionButtonStyle, textDecoration: "none", display: "inline-flex", alignItems: "center", justifyContent: "center", flex: 1 }}
                      >
                        ダウンロード
                      </a>
                      <button
                        onClick={() => { setVideoResult(null); setVideoStatus(""); }}
                        style={{ ...smallButtonStyle, flex: 1 }}
                      >
                        クリア
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div style={panelStyle}>
                  <div style={sectionLabelStyle}>モデル</div>
                  <div style={buttonRowStyle}>
                    {(["grok", "seedance"] as VideoModel[]).map(id => (
                      <button
                        key={id}
                        onClick={() => {
                          setVideoModel(id);
                          setVideoResolution(id === "grok" ? "720p" : "720p");
                        }}
                        style={choiceButtonStyle(videoModel === id)}
                      >
                        {id === "grok" ? "Grok" : "Seedance 2"}
                      </button>
                    ))}
                  </div>
                  <div style={{ marginTop: 8, fontSize: 11, color: "#6a6258" }}>
                    {videoModel === "grok"
                      ? "xAI Grok Imagine — $0.05/s (480p) · $0.07/s (720p)"
                      : "ByteDance Seedance 2.0 Fast — $0.24/s"}
                  </div>
                </div>

                <div style={panelStyle}>
                  <div style={sectionLabelStyle}>プロンプト</div>
                  <textarea
                    value={videoPrompt}
                    onChange={e => setVideoPrompt(e.target.value)}
                    rows={3}
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      borderRadius: 8,
                      background: "rgba(0,0,0,0.08)",
                      border: "1px solid #a89e8e",
                      color: "#111",
                      fontSize: 12,
                      fontFamily: "inherit",
                      resize: "vertical",
                    }}
                  />
                </div>

                <div style={panelStyle}>
                  <div style={sectionLabelStyle}>尺</div>
                  <div style={buttonRowStyle}>
                    {[5, 10].map(d => (
                      <button key={d} onClick={() => setVideoDuration(d)} style={choiceButtonStyle(videoDuration === d)}>
                        {d}秒
                      </button>
                    ))}
                  </div>
                </div>

                <div style={panelStyle}>
                  <div style={sectionLabelStyle}>解像度</div>
                  <div style={buttonRowStyle}>
                    {["480p", "720p"].map(r => (
                      <button key={r} onClick={() => setVideoResolution(r)} style={choiceButtonStyle(videoResolution === r)}>
                        {r}
                      </button>
                    ))}
                  </div>
                </div>

                <div style={panelStyle}>
                  {videoStatus ? (
                    <div
                      style={{
                        marginBottom: 12,
                        fontSize: 12,
                        color: videoStatus.includes("失敗") || videoStatus.includes("エラー") ? "#e06060" : "#4a8a6a",
                        background: "rgba(0,0,0,0.06)",
                        borderRadius: 8,
                        padding: "8px 12px",
                      }}
                    >
                      {videoStatus}
                    </div>
                  ) : null}
                  <button
                    onClick={() => void submitVideo()}
                    disabled={!videoFile || videoLoading}
                    style={{
                      ...actionButtonStyle,
                      width: "100%",
                      opacity: !videoFile || videoLoading ? 0.5 : 1,
                      cursor: !videoFile || videoLoading ? "not-allowed" : "pointer",
                    }}
                  >
                    {videoLoading ? "生成中..." : "動画を生成する"}
                  </button>
                  <div style={{ marginTop: 8, fontSize: 11, color: "#6a6258", textAlign: "center" }}>
                    推定コスト: ${(videoDuration * (videoModel === "grok" ? (videoResolution === "480p" ? 0.05 : 0.07) : 0.242)).toFixed(2)}
                  </div>
                </div>
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
            <div style={{ fontSize: 14, fontWeight: 500, color: "#f0ece4", marginBottom: 14 }}>比較表示</div>
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
    </div>
  );
}

function PreviewCard({ label, src }: { label: string; src: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ fontSize: 12, fontWeight: 500, color: "#c9a84c" }}>{label}</div>
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
  background: "#d0cabd",
  borderRadius: 8,
  padding: 14,
  border: "1px solid #9f9686",
};

const sectionLabelStyle: CSSProperties = {
  fontSize: 10,
  color: "#444",
  marginBottom: 7,
  letterSpacing: "0.05em",
  fontWeight: 500,
};

const uploadButtonStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  width: "100%",
  padding: "10px 0",
  borderRadius: 8,
  background: "#b0a898",
  border: "1px solid #a89e8e",
  color: "#111",
  fontWeight: 500,
  fontSize: 12,
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
  padding: "8px 0",
  borderRadius: 8,
  background: active ? "rgba(201,168,76,0.3)" : "rgba(0,0,0,0.06)",
  border: active ? "1px solid #c9a84c" : "1px solid #a89e8e",
  color: "#111",
  fontWeight: 500,
  fontSize: 12,
  cursor: "pointer",
});

const actionButtonStyle: CSSProperties = {
  flex: 1,
  padding: "10px 0",
  borderRadius: 8,
  background: "#c9a84c",
  border: "none",
  color: "#071e28",
  fontWeight: 500,
  fontSize: 12,
  cursor: "pointer",
};

const smallButtonStyle: CSSProperties = {
  padding: "8px 10px",
  borderRadius: 8,
  background: "#b0a898",
  border: "1px solid #a89e8e",
  color: "#111",
  fontWeight: 500,
  fontSize: 11,
  cursor: "pointer",
};
