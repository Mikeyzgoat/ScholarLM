#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_dir"

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required. Install Docker Desktop or Docker Engine first." >&2
  exit 1
fi
if ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose v2 is required." >&2
  exit 1
fi

printf "OpenRouter API key: "
IFS= read -r -s openrouter_key
printf "\n"
if [[ -z "$openrouter_key" || "$openrouter_key" == *$'\n'* || "$openrouter_key" == *$'\r'* ]]; then
  echo "A valid OpenRouter API key is required." >&2
  exit 1
fi

read -r -p "Frontend port [3000, enter 0 to choose a free port]: " frontend_port
frontend_port="${frontend_port:-3000}"
if [[ ! "$frontend_port" =~ ^[0-9]+$ ]] || ((frontend_port < 0 || frontend_port > 65535)); then
  echo "Frontend port must be 0 (automatic) or between 1 and 65535." >&2
  exit 1
fi

printf "ngrok authtoken (optional, press Enter to skip): "
IFS= read -r -s ngrok_token
printf "\n"
if [[ "$ngrok_token" == *$'\n'* || "$ngrok_token" == *$'\r'* ]]; then
  echo "The ngrok authtoken must be a single line." >&2
  exit 1
fi

umask 077
config_file="$(mktemp "$project_dir/.env.docker.tmp.XXXXXX")"
trap 'rm -f "$config_file"' EXIT
{
  printf 'OPENROUTER_API_KEY=%s\n' "$openrouter_key"
  printf 'OPENROUTER_BASE_URL=https://openrouter.ai/api/v1\n'
  printf 'OPENROUTER_MODEL=google/gemma-4-26b-a4b-it:free\n'
  printf 'OPENROUTER_VISION_MODEL=google/gemma-4-26b-a4b-it:free\n'
  printf 'OPENROUTER_EMBEDDING_MODEL=nvidia/llama-nemotron-embed-vl-1b-v2:free\n'
  printf 'OPENROUTER_SPEECH_MODEL=fish-audio/s2.1-pro-free:free\n'
  printf 'OPENROUTER_ROUTING_MODELS=google/gemma-4-31b-it:free,openrouter/free\n'
  printf 'SCHOLARLM_FRONTEND_PORT=%s\n' "$frontend_port"
  if [[ -n "$ngrok_token" ]]; then
    printf 'NGROK_AUTHTOKEN=%s\n' "$ngrok_token"
    printf 'NGROK_INSPECTOR_PORT=4040\n'
  fi
} > "$config_file"
mv "$config_file" .env.docker
trap - EXIT

docker compose --env-file .env.docker up --build -d
published_port="$(docker compose --env-file .env.docker port frontend 80 | tail -n 1 | sed 's/.*://')"
echo "ScholarLM is starting at http://localhost:${published_port:-$frontend_port}"
echo "View startup logs with: docker compose --env-file .env.docker logs -f"
