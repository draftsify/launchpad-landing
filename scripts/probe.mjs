/**
 * Ce qu'une page rend vraiment : son texte après hydratation, et les erreurs
 * console qu'elle a produites. Un `curl` ne voit que le HTML du serveur, donc
 * jamais ce qu'affiche une page qui lit la chaîne depuis le navigateur.
 *
 *   node scripts/probe.mjs http://localhost:3000/analytics
 */
import puppeteer from "puppeteer-core";

const url = process.argv[2];
const b = await puppeteer.launch({
  executablePath:
    process.env.CHROME_PATH ??
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: "new",
  args: ["--no-sandbox"],
});
const p = await b.newPage();
const errs = [];
p.on("console", (m) => m.type() === "error" && errs.push(m.text()));
p.on("pageerror", (e) => errs.push(String(e)));
await p.goto(url, { waitUntil: "networkidle0", timeout: 60000 });
await new Promise((r) => setTimeout(r, 4000));
console.log("--- TEXTE ---\n" + (await p.evaluate(() => document.body.innerText)));
console.log("--- ERREURS ---\n" + (errs.join("\n") || "aucune"));
await b.close();
