import { createApp } from "./app.mjs";
import { createHttpServer } from "./server.mjs";

const app = await createApp();
const server = createHttpServer(app);
const requested = Number(process.env.PORT ?? 8080);

server.listen(requested, () => {
  console.log(`mullet url shortener listening on port ${server.address().port}`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, async () => {
    server.close();
    await app.close();
    process.exit(0);
  });
}
