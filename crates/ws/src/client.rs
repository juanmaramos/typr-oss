use serde::de::DeserializeOwned;

use backon::{ConstantBuilder, Retryable};
use futures_util::{SinkExt, Stream, StreamExt};
use tokio_tungstenite::{connect_async, tungstenite::client::IntoClientRequest};

pub use tokio_tungstenite::tungstenite::{protocol::Message, ClientRequestBuilder};

pub trait WebSocketIO: Send + 'static {
    type Data: Send;
    type Input: Send;
    type Output: DeserializeOwned;

    fn to_input(data: Self::Data) -> Self::Input;
    fn to_message(input: Self::Input) -> Message;
    fn from_message(msg: Message) -> Option<Self::Output>;

    fn keepalive_message() -> Option<Message> {
        Some(Message::Text(r#"{"type":"KeepAlive"}"#.into()))
    }

    fn shutdown_message() -> Option<Message> {
        None
    }
}

pub struct WebSocketClient {
    request: ClientRequestBuilder,
}

impl WebSocketClient {
    pub fn new(request: ClientRequestBuilder) -> Self {
        Self { request }
    }

    pub async fn from_audio<T: WebSocketIO>(
        &self,
        mut audio_stream: impl Stream<Item = T::Data> + Send + Unpin + 'static,
    ) -> Result<impl Stream<Item = T::Output>, crate::Error> {
        let ws_stream = (|| self.try_connect(self.request.clone()))
            .retry(
                ConstantBuilder::default()
                    .with_max_times(20)
                    .with_delay(std::time::Duration::from_millis(500)),
            )
            .when(|e| {
                tracing::error!("[WS] Connection failed: {:?}", e);
                true
            })
            .sleep(tokio::time::sleep)
            .await?;
        tracing::info!("[WS] Connected");

        let (mut ws_sender, mut ws_receiver) = ws_stream.split();

        // Shutdown coordination to prevent KeepAlive race condition
        let (shutdown_tx, mut shutdown_rx) = tokio::sync::mpsc::channel::<()>(1);

        let _send_task = tokio::spawn(async move {
            let mut chunk_count = 0;
            let mut keepalive_interval = tokio::time::interval(std::time::Duration::from_secs(3));
            keepalive_interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);

            loop {
                tokio::select! {
                    data = audio_stream.next() => {
                        match data {
                            Some(data) => {
                                let input = T::to_input(data);
                                let msg = T::to_message(input);
                                chunk_count += 1;

                                if chunk_count == 1 {
                                    tracing::info!("[WS_TX] First chunk sent");
                                }

                                if let Err(e) = ws_sender.send(msg).await {
                                    tracing::error!("[WS_TX] Send failed at chunk {}: {:?}", chunk_count, e);
                                    break;
                                }
                            }
                            None => {
                                if let Some(shutdown_msg) = T::shutdown_message() {
                                    if let Err(e) = ws_sender.send(shutdown_msg).await {
                                        tracing::warn!("[WS_TX] Shutdown message failed: {:?}", e);
                                    }
                                }
                                tracing::info!("[WS_TX] Audio stream ended");
                                break;
                            }
                        }
                    }
                    _ = keepalive_interval.tick() => {
                        if let Some(keepalive) = T::keepalive_message() {
                            if let Err(e) = ws_sender.send(keepalive).await {
                                tracing::error!("[WS_TX] KeepAlive failed: {:?}", e);
                                break;
                            }
                        }
                    }
                    _ = shutdown_rx.recv() => {
                        if let Some(shutdown_msg) = T::shutdown_message() {
                            if let Err(e) = ws_sender.send(shutdown_msg).await {
                                tracing::warn!("[WS_TX] Shutdown message failed: {:?}", e);
                            }
                        }
                        tracing::info!("[WS_TX] Graceful shutdown initiated");
                        break;
                    }
                    else => break
                }
            }
            tracing::info!("[WS_TX] Ended after {} chunks", chunk_count);
        });

        let output_stream = async_stream::stream! {
            let mut msg_count = 0;

            while let Some(msg_result) = ws_receiver.next().await {
                msg_count += 1;

                match msg_result {
                    Ok(msg) => {
                        match msg {
                            Message::Text(_) | Message::Binary(_) => {
                                if let Some(output) = T::from_message(msg) {
                                    yield output;
                                }
                            },
                            Message::Close(frame) => {
                                tracing::warn!("[WS_RX] Server closed: {:?}", frame);
                                break;
                            },
                            Message::Ping(_) | Message::Pong(_) | Message::Frame(_) => continue,
                        }
                    }
                    Err(e) => {
                        // Note: Protocol errors like ResetWithoutClosingHandshake are NOT
                        // device changes - they're remote disconnects. Device changes are
                        // detected separately via OS-level device listeners.
                        tracing::warn!("[WS_RX] Connection error: {:?}", e);
                        break;
                    }
                }
            }

            // Signal send task to shutdown gracefully
            let _ = shutdown_tx.send(()).await;
            tracing::info!("[WS_RX] Ended after {} messages", msg_count);
        };

        Ok(output_stream)
    }

    async fn try_connect(
        &self,
        req: ClientRequestBuilder,
    ) -> Result<
        tokio_tungstenite::WebSocketStream<
            tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>,
        >,
        crate::Error,
    > {
        let req = req.into_client_request().unwrap();
        let connect_result =
            tokio::time::timeout(std::time::Duration::from_secs(8), connect_async(req)).await;

        match connect_result {
            Ok(Ok((ws_stream, _))) => Ok(ws_stream),
            Ok(Err(e)) => Err(e.into()),
            Err(e) => Err(e.into()),
        }
    }
}
