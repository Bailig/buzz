export class Chat {
  private static idCounter = 0;
  id: number;
  private channels = new Map<number, Channel>();
  private users = new Map<number, User>();

  constructor() {
    this.id = Chat.idCounter++;
  }

  addUser(user: User) {
    this.users.set(user.id, user);
  }

  removeUser(userId: number) {
    const user = this.users.get(userId);
    if (!user) {
      throw new Error("User not found");
    }
    for (const channelId of user.getChannelIds()) {
      const channel = this.channels.get(channelId);
      if (!channel) {
        throw new Error("Channel not found");
      }
      channel.removeMember(user);
    }
    this.users.delete(user.id);
    user.clear();
  }

  private getOrCreateChannel(channelId: number) {
    if (!this.channels.has(channelId)) {
      this.channels.set(channelId, new Channel());
    }
    return this.channels.get(channelId)!;
  }

  handleJoinChannel(userId: number, channelId: number) {
    const user = this.users.get(userId);
    if (!user) {
      throw new Error("User not found");
    }
    const channel = this.getOrCreateChannel(channelId);
    channel.addMember(user);
    user.joinChannel(channelId);
  }

  handleSendMessage(
    userId: number,
    channelId: number,
    message: string,
    sentAt: string,
    sendMessage: (receiverId: number, message: Message) => void
  ) {
    const user = this.users.get(userId);
    if (!user) {
      throw new Error("User not found");
    }
    const channel = this.channels.get(channelId);
    if (!channel) {
      throw new Error("Channel not found");
    }
    const messageObj = new Message({
      ownerId: userId,
      content: message,
      channelId,
      sentAt,
    });
    channel.saveMessage(messageObj);
    for (const member of channel.getMembers()) {
      sendMessage(member.id, messageObj);
    }
  }

  handleLeaveChannel(userId: number, channelId: number) {
    const user = this.users.get(userId);
    if (!user) {
      throw new Error("User not found");
    }
    const channel = this.channels.get(channelId);
    if (!channel) {
      throw new Error("Channel not found");
    }
    channel.removeMember(user);
    user.leaveChannel(channelId);
  }
}

export class User {
  private static idCounter = 0;
  id: number;
  private channelIds = new Set<number>();
  constructor() {
    this.id = User.idCounter++;
  }

  getChannelIds() {
    return this.channelIds;
  }

  joinChannel(channelId: number) {
    this.channelIds.add(channelId);
  }

  leaveChannel(channelId: number) {
    this.channelIds.delete(channelId);
  }

  clear() {
    this.channelIds.clear();
  }
}

class Message {
  private static idCounter = 0;
  id: number;
  ownerId: number;
  content: string;
  channelId: number;
  sentAt: string;

  constructor({
    ownerId,
    content,
    channelId,
    sentAt,
  }: {
    ownerId: number;
    content: string;
    channelId: number;
    sentAt: string;
  }) {
    this.id = Message.idCounter++;
    this.ownerId = ownerId;
    this.content = content;
    this.channelId = channelId;
    this.sentAt = sentAt;
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

  addMember(user: User) {
    this.members.set(user.id, user);
  }

  removeMember(user: User) {
    this.members.delete(user.id);
    if (this.members.size === 0) {
      this.clear();
    }
  }

  getMessages() {
    return this.messageOrder.map((id) => this.messages.get(id));
  }

  saveMessage(message: Message) {
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
