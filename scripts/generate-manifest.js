#!/usr/bin/env node
/* eslint-disable */
// 根据 NEXT_PUBLIC_SITE_NAME 动态生成 manifest.json

const fs = require('fs');
const path = require('path');

// 获取项目根目录
const projectRoot = path.resolve(__dirname, '..');
const publicDir = path.join(projectRoot, 'public');
const manifestPath = path.join(publicDir, 'manifest.json');

// 从环境变量获取站点名称
const siteName = process.env.NEXT_PUBLIC_SITE_NAME || 'IVYFLIX';

// manifest.json 模板
// Apple 状态栏等配置应写在 HTML meta（layout appleWebApp），非标准 manifest 字段浏览器会忽略
// id / lang / dir / display_override / prefer_related_applications 都是 Chrome 侧
// 安装（WebAPK 铸造）会读的字段，缺了不影响浏览器打开，但会影响安装流程的判定。
const manifestTemplate = {
  id: '/',
  name: siteName,
  short_name: siteName,
  description: '影视聚合',
  lang: 'zh-CN',
  dir: 'ltr',
  start_url: '/',
  scope: '/',
  display: 'standalone',
  display_override: ['standalone', 'minimal-ui'],
  orientation: 'any',
  background_color: '#000000',
  theme_color: '#000000',
  prefer_related_applications: false,
  icons: [
    {
      src: '/icons/icon-192x192.png',
      sizes: '192x192',
      type: 'image/png',
      purpose: 'any',
    },
    {
      src: '/icons/icon-256x256.png',
      sizes: '256x256',
      type: 'image/png',
      purpose: 'any',
    },
    {
      src: '/icons/icon-384x384.png',
      sizes: '384x384',
      type: 'image/png',
      purpose: 'any',
    },
    {
      src: '/icons/icon-512x512.png',
      sizes: '512x512',
      type: 'image/png',
      purpose: 'any',
    },
    // maskable：Android 把图标裁成圆形 / 圆角方形时只保留中心 80% 安全区。
    // 这一版是「原图缩到 80% + 四周垫 background_color」，边缘不透明，
    // 所以任何裁剪形状下都不会露出透明缺口或切掉图形。
    // 没有它也能装，但装出来的图标会是白底方块。
    {
      src: '/icons/maskable-192x192.png',
      sizes: '192x192',
      type: 'image/png',
      purpose: 'maskable',
    },
    {
      src: '/icons/maskable-512x512.png',
      sizes: '512x512',
      type: 'image/png',
      purpose: 'maskable',
    },
  ],
};

try {
  // 确保 public 目录存在
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }

  // 写入 manifest.json
  fs.writeFileSync(manifestPath, JSON.stringify(manifestTemplate, null, 2));
  console.log(`✅ Generated manifest.json with site name: ${siteName}`);
} catch (error) {
  console.error('❌ Error generating manifest.json:', error);
  process.exit(1);
}
