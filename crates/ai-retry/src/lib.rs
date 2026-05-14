use async_openai::types::{CreateChatCompletionRequest, CreateChatCompletionResponse};
use serde::{Deserialize, Serialize};
use std::future::Future;
use std::time::Duration;
use thiserror::Error;
use tokio::time::sleep;
use tracing::{debug, warn};

#[derive(Debug, Error)]
pub enum RetryError<E> {
    #[error("Maximum retries exceeded")]
    MaxRetriesExceeded,
    #[error("All retries exhausted: {0}")]
    AllRetriesFailed(E),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RetryConfig {
    /// Maximum number of retry attempts
    pub max_retries: u32,
    /// Base delay between retries in milliseconds
    pub base_delay_ms: u64,
    /// Maximum delay between retries in milliseconds
    pub max_delay_ms: u64,
    /// Multiplier for exponential backoff
    pub backoff_multiplier: f64,
    /// Add jitter to prevent thundering herd
    pub jitter: bool,
}

impl Default for RetryConfig {
    fn default() -> Self {
        Self {
            max_retries: 3,
            base_delay_ms: 500,
            max_delay_ms: 5000,
            backoff_multiplier: 2.0,
            jitter: true,
        }
    }
}

impl RetryConfig {
    /// Create a configuration for immediate refusal retries
    pub fn for_immediate_refusals() -> Self {
        Self {
            max_retries: 2,
            base_delay_ms: 100,
            max_delay_ms: 1000,
            backoff_multiplier: 2.0,
            jitter: true,
        }
    }
}

/// Represents a response that should be checked for retry conditions
pub trait RetryableResponse {
    /// Check if this response indicates an immediate refusal that should be retried
    fn is_immediate_refusal(&self) -> bool;

    /// Check if this response indicates a transient error that should be retried
    fn is_transient_error(&self) -> bool;

    /// Get the response time in milliseconds for determining if it's "immediate"
    fn response_time_ms(&self) -> Option<u64>;
}

/// Implementation for CreateChatCompletionResponse
impl RetryableResponse for CreateChatCompletionResponse {
    fn is_immediate_refusal(&self) -> bool {
        if let Some(choice) = self.choices.first() {
            if let Some(content) = &choice.message.content {
                let content_lower = content.to_lowercase();

                // Check for common refusal patterns
                let refusal_patterns = [
                    "i can't help you with that",
                    "i can't help with that",
                    "i cannot help you with that",
                    "i cannot help with that",
                    "i'm not able to help with that",
                    "i'm unable to help with that",
                    "sorry, i can't help",
                    "i apologize, but i can't",
                    "i cannot create a summary that promotes or glorifies violence",
                    "i cannot create a summary that",
                    "cannot create a summary that promotes",
                ];

                refusal_patterns
                    .iter()
                    .any(|pattern| content_lower.contains(pattern))
            } else {
                false
            }
        } else {
            false
        }
    }

    fn is_transient_error(&self) -> bool {
        // For successful responses, check if they look like temporary failures
        false // Implement based on your needs
    }

    fn response_time_ms(&self) -> Option<u64> {
        // This would need to be tracked externally
        None
    }
}

/// A wrapper that provides retry functionality for AI inference
pub struct RetryableAIClient<T> {
    inner: T,
    config: RetryConfig,
}

impl<T> RetryableAIClient<T> {
    pub fn new(inner: T, config: RetryConfig) -> Self {
        Self { inner, config }
    }

    pub fn with_default_config(inner: T) -> Self {
        Self::new(inner, RetryConfig::default())
    }

    pub fn for_immediate_refusals(inner: T) -> Self {
        Self::new(inner, RetryConfig::for_immediate_refusals())
    }
}

impl<T> RetryableAIClient<T>
where
    T: AIProvider,
{
    /// Execute a chat completion with retry logic
    pub async fn chat_completion_with_retry(
        &self,
        request: CreateChatCompletionRequest,
    ) -> Result<CreateChatCompletionResponse, RetryError<T::Error>> {
        let mut last_error = None;
        let mut attempt = 0;

        while attempt <= self.config.max_retries {
            let start_time = std::time::Instant::now();

            match self.inner.chat_completion(&request).await {
                Ok(response) => {
                    let response_time_ms = start_time.elapsed().as_millis() as u64;

                    // Check if this is an immediate refusal (quick response with refusal content)
                    let is_immediate = response_time_ms < 100; // Less than 100ms is considered "immediate"
                    let is_refusal = response.is_immediate_refusal();

                    if is_immediate && is_refusal {
                        if attempt < self.config.max_retries {
                            warn!(
                                attempt = attempt + 1,
                                max_retries = self.config.max_retries,
                                response_time_ms,
                                "Detected immediate refusal, retrying..."
                            );

                            // Calculate delay with exponential backoff and optional jitter
                            let delay_ms = self.calculate_delay(attempt);
                            sleep(Duration::from_millis(delay_ms)).await;

                            attempt += 1;
                            continue;
                        } else {
                            // We've exhausted retries and still got a refusal
                            warn!(
                                attempt = attempt + 1,
                                max_retries = self.config.max_retries,
                                response_time_ms,
                                "Max retries exceeded with immediate refusal"
                            );
                            return Err(RetryError::MaxRetriesExceeded);
                        }
                    }

                    debug!(
                        attempt = attempt + 1,
                        response_time_ms, is_refusal, "Chat completion successful"
                    );

                    return Ok(response);
                }
                Err(e) => {
                    warn!(
                        attempt = attempt + 1,
                        max_retries = self.config.max_retries,
                        error = %e,
                        "Chat completion failed"
                    );

                    last_error = Some(e);

                    if attempt < self.config.max_retries {
                        let delay_ms = self.calculate_delay(attempt);
                        sleep(Duration::from_millis(delay_ms)).await;
                    }

                    attempt += 1;
                }
            }
        }

        match last_error {
            Some(e) => Err(RetryError::AllRetriesFailed(e)),
            None => Err(RetryError::MaxRetriesExceeded),
        }
    }

    fn calculate_delay(&self, attempt: u32) -> u64 {
        let base_delay = self.config.base_delay_ms as f64;
        let multiplier = self.config.backoff_multiplier;

        let delay = base_delay * multiplier.powi(attempt as i32);
        let clamped_delay = delay.min(self.config.max_delay_ms as f64) as u64;

        if self.config.jitter {
            // Add up to 25% jitter to prevent thundering herd
            let jitter_range = (clamped_delay as f64 * 0.25) as u64;
            let jitter = rand::random::<u64>() % (jitter_range + 1);
            clamped_delay + jitter
        } else {
            clamped_delay
        }
    }
}

/// Trait for AI providers that can be wrapped with retry logic
pub trait AIProvider {
    type Error: std::fmt::Display + std::fmt::Debug;

