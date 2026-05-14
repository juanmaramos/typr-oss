use std::fs::File;
use std::io::{Cursor, Seek, SeekFrom};
use std::path::Path;

use byteorder::{BigEndian, LittleEndian, ReadBytesExt};
use memmap2::Mmap;

mod error;
pub use error::*;

mod template;
pub use template::*;

mod value;
pub use value::*;

mod utils;
pub use utils::*;

// Optimized chat templates for specific models
// These override llama.cpp's built-in templates when better performance is needed

/// Phi-4 official template with im_sep separator
/// Source: https://huggingface.co/microsoft/phi-4
const PHI4_TEMPLATE: &str = r#"{%- for message in messages -%}
	{%- if message["role"] == "system" -%}
		{{- "<|im_start|>system<|im_sep|>" + message["content"] + "<|im_end|>" -}}
	{%- elif message["role"] == "user" -%}
		{{- "<|im_start|>user<|im_sep|>" + message["content"] + "<|im_end|>" -}}
	{%- elif message["role"] == "assistant" -%}
		{{- "<|im_start|>assistant<|im_sep|>" + message["content"] + "<|im_end|>" -}}
	{%- endif -%}
{%- endfor -%}
{%- if add_generation_prompt -%}
	{{- "<|im_start|>assistant<|im_sep|>" -}}
{%- endif -%}"#;

/// Gemma 3 template with system message handling and multimodal support
/// Source: https://huggingface.co/unsloth/gemma-3-4b-it
const GEMMA3_TEMPLATE: &str = r#"{{ bos_token }}
{%- if messages[0]['role'] == 'system' -%}
    {%- if messages[0]['content'] is string -%}
        {%- set first_user_prefix = messages[0]['content'] + '\n' -%}
    {%- else -%}
        {%- set first_user_prefix = messages[0]['content'][0]['text'] + '\n' -%}
    {%- endif -%}
    {%- set loop_messages = messages[1:] -%}
{%- else -%}
    {%- set first_user_prefix = "" -%}
    {%- set loop_messages = messages -%}
{%- endif -%}
{%- for message in loop_messages -%}
    {%- if (message['role'] == 'user') != (loop.index0 % 2 == 0) -%}
        {{ raise_exception("Conversation roles must alternate user/assistant/user/assistant/...") }}
    {%- endif -%}
    {%- if (message['role'] == 'assistant') -%}
        {%- set role = "model" -%}
    {%- else -%}
        {%- set role = message['role'] -%}
    {%- endif -%}
    {{ '<start_of_turn>' + role + '\n' + (first_user_prefix if loop.first else "") }}
    {%- if message['content'] is string -%}
        {{ message['content'] | trim }}
    {%- elif message['content'] is iterable -%}
        {%- for item in message['content'] -%}
            {%- if item['type'] == 'image' -%}
                {{ '<start_of_image>' }}
            {%- elif item['type'] == 'text' -%}
                {{ item['text'] | trim }}
            {%- endif -%}
        {%- endfor -%}
    {%- else -%}
        {{ raise_exception("Invalid content type") }}
    {%- endif -%}
    {{ '<end_of_turn>\n' }}
{%- endfor -%}
{%- if add_generation_prompt -%}
    {{'<start_of_turn>model\n'}}
{%- endif -%}"#;

/// Gemma 4 template — uses <|turn>/<turn|> tokens (different from Gemma 3)
/// Native system role support (no prepend-to-first-user workaround needed)
/// Source: https://ai.google.dev/gemma/docs/capabilities/text/basic
const GEMMA4_TEMPLATE: &str = r#"{{ bos_token }}
{%- for message in messages -%}
    {%- if message['role'] == 'assistant' -%}
        {%- set role = "model" -%}
    {%- else -%}
        {%- set role = message['role'] -%}
    {%- endif -%}
    {{ '<|turn>' + role + '\n' }}
    {%- if message['content'] is string -%}
        {{ message['content'] | trim }}
    {%- elif message['content'] is iterable -%}
        {%- for item in message['content'] -%}
            {%- if item['type'] == 'text' -%}
                {{ item['text'] | trim }}
            {%- endif -%}
        {%- endfor -%}
    {%- endif -%}
    {{ '<turn|>\n' }}
{%- endfor -%}
{%- if add_generation_prompt -%}
    {{'<|turn>model\n'}}
{%- endif -%}"#;

pub trait GgufExt {
    fn gguf_chat_format(&self) -> Result<Option<ChatTemplate>>;
}

