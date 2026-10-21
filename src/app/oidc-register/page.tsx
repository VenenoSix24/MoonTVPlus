'use client';

import { useRouter } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';

import { CURRENT_VERSION } from '@/lib/version';

import { useSite } from '@/components/SiteProvider';
import { ThemeToggle } from '@/components/ThemeToggle';

function OIDCRegisterPageClient() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [oidcInfo, setOidcInfo] = useState<any>(null);

  const { siteName } = useSite();

  // 检查OIDC session
  useEffect(() => {
    const checkSession = async () => {
      try {
        const res = await fetch('/api/auth/oidc/session-info');
        if (res.ok) {
          const data = await res.json();
          setOidcInfo(data);
        } else {
          // session无效,跳转到登录页
          router.replace('/login?error=' + encodeURIComponent('OIDC会话已过期'));
        }
      } catch (error) {
        console.error('检查session失败:', error);
        router.replace('/login');
      }
    };

    checkSession();
  }, [router]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    if (!username) {
      setError('请输入用户名');
      return;
    }

    try {
      setLoading(true);
      const res = await fetch('/api/auth/oidc/complete-register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
      });

      if (res.ok) {
        // 注册成功，接口已写入认证 cookie，这里用整页跳转确保权限配置和登录态完全重建
        window.location.replace('/');
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || '注册失败');
      }
    } catch (error) {
      setError('网络错误，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  if (!oidcInfo) {
    return (
      <div className='relative min-h-screen flex items-center justify-center px-4'>
        <div className='text-ui-ink-3 '>加载中...</div>
      </div>
    );
  }

  return (
    <div className='relative min-h-screen flex items-center justify-center px-4 overflow-hidden'>
      <div className='absolute top-4 right-4'>
        <ThemeToggle />
      </div>
      <div className='relative z-10 w-full max-w-md rounded-ui-lg bg-ui-surface border border-ui-hair    backdrop-blur-xl shadow-ui-3 p-10 '>
        <h1 className='text-ui-accent tracking-tight text-center text-3xl font-extrabold mb-2 bg-clip-text drop-shadow-ui-1'>
          {siteName}
        </h1>
        <p className='text-center text-sm text-ui-ink-2  mb-8'>
          完成OIDC注册
        </p>

        {/* OIDC信息显示 */}
        {oidcInfo && (
          <div className='mb-6 p-4 bg-ui-accent-soft  border border-ui-hair  rounded-ui-md'>
            <p className='text-sm text-ui-accent '>
              {oidcInfo.email && (
                <>
                  邮箱: <strong>{oidcInfo.email}</strong>
                  <br />
                </>
              )}
              {oidcInfo.name && (
                <>
                  名称: <strong>{oidcInfo.name}</strong>
                  <br />
                </>
              )}
              {oidcInfo.trust_level !== undefined && (
                <>
                  信任等级: <strong>{oidcInfo.trust_level}</strong>
                </>
              )}
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit} className='space-y-6'>
          <div>
            <label htmlFor='username' className='block text-sm font-medium text-ui-ink  mb-2'>
              选择用户名
            </label>
            <input
              id='username'
              type='text'
              autoComplete='username'
              className='block w-full rounded-ui-md border-0 py-3 px-4 text-ui-ink  shadow-ui-1 ring-1 ring-ui-hair  placeholder:text-ui-ink-3  focus:ring-2 focus:ring-ui-accent focus:outline-none sm:text-base bg-ui-surface-2  backdrop-blur'
              placeholder='输入用户名（3-20位字母、数字、下划线）'
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
            <p className='mt-1 text-xs text-ui-ink-3 '>
              用户名只能包含字母、数字、下划线，长度3-20位
            </p>
          </div>

          {error && (
            <p className='text-sm text-red-600 dark:text-red-400'>{error}</p>
          )}

          <button
            type='submit'
            disabled={!username || loading}
            className='inline-flex w-full justify-center rounded-ui-md bg-ui-accent py-3 text-base font-semibold text-white shadow-ui-2 transition-all duration-200 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50'
          >
            {loading ? '注册中...' : '完成注册'}
          </button>

          {/* 返回登录链接 */}
          <div className='text-center'>
            <button
              type='button'
              onClick={() => router.push('/login')}
              className='text-sm text-ui-accent  hover:text-ui-accent  transition-colors'
            >
              返回登录
            </button>
          </div>
        </form>
      </div>

      {/* 版本信息 */}
      <div className='absolute bottom-4 left-1/2 transform -translate-x-1/2 text-xs text-ui-ink-3 '>
        <span className='font-mono'>v{CURRENT_VERSION}</span>
      </div>
    </div>
  );
}

export default function OIDCRegisterPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <OIDCRegisterPageClient />
    </Suspense>
  );
}
