import WebSocket from "ws";
import { InputMessage, OutputMessage } from "../src/schema";

function joinChannel(socket: WebSocket) {
  const channelId = 1;
  const join: Extract<InputMessage, { type: "joinChannel" }> = {
    type: "joinChannel",
    payload: {
      channelId,
      sentAt: new Date().getTime(),
    },
  };
  socket.send(JSON.stringify(join));
  return channelId;
}

function sendMessage(socket: WebSocket, channelId: number) {
  const messageContent = "hello world";
  const message: Extract<InputMessage, { type: "sendMessage" }> = {
    type: "sendMessage",
    payload: {
      channelId,
      messageContent,
      sentAt: new Date().getTime(),
    },
  };

  socket.send(JSON.stringify(message));
}

function connect(url: string) {
  const socket = new WebSocket(url);

  socket.on("open", () => {
    const channelId = joinChannel(socket);
    sendMessage(socket, channelId);
  });

  let myId: number | undefined = undefined;
  socket.on("message", (message) => {
    const { type, payload }: OutputMessage = JSON.parse(message.toString());
    if (type === "error") {
      throw new Error(payload);
    }

    if (type === "joinChannelSuccess") {
      myId = payload.userId;
    }

    if (type === "message" && myId === payload.ownerId) {
      const now = new Date();
      const then = new Date(payload.sentAt);
      const diff = now.getTime() - then.getTime();
      console.log(`Roundtrip time: ${diff}ms`);
    }
    socket.close();
  });
}

function run() {
  const [url = "ws://localhost:8080/chat"] = process.argv.slice(2);
  console.log(`Start connecting ${url}`);
  connect(url);
}

try {
  run();
} catch (e) {
  console.error(e);
}
