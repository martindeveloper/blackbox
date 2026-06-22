# blackbox-convert

Media converter used by Blackbox build tooling.

```bash
cargo run -p blackbox-convert --release -- \
  image input.png output.webp --quality 85 --max-width 1920 --max-height 1080

cargo run -p blackbox-convert --release -- \
  audio input.wav output.ogg --codec opus --bitrate 96000

cargo run -p blackbox-convert --release -- \
  audio input.mp3 output.m4a --codec aac --bitrate 128000
```

Inputs:

- Images: PNG, JPEG, WebP
- Audio: WAV/PCM, MP3, OGG/Vorbis, M4A/MP4/AAC

Outputs:

- Images: lossy WebP, PNG, JPEG
- Audio: OGG/Opus, M4A/AAC-LC, WAV/PCM

`--json` emits one structured result object. Conversion strips source metadata.

The executable contains its codecs. It does not discover or execute `ffmpeg` or `cwebp`.

## Structure

```text
src/
  audio/
    decode.rs
    pipeline.rs
    formats/
      aac.rs
      opus/
        mod.rs
        ogg.rs
      wav.rs
  texture/
    resize.rs
    formats/
      jpeg.rs
      png.rs
      webp.rs
```

Audio input decoding and resampling are shared. Each output format implements one PCM sink.
Texture decoding and resizing are shared, while each encoder owns its format-specific details.
