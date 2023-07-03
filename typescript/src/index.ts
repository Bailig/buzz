import fastify from "fastify";
import ws from "@fastify/websocket";
import WebSocket from "ws";
import { Chat, User } from "./chat";

const server = fastify();
server.register(ws);

type SocketMessage =
  | {
      type: "joinChannel";
      payload: {
        channelId: number;
        channelName?: string;
        userId?: number;
      };
    }
  | {
      type: "sendMessage";
      payload: {
        channelId: number;
        messageContent: string;
        userId?: number;
      };
    }
  | {
      type: "leaveChannel";
      payload: {
        channelId: number;
        userId?: number;
      };
    };

const chat = new Chat();
const sockets = new Set<WebSocket>();
// for simplicity, we'll treat each connection as a user
const userSockets = new Map<number, WebSocket>();

server.get("/chat", { websocket: true }, async (connection, request) => {
  sockets.add(connection.socket);
  const user = new User();
  chat.addUser(user);
  userSockets.set(user.id, connection.socket);

  connection.socket.on("message", (message) => {
    const { type, payload }: SocketMessage = JSON.parse(message.toString());
    if (type === "joinChannel") {
      chat.handleJoinChannel(user.id, payload.channelId);
    } else if (type === "sendMessage") {
      chat.handleSendMessage(
        user.id,
        payload.channelId,
        payload.messageContent,
        (userId, channelId, message) => {
          const socket = userSockets.get(userId);
          socket!.send(
            JSON.stringify({ type: "message", payload: { message, channelId } })
          );
        }
      );
    } else if (type === "leaveChannel") {
      chat.handleLeaveChannel(user.id, payload.channelId);
    }
  });

  connection.socket.on("close", () => {
    chat.removeUser(user.id);
    userSockets.delete(user.id);
    sockets.delete(connection.socket);
  });
});

server.listen({ port: 8080 }, (err, address) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log(`Server listening at ${address}`);
});
