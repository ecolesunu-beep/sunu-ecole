// Remet les fichiers à leur place : "src__app__page.tsx" -> "src/app/page.tsx"
const fs = require("fs");
const path = require("path");
let n = 0;
for (const f of fs.readdirSync(".")) {
  if (f === "restore.js" || !f.includes("__") || !fs.statSync(f).isFile()) continue;
  const dest = f.split("__").join("/");
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.renameSync(f, dest);
  n++;
}
console.log("restore.js : " + n + " fichiers remis en place");
