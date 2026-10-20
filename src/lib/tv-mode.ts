export function isTVModeEnabled() {
  return process.env.ENABLE_TV_MODE !== 'false';
}

export function isTVPathname(pathname: string): boolean {
  return pathname === '/tv' || pathname.startsWith('/tv/');
}

/** 按当前路径选择登录页：TV 端走 /tv/login，其余走 /login */
export function resolveLoginPath(pathname: string): string {
  return isTVPathname(pathname) ? '/tv/login' : '/login';
}

/**
 * 是否处在「未登录时本来就该待着」的公开认证页。
 *
 * 这些页免登录，Token 刷新/登出逻辑必须在这里放手 —— 否则未登录的访客一打开
 * 注册页，就会被当作「登录态失效」踢回登录页（表现为 /login?redirect=%2Fregister）。
 * 名字沿用登录页，但语义是「公开认证页」。
 */
export function isLoginPathname(pathname: string): boolean {
  return (
    pathname === '/login' ||
    pathname === '/register' ||
    pathname === '/qr-login' ||
    pathname === '/oidc-register' ||
    pathname === '/tv/login'
  );
}
