export const SNAPSHOT_ID = "feishu-card-json-v2-2026-09-20-r2" as const;

export const HEADER_THEMES = [
  "blue",
  "wathet",
  "turquoise",
  "green",
  "yellow",
  "orange",
  "red",
  "carmine",
  "violet",
  "purple",
  "indigo",
  "grey",
  "default",
] as const;

export const SUPPORTED_ICON_TOKENS = [
  "done_outlined",
  "close_outlined",
  "add_outlined",
  "edit_outlined",
  "delete-trash_outlined",
  "search_outlined",
  "setting_outlined",
  "info_outlined",
  "warning_outlined",
  "time_outlined",
  "calendar_outlined",
  "calendar-add_outlined",
  "member_outlined",
  "group_outlined",
  "chat_outlined",
  "mail_outlined",
  "link-copy_outlined",
  "share_outlined",
  "download_outlined",
  "bell_outlined",
  "pin_outlined",
  "attachment_outlined",
  "approval_outlined",
  "calendar_colorful",
  "todo_colorful",
  "vote_colorful",
  "file-lark-minutes_colorful",
  "wiki-bitable_colorful",
  "file-form_colorful",
  "larkcommunity_colorful",
  "hirelogo_colorful",
  "lark-logo_colorful",
  "meego_colorful",
  "myai_colorful",
  "apaas_colorful",
  "approval_colorful",
  "ai-common_colorful",
] as const;

export type SupportedIconToken = (typeof SUPPORTED_ICON_TOKENS)[number];

const COLOR_FAMILIES = [
  "blue",
  "carmine",
  "green",
  "indigo",
  "lime",
  "orange",
  "purple",
  "red",
  "sunflower",
  "turquoise",
  "violet",
  "wathet",
  "yellow",
] as const;

const COLOR_STEPS = [
  "50",
  "100",
  "200",
  "300",
  "350",
  "400",
  "500",
  "600",
  "700",
  "800",
  "900",
] as const;

const GREY_STEPS = [
  "00",
  "50",
  "100",
  "200",
  "300",
  "350",
  "400",
  "500",
  "600",
  "650",
  "700",
  "800",
  "900",
  "950",
  "1000",
] as const;

export const BUILT_IN_COLORS = [
  ...COLOR_FAMILIES,
  ...COLOR_FAMILIES.flatMap((family) =>
    COLOR_STEPS.map((step) => `${family}-${step}`),
  ),
  "grey",
  ...GREY_STEPS.map((step) => `grey-${step}`),
  "white",
  "bg-white",
] as const;

export const BUILT_IN_TEXT_SIZES = [
  "heading-0",
  "heading-1",
  "heading-2",
  "heading-3",
  "heading-4",
  "normal",
  "notation",
] as const;

export const TAG_COLORS = [
  "neutral",
  "blue",
  "turquoise",
  "lime",
  "orange",
  "violet",
  "indigo",
  "wathet",
  "green",
  "yellow",
  "red",
  "purple",
  "carmine",
] as const;

export function isBuiltInColor(value: string): boolean {
  return (BUILT_IN_COLORS as readonly string[]).includes(value);
}

export function isBuiltInTextSize(value: string): boolean {
  return (BUILT_IN_TEXT_SIZES as readonly string[]).includes(value);
}
