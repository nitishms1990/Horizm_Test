/**
 * Runs the API and the web app together, so `npm run dev` at the root is all anyone
 * needs. Output from both is prefixed; Ctrl+C stops both.
 */
import { spawn } from "node:child_process";

const services = [
  { name: "api", color: "[32m", args: ["--prefix", "api", "run", "dev"] },
  { name: "web", color: "[36m", args: ["--prefix", "web", "run", "dev"] },
];

const children = services.map((service) => {
  const child = spawn("npm", service.args, { shell: true });
  const prefix = `${service.color}[${service.name}][0m`;

  for (const stream of [child.stdout, child.stderr]) {
    stream.setEncoding("utf8");
    stream.on("data", (chunk) => {
      for (const line of chunk.split("\n")) {
        if (line.trim()) console.log(`${prefix} ${line}`);
      }
    });
  }

  child.on("exit", (code) => {
    console.log(`${prefix} exited with code ${code}`);
    stopAll();
  });

  return child;
});

let stopping = false;
function stopAll() {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill();
  process.exit(0);
}

process.on("SIGINT", stopAll);
process.on("SIGTERM", stopAll);

console.log("API on http://127.0.0.1:4000 · app on http://localhost:3000");
