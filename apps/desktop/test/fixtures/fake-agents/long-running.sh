#!/usr/bin/env bash
# Reads prompt, then sleeps for a long time. Cancel tests SIGTERM this within ≤1 s
# to exercise the "user cancelled" branch of the dispatcher's exit handler.
read -r prompt || true
printf 'starting: %s\n' "$prompt"
sleep 30
exit 0
