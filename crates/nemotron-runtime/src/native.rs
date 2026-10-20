//! Safe ownership wrappers for the v0.2.0 ASR C ABI. Load this module only in
//! the worker: upstream's shared ggml libraries must never enter the app process.
//
// C ABI layouts follow NVIDIA/NeMo-Speech.cpp v0.2.0/include/nemo_speech/asr.h,
// Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES, Apache-2.0.
// The distributed SDK retains its complete license and third-party notices.
use std::{
    ffi::{c_char, c_void, CStr, CString},
    marker::PhantomData,
    path::Path,
    rc::Rc,
};

use libloading::Library;

use crate::protocol::{validate_audio, Word, SAMPLE_RATE};

pub const SDK_VERSION: &str = "0.2.0";
pub const SDK_REVISION: &str = "6a3ca369370782acee0dd155e34394ba60b920c4";

type Handle = *mut c_void;
type Status = i32;

#[repr(C)]
struct BackendConfig {
    size: usize,
    gpu: i32,
}
#[repr(C)]
struct ModelConfig {
    size: usize,
    path: *const c_char,
    name: *const c_char,
}
#[repr(C)]
struct EndpointConfig {
    size: usize,
    enable: bool,
    vad_based: bool,
    stop_history_eou_ms: i32,
}
#[repr(C)]
struct Config {
    size: usize,
    backend: *const BackendConfig,
    model: *const ModelConfig,
    streaming: *const c_void,
    decoder: *const c_void,
    vad: *const c_void,
    endpointing: *const EndpointConfig,
    postproc: *const c_void,
    diar: *const c_void,
    batching: *const c_void,
}
#[repr(C)]
struct Options {
    size: usize,
    request_id: *const c_char,
    language_code: *const c_char,
    interim_results: bool,
    enable_word_time_offsets: bool,
    enable_automatic_punctuation: bool,
    verbatim_transcripts: bool,
    profanity_filter: bool,
    stop_history_eou_ms: i32,
    speech_contexts: *const c_void,
    speech_context_count: usize,
    max_alternatives: i32,
    enable_speaker_diarization: bool,
    max_speaker_count: i32,
}

// Function pointers are copied out of libloading Symbols. `_library` outlives
// every pointer and every native handle through Rc ownership.
struct Api {
    create: unsafe extern "C" fn(*const Config, *mut Handle) -> Status,
    destroy: unsafe extern "C" fn(Handle),
    options_default: unsafe extern "C" fn() -> Options,
    streaming_recognize: unsafe extern "C" fn(Handle, *const Options, *mut Handle) -> Status,
    push: unsafe extern "C" fn(Handle, *const f32, usize, i32) -> Status,
    next: unsafe extern "C" fn(Handle, *mut Handle) -> Status,
    endpoint: unsafe extern "C" fn(Handle) -> Status,
    finish: unsafe extern "C" fn(Handle) -> Status,
    close: unsafe extern "C" fn(Handle),
    is_final: unsafe extern "C" fn(Handle) -> bool,
    audio_processed: unsafe extern "C" fn(Handle) -> f32,
    transcript: unsafe extern "C" fn(Handle, usize) -> *const c_char,
    word_count: unsafe extern "C" fn(Handle, usize) -> usize,
    word_text: unsafe extern "C" fn(Handle, usize, usize) -> *const c_char,
    word_start: unsafe extern "C" fn(Handle, usize, usize) -> i32,
    word_end: unsafe extern "C" fn(Handle, usize, usize) -> i32,
    word_confidence: unsafe extern "C" fn(Handle, usize, usize) -> f32,
    result_destroy: unsafe extern "C" fn(Handle),
    last_error: unsafe extern "C" fn() -> *const c_char,
    _library: Library,
}

fn native_text(pointer: *const c_char) -> String {
    if pointer.is_null() {
        return String::new();
    }
    // SAFETY: the pinned API promises a result-owned NUL-terminated string;
    // callers copy it before releasing its owning result.
    unsafe { CStr::from_ptr(pointer) }
        .to_string_lossy()
        .into_owned()
}

