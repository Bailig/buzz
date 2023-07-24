import fastify from "fastify";
import ws from "@fastify/websocket";
import WebSocket from "ws";
import { Chat, User } from "./chat.js";
import type { InputMessage, OutputMessage } from "./schema.js";

const server = fastify();
await server.register(ws);

const chat = new Chat();
const sockets = new Set<WebSocket>();
// for simplicity, we'll treat each connection as a user
const userSockets = new Map<number, WebSocket>();

server.get("/chat", { websocket: true }, async (connection) => {
  sockets.add(connection.socket);
  const user = new User();
  chat.addUser(user);
  userSockets.set(user.id, connection.socket);

  connection.socket.on("message", (message) => {
    try {
      const { type, payload }: InputMessage = JSON.parse(message.toString());
      if (type === "joinChannel") {
        chat.handleJoinChannel({
          userId: user.id,
          channelId: payload.channelId,
          onJoinChannelSuccess: () =>
            connection.socket.send(
              JSON.stringify({
                type: "joinChannelSuccess",
                payload: {
                  userId: user.id,
                  channelId: payload.channelId,
                },
              } satisfies OutputMessage)
            ),
        });
      } else if (type === "sendMessage") {
        chat.handleSendMessage({
          userId: user.id,
          channelId: payload.channelId,
          message: payload.messageContent,
          sentAt: payload.sentAt,
          onSendMessage: (receiverId, message) => {
            const socket = userSockets.get(receiverId);
            if (!socket) {
              throw new Error("User not found");
            }
            socket.send(
              JSON.stringify({
                type: "message",
                payload: message,
              } satisfies OutputMessage)
            );
          },
        });
      } else if (type === "leaveChannel") {
        chat.handleLeaveChannel(user.id, payload.channelId);
      }
    } catch (e) {
      connection.socket.send(
        JSON.stringify({
          type: "error",
          payload: JSON.stringify(e),
        } satisfies OutputMessage)
      );
    }
  });

  connection.socket.on("close", () => {
    chat.removeUser(user.id);
    userSockets.delete(user.id);
    sockets.delete(connection.socket);
  });
});

server.get("/hello", async () => {
  return "Hello world";
});

server.get("/hello-ws", { websocket: true }, (connection) => {
  console.log("hello ws");
  connection.socket.on("message", (message) => {
    console.log("hello message", message.toString());
    connection.socket.send("Hello world: " + message.toString());
  });
});

server.listen({ port: 8080 }, (err, address) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log(`Server listening at ${address}`);
});
