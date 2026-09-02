export type RosterSearchable = {
  id: string;
  nickname: string;
};

export type DispatchRosterFilter = 'all' | 'available' | 'selected';

export function normalizeRosterSearch(value: string): string {
  return value.trim().toLocaleLowerCase('zh-TW');
}

/**
 * 僅搜尋幹部畫面已經先依 managerId 限定的本人名單。
 * 刻意只比對顯示名稱與人員編號，不把電話或其他敏感欄位納入搜尋。
 */
export function filterRosterBySearch<T extends RosterSearchable>(members: T[], rawQuery: string): T[] {
  const query = normalizeRosterSearch(rawQuery);
  if (!query) return members;

  return members.filter((member) => (
    normalizeRosterSearch(member.nickname).includes(query)
    || normalizeRosterSearch(member.id).includes(query)
  ));
}

export function filterDispatchRoster<T extends RosterSearchable>(
  members: T[],
  rawQuery: string,
  filter: DispatchRosterFilter,
  selectedIds: ReadonlySet<string>,
  unavailableIds: ReadonlySet<string>,
): T[] {
  const searched = filterRosterBySearch(members, rawQuery);
  if (filter === 'selected') return searched.filter((member) => selectedIds.has(member.id));
  if (filter === 'available') return searched.filter((member) => !unavailableIds.has(member.id));
  return searched;
}

export function countHiddenSelections(selectedIds: string[], visibleMembers: RosterSearchable[]): number {
  const visibleIds = new Set(visibleMembers.map((member) => member.id));
  return selectedIds.filter((id) => !visibleIds.has(id)).length;
}
