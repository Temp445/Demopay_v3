import React, { useState, useEffect } from 'react';
import { MapPin, Plus, Trash2, Edit2, Loader2, Save, X } from 'lucide-react';
import { useSettingsStore } from '../../../stores/settingsStore';
import MapPickerSwitch from '../location/MapPickerSwitch';
import toast from 'react-hot-toast';
import { supabase } from '../../../lib/supabase';
import { validateAuth } from '../../../stores/utils/storeUtils';

export default function CompanyLocations() {
  const { companySettings, loading, fetchCompanySettings, saveCompanySettings } = useSettingsStore();
  const [locations, setLocations] = useState<any[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState({
    id: '',
    name: '',
    address: '',
    latitude: 0,
    longitude: 0,
    radius: 100,
    description: '',
  });

  // Transient string states for the manual lat/lng inputs so users can type freely
  const [latInput, setLatInput] = useState('');
  const [lngInput, setLngInput] = useState('');

  useEffect(() => {
    fetchCompanySettings();
  }, [fetchCompanySettings]);

  useEffect(() => {
    if (companySettings?.branch_locations) {
      setLocations(companySettings.branch_locations);
    }
  }, [companySettings]);

  // Keep string inputs in sync when formData changes (e.g. map click)
  useEffect(() => {
    setLatInput(formData.latitude !== 0 ? String(formData.latitude) : '');
    setLngInput(formData.longitude !== 0 ? String(formData.longitude) : '');
  }, [formData.latitude, formData.longitude]);

  const handleAddLocation = () => {
    setFormData({
      id: crypto.randomUUID(),
      name: '',
      address: '',
      latitude: 13.0827,
      longitude: 80.2707,
      radius: 100,
      description: '',
    });
    setIsEditing(true);
  };

  const handleEditLocation = (location: any) => {
    setFormData(location);
    setIsEditing(true);
  };

  const handleDeleteLocation = async (id: string) => {
    // If trying to delete the very last location, ensure require_location is not active
    if (locations.length === 1) {
      try {
        const auth = await validateAuth();
        if (!auth?.tenantId) throw new Error('No tenant ID found');

        const { data: config, error } = await supabase
          .from('attendance_validation_config')
          .select('require_location')
          .eq('tenant_id', auth.tenantId)
          .eq('is_active', true)
          .single();

        if (error && error.code !== 'PGRST116') {
          console.error("Error fetching config:", error);
        }

        if (config?.require_location) {
          toast.error("Cannot delete the last branch location while 'Require Location During Clock In/Out' is enabled. Please disable it first in Attendance Settings.");
          return;
        }
      } catch (err) {
        console.error("Failed to check attendance validation config", err);
      }
    }

    if (!confirm('Are you sure you want to delete this location?')) return;

    const updatedLocations = locations.filter(loc => loc.id !== id);

    try {
      setIsSaving(true);
      if (companySettings) {
        await saveCompanySettings({
          ...companySettings,
          branch_locations: updatedLocations,
        });
        setLocations(updatedLocations);
        toast.success('Location deleted successfully');
      }
    } catch (error) {
      toast.error('Failed to delete location');
      console.error(error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveLocation = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      toast.error('Branch name is required');
      return;
    }
    if (!formData.latitude || !formData.longitude) {
      toast.error('Please select a location on the map or enter coordinates manually');
      return;
    }
    if (formData.radius <= 0) {
      toast.error('Radius must be greater than 0');
      return;
    }

    try {
      setIsSaving(true);
      const existingIndex = locations.findIndex(loc => loc.id === formData.id);
      let updatedLocations = [...locations];

      if (existingIndex >= 0) {
        updatedLocations[existingIndex] = formData;
      } else {
        updatedLocations.push(formData);
      }

      if (companySettings) {
        await saveCompanySettings({
          ...companySettings,
          branch_locations: updatedLocations,
        });
        setLocations(updatedLocations);
        setIsEditing(false);
        toast.success('Location saved successfully');
      }
    } catch (error) {
      toast.error('Failed to save location');
      console.error(error);
    } finally {
      setIsSaving(false);
    }
  };

  if (loading && !companySettings) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <Loader2 className="animate-spin h-12 w-12 text-indigo-600 mx-auto" />
          <p className="mt-4 text-sm text-gray-500">Loading branch locations...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 flex items-center">
            <div className="h-8 w-8 bg-indigo-100 rounded-lg flex items-center justify-center mr-3">
              <MapPin className="h-5 w-5 text-indigo-600" />
            </div>
            Branch Locations
          </h2>
          <p className="mt-2 text-sm text-gray-500">
            Manage physical office or branch locations with GPS geofencing.
          </p>
        </div>
        {!isEditing && (
          <button
            onClick={handleAddLocation}
            className="inline-flex w-full sm:w-auto justify-center items-center px-4 py-2 border border-transparent text-sm font-medium rounded-lg shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Location
          </button>
        )}
      </div>

      {isEditing ? (
        <div className="bg-white sm:p-6 lg:p-8 rounded-xl md:border border-gray-200 md:shadow-sm animate-in fade-in slide-in-from-bottom-4 duration-300">
          <div className="flex justify-between items-center mb-6 pb-4 border-b border-gray-100">
            <h3 className="text-lg font-semibold text-gray-900 flex items-center">
              {locations.find(l => l.id === formData.id) ? (
                <><Edit2 className="h-5 w-5 mr-2 text-indigo-500" /> Edit Location</>
              ) : (
                <><MapPin className="h-5 w-5 mr-2 text-indigo-500" /> New Location</>
              )}
            </h3>
            <button
              onClick={() => setIsEditing(false)}
              className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 p-2 rounded-full transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <form onSubmit={handleSaveLocation} className="space-y-4">
            {/* Name & Radius */}
            <div className="grid grid-cols-1 gap-y-6 gap-x-6 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Branch Name</label>
                <input
                  type="text"
                  required
                  className="block w-full px-4 py-2.5 border border-gray-300 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm transition-colors"
                  placeholder="e.g. Headquarters"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Allowed Radius (meters)</label>
                <input
                  type="number"
                  required
                  min="1"
                  className="block w-full px-4 py-2.5 border border-gray-300 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm transition-colors"
                  value={formData.radius}
                  onChange={(e) => setFormData({ ...formData, radius: Number(e.target.value) })}
                />
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description <span className="font-normal text-gray-400">(Optional)</span></label>
              <textarea
                rows={2}
                className="block w-full px-4 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm transition-colors resize-none"
                placeholder="e.g. Main office building in downtown"
                value={formData.description || ''}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              />
            </div>

            {/* Manual Coordinate Inputs */}
            <div className="bg-gray-50 p-4 sm:p-5 rounded-xl border border-gray-100">
              <label className="block text-sm font-semibold text-gray-900 mb-1">
                Coordinates
              </label>
              <p className="text-xs text-gray-500 mb-4">
                Type coordinates directly, or drag the pin on the map below — both methods stay in sync.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    Latitude <span className="font-normal text-gray-400">(-90 to 90)</span>
                  </label>
                  <input
                    type="number"
                    step="any"
                    placeholder="e.g. 13.082700"
                    className="block w-full px-4 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500 font-mono sm:text-sm transition-colors"
                    value={latInput}
                    onChange={(e) => setLatInput(e.target.value)}
                    onBlur={() => {
                      const parsed = parseFloat(latInput);
                      if (!isNaN(parsed) && parsed >= -90 && parsed <= 90) {
                        setFormData(prev => ({ ...prev, latitude: parsed }));
                      } else if (latInput !== '') {
                        toast.error('Latitude must be between -90 and 90');
                        setLatInput(String(formData.latitude));
                      }
                    }}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    Longitude <span className="font-normal text-gray-400">(-180 to 180)</span>
                  </label>
                  <input
                    type="number"
                    step="any"
                    placeholder="e.g. 80.270700"
                    className="block w-full px-4 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500 font-mono sm:text-sm transition-colors"
                    value={lngInput}
                    onChange={(e) => setLngInput(e.target.value)}
                    onBlur={() => {
                      const parsed = parseFloat(lngInput);
                      if (!isNaN(parsed) && parsed >= -180 && parsed <= 180) {
                        setFormData(prev => ({ ...prev, longitude: parsed }));
                      } else if (lngInput !== '') {
                        toast.error('Longitude must be between -180 and 180');
                        setLngInput(String(formData.longitude));
                      }
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Map Picker */}
            <div className="overflow-hidden rounded-xl border border-gray-200 shadow-sm flex flex-col">
              <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                <label className="block text-sm font-semibold text-gray-800">Pin Location on Map</label>
              </div>
              <div className="w-full relative bg-white p-2 sm:p-4">
                <MapPickerSwitch
                  initialLat={formData.latitude || 13.0827}
                  initialLng={formData.longitude || 80.2707}
                  lat={formData.latitude || undefined}
                  lng={formData.longitude || undefined}
                  radius={formData.radius}
                  onLocationSelect={(data) => {
                    setFormData(prev => ({
                      ...prev,
                      latitude: data.latitude,
                      longitude: data.longitude,
                      address: data.formatted_address || '',
                    }));
                  }}
                />
              </div>
            </div>

            <div className="flex flex-col-reverse sm:flex-row justify-end sm:space-x-3 gap-3 sm:gap-0 mt-8 pt-6 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="inline-flex w-full sm:w-auto justify-center items-center py-2.5 px-5 border border-gray-300 shadow-sm text-sm font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="inline-flex w-full sm:w-auto justify-center items-center py-2.5 px-5 border border-transparent shadow-sm text-sm font-medium rounded-lg text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 transition-colors"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Save Location
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {locations.length === 0 ? (
            <div className="col-span-full text-center py-16 bg-white rounded-xl border-2 border-dashed border-gray-300 hover:border-indigo-400 transition-colors">
              <div className="mx-auto h-16 w-16 bg-indigo-50 rounded-full flex items-center justify-center mb-4">
                <MapPin className="h-8 w-8 text-indigo-400" />
              </div>
              <h3 className="text-base font-semibold text-gray-900">No locations added</h3>
              <p className="mt-1 text-sm text-gray-500 max-w-sm mx-auto">Get started by adding a new branch location for geofencing.</p>
              <div className="mt-6">
                <button
                  onClick={handleAddLocation}
                  className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-lg text-white bg-indigo-600 hover:bg-indigo-700 transition-colors"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  New Location
                </button>
              </div>
            </div>
          ) : (
            locations.map((loc) => (
              <div key={loc.id} className="relative bg-white rounded-2xl border border-gray-300 shadow-sm overflow-hidden hover:border-indigo-400 hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] transition-all duration-300 group flex flex-col">
                {/* Background Watermark */}
                <div className="absolute -bottom-8 -right-8 text-indigo-50/50 group-hover:text-indigo-50 transition-colors duration-500 pointer-events-none transform -rotate-12">
                  <MapPin className="w-40 h-40" />
                </div>
                
                <div className="p-6 flex-1 flex flex-col relative z-10">
                  <div className="flex justify-between items-start mb-1">
                    <div className="flex-1 min-w-0 pr-4">
                      <h3 className="text-lg  text-gray-900 truncate tracking-tight">{loc.name}</h3>
                      {loc.description && (
                        <p className="mt-1 text-sm font-medium text-indigo-600 line-clamp-1">{loc.description}</p>
                      )}
                    </div>
                    
                    {/* Action Buttons */}
                    <div className="flex gap-1 bg-white/80 backdrop-blur-sm rounded-lg">
                      <button
                        onClick={() => handleEditLocation(loc)}
                        className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                        title="Edit Location"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteLocation(loc.id)}
                        disabled={isSaving}
                        className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                        title="Delete Location"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 flex items-start gap-3">
                    <div className="mt-0.5 bg-gray-100 border border-gray-300 rounded-full p-2 shrink-0 shadow-sm">
                      <MapPin className="h-4 w-4 text-gray-800" />
                    </div>
                    <p className={`text-sm leading-relaxed ${loc.address ? 'text-gray-900 font-medium' : 'text-gray-500 italic'}`}>
                      {loc.address || 'No specific address saved'}
                    </p>
                  </div>
                </div>

                {/* Footer Metrics */}
                <div className="bg-gray-100/80 border-t border-gray-300 px-6 py-4 relative z-10 backdrop-blur-sm">
                  <div className="grid grid-cols-3 divide-x divide-gray-300">
                    <div className="px-2 first:pl-0 flex flex-col items-center justify-center">
                      <span className="text-[11px] font-bold text-gray-700 uppercase tracking-widest mb-1.5">Latitude</span>
                      <span className="text-xs font-mono font-bold text-black">{(loc.latitude ?? 0).toFixed(5)}</span>
                    </div>
                    <div className="px-2 flex flex-col items-center justify-center">
                      <span className="text-[11px] font-bold text-gray-700 uppercase tracking-widest mb-1.5">Longitude</span>
                      <span className="text-xs font-mono font-bold text-black">{(loc.longitude ?? 0).toFixed(5)}</span>
                    </div>
                    <div className="px-2 last:pr-0 flex flex-col items-center justify-center">
                      <span className="text-[11px] font-bold text-indigo-700 uppercase tracking-widest mb-1.5">Radius</span>
                      <div className="flex items-center text-indigo-900">
                        <span className="text-sm font-bold">{loc.radius}</span>
                        <span className="text-xs font-bold ml-0.5">m</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
