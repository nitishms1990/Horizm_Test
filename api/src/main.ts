import { buildServer } from "./server.js";

const PORT = Number(process.env.PORT ?? 4000);

const app = await buildServer();
await app.listen({ port: PORT, host: "127.0.0.1" });
app.log.info(`API listening on http://127.0.0.1:${PORT}`);
