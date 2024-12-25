/* eslint-disable no-console */

import fs from 'fs'
import { writeFile } from 'fs/promises'
import { join } from 'path'

import { pick } from 'cosmokit'
import { Octokit } from 'octokit'
import { Semaphore } from 'semaphore-promise'

const ghAuth = process.env.GITHUB_TOKEN
if (ghAuth) console.log(`using token, length: ${ghAuth.length}`)
const gh = new Octokit({ auth: ghAuth })

const rootDir = join(__dirname, '..')
const indexCssDir = join(rootDir, 'client')
const themeCssDir = join(rootDir, 'client', 'themes')

const indexCssPath = join(indexCssDir, 'index.scss')
const themeTsPath = join(indexCssDir, 'theme.ts')

if (!fs.existsSync(indexCssDir)) fs.mkdirSync(indexCssDir, { recursive: true })
if (fs.existsSync(themeCssDir)) fs.rmSync(themeCssDir, { recursive: true })
fs.mkdirSync(themeCssDir, { recursive: true })

const themeCssTemplate = fs.readFileSync(join(__dirname, 'theme.scss.template'), {
  encoding: 'utf-8',
})
const themeTsTemplate = fs.readFileSync(join(__dirname, 'theme.ts.template'), {
  encoding: 'utf-8',
})

interface StickerInfo {
  name: string
  anchor: 'left' | 'center' | 'right'
}

interface ThemeDef {
  $url: string
  name: string
  group: string
  dark: boolean
  stickers: { default: StickerInfo; secondary?: StickerInfo }
  colors: {
    baseBackground: string
    secondaryBackground: string
    textEditorBackground: string
    highlightColor: string
    disabledColor: string
    headerColor: string
    accentColor: string
    foregroundColor: string
    selectionForeground: string
    accentColorTransparent: string
    selectionBackground: string
    identifierHighlight: string
    selectionInactive: string
  }
}

async function getThemeDefs(): Promise<ThemeDef[]> {
  const urls = await gh.rest.git
    .getTree({
      owner: 'doki-theme',
      repo: 'doki-master-theme',
      tree_sha: 'master',
      recursive: '1',
    })
    .then(({ data }) =>
      data.tree
        .filter((x) => /^definitions.*\.json/.test(x.path))
        .map(
          (x) =>
            `https://raw.githubusercontent.com/doki-theme/doki-master-theme/master/${x.path}`,
        ),
    )

  console.log(`Found ${urls.length} theme definitions`)
  const sem = new Semaphore(8)
  return Promise.all(
    urls.map((url) =>
      sem.acquire().then((release) =>
        fetch(url)
          .then((data) => data.json())
          .then((data) => ({ ...data, $url: url }))
          .catch((e) => {
            console.error(`Failed to fetch ${url}`)
            throw e
          })
          .finally(release),
      ),
    ),
  )
}

interface KoishiThemeDef {
  $original: ThemeDef

  name: string
  id: string

  // bg0: string;
  bg1: string
  bg2: string
  bg3: string
  // fg0: string;
  fg1: string
  fg2: string
  fg3: string

  border: string
  divider: string
  disabled: string
  primary: string
  hover: string
  terminalHover: string
  terminalSelection: string

  selectionBackground: string
  selectionForeground: string
  inactiveSelectionBackground: string
  selectionHighlightBackground: string
  lineHighlightBackground: string
  lineHighlightBorder: string
}

function transformThemeDef(data: ThemeDef): KoishiThemeDef {
  const c = data.colors

  const idBase = data.name.toLowerCase().replace(/[^a-zA-Z0-9]/g, '-')
  const noSfx = idBase.endsWith('dark') || idBase.endsWith('light')
  const sfx = `-${data.dark ? 'dark' : 'light'}`
  const id = `doki-${idBase}${noSfx ? '' : sfx}`

  return {
    $original: data,

    name: `${data.group}: ${data.name}`,
    id,

    ...(data.dark
      ? {
          bg1: c.baseBackground,
          bg2: c.headerColor,
          bg3: c.textEditorBackground,
        }
      : {
          // light theme should reverse bg color
          bg3: c.baseBackground,
          bg2: c.headerColor,
          bg1: c.textEditorBackground,
        }),
    fg1: `${c.foregroundColor}e5`,
    fg2: `${c.foregroundColor}99`,
    fg3: `${c.foregroundColor}66`,

    border: `${c.highlightColor}cc`,
    divider: `${c.highlightColor}88`,
    disabled: c.disabledColor,
    primary: c.accentColor,
    hover: `${c.highlightColor}aa`,
    terminalHover: c.accentColorTransparent,
    terminalSelection: c.selectionBackground,

    selectionBackground: c.selectionBackground,
    selectionForeground: c.selectionForeground,
    inactiveSelectionBackground: `${c.selectionInactive}99`,
    selectionHighlightBackground: c.identifierHighlight,
    lineHighlightBackground: `${c.baseBackground}77`,
    lineHighlightBorder: `${c.baseBackground}00`,
  }
}

function write(path: string, data: string) {
  return writeFile(path, data, { encoding: 'utf-8' })
}

function generateThemeCss(theme: KoishiThemeDef): string {
  const codeTxt = themeCssTemplate
    .replace(/var\(\s*__(.+?)\s*\)/g, (_, key) => {
      const value = theme[key as keyof KoishiThemeDef]
      if (!(typeof value === 'string')) {
        console.warn(`warn: Unknown key ${key} in ${theme.id}`)
        return '/* unresolved */'
      }
      return value
    })
    .replace(/.*:\s*\/\* unresolved \*\/\s*;/g, '')
  return codeTxt
}

function generateIndexCss(themes: KoishiThemeDef[]): string {
  const x = themes.map(({ id }) => `@use './themes/${id}.scss';`).join('\n')
  return `${x}\n`
}

function generateThemeTs(themes: KoishiThemeDef[]): string {
  const assetNameMapCode = JSON.stringify(
    Object.fromEntries(
      themes.map((x) => [
        x.id,
        {
          path: /definitions\/(?<path>.*)\/(.*)\.definition\.json/.exec(
            x.$original.$url,
          ).groups?.path as string,
          ...Object.fromEntries(
            Object.entries(x.$original.stickers).map(([k, v]) => [
              k,
              pick(v, ['name', 'anchor']),
            ]),
          ),
        },
      ]),
    ),
    null,
    2,
  )
  const applyThemeCode = themes
    .map(
      (x) =>
        `  ctx.theme({\n` +
        `    id: '${x.id}',\n` +
        `    name: '${x.name.replaceAll("'", "\\'")}'\n` +
        `  })`,
    )
    .join('\n')
  const codeTxt = themeTsTemplate
    .replace('/* nameMap */', assetNameMapCode)
    .replace('/* themes */', applyThemeCode)
  return codeTxt
}

;(async () => {
  if (ghAuth) {
    const { data } = await gh.rest.users.getAuthenticated()
    console.log(`GitHub logged in as ${data.login}`)
  }

  console.log('Fetching theme definitions')
  const defs = await getThemeDefs()

  console.log('Generating koishi themes')
  const koishiDefs = defs.map(transformThemeDef)
  const tasks = [
    ...koishiDefs.map((def) =>
      write(join(themeCssDir, `${def.id}.scss`), generateThemeCss(def)),
    ),
    write(indexCssPath, generateIndexCss(koishiDefs)),
    write(themeTsPath, generateThemeTs(koishiDefs)),
  ]
  await Promise.all(tasks)

  console.log('Done!')
})()
