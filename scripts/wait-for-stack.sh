#!/usr/bin/env bash
# Wait until every long-running compose service is healthy and the one-shot services
# (migrate, seed) have exited 0. Fails fast if a one-shot service fails.
#
#   scripts/wait-for-stack.sh [timeout-seconds]   # default 900; counts image builds too
set -euo pipefail

timeout_seconds="${1:-900}"
long_running=(postgres temporal storage extractor api worker console)
one_shot=(migrate seed)
last_report=""

while true; do
  # `docker compose ps --format json` prints an array or one object per line depending
  # on the Compose version; slurp and flatten handles both.
  states="$(docker compose ps --all --format json 2>/dev/null |
    jq -sc 'flatten | map({key: .Service, value: {state: .State, health: (.Health // ""), code: .ExitCode}}) | from_entries')"
  waiting=()
  for service in "${long_running[@]}"; do
    health="$(jq -r --arg s "$service" '.[$s].health // "not created"' <<<"$states")"
    [[ "$health" == "healthy" ]] || waiting+=("$service (${health:-no health yet})")
  done
  for service in "${one_shot[@]}"; do
    state="$(jq -r --arg s "$service" '.[$s].state // "not created"' <<<"$states")"
    code="$(jq -r --arg s "$service" '.[$s].code // ""' <<<"$states")"
    if [[ "$state" == "exited" && "$code" != "0" ]]; then
      echo "::error::$service exited with code $code"
      exit 1
    fi
    [[ "$state" == "exited" ]] || waiting+=("$service ($state)")
  done

  if ((${#waiting[@]} == 0)); then
    echo "Stack ready after ${SECONDS}s: ${long_running[*]} healthy; ${one_shot[*]} exited 0."
    exit 0
  fi
  if ((SECONDS >= timeout_seconds)); then
    echo "::error::Timed out after ${timeout_seconds}s waiting for: ${waiting[*]}"
    exit 1
  fi
  report="${waiting[*]}"
  if [[ "$report" != "$last_report" ]]; then
    echo "[${SECONDS}s] waiting for: $report"
    last_report="$report"
  fi
  sleep 3
done
