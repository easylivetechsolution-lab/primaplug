// Supabase/Postgres sometimes returns timestamps without a timezone suffix
// (e.g. "2026-05-06T12:10:48.167958" instead of "...167958+00:00"), even
// though the value is actually UTC. JS's `new Date()` treats an offset-less
// datetime string as local time, which silently shifts every displayed time
// by the browser's UTC offset. Always go through this instead of `new Date()`
// directly for server-sourced timestamps.
export const parseTimestamp = (value) => {
  if (!value) return new Date()
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(value)) {
    return new Date(value + 'Z')
  }
  return new Date(value)
}
