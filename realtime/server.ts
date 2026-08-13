import { createServer } from "node:http";
import { WebSocketServer } from "ws";

const port = Number(process.env.REALTIME_PORT ?? 8080);

const httpServer = createServer((req, res) => {
  if (req.url === "/healthz") {
    res.writeHead(200, { "content-type": "text/plain" }).end("ok");
    return;
  }
  res.writeHead(404).end();
});

const wss = new WebSocketServer({ server: httpServer });

wss.on("connection", (socket) => {
  socket.on("message", (data) => {
    if (Buffer.isBuffer(data) && data.toString() === "ping") socket.send("pong");
  });
});

httpServer.listen(port, () => {
  console.log(`realtime server listening on :${port}`);
  console.log("LISTEN/NOTIFY subscription and auth arrive in Phase 2.");
});
