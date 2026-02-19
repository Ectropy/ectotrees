/** Server-side logging with configurable timezone timestamps.
 *  Set LOG_TZ to any IANA timezone (e.g. "UTC", "America/Los_Angeles").
 *  Defaults to America/New_York (Eastern). */

const LOG_TZ = process.env.LOG_TZ ?? 'America/New_York';

function timestamp(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: LOG_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
    timeZoneName: 'short',
  }).formatToParts(new Date());

  const get = (type: string) => parts.find(p => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')} ${get('timeZoneName')}`;
}

export function log(...args: unknown[]): void {
  console.log(timestamp(), ...args);
}

export function warn(...args: unknown[]): void {
  console.warn(timestamp(), ...args);
}
