#!/bin/sh
# workspace-bar calls /usr/sbin/lsof, the macOS path. Installed there on Linux CI, this hands the
# call to Linux's real lsof, so the end-to-end test observes the real listening sockets.
exec /usr/bin/lsof "$@"
