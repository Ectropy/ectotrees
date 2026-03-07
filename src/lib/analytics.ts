export type UiEventName =
  | 'ui_panel_open'
  | 'ui_tool_open'
  | 'ui_tool_submit'
  | 'ui_world_action'
  | 'ui_nav_action';

export type UiPanel = 'grid' | 'settings' | 'session' | 'session-join' | 'detail' | 'spawn' | 'tree' | 'dead';
export type UiTool = 'spawn' | 'tree' | 'dead';
export type UiSurface = 'sidebar' | 'fullscreen';
export type UiSidebarSide = 'left' | 'right' | 'none';
export type UiResult = 'success' | 'cancel' | 'confirm';
export type UiAction =
  | 'set_timer'
  | 'save_tree_info'
  | 'update_tree_info'
  | 'override_tree_info'
  | 'mark_dead'
  | 'clear_world'
  | 'toggle_favorite'
  | 'open_settings'
  | 'close_view';

export interface UiEventParams {
  panel?: UiPanel;
  tool?: UiTool;
  world_id?: number;
  surface?: UiSurface;
  sidebar_side?: UiSidebarSide;
  action?: UiAction;
  result?: UiResult;
}

type UiDataLayerEvent = {
  event: 'app_ui_event';
  event_name: UiEventName;
} & UiEventParams;

export function trackUiEvent(eventName: UiEventName, params: UiEventParams = {}): void {
  if (typeof window === 'undefined') return;

  try {
    if (!Array.isArray(window.dataLayer)) return;

    const payload: UiDataLayerEvent = {
      event: 'app_ui_event',
      event_name: eventName,
      ...params,
    };

    window.dataLayer.push(payload);

    if (import.meta.env.DEV) {
      console.debug('[analytics]', payload);
    }
  } catch {
    // Ignore analytics failures so app behavior is never affected.
  }
}
