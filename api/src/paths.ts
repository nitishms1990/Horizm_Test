import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

/** The api/ directory itself, so spawned processes can be pointed at files inside it. */
export const API_ROOT = path.resolve(here, "..");

/** Where seeded scenes and uploaded images live; served at /media. */
export const MEDIA_DIR = path.resolve(API_ROOT, "media");
