import { exec } from "child_process";
import fs from "fs";
import { writeFile } from "fs/promises";
import { join } from "path";
import { promisify } from "util";

import { Octokit } from "octokit";
import { Semaphore } from "semaphore-promise";

const execAsync = promisify(exec);

const ghAuth = process.env.GITHUB_TOKEN;
if (ghAuth) console.log(`using token, length: ${ghAuth.length}`);
const gh = new Octokit({ auth: ghAuth });

const rootDir = join(__dirname, "..");
const indexCssDir = join(rootDir, "client");
const themeCssDir = join(rootDir, "client", "themes");
if (!fs.existsSync(indexCssDir)) fs.mkdirSync(indexCssDir, { recursive: true });
if (!fs.existsSync(themeCssDir)) fs.mkdirSync(themeCssDir, { recursive: true });
const indexCssPath = join(indexCssDir, "index.scss");
const indexTsPath = join(indexCssDir, "index.ts");

const themeTemplate = fs.readFileSync(join(__dirname, "template.scss"), {
  encoding: "utf-8",
});

interface StickerInfo {
  name: string;
}

interface ThemeDef {
  name: string;
  group: string;
  stickers: { default: StickerInfo; secondary?: StickerInfo };
  overrides?: { editorScheme?: { colors?: { accentColor?: string } } };
  colors: {
    baseBackground: string;
    secondaryBackground: string;
    textEditorBackground: string;
    highlightColor: string;
    disabledColor: string;
    headerColor: string;
    accentColor: string;
    foregroundColor: string;
    selectionForeground: string;
    accentColorTransparent: string;
    selectionBackground: string;
    constantColor: string;
    unusedColor: string;
    classNameColor: string;
    htmlTagColor: string;
    stringColor: string;
    keyColor: string;
    keywordColor: string;
    infoForeground: string;
    comments: string;
    identifierHighlight: string;
    selectionInactive: string;
    baseIconColor: string;
  };
}

async function getThemeDefs(): Promise<ThemeDef[]> {
  const urls = await gh.rest.git
    .getTree({
      owner: "doki-theme",
      repo: "doki-master-theme",
      tree_sha: "master",
      recursive: "1",
    })
    .then(({ data }) =>
      data.tree
        .filter((x) => /^definitions.*\.json/.test(x.path))
        .map(
          (x) =>
            `https://raw.githubusercontent.com/doki-theme/doki-master-theme/master/${x.path}`,
        ),
    );

  console.log(`Found ${urls.length} theme definitions`);
  const sem = new Semaphore(8);
  return Promise.all(
    urls.map((url) =>
      sem.acquire().then((release) =>
        fetch(url)
          .then((data) => data.json())
          .catch((e) => {
            console.error(`Failed to fetch ${url}`);
            throw e;
          })
          .finally(release),
      ),
    ),
  );
}

interface KoishiThemeDef {
  name: string;
  id: string;

  bg0: string;
  bg1: string;
  bg2: string;
  bg3: string;
  fg0: string;
  fg1: string;
  fg2: string;
  fg3: string;

  border: string;
  divider: string;
  disabled: string;
  primary: string;
  hover: string;
  terminalHover: string;
  terminalSelection: string;

  selectionBackground: string;
  selectionForeground: string;
  inactiveSelectionBackground: string;
  selectionHighlightBackground: string;
  lineHighlightBackground: string;
  lineHighlightBorder: string;

  arrayForeground: string;
  constantForeground: string;
  enumeratorMemberForeground: string;
  booleanForeground: string;
  classForeground: string;
  enumeratorForeground: string;
  fieldForeground: string;
  constructorForeground: string;
  functionForeground: string;
  colorForeground: string;
  eventForeground: string;
  fileForeground: string;
  folderForeground: string;
  interfaceForeground: string;
}

function transformThemeDef(data: ThemeDef): KoishiThemeDef {
  const c = data.colors;
  const editorAccent =
    data.overrides?.editorScheme?.colors?.accentColor ?? c.accentColor;
  return {
    name: data.name,
    id:
      `doki-` +
      `${data.name.toLowerCase().replace(/(^[0-9]+)|[^a-zA-Z0-9]/g, "-")}`,

    bg0: c.secondaryBackground,
    bg1: c.baseBackground,
    bg2: c.headerColor,
    bg3: c.textEditorBackground,
    fg0: c.selectionForeground,
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

    arrayForeground: c.constantColor,
    constantForeground: c.constantColor,
    enumeratorMemberForeground: c.constantColor,
    booleanForeground: c.keywordColor,
    classForeground: c.classNameColor,
    enumeratorForeground: c.keyColor,
    fieldForeground: c.keyColor,
    constructorForeground: c.classNameColor,
    functionForeground: editorAccent,
    colorForeground: editorAccent,
    eventForeground: editorAccent,
    fileForeground: c.baseIconColor,
    folderForeground: c.baseIconColor,
    interfaceForeground: c.stringColor,
  };
}

function write(path: string, data: string) {
  return writeFile(path, data, { encoding: "utf-8" });
}

function generateThemeCss(theme: KoishiThemeDef): string {
  return themeTemplate
    .replace(/var\(\s*__(.+?)\s*\)/g, (_, key) => {
      const value = theme[key as keyof KoishiThemeDef];
      if (value === undefined)
        console.warn(`warn: Unknown key ${key} in ${theme.id}`);
      return value ?? "/* unresolved */";
    })
    .replace(/.*:\s*\/\* unresolved \*\/\s*;/g, "");
}

function generateIndexCss(themes: KoishiThemeDef[]): string {
  return themes.map(({ id }) => `@import './themes/${id}.scss';`).join("\n");
}

function generateIndexTs(themes: KoishiThemeDef[]): string {
  return `import { Context } from "@koishijs/client";

  import "./index.scss";

  export default function _(ctx: Context) {
    ${themes.map((x) => `ctx.theme({ id: "${x.id}", name: "${x.name}" });`).join("\n")}
  }
`;
}

(async () => {
  if (ghAuth) {
    const { data } = await gh.rest.users.getAuthenticated();
    console.log(`GitHub logged in as ${data.login}`);
  }

  console.log("Fetching theme definitions");
  const defs = await getThemeDefs();

  console.log("Generating koishi themes");
  const koishiDefs = defs.map(transformThemeDef);
  const tasks = [
    ...koishiDefs.map((def) =>
      Promise.resolve(generateThemeCss(def)).then((css) =>
        write(join(themeCssDir, `${def.id}.scss`), css),
      ),
    ),
    write(indexCssPath, generateIndexCss(koishiDefs)),
    write(indexTsPath, generateIndexTs(koishiDefs)),
  ];
  await Promise.all(tasks);

  console.log("Prettifying workspace");
  await execAsync(`prettier -cw ${rootDir}`);

  console.log("Done!");
})();
