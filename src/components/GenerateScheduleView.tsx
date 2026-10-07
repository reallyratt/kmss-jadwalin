import React from 'react';
import { ArrowLeft } from 'lucide-react';

interface GenerateScheduleViewProps {
  onBack: () => void;
}

export default function GenerateScheduleView({ onBack }: GenerateScheduleViewProps) {
  return (
    <div className="min-h-screen w-full bg-[#F6F5F1] text-[#1E1E1E] flex flex-col items-center p-4 sm:p-8 relative bg-brutalist-grid selection:bg-[#E3EBDD] selection:text-[#1E1E1E]">
      
      {/* Top Navigation Row: Back Button on Left, Balance Spacer on Right */}
      <div className="w-full max-w-5xl mx-auto flex items-center justify-between gap-4 mb-4 pt-1">
        
        {/* Back Icon Button */}
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to menu"
          className="w-10 h-10 sm:w-11 sm:h-11 bg-[#1E1E1E] text-white hover:bg-black transition-colors flex items-center justify-center shrink-0 border border-[#1E1E1E] shadow-[3px_3px_0px_0px_#1E1E1E] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none cursor-pointer"
        >
          <ArrowLeft className="w-5 h-5 sm:w-6 sm:h-6" strokeWidth={2.4} />
        </button>

        {/* Balance Spacer to ensure center alignment */}
        <div className="w-10 h-10 sm:w-11 sm:h-11" aria-hidden="true" />
      </div>

      {/* Frame behind the whole jadwalin generate schedule - exact baseplate matching dataset files */}
      <div className="w-full max-w-5xl mx-auto border-3 sm:border-4 border-[#1E1E1E] bg-[#EAE8E0]/40 p-4 sm:p-7 md:p-8 shadow-[8px_8px_0px_0px_#1E1E1E] flex flex-col items-center gap-6 mb-8 flex-1">
        
        {/* Centered JadwalIN GENERATE SCHEDULE Banner */}
        <div className="border-3 border-[#1E1E1E] bg-[#EAE8E0] py-2.5 px-8 sm:py-3 sm:px-12 shadow-[4px_4px_0px_0px_#1E1E1E] flex flex-col items-center">
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-black tracking-tight text-[#1E1E1E] uppercase leading-none">
            JadwalIN
          </h1>
          <span className="text-[10px] sm:text-xs font-bold tracking-widest text-[#666] uppercase mt-1 leading-none">
            GENERATE SCHEDULE
          </span>
        </div>

        {/* Content area: empty baseplate ready for upcoming generator system */}
        <div className="w-full flex-1 flex flex-col items-center justify-center py-16">
          {/* Baseplate content empty as requested */}
        </div>

      </div>

      {/* Footer link to CayLabs Instagram */}
      <footer className="w-full text-center py-4 select-none mt-auto flex flex-col items-center gap-0.5">
        <a
          href="https://www.instagram.com/reallyratt/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm sm:text-base font-medium text-[#777] hover:text-[#1E1E1E] tracking-wider transition-colors inline-block cursor-pointer"
        >
          CayLabs Production
        </a>
        <span className="text-[11px] sm:text-xs font-mono text-[#999] tracking-widest uppercase">
          v0.5 Beta
        </span>
      </footer>

    </div>
  );
}
