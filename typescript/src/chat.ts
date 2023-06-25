interface Chat {
  join(user: User): this;
  send(message: string): this;
}

interface User {
  id: number;
  send(message: string): void;
}

export class ChatImpl implements Chat {
  private users: User[] = [];
  constructor() {}
  join(user: User): this {
    this.users.push(user);
    return this;
  }
  send(message: string): this {
    for (const user of this.users) {
      user.send(message);
    }
    return this;
  }
}

export class UserImpl implements User {
  private static count = 0;
  private id: number;
  private name: string;
  constructor(name: string) {
    this.id = UserImpl.count++;
    this.name = name;
  }
  send(message: string): void {
    console.log(`user${this.id}: ${message}`);
  }
}

const chat = new ChatImpl();
const user1 = {
  id: 1,
  send: (message: string) => console.log(`user1: ${message}`),
};
