type User = {
  id: number;
  name: string;
  channels: Channel[];
};

type Channel = {
  id: number;
  members: User[];
  messages: Message[];
};

type Message = {
  id: number;
  owner: User;
  channel: Channel;
  content: string;
};
