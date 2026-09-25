// Turns dist/index.html into a head/body-less fragment for publishing as a claude.ai Artifact.
import fs from "node:fs";
const [src = "dist/index.html", out = "dist/artifact.html"] = process.argv.slice(2);
const html = fs.readFileSync(src, "utf8");
const head = html.match(/<head>([\s\S]*?)<\/head>/)[1].replace(/<meta[^>]*>/g, "");
const body = html.match(/<body>([\s\S]*?)<\/body>/)[1];
// Scripts must run after #root exists, so put the body first and move scripts after it.
const scripts = [...head.matchAll(/<script[\s\S]*?<\/script>/g)].map((m) => m[0]);
const headRest = head.replace(/<script[\s\S]*?<\/script>/g, "");
fs.writeFileSync(out, headRest.trim() + "\n" + body.trim() + "\n" + scripts.join("\n"));
console.log("wrote " + out, (fs.statSync(out).size / 1024).toFixed(0) + " KB");
