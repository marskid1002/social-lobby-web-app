export const TERMS_VERSION = '1.0';

export type TermsBlock =
  | { type: 'paragraph'; text: string }
  | { type: 'list'; lead?: string; items: readonly string[] };

export interface TermsSection {
  title: string;
  blocks: readonly TermsBlock[];
}

export const TERMS_SECTIONS: readonly TermsSection[] = [
  {
    title: '第一章　平台宗旨',
    blocks: [
      { type: 'paragraph', text: '本平台提供聚餐、飯局、酒局、娛樂活動及其他合法社交活動之資訊媒合服務。' },
      { type: 'paragraph', text: '平台僅提供資訊刊登、搜尋及聯繫功能，不介入會員間之聊天、交易、付款、活動安排或其他私人約定。' },
      { type: 'paragraph', text: '平台不經營、不仲介、不安排任何違法行為。' },
    ],
  },
  {
    title: '第二章　會員資格',
    blocks: [
      {
        type: 'list',
        lead: '會員須符合以下條件：',
        items: ['年滿十八歲。', '使用真實資料完成註冊。', '同意本平台所有規章。'],
      },
      { type: 'paragraph', text: '平台得要求會員完成身分驗證。' },
    ],
  },
  {
    title: '第三章　平台服務內容',
    blocks: [
      {
        type: 'list',
        lead: '平台提供：',
        items: ['發布聚會需求', '發布可參與活動資訊', '搜尋活動', '即時媒合', '聯絡雙方'],
      },
      {
        type: 'list',
        lead: '平台不提供：',
        items: ['價格議定', '強制配對', '收付款服務（除平台另行公告者）', '人身保證', '行程安排'],
      },
    ],
  },
  {
    title: '第四章　禁止事項',
    blocks: [
      {
        type: 'list',
        lead: '會員不得：',
        items: [
          '從事任何違法行為。',
          '利用平台進行詐騙。',
          '散布色情、暴力或違法內容。',
          '騷擾、威脅或恐嚇他人。',
          '偷拍、跟蹤、非法錄音錄影。',
          '假冒他人。',
          '販售違禁物品。',
          '發布不實資訊。',
          '惡意爽約。',
          '洩漏他人個資。',
        ],
      },
      { type: 'paragraph', text: '平台有權立即停權。' },
    ],
  },
  {
    title: '第五章　見面原則',
    blocks: [
      { type: 'paragraph', text: '所有聚會均由雙方自由決定。' },
      {
        type: 'list',
        lead: '平台不保證：',
        items: ['一定有人接受邀約。', '一定見面成功。', '活動品質。', '雙方身份真實程度（除完成官方驗證者）。'],
      },
      { type: 'paragraph', text: '會員應自行判斷風險。' },
    ],
  },
  {
    title: '第六章　付款原則',
    blocks: [
      {
        type: 'list',
        lead: '雙方若自行約定：',
        items: ['AA制', '男方請客', '女方請客', '其他付款方式'],
      },
      { type: 'paragraph', text: '均屬雙方自行協議。' },
      { type: 'paragraph', text: '平台不介入任何費用糾紛。' },
    ],
  },
  {
    title: '第七章　安全守則',
    blocks: [
      {
        type: 'list',
        lead: '建議會員：',
        items: [
          '初次見面選擇公開場所。',
          '告知親友所在地點。',
          '不飲用來源不明飲品。',
          '不提供金融帳號。',
          '不提前匯款。',
          '保護個人隱私。',
        ],
      },
    ],
  },
  {
    title: '第八章　信用制度',
    blocks: [
      { type: 'paragraph', text: '平台建立信用評分。' },
      {
        type: 'list',
        lead: '可能扣分原因：',
        items: ['爽約', '遲到', '惡意取消', '被多人檢舉', '不禮貌', '發布不實資訊'],
      },
      {
        type: 'list',
        lead: '信用過低者：',
        items: ['降低曝光', '暫停媒合', '永久停權'],
      },
    ],
  },
  {
    title: '第九章　檢舉制度',
    blocks: [
      {
        type: 'list',
        lead: '可檢舉：',
        items: ['詐騙', '騷擾', '假帳號', '暴力', '不實照片', '不雅內容', '惡意放鳥'],
      },
      { type: 'paragraph', text: '平台將進行審查。' },
    ],
  },
  {
    title: '第十章　停權標準',
    blocks: [
      {
        type: 'list',
        lead: '立即永久停權情形：',
        items: ['詐騙', '暴力', '恐嚇', '散布個資', '假冒身分', '多次違規', '經司法認定之重大違法行為'],
      },
    ],
  },
  {
    title: '第十一章　責任限制',
    blocks: [
      { type: 'paragraph', text: '平台僅提供資訊媒合服務。' },
      { type: 'paragraph', text: '會員之聊天、見面、付款、聚餐、飲酒、交通、住宿及其他私人約定，均由雙方自行決定並自行負責。' },
      { type: 'paragraph', text: '平台非任何一方代理人，亦不保證會員之行為、安全或信用。' },
    ],
  },
  {
    title: '第十二章　隱私保護',
    blocks: [
      { type: 'paragraph', text: '平台依隱私政策處理會員資料。' },
      { type: 'paragraph', text: '除依法令要求或主管機關合法要求外，不會任意揭露會員資料。' },
    ],
  },
  {
    title: '第十三章　條款修改',
    blocks: [
      { type: 'paragraph', text: '平台得視營運需要修訂本條款。' },
      { type: 'paragraph', text: '最新版本公告後即生效。' },
      { type: 'paragraph', text: '會員繼續使用平台，即視為同意修訂內容。' },
    ],
  },
];

export interface RegistrationConsentInput {
  termsAccepted?: unknown;
  termsVersion?: unknown;
  ageConfirmed?: unknown;
}

export function registrationConsentError(input: RegistrationConsentInput): string | null {
  if (input.ageConfirmed !== true) return '請確認已年滿 18 歲';
  if (input.termsAccepted !== true) return '請先閱讀並同意平台服務條款暨使用規章';
  if (input.termsVersion !== TERMS_VERSION) return '平台規範版本已更新，請重新閱讀並同意';
  return null;
}
