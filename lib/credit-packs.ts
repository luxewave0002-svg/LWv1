export type TopupPackId = "trial" | "basic" | "standard" | "mega";

export type TopupPack = {
  name: string;
  credits: number;
  amount: number;
  caption: string;
  requiresInviteCode?: boolean;
  freeImageGenerations?: number;
  freeVideoGenerations?: number;
};

export const TRIAL_INVITE_CODE = "lumilumi2026";
export const TRIAL_FREE_IMAGE_GENERATIONS = 10;
export const TRIAL_FREE_VIDEO_GENERATIONS = 3;
export const TRIAL_FREE_CREDITS = 34;

export const TOPUP_PACKS: Record<TopupPackId, TopupPack> = {
  trial: {
    name: "お試し",
    credits: TRIAL_FREE_CREDITS,
    amount: 0,
    caption: "招待コードで無料",
    requiresInviteCode: true,
    freeImageGenerations: TRIAL_FREE_IMAGE_GENERATIONS,
    freeVideoGenerations: TRIAL_FREE_VIDEO_GENERATIONS,
  },
  basic: {
    name: "ベーシック",
    credits: 650,
    amount: 22000,
    caption: "添付プランから20%割安",
  },
  standard: {
    name: "スタンダード",
    credits: 1600,
    amount: 36960,
    caption: "添付プランから20%割安",
  },
  mega: {
    name: "メガ",
    credits: 4800,
    amount: 70400,
    caption: "添付プランから20%割安",
  },
};
