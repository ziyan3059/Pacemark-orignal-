import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { MeshCanvas } from './components/MeshCanvas';
import { Navbar } from './components/Navbar';
import { Hero } from './components/Hero';
import { FeatureCards } from './components/FeatureCards';
import { Footer } from './components/Footer';
import { AuthScreen } from './components/AuthScreen';
import { LoggedInDashboard } from './components/LoggedInDashboard';
import { PaperSession } from './components/PaperSession';
import { PerformanceReport } from './components/PerformanceReport';
import { FluidButton } from './components/ui/fluid-button';
import { apiJson, setStoredAuthToken } from './lib/api';

const LOGGED_OUT_TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'how-it-works', label: 'How It Works' },
  { id: 'weakness-engine', label: 'Weakness Engine' },
  { id: 'accessibility', label: 'Accessibility' },
];

const LOGGED_IN_TABS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'papers', label: 'Papers' },
  { id: 'performance', label: 'Performance' },
  { id: 'logout', label: 'Logout' },
];

const INITIAL_PAPERS = [
  { id: 'paper-1', title: 'Paper 1: OCR Computer Science (2025)' },
  { id: 'paper-2', title: 'Paper 2: OCR Computational Thinking (2025)' },
];

const INFO_TAB_CONTENT = {
  'how-it-works': {
    eyebrow: 'How It Works',
    title: 'Timed Practice Built Around Real Past Papers',
    description:
      'Upload a PDF past paper or select a built-in OCR computer science exam. PaceMark isolates multi-column numbered questions, assigns target pacing per mark, records active answer time while ignoring blurred tabs, and walks you through keyword rubric self-marking before generating a PDF diagnostic.',
    highlights: [
      'PDF geometry extraction handles numbered questions, sub-parts, and mark totals.',
      'Active timer tracks per-question duration and pauses automatically if the tab loses focus.',
      'Self-Mark Review highlights matched syllabus keywords so you can confirm every mark.',
    ],
  },
  'weakness-engine': {
    eyebrow: 'Weakness Engine',
    title: 'Priority Weakness Ranking (60% Time · 40% Accuracy)',
    description:
      'After every paper, each syllabus topic is scored by combining time overrun relative to target pacing (60%) with lost marks (40%). Topics are ordered from highest weakness index to lowest and classified into Priority Revision, Needs Pacing, or Strong.',
    highlights: [
      'Insertion-sorted topic rankings spotlight urgent revision areas first.',
      'Topic charts compare mark accuracy percentage against target pacing percentage.',
      'Export any completed session as a formatted PDF report or spreadsheet CSV.',
    ],
  },
  accessibility: {
    eyebrow: 'Accessibility',
    title: 'Readable Typography, High Contrast & Draft Safety',
    description:
      'Every PaceMark workspace supports live font scaling between 14px and 24px, a pure black-on-white High Contrast toggle, keyboard navigation shortcuts (Alt+N and Alt+P), offline network warnings, and 5-second local draft auto-saving.',
    highlights: [
      'Adjustable 14px–24px exam font sizing without breaking page layout.',
      'High Contrast toggle switches surfaces across the workspace to pure white and black.',
      'Per-question 1–5 confidence ratings capture exam readiness alongside timing.',
    ],
  },
};

