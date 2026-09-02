export type RosterSearchable = {
  id: string;
  nickname: string;
};

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
