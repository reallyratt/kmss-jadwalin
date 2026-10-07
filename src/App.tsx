import React from 'react';
import { FileText, Wrench, Settings, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import DatasetFilesView from './components/DatasetFilesView';
import GenerateScheduleView from './components/GenerateScheduleView';

type Page = 'menu' | 'dataset' | 'generate';

export default function App() {
  const [currentPage, setCurrentPage] = React.useState<Page>('menu');

  // Basic smooth fade in & fade out animation for fast, lag-free transitions
  const pageVariants = {
    initial: {
      opacity: 0,
    },
    animate: {
      opacity: 1,
      transition: {
        duration: 0.22,
        ease: 'easeInOut' as const,
      },
    },
    exit: {
      opacity: 0,
      transition: {
        duration: 0.18,
        ease: 'easeInOut' as const,
      },
    },
  };

  return (
    <div className="min-h-screen w-full bg-[#F6F5F1] text-[#1E1E1E] relative overflow-x-hidden bg-brutalist-grid selection:bg-[#E3EBDD] selection:text-[#1E1E1E]">
      <AnimatePresence mode="wait">
        
        {/* MAIN MENU */}
        {currentPage === 'menu' && (
          <motion.div
            key="menu"
            variants={pageVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className="min-h-screen w-full flex flex-col justify-between items-center p-4 sm:p-8"
          >
            {/* Top Bar with Settings Gear Button on the top right */}
            <div className="w-full max-w-5xl mx-auto flex items-center justify-end pt-1 mb-4">
              <button
                type="button"
                onClick={() => {}}
                aria-label="Settings"
                title="Settings"
                className="w-10 h-10 sm:w-11 sm:h-11 bg-[#1E1E1E] text-white hover:bg-black transition-colors flex items-center justify-center shrink-0 border border-[#1E1E1E] shadow-[3px_3px_0px_0px_#1E1E1E] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none cursor-pointer"
              >
                <Settings className="w-5 h-5 sm:w-6 sm:h-6" strokeWidth={2.2} />
              </button>
            </div>

            {/* Main Center Content */}
            <main className="w-full max-w-lg mx-auto flex flex-col items-center text-center my-auto">
              
              {/* Framed Title and Subtitle */}
              <div className="border-3 border-[#1E1E1E] bg-[#EAE8E0] py-4 px-8 sm:py-5 sm:px-12 shadow-[4px_4px_0px_0px_#1E1E1E] mb-8 sm:mb-10 inline-flex flex-col items-center">
                <h1 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tight text-[#1E1E1E] uppercase leading-none">
                  JadwalIN
                </h1>
                <span className="text-xs sm:text-sm font-bold tracking-widest text-[#666] uppercase mt-1.5 leading-none">
                  Automated Scheduler
                </span>
              </div>

              {/* 2 Buttons Stacked Below: Dataset Files & Generate Schedule */}
              <div className="w-full flex flex-col gap-4">
                
                {/* 1. Dataset Files (Document icon) */}
                <button
                  type="button"
                  onClick={() => setCurrentPage('dataset')}
                  className="w-full group bg-[#DCE6F2] hover:bg-[#CCDDF0] text-[#1E1E1E] border-3 border-[#1E1E1E] py-3.5 sm:py-4 px-5 sm:px-6 shadow-[5px_5px_0px_0px_#1E1E1E] active:shadow-none active:translate-x-1 active:translate-y-1 transition-all flex items-center justify-between cursor-pointer"
                >
                  <div className="flex items-center gap-3.5 sm:gap-4">
                    <div className="w-9 h-9 sm:w-10 sm:h-10 bg-[#1E1E1E] text-[#DCE6F2] flex items-center justify-center shrink-0 border border-[#1E1E1E]">
                      <FileText className="w-5 h-5" strokeWidth={2.2} />
                    </div>
                    <span className="text-lg sm:text-xl font-bold tracking-wide uppercase">
                      Dataset Files
                    </span>
                  </div>
                  <ArrowRight className="w-5 h-5 text-[#1E1E1E] transition-transform group-hover:translate-x-1" strokeWidth={2.5} />
                </button>

                {/* 2. Generate Schedule (Wrench icon) */}
                <button
                  type="button"
                  onClick={() => setCurrentPage('generate')}
                  className="w-full group bg-[#EEDCCE] hover:bg-[#E5CFBE] text-[#1E1E1E] border-3 border-[#1E1E1E] py-3.5 sm:py-4 px-5 sm:px-6 shadow-[5px_5px_0px_0px_#1E1E1E] active:shadow-none active:translate-x-1 active:translate-y-1 transition-all flex items-center justify-between cursor-pointer"
                >
                  <div className="flex items-center gap-3.5 sm:gap-4">
                    <div className="w-9 h-9 sm:w-10 sm:h-10 bg-[#1E1E1E] text-[#EEDCCE] flex items-center justify-center shrink-0 border border-[#1E1E1E]">
                      <Wrench className="w-5 h-5" strokeWidth={2.2} />
                    </div>
                    <span className="text-lg sm:text-xl font-bold tracking-wide uppercase">
                      Generate Schedule
                    </span>
                  </div>
                  <ArrowRight className="w-5 h-5 text-[#1E1E1E] transition-transform group-hover:translate-x-1" strokeWidth={2.5} />
                </button>

              </div>

            </main>

            {/* Footer on the very bottom with CayLabs Instagram link & v0.5 Beta text */}
            <footer className="w-full text-center py-4 select-none flex flex-col items-center gap-0.5">
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
          </motion.div>
        )}

        {/* DATASET FILES PAGE */}
        {currentPage === 'dataset' && (
          <motion.div
            key="dataset"
            variants={pageVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className="w-full min-h-screen"
          >
            <DatasetFilesView onBack={() => setCurrentPage('menu')} />
          </motion.div>
        )}

        {/* GENERATE SCHEDULE PAGE */}
        {currentPage === 'generate' && (
          <motion.div
            key="generate"
            variants={pageVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className="w-full min-h-screen"
          >
            <GenerateScheduleView onBack={() => setCurrentPage('menu')} />
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  );
}
