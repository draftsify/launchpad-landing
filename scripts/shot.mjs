/** Capture la page locale via le Chrome installé. Usage: node scripts/shot.mjs <url> <out> [width] [height] */
import puppeteer from "puppeteer-core";

const [url, out, w = "1280", h = "900"] = process.argv.slice(2);

const browser = await puppeteer.launch({
  executablePath:
    process.env.CHROME_PATH ??
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: "new",
  args: ["--no-sandbox", "--force-color-profile=srgb"],
});

const page = await browser.newPage();
await page.setViewport({
  width: Number(w),
  height: Number(h),
  deviceScaleFactor: 1,
});
await page.goto(url, { waitUntil: "networkidle0", timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500)); // laisse jouer les animations d'entrée
await page.screenshot({ path: out });
await browser.close();
console.log("ok:", out);
