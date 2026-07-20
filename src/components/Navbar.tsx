import React from 'react';
import { Menu, X, DollarSign } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import AceLogo from '../assets/AceLogo.png';

const Navbar = () => {
  const [isOpen, setIsOpen] = React.useState(false);
  const navigate = useNavigate();
  const { user } = useAuth();

  const handleGetStarted = async () => {
    // Direct to login first, with return URL to dashboard
    if (!user) {
      navigate('/login', { state: { from: '/dashboard' } });
    } else {
      const { data } = await supabase
        .from('tenant_users')
        .select('role')
        .eq('user_id', user.id)
        .limit(1)
        .maybeSingle();

      if (data?.role === 'manager') {
        navigate('/dashboard/global-tenant-management');
      } else {
        navigate('/dashboard');
      }
    }
  };

  return (
    <nav className="bg-white border-b border-gray-100 fixed w-full z-50 transition-all duration-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16 items-center">
          <div className="flex items-center">
            <div 
              className="flex-shrink-0 flex items-center cursor-pointer group"
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            >
              <div className="flex items-center justify-center h-10 w-10">
               
                <img
                  src={AceLogo}
                  alt="ACE PAYROLL Logo"
                  className="h-11 w-11 bg-white rounded-full pl-0.5 object-contain"
                />
              </div>
              <span className="text-2xl font-semibold text-[#1F2A44] tracking-tight uppercase">
                Ace Payroll
              </span>
            </div>
          </div>
          
          <div className="hidden md:flex items-center space-x-10">
            <a href="#features" className="text-[15px] font-bold text-[#1F2A44] hover:text-indigo-600 transition-colors">Features</a>
            <a href="#pricing" className="text-[15px] font-bold text-[#1F2A44] hover:text-indigo-600 transition-colors">Pricing</a>
            <a href="#contact" className="text-[15px] font-bold text-[#1F2A44] hover:text-indigo-600 transition-colors">Contact Us</a>
            
            <div className="flex items-center space-x-6 pl-6 border-l border-gray-200">
              <a
              href="/login"
                className="inline-flex items-center justify-center px-6 py-2.5 text-[15px] font-bold text-white bg-indigo-600 rounded shadow-[0_4px_14px_0_rgba(79,70,229,0.3)] hover:bg-indigo-700 transition-all"
              >
                Login
              </a>
            </div>
          </div>

          <div className="md:hidden flex items-center">
            <button
              onClick={() => setIsOpen(!isOpen)}
              className="p-2 rounded-md text-gray-600 hover:text-indigo-600 focus:outline-none transition-colors"
            >
              {isOpen ? <X className="h-7 w-7" /> : <Menu className="h-7 w-7" />}
            </button>
          </div>
        </div>
      </div>

      {isOpen && (
        <div className="md:hidden bg-white border-t border-gray-100 shadow-xl">
          <div className="px-4 pt-4 pb-6 space-y-3 sm:px-6">
            <a href="#features" className="block px-3 py-2 text-base font-bold text-[#1F2A44] hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors">Platform</a>
            <a href="#integrations" className="block px-3 py-2 text-base font-bold text-[#1F2A44] hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors">Integrations</a>
            <a href="#pricing" className="block px-3 py-2 text-base font-bold text-[#1F2A44] hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors">Pricing</a>
            <a href="#testimonials" className="block px-3 py-2 text-base font-bold text-[#1F2A44] hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors">Customers</a>
            <div className="pt-4 mt-2 border-t border-gray-100 space-y-3">
              <a href="/login" className="block w-full text-center px-4 py-3 text-[#1F2A44] font-bold">Login</a>
              <button
                onClick={handleGetStarted}
                className="w-full text-center px-4 py-3 bg-indigo-600 text-white font-bold rounded shadow-lg hover:bg-indigo-700 transition-colors"
              >
                Sign Up Now
              </button>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
};

export default Navbar;