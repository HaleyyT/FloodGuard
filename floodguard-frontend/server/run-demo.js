import { spawn } from "node:child_process";
import process from "node:process";

const appHost = process.env.FLOODGUARD_DEMO_HOST ?? "127.0.0.1";
const appPort = process.env.FLOODGUARD_DEMO_PORT ?? "4173";
const apiHost = process.env.FLOODGUARD_API_HOST ?? "127.0.0.1";
const apiPort = process.env.FLOODGUARD_API_PORT ?? "5174";

const children = [];

function log(message) {
  process.stdout.write(`${message}\n`);
}

function forwardExit(signal = "SIGTERM") {
  for (const child of children) {
    if (!child.killed) child.kill(signal);
  }
}

process.on("SIGINT", () => {
  log("\nStopping FloodGuard demo services...");
  forwardExit("SIGINT");
  process.exit(0);
});

process.on("SIGTERM", () => {
  forwardExit("SIGTERM");
  process.exit(0);
});

function runStep(command, args, { name, env = process.env, required = true } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      env,
    });

    child.on("exit", (code) => {
      if (code === 0 || !required) {
        resolve(code ?? 0);
        return;
      }
      reject(new Error(`${name ?? command} exited with code ${code}`));
    });

    child.on("error", (error) => {
      if (required) {
        reject(error);
        return;
      }
      log(`Warning: ${name ?? command} failed to start: ${error.message}`);
      resolve(1);
    });
  });
}

function startService(command, args, { name, env = process.env } = {}) {
  const child = spawn(command, args, {
    stdio: "inherit",
    env,
  });

  children.push(child);

  child.on("exit", (code) => {
    if (code && code !== 0) {
      log(`${name ?? command} exited with code ${code}.`);
    }
  });

  child.on("error", (error) => {
    log(`${name ?? command} failed: ${error.message}`);
  });

  return child;
}

async function main() {
  if (process.argv.includes("--help")) {
    log("FloodGuard demo launcher");
    log("Runs one ingestion refresh, then starts the API on 5174 and the frontend on 4173.");
    log("Open http://127.0.0.1:4173/ once both services are running.");
    return;
  }

  log("Preparing FloodGuard demo...");
  log("Step 1/3: refreshing ingestion snapshot");

  try {
    await runStep(process.execPath, ["server/ingest.js"], {
      name: "ingest",
      required: false,
      env: { ...process.env, FLOODGUARD_API_HOST: apiHost, FLOODGUARD_API_PORT: apiPort },
    });
  } catch (error) {
    log(`Warning: ingestion refresh could not complete cleanly: ${error.message}`);
  }

  log("Step 2/3: starting API");
  startService(process.execPath, ["server/server.js"], {
    name: "api",
    env: { ...process.env, FLOODGUARD_API_HOST: apiHost, FLOODGUARD_API_PORT: apiPort },
  });

  log("Step 3/3: starting frontend");
  startService(process.execPath, ["./node_modules/vite/bin/vite.js", "--host", appHost, "--port", appPort], {
    name: "frontend",
    env: {
      ...process.env,
      VITE_FLOODGUARD_API_URL: `http://${apiHost}:${apiPort}/api/signals`,
      VITE_FLOODGUARD_AREAS_API_URL: `http://${apiHost}:${apiPort}/api/areas`,
      VITE_FLOODGUARD_HISTORY_API_URL: `http://${apiHost}:${apiPort}/api/history`,
      VITE_FLOODGUARD_FEATURES_API_URL: `http://${apiHost}:${apiPort}/api/features`,
      VITE_FLOODGUARD_DATASET_QUALITY_API_URL: `http://${apiHost}:${apiPort}/api/dataset-quality`,
      VITE_FLOODGUARD_BASELINE_API_URL: `http://${apiHost}:${apiPort}/api/baseline-prediction`,
      VITE_FLOODGUARD_MODEL_EXPERIMENT_API_URL: `http://${apiHost}:${apiPort}/api/model-experiment`,
      VITE_FLOODGUARD_MODEL_CARD_API_URL: `http://${apiHost}:${apiPort}/api/model-card`,
      VITE_FLOODGUARD_ML_REPORT_API_URL: `http://${apiHost}:${apiPort}/api/ml/report`,
      VITE_FLOODGUARD_COMMUNITY_REPORTS_API_URL: `http://${apiHost}:${apiPort}/api/community-reports`,
      VITE_FLOODGUARD_EVIDENCE_REVIEW_API_URL: `http://${apiHost}:${apiPort}/api/evidence-review`,
      VITE_FLOODGUARD_NOTIFICATIONS_API_URL: `http://${apiHost}:${apiPort}/api/notifications`,
    },
  });

  log("");
  log("FloodGuard demo services are starting.");
  log(`Open http://${appHost}:${appPort}/ in a browser.`);
  log(`The API is expected at http://${apiHost}:${apiPort}/api/health.`);
  log("Press Ctrl+C to stop both services.");
}

main().catch((error) => {
  log(`FloodGuard demo launcher failed: ${error.message}`);
  forwardExit("SIGTERM");
  process.exit(1);
});
