#!/bin/sh
set -eu

if [ -z "${CRON_SECRET:-}" ]; then
  echo "CRON_SECRET is required for scheduled jobs" >&2
  exit 1
fi

failed=0
call_job() {
  route="$1"
  timeout="${2:-55}"
  if ! curl --fail --silent --show-error --max-time "$timeout" -X POST \
    -H "Authorization: Bearer ${CRON_SECRET}" \
    "http://127.0.0.1:3000/api/cron/${route}" >/dev/null; then
    echo "Scheduled job failed: ${route}" >&2
    failed=1
  fi
}

case "${1:-}" in
  minute)
    call_job meeting-reminders
    call_job webinar-reminders
    ;;
  five-minute)
    call_job email-dispatch
    call_job webhook-dispatch
    ;;
  daily)
    call_job course-nudge 300
    if [ "${BACKUP_ENABLED:-false}" = "true" ]; then call_job db-backup 600; fi
    if [ "${CALCOM_ENABLED:-false}" = "true" ]; then call_job meeting-reconciliation 180; fi
    ;;
  *)
    echo "Usage: sh /app/scripts/cron/run-once.sh {minute|five-minute|daily}" >&2
    exit 2
    ;;
esac

exit "$failed"
