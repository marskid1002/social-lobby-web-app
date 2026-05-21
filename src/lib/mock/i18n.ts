// All zh-Hant strings used in the prototype. Single source of truth.
// (We're not setting up real i18n — just centralizing copy so it's easy to edit.)

export const t = {
  // Brand / app
  appName: 'Social Lobby',
  tagline: '今晚一起出去吧',

  // Login
  loginCta: '使用 LINE 登入',
  loginSub: '一鍵登入，馬上找人一起出去',

  // Onboarding
  onboardingTitle: '完成設定',
  onboardingNickname: '暱稱',
  onboardingArea: '所在區域',
  onboardingBio: '簡短自我介紹（選填）',
  onboardingFollowOA: '加入官方 LINE 帳號接收通知',
  onboardingContinue: '繼續',

  // Bottom nav
  navLobby: '首頁',
  navRequests: '需求',
  navPost: '發布',
  navInbox: '收件匣',
  navUpdates: '動態',

  // Lobby tabs
  tabFollowing: '關注',
  tabExplore: '探索',
  tabNearby: '附近',

  // Status
  statusAvailable: '可接局',
  statusFillSpot: '可補位',
  statusBringPeople: '可帶人',
  statusBusy: '忙碌',
  imOnline: '我在線',
  imOffline: '我離線',
  goOnline: '上線',
  goOffline: '下線',

  // Request types
  typeAfterParty: 'After Party',
  typeDrinking: '喝一杯',
  typeFillSpot: '補位',
  typeLastMinute: '臨時局',
  typeOther: '其他',

  // Buttons
  btnView: '查看',
  btnInvite: '邀請',
  btnFollow: '關注',
  btnFollowing: '已關注',
  btnUnfollow: '取消關注',
  btnBlock: '封鎖',
  btnReport: '檢舉',
  btnSendRequest: '發送需求',
  btnRespond: '我想加入',
  btnInterested: '我有興趣',
  btnClose: '關閉需求',
  btnCancel: '取消',
  btnConfirm: '確認',
  btnSave: '儲存',
  btnEdit: '編輯',
  btnSettings: '設定',
  btnLogout: '登出',

  // Forms — Post Request
  postTitle: '發布需求',
  fieldArea: '區域',
  fieldType: '類型',
  fieldPeopleCount: '人數',
  fieldNote: '備註',
  notePlaceholder: '說明你想找的人或場合...',

  // Empty states
  emptyFollowing: '你還沒關注任何人',
  emptyFollowingCta: '到探索找人',
  emptyNearby: '附近還沒有人在線',
  emptyInbox: '收件匣是空的',
  emptyInboxCta: '發布你的第一個需求',
  emptyUpdates: '目前沒有動態',
  emptyRequests: '目前沒有公開需求',

  // Toasts
  toastInviteSent: '邀請已送出',
  toastRequestPosted: '需求已發送',
  toastResponseSent: '已表示興趣',
  toastBlocked: '已封鎖',
  toastFollowed: '已關注',
  toastUnfollowed: '已取消關注',
  toastOnline: '你已上線',
  toastOffline: '你已下線',
  toastReset: '示範資料已重置',

  // Drawer
  drawerMyProfile: '我的個人檔案',
  drawerMyRequests: '我的需求',
  drawerBlocked: '封鎖名單',
  drawerSettings: '設定',
  drawerResetDemo: '重置示範',

  // Misc
  lastOnline: '最後在線',
  bio: '個人介紹',
  interests: '興趣',
  area: '區域',
  online: '在線',
  offline: '離線',
  responders: '回應的人',
  invitees: '受邀者',
  requestDetails: '需求詳情',
  myRequests: '我的需求',
  invitesReceived: '收到的邀請',
  responsesReceived: '收到的回應',
};

export type UICopy = typeof t;
