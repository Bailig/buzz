use futures_util::{
    future,
    stream::{SplitSink, SplitStream},
    SinkExt, StreamExt,
};
use serde::{Deserialize, Serialize};
use std::{
    env,
    time::{SystemTime, UNIX_EPOCH},
};
use tokio::{net::TcpStream, sync::mpsc};
use tokio_tungstenite::{tungstenite::Message, MaybeTlsStream, WebSocketStream};

const CHANNEL_COUNT: u32 = 20;

#[tokio::main]
async fn main() {
    let args: Vec<String> = env::args().collect();
    let client_count = args
        .get(1)
        .unwrap_or(&String::from("1"))
        .parse::<u32>()
        .unwrap();
    let default_url_string = String::from("ws://localhost:8080/chat");
    let url_string = args.get(2).unwrap_or(&default_url_string);

    println!("Connecting {} clients to {}", client_count, url_string);

    let mut connection_futures = vec![];

    for _ in 0..client_count {
        connection_futures.push(connect(url_string));
    }

    let mut read_futures = vec![];
    let mut write_futures = vec![];
    future::join_all(connection_futures)
        .await
        .into_iter()
        .for_each(|(user_id, write, read)| {
            read_futures.push(read_messages(user_id, read));
            write_futures.push(send_message_to_all_channels(user_id, write));
        });

    let read_future = future::join_all(read_futures);
    let write_future = future::join_all(write_futures);

    future::select(read_future, write_future).await;
}

async fn read_messages(user_id: u32, mut read: SplitStreamRead) {
    while let Some(Ok(message)) = read.next().await {
        let message_string = message.into_text().unwrap();
        let message: OutputMessage = serde_json::from_str(&message_string).unwrap();
        match message {
            OutputMessage::Message { payload } => {
                if payload.owner_id == user_id {
                    let now = SystemTime::now()
                        .duration_since(UNIX_EPOCH)
                        .unwrap()
                        .as_micros();
                    let diff = now
                        - payload
                            .sent_at
                            .parse::<u128>()
                            .expect("sent_at must be a stirng of numbers.");
                    println!("TIME,{}", diff);
                }
            }
            OutputMessage::JoinChannelSuccess { payload: _ } => {
                panic!("This should never happen because we only start sending messages when everybody is joinded.");
            }
        }
    }
}

type SplitStreamWrite = SplitSink<WebSocketStream<MaybeTlsStream<TcpStream>>, Message>;
type SplitStreamRead = SplitStream<WebSocketStream<MaybeTlsStream<TcpStream>>>;

async fn connect(url: &str) -> (u32, SplitStreamWrite, SplitStreamRead) {
    let (ws_stream, _) = tokio_tungstenite::connect_async(url).await.unwrap();
    let (mut write, mut read) = ws_stream.split();

    join_all_channels(&mut write).await;

    let mut my_id: Option<u32> = None;

    let mut joined_count = 0;
    while let Some(Ok(message)) = read.next().await {
        let message_string = message.into_text().unwrap();

        let message: OutputMessage = serde_json::from_str(&message_string).unwrap();
        match message {
            OutputMessage::JoinChannelSuccess { payload } => {
                if let Some(id) = my_id {
                    if id != payload.user_id {
                        panic!("My ID changed. is a bug.");
                    }
                }
                my_id = Some(payload.user_id);
                joined_count += 1;
                if joined_count > CHANNEL_COUNT {
                    panic!("Joined too much channel. It's impossible");
                }
                if joined_count == CHANNEL_COUNT {
                    break;
                }
            }
            OutputMessage::Message { payload: _ } => {
                panic!("We stop reading the web socket stream as soon as we finish joining the channles, and only start sending message when all clients are joined, so this should never be triggered.");
            }
        };
    }
    if let Some(id) = my_id {
        (id, write, read)
    } else {
        panic!("Didn't receive an User ID");
    }
}

async fn send_message_to_all_channels(user_id: u32, mut write: SplitStreamWrite) {
    let (tx, mut rx) = mpsc::channel(CHANNEL_COUNT as usize);

    for channel_id in 0..CHANNEL_COUNT {
        let message = InputMessage::SendMessage {
            payload: SendMessagePayload {
                channel_id,
                message_content: "hello world".to_string(),
                sent_at: SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap()
                    .as_micros()
                    .to_string(),
                user_id,
            },
        };
        let message_string = serde_json::to_string(&message).unwrap();
        let _tx = tx.clone();
        tokio::spawn(async move {
            let message = Message::Text(message_string);
            _tx.send(message).await.unwrap();
        });
    }

    while let Some(message) = rx.recv().await {
        write.send(message).await.expect("Failed to send message.");
    }
}

async fn join_all_channels(
    write: &mut SplitSink<WebSocketStream<MaybeTlsStream<TcpStream>>, Message>,
) {
    for channel_id in 0..CHANNEL_COUNT {
        let message = InputMessage::JoinChannel {
            payload: JoinMessagePayload {
                channel_id,
                sent_at: SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap()
                    .as_micros()
                    .to_string(),
                total_channel_count: CHANNEL_COUNT,
            },
        };
        let message_string = serde_json::to_string(&message).unwrap();
        let message = Message::Text(message_string);
        write.send(message).await.unwrap();
    }
}

#[derive(Serialize)]
struct JoinMessagePayload {
    #[serde(rename = "channelId")]
    channel_id: u32,
    // #[serde(rename = "totalMemberCount")]
    // total_member_count: u32,
    #[serde(rename = "totalChannelCount")]
    total_channel_count: u32,
    #[serde(rename = "sentAt")]
    sent_at: String,
}

#[derive(Serialize)]
struct SendMessagePayload {
    #[serde(rename = "channelId")]
    channel_id: u32,
    #[serde(rename = "messageContent")]
    message_content: String,
    #[serde(rename = "userId")]
    user_id: u32,
    #[serde(rename = "sentAt")]
    sent_at: String,
}

#[derive(Serialize)]
struct LeaveMessagePayload {
    #[serde(rename = "channelId")]
    channel_id: u32,
    #[serde(rename = "userId")]
    user_id: Option<u32>,
    #[serde(rename = "sentAt")]
    sent_at: String,
}

#[derive(Serialize)]
#[serde(tag = "type")]
enum InputMessage {
    #[serde(rename = "joinChannel")]
    JoinChannel { payload: JoinMessagePayload },
    #[serde(rename = "sendMessage")]
    SendMessage { payload: SendMessagePayload },
    #[serde(rename = "leaveChannel")]
    LeaveChannel { payload: LeaveMessagePayload },
}

#[derive(Deserialize, Debug)]
#[serde(tag = "type")]
enum OutputMessage {
    #[serde(rename = "joinChannelSuccess")]
    JoinChannelSuccess { payload: JoinChannelSuccessPayload },
    // #[serde(rename = "everybodyJoinedAllChannels")]
    // EverybodyJoinedAllChannels,
    #[serde(rename = "message")]
    Message { payload: MessagePayload },
}

#[derive(Deserialize, Debug)]
struct MessagePayload {
    #[serde(rename = "id")]
    id: u32,
    #[serde(rename = "channelId")]
    channel_id: u32,
    #[serde(rename = "ownerId")]
    owner_id: u32,
    #[serde(rename = "content")]
    content: String,
    #[serde(rename = "sentAt")]
    sent_at: String,
}

#[derive(Deserialize, Debug)]
struct JoinChannelSuccessPayload {
    #[serde(rename = "channelId")]
    channel_id: u32,
    #[serde(rename = "userId")]
    user_id: u32,
}
