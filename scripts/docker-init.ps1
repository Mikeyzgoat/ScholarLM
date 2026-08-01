$ErrorActionPreference = "Stop"

$ProjectDir = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectDir

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw "Docker Desktop is required and docker must be available on PATH."
}
docker compose version | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Docker Compose v2 is required." }

$SecureKey = Read-Host "OpenRouter API key" -AsSecureString
$KeyPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecureKey)
try {
  $OpenRouterKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($KeyPointer)
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($KeyPointer)
}
if ([string]::IsNullOrWhiteSpace($OpenRouterKey) -or $OpenRouterKey.Contains("`n") -or $OpenRouterKey.Contains("`r")) {
  throw "A valid OpenRouter API key is required."
}

$FrontendPort = Read-Host "Frontend port [3000]"
if ([string]::IsNullOrWhiteSpace($FrontendPort)) { $FrontendPort = "3000" }
$ParsedPort = 0
if (-not [int]::TryParse($FrontendPort, [ref]$ParsedPort) -or $ParsedPort -lt 1 -or $ParsedPort -gt 65535) {
  throw "Frontend port must be between 1 and 65535."
}

$Config = @(
  "OPENROUTER_API_KEY=$OpenRouterKey"
  "OPENROUTER_BASE_URL=https://openrouter.ai/api/v1"
  "OPENROUTER_MODEL=google/gemma-4-26b-a4b-it:free"
  "OPENROUTER_VISION_MODEL=google/gemma-4-26b-a4b-it:free"
  "OPENROUTER_EMBEDDING_MODEL=nvidia/llama-nemotron-embed-vl-1b-v2:free"
  "OPENROUTER_SPEECH_MODEL=fish-audio/s2.1-pro-free:free"
  "OPENROUTER_ROUTING_MODELS=google/gemma-4-31b-it:free,openrouter/free"
  "SCHOLARLM_FRONTEND_PORT=$ParsedPort"
)
[IO.File]::WriteAllLines((Join-Path $ProjectDir ".env.docker"), $Config)
$OpenRouterKey = $null

docker compose --env-file .env.docker up --build -d
if ($LASTEXITCODE -ne 0) { throw "Docker Compose failed to start ScholarLM." }
Write-Host "ScholarLM is starting at http://localhost:$ParsedPort"
Write-Host "View startup logs with: docker compose --env-file .env.docker logs -f"
