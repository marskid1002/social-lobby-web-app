import { activeConfirmedGirlIds } from './request-attendance';
import { directInvitationThreadId } from './chat-authz';

type Item = { id: string; [key: string]: unknown };

export interface AdminAccountSummary {
  key: string;
  accountRef?: string;
  role: string;
  tier: string;
  userId: string;
  nickname: string;
  hasPassword: boolean;
  disabled: boolean;
  archived?: boolean;
  hasActivationCode?: boolean;
  activationCreatedAt?: string;
  createdAt: string;
}

export interface AdminFlowStep {
  key: 'created' | 'responded' | 'accepted' | 'chat' | 'message';
  label: string;
  state: 'done' | 'waiting' | 'error';
  at?: string;
}

export interface AdminFlow {
  requestId: string;
  creatorId: string;
  creatorName: string;
  area: string;
  requestType: string;
  requestTypes: string[];
  venueType: string;
  partyFormat: string;
  peopleCount: number;
  note: string;
  status: string;
  createdAt: string;
  expiresAt: string;
  responseCount: number;
  joiningCount: number;
  chatCount: number;
  messageCount: number;
  health: 'healthy' | 'waiting' | 'error';
  issue: string;
  steps: AdminFlowStep[];
  escortStatuses: AdminEscortStatus[];
}

// declined：幹部在聊天室回報「約會未成立」（invitation.managerDecision）
// customer_declined：客戶婉拒或取消已接受的人選（response.responseStatus，只有局主能設）
// 兩者原因相反——前者問題在幹部端，後者是客戶不選——故分開，不可再併回同一個狀態。
export type AdminEscortStage =
  | 'waiting' | 'on_stage' | 'active' | 'declined' | 'customer_declined' | 'ended' | 'withdrawn';

export interface AdminEscortStatus {
  responseId: string;
  escortId: string;
  escortName: string;
  managerId: string;
  managerName: string;
  stage: AdminEscortStage;
  createdAt: string;
  updatedAt: string;
}

export interface AdminConversationSummary {
  key: string;
  threadId: string;
  requestId: string | null;
  participants: string[];
  participantNames: string[];
  messageCount: number;
  lastAt: string;
  lastPreview: string;
}

export interface AdminDashboard {
  overview: {
    accounts: number;
    customers: number;
    managers: number;
    escorts: number;
    disabledAccounts: number;
    openRequests: number;
    activeChats: number;
    messages: number;
    pendingReports: number;
    brokenFlows: number;
  };
  flows: AdminFlow[];
  conversations: AdminConversationSummary[];
}

export interface AdminRosterMember {
  id: string;
  nickname: string;
  createdAt: string;
  removed: boolean;
  status: 'online' | 'offline' | 'busy' | 'removed';
}

export interface AdminManagerRoster {
  managerId: string;
  activeCount: number;
  removedCount: number;
  totalCreated: number;
  members: AdminRosterMember[];
}

const text = (value: unknown): string =>
  typeof value === 'string' ? value : '';

const dateMs = (value: unknown): number => {
  const parsed = Date.parse(text(value));
  return Number.isFinite(parsed) ? parsed : 0;
};

const byOldest = (a: Item, b: Item): number =>
  dateMs(a.createdAt) - dateMs(b.createdAt);

const accountName = (accounts: AdminAccountSummary[], userId: string): string =>
  accounts.find((account) => account.userId === userId)?.nickname || userId;

export function buildAdminEscortStatuses(input: {
  accounts: AdminAccountSummary[];
  escorts: Item[];
  responses: Item[];
  invitations: Item[];
  requestId: string;
  threadId?: string;
}): AdminEscortStatus[] {
  const invitations = input.invitations.filter((invitation) => {
    if (text(invitation.requestId) !== input.requestId) return false;
    if (!input.threadId) return true;
    return text(invitation.groupThreadId) === input.threadId
      || directInvitationThreadId(invitation) === input.threadId;
  });
  const responseIds = new Set(invitations.map((invitation) => text(invitation.responseId)).filter(Boolean));
  const dispatcherIds = new Set(invitations.map((invitation) => text(invitation.dispatcherId)).filter(Boolean));
  const isGroup = input.threadId === `g-${input.requestId}`;

  return input.responses
    .filter((response) => text(response.requestId) === input.requestId)
    .filter((response) => !input.threadId
      || isGroup
      || responseIds.has(response.id)
      || (responseIds.size === 0 && dispatcherIds.has(text(response.dispatcherId))))
    .map((response): AdminEscortStatus => {
      const invitation = invitations.find((item) => text(item.responseId) === response.id)
        ?? invitations.find((item) => text(item.dispatcherId) === text(response.dispatcherId));
      const escortId = text(response.userId);
      const escort = input.escorts.find((item) => item.id === escortId);
      const managerId = text(response.dispatcherId) || text(invitation?.dispatcherId);
      const managerDecision = text(invitation?.managerDecision);
      const responseStatus = text(response.responseStatus);
      const stage: AdminEscortStage = text(invitation?.meetupEndedAt)
        ? 'ended'
        : managerDecision === 'declined'
          ? 'declined'
          : managerDecision === 'confirmed' || invitation?.meetupConfirmed === true
            ? 'active'
            : responseStatus === 'joining'
              ? 'on_stage'
              : responseStatus === 'withdrawn'
                ? 'withdrawn'
                : responseStatus === 'declined'
                  ? 'customer_declined' // 客戶婉拒／取消已接受，非幹部回報失敗
                  : 'waiting';
      return {
        responseId: response.id,
        escortId,
        escortName: text(escort?.nickname) || escortId || '未知小姐',
        managerId,
        managerName: managerId ? accountName(input.accounts, managerId) : '自行報名',
        stage,
        createdAt: text(response.createdAt),
        updatedAt: text(invitation?.meetupEndedAt)
          || text(invitation?.managerDecisionAt)
          || text(invitation?.respondedAt)
          || text(response.createdAt),
      };
    })
    .sort((a, b) => dateMs(a.createdAt) - dateMs(b.createdAt));
}

