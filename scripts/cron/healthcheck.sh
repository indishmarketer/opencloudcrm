#!/bin/sh
set -eu

heartbeat=/tmp/opencloudcrm-scheduler-heartbeat
test -f "$heartbeat"
last_update="$(stat -c %Y "$heartbeat")"
age=$(( $(date +%s) - last_update ))
test "$age" -ge 0
test "$age" -lt 180
