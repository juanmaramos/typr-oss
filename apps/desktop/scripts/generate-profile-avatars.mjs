import Avatar from "boring-avatars";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// Fixed seeds, no personal data. Colors come from Typr's light theme so the
// exported artwork keeps the same identity in either app theme.
const css = await readFile(new URL("../../../packages/ui/src/styles/globals.css", import.meta.url), "utf8");
const lightTheme = css.slice(css.indexOf(":root"), css.indexOf(".dark"));
const colors = ["primary", "cursor-cream", "foreground", "secondary", "chart-1"].map(name => {
  const value = lightTheme.match(new RegExp(`--${name}:\\s*([\\d.]+ [\\d.]+% [\\d.]+%);`))?.[1];
  if (!value) {
    throw new Error(`Missing theme color: ${name}`);
  }
  return `hsl(${value.replaceAll(" ", ", ")})`;
});
const output = new URL("../public/avatars/", import.meta.url);
await mkdir(output, { recursive: true });
const seeds = ["Juniper", "Cedar", "Iris", "Sage", "Olive", "Willow", "Aster", "Fern"];
for (const [index, name] of seeds.entries()) {
  const svg = renderToStaticMarkup(createElement(Avatar, { variant: "marble", name, colors, size: 80 }));
  const file = `marble-${String(index + 1).padStart(2, "0")}.svg`;
  await writeFile(
    new URL(file, output),
    `<!-- Generated with boring-avatars 2.0.4 (MIT). See LICENSE.txt. -->\n${svg}\n`,
  );
}
await writeFile(
  new URL("LICENSE.txt", output),
  await readFile(new URL("../node_modules/boring-avatars/LICENSE", import.meta.url)),
);
