#!/usr/bin/env bash
# Reads one line of prompt from stdin, prints it, exits 0.
# Used by pty-spawn / dispatcher tests to assert "happy path" lifecycle.
set -e
read -r prompt || true
printf 'received: %s\n' "$prompt"
exit 0
