import { describe, expect, it } from 'vitest';
import {
  coordsForLocation,
  hintForLocation,
  hintsForLocation,
  LOCATION_COORDS,
  LOCATION_HINTS,
  locationsForHint,
  resolveExactLocation,
} from '../evilTree';

describe('hintForLocation', () => {
  it('returns the hint for a location that belongs to exactly one hint', () => {
    expect(hintForLocation('Northeast of Yanille')).toBe('Close to the town you call Yanille');
  });

  it('returns the first matching hint for a location shared across multiple hints', () => {
    // "South of Draynor Village, near the willow trees" appears under both
    // "Close to a large collection of willow trees" and "Due west of the town you call Lumbridge"
    const result = hintForLocation('South of Draynor Village, near the willow trees');
    expect(result).toBe('Close to a large collection of willow trees');
  });

  it('returns empty string for an unknown location', () => {
    expect(hintForLocation('Somewhere that does not exist')).toBe('');
  });

  it('does not overwrite an already-selected hint when a location belongs to multiple hints', () => {
    // Simulate the bug scenario: user selects "Due west of the town you call Lumbridge",
    // then picks "South of Draynor Village, near the willow trees" as exact location.
    // The handler should only call hintForLocation when hint is empty — this test
    // confirms hintForLocation would return a *different* hint, proving the guard is necessary.
    const selectedHint = 'Due west of the town you call Lumbridge';
    const pickedLocation = 'South of Draynor Village, near the willow trees';

    // The location is valid for the selected hint
    expect(locationsForHint(selectedHint)).toContain(pickedLocation);

    // But hintForLocation returns a different (first-match) hint
    expect(hintForLocation(pickedLocation)).not.toBe(selectedHint);
  });
});

describe('locationsForHint', () => {
  it('returns locations for a known hint', () => {
    expect(locationsForHint('Close to the town you call Yanille')).toEqual([
      'Northeast of Yanille',
      'South of Tree Gnome Village and northwest of Yanille',
    ]);
  });

  it('returns empty array for an unknown hint', () => {
    expect(locationsForHint('Not a real hint')).toEqual([]);
  });
});

describe('resolveExactLocation', () => {
  it('auto-resolves when a hint has exactly one location', () => {
    expect(resolveExactLocation('Close to a collection of yew trees')).toBe(
      "South of Seers' Village flax field by the yew trees"
    );
  });

  it('returns empty string when a hint has multiple locations', () => {
    expect(resolveExactLocation('Close to the town you call Yanille')).toBe('');
  });

  it('returns empty string for an unknown hint', () => {
    expect(resolveExactLocation('Not a real hint')).toBe('');
  });
});

describe('LOCATION_COORDS coverage', () => {
  it('every location name in LOCATION_HINTS has a matching LOCATION_COORDS entry', () => {
    const missing: string[] = [];
    for (const { locations } of LOCATION_HINTS) {
      for (const name of locations) {
        if (!(name in LOCATION_COORDS)) missing.push(name);
      }
    }
    expect(missing).toEqual([]);
  });

  it('every LOCATION_COORDS key is referenced by at least one hint', () => {
    const referenced = new Set(LOCATION_HINTS.flatMap(lh => lh.locations));
    const unused = Object.keys(LOCATION_COORDS).filter(name => !referenced.has(name));
    expect(unused).toEqual([]);
  });

  it('has 26 unique spawn locations', () => {
    expect(Object.keys(LOCATION_COORDS)).toHaveLength(26);
  });
});

describe('coordsForLocation', () => {
  it('returns coordinates for a known location', () => {
    expect(coordsForLocation('Northeast of Yanille')).toEqual({ x: 2606, y: 3121 });
  });

  it('returns undefined for an unknown location', () => {
    expect(coordsForLocation('Somewhere that does not exist')).toBeUndefined();
  });
});

describe('hintsForLocation', () => {
  it('returns all hints that reference a shared location', () => {
    // "South of Legends' Guild" is referenced by three different hints
    expect(hintsForLocation("South of Legends' Guild")).toEqual([
      'Close to a large collection of willow trees',
      'Close to a mine on the outskirts of a city',
      "Close to the home of 'Legends'",
    ]);
  });

  it('returns a single-element array for a location tied to exactly one hint', () => {
    expect(hintsForLocation('Northeast of Yanille')).toEqual(['Close to the town you call Yanille']);
  });

  it('returns an empty array for an unknown location', () => {
    expect(hintsForLocation('Somewhere that does not exist')).toEqual([]);
  });
});
