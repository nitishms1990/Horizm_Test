import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

/** Where seeded scenes and uploaded images live; served at /media. */
export const MEDIA_DIR = path.resolve(here, "..", "media");
