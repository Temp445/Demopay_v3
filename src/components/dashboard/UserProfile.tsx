import React, { useEffect } from 'react';
import { User } from '@supabase/supabase-js';
import { Mail, User as UserIcon } from 'lucide-react';
import { useUserProfileStore } from '../../stores/userProfileStore';

interface UserProfileProps {
  user: User | null;
}

export default function UserProfile({ user }: UserProfileProps) {
  const { profile, fetchProfile } = useUserProfileStore();

  useEffect(() => {
    if (user) {
      fetchProfile(user.id);
    }
  }, [user, fetchProfile]);

  if (!user || !profile) return null;

  return (
    <div className="bg-white shadow rounded-lg">
      <div className="p-6">
        <h3 className="text-lg leading-6 font-medium text-gray-900">Profile</h3>
        <div className="mt-6">
          <div className="flex items-center space-x-4">
            <div className="flex-shrink-0">
              <span className="inline-flex items-center justify-center h-12 w-12 rounded-full bg-gray-100">
                <UserIcon className="h-6 w-6 text-gray-400" aria-hidden="true" />
              </span>
            </div>
            <div>
              <div className="flex items-center">
                <h4 className="text-lg font-medium text-gray-900">
                  {profile.full_name || user.email?.split('@')[0] || 'User'}
                </h4>
              </div>
              <div className="flex items-center mt-1">
                <Mail className="h-4 w-4 text-gray-400 mr-2" />
                <p className="text-sm text-gray-500">{profile.email}</p>
              </div>
              {profile.department && (
                <div className="flex items-center mt-1">
                  <p className="text-sm text-gray-500">{profile.department} - {profile.position}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}