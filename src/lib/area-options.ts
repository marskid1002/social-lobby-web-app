export const AREA_OPTIONS = {
  台北市: [
    '中正區',
    '大同區',
    '中山區',
    '松山區',
    '大安區',
    '萬華區',
    '信義區',
    '士林區',
    '北投區',
    '內湖區',
    '南港區',
    '文山區',
  ],
  新北市: [
    '板橋區',
    '三重區',
    '中和區',
    '永和區',
    '新莊區',
    '新店區',
    '樹林區',
    '鶯歌區',
    '三峽區',
    '淡水區',
    '汐止區',
    '瑞芳區',
    '土城區',
    '蘆洲區',
    '五股區',
    '泰山區',
    '林口區',
    '深坑區',
    '石碇區',
    '坪林區',
    '三芝區',
    '石門區',
    '八里區',
    '平溪區',
    '雙溪區',
    '貢寮區',
    '金山區',
    '萬里區',
    '烏來區',
  ],
} as const;

export type AreaCity = keyof typeof AREA_OPTIONS;

export const AREA_CITIES = Object.keys(AREA_OPTIONS) as AreaCity[];

const LEGACY_AREA_CITY: Record<string, AreaCity> = {
  西門町: '台北市',
};

export function cityForArea(area: string): AreaCity {
  for (const city of AREA_CITIES) {
    if ((AREA_OPTIONS[city] as readonly string[]).includes(area)) return city;
  }
  return LEGACY_AREA_CITY[area] ?? '台北市';
}
