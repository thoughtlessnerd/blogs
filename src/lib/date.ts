// Date#toDateString() renders "Sun Oct 04 2026". Fixed to en-US so the output
// is stable regardless of the build machine's locale.
const formatter = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});

export function formatDate(date: Date): string {
  return formatter.format(date);
}

// Frontmatter dates are calendar days, so the machine-readable attribute
// should be the day alone, not a midnight-UTC timestamp.
export function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
