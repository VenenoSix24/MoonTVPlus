/**
 * 网盘分享链接识别。
 *
 * 从首页 `page.tsx` 搬出来的纯函数。直链播放弹窗现在挂在全局「更多」面板里，
 * 不再属于首页，所以不能再依赖首页组件的闭包。
 */

export type NetdiskProvider =
  | 'quark'
  | 'mobile'
  | 'baidu'
  | 'tianyi'
  | '123'
  | 'uc'
  | '115';

export interface NetdiskLink {
  provider: NetdiskProvider;
  shareUrl: string;
  passcode?: string;
}

export const detectNetdiskLink = (url: string): NetdiskLink | null => {
  const trimmed = url.trim();

  const pickPasscode = (...values: Array<string | undefined>) =>
    values.map((item) => item?.trim()).find(Boolean);

  const inlinePasscode = (text: string) =>
    pickPasscode(
      text.match(/(?:提取码|访问码|密码)\s*[:：=]?\s*([a-zA-Z0-9]{4,8})/i)?.[1],
      text.match(/[?&](?:pwd|passcode|accessCode)=([^&\s]+)/i)?.[1]
    );

  if (
    /https:\/\/(?:www\.)?123(?:684|865|912|pan)\.(?:com|cn)\/s\//i.test(trimmed)
  ) {
    return {
      provider: '123',
      shareUrl: trimmed,
      passcode: pickPasscode(
        trimmed.match(/[?&]pwd=([^&]+)/i)?.[1],
        inlinePasscode(trimmed)
      ),
    };
  }

  if (
    /https:\/\/cloud\.189\.cn\/(web\/share\?code=|t\/)/i.test(trimmed) ||
    /https:\/\/h5\.cloud\.189\.cn\/share\.html#\/t\//i.test(trimmed)
  ) {
    return {
      provider: 'tianyi',
      shareUrl: trimmed,
      passcode: pickPasscode(
        trimmed.match(/[?&]pwd=([^&]+)/i)?.[1],
        inlinePasscode(trimmed)
      ),
    };
  }

  if (/pan\.baidu\.com\/(s\/|wap\/init\?surl=)/i.test(trimmed)) {
    return {
      provider: 'baidu',
      shareUrl: trimmed,
      passcode: pickPasscode(
        trimmed.match(/[?&](?:pwd|accessCode)=([^&]+)/i)?.[1],
        inlinePasscode(trimmed)
      ),
    };
  }

  if (/https:\/\/pan\.quark\.cn\/s\//i.test(trimmed)) {
    return {
      provider: 'quark',
      shareUrl: trimmed,
      passcode: pickPasscode(
        trimmed.match(/[?&](?:pwd|passcode)=([^&]+)/i)?.[1],
        inlinePasscode(trimmed)
      ),
    };
  }

  if (/https:\/\/drive\.uc\.cn\/s\//i.test(trimmed)) {
    return {
      provider: 'uc',
      shareUrl: trimmed,
      passcode: pickPasscode(
        trimmed.match(/[?&](?:pwd|passcode)=([^&]+)/i)?.[1],
        inlinePasscode(trimmed)
      ),
    };
  }

  if (/https:\/\/(?:yun|caiyun)\.139\.com\//i.test(trimmed)) {
    return { provider: 'mobile', shareUrl: trimmed };
  }

  if (/https:\/\/(?:115|anxia|115cdn)\.com\/s\//i.test(trimmed)) {
    return {
      provider: '115',
      shareUrl: trimmed,
      passcode: pickPasscode(
        trimmed.match(/[?&](?:password|pwd|passcode)=([^&]+)/i)?.[1],
        inlinePasscode(trimmed)
      ),
    };
  }

  return null;
};

/** 网盘来源 → 播放页 source 参数 */
export const netdiskSourceId = (provider: NetdiskProvider): string =>
  provider === 'mobile' ? 'netdisk-mobile' : `netdisk-${provider}`;
