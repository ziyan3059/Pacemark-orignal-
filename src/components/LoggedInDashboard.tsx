"use client";

import React, { useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Loader2 } from 'lucide-react';
import { HugeiconsIcon } from '@hugeicons/react';
import { FileUploadIcon, NoteIcon, TaskEdit01Icon } from '@hugeicons/core-free-icons';
import { FluidButton } from './ui/fluid-button';
import { CreateNewDisclosure, type DisclosureItem } from './watermelon/create-new-disclosure';
import { ActivePaper } from './PaperSession';
import { getAuthHeaders } from '../lib/api';

interface LoggedInDashboardProps {
  username: string;
  activeSection: 'dashboard' | 'papers';
  papers: ActivePaper[];
  onAddPaper: (paper: ActivePaper) => void;
  onStartPaper: (paper: ActivePaper) => void;
}

export const LoggedInDashboard: React.FC<LoggedInDashboardProps> = ({
  username,
  activeSection,
  papers,
  onAddPaper,
  onStartPaper,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [uploadFeedback, setUploadFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);
  const [previewPaperId, setPreviewPaperId] = useState<string | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const isPdf =
      file.type === 'application/pdf' ||
      file.type === 'application/x-pdf' ||
      file.name.toLowerCase().endsWith('.pdf');
    if (!isPdf || file.size > 15 * 1024 * 1024) {
      setUploadFeedback({
        type: 'error',
        message: 'Invalid file type or size exceeded. Please choose a PDF file under 15 MB.',
      });
      return;
    }

    setIsAnalyzing(true);
    setUploadFeedback(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/papers/analyze', {
        method: 'POST',
        credentials: 'include',
        headers: getAuthHeaders(),
        body: formData,
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || 'Could not extract text from PDF.');
      }

      const newPaper: ActivePaper = {
        id: data.id || `uploaded-${Date.now()}`,
        title: data.title || file.name.replace(/\.pdf$/i, ''),
        pageCount: data.pageCount ?? 0,
        extractedText: data.extractedText ?? '',
        needsOcr: Boolean(data.needsOcr),
        questions: Array.isArray(data.questions) ? data.questions : [],
      };

      onAddPaper(newPaper);
      setPreviewPaperId(newPaper.id);

      if (newPaper.needsOcr) {
        setUploadFeedback({
          type: 'error',
          message: `Added "${newPaper.title}" (${newPaper.pageCount} pages), but no selectable text was found (scanned/image PDF).`,
        });
      } else {
        const qCount = newPaper.questions?.length ?? 0;
        setUploadFeedback({
          type: 'success',
          message: `Extracted ${data.characterCount ?? 0} characters across ${newPaper.pageCount} ${newPaper.pageCount === 1 ? 'page' : 'pages'} · ${qCount} ${qCount === 1 ? 'question' : 'questions'} ready.`,
        });
      }
    } catch (err) {
      setUploadFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'PDF extraction failed.',
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <section className="relative pt-12 pb-20 px-6 w-full max-w-4xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        className="w-full rounded-[32px] bg-white/75 dark:bg-[#1C1C1E]/75 backdrop-blur-2xl border border-white/80 dark:border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.85)] p-8 sm:p-12"
      >
        {activeSection === 'dashboard' && (
          <>
            {/* Welcome Heading */}
            <h1 className="text-3xl sm:text-4xl font-bold tracking-[-0.025em] text-[#1D1D1F] dark:text-[#F5F5F7] mb-8">
              Welcome, {username}!
            </h1>

            {/* Add Paper / Quick Actions Disclosure */}
            <div className="mb-10">
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf,.pdf"
                onChange={handleFileChange}
                disabled={isAnalyzing}
                className="hidden"
                aria-label="Upload PDF"
              />

              {(() => {
                const firstPaperWithText = papers.find(
                  (p) => Boolean(p.extractedText && p.extractedText.length > 0),
                );
                const disclosureItems: DisclosureItem[] = [
                  {
                    icon: <HugeiconsIcon icon={FileUploadIcon} strokeWidth={1.6} />,
                    label: 'Upload PDF',
                    onClick: () => fileInputRef.current?.click(),
                  },
                  {
                    icon: <HugeiconsIcon icon={TaskEdit01Icon} strokeWidth={1.6} />,
                    label: 'Start Paper',
                    disabled: papers.length === 0,
                    onClick: () => {
                      if (papers[0]) onStartPaper(papers[0]);
                    },
                  },
                  {
                    icon: <HugeiconsIcon icon={NoteIcon} strokeWidth={1.6} />,
                    label: 'Preview Text',
                    disabled: !firstPaperWithText,
                    onClick: () => {
                      if (firstPaperWithText) {
                        setPreviewPaperId((prev) =>
                          prev === firstPaperWithText.id ? null : firstPaperWithText.id,
                        );
                      }
                    },
                  },
                ];

                return (
                  <CreateNewDisclosure
                    items={disclosureItems}
                    isBusy={isAnalyzing}
                    triggerLabel={isAnalyzing ? 'Analyzing PDF...' : 'Upload your first PDF'}
                    headerTitle="Add or Launch Paper"
                    triggerIcon={
                      isAnalyzing ? (
                        <Loader2 className="w-5 h-5 animate-spin text-[#0071E3]" />
                      ) : undefined
                    }
                  />
                );
              })()}

              {uploadFeedback && (
                <p
                  role={uploadFeedback.type === 'error' ? 'alert' : 'status'}
                  aria-live="polite"
                  className={`mt-3 text-xs sm:text-sm font-medium ${
                    uploadFeedback.type === 'error' ? 'text-[#FF3B30]' : 'text-[#0071E3]'
                  }`}
                >
                  {uploadFeedback.message}
                </p>
              )}
            </div>
          </>
        )}

        {/* Current Available past papers header bar */}
        <div className="w-full sm:w-fit sm:min-w-[340px] rounded-2xl bg-[#1D1D1F]/90 dark:bg-white/15 backdrop-blur-xl border border-white/20 px-5 py-2.5 mb-6 shadow-sm">
          <h2 className="text-base sm:text-lg font-semibold text-white tracking-tight">
            Current Available Past Papers
          </h2>
        </div>

        {/* Past papers list */}
        <div className="divide-y divide-black/[0.06] dark:divide-white/[0.08]">
          {papers.map((paper) => {
            const isPreviewOpen = previewPaperId === paper.id;
            const hasExtractedText = Boolean(paper.extractedText && paper.extractedText.length > 0);
            const questionCount = paper.questions?.length ?? 0;

            return (
              <div key={paper.id} className="py-4 px-2 -mx-2 rounded-2xl transition-colors hover:bg-black/[0.02] dark:hover:bg-white/[0.03]">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <span className="text-base sm:text-[17px] font-semibold text-[#1D1D1F] dark:text-[#F5F5F7] tracking-tight block">
                      {paper.title}
                    </span>
                    {(paper.pageCount || questionCount > 0) && (
                      <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400 tabular-nums mt-0.5 block">
                        {paper.pageCount ? `${paper.pageCount} ${paper.pageCount === 1 ? 'page' : 'pages'}` : ''}
                        {paper.pageCount && questionCount > 0 ? ' · ' : ''}
                        {questionCount > 0 ? `${questionCount} ${questionCount === 1 ? 'question' : 'questions'} extracted` : ''}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2.5 shrink-0">
                    {hasExtractedText && (
                      <FluidButton
                        variant="ghost"
                        size="sm"
                        onClick={() => setPreviewPaperId(isPreviewOpen ? null : paper.id)}
                      >
                        {isPreviewOpen ? 'Hide text' : 'View text'}
                      </FluidButton>
                    )}

                    <FluidButton
                      variant="primary"
                      size="sm"
                      onClick={() => onStartPaper(paper)}
                    >
                      Start
                    </FluidButton>
                  </div>
                </div>

                {isPreviewOpen && hasExtractedText && (
                  <pre className="mt-3.5 max-h-52 overflow-y-auto whitespace-pre-wrap rounded-2xl bg-black/[0.03] dark:bg-white/[0.04] border border-black/8 dark:border-white/10 p-4 text-xs text-neutral-800 dark:text-neutral-200 font-mono leading-relaxed">
                    {paper.extractedText}
                  </pre>
                )}
              </div>
            );
          })}
        </div>
      </motion.div>
    </section>
  );
};
