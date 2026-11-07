import { describe, it, expect } from 'vitest';
import { spawnMsFromReading } from '../spawnTimer.ts';

const MIN = 60_000;

describe('spawnMsFromReading', () => {
  it('adds 30 s to readings of 2 minutes or more (middle of the round-down window)', () => {
    expect(spawnMsFromReading(2 * MIN)).toBe(2 * MIN + 30_000);
    expect(spawnMsFromReading(30 * MIN)).toBe(30 * MIN + 30_000);
  });

  it('leaves "1 minute" at 1:00, the middle of its 0:00–1:59 window', () => {
    expect(spawnMsFromReading(MIN)).toBe(MIN);
  });

  it('treats the "0 minutes" game bug (parsed as 60) like any other reading', () => {
    expect(spawnMsFromReading(60 * MIN)).toBe(60 * MIN + 30_000);
  });

  it('subtracts time elapsed since the dialog was read', () => {
    expect(spawnMsFromReading(30 * MIN, 12_000)).toBe(30 * MIN + 18_000);
    expect(spawnMsFromReading(MIN, 15_000)).toBe(45_000);
  });

  it('rounds to whole ms', () => {
    expect(spawnMsFromReading(30 * MIN, 0.4)).toBe(30 * MIN + 30_000);
  });

  it('never returns less than 1 ms', () => {
    expect(spawnMsFromReading(MIN, 5 * MIN)).toBe(1);
  });
});
