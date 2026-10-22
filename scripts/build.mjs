import fs from "node:fs";
import { execFileSync } from "node:child_process";
for (let f of ["public/schema.mjs", "functions/restaurant-api/src/schema.mjs"])
  fs.copyFileSync("shared/schema.mjs", f);
execFileSync(process.execPath, ["scripts/texts.mjs"], { stdio: "inherit" });
execFileSync(process.execPath, ["scripts/check.mjs"], { stdio: "inherit" });
execFileSync(process.execPath, ["scripts/catalog.mjs"], { stdio: "inherit" });
fs.rmSync("dist", { recursive: true, force: true });
fs.cpSync("public", "dist", { recursive: true });
fs.copyFileSync("vercel.json", "dist/vercel.json");
fs.mkdirSync("build", { recursive: true });
execFileSync("tar", [
  "-czf",
  "build/restaurant-function.tar.gz",
  "-C",
  "functions/restaurant-api",
  "package.json",
  "src",
]);
console.log(
  "Static site: dist/. Server bundle: build/restaurant-function.tar.gz. Not deployed.",
);
