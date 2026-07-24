import { useState } from 'react';
import { Map, MapPin, Building2, ChevronRight } from 'lucide-react';
import TravelAllowanceTab from './TravelAllowanceTab';
import OutsideOfficeTab from './OutsideOfficeTab';

export default function TravelApprovalsPage() {
  const [activeTab, setActiveTab] = useState<'travel' | 'outside'>('travel');

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Map className="h-6 w-6 text-blue-600" />
          Travel Allowance Management
        </h1>
        <p className="text-sm text-gray-600 mt-1">
          Manage travel allowance calculations and outside office requests
        </p>
      </div>

      {/* Modern Tab Navigation */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="flex border-b border-gray-200">
          <button
            onClick={() => setActiveTab('travel')}
            className={`flex-1 py-4 px-6 text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
              activeTab === 'travel'
                ? 'bg-blue-50 text-blue-700 border-b-2 border-blue-600'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}
          >
            <MapPin className={`h-4 w-4 ${activeTab === 'travel' ? 'text-blue-600' : 'text-gray-400'}`} />
            Work Location
          </button>
          
          <button
            onClick={() => setActiveTab('outside')}
            className={`flex-1 py-4 px-6 text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
              activeTab === 'outside'
                ? 'bg-blue-50 text-blue-700 border-b-2 border-blue-600'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}
          >
            <Building2 className={`h-4 w-4 ${activeTab === 'outside' ? 'text-blue-600' : 'text-gray-400'}`} />
            Remote Check-In 
          </button>
        </div>

        {/* Tab Content */}
        <div className="p-6 bg-gray-50/50">
          {activeTab === 'travel' ? (
            <TravelAllowanceTab />
          ) : (
            <OutsideOfficeTab />
          )}
        </div>
      </div>
    </div>
  );
}
