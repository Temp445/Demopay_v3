import React, { useState } from 'react';
import { Send, Phone, Mail, MapPin, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import emailjs from '@emailjs/browser';
import PhoneInput, { isValidPhoneNumber } from 'react-phone-number-input';
import 'react-phone-number-input/style.css';

const ContactForm = () => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    company: '',
    phone: '',
    location: '',
    message: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (formData.phone && !isValidPhoneNumber(formData.phone)) {
      toast.error('Please enter a valid phone number.');
      return;
    }

    setIsSubmitting(true);

    try {
      // Credentials loaded from .env
      const serviceId = import.meta.env.VITE_EMAILJS_SERVICE_ID;
      const templateId = import.meta.env.VITE_EMAILJS_TEMPLATE_ID;
      const publicKey = import.meta.env.VITE_EMAILJS_PUBLIC_KEY;

      const templateParams = {
        Full_Name: formData.name,
        Company_Name: formData.company,
        Business_Email: formData.email,
        Mobile_Number: formData.phone ? formData.phone.replace('+', '') : '',
        Location: formData.location,
        Message: formData.message,
        Product_Interested: 'Ace Payroll',
        Originate_From: 'Ace Payroll',
      };

      await emailjs.send(serviceId, templateId, templateParams, publicKey);
      toast.success('Request sent successfully! Our team will contact you shortly.');
      setFormData({ name: '', email: '', company: '', phone: '', location: '', message: '' });
    } catch (error) {
      console.error('Error sending email:', error);
      toast.error('Failed to send message. Please try again later.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div id="contact" className="relative py-28 bg-[#0B1120] overflow-hidden border-y border-slate-800">
      {/* Dark Theme Glowing Background Orbs */}
      <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-indigo-600/20 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-violet-600/20 rounded-full blur-[100px] pointer-events-none"></div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-20">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          
          {/* Left Column: Info (Dark Theme Text) */}
          <div className="pr-0 lg:pr-10">
            <h2 className="text-sm font-black tracking-widest uppercase text-indigo-400 mb-4 flex items-center gap-2">
              <span className="w-8 h-[2px] bg-indigo-500 rounded-full"></span> Get in Touch
            </h2>
            <h3 className="text-4xl sm:text-5xl font-black text-white tracking-tight mb-6 leading-[1.15]">
              Let's streamline your <span className="bg-gradient-to-r from-indigo-400 to-violet-400 bg-clip-text text-transparent">workforce management.</span>
            </h3>
            <p className="text-lg text-slate-300 mb-10 leading-relaxed font-medium">
              Have questions about our enterprise features, pricing, or need a custom demonstration? Our product experts are ready to help you orchestrate your payroll perfectly.
            </p>
            
            <div className="space-y-8">
              <div className="flex items-center gap-5 group">
                <div className="h-14 w-14 bg-slate-800/50 border border-slate-700/80 rounded-2xl flex items-center justify-center flex-shrink-0 group-hover:border-indigo-500/50 group-hover:bg-indigo-500/10 transition-colors shadow-lg">
                  <Mail className="h-6 w-6 text-indigo-400" />
                </div>
                <div>
                  <p className="text-sm font-black text-white uppercase tracking-wide">Email Us</p>
                  <p className="text-slate-400 font-medium mt-0.5 group-hover:text-slate-300 transition-colors">sales@acesoft.in</p>
                </div>
              </div>
              <div className="flex items-center gap-5 group">
                <div className="h-14 w-14 bg-slate-800/50 border border-slate-700/80 rounded-2xl flex items-center justify-center flex-shrink-0 group-hover:border-indigo-500/50 group-hover:bg-indigo-500/10 transition-colors shadow-lg">
                  <Phone className="h-6 w-6 text-indigo-400" />
                </div>
                <div>
                  <p className="text-sm font-black text-white uppercase tracking-wide">Call Us</p>
                  <p className="text-slate-400 font-medium mt-0.5 group-hover:text-slate-300 transition-colors">+91 9840137210</p>
                </div>
              </div>
              <div className="flex items-center gap-5 group">
                <div className="h-14 w-14 bg-slate-800/50 border border-slate-700/80 rounded-2xl flex items-center justify-center flex-shrink-0 group-hover:border-indigo-500/50 group-hover:bg-indigo-500/10 transition-colors shadow-lg">
                  <MapPin className="h-6 w-6 text-indigo-400" />
                </div>
                <div>
                  <p className="text-sm font-black text-white uppercase tracking-wide"></p>
                  <p className="text-slate-400 font-medium mt-0.5 group-hover:text-slate-300 transition-colors">#306, 2nd Floor, NSIC-Software Technology Business Park, B-24, Guindy Industrial Estate, Ekkatuthangal, Chennai-600032, India</p>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Form (Light Card Highlighted) */}
          <div className="bg-white rounded-3xl p-8 sm:p-10 border border-indigo-100 shadow-[0_20px_60px_-15px_rgba(79,70,229,0.3)] relative transform transition-all hover:-translate-y-1 hover:shadow-[0_25px_65px_-15px_rgba(79,70,229,0.4)]">
            <div className="absolute -top-6 -right-6 w-24 h-24 bg-gradient-to-br from-indigo-500 to-violet-500 rounded-full blur-2xl block pointer-events-none opacity-50"></div>
            
            <form onSubmit={handleSubmit} className="space-y-6 relative z-10">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-black text-slate-700 uppercase tracking-wide mb-2">Full Name</label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-600/20 focus:border-indigo-600 transition-all font-medium text-[#0F172A] outline-none"
                    placeholder="Enter your name"
                  />
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-700 uppercase tracking-wide mb-2">Business Email</label>
                  <input
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({...formData, email: e.target.value})}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-600/20 focus:border-indigo-600 transition-all font-medium text-[#0F172A] outline-none"
                    placeholder="Enter your email"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-black text-slate-700 uppercase tracking-wide mb-2">Company Name</label>
                  <input
                    type="text"
                    required
                    value={formData.company}
                    onChange={(e) => setFormData({...formData, company: e.target.value})}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-600/20 focus:border-indigo-600 transition-all font-medium text-[#0F172A] outline-none"
                    placeholder="Enter your company name"
                  />
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-700 uppercase tracking-wide mb-2">Phone Number</label>
                  <PhoneInput
                    international
                    defaultCountry="IN"
                    value={formData.phone}
                    onChange={(value) => setFormData({...formData, phone: value || ''})}
                    className="[&>input]:border-none [&>input]:outline-none [&>input]:bg-transparent w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus-within:ring-2 focus-within:ring-indigo-600/20 focus-within:border-indigo-600 transition-all font-medium text-[#0F172A] outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-black text-slate-700 uppercase tracking-wide mb-2">Location</label>
                  <input
                    type="text"
                    value={formData.location}
                    onChange={(e) => setFormData({...formData, location: e.target.value})}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-600/20 focus:border-indigo-600 transition-all font-medium text-[#0F172A] outline-none"
                    placeholder="Enter your location"
                  />
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-700 uppercase tracking-wide mb-2">Product</label>
                  <input
                    type="text"
                    readOnly
                    value="Ace Payroll"
                    className="w-full px-4 py-3 bg-indigo-50 border border-indigo-100 rounded-xl font-black text-indigo-700 outline-none cursor-default select-none shadow-inner"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-black text-slate-700 uppercase tracking-wide mb-2">Message</label>
                <textarea
                  required
                  rows={4}
                  value={formData.message}
                  onChange={(e) => setFormData({...formData, message: e.target.value})}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-600/20 focus:border-indigo-600 transition-all font-medium text-[#0F172A] resize-none outline-none"
                  placeholder="Tell us about your requirements..."
                ></textarea>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className={`w-full text-white font-black py-4 rounded-xl transition-all  flex items-center justify-center gap-2 ${
                  isSubmitting ? 'bg-emerald-500 cursor-not-allowed opacity-80' : 'bg-emerald-600 hover:bg-emerald-700'
                }`}
              >
                {isSubmitting ? (
                  <>
                    Sending... <Loader2 className="h-4 w-4 animate-spin" />
                  </>
                ) : (
                  <>
                    Send Request <Send className="h-4 w-4" />
                  </>
                )}
              </button>
            </form>
          </div>

        </div>
      </div>
    </div>
  );
};

export default ContactForm;
