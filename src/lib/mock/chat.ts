import type { ChatMessage } from './types';

// Pre-seeded chat thread between u-001 (current demo user) and u-002 (王小美)
// threadId = "u-001-u-002" (sorted alphabetically)
export const seedChatMessages: ChatMessage[] = [
  {
    id: 'cm-001',
    threadId: 'u-001-u-002',
    senderId: 'u-002',
    text: '嘿！看到你的邀請了，謝謝你～ 你今晚真的要去信義區喝一杯嗎？',
    createdAt: '2025-11-08T20:12:00.000Z',
  },
  {
    id: 'cm-002',
    threadId: 'u-001-u-002',
    senderId: 'u-001',
    text: '對啊！朋友臨時有事不來了，本來訂了ATT 4 Fun附近的小酒館，一個人去感覺怪怪的 哈哈',
    createdAt: '2025-11-08T20:13:30.000Z',
  },
  {
    id: 'cm-003',
    threadId: 'u-001-u-002',
    senderId: 'u-002',
    text: '哇那剛好！我今晚原本也沒什麼計畫，是哪一間？我對那一帶還蠻熟的',
    createdAt: '2025-11-08T20:14:15.000Z',
  },
  {
    id: 'cm-004',
    threadId: 'u-001-u-002',
    senderId: 'u-001',
    text: '是松菸旁邊一間叫 Sidebar 的地方，有在 Google Maps 上標 4.5 顆星，你知道嗎？',
    createdAt: '2025-11-08T20:15:00.000Z',
  },
  {
    id: 'cm-005',
    threadId: 'u-001-u-002',
    senderId: 'u-002',
    text: '知道知道！那裡調酒不錯，mood 也很好，週五人不會太多。我大概幾點要去？',
    createdAt: '2025-11-08T20:16:20.000Z',
  },
  {
    id: 'cm-006',
    threadId: 'u-001-u-002',
    senderId: 'u-001',
    text: '大概 9 點到，你方便嗎？ btw 你住哪一區？要不要一起搭 Uber 過去？',
    createdAt: '2025-11-08T20:17:45.000Z',
  },
  {
    id: 'cm-007',
    threadId: 'u-001-u-002',
    senderId: 'u-002',
    text: '我在大安區，9 點沒問題！一起搭也好啊，比較不無聊 😄 你要幾點出發？',
    createdAt: '2025-11-08T20:19:00.000Z',
  },
  {
    id: 'cm-008',
    threadId: 'u-001-u-002',
    senderId: 'u-001',
    text: '差不多 8:40 從忠孝復興站出發好了，我去那邊等你，Uber 一起叫？',
    createdAt: '2025-11-08T20:20:30.000Z',
  },
  {
    id: 'cm-009',
    threadId: 'u-001-u-002',
    senderId: 'u-002',
    text: '好呀！那等一下 8:40 我出門，到了打給你。今晚要好好喝一杯 🥂',
    createdAt: '2025-11-08T20:21:10.000Z',
  },
  {
    id: 'cm-010',
    threadId: 'u-001-u-002',
    senderId: 'u-001',
    text: '太好了！期待～ 晚點見！',
    createdAt: '2025-11-08T20:21:55.000Z',
  },
];
