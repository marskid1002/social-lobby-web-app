/**
 * 401 只有在已進入受保護功能後才代表 session 失效。
 * 登入／登出頁本來就可能沒有 session，不能因此再次導向 /logout，
 * 否則會形成 /login -> /logout -> /login 的重新載入循環。
 */
export function shouldRedirectExpiredSession(status: number, pathname: string): boolean {
  if (status !== 401) return false;
  return pathname !== '/login' && pathname !== '/logout';
}
