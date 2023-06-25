import fastify from "fastify";
import ws from "@fastify/websocket";
import WebSocket from "ws";

const server = fastify();
server.register(ws);

const clients = new Set<WebSocket>();
const chatRooms = new Map<string, Set<WebSocket>>();

server.get("/chat", { websocket: true }, async (connection, request) => {
  clients.add(connection.socket);
  connection.socket.on("message", (message) => {
    const { type, data } = JSON.parse(message.toString());
    if (type === "join") {
      const { room } = data;
      if (!chatRooms.has(room)) {
        chatRooms.set(room, new Set<WebSocket>());
      }
      chatRooms.get(room)!.add(connection.socket);
    }
    if (type === "send") {
      const { room, message } = data;

      for (const client of chatRooms.get(room)) {
        client.send(message);
      }
    }
    if (type === "leave") {
      const { room } = data;
      chatRooms.get(room)!.delete(connection.socket);
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
