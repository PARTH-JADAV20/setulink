const fs = require("fs");
const path = require("path");

function updateViteConfig() {
  const configPath = ["vite.config.js", "vite.config.ts"]
    .map(f => path.join(process.cwd(), f))
    .find(fs.existsSync);

  if (!configPath) {
    return { updated: false, reason: "not-found" };
  }

  let content = fs.readFileSync(configPath, "utf8");
  let modified = false;

  // Ensure server block exists
  if (!content.includes("server:")) {
    content = content.replace(
      /defineConfig\s*\(\s*{/,
      `defineConfig({\n  server: {},\n`
    );
    modified = true;
  }

  // Inject host: true
  if (!content.includes("host:")) {
    content = content.replace(
      /server\s*:\s*{/,
      `server: {\n    host: true,`
    );
    modified = true;
  }

  // Inject allowedHosts: true
  if (!content.includes("allowedHosts")) {
    content = content.replace(
      /server\s*:\s*{/,
      `server: {\n    allowedHosts: true,`
    );
    modified = true;
  } else if (content.includes('allowedHosts: "all"')) {
    content = content.replace('allowedHosts: "all"', 'allowedHosts: true');
    modified = true;
  }

  // Inject hmr settings for tunnel support
  if (!content.includes("hmr:")) {
    content = content.replace(
      /server\s*:\s*{/,
      `server: {\n    hmr: { clientPort: 443 },`
    );
    modified = true;
  } else if (!content.includes("clientPort: 443")) {
    // If hmr exists but clientPort is wrong/missing
    content = content.replace(
      /hmr\s*:\s*{([\s\S]*?)}/,
      (match, inner) => `hmr: { clientPort: 443, ${inner.trim()} }`
    );
    modified = true;
  }

  if (modified) {
    fs.writeFileSync(configPath, content, "utf8");
    return { updated: true };
  }

  return { updated: true, already: true };
}

module.exports = { updateViteConfig };
