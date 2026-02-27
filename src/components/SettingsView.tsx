import { PanelLeft, PanelRight, Settings } from 'lucide-react';
import type { AppSettings } from '../hooks/useSettings';
import { Switch } from '@/components/ui/switch';

interface Props {
  settings: AppSettings;
  onUpdateSettings: (patch: Partial<AppSettings>) => void;
  onBack: () => void;
}

export function SettingsView({ settings, onUpdateSettings, onBack }: Props) {
  return (
    <div className="min-h-screen bg-gray-900 p-4 sm:p-6">
      <div className="max-w-lg mx-auto">
        <div className="mb-6">

          <h1 className="text-2xl font-bold text-white flex items-center gap-2"><Settings className="h-5 w-5" /> Settings</h1>
        </div>

        <div className="bg-gray-800 border border-gray-700 rounded divide-y divide-gray-700">
          <SettingRow
            label="Lightning Animations"
            description="Flash effect on auto-health transitions"
            value={settings.effectsLightning}
            onChange={v => onUpdateSettings({ effectsLightning: v })}
          />
          <SettingRow
            label="Ember Sparks"
            description="Particle animation on dead tree cards"
            value={settings.effectsSparks}
            onChange={v => onUpdateSettings({ effectsSparks: v })}
          />
          <SettingRow
            label="Tip Ticker"
            description="Scrolling tips in the footer"
            value={settings.showTipTicker}
            onChange={v => onUpdateSettings({ showTipTicker: v })}
          />
          <SettingRow
            label="Sidebar Panel"
            description="Show tools in a panel beside the grid instead of full-screen (desktop only)"
            value={settings.sidebarEnabled}
            onChange={v => onUpdateSettings({ sidebarEnabled: v })}
          />
          {settings.sidebarEnabled && (
            <div className="flex items-center justify-between px-4 py-3 gap-4">
              <p className="text-sm font-medium text-gray-100">Dock side</p>
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1 text-xs text-gray-400">
                  {settings.sidebarSide === 'left' ? (
                    <><PanelLeft className="h-3.5 w-3.5" /> Left</>
                  ) : (
                    <><PanelRight className="h-3.5 w-3.5" /> Right</>
                  )}
                </span>
                <Switch
                  checked={settings.sidebarSide === 'right'}
                  onCheckedChange={v => onUpdateSettings({ sidebarSide: v ? 'right' : 'left' })}
                  className="data-[state=checked]:bg-white data-[state=unchecked]:bg-white"
                />
              </div>
            </div>
          )}
        </div>

        <button
          onClick={onBack}
          className="mt-6 w-full bg-gray-700 hover:bg-gray-600 text-white font-medium rounded py-2.5 transition-colors"
        >
          Close
        </button>
      </div>
    </div>
  );
}

function SettingRow({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-3 gap-4">
      <div>
        <p className="text-sm font-medium text-gray-100">{label}</p>
        <p className="text-xs text-gray-400 mt-0.5">{description}</p>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs w-6 text-right text-gray-400" aria-hidden="true">
          {value ? 'On' : 'Off'}
        </span>
        <Switch
          checked={value}
          onCheckedChange={onChange}
          className="data-[state=checked]:bg-green-600 data-[state=unchecked]:bg-gray-600"
        />
      </div>
    </div>
  );
}
