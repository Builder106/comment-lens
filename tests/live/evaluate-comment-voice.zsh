#!/usr/bin/env zsh

secret_file="$HOME/.config/comment-lens/gemini.zsh"
if [[ ! -r "$secret_file" ]]; then
  print -u2 "Gemini key file is not readable: $secret_file"
  exit 2
fi

source "$secret_file"
if [[ -z "${GEMINI_API_KEY:-}" ]]; then
  print -u2 "GEMINI_API_KEY is not set in the key file."
  exit 2
fi

exec node --import tsx tests/live/comment-voice-evaluation.ts --confirm-live
