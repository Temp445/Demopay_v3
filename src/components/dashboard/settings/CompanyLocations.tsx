import React, { useState, useEffect } from 'react';
import { MapPin, Plus, Trash2, Edit2, Loader2, Save, X } from 'lucide-react';
import { useSettingsStore } from '../../../stores/settingsStore';
import LocationMapPicker from '../location/LocationMapPicker';
import toast from 'react-hot-toast';

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
    });
    setIsEditing(true);
  };

  const handleEditLocation = (location: any) => {
    setFormData(location);
    setIsEditing(true);
  };

  const handleDeleteLocation = async (id: string) => {
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
      toast.error('Location name is required');
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
    <div className="space-y-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-lg font-medium text-gray-900 flex items-center">
            <MapPin className="h-5 w-5 mr-2 text-indigo-500" />
            Branch Locations
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Manage physical office or branch locations with GPS geofencing.
          </p>
        </div>
        {!isEditing && (
          <button
            onClick={handleAddLocation}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Location
          </button>
        )}
      </div>

      {isEditing ? (
        <div className="bg-gray-50 p-6 rounded-lg border border-gray-200">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-medium text-gray-900">
              {locations.find(l => l.id === formData.id) ? 'Edit Location' : 'New Location'}
            </h3>
            <button
              onClick={() => setIsEditing(false)}
              className="text-gray-400 hover:text-gray-500"
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          <form onSubmit={handleSaveLocation} className="space-y-6">
            {/* Name & Radius */}
            <div className="grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-2">
              <div className="sm:col-span-1">
                <label className="block text-sm font-medium text-gray-700">Location Name</label>
                <input
                  type="text"
                  required
                  className="mt-1 shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md"
                  placeholder="e.g. Headquarters"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>

              <div className="sm:col-span-1">
                <label className="block text-sm font-medium text-gray-700">Allowed Radius (meters)</label>
                <input
                  type="number"
                  required
                  min="1"
                  className="mt-1 shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md"
                  value={formData.radius}
                  onChange={(e) => setFormData({ ...formData, radius: Number(e.target.value) })}
                />
              </div>
            </div>

            {/* Manual Coordinate Inputs */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Coordinates
              </label>
              <p className="text-xs text-gray-500 mb-3">
                Type coordinates directly, or drag the pin on the map below — both methods stay in sync.
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    Latitude <span className="font-normal text-gray-400">(-90 to 90)</span>
                  </label>
                  <input
                    type="number"
                    step="any"
                    placeholder="e.g. 13.082700"
                    className="block w-full sm:text-sm border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 font-mono"
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
                    className="block w-full sm:text-sm border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 font-mono"
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
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Pin Location on Map</label>
              <LocationMapPicker
                initialLat={formData.latitude || 13.0827}
                initialLng={formData.longitude || 80.2707}
                lat={formData.latitude || undefined}
                lng={formData.longitude || undefined}
                onLocationSelect={(data) => {
                  setFormData(prev => ({
                    ...prev,
                    latitude: data.latitude,
                    longitude: data.longitude,
                    address: data.formatted_address || '',
                  }));
                }}
                height="560px"
              />
            </div>

            <div className="flex justify-end space-x-3">
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="inline-flex justify-center py-2 px-4 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
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
            <div className="col-span-full text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
              <MapPin className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900">No locations</h3>
              <p className="mt-1 text-sm text-gray-500">Get started by adding a new branch location.</p>
              <div className="mt-6">
                <button
                  onClick={handleAddLocation}
                  className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  New Location
                </button>
              </div>
            </div>
          ) : (
            locations.map((loc) => (
              <div key={loc.id} className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition-shadow">
                <div className="p-5">
                  <div className="flex justify-between items-start">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-lg font-medium text-gray-900 truncate">{loc.name}</h3>
                      {loc.address && (
                        <p className="mt-1 text-sm text-gray-500 line-clamp-2" title={loc.address}>
                          {loc.address}
                        </p>
                      )}
                    </div>
                    <div className="ml-4 flex-shrink-0 flex space-x-2">
                      <button
                        onClick={() => handleEditLocation(loc)}
                        className="p-1 text-gray-400 hover:text-indigo-600 transition-colors"
                        title="Edit Location"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteLocation(loc.id)}
                        disabled={isSaving}
                        className="p-1 text-gray-400 hover:text-red-600 transition-colors disabled:opacity-50"
                        title="Delete Location"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-wider">Coordinates</p>
                      <p className="mt-1 text-sm font-medium text-gray-900 font-mono">
                        {(loc.latitude ?? 0).toFixed(6)}, {(loc.longitude ?? 0).toFixed(6)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-wider">Radius</p>
                      <p className="mt-1 text-sm font-medium text-gray-900">
                        {loc.radius} meters
                      </p>
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
