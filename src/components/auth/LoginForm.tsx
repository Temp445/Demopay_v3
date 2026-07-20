import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { Mail, Lock, AlertCircle } from 'lucide-react';
import { Footer } from '../dashboard/Footer';
import { supabase } from '../../lib/supabase';

export default function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [localError, setLocalError] = useState('');
  const navigate = useNavigate();
  const location = useLocation();
  const { signIn, error, clearError } = useAuth();

  useEffect(() => {
    // Clear any existing errors when component mounts or unmounts
    return () => clearError();
  }, [clearError]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError('');
    try {
      setLoading(true);
      await signIn(email, password);
      
      const { data: { session } } = await supabase.auth.getSession();
      let redirectPath = location.state?.from;

      if (session?.user) {
        const { data } = await supabase
          .from('tenant_users')
          .select('role')
          .eq('user_id', session.user.id)
          .limit(1)
          .maybeSingle();

        if (data?.role === 'manager') {
          // If they are a manager, default to global-tenant-management
          redirectPath = redirectPath === '/' || redirectPath === '/dashboard' || !redirectPath 
            ? '/dashboard/global-tenant-management' 
            : redirectPath;
        } else {
          // Default to regular dashboard for others
          redirectPath = redirectPath || '/dashboard';
        }
      } else {
        redirectPath = redirectPath || '/dashboard';
      }

      navigate(redirectPath, { replace: true });
    } catch (err: any) {
      setLoading(false);
      setLocalError(err?.message || 'Invalid email or password. Please try again.');
    }
  };

  const displayError = localError || error;

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">

      {/* Main Content (centered) */}
      <div className="flex-1 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">

        <div className="max-w-md w-full">
          <div className="bg-white shadow-xl rounded-2xl p-8 space-y-6">

            {/* Header */}
            <div className="text-center">
              <div className="flex justify-center">
                <img
                  src="/assets/ASSPL_Logo.jpg"
                  alt="Payroll System"
                  className="h-12 md:h-14 lg:h-20 w-auto object-contain"
                />
              </div>

              <h1 className="mt-4 text-3xl font-bold text-indigo-600">
                Ace Payroll
              </h1>

              <p className="mt-2 text-sm text-gray-500">
                Smart Payroll & Employee Management
              </p>

              <h2 className="mt-5 text-xl font-semibold text-gray-900">
                Sign in to your account
              </h2>
            </div>

            <form className="space-y-6" onSubmit={handleSubmit}>

              {displayError && (
                <div className="rounded-md bg-red-50 p-4">
                  <div className="flex">
                    <AlertCircle className="h-5 w-5 text-red-400" />
                    <div className="ml-3">
                      <h3 className="text-sm font-medium text-red-800">{displayError}</h3>
                    </div>
                  </div>
                </div>
              )}

              {/* Email */}
              <div>
                <label htmlFor="email-address" className="sr-only">
                  Email address
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                  <input
                    id="email-address"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-10 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    placeholder="Email address"
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <label htmlFor="password" className="sr-only">
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                  <input
                    id="password"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-10 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    placeholder="Password"
                  />
                </div>
              </div>

              {/* Links */}
              <div className="flex items-center justify-between text-sm">
                <a href="/register" className="font-medium text-indigo-600 hover:text-indigo-500">
                  Don't have an account?
                </a>

                <a href="/reset-password" className="font-medium text-indigo-600 hover:text-indigo-500">
                  Forgot your password?
                </a>
              </div>

              {/* Button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2 px-4 rounded-lg text-white font-medium bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
              >
                {loading ? 'Signing in...' : 'Sign in'}
              </button>

            </form>

          </div>
        </div>

      </div>

      {/* Footer (always bottom) */}
      <Footer />

    </div>
  );
}