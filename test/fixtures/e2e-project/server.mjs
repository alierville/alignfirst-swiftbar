// Dev server of the end-to-end fixture: AlignFirst starts it with its `web` port in PORT.
import { createServer } from "node:http";

const port = Number(process.env.PORT);
createServer((_request, response) => response.end("ok")).listen(port, "127.0.0.1", () => {
  console.log(`listening on ${port}`);
});
