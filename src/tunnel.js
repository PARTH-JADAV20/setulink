const { Tunnel } = require("cloudflared");

async function startTunnel(port) {
  return new Promise((resolve, reject) => {
    // Use Tunnel.quick for unauthenticated tunnels (trycloudflare.com)
    const t = Tunnel.quick(`http://127.0.0.1:${port}`);

    // Show what's happening if it takes too long
    const timeout = setTimeout(() => {
      console.log("\nℹ Cloudflare is taking longer than usual to start...");
      console.log("ℹ This might be due to first-time binary download or network speed.\n");
    }, 15000);

    t.on("url", (url) => {
      clearTimeout(timeout);
      resolve({
        url,
        close: () => t.stop(),
        on: (event, cb) => {
          if (event === "error") {
            t.on("error", cb);
          }
        }
      });
    });

    // Capture process errors or connection failures
    t.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    t.on("exit", (code) => {
      clearTimeout(timeout);
      if (code !== 0 && code !== null) {
        reject(new Error(`Cloudflare process exited with code ${code}`));
      }
    });

    // Optional: Log stdout/stderr for debugging
    t.on("stdout", (data) => {
      if (process.env.DEBUG) console.log(`CF Out: ${data.trim()}`);
    });

    t.on("stderr", (data) => {
      // Always show errors
      if (data.includes("error") || data.includes("failed") || data.includes("fatal")) {
        console.error(`\nCF Error: ${data.trim()}`);
      }
      // If debug is on, show everything
      if (process.env.DEBUG) console.log(`CF Log: ${data.trim()}`);
    });
  });
}

module.exports = { startTunnel };
