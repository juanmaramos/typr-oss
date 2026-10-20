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

    fn terminal_message(_msg: &Message) -> Option<Result<(), crate::Error>> {
        None
    }

    fn requires_terminal_message() -> bool {
        false
    }

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
    ) -> Result<impl Stream<Item = Result<T::Output, crate::Error>>, crate::Error> {
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

        let (mut ws_sender, ws_receiver) = ws_stream.split();

        // Shutdown coordination to prevent KeepAlive race condition
        let (shutdown_tx, mut shutdown_rx) = tokio::sync::mpsc::channel::<()>(1);

        let send_task = tokio::spawn(async move {
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
                                    return Err(e.into());
                                }
                            }
                            None => {
                                if let Some(shutdown_msg) = T::shutdown_message() {
                                    if let Err(e) = ws_sender.send(shutdown_msg).await {
                                        tracing::warn!("[WS_TX] Shutdown message failed: {:?}", e);
                                        return Err(e.into());
                                    }
                                }
                                tracing::info!("[WS_TX] Audio stream ended");
                                return Ok(true);
                            }
                        }
                    }
                    _ = keepalive_interval.tick() => {
                        if let Some(keepalive) = T::keepalive_message() {
                            if let Err(e) = ws_sender.send(keepalive).await {
                                tracing::error!("[WS_TX] KeepAlive failed: {:?}", e);
                                return Err(e.into());
                            }
                        }
                    }
                    _ = shutdown_rx.recv() => return Ok(false),
                    else => return Ok(false)
                }
            }
        });

        Ok(receive_output::<T>(ws_receiver, send_task, shutdown_tx))
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

struct AbortOnDrop(tokio::task::AbortHandle);

impl Drop for AbortOnDrop {
    fn drop(&mut self) {
        self.0.abort();
    }
}

