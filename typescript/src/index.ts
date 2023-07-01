import fastify from "fastify";
import ws from "@fastify/websocket";
import WebSocket from "ws";

const server = fastify();
server.register(ws);

const sockets = new Set<WebSocket>();
const channels = new Map<number, Channel>();

class User {
  private static idCounter = 0;
  id: number;
  constructor() {
    this.id = User.idCounter++;
  }
}

class Message {
  private static idCounter = 0;
  id: number;
  ownerId: number;
  content: string;
  channelId: number;
  constructor(ownerId: number, content: string, channelId: number) {
    this.id = Message.idCounter++;
    this.ownerId = ownerId;
    this.content = content;
    this.channelId = channelId;
  }
}

class Channel {
  private static idCounter = 0;
  id: number;
  name = "Channel";
  private members = new Map<number, User>();
  private messages = new Map<number, Message>();
  private messageOrder = new Array<number>();

  constructor(name?: string) {
    this.id = Channel.idCounter++;
    if (name) {
      this.name = name;
    }
  }

  join(user: User) {
    this.members.set(user.id, user);
  }

  remove(user: User) {
    this.members.delete(user.id);
    if (this.members.size === 0) {
      this.clear();
    }
  }

  getMessages() {
    return this.messageOrder.map((id) => this.messages.get(id));
  }

  send(message: Message) {
    this.messages.set(message.id, message);
    this.messageOrder.push(message.id);
  }

  getMembers() {
    return Array.from(this.members.values());
  }

  getMemberCount() {
    return this.members.size;
  }

  private clear() {
    this.members.clear();
    this.messages.clear();
    this.messageOrder = [];
  }
}

type SocketMessage =
  | {
      type: "join";
      payload: {
        channelId: number;
        channelName?: string;
        userId?: number;
      };
    }
  | {
      type: "send";
      payload: {
        channelId: number;
        messageContent: string;
        userId?: number;
      };
    }
  | {
      type: "leave";
      payload: {
        channelId: number;
        userId?: number;
      };
    };

const users = new Map<number, User>();
const userSockets = new Map<number, WebSocket>();

server.get("/chat", { websocket: true }, async (connection, request) => {
  sockets.add(connection.socket);
  const user = new User();
  users.set(user.id, user);
  userSockets.set(user.id, connection.socket);

  connection.socket.on("message", (message) => {
    const { type, payload }: SocketMessage = JSON.parse(message.toString());
    if (type === "join") {
      const { channelId } = payload;
      if (!channels.has(channelId)) {
        channels.set(channelId, new Channel(payload.channelName));
      }
      const channel = channels.get(channelId)!;
      channel.join(user);
      const socket = userSockets.get(user.id);
      if (!socket) {
        connection.socket.send(
          { type: "error", message: "User not found" }.toString()
        );
      } else {
        socket.send(
          {
            type: "joined",
            payload: { messages: channel.getMessages() },
          }.toString()
        );
      }
    } else if (type === "send") {
      const { channelId, messageContent } = payload;
      const channel = channels.get(channelId);
      if (!channel) {
        connection.socket.send(
          { type: "error", message: "Channel not found!" }.toString()
        );
      } else {
        const message = new Message(user.id, messageContent, channelId);
        channel.send(message);
        for (const user of channel.getMembers()) {
          const socket = userSockets.get(user.id);
          socket!.send({ type: "message", payload: { message } }.toString());
        }
      }
    } else if (type === "leave") {
      const { channelId } = payload;
      const channel = channels.get(channelId);
      if (!channel) {
        connection.socket.send(
          { type: "error", message: "Channel not found!" }.toString()
        );
      } else {
        channel.remove(user);
        if (channel.getMemberCount() === 0) {
          channels.delete(channelId);
        }
      }
    }
  });

  connection.socket.on("close", () => {
    users.delete(user.id);
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
