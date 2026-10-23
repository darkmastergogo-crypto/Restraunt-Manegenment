import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
let count = 0;
function walk(dir) {
  for (let x of fs.readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules", "dist", "build", ".git"].includes(x.name)) continue;
    let f = path.join(dir, x.name);
    if (x.isDirectory()) walk(f);
    else if (/\.(mjs|js)$/.test(f)) {
      execFileSync(process.execPath, ["--check", f], { stdio: "pipe" });
      count++;
    }
  }
}
walk(".");
for (let dest of [
  "public/schema.mjs",
  "functions/restaurant-api/src/schema.mjs",
])
  if (
    fs.readFileSync(dest, "utf8") !==
    fs.readFileSync("shared/schema.mjs", "utf8")
  )
    throw Error("Schema copies differ: " + dest);
console.log(
  "Syntax checked " + count + " JS files; shared schema copies match.",
);
