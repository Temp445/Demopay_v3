import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { Mail, Lock, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { Footer } from '../dashboard/Footer';

export default function ResetPasswordForm() {
  const { resetPassword, updatePassword, isPasswordRecovery } = useAuth();
  const navigate = useNavigate();

  // --- Send reset link state ---
  const [email, setEmail] = useState('');
  const [sendError, setSendError] = useState('');
  const [sendMessage, setSendMessage] = useState('');
  const [sendLoading, setSendLoading] = useState(false);

  // --- Set new password state ---
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [updateError, setUpdateError] = useState('');
  const [updateLoading, setUpdateLoading] = useState(false);

  // ---- Send reset link ----
  const handleSendLink = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSendMessage('');
      setSendError('');
      setSendLoading(true);
      await resetPassword(email);
      setSendMessage('Check your email for password reset instructions');
    } catch (err) {
      setSendError('Failed to send reset instructions. Please try again.');
      console.error(err);
    } finally {
      setSendLoading(false);
    }
  };

  // ---- Set new password ----
  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setUpdateError('Passwords do not match');
      return;
    }
    if (newPassword.length < 6) {
      setUpdateError('Password must be at least 6 characters');
      return;
    }
    try {
      setUpdateError('');
      setUpdateLoading(true);
      await updatePassword(newPassword);
      // redirect to login after successful password update
      navigate('/login', { replace: true });
    } catch (err) {
      setUpdateError('Failed to update password. Please try again.');
      console.error(err);
    } finally {
      setUpdateLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">

      {/* Main Content */}
      <div className="flex-1 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">

        <div className="max-w-md w-full">

          <div className="bg-white shadow-xl rounded-2xl p-8 space-y-6">

            {/* Header */}
            <div className="text-center flex flex-col items-center">

              {/* Logo */}
              <img
                src="/assets/ASSPL_Logo.jpg"
                alt="Payroll System"
                className="h-12 md:h-14 lg:h-20 w-auto object-contain"
              />

              {/* App name */}
              <h1 className="mt-3 text-2xl font-bold text-indigo-600">
                Ace Payroll
              </h1>

              <p className="mt-2 text-sm text-gray-500">
                Smart Payroll &amp; Employee Management
              </p>

              <h2 className="mt-5 text-xl font-semibold text-gray-900">
                {isPasswordRecovery ? 'Set New Password' : 'Reset your password'}
              </h2>

            </div>

            {/* ───── SET NEW PASSWORD form (user arrived via email link) ───── */}
            {isPasswordRecovery ? (
              <form className="space-y-6" onSubmit={handleUpdatePassword}>

                {updateError && (
                  <div className="rounded-md bg-red-50 p-4">
                    <div className="flex">
                      <AlertCircle className="h-5 w-5 text-red-400" />
                      <div className="ml-3">
                        <h3 className="text-sm font-medium text-red-800">{updateError}</h3>
                      </div>
                    </div>
                  </div>
                )}

                {/* New Password */}
                <div>
                  <label htmlFor="new-password" className="block text-sm font-medium text-gray-700 mb-1">
                    New Password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                    <input
                      id="new-password"
                      name="new-password"
                      type={showNewPassword ? 'text' : 'password'}
                      required
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="New password"
                      className="w-full pl-10 pr-10 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword((v) => !v)}
                      className="absolute right-3 top-3 text-gray-400 hover:text-gray-600"
                      tabIndex={-1}
                    >
                      {showNewPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                </div>

                {/* Confirm Password */}
                <div>
                  <label htmlFor="confirm-password" className="block text-sm font-medium text-gray-700 mb-1">
                    Confirm New Password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                    <input
                      id="confirm-password"
                      name="confirm-password"
                      type={showConfirmPassword ? 'text' : 'password'}
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Confirm new password"
                      className="w-full pl-10 pr-10 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword((v) => !v)}
                      className="absolute right-3 top-3 text-gray-400 hover:text-gray-600"
                      tabIndex={-1}
                    >
                      {showConfirmPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={updateLoading}
                  className="w-full py-2 px-4 rounded-lg text-white font-medium bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
                >
                  {updateLoading ? 'Updating...' : 'Set New Password'}
                </button>

              </form>
            ) : (
              /* ───── SEND RESET LINK form ───── */
              <form className="space-y-6" onSubmit={handleSendLink}>

                {sendError && (
                  <div className="rounded-md bg-red-50 p-4">
                    <div className="flex">
                      <AlertCircle className="h-5 w-5 text-red-400" />
                      <div className="ml-3">
                        <h3 className="text-sm font-medium text-red-800">{sendError}</h3>
                      </div>
                    </div>
                  </div>
                )}

                {sendMessage && (
                  <div className="rounded-md bg-green-50 p-4">
                    <h3 className="text-sm font-medium text-green-800">{sendMessage}</h3>
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
                      placeholder="Email address"
                      className="w-full pl-10 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    />
                  </div>
                </div>

                {/* Button */}
                <button
                  type="submit"
                  disabled={sendLoading}
                  className="w-full py-2 px-4 rounded-lg text-white font-medium bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
                >
                  {sendLoading ? 'Sending...' : 'Send Reset Instructions'}
                </button>

                {/* Back to login */}
                <div className="text-center">
                  <a
                    href="/login"
                    className="font-medium text-indigo-600 hover:text-indigo-500"
                  >
                    Back to login
                  </a>
                </div>

              </form>
            )}

          </div>
        </div>

      </div>

      {/* Footer - Always Bottom */}
      <Footer />

    </div>
  );
}