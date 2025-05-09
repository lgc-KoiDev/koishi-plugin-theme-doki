import { resolve } from 'node:path'

import type {} from '@koishijs/plugin-console'
import { Context, z } from 'koishi'

export const name = 'theme-doki'
export const using = ['console']

export interface Config {}
export const Config: z<Config> = z.object({})

export function apply(ctx: Context) {
  ctx.console.addEntry(
    process.env.KOISHI_BASE
      ? [
          process.env.KOISHI_BASE + '/dist/index.js',
          process.env.KOISHI_BASE + '/dist/style.css',
        ]
      : process.env.KOISHI_ENV === 'browser'
        ? [import.meta.url.replace(/\/src\/[^/]+$/, '/client/index.ts')]
        : {
            dev: resolve(__dirname, '../client/index.ts'),
            prod: resolve(__dirname, '../dist'),
          },
  )
}
