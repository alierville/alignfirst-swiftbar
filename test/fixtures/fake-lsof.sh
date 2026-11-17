#!/bin/sh
# Stand-in for /usr/sbin/lsof on Linux CI, where the real one lives elsewhere. Prints the
# `lsof -F pcn` output the end-to-end test wrote; without it, behaves like lsof with nothing listening.
if [ -n "$WORKSPACE_BAR_FAKE_LSOF" ] && [ -f "$WORKSPACE_BAR_FAKE_LSOF" ]; then
  cat "$WORKSPACE_BAR_FAKE_LSOF"
  exit 0
fi
exit 1
