import WebSocket from "ws";
import { InputMessage, OutputMessage } from "../src/schema";

// create and join 20 channels
const CHANNEL_COUNT = 20;

function joinAllChannels(socket: WebSocket) {
  for (let channelId = 0; channelId < CHANNEL_COUNT; channelId++) {
    const joinData: Extract<InputMessage, { type: "joinChannel" }> = {
      type: "joinChannel",
      payload: {
        channelId,
        sentAt: process.hrtime.bigint().toString(),
      },
    };
    socket.send(JSON.stringify(joinData));
  }
}

function sendMessageToAllChannels(socket: WebSocket) {
  const messageContent = "hello world";
  for (let channelId = 0; channelId < CHANNEL_COUNT; channelId++) {
    const message: Extract<InputMessage, { type: "sendMessage" }> = {
      type: "sendMessage",
      payload: {
        channelId,
        messageContent,
        sentAt: process.hrtime.bigint().toString(),
      },
    };
    socket.send(JSON.stringify(message));
  }
}

function connect(url: string) {
  const socket = new WebSocket(url);

  socket.on("open", () => {
    joinAllChannels(socket);
  });

  const channelHandler = new ChannelHandler();
  socket.on("message", (message) => {
    const { type, payload }: OutputMessage = JSON.parse(message.toString());
    if (type === "error") {
      throw new Error(payload);
    }

    if (type === "joinChannelSuccess") {
      channelHandler.handleJoinChannelSuccess(payload, () =>
        sendMessageToAllChannels(socket)
      );
      return;
    }

    if (type === "message") {
      if (channelHandler.getMyId() === payload.ownerId) {
        const now = process.hrtime.bigint();
        const then = BigInt(payload.sentAt);
        const diffNs = now - then;
        if (diffNs > Number.MAX_SAFE_INTEGER) {
          throw new Error("Time difference is too large!");
        }
        const diffMs = Number(diffNs) / 1_000_000;
        console.log(`Round trip time: ${diffMs}ms`);
      }
    }
  });
}

class ChannelHandler {
  private myId: number | undefined = undefined;
  private channelIds: number[] = [];
  private startedSendingMessages = false;

  constructor() {}

  getMyId() {
    if (this.myId === undefined) {
      throw new Error("My ID is not set yet!");
    }
    return this.myId;
  }

  handleJoinChannelSuccess(
    payload: Extract<OutputMessage, { type: "joinChannelSuccess" }>["payload"],
    startSendingMessages: () => void
  ) {
    if (typeof this.myId === "number" && this.myId !== payload.userId) {
      throw new Error("My ID changed. This is a bug.");
    }
    if (this.channelIds.includes(payload.channelId)) {
      throw new Error("Joined the same channel twice! This is a bug.");
    }
    this.myId = payload.userId;
    this.channelIds.push(payload.channelId);
    if (this.channelIds.length < CHANNEL_COUNT) {
      return;
    }
    if (this.channelIds.length > CHANNEL_COUNT) {
      throw new Error("Joined too many channels! This is a bug.");
    }
    if (this.startedSendingMessages) {
      throw new Error(
        "Already started sending messages! This is a bug. This should only be called once."
      );
    }
    this.startedSendingMessages = true;
    startSendingMessages();
  }
}

function run() {
  const [clientCount = "1", url = "ws://localhost:8080/chat"] =
    process.argv.slice(2);
  console.log(`Connecting ${clientCount} clients to ${url}`);
  for (let i = 0; i < parseInt(clientCount); i++) {
    connect(url);
  }
}

try {
  run();
} catch (e) {
  console.error(e);
  process.exit(1);
}
