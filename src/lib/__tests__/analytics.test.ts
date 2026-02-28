import { describe, expect, it, vi, afterEach } from 'vitest';
import { trackUiEvent } from '../analytics';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('trackUiEvent', () => {
  it('pushes an event payload to dataLayer when available', () => {
    const dataLayer: Array<Record<string, unknown>> = [];
    vi.stubGlobal('window', { dataLayer });

    trackUiEvent('ui_panel_open', {
      panel: 'detail',
      world_id: 17,
      surface: 'sidebar',
      sidebar_side: 'left',
    });

    expect(dataLayer).toHaveLength(1);
    expect(dataLayer[0]).toMatchObject({
      event: 'app_ui_event',
      event_name: 'ui_panel_open',
      panel: 'detail',
      world_id: 17,
      surface: 'sidebar',
      sidebar_side: 'left',
    });
  });

  it('does not throw when dataLayer is missing', () => {
    vi.stubGlobal('window', {});
    expect(() =>
      trackUiEvent('ui_nav_action', { action: 'open_settings' })
    ).not.toThrow();
  });
});
