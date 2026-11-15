import React, { useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Loader2 } from 'lucide-react';
import { HugeiconsIcon } from '@hugeicons/react';
import { FileUploadIcon, NoteIcon, TaskEdit01Icon } from '@hugeicons/core-free-icons';
import { FluidButton } from './ui/fluid-button';
import { CreateNewDisclosure } from './watermelon/create-new-disclosure';
import { getAuthHeaders } from '../lib/api';

export const LoggedInDashboard = ({
  username,
  activeSection,
  papers,
  highContrast = false,
  onAddPaper,
  onStartPaper,
}) => {
  const fileInputRef = useRef(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [uploadFeedback, setUploadFeedback] = useState(null);
  const [previewPaperId, setPreviewPaperId] = useState(null);

  const firstPaperWithText = papers.find(
    (paperItem) => Boolean(paperItem.extractedText && paperItem.extractedText.length > 0),
  );

  const disclosureItems = [
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

  const handleFileChange = async (event) => {
    const selectedFile = event.target.files?.[0];
    event.target.value = '';
    if (!selectedFile) return;

    const isPdf =
      selectedFile.type === 'application/pdf' ||
      selectedFile.type === 'application/x-pdf' ||
      selectedFile.name.toLowerCase().endsWith('.pdf');
    if (!isPdf || selectedFile.size > 15 * 1024 * 1024) {
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
      formData.append('file', selectedFile);

      const response = await fetch('/api/papers/analyze', {
        method: 'POST',
        credentials: 'include',
        headers: getAuthHeaders(),
        body: formData,
      });

      let analysisResponse = {};
      try {
        analysisResponse = await response.json();
      } catch (parseError) {
        console.warn('Failed to parse PDF analysis JSON response:', parseError);
      }

      if (!response.ok) {
        throw new Error(analysisResponse?.error || 'Could not extract text from PDF.');
      }

      const newPaper = {
        id: analysisResponse.id || `uploaded-${Date.now()}`,
        title: analysisResponse.title || selectedFile.name.replace(/\.pdf$/i, ''),
        pageCount: analysisResponse.pageCount ?? 0,
        extractedText: analysisResponse.extractedText ?? '',
        needsOcr: Boolean(analysisResponse.needsOcr),
        questions: Array.isArray(analysisResponse.questions) ? analysisResponse.questions : [],
      };

      onAddPaper(newPaper);
      setPreviewPaperId(newPaper.id);

      if (newPaper.needsOcr) {
        setUploadFeedback({
          type: 'error',
          message: `Added "${newPaper.title}" (${newPaper.pageCount} pages), but no selectable text was found (scanned/image PDF).`,
        });
      } else {
        const questionCount = newPaper.questions?.length ?? 0;
        setUploadFeedback({
          type: 'success',
          message: `Extracted ${analysisResponse.characterCount ?? 0} characters across ${newPaper.pageCount} ${newPaper.pageCount === 1 ? 'page' : 'pages'} · ${questionCount} ${questionCount === 1 ? 'question' : 'questions'} ready.`,
        });
      }
    } catch (uploadError) {
      setUploadFeedback({
        type: 'error',
        message: uploadError instanceof Error ? uploadError.message : 'PDF extraction failed.',
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const cardSurfaceClass = highContrast
    ? 'bg-white border-2 border-black text-black shadow-none'
    : 'bg-white/86 backdrop-blur-2xl border border-black/10 text-[#1D1D1F] shadow-[0_20px_50px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.9)]';

  const sectionHeaderClass = highContrast
    ? 'bg-black border-2 border-black text-white'
    : 'bg-[#1D1D1F] border border-black/10 text-white shadow-sm';

  return (
    <section className="relative pt-12 pb-20 px-6 w-full max-w-4xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        className={`w-full rounded-[32px] p-8 sm:p-12 ${cardSurfaceClass}`}
      >
        {activeSection === 'dashboard' && (
          <>
            <h1
              className={`text-3xl sm:text-4xl font-bold tracking-[-0.025em] mb-8 ${
                highContrast ? 'text-black' : 'text-[#1D1D1F]'
              }`}
            >
              Welcome, {username}!
            </h1>

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

              <CreateNewDisclosure
                items={disclosureItems}
                isBusy={isAnalyzing}
                highContrast={highContrast}
                triggerLabel={isAnalyzing ? 'Analyzing PDF...' : 'Upload your first PDF'}
                headerTitle="Add or Launch Paper"
                triggerIcon={
                  isAnalyzing ? (
                    <Loader2
                      className={`w-5 h-5 animate-spin ${
                        highContrast ? 'text-black' : 'text-[#005BB5]'
                      }`}
                    />
                  ) : undefined
                }
              />

              {uploadFeedback && (
                <p
                  role={uploadFeedback.type === 'error' ? 'alert' : 'status'}
                  aria-live="polite"
                  className={`mt-3 text-xs sm:text-sm font-semibold ${
                    highContrast
                      ? 'text-black underline'
                      : uploadFeedback.type === 'error'
                        ? 'text-[#B91C1C]'
                        : 'text-[#15803D]'
                  }`}
                >
                  {uploadFeedback.message}
                </p>
              )}
            </div>
          </>
        )}

        <div className={`w-full sm:w-fit sm:min-w-[340px] rounded-2xl px-5 py-2.5 mb-6 ${sectionHeaderClass}`}>
          <h2 className="text-base sm:text-lg font-semibold text-white tracking-tight">
            Current Available Past Papers
          </h2>
        </div>

        {papers.length === 0 ? (
          <div
            className={`rounded-2xl p-8 text-center ${
              highContrast
                ? 'bg-white border-2 border-black text-black'
                : 'bg-[#F2F4F8] border border-black/10 text-[#1D1D1F]'
            }`}
          >
            <p className="text-sm font-semibold mb-1">No papers available yet</p>
            <p className={`text-xs ${highContrast ? 'text-black' : 'text-[#48484A]'}`}>
              Upload a past paper PDF from Dashboard to extract questions and begin timed practice.
            </p>
          </div>
        ) : (
          <div
            className={`divide-y ${
              highContrast ? 'divide-black' : 'divide-black/[0.08]'
            }`}
          >
            {papers.map((paper) => {
              const isPreviewOpen = previewPaperId === paper.id;
              const hasExtractedText = Boolean(paper.extractedText && paper.extractedText.length > 0);
              const questionCount = paper.questions?.length ?? 0;

              return (
                <div
                  key={paper.id}
                  className={`py-4 px-2 -mx-2 rounded-2xl transition-colors ${
                    highContrast ? 'hover:bg-neutral-100' : 'hover:bg-black/[0.03]'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <span
                        className={`text-base sm:text-[17px] font-semibold tracking-tight block ${
                          highContrast ? 'text-black' : 'text-[#1D1D1F]'
                        }`}
                      >
                        {paper.title}
                      </span>
                      {(paper.pageCount > 0 || questionCount > 0) && (
                        <span
                          className={`text-xs font-medium tabular-nums mt-0.5 block ${
                            highContrast ? 'text-black' : 'text-[#48484A]'
                          }`}
                        >
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
                          highContrast={highContrast}
                          onClick={() => setPreviewPaperId(isPreviewOpen ? null : paper.id)}
                        >
                          {isPreviewOpen ? 'Hide text' : 'View text'}
                        </FluidButton>
                      )}

                      <FluidButton
                        variant="primary"
                        size="sm"
                        highContrast={highContrast}
                        onClick={() => onStartPaper(paper)}
                      >
                        Start
                      </FluidButton>
                    </div>
                  </div>

                  {isPreviewOpen && hasExtractedText && (
                    <pre
                      className={`mt-3.5 max-h-52 overflow-y-auto whitespace-pre-wrap rounded-2xl p-4 text-xs font-mono leading-relaxed ${
                        highContrast
                          ? 'bg-white border-2 border-black text-black'
                          : 'bg-[#F2F4F8] border border-black/10 text-[#1D1D1F]'
                      }`}
                    >
                      {paper.extractedText}
                    </pre>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </motion.div>
    </section>
  );
};
