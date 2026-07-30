import type { SessionPayload } from './session';
import { directInvitationThreadId } from './chat-authz';

type Item = { id: string; [key: string]: unknown };
export type ChatDecision = 'confirmed' | 'declined';

export interface DecideChatInput {
  session: SessionPayload;
  invitationId: string;
  decision: ChatDecision;
  invitations: Item[];
  responses: Item[];
  now?: number;
}

export type DecideChatResult =
  | { ok: false; status: 400 | 403 | 404 | 409; error: string }
  | {
      ok: true;
      invitation: Item;
      response?: Item;
      requestId: string;
      threadId: string;
      customerUserId: string;
      alreadyDecided: boolean;
    };

const str = (value: unknown): string =>
  typeof value === 'string' ? value : '';

export function planChatDecision(input: DecideChatInput): DecideChatResult {
  const invitationId = input.invitationId.trim();
  if (!invitationId || invitationId.length > 128) {
    return { ok: false, status: 400, error: 'invalid invitationId' };
  }
  if (input.decision !== 'confirmed' && input.decision !== 'declined') {
    return { ok: false, status: 400, error: 'invalid decision' };
  }
  if (input.session.role !== 'manager') {
    return { ok: false, status: 403, error: 'manager only' };
  }

  const invitation = input.invitations.find((item) => item.id === invitationId);
  if (!invitation) {
    return { ok: false, status: 404, error: 'invitation not found' };
  }
  const managerId = str(invitation.dispatcherId);
  if (!managerId || managerId !== input.session.userId || str(invitation.fromUserId) !== managerId) {
    return { ok: false, status: 403, error: 'forbidden' };
  }
  if (str(invitation.status) !== 'accepted') {
    return { ok: false, status: 409, error: 'chat is not active' };
  }

  const existingDecision = str(invitation.managerDecision);
  if (existingDecision) {
    if (existingDecision !== input.decision) {
      return { ok: false, status: 409, error: 'decision already recorded' };
    }
    return {
      ok: true,
      invitation,
      requestId: str(invitation.requestId),
      threadId: directInvitationThreadId(invitation),
      customerUserId: str(invitation.toUserId),
      alreadyDecided: true,
    };
  }
  if (invitation.meetupConfirmed === true) {
    return { ok: false, status: 409, error: 'chat already confirmed' };
  }
  const now = input.now ?? Date.now();
  const expiresAt = Date.parse(str(invitation.chatExpiresAt));
  if (!Number.isFinite(expiresAt) || now >= expiresAt) {
    return { ok: false, status: 409, error: 'chat expired' };
  }

  const responseId = str(invitation.responseId);
  const storedResponse = responseId
    ? input.responses.find((item) => item.id === responseId)
    : undefined;
  if (!responseId || !storedResponse || str(storedResponse.dispatcherId) !== managerId) {
    return { ok: false, status: 409, error: 'dispatch response not found' };
  }
  const requestId = str(invitation.requestId);
  const threadId = directInvitationThreadId(invitation);
  const customerUserId = str(invitation.toUserId);
  if (!requestId || !threadId || !customerUserId) {
    return { ok: false, status: 409, error: 'invalid dispatch chat' };
  }

  const decidedAt = new Date(now).toISOString();
  const updatedInvitation: Item = {
    ...invitation,
    managerDecision: input.decision,
    managerDecisionBy: managerId,
    managerDecisionAt: decidedAt,
  };
  const updatedResponse = input.decision === 'declined'
    ? { ...storedResponse, responseStatus: 'declined' }
    : storedResponse;

  return {
    ok: true,
    invitation: updatedInvitation,
    response: updatedResponse,
    requestId,
    threadId,
    customerUserId,
    alreadyDecided: false,
  };
}