export function buildAdminManagerRosters(input: {
  accounts: AdminAccountSummary[];
  escorts: Item[];
  presence: Item[];
  responses: Item[];
  invitations: Item[];
  now?: number;
}): AdminManagerRoster[] {
  const busyIds = activeConfirmedGirlIds(input.responses, input.invitations, input.now);
  const onlineById = new Map(
    input.presence.map((item) => [item.id, item.online === true]),
  );

  return input.accounts
    .filter((account) => account.role === 'manager')
    .map((account) => {
      const members = input.escorts
        .filter((escort) => text(escort.managerId) === account.userId && escort.removed !== true)
        .sort(byOldest)
        .map((escort): AdminRosterMember => {
          const removed = false;
          const status = busyIds.has(escort.id)
              ? 'busy'
              : onlineById.get(escort.id)
                ? 'online'
                : 'offline';
          return {
            id: escort.id,
            nickname: text(escort.nickname) || escort.id,
            createdAt: text(escort.createdAt),
            removed,
            status,
          };
        });
      return {
        managerId: account.userId,
        activeCount: members.length,
        removedCount: 0,
        totalCreated: members.length,
        members,
      };
    });
}

export function buildAdminDashboard(input: {
  accounts: AdminAccountSummary[];
  escorts?: Item[];
  reports: Array<{ resolved?: boolean }>;
  requests: Item[];
  responses: Item[];
  invitations: Item[];
  chatMessages: Item[];
  now?: number;
}): AdminDashboard {
  const now = input.now ?? Date.now();
  const messagesByRequest = new Map<string, Item[]>();
  for (const message of input.chatMessages) {
    const requestId = text(message.requestId);
    if (!requestId) continue;
    const list = messagesByRequest.get(requestId) ?? [];
    list.push(message);
    messagesByRequest.set(requestId, list);
  }

  const flows: AdminFlow[] = input.requests.map((request) => {
    const requestId = request.id;
    const responses = input.responses
      .filter((response) => response.requestId === requestId)
      .sort(byOldest);
    const joining = responses.filter((response) => response.responseStatus === 'joining');
    const invitations = input.invitations
      .filter((invitation) => invitation.requestId === requestId)
      .sort(byOldest);
    const accepted = invitations.filter((invitation) => invitation.status === 'accepted');
    const messages = (messagesByRequest.get(requestId) ?? []).sort(byOldest);
    const activeAccepted = accepted.filter((invitation) =>
      invitation.meetupConfirmed !== true
      && invitation.managerDecision !== 'declined'
      && dateMs(invitation.chatExpiresAt) >= now
    );
    const acceptedMissingExpiry = accepted.filter((invitation) =>
      invitation.meetupConfirmed !== true
      && invitation.managerDecision !== 'declined'
      && dateMs(invitation.chatExpiresAt) === 0
    );
    const acceptedConfirmed = accepted.filter((invitation) =>
      invitation.meetupConfirmed === true || invitation.managerDecision === 'declined'
    );

    let health: AdminFlow['health'] = 'waiting';
    let issue = '等待幹部安排或使用者加入';
    if (joining.length > 0 && accepted.length === 0) {
      health = 'error';
      issue = '已有同意入局紀錄，但聊天室尚未建立';
    } else if (acceptedMissingExpiry.length > 0) {
      health = 'error';
      issue = '聊天室缺少有效期限';
    } else if (accepted.length > 0 && activeAccepted.length === 0) {
      health = 'healthy';
      issue = acceptedConfirmed.length === accepted.length
        ? '聊天室已結案'
        : '聊天室已正常到期';
    } else if (accepted.length > 0 && messages.length === 0) {
      issue = '聊天室已建立，尚未有訊息';
    } else if (messages.length > 0) {
      health = 'healthy';
      issue = '流程正常';
    } else if (responses.length > 0) {
      issue = '已有回應，等待客戶同意';
    }

    const responseAt = responses[0]?.createdAt;
    const acceptedAt = joining[0]?.createdAt;
    const chatAt = accepted[0]?.respondedAt || accepted[0]?.createdAt;
    const messageAt = messages[0]?.createdAt;
    const steps: AdminFlowStep[] = [
      { key: 'created', label: '客戶發局', state: 'done', at: text(request.createdAt) },
      {
        key: 'responded',
        label: '收到加入／派工',
        state: responses.length > 0 ? 'done' : 'waiting',
        at: text(responseAt),
      },
      {
        key: 'accepted',
        label: '客戶同意入局',
        state: joining.length > 0 ? 'done' : 'waiting',
        at: text(acceptedAt),
      },
      {
        key: 'chat',
        label: '伺服器建立聊天室',
        state: joining.length > 0 && accepted.length === 0
          ? 'error'
          : accepted.length > 0 ? 'done' : 'waiting',
        at: text(chatAt),
      },
      {
        key: 'message',
        label: '第一則訊息',
        state: messages.length > 0 ? 'done' : 'waiting',
        at: text(messageAt),
      },
    ];

    return {
      requestId,
      creatorId: text(request.creatorId),
      creatorName: accountName(input.accounts, text(request.creatorId)),
      area: text(request.area),
      requestType: text(request.requestType),
      requestTypes: Array.isArray(request.requestTypes)
        ? request.requestTypes.filter((value): value is string => typeof value === 'string')
        : [],
      venueType: text(request.venueType),
      partyFormat: text(request.partyFormat),
      peopleCount: typeof request.peopleCount === 'number' ? request.peopleCount : 0,
      note: text(request.note),
      status: text(request.status),
      createdAt: text(request.createdAt),
      expiresAt: text(request.expiresAt),
      responseCount: responses.length,
      joiningCount: joining.length,
      chatCount: accepted.length,
      messageCount: messages.length,
      health,
      issue,
      steps,
      escortStatuses: buildAdminEscortStatuses({
        accounts: input.accounts,
        escorts: input.escorts ?? [],
        responses: input.responses,
        invitations: input.invitations,
        requestId,
      }),
    };
  }).sort((a, b) => dateMs(b.createdAt) - dateMs(a.createdAt));

  const conversationGroups = new Map<string, Item[]>();
  for (const message of input.chatMessages) {
    const threadId = text(message.threadId);
    if (!threadId) continue;
    const requestId = text(message.requestId);
    const key = `${threadId}\u0000${requestId}`;
    const list = conversationGroups.get(key) ?? [];
    list.push(message);
    conversationGroups.set(key, list);
  }
  for (const invitation of input.invitations) {
    if (invitation.status !== 'accepted') continue;
    const requestId = text(invitation.requestId);
    const threadId = text(invitation.groupThreadId) || directInvitationThreadId(invitation);
    if (!threadId) continue;
    const key = `${threadId}\u0000${requestId}`;
    if (!conversationGroups.has(key)) conversationGroups.set(key, []);
  }
  const conversations = [...conversationGroups.entries()].map(([key, messages]) => {
    messages.sort(byOldest);
    const last = messages[messages.length - 1];
    const separator = key.indexOf('\u0000');
    const threadId = key.slice(0, separator);
    const requestId = key.slice(separator + 1) || null;
    const relatedInvitations = input.invitations.filter((invitation) =>
      text(invitation.requestId) === (requestId ?? '')
      && (text(invitation.groupThreadId) === threadId || directInvitationThreadId(invitation) === threadId)
    );
    const participants = [...new Set([
      ...messages.map((message) => text(message.senderId)),
      ...relatedInvitations.flatMap((invitation) => [
        text(invitation.fromUserId),
        text(invitation.toUserId),
      ]),
    ].filter(Boolean))];
    const lastInvitation = relatedInvitations.sort(byOldest).at(-1);
    return {
      key,
      threadId,
      requestId,
      participants,
      participantNames: participants.map((userId) => accountName(input.accounts, userId)),
      messageCount: messages.length,
      lastAt: text(last?.createdAt) || text(lastInvitation?.respondedAt) || text(lastInvitation?.createdAt),
      // 首頁只提供摘要 metadata；實際文字與圖片 URL 必須等 A000 點開後再取。
      lastPreview: last?.imageUrl ? '[照片]' : last ? '文字訊息' : '尚無聊天訊息',
    };
  }).sort((a, b) => dateMs(b.lastAt) - dateMs(a.lastAt));

  const activeChats = input.invitations.filter((invitation) =>
    invitation.status === 'accepted'
    && invitation.meetupConfirmed !== true
    && invitation.managerDecision !== 'declined'
    && dateMs(invitation.chatExpiresAt) >= now
  ).length;

  return {
    overview: {
      accounts: input.accounts.length,
      customers: input.accounts.filter((account) => account.role === 'user').length,
      managers: input.accounts.filter((account) => account.role === 'manager').length,
      escorts: (input.escorts ?? []).filter((escort) => escort.removed !== true).length,
      disabledAccounts: input.accounts.filter((account) => account.disabled).length,
      openRequests: input.requests.filter((request) =>
        request.status === 'open' && dateMs(request.expiresAt) >= now
      ).length,
      activeChats,
      messages: input.chatMessages.length,
      pendingReports: input.reports.filter((report) => !report.resolved).length,
      brokenFlows: flows.filter((flow) => flow.health === 'error').length,
    },
    flows,
    conversations,
  };
}
