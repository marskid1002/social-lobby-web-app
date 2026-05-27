import type { MomentPost } from './types';

const now = () => Date.now();
const minsAgo = (m: number) => new Date(now() - m * 60_000).toISOString();

export const momentPosts: MomentPost[] = [
  {
    id: 'mp-007',
    authorId: 'u-004',
    content: '天台夜景配一杯就夠了 🌃 這個城市入夜之後才是真的開始',
    likeCount: 24,
    commentCount: 3,
    createdAt: minsAgo(5),
  },
  {
    id: 'mp-003',
    authorId: 'u-009',
    content: '今晚松山區，心情不錯想出來走走～ 有什麼好地方推薦嗎 ✨',
    likeCount: 15,
    commentCount: 5,
    createdAt: minsAgo(10),
  },
  {
    id: 'mp-001',
    authorId: 'u-002',
    content: '剛訂到信義區一家很難訂的位子，結果朋友臨時不來了 😩 這種事真的太常發生了',
    likeCount: 12,
    commentCount: 3,
    createdAt: minsAgo(25),
  },
  {
    id: 'mp-004',
    authorId: 'u-015',
    content: '終於下班了 😮‍💨 最近壓力很大，好想找個地方放鬆一下',
    likeCount: 6,
    commentCount: 1,
    createdAt: minsAgo(40),
  },
  {
    id: 'mp-002',
    authorId: 'u-005',
    content: '大安區新開了一家調酒吧，音樂選得很棒、氣氛也好 🍸 有機會推薦去',
    likeCount: 8,
    commentCount: 2,
    createdAt: minsAgo(55),
  },
  {
    id: 'mp-009',
    authorId: 'u-007',
    content: '週五晚上最需要的就是這杯 🍹 有同感的舉手',
    likeCount: 31,
    commentCount: 3,
    createdAt: minsAgo(65),
  },
  {
    id: 'mp-005',
    authorId: 'u-003',
    content: '週末的信義區人真的太多了，反而喜歡平日晚上 🌙 安靜很多，適合好好聊天',
    likeCount: 9,
    commentCount: 4,
    createdAt: minsAgo(80),
  },
  {
    id: 'mp-008',
    authorId: 'u-013',
    content: '大安區這家日料今天太神了 🍣 一個人吃有點可惜，下次要找伴一起',
    likeCount: 18,
    commentCount: 2,
    createdAt: minsAgo(95),
  },
  {
    id: 'mp-006',
    authorId: 'u-011',
    content: '第一次喝到這麼順口的威士忌，以前都覺得很難入口 🥃 原來是之前喝到的不夠好',
    likeCount: 11,
    commentCount: 2,
    createdAt: minsAgo(120),
  },
];
