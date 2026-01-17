const fs = require("fs");
const path = require("path");

function isViteProject() {
  const files = [
    "vite.config.js",
    "vite.config.ts"
  ];

  return files.some(file =>
    fs.existsSync(path.join(process.cwd(), file))
  );
}

module.exports = { isViteProject };
