import { formatInTimeZone, fromZonedTime } from "date-fns-tz"

export const APP_TIME_ZONE = "Europe/Madrid"

function toDate(value: Date | string) {
  return typeof value === "string" ? new Date(value) : value
}

export function getTodayDateKeyInAppTimeZone(now = new Date()) {
  return formatInTimeZone(now, APP_TIME_ZONE, "yyyy-MM-dd")
}

export function toDateKeyInAppTimeZone(value: Date | string) {
  return formatInTimeZone(toDate(value), APP_TIME_ZONE, "yyyy-MM-dd")
}

export function toDateTimeLocalInAppTimeZone(value: Date | string) {
  return formatInTimeZone(toDate(value), APP_TIME_ZONE, "yyyy-MM-dd'T'HH:mm")
}

export function getHourInAppTimeZone(value: Date | string) {
  return Number(formatInTimeZone(toDate(value), APP_TIME_ZONE, "H"))
}

export function formatDateInAppTimeZone(
  value: Date | string,
  options: Intl.DateTimeFormatOptions
) {
  return new Intl.DateTimeFormat("es-ES", {
    ...options,
    timeZone: APP_TIME_ZONE
  }).format(toDate(value))
}

export function fromDateTimeLocalInAppTimeZone(value: string) {
  return fromZonedTime(value, APP_TIME_ZONE).toISOString()
}
