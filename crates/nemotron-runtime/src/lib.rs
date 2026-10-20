//! Native Nemotron runs only in the separate worker process, isolating its ggml
//! dependency from the desktop process's Whisper and llama versions.
pub mod native;
pub mod protocol;
pub mod worker;
