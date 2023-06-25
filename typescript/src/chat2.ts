type User = {
  id: number;
  name: string;
};

type Message = {
  id: number;
  ownerId: number;
  content: string;
};

type Chat = {
  // id: number;
  // messages: Message[];
  // users: User[];
};

interface Server {
  on(event: "message", handler: (payload: Message) => void): this;
  on(event: "join", handler: (payload: User) => void): this;
  send(id: number, message: Message): this;
}

export class ChatImpl implements Chat {
  static count = 0;
  private id: number;
  private messages: Message[];
  private users: User[];

  constructor(server: Server) {
    this.id = ChatImpl.count;
    ChatImpl.count++;
    this.messages = [];
    this.users = [];
    this.listenToMessage(server);
    this.listenToJoinChat(server);
  }

  private listenToMessage(server: Server) {
    server.on("message", (message) => {
      this.messages.push(message);
      for (const user of this.users) {
        server.send(user.id, message);
      }
    });
  }

  private listenToJoinChat(server: Server) {
    server.on("join", (user) => {
      this.users.push(user);
    });
  }
}
