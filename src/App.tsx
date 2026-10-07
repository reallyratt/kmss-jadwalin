import React, { useState } from 'react';
import { Wrench, Settings, ArrowRight, ArrowLeft } from 'lucide-react';
import DatasetFilesView from './components/DatasetFilesView';

type Page = 'menu' | 'dataset' | 'generate';

export default function App() {
  const [currentPage, setCurrentPage] = useState<Page>('menu');

  // Subpage layout with the identical framed top banner, back button, empty content, and footer
  const renderSubPage = (title: string, subtitle: string) => {
    return (
      <div className="min-h-screen w-full bg-[#F6F5F1] text-[#1E1E1E] flex flex-col justify-between items-center p-4 sm:p-8 relative bg-brutalist-grid selection:bg-[#E3EBDD] selection:text-[#1E1E1E]">
        
        {/* Top Header with Back Button and Centered JadwalIN Banner */}
        <header className="w-full max-w-5xl mx-auto flex items-center justify-between gap-4 mb-6 pt-2">
          
          {/* Back Icon Button (Framed like the icons on the menu) */}
          <button
            type="button"
            onClick={() => setCurrentPage('menu')}
            aria-label="Back to menu"
            className="w-10 h-10 sm:w-11 sm:h-11 bg-[#1E1E1E] text-white hover:bg-black transition-colors flex items-center justify-center shrink-0 border border-[#1E1E1E] shadow-[3px_3px_0px_0px_#1E1E1E] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5 sm:w-6 sm:h-6" strokeWidth={2.4} />
          </button>

          {/* JadwalIN Banner */}
          <div className="border-3 border-[#1E1E1E] bg-[#EAE8E0] py-2 px-6 sm:py-2.5 sm:px-10 shadow-[4px_4px_0px_0px_#1E1E1E] flex flex-col items-center">
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-black tracking-tight text-[#1E1E1E] uppercase leading-none">
              JadwalIN
            </h1>
            <span className="text-[10px] sm:text-xs font-bold tracking-widest text-[#666] uppercase mt-0.5 leading-none">
              {subtitle}
            </span>
          </div>

          {/* Balance Spacer to ensure center alignment */}
          <div className="w-10 h-10 sm:w-11 sm:h-11" aria-hidden="true" />
        </header>

        {/* Empty Content for now */}
        <main className="w-full max-w-5xl mx-auto flex-1 flex flex-col items-center justify-center mb-6">
          {/* Content empty as requested */}
        </main>

        {/* Footer */}
        <footer className="w-full text-center py-3 select-none">
          <span className="text-sm sm:text-base font-medium text-[#777] tracking-wider">
            @reallyratt
          </span>
        </footer>

      </div>
    );
  };

  if (currentPage === 'dataset') {
    return <DatasetFilesView onBack={() => setCurrentPage('menu')} />;
  }

  if (currentPage === 'generate') {
    return renderSubPage('GENERATE SCHEDULE', 'GENERATE SCHEDULE');
  }

  // MAIN MENU
  return (
    <div className="min-h-screen w-full bg-[#F6F5F1] text-[#1E1E1E] flex flex-col justify-between items-center p-6 sm:p-10 relative overflow-hidden bg-brutalist-grid selection:bg-[#E3EBDD] selection:text-[#1E1E1E]">
      
      {/* Invisible spacer for vertical balance */}
      <div className="h-4 sm:h-6" aria-hidden="true" />

      {/* Main Center Content */}
      <main className="w-full max-w-lg mx-auto flex flex-col items-center text-center my-auto">
        
        {/* Framed Title and Subtitle */}
        <div className="border-3 border-[#1E1E1E] bg-[#EAE8E0] py-4 px-8 sm:py-5 sm:px-12 shadow-[4px_4px_0px_0px_#1E1E1E] mb-8 sm:mb-10 inline-flex flex-col items-center">
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tight text-[#1E1E1E] uppercase leading-none">
            JadwalIN
          </h1>
          <span className="text-xs sm:text-sm font-bold tracking-widest text-[#666] uppercase mt-1.5 leading-none">
            v0.5 BETA
          </span>
        </div>

        {/* 2 Buttons Stacked Below: Dataset Files & Generate Schedule */}
        <div className="w-full flex flex-col gap-4">
          
          {/* 1. Dataset Files (Wrench icon) */}
          <button
            type="button"
            onClick={() => setCurrentPage('dataset')}
            className="w-full group bg-[#DCE6F2] hover:bg-[#CCDDF0] text-[#1E1E1E] border-3 border-[#1E1E1E] py-3.5 sm:py-4 px-5 sm:px-6 shadow-[5px_5px_0px_0px_#1E1E1E] active:shadow-none active:translate-x-1 active:translate-y-1 transition-all flex items-center justify-between cursor-pointer"
          >
            <div className="flex items-center gap-3.5 sm:gap-4">
              <div className="w-9 h-9 sm:w-10 sm:h-10 bg-[#1E1E1E] text-[#DCE6F2] flex items-center justify-center shrink-0 border border-[#1E1E1E]">
                <Wrench className="w-5 h-5" strokeWidth={2.2} />
              </div>
              <span className="text-lg sm:text-xl font-bold tracking-wide uppercase">
                Dataset Files
              </span>
            </div>
            <ArrowRight className="w-5 h-5 text-[#1E1E1E] transition-transform group-hover:translate-x-1" strokeWidth={2.5} />
          </button>

          {/* 2. Generate Schedule (Settings/Gear icon) */}
          <button
            type="button"
            onClick={() => setCurrentPage('generate')}
            className="w-full group bg-[#EEDCCE] hover:bg-[#E5CFBE] text-[#1E1E1E] border-3 border-[#1E1E1E] py-3.5 sm:py-4 px-5 sm:px-6 shadow-[5px_5px_0px_0px_#1E1E1E] active:shadow-none active:translate-x-1 active:translate-y-1 transition-all flex items-center justify-between cursor-pointer"
          >
            <div className="flex items-center gap-3.5 sm:gap-4">
              <div className="w-9 h-9 sm:w-10 sm:h-10 bg-[#1E1E1E] text-[#EEDCCE] flex items-center justify-center shrink-0 border border-[#1E1E1E]">
                <Settings className="w-5 h-5" strokeWidth={2.2} />
              </div>
              <span className="text-lg sm:text-xl font-bold tracking-wide uppercase">
                Generate Schedule
              </span>
            </div>
            <ArrowRight className="w-5 h-5 text-[#1E1E1E] transition-transform group-hover:translate-x-1" strokeWidth={2.5} />
          </button>

        </div>

      </main>

      {/* Footer on the very bottom */}
      <footer className="w-full text-center py-4 select-none">
        <span className="text-sm sm:text-base font-medium text-[#777] tracking-wider hover:text-[#1E1E1E] transition-colors">
          @reallyratt
        </span>
      </footer>

    </div>
  );
}