impl Api {
    fn load(path: &Path) -> Result<Rc<Self>, String> {
        if !path.is_absolute() {
            return Err("SDK library path must be absolute".into());
        }
        let path = path
            .canonicalize()
            .map_err(|error| format!("SDK library unavailable: {error}"))?;
        // SAFETY: loading native code is confined to the explicitly configured
        // child process. The versioned distribution is a trusted application asset.
        unsafe {
            let library =
                Library::new(path).map_err(|error| format!("SDK load failed: {error}"))?;
            let version: unsafe extern "C" fn() -> *const c_char = *library
                .get(b"nemo_speech_asr_version\0")
                .map_err(|error| error.to_string())?;
            if native_text(version()) != format!("nemo-speech-asr {SDK_VERSION}") {
                return Err("unsupported Nemotron SDK version (expected 0.2.0)".into());
            }
            macro_rules! symbol {
                ($name:literal) => {
                    *library
                        .get(concat!("nemo_speech_asr_", $name, "\0").as_bytes())
                        .map_err(|error| error.to_string())?
                };
            }
            Ok(Rc::new(Self {
                create: symbol!("create"),
                destroy: symbol!("destroy"),
                options_default: symbol!("recognition_options_default"),
                streaming_recognize: symbol!("streaming_recognize"),
                push: symbol!("stream_push_f32"),
                next: symbol!("stream_next"),
                endpoint: symbol!("stream_force_endpoint"),
                finish: symbol!("stream_finish"),
                close: symbol!("stream_close"),
                is_final: symbol!("result_is_final"),
                audio_processed: symbol!("result_audio_processed"),
                transcript: symbol!("result_transcript"),
                word_count: symbol!("result_word_count"),
                word_text: symbol!("result_word_text"),
                word_start: symbol!("result_word_start_time"),
                word_end: symbol!("result_word_end_time"),
                word_confidence: symbol!("result_word_confidence"),
                result_destroy: symbol!("result_destroy"),
                last_error: symbol!("last_error"),
                _library: library,
            }))
        }
    }

    fn check(&self, status: Status) -> Result<(), String> {
        if status == 0 {
            Ok(())
        } else {
            // SAFETY: errors are copied immediately on the calling thread.
            let detail = native_text(unsafe { (self.last_error)() });
            Err(format!("Nemotron SDK error {status}: {detail}"))
        }
    }
}

pub struct Recognizer {
    api: Rc<Api>,
    handle: Handle,
    language: CString,
    // Native streams are explicitly single-threaded; do not infer Send/Sync
    // from the opaque pointer. Rc also keeps the parent alive until all close.
    _thread_bound: PhantomData<Rc<()>>,
}

impl Recognizer {
    pub fn open(library: &Path, model: &Path, language: &str) -> Result<Rc<Self>, String> {
        Self::open_with_gpu(library, model, language, -1)
    }

    pub fn open_with_gpu(
        library: &Path,
        model: &Path,
        language: &str,
        gpu: i32,
    ) -> Result<Rc<Self>, String> {
        if gpu < -1 {
            return Err("GPU index must be -1 for CPU or a nonnegative device index".into());
        }
        if !model.is_absolute() || !model.is_file() {
            return Err("model must be an existing absolute file path".into());
        }
        if !matches!(language, "en-US" | "en-GB" | "es-ES" | "es-US" | "auto") {
            return Err(
                "prototype supports English, Spanish, and automatic language detection".into(),
            );
        }
        let api = Api::load(library)?;
        let model_path = CString::new(model.to_str().ok_or("model path must be UTF-8")?)
            .map_err(|_| "invalid model path")?;
        let language = CString::new(language).map_err(|_| "invalid language")?;
        let backend = BackendConfig {
            size: std::mem::size_of::<BackendConfig>(),
            gpu,
        };
        let model = ModelConfig {
            size: std::mem::size_of::<ModelConfig>(),
            path: model_path.as_ptr(),
            name: std::ptr::null(),
        };
        let endpointing = EndpointConfig {
            size: std::mem::size_of::<EndpointConfig>(),
            enable: true,
            vad_based: false,
            stop_history_eou_ms: 500,
        };
        let config = Config {
            size: std::mem::size_of::<Config>(),
            backend: &backend,
            model: &model,
            streaming: std::ptr::null(),
            decoder: std::ptr::null(),
            vad: std::ptr::null(),
            endpointing: &endpointing,
            postproc: std::ptr::null(),
            diar: std::ptr::null(),
            batching: std::ptr::null(),
        };
        let mut handle = std::ptr::null_mut();
        // SAFETY: all config structs match the pinned C header. Create copies
        // config strings, and no pointer outlives its backing storage here.
        api.check(unsafe { (api.create)(&config, &mut handle) })?;
        if handle.is_null() {
            return Err("SDK returned an empty recognizer".into());
        }
        Ok(Rc::new(Self {
            api,
            handle,
            language,
            _thread_bound: PhantomData,
        }))
    }

    pub fn stream(self: &Rc<Self>) -> Result<Stream, String> {
        self.stream_with_language(self.language.to_str().map_err(|_| "invalid language")?)
    }

