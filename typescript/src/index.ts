import fastify from "fastify";
import ws from "@fastify/websocket";
import WebSocket from "ws";

const server = fastify();
server.register(ws);

const clients = new Set<WebSocket>();
const channels = new Map<string, Set<WebSocket>>();

server.get("/chat", { websocket: true }, async (connection, request) => {
  clients.add(connection.socket);
  connection.socket.on("message", (message) => {
    const { type, data } = JSON.parse(message.toString());
    if (type === "join") {
      const { channelId } = data;
      if (!channels.has(channelId)) {
        channels.set(channelId, new Set<WebSocket>());
      }
      channels.get(channelId)!.add(connection.socket);
    } else if (type === "send") {
      const { channelId, message } = data;
      const channel = channels.get(channelId);
      if (!channel) {
        connection.socket.send(
          {
            type: "error",
            message: "Channel not found!",
          }.toString()
        );
      } else
        for (const client of channel) {
          client.send(message);
        }
    } else if (type === "leave") {
      const { channelId } = data;
      const channel = channels.get(channelId);
      if (!channel) {
        connection.socket.send(
          {
            type: "error",
            message: "Channel not found!",
          }.toString()
        );
      } else {
        channel.delete(connection.socket);
        if (channel.size === 0) {
          channels.delete(channelId);
        }
      }
    }
  });

  connection.socket.on("close", () => {
    clients.delete(connection.socket);
  });
});

server.listen({ port: 8080 }, (err, address) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log(`Server listening at ${address}`);
});
