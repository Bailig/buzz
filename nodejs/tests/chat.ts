import WebSocket from "ws";
import { InputMessage, OutputMessage } from "../src/schema";
import fs from "node:fs";

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

class DiffSaver {
  private diffs: number[] = [];
  private lastPushTime = Date.now();
  private timer: NodeJS.Timeout | undefined = undefined;

  push(diffMs: number) {
    this.diffs.push(diffMs);
    this.lastPushTime = Date.now();

    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      if (Date.now() - this.lastPushTime > 10_000) {
        this.save();
      }
    }, 10_000);
  }

  private save() {
    const csv = "diffs\n" + this.diffs.join("\n");
    const filename = `./data/result-${new Date().toISOString()}.csv`;
    console.log(`Saving to ${filename}`);
    fs.writeFileSync(filename, csv);
    process.exit(0);
  }
}

const diffSaver = new DiffSaver();
function connect(url: string, onJoinedAllChannels: () => void) {
  const socket = new WebSocket(url);

  socket.on("open", () => {
    joinAllChannels(socket);
  });

  let myId: number | undefined = undefined;
  let joinedChannelCount = 0;
  socket.on("message", (message) => {
    const { type, payload }: OutputMessage = JSON.parse(message.toString());
    if (type === "error") {
      throw new Error(payload);
    }

    if (type === "joinChannelSuccess") {
      if (typeof myId === "number" && myId !== payload.userId) {
        throw new Error("My ID changed. is a bug.");
      }
      myId = payload.userId;
      joinedChannelCount++;

      if (joinedChannelCount > CHANNEL_COUNT) {
        throw new Error("Joined too much channel. It's impossible");
      }
      if (joinedChannelCount === CHANNEL_COUNT) {
        onJoinedAllChannels();
      }
      return;
    }

    if (type === "message") {
      if (myId === undefined) {
        throw new Error(
          "My ID is not set. This is a bug. You should only receive messages after joining a channel."
        );
      }
      // only care about messages sent by me
      if (typeof myId === "number" && myId === payload.ownerId) {
        const now = process.hrtime.bigint();
        const then = BigInt(payload.sentAt);
        const diffNs = now - then;
        if (diffNs > Number.MAX_SAFE_INTEGER) {
          throw new Error("Time difference is too large!");
        }
        const diffMs = Number(diffNs) / 1_000_000;
        diffSaver.push(diffMs);
      }
    }
  });

  return socket;
}

function run() {
  const [clientCount = "1", url = "ws://localhost:8080/chat"] =
    process.argv.slice(2);
  console.log(`Connecting ${clientCount} clients to ${url}`);

  const _clientCount = parseInt(clientCount);
  if (isNaN(_clientCount)) {
    throw new Error(`Invalid client count: ${clientCount}`);
  }

  let totalJoinedClientCount = 0;
  let startedSending = false;
  const sockets = new Array(_clientCount);

  for (let i = 0; i < _clientCount; i++) {
    const socket = connect(url, () => {
      totalJoinedClientCount++;

      if (totalJoinedClientCount > _clientCount) {
        throw new Error("More client joined than created? It's impossible");
      }
      if (totalJoinedClientCount === _clientCount) {
        if (startedSending) {
          throw new Error(
            "You can only start sending messages once. This should not happen."
          );
        }
        startedSending = true;
        for (const _socket of sockets) {
          for (let i = 0; i < 10; i++) {
            sendMessageToAllChannels(_socket);
          }
        }
      }
    });
    sockets[i] = socket;
  }
}

run();
