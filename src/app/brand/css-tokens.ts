// Reads the color tokens out of src/styles.css, so the icon script and the
// contrast test use the very values the app paints with. Only what styles.css
// needs: `:root { … }` and `.dark { … }` blocks of `--name: value;`, with
// `var(--other)` resolved.

export type Theme = "light" | "dark";
export type TokenTable = Record<string, string>;

/** Every `--name: value` in the top-level blocks with this exact selector. */
function declarations(css: string, selector: string): TokenTable {
  const out: TokenTable = {};
  const text = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const opener = new RegExp(
    `(^|\\n)${selector.replace(/[.:]/g, "\\$&")}\\s*\\{`,
    "g",
  );
  for (const match of text.matchAll(opener)) {
    const start = match.index + match[0].length;
    const end = text.indexOf("}", start);
    for (const decl of text.slice(start, end).split(";")) {
      const m = /^\s*(--[\w-]+)\s*:\s*([\s\S]+?)\s*$/.exec(decl);
      if (m?.[1] && m[2]) out[m[1].slice(2)] = m[2];
    }
  }
  return out;
}

function resolve(table: TokenTable): TokenTable {
  const out: TokenTable = {};
  const get = (name: string, depth: number): string => {
    const value = table[name];
    if (value === undefined) throw new Error(`No token --${name}`);
    if (depth > 10) throw new Error(`--${name} refers to itself`);
    return value.replace(/var\(--([\w-]+)\)/g, (_, ref: string) =>
      get(ref, depth + 1),
    );
  };
  for (const name of Object.keys(table)) out[name] = get(name, 0);
  return out;
}

/** The resolved tokens of each theme: dark is light with `.dark` on top. */
export function readTokens(css: string): Record<Theme, TokenTable> {
  const light = declarations(css, ":root");
  const dark = { ...light, ...declarations(css, ".dark") };
  return { light: resolve(light), dark: resolve(dark) };
}
