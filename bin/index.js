#!/usr/bin/env node

const net = require("net");
const fs = require("fs");
const path = require("path");

const { program } = require("commander");
const { startTunnel } = require("../src/tunnel");
const { spinner, log } = require("../src/logger");
const { isViteProject } = require("../src/detectVite");
const { askYesNo, askChoice } = require("../src/prompt");
const { updateViteConfig } = require("../src/updateViteConfig");

program
  .name("setulink")
  .description("Expose local server with a temporary public URL using Cloudflare")
  .option("-p, --port <number>", "Local port")
  .option("-d, --debug", "Show debug logs")
  .parse();

const options = program.opts();
if (options.debug) process.env.DEBUG = "true";

/**
 * Checks if a port is active on localhost or 127.0.0.1
 */
async function isPortActive(port, timeout = 1000) {
  const targets = ["127.0.0.1", "localhost"];

  for (const host of targets) {
    const active = await new Promise((resolve) => {
      const socket = new net.Socket();

      socket.setTimeout(timeout);
      socket.once("connect", () => {
        socket.destroy();
        resolve(true);
      });
      socket.once("timeout", () => {
        socket.destroy();
        resolve(false);
      });
      socket.once("error", () => {
        socket.destroy();
        resolve(false);
      });

      socket.connect(port, host);
    });

    if (active) return true;
  }

  return false;
}

/**
 * Scans a range of ports for active listeners
 */
async function findActivePorts({
  priorityPorts = [],
  startPort = 3000,
  endPort = 10000,
  timeout = 600,
  batchSize = 100,
  maxResults = 5
} = {}) {
  const activePorts = new Set();

  // 1️⃣ Scan priority ports first
  if (priorityPorts.length) {
    const results = await Promise.all(
      priorityPorts.map(p =>
        isPortActive(p, timeout).then(active => (active ? p : null))
      )
    );

    results.filter(Boolean).forEach(p => activePorts.add(p));

    if (activePorts.size >= maxResults) {
      return Array.from(activePorts);
    }
  }

  // 2️⃣ Scan range in batches
  for (let i = startPort; i <= endPort; i += batchSize) {
    const batch = [];

    for (let p = i; p < i + batchSize && p <= endPort; p++) {
      // Skip ports already checked
      if (!activePorts.has(p)) {
        batch.push(p);
      }
    }

    const results = await Promise.all(
      batch.map(p =>
        isPortActive(p, timeout).then(active => (active ? p : null))
      )
    );

    results.filter(Boolean).forEach(p => activePorts.add(p));

    // 🛑 Early exit if enough ports found
    if (activePorts.size >= maxResults) {
      break;
    }
  }

  return Array.from(activePorts);
}
/**
 * Formats duration in minutes and seconds
 */
function formatDuration(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

(async () => {
  const startTime = Date.now();
  let publicUrl = "";

  try {
    let port = options.port;
    const isViteEnv = isViteProject(); // Check if working dir is a Vite project

    if (!port) {
      spinner.start("Searching for active local servers...");
      const activePorts = await findActivePorts({
        priorityPorts: [5173, 5174, 3000, 3001, 8080],
        startPort: 3000,
        endPort: 10000
      });

      spinner.stop();

      if (activePorts.length === 0) {
        log.error("No active local servers found between ports 3000-6000.");
        console.log("💡 Start your server (e.g., npm run dev) first or specify a port with --port.");
        process.exit(1);
      } else if (activePorts.length === 1) {
        port = activePorts[0];
        log.success(`Auto-detected active server on port ${port}`);
      } else {
        const choices = activePorts.map(p => ({
          label: `http://localhost:${p} ${p >= 5173 ? " (likely Vite)" : " (backend)"}`,
          value: p
        }));

        port = await askChoice("\n🔍 Multiple local servers detected:", choices);
      }
    } else {
      if (!(await isPortActive(port))) {
        log.error(`No local server found on port ${port}`);
        console.log(`💡 Make sure your server is running first.`);
        process.exit(1);
      }
    }

    // Check for cloudflared binary to advise about first-run download
    const { bin: cfBin } = require("cloudflared");
    if (!fs.existsSync(cfBin)) {
      console.log("ℹ First-time setup: setulink is downloading the Cloudflare engine...");
      console.log("ℹ This may take a minute depending on your connection.\n");
    }

    spinner.start("Starting Cloudflare Tunnel...");
    const tunnel = await startTunnel(port);
    publicUrl = tunnel.url;
    spinner.stop();

    log.success("Cloudflare Tunnel started");
    console.log("\n🌍 Public URL:");
    console.log(publicUrl);
    console.log("\nℹ Tunnel is active while this process is running");
    console.log("ℹ Press Ctrl + C to stop\n");

    /* -------- VITE HELPER -------- */
    // Only prompt if it's a vite project AND the port looks like a vite port (or was auto-detected)
    if (isViteEnv) {
      console.log("⚠️  Vite project detected");

      const consent = await askYesNo(
        "Do you want setulink to optimize vite.config.js for tunneling? (y/N): "
      );

      if (consent) {
        const result = updateViteConfig();

        if (result.updated && !result.already) {
          console.log("✔ vite.config.js updated (host, allowedHosts & hmr configured)");
          console.log("ℹ Restart Vite dev server to apply changes\n");
        } else if (result.already) {
          console.log("ℹ vite.config.js already optimized for setulink\n");
        }
      } else {
        console.log(
          "\nℹ To allow the tunnel manually, ensure your vite.config.js has:\n" +
          "server: {\n  host: true,\n  allowedHosts: true,\n  hmr: { clientPort: 443 }\n}\n"
        );
      }
    }

    process.on("SIGINT", async () => {
      await tunnel.close();
      const duration = formatDuration(Date.now() - startTime);

      console.log("\n\n🔒 Tunnel closed");
      console.log(`⏱ Session duration: ${duration}`);
      console.log(`🌍 URL was: ${publicUrl}\n`);

      process.exit();
    });

    // Keep process alive indefinitely
    setInterval(() => { }, 1000 * 60 * 60);

  } catch (err) {
    spinner.stop();
    log.error("Failed to start tunnel");
    if (process.env.DEBUG) console.error(err);
    console.log("💡 Possible reasons:");
    console.log("- Firewall or antivirus blocking connection");
    console.log("- VPN / office network restriction");
    console.log("- Cloudflare service unavailable");
    process.exit(1);
  }
})();
