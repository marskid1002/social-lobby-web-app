import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// 發局分類欄位的共用顯示開關；資料與舊局相容邏輯維持不變。
export const SHOW_REQUEST_CLASSIFICATION = true;

export const REQUEST_TYPE_LABELS: Record<string, string> = {
  after_party: 'After Party',
  drinking: '喝酒',
  fill_spot: '補位',
  last_minute: '臨時約會',
  music: '音樂',
  dancing: '跳舞',
  private_party: '私人派對',
  dining: '吃飯',
  other: '其他',
};

export const VENUE_TYPE_LABELS: Record<string, string> = {
  nightclub: '夜店',
  clubhouse: '會所',
  home: '住家',
  bar: '酒吧',
  motel: '汽旅',
};

export const PARTY_FORMAT_LABELS: Record<string, string> = {
  with_women: '局有女',
  without_women: '局無女',
  one_on_one: '1 對 1',
};

// Deterministic gradient per request — hashes the ID to one of 6 subtle palettes
// all within the sky/pink/lavender/mint/peach/lilac family
const REQUEST_GRADIENTS = [
  'linear-gradient(135deg, #8BD8F1 0%, #b8e8f7 100%)',        // sky blue
  'linear-gradient(135deg, #F7BEF1 0%, #fad4f8 100%)',        // pink
  'linear-gradient(135deg, #DED9E5 0%, #ece8f2 100%)',        // lavender
  'linear-gradient(135deg, #a8e6cf 0%, #c8f0df 100%)',        // mint
  'linear-gradient(135deg, #ffd3b6 0%, #ffe8d6 100%)',        // peach
  'linear-gradient(135deg, #c9b8f0 0%, #ddd0f8 100%)',        // lilac
];

const REQUEST_ACCENT_COLORS = [
  '#8BD8F1',  // sky
  '#F7BEF1',  // pink
  '#DED9E5',  // lavender
  '#a8e6cf',  // mint
  '#ffd3b6',  // peach
  '#c9b8f0',  // lilac
];

function hashId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = (h * 31 + id.charCodeAt(i)) >>> 0;
  }
  return h;
}

export function getRequestGradient(requestId: string): string {
  return REQUEST_GRADIENTS[hashId(requestId) % REQUEST_GRADIENTS.length];
}

export function getRequestAccentColor(requestId: string): string {
  return REQUEST_ACCENT_COLORS[hashId(requestId) % REQUEST_ACCENT_COLORS.length];
}
