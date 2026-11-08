#!/bin/sh
set -eu

if [ -z "${CRON_SECRET:-}" ]; then
  echo "CRON_SECRET is required for scheduled jobs" >&2
  exit 1
fi

call_job() {
  route="$1"
  timeout="${2:-55}"
  if ! curl --fail --silent --show-error --max-time "${timeout}" -X POST \
    -H "Authorization: Bearer ${CRON_SECRET}" \
    "http://app:3000/api/cron/${route}" >/dev/null; then
    echo "Scheduled job failed: ${route}" >&2
  fi
}

minute=0
while :; do
  started_at="$(date +%s)"
  # The reminder queries decide whether anything is due, so a short cadence
  # does not send duplicate reminders. Their database claims are unique.
  call_job meeting-reminders
  call_job webinar-reminders

  if [ $((minute % 5)) -eq 0 ]; then
    call_job email-dispatch
    call_job webhook-dispatch
  fi

  if [ $((minute % 1440)) -eq 0 ]; then
    (
      call_job course-nudge 300
      if [ "${BACKUP_ENABLED:-}" = "true" ]; then call_job db-backup 600; fi
      if [ "${CALCOM_ENABLED:-}" = "true" ]; then call_job meeting-reconciliation 180; fi
    ) &
  fi

  minute=$((minute + 1))
  elapsed=$(( $(date +%s) - started_at ))
  if [ "${elapsed}" -lt 60 ]; then sleep $((60 - elapsed)); fi
done
