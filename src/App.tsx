/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { MeshCanvas } from './components/MeshCanvas';
import { Navbar } from './components/Navbar';
import { Hero } from './components/Hero';
import { PlaceholderCards } from './components/PlaceholderCards';
import { Footer } from './components/Footer';
import { AuthScreen } from './components/AuthScreen';
import { LoggedInDashboard } from './components/LoggedInDashboard';
import { PaperSession, ActivePaper } from './components/PaperSession';
import { PerformanceReport, CompletedPaperResult } from './components/PerformanceReport';
import { AdminConsole } from './components/AdminConsole';
import { FluidButton } from './components/ui/fluid-button';
import { TabItem } from './components/watermelon/continuous-tabs';
import {
  apiJson,
  AuthSessionPayload,
  AuthUser,
  setStoredAuthToken,
} from './lib/api';

const LOGGED_OUT_TABS: TabItem[] = [
  { id: 'tab-1', label: 'Tab 1' },
  { id: 'tab-2', label: 'Tab 2' },
  { id: 'tab-3', label: 'Tab 3' },
  { id: 'tab-4', label: 'Tab 4' },
];

const LOGGED_IN_TABS: TabItem[] = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'papers', label: 'Papers' },
  { id: 'performance', label: 'Performance' },
  { id: 'logout', label: 'Logout' },
];

const INITIAL_PAPERS: ActivePaper[] = [
  { id: 'paper-1', title: 'Paper 1: OCR Computer Science (2025)' },
  { id: 'paper-2', title: 'Paper 2: OCR Computational Thinking (2025)' },
];

const TAB_PLACEHOLDERS: Record<string, { title: string; subtitle: string }> = {
  'tab-2': {
    title: 'Tab 2 Placeholder',
    subtitle: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore.',
  },
  'tab-3': {
    title: 'Tab 3 Placeholder',
    subtitle: 'Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo.',
  },
  'tab-4': {
    title: 'Tab 4 Placeholder',
    subtitle: 'Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.',
  },
};

