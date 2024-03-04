import { Context, Schema, store, useConfig } from "@koishijs/client";
import { usePreferredDark } from "@vueuse/core";
import type {} from "koishi-plugin-theme-doki";
import type {} from "koishi-plugin-wallpaper";
import { computed, watchEffect } from "vue";

import { AssetsInfo, applyTheme, assetNameMap } from "./theme";

export interface DokiThemeConfig {
  useWallpaper: boolean;
  useSecondaryWallpaper: boolean;
  wallpaperOpacity: number;

  useSticker: boolean;
  useSecondarySticker: boolean;
  stickerOpacity: number;
  stickerXOffset: number;
  stickerYOffset: number;
}

export const DokiThemeConfig: Schema<DokiThemeConfig> = Schema.intersect([
  Schema.intersect([
    Schema.object({
      useWallpaper: Schema.boolean()
        .default(true)
        .description("使用背景图片，在 `koishi-plugin-wallpaper` 启用时无效。"),
    }).description("背景设置"),
    Schema.union([
      Schema.object({
        useWallpaper: Schema.const(true),
        useSecondaryWallpaper: Schema.boolean()
          .default(false)
          .description("使用备选背景图片（只有一部分主题有）。"),
        wallpaperOpacity: Schema.number()
          .role("slider")
          .min(0.3)
          .max(1)
          .step(0.01)
          .default(0.9)
          .description("控制台透明度。"),
      }),
      Schema.object({}),
    ]),
  ]),

  Schema.intersect([
    Schema.object({
      useSticker: Schema.boolean().default(true).description("使用贴纸。"),
    }).description("贴纸设置"),
    Schema.union([
      Schema.object({
        useSticker: Schema.const(true),
        useSecondarySticker: Schema.boolean()
          .default(false)
          .description("使用备选贴纸（只有一部分主题有）。"),
        stickerOpacity: Schema.number()
          .role("slider")
          .min(0)
          .max(1)
          .step(0.01)
          .default(0.5)
          .description("贴纸透明度。"),
        stickerXOffset: Schema.number()
          .min(0)
          .max(100)
          .default(0)
          .description("贴纸水平偏移百分比。"),
        stickerYOffset: Schema.number()
          .min(0)
          .max(100)
          .default(0)
          .description("贴纸垂直偏移百分比。"),
      }),
      Schema.object({}),
    ]),
  ]),
]);

declare module "@koishijs/client" {
  export interface Config {
    dokiTheme?: DokiThemeConfig;
  }
}

const resBaseUrl =
  "https://raw.githubusercontent.com/doki-theme/doki-theme-assets/master";

export default function apply(ctx: Context) {
  applyTheme(ctx);

  ctx.settings({
    id: "dokiTheme",
    title: "Doki Theme",
    schema: Schema.object({ dokiTheme: DokiThemeConfig }),
  });

  ctx.on("ready", () => {
    const config = useConfig();
    config.value.dokiTheme ||= DokiThemeConfig();

    const preferDark = usePreferredDark();
    const colorMode = computed(() => {
      const { mode } = config.value.theme;
      if (mode !== "auto") return mode;
      return preferDark.value ? "dark" : "light";
    });

    const stickerElemId = "doki-theme-sticker";
    const body = window.document.querySelector("body");

    const getStickerElem = async (): Promise<HTMLDivElement> => {
      const found = document.getElementById(stickerElemId);
      if (found) return found as any;

      const elem = document.createElement("div");
      elem.id = stickerElemId;
      elem.style.position = "fixed";
      elem.style.bottom = "0";
      elem.style.right = "0";
      elem.style.zIndex = "100";
      elem.style.width = "100%";
      elem.style.height = "100%";
      elem.style.backgroundRepeat = "no-repeat";
      elem.style.pointerEvents = "none";

      body.appendChild(elem);
      return elem;
    };

    const setWallpaper = async (info: AssetsInfo) => {
      const dokiConf = config.value.dokiTheme;
      const { name, anchor } =
        dokiConf.useSecondaryWallpaper && info.secondary
          ? info.secondary
          : info.default;
      body.style.backgroundImage = `url('${resBaseUrl}/backgrounds/${name}')`;
      body.style.backgroundPosition = `${anchor} bottom`;
      body.style.backgroundSize = "cover";
      body.style.opacity = `${dokiConf.wallpaperOpacity}`;
    };

    const unsetWallpaper = async () => {
      body.style.backgroundImage = "";
      body.style.backgroundPosition = "";
      body.style.backgroundSize = "";
      body.style.opacity = "";
    };

    const setSticker = async (info: AssetsInfo) => {
      const elem = await getStickerElem();
      if (!elem) return;

      const dokiConf = config.value.dokiTheme;
      const { name } =
        dokiConf.useSecondarySticker && info.secondary
          ? info.secondary
          : info.default;

      elem.style.backgroundImage = `url('${resBaseUrl}/stickers/vscode/${info.path}/${name}')`;
      elem.style.opacity = `${dokiConf.stickerOpacity}`;
      elem.style.backgroundPosition = `bottom ${dokiConf.stickerYOffset}% right ${dokiConf.stickerXOffset}%`;
      body.appendChild(elem);
    };

    const unsetSticker = async () => {
      document.getElementById(stickerElemId)?.remove();
    };

    watchEffect(() => {
      if (store.wallpaper) unsetWallpaper();

      const themeUsing = config.value.theme[colorMode.value];
      const assetsInfo = assetNameMap[themeUsing];
      if (!assetsInfo) {
        unsetWallpaper();
        unsetSticker();
        return;
      }

      const { useWallpaper, useSticker } = config.value.dokiTheme;
      if (useWallpaper) setWallpaper(assetsInfo);
      else unsetWallpaper();
      if (useSticker) setSticker(assetsInfo);
      else unsetSticker();
    });

    ctx.on("dispose", () => {
      unsetWallpaper();
      unsetSticker();
    });
  });
}
