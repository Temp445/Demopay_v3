import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { Mail, Lock, AlertCircle, Building2, User, Phone } from 'lucide-react';
import { Footer } from '../dashboard/Footer';

export default function RegisterForm() {
  const [organizationName, setOrganizationName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [mobile, setMobile] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { signUp, error, clearError } = useAuth();
  const [localError, setLocalError] = useState('');

  useEffect(() => {
    // Clear any existing errors when component mounts or unmounts
    return () => clearError();
  }, [clearError]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setLocalError('');

    if (password !== confirmPassword) {
      setLocalError('Passwords do not match');
      return;
    }

    try {
      setLoading(true);

      await signUp(email, password, organizationName, fullName, mobile);

      // If user came from pricing page, redirect to billing to auto-open checkout
      const state = location.state as any;
      if (state?.selectedPlan) {
        navigate('/dashboard/billing', { state });
      } else {
        navigate('/dashboard');
      }

    } catch (err: any) {
      setLocalError(err?.message || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const displayError = localError || error;

  return (
    <div className="min-h-screen flex flex-col bg-gray-100">

      {/* Main Content */}
      <div className="flex-1 flex items-center justify-center px-4">

        <div className="bg-white rounded-xl shadow-md p-8 w-full max-w-md">

          {/* Header */}
          <div className="text-center mb-6 flex flex-col items-center">

            <img
              src="/assets/ASSPL_Logo.jpg"
              alt="Payroll System"
              className="h-12 md:h-14 lg:h-20 w-auto object-contain"
            />

            <h1 className="mt-3 text-2xl font-bold text-indigo-600">
              Ace Payroll
            </h1>

            <p className="mt-1 text-sm text-gray-500">
              Smart Payroll & Employee Management
            </p>

            <h2 className="mt-4 text-xl font-semibold text-gray-900">
              Create Account
            </h2>

          </div>


          <form className="mt-6 space-y-4" onSubmit={handleSubmit}>

            {/* Existing Error Message */}
            {displayError && (
              <div className="rounded-md bg-red-50 p-3">
                <div className="flex">
                  <AlertCircle className="h-5 w-5 text-red-400" />
                  <p className="ml-2 text-sm text-red-800">{displayError}</p>
                </div>
              </div>
            )}

            {/* Password Mismatch */}
            {password !== confirmPassword && (
              <div className="rounded-md bg-red-50 p-3">
                <div className="flex">
                  <AlertCircle className="h-5 w-5 text-red-400" />
                  <p className="ml-2 text-sm text-red-800">
                    Passwords do not match
                  </p>
                </div>
              </div>
            )}

            {/* Email */}
            <div>
              <label className="block text-sm font-medium mb-1">Email *</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 h-5 w-5" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full pl-10 pr-3 py-2 border rounded-md bg-gray-50 focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-medium mb-1">
                Password *
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 h-5 w-5" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Choose a strong password"
                  minLength={6}
                  className="w-full pl-10 pr-3 py-2 border rounded-md bg-gray-50 focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
            </div>

            {/* Confirm Password */}
            <div>
              <label className="block text-sm font-medium mb-1">
                Confirm Password *
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 h-5 w-5" />
                <input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm Password"
                  minLength={6}
                  className="w-full pl-10 pr-3 py-2 border rounded-md bg-gray-50 focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
            </div>

            {/* Full Name */}
            <div>
              <label className="block text-sm font-medium mb-1">
                Full Name *
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 h-5 w-5" />
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Enter your Full name"
                  className="w-full pl-10 pr-3 py-2 border rounded-md bg-gray-50 focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
            </div>

            {/* Organization Name */}
            <div>
              <label className="block text-sm font-medium mb-1">
                Organization Name *
              </label>
              <div className="relative">
                <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 h-5 w-5" />
                <input
                  type="text"
                  required
                  value={organizationName}
                  onChange={(e) => setOrganizationName(e.target.value)}
                  placeholder="Enter your Organization name"
                  className="w-full pl-10 pr-3 py-2 border rounded-md bg-gray-50 focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
            </div>

            {/* Mobile */}
            <div>
              <label className="block text-sm font-medium mb-1">
                Mobile No.
              </label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 h-5 w-5" />
                <input
                  type="tel"
                  value={mobile}
                  onChange={(e) => setMobile(e.target.value)}
                  placeholder="Enter your Mobile Number"
                  className="w-full pl-10 pr-3 py-2 border rounded-md bg-gray-50 focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={
                loading ||
                password !== confirmPassword
              }
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded-md font-medium disabled:opacity-50"
            >
              {loading ? "Creating account..." : "Sign Up"}
            </button>

            <div className="text-center mt-4">
              <span className="text-sm text-gray-600">
                Already have an account?{" "}
              </span>
              <Link
                to="/login"
                className="text-indigo-600 hover:text-indigo-700 font-medium"
              >
                Sign In
              </Link>
            </div>

          </form>
        </div>

      </div>

      {/* Footer - Always Bottom */}
      <Footer />

    </div>
  );
  //   <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
  //     <div className="max-w-md w-full space-y-8">
  //       <div>
  //         <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
  //           Create your account
  //         </h2>
  //       </div>

  //       <div className="rounded-md bg-yellow-50 border border-yellow-200 p-4">
  //         <div className="flex">
  //           <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5" />
  //           <div className="ml-3">
  //             <p className="text-sm text-yellow-800">
  //               By creating an account, a new organization workspace will be
  //               created and you will be assigned as the administrator.
  //             </p>
  //           </div>
  //         </div>
  //       </div>

  //       <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
  //         {error && (
  //           <div className="rounded-md bg-red-50 p-4">
  //             <div className="flex">
  //               <AlertCircle className="h-5 w-5 text-red-400" />
  //               <div className="ml-3">
  //                 <h3 className="text-sm font-medium text-red-800">{error}</h3>
  //               </div>
  //             </div>
  //           </div>
  //         )}
  //         {password !== confirmPassword && (
  //           <div className="rounded-md bg-red-50 p-4">
  //             <div className="flex">
  //               <AlertCircle className="h-5 w-5 text-red-400" />
  //               <div className="ml-3">
  //                 <h3 className="text-sm font-medium text-red-800">Passwords do not match</h3>
  //               </div>
  //             </div>
  //           </div>
  //         )}
  //         <div className="rounded-md shadow-sm -space-y-px">
  //           <div>
  //             <label htmlFor="organization-name" className="sr-only">
  //               Organization Name
  //             </label>
  //             <div className="relative">
  //               <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
  //                 <AlertCircle className="h-5 w-5 text-gray-400" />
  //               </div>
  //               <input
  //                 id="organization-name"
  //                 name="organization"
  //                 type="text"
  //                 required
  //                 value={organizationName}
  //                 onChange={(e) => setOrganizationName(e.target.value)}
  //                 className="appearance-none rounded-none relative block w-full px-3 py-2 pl-10 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-t-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
  //                 placeholder="Organization Name"
  //               />
  //             </div>
  //           </div>

  //           <div>
  //             <label htmlFor="email-address" className="sr-only">
  //               Email address
  //             </label>
  //             <div className="relative">
  //               <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
  //                 <Mail className="h-5 w-5 text-gray-400" />
  //               </div>
  //               <input
  //                 id="email-address"
  //                 name="email"
  //                 type="email"
  //                 autoComplete="email"
  //                 required
  //                 value={email}
  //                 onChange={(e) => setEmail(e.target.value)}
  //                 className="appearance-none rounded-none relative block w-full px-3 py-2 pl-10 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-t-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
  //                 placeholder="Email address"
  //               />
  //             </div>
  //           </div>
  //           <div>
  //             <label htmlFor="password" className="sr-only">
  //               Password
  //             </label>
  //             <div className="relative">
  //               <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
  //                 <Lock className="h-5 w-5 text-gray-400" />
  //               </div>
  //               <input
  //                 id="password"
  //                 name="password"
  //                 type="password"
  //                 autoComplete="new-password"
  //                 required
  //                 value={password}
  //                 onChange={(e) => setPassword(e.target.value)}
  //                 className="appearance-none rounded-none relative block w-full px-3 py-2 pl-10 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
  //                 placeholder="Password"
  //                 minLength={6}
  //               />
  //             </div>
  //           </div>
  //           <div>
  //             <label htmlFor="confirm-password" className="sr-only">
  //               Confirm Password
  //             </label>
  //             <div className="relative">
  //               <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
  //                 <Lock className="h-5 w-5 text-gray-400" />
  //               </div>
  //               <input
  //                 id="confirm-password"
  //                 name="confirm-password"
  //                 type="password"
  //                 autoComplete="new-password"
  //                 required
  //                 value={confirmPassword}
  //                 onChange={(e) => setConfirmPassword(e.target.value)}
  //                 className="appearance-none rounded-none relative block w-full px-3 py-2 pl-10 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-b-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
  //                 placeholder="Confirm Password"
  //                 minLength={6}
  //               />
  //             </div>
  //           </div>
  //         </div>

  //         <div className="flex items-center justify-between">
  //           <div className="text-sm">
  //             <a href="/login" className="font-medium text-indigo-600 hover:text-indigo-500">
  //               Already have an account?
  //             </a>
  //           </div>
  //         </div>

  //         <div>
  //           <button
  //             type="submit"
  //             disabled={loading || password !== confirmPassword}
  //             className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
  //           >
  //             {loading ? 'Creating account...' : 'Create account'}
  //           </button>
  //         </div>
  //       </form>
  //     </div>
  //   </div>
  // );
}