// A closed socket only confirms a drained transcript after audio input was exhausted
// and any provider-specific terminal acknowledgement was received.
fn receive_output<T: WebSocketIO>(
    receiver: impl Stream<Item = Result<Message, tokio_tungstenite::tungstenite::Error>> + Send,
    mut send_task: tokio::task::JoinHandle<Result<bool, crate::Error>>,
    shutdown_tx: tokio::sync::mpsc::Sender<()>,
) -> impl Stream<Item = Result<T::Output, crate::Error>> {
    let abort_on_drop = AbortOnDrop(send_task.abort_handle());
    async_stream::stream! {
        let _abort_on_drop = abort_on_drop;
        futures_util::pin_mut!(receiver);
        let mut input_finished = None;
        let mut acknowledged = !T::requires_terminal_message();
        loop {
            tokio::select! {
                result = &mut send_task, if input_finished.is_none() => {
                    match result {
                        Ok(Ok(finished)) => input_finished = Some(finished),
                        Ok(Err(error)) => { input_finished = Some(false); yield Err(error); }
                        Err(_) => { input_finished = Some(false); yield Err(crate::Error::Unknown); }
                    }
                }
                message = receiver.next() => {
                    match message {
                        Some(Ok(Message::Close(frame))) => {
                            let _ = shutdown_tx.send(()).await;
                            let finished = match input_finished {
                                Some(finished) => finished,
                                None => matches!((&mut send_task).await, Ok(Ok(true))),
                            };
                            let normal_close = frame.map(|frame| frame.code == tokio_tungstenite::tungstenite::protocol::frame::coding::CloseCode::Normal).unwrap_or(true);
                            if !finished || !acknowledged || !normal_close {
                                yield Err(crate::Error::Unknown);
                            }
                            break;
                        }
                        Some(Ok(message)) => {
                            if let Some(result) = T::terminal_message(&message) {
                                match result {
                                    Ok(()) => acknowledged = true,
                                    Err(error) => { yield Err(error); break; }
                                }
                            } else if let Some(output) = T::from_message(message) {
                                yield Ok(output);
                            }
                        }
                        Some(Err(error)) => { yield Err(error.into()); break; }
                        None => { yield Err(crate::Error::Unknown); break; }
                    }
                }
            }
        }
        let _ = shutdown_tx.send(()).await;
        send_task.abort();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    struct AcknowledgedProtocol;

    impl WebSocketIO for AcknowledgedProtocol {
        type Data = ();
        type Input = ();
        type Output = u64;

        fn to_input(_: ()) {}
        fn to_message(_: ()) -> Message {
            Message::Binary(Vec::new().into())
        }
        fn from_message(message: Message) -> Option<u64> {
            match message {
                Message::Binary(bytes) => Some(bytes.len() as u64),
                _ => None,
            }
        }
        fn requires_terminal_message() -> bool {
            true
        }
        fn terminal_message(message: &Message) -> Option<Result<(), crate::Error>> {
            match message {
                Message::Text(text) if text.as_str() == "done" => Some(Ok(())),
                _ => None,
            }
        }
    }

    async fn outputs(
        messages: Vec<Result<Message, tokio_tungstenite::tungstenite::Error>>,
        input_finished: bool,
    ) -> Vec<Result<u64, crate::Error>> {
        let (shutdown_tx, shutdown_rx) = tokio::sync::mpsc::channel(1);
        drop(shutdown_rx);
        let send_task = tokio::spawn(async move { Ok(input_finished) });
        while !send_task.is_finished() {
            tokio::task::yield_now().await;
        }
        receive_output::<AcknowledgedProtocol>(
            futures_util::stream::iter(messages),
            send_task,
            shutdown_tx,
        )
        .collect()
        .await
    }

    #[tokio::test]
    async fn requested_shutdown_preserves_final_output_before_acknowledgement() {
        let output = outputs(
            vec![
                Ok(Message::Binary(vec![0; 4].into())),
                Ok(Message::Text("done".into())),
                Ok(Message::Close(None)),
            ],
            true,
        )
        .await;
        assert_eq!(output.len(), 1);
        assert!(matches!(output[0], Ok(4)));
    }

    #[tokio::test]
    async fn reset_during_shutdown_preserves_output_and_reports_failure() {
        let output = outputs(
            vec![
                Ok(Message::Binary(vec![0; 4].into())),
                Err(tokio_tungstenite::tungstenite::Error::ConnectionClosed),
            ],
            true,
        )
        .await;
        assert_eq!(output.len(), 2);
        assert!(matches!(output[0], Ok(4)));
        assert!(output[1].is_err());
    }

    #[tokio::test]
    async fn sender_error_is_reported_even_when_receiver_is_idle() {
        let (shutdown_tx, shutdown_rx) = tokio::sync::mpsc::channel(1);
        drop(shutdown_rx);
        let output = receive_output::<AcknowledgedProtocol>(
            futures_util::stream::pending(),
            tokio::spawn(async { Err(crate::Error::Unknown) }),
            shutdown_tx,
        );
        futures_util::pin_mut!(output);
        assert!(output.next().await.unwrap().is_err());
    }

    #[tokio::test]
    async fn dropping_output_cancels_audio_sender() {
        struct SignalOnDrop(Option<tokio::sync::oneshot::Sender<()>>);
        impl Drop for SignalOnDrop {
            fn drop(&mut self) {
                if let Some(tx) = self.0.take() {
                    let _ = tx.send(());
                }
            }
        }
        let (started_tx, started_rx) = tokio::sync::oneshot::channel();
        let (stopped_tx, stopped_rx) = tokio::sync::oneshot::channel();
        let send_task = tokio::spawn(async move {
            let _signal = SignalOnDrop(Some(stopped_tx));
            let _ = started_tx.send(());
            std::future::pending::<Result<bool, crate::Error>>().await
        });
        started_rx.await.unwrap();
        let (shutdown_tx, _shutdown_rx) = tokio::sync::mpsc::channel(1);
        let output = receive_output::<AcknowledgedProtocol>(
            futures_util::stream::pending(),
            send_task,
            shutdown_tx,
        );
        drop(output);
        tokio::time::timeout(std::time::Duration::from_secs(1), stopped_rx)
            .await
            .unwrap()
            .unwrap();
    }

    #[tokio::test]
    async fn close_without_acknowledgement_or_before_input_ends_is_failure() {
        assert!(outputs(vec![Ok(Message::Close(None))], true).await[0].is_err());
        assert!(outputs(
            vec![Ok(Message::Text("done".into())), Ok(Message::Close(None)),],
            false
        )
        .await[0]
            .is_err());
        assert!(outputs(vec![], true).await[0].is_err());
    }
}