export default function App() {
  const [activeTab, setActiveTab] = useState('overview');
  const [isAuthScreenOpen, setIsAuthScreenOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [papers, setPapers] = useState(INITIAL_PAPERS);
  const [activePaper, setActivePaper] = useState(null);
  const [examHistory, setExamHistory] = useState([]);
  const [lastResult, setLastResult] = useState(null);
  const [highContrast, setHighContrast] = useState(false);
  const [resultSaveError, setResultSaveError] = useState('');

  useEffect(() => {
    let active = true;
    apiJson('/api/auth/me')
      .then((sessionData) => {
        if (!active || !sessionData.user) return;
        setCurrentUser(sessionData.user);
        setPapers([...INITIAL_PAPERS, ...(sessionData.papers ?? [])]);
        const historyList = sessionData.history ?? [];
        setExamHistory(historyList);
        setLastResult(historyList[0] ?? null);
        setActiveTab('dashboard');
      })
      .catch((sessionError) => {
        console.warn('Could not verify initial session state:', sessionError);
      });

    return () => {
      active = false;
    };
  }, []);

  const handleOpenAuth = () => {
    setIsAuthScreenOpen(true);
    window.scrollTo(0, 0);
  };

  const handleBackFromAuth = () => {
    setIsAuthScreenOpen(false);
    window.scrollTo(0, 0);
  };

  const handleLoginSuccess = (authPayload) => {
    if (!authPayload.user) return;
    const historyList = authPayload.history ?? [];
    setCurrentUser(authPayload.user);
    setPapers([...INITIAL_PAPERS, ...(authPayload.papers ?? [])]);
    setExamHistory(historyList);
    setLastResult(historyList[0] ?? null);
    setResultSaveError('');
    setIsAuthScreenOpen(false);
    setActivePaper(null);
    setActiveTab('dashboard');
    window.scrollTo(0, 0);
  };

  const handleLogout = async () => {
    try {
      await apiJson('/api/auth/logout', { method: 'POST' });
    } catch (logoutError) {
      console.warn('Logout request encountered an error; clearing local session:', logoutError);
    }
    setStoredAuthToken(null);
    setCurrentUser(null);
    setPapers(INITIAL_PAPERS);
    setActivePaper(null);
    setExamHistory([]);
    setLastResult(null);
    setResultSaveError('');
    setActiveTab('overview');
    window.scrollTo(0, 0);
  };

  const handleTabSelect = (tabId) => {
    if (tabId === 'logout') {
      void handleLogout();
      return;
    }
    setActivePaper(null);
    setActiveTab(tabId);
    window.scrollTo(0, 0);
  };

  const handleAddPaper = (newPaper) => {
    setPapers((prev) => [...prev, newPaper]);
  };

  const handleStartPaper = (paper) => {
    setActivePaper(paper);
    window.scrollTo(0, 0);
  };

  const persistExamResult = async (resultToSave) => {
    if (!currentUser || !resultToSave) return;
    setResultSaveError('');
    try {
      const saveResponse = await apiJson('/api/results', {
        method: 'POST',
        body: JSON.stringify(resultToSave),
      });
      if (saveResponse.result) {
        setLastResult(saveResponse.result);
        setExamHistory((prev) => [
          saveResponse.result,
          ...prev.filter(
            (historyEntry) =>
              historyEntry.id !== resultToSave.id && historyEntry.id !== saveResponse.result.id,
          ),
        ]);
      }
    } catch (saveError) {
      console.error('Failed to persist exam result:', saveError);
      setResultSaveError(
        'Your report was generated below, but could not be saved to the server. Check your connection and retry.',
      );
    }
  };

  const handleEndPaper = async (completedResult) => {
    setLastResult(completedResult);
    setExamHistory((prev) => [completedResult, ...prev]);
    setActivePaper(null);
    setActiveTab('performance');
    window.scrollTo(0, 0);
    await persistExamResult(completedResult);
  };

  const currentLoggedInTab = activePaper
    ? 'papers'
    : activeTab === 'papers' || activeTab === 'performance'
      ? activeTab
      : 'dashboard';

  const activeInfoTab = INFO_TAB_CONTENT[activeTab];

  return (
    <div
      className={`relative min-h-screen flex flex-col overflow-x-hidden selection:bg-[#0071E3]/20 selection:text-[#1D1D1F] ${
        highContrast
          ? 'bg-white text-black'
          : 'text-[#1D1D1F] bg-transparent'
      }`}
    >
      {!highContrast && (
        <div className="fixed inset-0 w-full h-full z-0 pointer-events-none">
          <MeshCanvas className="w-full h-full" />
        </div>
      )}

      {isAuthScreenOpen ? (
        <main className="relative z-10 flex-1 flex items-center justify-center">
          <AuthScreen
            onBack={handleBackFromAuth}
            onLoginSuccess={handleLoginSuccess}
            highContrast={highContrast}
          />
        </main>
      ) : currentUser ? (
        <>
          {!activePaper && (
            <Navbar
              tabs={LOGGED_IN_TABS}
              activeTab={currentLoggedInTab}
              onSelectTab={handleTabSelect}
              highContrast={highContrast}
              groupId="logged-in-tabs"
            />
          )}

          <main className="relative z-10 flex-1 flex flex-col justify-center">
            {activePaper ? (
              <PaperSession
                key={activePaper.id}
                paper={activePaper}
                username={currentUser.username}
                highContrast={highContrast}
                onToggleHighContrast={() => setHighContrast((prev) => !prev)}
                onCancelPaper={() => {
                  setActivePaper(null);
                  setActiveTab('papers');
                }}
                onEndPaper={handleEndPaper}
              />
            ) : activeTab === 'performance' ? (
              <PerformanceReport
                result={lastResult}
                history={examHistory}
                username={currentUser.username}
                highContrast={highContrast}
                onToggleHighContrast={() => setHighContrast((prev) => !prev)}
                onSelectResult={(resultEntry) => setLastResult(resultEntry)}
                saveError={resultSaveError}
                onRetrySave={() => persistExamResult(lastResult)}
                onNavigateToPapers={() => handleTabSelect('papers')}
              />
            ) : (
              <LoggedInDashboard
                username={currentUser.username}
                activeSection={activeTab === 'papers' ? 'papers' : 'dashboard'}
                papers={papers}
                highContrast={highContrast}
                onAddPaper={handleAddPaper}
                onStartPaper={handleStartPaper}
              />
            )}
          </main>

          <div className="relative z-10">
            <Footer highContrast={highContrast} />
          </div>
        </>
      ) : (
        <>
          <Navbar
            tabs={LOGGED_OUT_TABS}
            activeTab={activeTab}
            onSelectTab={handleTabSelect}
            highContrast={highContrast}
            groupId="logged-out-tabs"
          />

          <main className="relative z-10 flex-1 flex flex-col justify-center">
            <AnimatePresence mode="wait">
              {activeTab === 'overview' || !activeInfoTab ? (
                <motion.div
                  key="overview"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                >
                  <Hero
                    signedInUser={null}
                    highContrast={highContrast}
                    onPrimaryAction={handleOpenAuth}
                    onSecondaryAction={() => handleTabSelect('how-it-works')}
                  />
                  <FeatureCards
                    highContrast={highContrast}
                    onSelectFeature={(tabId) => handleTabSelect(tabId)}
                  />
                </motion.div>
              ) : (
                <motion.section
                  key={activeTab}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                  className="py-20 px-6 max-w-3xl mx-auto text-center flex flex-col items-center"
                >
                  <div
                    className={`w-full rounded-[32px] p-10 sm:p-14 ${
                      highContrast
                        ? 'bg-white border-2 border-black text-black shadow-none'
                        : 'bg-white/88 backdrop-blur-2xl border border-black/10 text-[#1D1D1F] shadow-[0_20px_50px_rgba(0,0,0,0.08),inset_0_1px_0_rgba(255,255,255,0.95)]'
                    }`}
                  >
                    <span
                      className={`text-[11px] font-semibold uppercase tracking-[0.08em] block mb-3 ${
                        highContrast ? 'text-black' : 'text-[#48484A]'
                      }`}
                    >
                      {activeInfoTab.eyebrow}
                    </span>
                    <h2
                      className={`text-3xl sm:text-4xl font-bold tracking-[-0.03em] mb-4 ${
                        highContrast ? 'text-black' : 'text-[#1D1D1F]'
                      }`}
                    >
                      {activeInfoTab.title}
                    </h2>
                    <p
                      className={`text-base leading-relaxed max-w-xl mx-auto mb-6 ${
                        highContrast ? 'text-black' : 'text-[#3A3A3C]'
                      }`}
                    >
                      {activeInfoTab.description}
                    </p>
                    <ul
                      className={`text-left max-w-lg mx-auto space-y-2 mb-8 text-sm ${
                        highContrast ? 'text-black' : 'text-[#1D1D1F]'
                      }`}
                    >
                      {activeInfoTab.highlights.map((highlight) => (
                        <li
                          key={highlight}
                          className={`rounded-xl px-4 py-2.5 ${
                            highContrast
                              ? 'bg-white border border-black font-medium'
                              : 'bg-[#F2F4F8] border border-black/8'
                          }`}
                        >
                          {highlight}
                        </li>
                      ))}
                    </ul>
                    <div className="flex flex-wrap items-center justify-center gap-3">
                      {activeTab === 'accessibility' && (
                        <FluidButton
                          variant="secondary"
                          size="md"
                          highContrast={highContrast}
                          onClick={() => setHighContrast((prev) => !prev)}
                        >
                          {highContrast ? 'Disable High Contrast' : 'Test High Contrast Mode'}
                        </FluidButton>
                      )}
                      <FluidButton
                        variant="primary"
                        size="md"
                        highContrast={highContrast}
                        onClick={handleOpenAuth}
                      >
                        Sign In to Practice
                      </FluidButton>
                      <FluidButton
                        variant="ghost"
                        size="md"
                        highContrast={highContrast}
                        onClick={() => handleTabSelect('overview')}
                      >
                        Back to Overview
                      </FluidButton>
                    </div>
                  </div>
                </motion.section>
              )}
            </AnimatePresence>
          </main>

          <div className="relative z-10">
            <Footer
              highContrast={highContrast}
              onNavigateTab={(tabId) => handleTabSelect(tabId)}
            />
          </div>
        </>
      )}
    </div>
  );
}
