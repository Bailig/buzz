import WebSocket from "ws";

function connect(url: string) {
  console.log("connect: ", url);
  const socket = new WebSocket(url);

  socket.on("open", () => {
    console.log("open");
    socket.send("test");
  });

  socket.on("message", (message) => {
    console.log(message.toString());
    socket.close();
  });
}

function run() {
  const [url = "ws://localhost:8080/hello-ws"] = process.argv.slice(2);
  connect(url);
}

run();
