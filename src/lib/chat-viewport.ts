export interface ChatViewportInput {
  visualHeight: number;
  visualOffsetTop: number;
  layoutHeight: number;
}

export interface ChatViewportBox {
  height: number;
  offsetTop: number;
}

const MIN_USABLE_CHAT_HEIGHT = 180;

/**
 * Normalizes browser viewport readings before they control the chat frame.
 * Mobile WebKit can briefly report negative offsets, an oversized viewport, or
 * a near-zero height while the software keyboard is animating.
 */
export function resolveChatViewport(input: ChatViewportInput): ChatViewportBox | null {
  if (!Number.isFinite(input.visualHeight) || input.visualHeight <= 0) return null;

  const rawHeight = Math.round(input.visualHeight);
  const rawOffsetTop = Number.isFinite(input.visualOffsetTop)
    ? Math.round(input.visualOffsetTop)
    : 0;
  const reportedLayoutHeight = Number.isFinite(input.layoutHeight) && input.layoutHeight > 0
    ? Math.round(input.layoutHeight)
    : rawHeight;
  const layoutHeight = reportedLayoutHeight;
  const minimumHeight = Math.min(MIN_USABLE_CHAT_HEIGHT, layoutHeight);
  const height = Math.min(layoutHeight, Math.max(minimumHeight, rawHeight));
  const maxOffsetTop = Math.max(0, layoutHeight - height);
  const offsetTop = Math.min(maxOffsetTop, Math.max(0, rawOffsetTop));

  return { height, offsetTop };
}
