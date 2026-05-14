use bytes::{BufMut, Bytes, BytesMut};
use futures_util::{Stream, StreamExt};
use kalosm_sound::AsyncSource;

mod error;
pub use error::*;

const I16_SCALE: f32 = 32768.0;

impl<T: AsyncSource> AudioFormatExt for T {}

pub trait AudioFormatExt: AsyncSource {
    fn to_i16_le_chunks(
        self,
        sample_rate: u32,
        chunk_size: usize,
    ) -> impl Stream<Item = Bytes> + Send + Unpin
    where
        Self: Sized + Send + Unpin + 'static,
    {
        self.resample(sample_rate).chunks(chunk_size).map(|chunk| {
            let n = std::mem::size_of::<f32>() * chunk.len();

            let mut buf = BytesMut::with_capacity(n);
            for sample in chunk {
                let scaled = (sample * I16_SCALE).clamp(-I16_SCALE, I16_SCALE);
                buf.put_i16_le(scaled as i16);
            }
            buf.freeze()
        })
    }
}

pub fn i16_to_f32_samples(samples: &[i16]) -> Vec<f32> {
    samples
        .iter()
        .map(|&sample| sample as f32 / I16_SCALE)
        .collect()
}

pub fn f32_to_i16_samples(samples: &[f32]) -> Vec<i16> {
    samples
        .iter()
        .map(|&sample| {
            let scaled = (sample * I16_SCALE).clamp(-I16_SCALE, I16_SCALE);
            scaled as i16
        })
        .collect()
}

pub fn f32_to_i16_bytes(chunk: Vec<f32>) -> bytes::Bytes {
    let mut bytes = Vec::with_capacity(chunk.len() * 2);
    for sample in chunk {
        let i16_sample = (sample * I16_SCALE).clamp(-I16_SCALE, I16_SCALE) as i16;
        bytes.extend_from_slice(&i16_sample.to_le_bytes());
    }
    bytes::Bytes::from(bytes)
}

pub fn bytes_to_f32_samples(data: &[u8]) -> Vec<f32> {
    data.chunks_exact(2)
        .map(|chunk| {
            let sample = i16::from_le_bytes([chunk[0], chunk[1]]);
            sample as f32 / I16_SCALE
        })
        .collect()
}

pub fn resample_audio<S, T>(source: S, to_rate: u32) -> Result<Vec<f32>, crate::Error>
where
    S: rodio::Source<Item = T> + Iterator<Item = T>,
    T: rodio::Sample,
{
    use rubato::{
        Resampler, SincFixedIn, SincInterpolationParameters, SincInterpolationType, WindowFunction,
    };

    let from_rate = source.sample_rate() as f64;
    let channels = source.channels() as usize;
    let to_rate_f64 = to_rate as f64;

    let samples: Vec<f32> = source.map(|sample| sample.to_f32()).collect();

    if (from_rate - to_rate_f64).abs() < 1.0 {
        return Ok(samples);
    }

    let chunk_size = 1024;
    let params = SincInterpolationParameters {
        sinc_len: 256,
        f_cutoff: 0.95,
        interpolation: SincInterpolationType::Linear,
        oversampling_factor: 256,
        window: WindowFunction::BlackmanHarris2,
    };

    let mut resampler =
        SincFixedIn::<f32>::new(to_rate_f64 / from_rate, 2.0, params, chunk_size, channels)?;

    let frames_per_channel = samples.len() / channels;
    let mut input_channels: Vec<Vec<f32>> = vec![Vec::with_capacity(frames_per_channel); channels];

    for (i, &sample) in samples.iter().enumerate() {
        input_channels[i % channels].push(sample);
    }

    // Process all frames in chunks — SincFixedIn only processes chunk_size frames per call
    let mut all_output_channels: Vec<Vec<f32>> = vec![Vec::new(); channels];
    let mut offset = 0;

    while offset + chunk_size <= frames_per_channel {
        let chunk: Vec<Vec<f32>> = input_channels
            .iter()
            .map(|ch| ch[offset..offset + chunk_size].to_vec())
            .collect();
        let output_chunk = resampler.process(&chunk, None)?;
        for (ch_idx, ch_data) in output_chunk.into_iter().enumerate() {
            all_output_channels[ch_idx].extend(ch_data);
        }
        offset += chunk_size;
    }

    // Process remaining frames (pad with zeros to fill the last chunk)
    let remaining = frames_per_channel - offset;
    if remaining > 0 {
        let chunk: Vec<Vec<f32>> = input_channels
            .iter()
            .map(|ch| {
                let mut padded = ch[offset..].to_vec();
                padded.resize(chunk_size, 0.0);
                padded
            })
            .collect();
        let output_chunk = resampler.process(&chunk, None)?;
        // Only take the proportional output for the remaining input
        let expected_output = (remaining as f64 * to_rate_f64 / from_rate).ceil() as usize;
        for (ch_idx, ch_data) in output_chunk.into_iter().enumerate() {
            let take = expected_output.min(ch_data.len());
            all_output_channels[ch_idx].extend(&ch_data[..take]);
        }
    }

    // Interleave channels back together
    let output_frames = all_output_channels[0].len();
    let mut output = Vec::with_capacity(output_frames * channels);

    for frame in 0..output_frames {
        for ch in 0..channels {
            output.push(all_output_channels[ch][frame]);
        }
    }

    Ok(output)
}