impl<T: AsRef<Path>> GgufExt for T {
    fn gguf_chat_format(&self) -> Result<Option<ChatTemplate>> {
        let file = File::open(self.as_ref())?;
        let map = unsafe { Mmap::map(&file)? };
        let mut reader = Cursor::new(&map[..]);

        let magic = reader.read_u32::<LittleEndian>()?;
        if magic != GGUF_MAGIC {
            return Err(Error::InvalidMagic);
        }

        let (version, is_little_endian) = {
            reader.seek(SeekFrom::Start(4))?;
            let version_le = reader.read_u32::<LittleEndian>()?;

            if version_le & 65535 != 0 {
                (version_le, true)
            } else {
                reader.seek(SeekFrom::Start(4))?;
                let version_be = reader.read_u32::<BigEndian>()?;
                (version_be, false)
            }
        };

        if version > 3 {
            return Err(Error::UnsupportedVersion(version));
        }

        // Reset position to after version
        reader.seek(SeekFrom::Start(8))?;

        let _tensor_count = read_versioned_size(&mut reader, version, is_little_endian)?;
        let metadata_kv_count = read_versioned_size(&mut reader, version, is_little_endian)?;

        let mut found_architecture: Option<String> = None;
        let mut found_chat_template: Option<String> = None;

        for _ in 0..metadata_kv_count {
            let key = read_string(&mut reader, version, is_little_endian)?;

            let value_type_raw = if is_little_endian {
                reader.read_u32::<LittleEndian>()?
            } else {
                reader.read_u32::<BigEndian>()?
            };
            let value_type = GGUFMetadataValueType::try_from(value_type_raw)?;

            if key == "general.architecture" {
                if let GGUFMetadataValueType::String = value_type {
                    found_architecture = Some(read_string(&mut reader, version, is_little_endian)?);
                } else {
                    skip_value(&mut reader, value_type, version, is_little_endian)?;
                }
            } else if key == "tokenizer.chat_template" {
                if let GGUFMetadataValueType::String = value_type {
                    found_chat_template =
                        Some(read_string(&mut reader, version, is_little_endian)?);
                } else {
                    skip_value(&mut reader, value_type, version, is_little_endian)?;
                }
            } else {
                skip_value(&mut reader, value_type, version, is_little_endian)?;
            }

            // Stop once we have both — they're always near the top of the file
            if found_architecture.is_some() && found_chat_template.is_some() {
                break;
            }
        }

        let arch_lower = found_architecture.as_deref().unwrap_or("").to_lowercase();

        // For architectures where the embedded template uses unsupported Jinja features,
        // override with our known-good template regardless of what's in the file.
        // Gemma 4 uses <|turn>/<turn|> tokens; Gemma 3 and below use <start_of_turn>/<end_of_turn>.
        match arch_lower.as_str() {
            "gemma" | "gemma3" => {
                return Ok(Some(ChatTemplate::TemplateValue(
                    GEMMA3_TEMPLATE.to_string(),
                )));
            }
            "gemma4" => {
                return Ok(Some(ChatTemplate::Gemma4Native));
            }
            _ => {}
        }

        // Use the embedded template if present
        if let Some(template) = found_chat_template {
            return Ok(Some(ChatTemplate::TemplateValue(template)));
        }

        // Fall back to architecture-based selection using what we already read
        match arch_lower.as_str() {
            "llama" => Ok(Some(ChatTemplate::TemplateKey(LlamaCppRegistry::Llama2))),
            "mistral" => Ok(Some(ChatTemplate::TemplateKey(LlamaCppRegistry::MistralV1))),
            "falcon" => Ok(Some(ChatTemplate::TemplateKey(LlamaCppRegistry::Falcon3))),
            "mpt" => Ok(Some(ChatTemplate::TemplateKey(LlamaCppRegistry::ChatML))),
            "phi2" => Ok(Some(ChatTemplate::TemplateKey(LlamaCppRegistry::Phi3))),
            "gpt2" | "gptj" | "gptneox" => {
                Ok(Some(ChatTemplate::TemplateKey(LlamaCppRegistry::ChatML)))
            }
            "llama3" => Ok(Some(ChatTemplate::TemplateKey(LlamaCppRegistry::Llama3))),
            "phi3" => Ok(Some(ChatTemplate::TemplateKey(LlamaCppRegistry::Phi3))),
            "phi4" => Ok(Some(ChatTemplate::TemplateValue(PHI4_TEMPLATE.to_string()))),
            _ => Ok(None),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::GgufExt;

    #[test]
    fn test_gguf_chat_format() {
        let test_path = dirs::data_dir()
            .unwrap()
            .join("com.typr.stable")
            .join("typr-llm.gguf");

        assert!(test_path.exists());
        test_path.gguf_chat_format().unwrap().unwrap();
    }
}
