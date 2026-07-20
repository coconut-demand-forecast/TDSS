import { useEffect, useState } from 'react';
import { systemSettingsApi, type SystemSettings } from '../api';

const DEFAULT: SystemSettings = { app_display_name: 'TDSS', banner_message: null };

export function useSystemSettings(): SystemSettings {
  const [settings, setSettings] = useState<SystemSettings>(DEFAULT);

  useEffect(() => {
    systemSettingsApi.get().then(setSettings).catch(() => {});
  }, []);

  return settings;
}
