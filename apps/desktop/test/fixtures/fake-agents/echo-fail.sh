#!/usr/bin/env bash
# Reads prompt, prints, exits 1. Used to assert non-zero exits flow to task `error`.
set -e
read -r prompt || true
printf 'received: %s\n' "$prompt"
exit 1
