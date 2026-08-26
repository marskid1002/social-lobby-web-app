type IdentifiedUpdate = {
  id: string;
  userId: string;
};

export function updateIdsForUser<T extends IdentifiedUpdate>(updates: T[], userId: string): string[] {
  return updates.filter((update) => update.userId === userId).map((update) => update.id);
}

export function unseenUpdatesForUser<T extends IdentifiedUpdate>(
  updates: T[],
  userId: string,
  seenIds: ReadonlySet<string>,
): T[] {
  return updates.filter((update) => update.userId === userId && !seenIds.has(update.id));
}
