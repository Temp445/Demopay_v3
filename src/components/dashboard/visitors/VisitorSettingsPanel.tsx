import { useEffect, useState } from 'react';
import { Settings, Save, Bell, CheckSquare, DoorOpen, Gauge } from 'lucide-react';
import { useVisitorStore } from '../../../stores/visitorStore';
import { useTenant } from '../../../contexts/TenantContext';
import toast from 'react-hot-toast';

export default function VisitorSettingsPanel() {
  const { currentTenant } = useTenant();
  const { settings, loading, fetchVisitorSettings, updateVisitorSettings } = useVisitorStore();

  const [localSettings, setLocalSettings] = useState({
    enable_employee_notifications: true,
    require_employee_approval: true,
    require_exit_confirmation: true,
    allow_automatic_entry: false,
    face_match_threshold: 0.60,
  });

  useEffect(() => {
    if (currentTenant) {
      fetchVisitorSettings(currentTenant.id);
    }
  }, [currentTenant, fetchVisitorSettings]);

  useEffect(() => {
    if (settings) {
      setLocalSettings({
        enable_employee_notifications: settings.enable_employee_notifications,
        require_employee_approval: settings.require_employee_approval,
        require_exit_confirmation: settings.require_exit_confirmation,
        allow_automatic_entry: settings.allow_automatic_entry,
        face_match_threshold: settings.face_match_threshold,
      });
    }
  }, [settings]);

  const handleSave = async () => {
    if (!currentTenant) return;

    try {
      await updateVisitorSettings(currentTenant.id, localSettings);
      toast.success('Visitor settings updated successfully');
    } catch (error) {
      toast.error('Failed to update visitor settings');
    }
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <div className="flex items-center gap-2 mb-6">
        <Settings className="h-6 w-6 text-gray-700" />
        <h2 className="text-xl font-bold text-gray-900">Visitor Management Settings</h2>
      </div>

      <div className="space-y-6">
        {/* <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <Bell className="h-5 w-5 text-gray-600" />
              <label className="font-medium text-gray-900">Employee Notifications</label>
            </div>
            <p className="text-sm text-gray-600">
              Send notifications to employees when a visitor requests to meet them
            </p>
          </div>
          <input
            type="checkbox"
            checked={localSettings.enable_employee_notifications}
            onChange={(e) =>
              setLocalSettings({
                ...localSettings,
                enable_employee_notifications: e.target.checked,
              })
            }
            className="h-5 w-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
          />
        </div> */}

        <div className="border-t border-gray-200 pt-6">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <CheckSquare className="h-5 w-5 text-gray-600" />
                <label className="font-medium text-gray-900">Require Employee Approval</label>
              </div>
              <p className="text-sm text-gray-600">
                Visitors must be approved by the employee they're visiting before entry
              </p>
            </div>
            <input
              type="checkbox"
              checked={localSettings.require_employee_approval}
              onChange={(e) =>
                setLocalSettings({
                  ...localSettings,
                  require_employee_approval: e.target.checked,
                })
              }
              className="h-5 w-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="border-t border-gray-200 pt-6">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <DoorOpen className="h-5 w-5 text-gray-600" />
                <label className="font-medium text-gray-900">Require Exit Confirmation</label>
              </div>
              <p className="text-sm text-gray-600">
                Employee must confirm when visitor leaves
              </p>
            </div>
            <input
              type="checkbox"
              checked={localSettings.require_exit_confirmation}
              onChange={(e) =>
                setLocalSettings({
                  ...localSettings,
                  require_exit_confirmation: e.target.checked,
                })
              }
              className="h-5 w-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

          {/* <div className="border-t border-gray-200 pt-6">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <CheckSquare className="h-5 w-5 text-gray-600" />
                  <label className="font-medium text-gray-900">Allow Automatic Entry</label>
                </div>
                <p className="text-sm text-gray-600">
                  Allow visitors to enter automatically without approval (not recommended)
                </p>
              </div>
              <input
                type="checkbox"
                checked={localSettings.allow_automatic_entry}
                onChange={(e) =>
                  setLocalSettings({
                    ...localSettings,
                    allow_automatic_entry: e.target.checked,
                  })
                }
                className="h-5 w-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div> */}

        {/*
        <div className="border-t border-gray-200 pt-6">
          <div className="flex items-center gap-2 mb-3">
            <Gauge className="h-5 w-5 text-gray-600" />
            <label className="font-medium text-gray-900">Face Match Threshold</label>
          </div>
          <p className="text-sm text-gray-600 mb-3">
            Similarity threshold for recognizing returning visitors (0.0 - 1.0)
          </p>
          <input
            type="range"
            min="0.3"
            max="0.9"
            step="0.05"
            value={localSettings.face_match_threshold}
            onChange={(e) =>
              setLocalSettings({
                ...localSettings,
                face_match_threshold: parseFloat(e.target.value),
              })
            }
            className="w-full"
          />
          <div className="flex justify-between text-sm text-gray-600 mt-1">
            <span>Lower (0.3)</span>
            <span className="font-medium text-gray-900">
              {localSettings.face_match_threshold.toFixed(2)}
            </span>
            <span>Higher (0.9)</span>
          </div>
        </div>
        */}

        <div className="border-t border-gray-200 pt-6">
          <button
            onClick={handleSave}
            disabled={loading}
            className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            <Save className="h-4 w-4" />
            Save Settings
          </button>
        </div>
      </div>
    </div>
  );
}
