type SharedPayload = {
  sentAt: string;
};

export type InputMessage = { payload: SharedPayload } & (
  | {
      type: "joinChannel";
      payload: {
        channelId: number;
      };
    }
  | {
      type: "sendMessage";
      payload: {
        channelId: number;
        messageContent: string;
        userId?: number;
      };
    }
  | {
      type: "leaveChannel";
      payload: {
        channelId: number;
        userId?: number;
      };
    }
);

export type OutputMessage =
  | {
      type: "joinChannelSuccess";
      payload: {
        userId: number;
        channelId: number;
      };
    }
  | {
      type: "message";
      payload: {
        id: number;
        ownerId: number;
        content: string;
        channelId: number;
        sentAt: string;
      };
    }
  | {
      type: "error";
      payload: string;
    };
