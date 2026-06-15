#!/usr/bin/env node
// Strip metadata (EXIF, ID3, ICC profiles, comments, etc.) from media assets under data/.

import { existsSync, readdirSync, renameSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { commandExists, runSync } from "./lib/spawn.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = process.env.DATA_DIR ?? path.join(repoRoot, "data");

const imageExts = new Set(["png", "jpg", "jpeg", "webp", "gif", "bmp", "tif", "tiff"]);
const audioExts = new Set([
  "mp3",
  "wav",
  "flac",
  "ogg",
  "opus",
  "m4a",
  "aac",
  "wma",
  "aiff",
  "aif",
]);

let dryRun = false;
let verbose = false;

function usage() {
  console.log(`Usage: node strip-asset-metadata.mjs [options]

Strip metadata from image and audio files under data/.

Options:
  -n, --dry-run   Print files that would be processed without modifying them
  -v, --verbose   Show per-file tool output
  -h, --help      Show this help

Environment:
  DATA_DIR        Asset root (default: ${dataDir})`);
}

function log(message) {
  console.log(`==> ${message}`);
}

function warn(message) {
  console.warn(`warning: ${message}`);
}

function die(message) {
  console.error(`error: ${message}`);
  process.exit(1);
}

function extLower(file) {
  const base = path.basename(file);
  const dot = base.lastIndexOf(".");
  if (dot <= 0) {
    return "";
  }
  return base.slice(dot + 1).toLowerCase();
}

function walkFiles(root) {
  const files = [];
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.isFile()) {
        files.push(fullPath);
      }
    }
  }
  return files;
}

function collectMediaFiles() {
  return walkFiles(dataDir).filter((file) => {
    const ext = extLower(file);
    return imageExts.has(ext) || audioExts.has(ext);
  });
}

function ensureMagick() {
  if (commandExists("magick") || commandExists("convert")) {
    return;
  }
  die("ImageMagick not found (install magick or convert)");
}

function ensureFfmpeg() {
  if (!commandExists("ffmpeg")) {
    die("ffmpeg not found (install ffmpeg and ensure it is on PATH)");
  }
}

function runMagick(args) {
  if (commandExists("magick")) {
    runSync("magick", args, { quiet: !verbose });
  } else {
    runSync("convert", args, { quiet: !verbose });
  }
}

function stripImageMagick(file) {
  const tmp = path.join(
    os.tmpdir(),
    `strip-img-${process.pid}-${Math.random().toString(16).slice(2)}`,
  );
  if (dryRun) {
    console.log(`  [dry-run] image: ${file}`);
    return;
  }
  runMagick([file, "-strip", tmp]);
  renameSync(tmp, file);
  console.log(`  stripped image: ${file}`);
}

function stripAudioFfmpeg(file, ext) {
  const tmp = path.join(
    os.tmpdir(),
    `strip-aud-${process.pid}-${Math.random().toString(16).slice(2)}.${ext}`,
  );
  if (dryRun) {
    console.log(`  [dry-run] audio: ${file}`);
    return;
  }

  const args = [
    "-y",
    "-hide_banner",
    "-loglevel",
    verbose ? "info" : "error",
    "-i",
    file,
    "-map",
    "0:a?",
    "-map_metadata",
    "-1",
    "-fflags",
    "+bitexact",
    "-flags:a",
    "+bitexact",
    "-codec:a",
    "copy",
    tmp,
  ];

  if (ext === "mp3") {
    args.splice(args.length - 2, 0, "-id3v2_version", "0", "-write_id3v1", "0");
  }

  runSync("ffmpeg", args, { quiet: !verbose });
  renameSync(tmp, file);
  console.log(`  stripped audio: ${file}`);
}

function stripImagesWithExiftool() {
  const args = ["-r", "-overwrite_original_in_place", "-all=", "-P", "-progress"];
  if (dryRun) {
    args.splice(1, 1, "-n");
  } else if (!verbose) {
    args.push("-q", "-q");
  }
  for (const ext of imageExts) {
    args.push("-ext", ext);
  }
  args.push(dataDir);
  log(`stripping image metadata with exiftool under ${dataDir}`);
  runSync("exiftool", args, { quiet: !verbose && !dryRun });
}

function stripImagesWithMagick() {
  ensureMagick();
  log(`stripping image metadata with ImageMagick under ${dataDir}`);
  let count = 0;
  for (const file of collectMediaFiles()) {
    if (imageExts.has(extLower(file))) {
      stripImageMagick(file);
      count += 1;
    }
  }
  log(`processed ${count} image(s)`);
}

function stripAudioFiles() {
  ensureFfmpeg();
  log(`stripping audio metadata with ffmpeg under ${dataDir}`);
  let count = 0;
  for (const file of collectMediaFiles()) {
    const ext = extLower(file);
    if (audioExts.has(ext)) {
      stripAudioFfmpeg(file, ext);
      count += 1;
    }
  }
  log(`processed ${count} audio file(s)`);
}

const argv = process.argv.slice(2);
for (const arg of argv) {
  if (arg === "-n" || arg === "--dry-run") {
    dryRun = true;
  } else if (arg === "-v" || arg === "--verbose") {
    verbose = true;
  } else if (arg === "-h" || arg === "--help") {
    usage();
    process.exit(0);
  } else {
    die(`unknown option: ${arg} (try --help)`);
  }
}

if (!existsSync(dataDir)) {
  die(`data directory not found: ${dataDir}`);
}

if (commandExists("exiftool")) {
  stripImagesWithExiftool();
} else {
  warn(
    "exiftool not found; using ImageMagick for images (install exiftool for faster image stripping)",
  );
  stripImagesWithMagick();
}

stripAudioFiles();

if (dryRun) {
  log("dry run complete; no files were modified");
} else {
  log("metadata stripping complete");
}
