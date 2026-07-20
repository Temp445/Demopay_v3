import React from 'react';
import { Quote } from 'lucide-react';

const testimonials = [
  {
    name: 'Arjun',
    role: 'Operations Head',
    initials: 'A',
    quote: 'The real-time attendance and automated payroll calculations have completely eliminated manual errors. It\'s a game-changer for large-scale operations.',
  },
  {
    name: 'Priya',
    role: 'HR Director',
    initials: 'P',
    quote: 'Employee advance tracking and leave management are now completely transparent. The automated deduction system saves us dozens of hours every month during payroll processing.',
  }
];

const Testimonials = () => {
  return (
    <div id="testimonials" className="relative py-16 w-full bg-slate-50/50 overflow-hidden">
      {/* Subtle Background Decoration */}
      <div className="absolute top-0 left-0 w-full h-full pointer-events-none opacity-40">
        <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-indigo-50 rounded-full blur-[120px] -mr-96 -mt-96"></div>
        <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-blue-50 rounded-full blur-[100px] -ml-48 -mb-48"></div>
      </div>
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-20">
        <div className="lg:grid lg:grid-cols-12 lg:gap-16 items-start">
          
          {/* Sticky Header Column */}
          <div className="lg:col-span-5 mb-16 lg:mb-0 relative">
            <div className="lg:sticky lg:top-32">
              <h2 className="text-sm font-black tracking-[0.2em] uppercase text-indigo-600 mb-4">
                TESTIMONIALS
              </h2>
              <h3 className="text-4xl lg:text-5xl font-black text-slate-900 tracking-tight leading-tight mb-6">
                Trusted by modern enterprises.
              </h3>
              <p className="text-lg text-slate-600 font-medium leading-relaxed max-w-md">
                See how Ace Payroll is transforming HR, attendance, and payroll operations across industries.
              </p>
            </div>
          </div>
          
          {/* Scrolling Testimonials Column */}
          <div className="lg:col-span-7 space-y-8">
            {testimonials.map((testimonial, idx) => (
              <div 
                key={testimonial.name} 
                className="group relative bg-white border border-slate-200 rounded-[2rem] p-8 sm:p-10 shadow-[0_10px_40px_rgba(0,0,0,0.03)] hover:shadow-[0_20px_60px_rgba(0,0,0,0.08)] hover:border-indigo-200 transition-all duration-500 hover:-translate-y-2"
              >
                <div className="absolute top-0 right-0 p-8">
                   <Quote className="h-16 w-16 text-slate-50 transition-colors duration-500 group-hover:text-indigo-50" />
                </div>
                
                <div className="relative z-10">
                  <p className="text-slate-700 text-lg sm:text-xl leading-relaxed mb-10 font-medium italic">
                    "{testimonial.quote}"
                  </p>
                  
                  <div className="flex items-center">
                    <div className="ml-5">
                      <p className="text-slate-900 font-black uppercase tracking-widest text-sm">{testimonial.name}</p>
                      <p className="text-slate-500 font-bold text-[10px] uppercase mt-1.5 tracking-[0.15em]">{testimonial.role}</p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          
        </div>
      </div>
    </div>
  );
};

export default Testimonials;