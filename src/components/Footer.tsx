import React from 'react';
import { Facebook, Youtube, Linkedin, Instagram, Mail, Phone, MapPin } from 'lucide-react';
import AceLogo from "../assets/AceLogo.png";

const Footer = () => {
  return (
    <footer className="bg-[#0F172A] text-slate-300 pt-20 pb-10 border-t border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 lg:gap-8 mb-16">
          
          <div className="flex flex-col">
            <h2 className="text-2xl font-black text-white tracking-widest uppercase mb-6 flex items-center gap-3">
              <img src={AceLogo} alt="Ace Payroll" className="w-12 h-12 object-contain bg-white rounded-full" />
              <span>Ace Payroll</span>
            </h2>
            <p className="text-sm text-slate-400 leading-relaxed mb-8">
              The modern payroll and HR management system built for scalability, compliance, and ease of use.
            </p>
            <div className="flex space-x-5">
              <a href="https://youtube.com/@acesoftwaresolutions?si=KqZ0BFZg5pNmGBqk" target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-white transition-colors">
                <Youtube className="h-5 w-5" />
              </a>
              <a href="https://in.linkedin.com/company/ace-software-solutions-private-limited" target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-white transition-colors">
                <Linkedin className="h-5 w-5" />
              </a>
              <a href="https://www.facebook.com/people/Ace-Software-Solutions-Pvt-Ltd/61565550617223/" target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-white transition-colors">
                <Facebook className="h-5 w-5" />
              </a>
              <a href="https://www.instagram.com/ace_software_solutions/" target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-white transition-colors">
                <Instagram className="h-5 w-5" />
              </a>
            </div>
          </div>

          {/* Quick Links */}
          <div className="flex flex-col">
            <h3 className="text-white font-bold tracking-wider uppercase text-sm mb-6">Product</h3>
            <ul className="space-y-4">
              <li><a href="#features" className="text-sm font-medium text-slate-400 hover:text-indigo-400 transition-colors">Features</a></li>
              <li><a href="#pricing" className="text-sm font-medium text-slate-400 hover:text-indigo-400 transition-colors">Pricing</a></li>
              <li><a href="#testimonials" className="text-sm font-medium text-slate-400 hover:text-indigo-400 transition-colors">Testimonials</a></li>
              <li><a href="#contact" className="text-sm font-medium text-slate-400 hover:text-indigo-400 transition-colors">Book Demo</a></li>
            </ul>
          </div>

          {/* Contact Info */}
          <div className="flex flex-col">
            <h3 className="text-white font-bold tracking-wider uppercase text-sm mb-6">Contact Us</h3>
            <ul className="space-y-4">
              <li className="flex items-start group">
                <MapPin className="h-5 w-5 text-indigo-500 mr-3 flex-shrink-0 group-hover:text-indigo-400 transition-colors" />
                <span className="text-sm font-medium text-slate-400 group-hover:text-slate-300 transition-colors">#306, 2nd Floor, NSIC-Software Technology Business Park, B-24, Guindy Industrial Estate, Ekkatuthangal, Chennai-600032, India</span>
              </li>
              <li className="flex items-center group">
                <Phone className="h-5 w-5 text-indigo-500 mr-3 flex-shrink-0 group-hover:text-indigo-400 transition-colors" />
                <span className="text-sm font-medium text-slate-400 group-hover:text-slate-300 transition-colors">+91 9840137210</span>
              </li>
              <li className="flex items-center group">
                <Mail className="h-5 w-5 text-indigo-500 mr-3 flex-shrink-0 group-hover:text-indigo-400 transition-colors" />
                <span className="text-sm font-medium text-slate-400 group-hover:text-slate-300 transition-colors">sales@acesoft.in</span>
              </li>
            </ul>
          </div>

          {/* Map Location */}
          <div className="w-full h-48 xl:h-56 rounded-md overflow-hidden border border-gray-300">
            <iframe
              src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d7774.626039048191!2d80.20146899191994!3d13.0157278024425!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x3a52669470c1b127%3A0xe3512b101f4ee3ad!2sACE%20Software%20Solutions%20Pvt%20Ltd!5e0!3m2!1sen!2sin!4v1742627952587!5m2!1sen!2sin"
              title="ACE Software Solutions location"
              className="w-full h-full"
              frameBorder="0"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            ></iframe>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="pt-8 border-t border-slate-800/80 flex flex-col md:flex-row justify-center items-center">
          <p className="text-sm font-medium text-slate-500 mb-4 md:mb-0">
            &copy; {new Date().getFullYear()} Ace Software Solutions Pvt. Ltd. All rights reserved.
          </p>
        
        </div>
      </div>
    </footer>
  );
};

export default Footer;
