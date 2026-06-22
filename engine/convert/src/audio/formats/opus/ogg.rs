use std::io::Write;

use crate::error::{ConvertError, Result};

const SERIAL: u32 = 0x4242_5831;

pub struct OggWriter<W> {
    writer: W,
    sequence: u32,
    page: Vec<u8>,
}

impl<W: Write> OggWriter<W> {
    pub fn new(writer: W, channels: u8, pre_skip: u16) -> Result<Self> {
        let mut this = Self {
            writer,
            sequence: 0,
            page: Vec::with_capacity(8192),
        };
        let mut head = [0_u8; 19];
        head[..8].copy_from_slice(b"OpusHead");
        head[8] = 1;
        head[9] = channels;
        head[10..12].copy_from_slice(&pre_skip.to_le_bytes());
        head[12..16].copy_from_slice(&48_000_u32.to_le_bytes());
        this.write_page(&head, 0, 0x02)?;
        this.write_page(b"OpusTags\x08\0\0\0Blackbox\0\0\0\0", 0, 0)?;
        Ok(this)
    }

    pub fn write_packet(&mut self, packet: &[u8], granule: u64, end: bool) -> Result<()> {
        self.write_page(packet, granule, if end { 0x04 } else { 0 })
    }

    pub fn into_inner(self) -> W {
        self.writer
    }

    fn write_page(&mut self, packet: &[u8], granule: u64, flags: u8) -> Result<()> {
        let segments = packet.len() / 255 + 1;
        if segments > 255 {
            return Err(ConvertError::Container(
                "Opus packet exceeds one Ogg page".to_string(),
            ));
        }
        self.page.clear();
        self.page.resize(27 + segments, 0);
        self.page[..4].copy_from_slice(b"OggS");
        self.page[5] = flags;
        self.page[6..14].copy_from_slice(&granule.to_le_bytes());
        self.page[14..18].copy_from_slice(&SERIAL.to_le_bytes());
        self.page[18..22].copy_from_slice(&self.sequence.to_le_bytes());
        self.page[26] = segments as u8;
        for segment in 0..segments {
            let remaining = packet.len().saturating_sub(segment * 255);
            self.page[27 + segment] = remaining.min(255) as u8;
        }
        self.page.extend_from_slice(packet);
        let checksum = crc32(&self.page);
        self.page[22..26].copy_from_slice(&checksum.to_le_bytes());
        self.writer.write_all(&self.page)?;
        self.sequence = self.sequence.wrapping_add(1);
        Ok(())
    }
}

fn crc32(bytes: &[u8]) -> u32 {
    let mut crc = 0_u32;
    for &byte in bytes {
        crc ^= u32::from(byte) << 24;
        for _ in 0..8 {
            crc = if crc & 0x8000_0000 != 0 {
                (crc << 1) ^ 0x04c1_1db7
            } else {
                crc << 1
            };
        }
    }
    crc
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn writer_emits_ogg_capture_pattern() {
        let bytes = OggWriter::new(Vec::new(), 2, 312)
            .expect("writer")
            .into_inner();
        assert_eq!(&bytes[..4], b"OggS");
    }
}