export default function App() {
  const [activeTab, setActiveTab] = useState<string>('tab-1');
  const [isAuthScreenOpen, setIsAuthScreenOpen] = useState<boolean>(false);
  const [authMode, setAuthMode] = useState<'user' | 'admin'>('user');
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [isAdminConsoleOpen, setIsAdminConsoleOpen] = useState<boolean>(false);
  const [papers, setPapers] = useState<ActivePaper[]>(INITIAL_PAPERS);
  const [activePaper, setActivePaper] = useState<ActivePaper | null>(null);
  const [examHistory, setExamHistory] = useState<CompletedPaperResult[]>([]);
  const [lastResult, setLastResult] = useState<CompletedPaperResult | null>(null);
  const [highContrast, setHighContrast] = useState<boolean>(false);

  useEffect(() => {
    let active = true;
    apiJson<AuthSessionPayload>('/api/auth/me')
      .then((data) => {
        if (!active || !data.user) return;
        setCurrentUser(data.user);
        setPapers([...INITIAL_PAPERS, ...(data.papers ?? [])]);
        const history = data.history ?? [];
        setExamHistory(history);
        setLastResult(history[0] ?? null);
        setActiveTab('dashboard');
      })
      .catch(() => {
        // Unauthenticated or initial startup; remain in logged-out state
      });

    return () => {
      active = false;
    };
  }, []);

  const handleOpenAuth = () => {
    setAuthMode('user');
    setIsAuthScreenOpen(true);
    window.scrollTo(0, 0);
  };

  const handleBackFromAuth = () => {
    setIsAuthScreenOpen(false);
    setAuthMode('user');
    window.scrollTo(0, 0);
  };

  const handleLoginSuccess = (payload: AuthSessionPayload) => {
    if (!payload.user) return;
    const history = payload.history ?? [];
    setCurrentUser(payload.user);
    setPapers([...INITIAL_PAPERS, ...(payload.papers ?? [])]);
    setExamHistory(history);
    setLastResult(history[0] ?? null);
    setIsAuthScreenOpen(false);
    setActivePaper(null);

    if (authMode === 'admin' && payload.user.role === 'admin') {
      setIsAdminConsoleOpen(true);
    } else {
      setIsAdminConsoleOpen(false);
      setActiveTab('dashboard');
    }
    setAuthMode('user');
    window.scrollTo(0, 0);
  };

  const handleLogout = async () => {
    try {
      await apiJson('/api/auth/logout', { method: 'POST' });
    } catch {
      // Clear local client session regardless of network response
    }
    setStoredAuthToken(null);
    setCurrentUser(null);
    setIsAdminConsoleOpen(false);
    setPapers(INITIAL_PAPERS);
    setActivePaper(null);
    setExamHistory([]);
    setLastResult(null);
    setActiveTab('tab-1');
    window.scrollTo(0, 0);
  };

  const handleTabSelect = (id: string) => {
    if (id === 'logout') {
      void handleLogout();
      return;
    }
    setActivePaper(null);
    setActiveTab(id);
    window.scrollTo(0, 0);
  };

  const handleFooterAdminClick = () => {
    if (currentUser?.role === 'admin') {
      setIsAdminConsoleOpen(true);
      setIsAuthScreenOpen(false);
      setActivePaper(null);
      window.scrollTo(0, 0);
      return;
    }
    setAuthMode('admin');
    setIsAuthScreenOpen(true);
    window.scrollTo(0, 0);
  };

  const handleAddPaper = (newPaper: ActivePaper) => {
    setPapers((prev) => [...prev, newPaper]);
  };

  const handleStartPaper = (paper: ActivePaper) => {
    setActivePaper(paper);
    window.scrollTo(0, 0);
  };

  const handleEndPaper = async (result: CompletedPaperResult) => {
    setLastResult(result);
    setExamHistory((prev) => [result, ...prev]);
    setActivePaper(null);
    setActiveTab('performance');
    window.scrollTo(0, 0);

    if (currentUser) {
      try {
        const res = await apiJson<{ result: CompletedPaperResult }>('/api/results', {
          method: 'POST',
          body: JSON.stringify(result),
        });
        if (res.result) {
          setLastResult(res.result);
          setExamHistory((prev) => [
            res.result,
            ...prev.filter((item) => item.id !== result.id && item.id !== res.result.id),
          ]);
        }
      } catch {
        // Keep optimistic UI state if persistence request fails
      }
    }
  };

  const currentLoggedInTab = activePaper
    ? 'papers'
    : activeTab === 'papers' || activeTab === 'performance'
      ? activeTab
      : 'dashboard';

  return (
    <div
      className={`relative min-h-screen flex flex-col overflow-x-hidden selection:bg-[#0071E3]/20 selection:text-neutral-950 ${
        highContrast
          ? 'bg-white text-black'
          : 'text-neutral-950 bg-transparent'
      }`}
    >
      {/* 1. Fullscreen Moving Background Mesh Gradient Canvas (hidden in High-Contrast mode) */}
      {!highContrast && (
        <div className="fixed inset-0 w-full h-full z-0 pointer-events-none">
          <MeshCanvas className="w-full h-full" />
        </div>
      )}

      {isAuthScreenOpen ? (
        /* Dedicated Authentication Screen (connected to Button 1 or Admin footer link) */
        <main className="relative z-10 flex-1 flex items-center justify-center">
          <AuthScreen
            mode={authMode}
            onBack={handleBackFromAuth}
            onLoginSuccess={handleLoginSuccess}
          />
        </main>
      ) : currentUser && isAdminConsoleOpen && currentUser.role === 'admin' ? (
        /* Admin Console Screen */
        <>
          <main className="relative z-10 flex-1 flex flex-col justify-center">
            <AdminConsole
              currentAdmin={currentUser}
              onBackToApp={() => {
                setIsAdminConsoleOpen(false);
                setActiveTab('dashboard');
                window.scrollTo(0, 0);
              }}
              onLogout={() => void handleLogout()}
            />
          </main>

          <div className="relative z-10">
            <Footer onAdminClick={handleFooterAdminClick} isAdminActive />
          </div>
        </>
      ) : currentUser ? (
        /* Post-Login Multi-Tab Interface (hides Navbar during activePaper for distraction-free exam mode) */
        <>
          {!activePaper && (
            <Navbar
              tabs={LOGGED_IN_TABS}
              activeTab={currentLoggedInTab}
              onSelectTab={handleTabSelect}
              groupId="logged-in-tabs"
            />
          )}

          <main className="relative z-10 flex-1 flex flex-col justify-center">
            {activePaper ? (
              /* Active Paper Exam Screen (only comes up when clicking Start on any paper) */
              <PaperSession
                key={activePaper.id}
                paper={activePaper}
                username={currentUser.username}
                highContrast={highContrast}
                onToggleHighContrast={() => setHighContrast((prev) => !prev)}
                onEndPaper={handleEndPaper}
              />
            ) : activeTab === 'performance' ? (
              /* Performance Analysis Report & History (shown after End paper or via Performance tab) */
              <PerformanceReport
                result={lastResult}
                history={examHistory}
                username={currentUser.username}
                highContrast={highContrast}
                onToggleHighContrast={() => setHighContrast((prev) => !prev)}
                onSelectResult={(item) => setLastResult(item)}
              />
            ) : (
              <LoggedInDashboard
                username={currentUser.username}
                activeSection={activeTab === 'papers' ? 'papers' : 'dashboard'}
                papers={papers}
                onAddPaper={handleAddPaper}
                onStartPaper={handleStartPaper}
              />
            )}
          </main>

          <div className="relative z-10">
            <Footer
              onAdminClick={handleFooterAdminClick}
              isAdminActive={currentUser.role === 'admin'}
            />
          </div>
        </>
      ) : (
        /* Pre-Login True Multi-Tab Interface */
        <>
          <Navbar
            tabs={LOGGED_OUT_TABS}
            activeTab={activeTab}
            onSelectTab={handleTabSelect}
            groupId="logged-out-tabs"
          />

          <main className="relative z-10 flex-1 flex flex-col justify-center">
            <AnimatePresence mode="wait">
              {activeTab === 'tab-1' ? (
                <motion.div
                  key="tab-1"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                >
                  <Hero
                    signedInUser={null}
                    onButton1Click={handleOpenAuth}
                    onButton2Click={() => handleTabSelect('tab-2')}
                  />
                  <PlaceholderCards />
                </motion.div>
              ) : (
                <motion.section
                  key={activeTab}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                  className="py-24 px-6 max-w-3xl mx-auto text-center flex flex-col items-center"
                >
                  <div className="w-full rounded-[32px] bg-white/80 dark:bg-[#1C1C1E]/80 backdrop-blur-2xl border border-white/70 dark:border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.85)] p-10 sm:p-14">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8E8E93] block mb-3">
                      {activeTab.replace('-', ' ')}
                    </span>
                    <h2 className="text-3xl sm:text-4xl font-bold tracking-[-0.03em] text-[#1D1D1F] dark:text-white mb-4">
                      {TAB_PLACEHOLDERS[activeTab]?.title || 'Placeholder Tab'}
                    </h2>
                    <p className="text-base text-[#1D1D1F]/70 dark:text-white/70 leading-relaxed max-w-xl mx-auto mb-8">
                      {TAB_PLACEHOLDERS[activeTab]?.subtitle}
                    </p>
                    <FluidButton
                      variant="primary"
                      size="md"
                      onClick={() => handleTabSelect('tab-1')}
                    >
                      Return to Tab 1
                    </FluidButton>
                  </div>
                </motion.section>
              )}
            </AnimatePresence>
          </main>

          <div className="relative z-10">
            <Footer onAdminClick={handleFooterAdminClick} isAdminActive={false} />
          </div>
        </>
      )}
    </div>
  );
}
