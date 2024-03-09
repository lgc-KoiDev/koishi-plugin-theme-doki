import { Context, Schema, store, useConfig } from '@koishijs/client';
import { usePreferredDark } from '@vueuse/core';
import type {} from 'koishi-plugin-theme-doki';
import type {} from 'koishi-plugin-wallpaper';
import { computed, watchEffect } from 'vue';

import { AssetsInfo, applyTheme, assetNameMap } from './theme';

export interface DokiThemeConfig {
  resBaseURL: string;

  useWallpaper: boolean;
  useSecondaryWallpaper: boolean;
  wallpaperOpacity: number;

  useSticker: boolean;
  useSecondarySticker: boolean;
  stickerOpacity: number;
  stickerXOffset: number;
  stickerYOffset: number;
}

const DEFAULT_BASE_URL =
  'https://raw.gitmirror.com/doki-theme/doki-theme-assets/master/';

export const DokiThemeConfig: Schema<DokiThemeConfig> = Schema.intersect([
  Schema.intersect([
    Schema.object({
      resBaseURL: Schema.string()
        .role('link')
        .default(DEFAULT_BASE_URL)
        .description('图片资源的 URL 前缀。'),
    }).description('Doki Theme: 通用设置'),

    Schema.object({
      useWallpaper: Schema.boolean()
        .default(true)
        .description('使用背景图片，在 `koishi-plugin-wallpaper` 启用时无效。'),
    }).description('Doki Theme: 背景设置'),
    Schema.union([
      Schema.object({
        useWallpaper: Schema.const(true),
        useSecondaryWallpaper: Schema.boolean()
          .default(false)
          .description('使用备选背景图片（只有一部分主题有）。'),
        wallpaperOpacity: Schema.number()
          .role('slider')
          .min(0.3)
          .max(1)
          .step(0.01)
          .default(0.95)
          .description('控制台透明度。'),
      }),
      Schema.object({}),
    ]),
  ]),

  Schema.intersect([
    Schema.object({
      useSticker: Schema.boolean().default(true).description('使用贴纸。'),
    }).description('Doki Theme: 贴纸设置'),
    Schema.union([
      Schema.object({
        useSticker: Schema.const(true),
        useSecondarySticker: Schema.boolean()
          .default(false)
          .description('使用备选贴纸（只有一部分主题有）。'),
        stickerOpacity: Schema.number()
          .role('slider')
          .min(0)
          .max(1)
          .step(0.01)
          .default(0.5)
          .description('贴纸透明度。'),
        stickerXOffset: Schema.string()
          .default('0px')
          .description('贴纸水平偏移量（使用 CSS 单位）。'),
        stickerYOffset: Schema.string()
          .default('0px')
          .description('贴纸垂直偏移量（使用 CSS 单位）。'),
      }),
      Schema.object({}),
    ]),
  ]),
]);

declare module '@koishijs/client' {
  export interface Config {
    dokiTheme?: DokiThemeConfig;
  }
}

const config = useConfig();

const preferDark = usePreferredDark();
const colorMode = computed(() => {
  const { mode } = config.value.theme;
  if (mode !== 'auto') return mode;
  return preferDark.value ? 'dark' : 'light';
});

export default function apply(ctx: Context) {
  applyTheme(ctx);

  ctx.settings({
    id: 'appearance',
    disabled: () => !assetNameMap[config.value.theme[colorMode.value]],
    schema: Schema.object({ dokiTheme: DokiThemeConfig }),
  });

  ctx.on('ready', () => {
    config.value.dokiTheme ||= DokiThemeConfig();

    const stickerElemId = 'doki-theme-sticker';
    const body = window.document.querySelector('body');

    const getResURL = (suffix: string) => {
      const base = config.value.dokiTheme.resBaseURL;
      return new URL(suffix, base.endsWith('/') ? base : `${base}/`).href;
    };

    const getStickerElem = async (): Promise<HTMLDivElement> => {
      const found = document.getElementById(stickerElemId);
      if (found) return found as any;

      const elem = document.createElement('div');
      elem.id = stickerElemId;
      elem.style.position = 'fixed';
      elem.style.bottom = '0';
      elem.style.right = '0';
      elem.style.zIndex = '100';
      elem.style.width = '100%';
      elem.style.height = '100%';
      elem.style.backgroundRepeat = 'no-repeat';
      elem.style.pointerEvents = 'none';

      body.appendChild(elem);
      return elem;
    };

    const setWallpaper = async (info: AssetsInfo) => {
      const dokiConf = config.value.dokiTheme;
      const { name, anchor } =
        dokiConf.useSecondaryWallpaper && info.secondary
          ? info.secondary
          : info.default;
      body.style.backgroundImage = `url('${getResURL(`backgrounds/${name}`)}')`;
      body.style.backgroundPosition = `${anchor} bottom`;
      body.style.backgroundSize = 'cover';
      body.style.opacity = `${dokiConf.wallpaperOpacity}`;
    };

    const unsetWallpaper = async () => {
      body.style.backgroundImage = '';
      body.style.backgroundPosition = '';
      body.style.backgroundSize = '';
      body.style.opacity = '';
    };

    const setSticker = async (info: AssetsInfo) => {
      const elem = await getStickerElem();
      if (!elem) return;

      const dokiConf = config.value.dokiTheme;
      const { name } =
        dokiConf.useSecondarySticker && info.secondary
          ? info.secondary
          : info.default;

      elem.style.backgroundImage = `url('${getResURL(`stickers/vscode/${info.path}/${name}`)}')`;
      elem.style.opacity = `${dokiConf.stickerOpacity}`;
      elem.style.backgroundPosition = `bottom ${dokiConf.stickerYOffset} right ${dokiConf.stickerXOffset}`;
      body.appendChild(elem);
    };

    const unsetSticker = async () => {
      document.getElementById(stickerElemId)?.remove();
    };

    watchEffect(() => {
      const themeUsing = config.value.theme[colorMode.value];
      const assetsInfo = assetNameMap[themeUsing];
      if (!assetsInfo) {
        if (!store.wallpaper) unsetWallpaper();
        unsetSticker();
        return;
      }

      const { useWallpaper, useSticker } = config.value.dokiTheme;
      if (!store.wallpaper) {
        if (useWallpaper) setWallpaper(assetsInfo);
        else unsetWallpaper();
      }
      if (useSticker) setSticker(assetsInfo);
      else unsetSticker();
    });

    ctx.on('dispose', () => {
      if (!store.wallpaper) unsetWallpaper();
      unsetSticker();
    });
  });
}
