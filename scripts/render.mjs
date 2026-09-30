// Gera as imagens do README (profile/assets/*.png) a partir de scripts/cards.html.
//
// Cada elemento com data-out vira profile/assets/<data-out>.png, recortado no próprio
// elemento e com fundo transparente, para os cantos arredondados funcionarem
// no tema claro e no escuro do GitHub. Renderiza em 2x para ficar nítido em
// telas de alta densidade.
//
// Requisitos: Google Chrome instalado (usado via playwright-core, sem baixar
// navegador) e acesso à internet para as fontes e os ícones.
//
//   cd scripts && npm install && npm run render

import { chromium } from "playwright-core";
import sharp from "sharp";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { mkdir } from "node:fs/promises";

const here = dirname(fileURLToPath(import.meta.url));
const source = pathToFileURL(join(here, "cards.html")).href;
// Dentro de profile/: no perfil da organização o GitHub resolve os caminhos
// relativos a partir dessa pasta e ignora "../".
const outDir = join(here, "..", "profile", "assets");

await mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({
  viewport: { width: 1400, height: 1000 },
  deviceScaleFactor: 2,
});

await page.goto(source, { waitUntil: "networkidle" });
await page.evaluate(() => window.ready);
await page.evaluate(() =>
  Promise.all(
    [...document.images].map((img) =>
      img.complete ? null : new Promise((ok) => (img.onload = img.onerror = ok)),
    ),
  ),
);

const broken = await page.evaluate(() =>
  [...document.images].filter((img) => !img.naturalWidth).map((img) => img.src),
);
if (broken.length) {
  console.error("Imagens que não carregaram:\n  " + broken.join("\n  "));
  process.exitCode = 1;
}

// A captura crua passa de 700 KB por imagem por causa dos degradês. Paleta
// com dithering (libimagequant, o mesmo do pngquant) derruba para ~10% sem
// criar faixas visíveis no fundo.
for (const el of await page.locator("[data-out]").all()) {
  const name = await el.getAttribute("data-out");
  const raw = await el.screenshot({ omitBackground: true });
  const out = join(outDir, `${name}.png`);
  const { size } = await sharp(raw)
    .png({ palette: true, quality: 95, dither: 1, effort: 10, compressionLevel: 9 })
    .toFile(out);
  console.log(`  profile/assets/${name}.png  ${Math.round(size / 1024)} KB`);
}

await browser.close();