    pub fn stream_with_language(self: &Rc<Self>, language: &str) -> Result<Stream, String> {
        if !matches!(language, "en-US" | "en-GB" | "es-ES" | "es-US" | "auto") {
            return Err(
                "prototype supports English, Spanish, and automatic language detection".into(),
            );
        }
        let language = CString::new(language).map_err(|_| "invalid language")?;
        // SAFETY: default initializes the exact v0.2.0 options layout.
        let mut options = unsafe { (self.api.options_default)() };
        options.language_code = language.as_ptr();
        options.interim_results = true;
        options.enable_word_time_offsets = true;
        options.enable_automatic_punctuation = true;
        let mut handle = std::ptr::null_mut();
        // SAFETY: parent outlives the stream; options are copied by create.
        self.api
            .check(unsafe { (self.api.streaming_recognize)(self.handle, &options, &mut handle) })?;
        if handle.is_null() {
            return Err("SDK returned an empty stream".into());
        }
        Ok(Stream {
            recognizer: self.clone(),
            handle,
            finished: false,
        })
    }
}

impl Drop for Recognizer {
    fn drop(&mut self) {
        // SAFETY: Rc guarantees all stream handles have already closed.
        unsafe { (self.api.destroy)(self.handle) };
    }
}

#[derive(Debug, Clone)]
pub struct Recognition {
    pub is_final: bool,
    pub text: String,
    pub words: Vec<Word>,
    pub audio_processed_ms: u64,
}

pub struct Stream {
    recognizer: Rc<Recognizer>,
    handle: Handle,
    finished: bool,
}

impl Stream {
    pub fn push(&mut self, samples: &[f32]) -> Result<Vec<Recognition>, String> {
        if self.finished {
            return Err("audio received after stream finish".into());
        }
        validate_audio(samples)?;
        let api = &self.recognizer.api;
        // SAFETY: API buffers/copies input; samples remain alive for this call.
        api.check(unsafe {
            (api.push)(self.handle, samples.as_ptr(), samples.len(), SAMPLE_RATE)
        })?;
        self.drain()
    }

    pub fn endpoint(&mut self) -> Result<Vec<Recognition>, String> {
        if self.finished {
            return Err("endpoint received after stream finish".into());
        }
        let api = &self.recognizer.api;
        // SAFETY: exclusively driven live stream handle.
        api.check(unsafe { (api.endpoint)(self.handle) })?;
        self.drain()
    }

    pub fn finish(&mut self) -> Result<Vec<Recognition>, String> {
        if self.finished {
            return Err("stream already finished".into());
        }
        let api = &self.recognizer.api;
        // SAFETY: exclusively driven live stream handle; finish flushes once.
        api.check(unsafe { (api.finish)(self.handle) })?;
        self.finished = true;
        self.drain()
    }

    fn drain(&mut self) -> Result<Vec<Recognition>, String> {
        let api = &self.recognizer.api;
        let mut output = Vec::new();
        loop {
            let mut handle = std::ptr::null_mut();
            // SAFETY: stream is valid and is driven from this thread only.
            api.check(unsafe { (api.next)(self.handle, &mut handle) })?;
            if handle.is_null() {
                break;
            }
            struct OwnedResult<'a> {
                api: &'a Api,
                handle: Handle,
            }
            impl Drop for OwnedResult<'_> {
                fn drop(&mut self) {
                    unsafe { (self.api.result_destroy)(self.handle) };
                }
            }
            let result = OwnedResult { api, handle };
            // SAFETY: all accessor pointers belong to result and are copied
            // before OwnedResult releases it, including on a validation error.
            let recognition = unsafe {
                let count = (api.word_count)(result.handle, 0);
                if count > 65_536 {
                    return Err("SDK returned too many words".into());
                }
                let mut words = Vec::with_capacity(count);
                for index in 0..count {
                    let start = (api.word_start)(result.handle, 0, index);
                    let end = (api.word_end)(result.handle, 0, index);
                    let confidence = (api.word_confidence)(result.handle, 0, index);
                    words.push(Word {
                        text: native_text((api.word_text)(result.handle, 0, index)),
                        start_ms: u64::try_from(start).ok(),
                        end_ms: u64::try_from(end).ok(),
                        confidence: (confidence.is_finite() && (0.0..=1.0).contains(&confidence))
                            .then_some(confidence),
                    });
                }
                let processed = (api.audio_processed)(result.handle);
                Recognition {
                    is_final: (api.is_final)(result.handle),
                    text: native_text((api.transcript)(result.handle, 0)),
                    words,
                    audio_processed_ms: if processed.is_finite() && processed >= 0.0 {
                        (processed as f64 * 1000.0) as u64
                    } else {
                        return Err("SDK returned invalid audio position".into());
                    },
                }
            };
            let is_final = recognition.is_final;
            output.push(recognition);
            if !is_final {
                break;
            }
        }
        Ok(output)
    }
}

impl Drop for Stream {
    fn drop(&mut self) {
        unsafe { (self.recognizer.api.close)(self.handle) };
    }
}