    fn chat_completion(
        &self,
        request: &CreateChatCompletionRequest,
    ) -> impl Future<Output = Result<CreateChatCompletionResponse, Self::Error>>;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[derive(Clone)]
    struct MockAIProvider {
        responses: Vec<Result<String, &'static str>>,
        call_count: std::sync::Arc<std::sync::Mutex<usize>>,
    }

    impl MockAIProvider {
        fn new(responses: Vec<Result<String, &'static str>>) -> Self {
            Self {
                responses,
                call_count: std::sync::Arc::new(std::sync::Mutex::new(0)),
            }
        }
    }

    impl AIProvider for MockAIProvider {
        type Error = String;

        async fn chat_completion(
            &self,
            _request: &CreateChatCompletionRequest,
        ) -> Result<CreateChatCompletionResponse, Self::Error> {
            let mut count = self.call_count.lock().unwrap();
            let index = *count;
            *count += 1;

            if index >= self.responses.len() {
                return Err("No more mock responses".to_string());
            }

            match &self.responses[index] {
                Ok(content) => {
                    let response = CreateChatCompletionResponse {
                        id: "test".to_string(),
                        object: "chat.completion".to_string(),
                        created: 0,
                        model: "test".to_string(),
                        choices: vec![async_openai::types::ChatChoice {
                            index: 0,
                            message: async_openai::types::ChatCompletionResponseMessage {
                                role: async_openai::types::Role::Assistant,
                                content: Some(content.clone()),
                                function_call: None,
                                tool_calls: None,
                                refusal: None,
                                audio: None,
                            },
                            finish_reason: Some(async_openai::types::FinishReason::Stop),
                            logprobs: None,
                        }],
                        usage: None,
                        system_fingerprint: None,
                        service_tier: None,
                    };
                    Ok(response)
                }
                Err(error) => Err(error.to_string()),
            }
        }
    }

    #[tokio::test]
    async fn test_retry_on_immediate_refusal() {
        let mock = MockAIProvider::new(vec![
            Ok("I can't help you with that.".to_string()),
            Ok("I can't help you with that.".to_string()),
            Ok("Here's a proper response.".to_string()),
        ]);

        let client = RetryableAIClient::for_immediate_refusals(mock);
        let request = CreateChatCompletionRequest::default();

        let result = client.chat_completion_with_retry(request).await;
        assert!(result.is_ok());

        if let Ok(response) = result {
            assert_eq!(
                response.choices[0].message.content.as_ref().unwrap(),
                "Here's a proper response."
            );
        }
    }

    #[tokio::test]
    async fn test_max_retries_exceeded() {
        let mock = MockAIProvider::new(vec![
            Ok("I can't help you with that.".to_string()),
            Ok("I can't help you with that.".to_string()),
            Ok("I can't help you with that.".to_string()),
            Ok("I can't help you with that.".to_string()), // Extra refusal to ensure exhaustion
        ]);

        let client = RetryableAIClient::for_immediate_refusals(mock);
        let request = CreateChatCompletionRequest::default();

        let result = client.chat_completion_with_retry(request).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_no_retry_on_valid_response() {
        let mock = MockAIProvider::new(vec![Ok("Here's a valid response.".to_string())]);

        let mock_clone = mock.clone();
        let client = RetryableAIClient::for_immediate_refusals(mock);
        let request = CreateChatCompletionRequest::default();

        let result = client.chat_completion_with_retry(request).await;
        assert!(result.is_ok());

        // Verify only one call was made
        let count = mock_clone.call_count.lock().unwrap();
        assert_eq!(*count, 1);
    }
}
