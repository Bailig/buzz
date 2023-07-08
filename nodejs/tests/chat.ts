import WebSocket from "ws";
import { InputMessage, OutputMessage } from "../src/schema";
import fs from "node:fs";

// create and join 20 channels
const CHANNEL_COUNT = 20;

function joinAllChannels(socket: WebSocket, totalMemberCount: number) {
  for (let channelId = 0; channelId < CHANNEL_COUNT; channelId++) {
    const joinData: Extract<InputMessage, { type: "joinChannel" }> = {
      type: "joinChannel",
      payload: {
        channelId,
        sentAt: process.hrtime.bigint().toString(),
        totalMemberCount,
        totalChannelCount: CHANNEL_COUNT,
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
let totalJoinedClientCount = 0;
function connect(url: string, clientCount: number) {
  const socket = new WebSocket(url);

  socket.on("open", () => {
    joinAllChannels(socket, clientCount);
  });

  let myId: number | undefined = undefined;
  let startedSending = false;
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
      return;
    }

    if (type === "everybodyJoinedAllChannels") {
      if (startedSending) {
        throw new Error("Received everybodyJoinedAllChannels twice.");
      }
      startedSending = true;
      totalJoinedClientCount++;

      // wait for everybody else to receive this message, and then start sending messages
      setTimeout(() => {
        if (totalJoinedClientCount !== clientCount) {
          throw new Error(
            `Expected ${clientCount} clients to join, but only ${totalJoinedClientCount} joined.`
          );
        }
        for (let i = 0; i < 10; i++) {
          sendMessageToAllChannels(socket);
        }
      }, 1000);
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
}

function run() {
  const [clientCount = "1", url = "ws://localhost:8080/chat"] =
    process.argv.slice(2);
  console.log(`Connecting ${clientCount} clients to ${url}`);

  const _clientCount = parseInt(clientCount);
  if (isNaN(_clientCount)) {
    throw new Error(`Invalid client count: ${clientCount}`);
  }

  for (let i = 0; i < _clientCount; i++) {
    connect(url, _clientCount);
  }
}

run();
