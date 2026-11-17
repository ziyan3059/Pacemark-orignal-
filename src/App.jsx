import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { MeshCanvas } from './components/MeshCanvas';
import { Navbar } from './components/Navbar';
import { Hero } from './components/Hero';
import { FeatureCards } from './components/FeatureCards';
import { Footer } from './components/Footer';
import { AuthScreen } from './components/AuthScreen';
import { LoggedInDashboard } from './components/LoggedInDashboard';
import { PaperSession } from './components/PaperSession';
import { PerformanceReport } from './components/PerformanceReport';
import { apiJson, setStoredAuthToken } from './lib/api';

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
          <main className="relative z-10 flex-1 flex flex-col justify-center">
            <motion.div
              key="overview"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 380, damping: 30 }}
            >
              <Hero
                highContrast={highContrast}
                onPrimaryAction={handleOpenAuth}
              />
              <FeatureCards highContrast={highContrast} />
            </motion.div>
          </main>

          <div className="relative z-10">
            <Footer highContrast={highContrast} />
          </div>
        </>
      )}
    </div>
  );
}
