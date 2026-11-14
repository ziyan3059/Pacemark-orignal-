"use client";

import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, AlertCircle, CheckCircle2, Circle, Info } from 'lucide-react';
import { FluidButton } from './ui/fluid-button';
import {
  apiJson,
  AuthSessionPayload,
  setStoredAuthToken,
  UsernameCheckPayload,
} from '../lib/api';
import { validateStudentPassword } from '../lib/examEngine';

interface AuthScreenProps {
  mode?: 'user' | 'admin';
  onBack: () => void;
  onLoginSuccess?: (payload: AuthSessionPayload) => void;
}

type AuthStep = 'username' | 'password';

export const AuthScreen: React.FC<AuthScreenProps> = ({
  mode = 'user',
  onBack,
  onLoginSuccess,
}) => {
  const isAdminMode = mode === 'admin';
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [step, setStep] = useState<AuthStep>('username');
  const [username, setUsername] = useState('');
  const [verifiedUsername, setVerifiedUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [infoNotice, setInfoNotice] = useState('');
  const [submittedMessage, setSubmittedMessage] = useState('');

  useEffect(() => {
    setIsRegisterMode(false);
    setStep('username');
    setUsername('');
    setVerifiedUsername('');
    setPassword('');
    setError('');
    setInfoNotice('');
    setSubmittedMessage('');
  }, [mode]);

  const resetToUsernameStep = (clearError = true) => {
    setStep('username');
    setUsername('');
    setVerifiedUsername('');
    setPassword('');
    if (clearError) setError('');
    setInfoNotice('');
    setSubmittedMessage('');
  };

  const handleToggleRegisterMode = () => {
    setIsRegisterMode((prev) => !prev);
    setStep('username');
    setUsername('');
    setVerifiedUsername('');
    setPassword('');
    setError('');
    setInfoNotice('');
    setSubmittedMessage('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfoNotice('');
    setSubmittedMessage('');

    // Branch 1: Student-only Sign Up
    if (!isAdminMode && isRegisterMode) {
      const trimmedUsername = username.trim();
      if (!trimmedUsername || !password) {
        setError('Please enter both Username/Email and Password to register.');
        return;
      }

      const pwCheck = validateStudentPassword(password);
      if (!pwCheck.valid) {
        setError(pwCheck.message);
        return;
      }

      setIsSubmitting(true);
      try {
        const data = await apiJson<AuthSessionPayload>('/api/auth/register', {
          method: 'POST',
          body: JSON.stringify({
            username: trimmedUsername,
            password,
          }),
        });

        if (data.token) {
          setStoredAuthToken(data.token);
        }

        setSubmittedMessage(`Student account created for ${data.user?.username}.`);
        setTimeout(() => {
          onLoginSuccess?.(data);
        }, 250);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Registration failed.');
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    // Branch 2: Step 1 — Verify Username (and Admin privilege if in Admin Portal)
    if (step === 'username') {
      const trimmedUsername = username.trim();
      if (!trimmedUsername) {
        setError('Please enter your Username/Email first.');
        return;
      }

      setIsSubmitting(true);
      try {
        const check = await apiJson<UsernameCheckPayload>('/api/auth/check-username', {
          method: 'POST',
          body: JSON.stringify({
            username: trimmedUsername,
            scope: isAdminMode ? 'admin' : 'user',
          }),
        });

        if (check.eligible) {
          setVerifiedUsername(check.canonicalUsername || trimmedUsername);
          setPassword('');
          setStep('password');
          return;
        }

        if (isAdminMode) {
          setUsername('');
          setVerifiedUsername('');
          setPassword('');
          setStep('username');
          setError(
            check.reason === 'SUSPENDED'
              ? 'This administrator account is suspended. Please re-enter your username and password.'
              : 'Access denied: that account is not an administrator. Please re-enter your username and password.',
          );
          return;
        }

        // Standard Login: unrecognized username redirects to Sign Up with empty fields
        if (check.reason === 'NOT_FOUND') {
          setIsRegisterMode(true);
          setStep('username');
          setUsername('');
          setVerifiedUsername('');
          setPassword('');
          setError('');
          setInfoNotice('Account not found. Please sign up below to create a student account.');
          return;
        }

        setUsername('');
        setVerifiedUsername('');
        setPassword('');
        setStep('username');
        setError('This account has been suspended by an administrator.');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to verify username.');
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    // Branch 3: Step 2 — Verify Password against the verified username
    if (!password) {
      setError('Please enter your password.');
      return;
    }

    setIsSubmitting(true);
    try {
      const data = await apiJson<AuthSessionPayload>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          username: verifiedUsername,
          password,
          ...(isAdminMode ? { adminOnly: true } : {}),
        }),
      });

      if (data.token) {
        setStoredAuthToken(data.token);
      }

      setSubmittedMessage(`Signed in as ${data.user?.username}.`);
      setTimeout(() => {
        onLoginSuccess?.(data);
      }, 250);
    } catch (err) {
      const rawMessage = err instanceof Error ? err.message : 'Authentication failed.';
      // Reset both username and password so user re-enters credentials cleanly
      setStep('username');
      setUsername('');
      setVerifiedUsername('');
      setPassword('');
      setError(
        rawMessage.toLowerCase().includes('invalid username or password')
          ? 'Incorrect password. Please re-enter your username and password.'
          : `${rawMessage.replace(/\.$/, '')}. Please re-enter your username and password.`,
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const viewKey =
    !isAdminMode && isRegisterMode ? 'register' : isAdminMode ? `admin-${step}` : `user-${step}`;

  const submitLabel = isSubmitting
    ? !isAdminMode && isRegisterMode
      ? 'Creating...'
      : step === 'username'
        ? 'Checking...'
        : 'Signing in...'
    : !isAdminMode && isRegisterMode
      ? 'Register'
      : 'Login';

  return (
    <div className="relative min-h-screen w-full flex flex-col items-center justify-center px-6 py-12">
      {/* Subtle back navigation */}
      <div className="fixed top-5 left-5 z-50">
        <FluidButton
          variant="secondary"
          size="sm"
          icon={<ArrowLeft className="w-3.5 h-3.5" />}
          onClick={onBack}
        >
          Back
        </FluidButton>
      </div>

      {/* Centered authentication container */}
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 380, damping: 30 }}
        className="w-full max-w-md rounded-[32px] bg-white/80 dark:bg-[#1C1C1E]/85 backdrop-blur-2xl border border-white/80 dark:border-white/10 shadow-[0_24px_64px_rgba(0,0,0,0.1),inset_0_1px_0_rgba(255,255,255,0.85)] p-8 sm:p-10"
      >
        <form onSubmit={handleSubmit} className="flex flex-col">
          {/* Top Center: Logo & Flow Context */}
          <div className="flex flex-col items-center mb-8 text-center">
            <div className="inline-flex items-center gap-2.5 px-5 py-2.5 rounded-2xl bg-black/[0.03] dark:bg-white/[0.06] border border-black/5 dark:border-white/10 shadow-xs">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
                className="text-neutral-950 dark:text-white shrink-0"
              >
                <rect x="3" y="3" width="8" height="8" rx="2" fill="currentColor" />
                <rect x="13" y="3" width="8" height="8" rx="4" fill="#0071E3" />
                <rect x="3" y="13" width="8" height="8" rx="4" fill="#FF9500" />
                <rect x="13" y="13" width="8" height="8" rx="2" fill="currentColor" fillOpacity="0.25" />
              </svg>
              <span className="text-sm font-bold tracking-tight text-[#1D1D1F] dark:text-[#F5F5F7] whitespace-nowrap shrink-0">
                PaceMark
              </span>
            </div>

            <h1 className="mt-4 text-xl font-bold tracking-tight text-[#1D1D1F] dark:text-[#F5F5F7]">
              {isAdminMode
                ? 'Administrator Portal'
                : isRegisterMode
                  ? 'Create Student Account'
                  : 'Sign In'}
            </h1>
            <p className="mt-1 text-xs font-medium text-neutral-500 dark:text-neutral-400">
              {isAdminMode
                ? step === 'username'
                  ? 'Step 1 of 2 · Verify administrator username'
                  : 'Step 2 of 2 · Enter administrator password'
                : isRegisterMode
                  ? 'Student accounts only · Standard learner access'
                  : step === 'username'
                    ? 'Step 1 of 2 · Enter your username to continue'
                    : 'Step 2 of 2 · Enter your account password'}
            </p>
          </div>

          {/* Info notice (e.g., redirected from unknown login username) */}
          {infoNotice && (
            <div className="mb-5 flex items-start gap-2 rounded-2xl bg-[#0071E3]/[0.08] border border-[#0071E3]/20 px-3.5 py-2.5 text-xs font-medium text-neutral-900 dark:text-neutral-100">
              <Info className="w-4 h-4 text-[#0071E3] shrink-0 mt-0.5" />
              <span>{infoNotice}</span>
            </div>
          )}

          {/* Step / Mode Form Fields */}
          <AnimatePresence mode="wait">
            {!isAdminMode && isRegisterMode ? (
              <motion.div
                key={viewKey}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ type: 'spring', stiffness: 420, damping: 28 }}
                className="space-y-4 mb-7"
              >
                <label className="block rounded-2xl bg-black/[0.03] dark:bg-white/[0.05] border border-black/8 dark:border-white/10 px-4 py-3 focus-within:border-[#0071E3] focus-within:ring-2 focus-within:ring-[#0071E3]/20 focus-within:bg-white dark:focus-within:bg-[#1C1C1E] transition-all">
                  <div className="flex items-center gap-2">
                    <span className="text-xs sm:text-sm font-medium text-neutral-600 dark:text-neutral-400 whitespace-nowrap shrink-0">
                      Username/Email
                    </span>
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      disabled={isSubmitting}
                      className="w-full bg-transparent text-sm text-[#1D1D1F] dark:text-white outline-none"
                      autoComplete="username"
                      autoFocus
                    />
                  </div>
                </label>

                <label className="block rounded-2xl bg-black/[0.03] dark:bg-white/[0.05] border border-black/8 dark:border-white/10 px-4 py-3 focus-within:border-[#0071E3] focus-within:ring-2 focus-within:ring-[#0071E3]/20 focus-within:bg-white dark:focus-within:bg-[#1C1C1E] transition-all">
                  <div className="flex items-center gap-2">
                    <span className="text-xs sm:text-sm font-medium text-neutral-600 dark:text-neutral-400 whitespace-nowrap shrink-0">
                      Password:
                    </span>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={isSubmitting}
                      aria-label="New student account password"
                      className="w-full bg-transparent text-sm text-[#1D1D1F] dark:text-white outline-none"
                      autoComplete="new-password"
                    />
                  </div>
                </label>

                {(() => {
                  const pwStatus = validateStudentPassword(password);
                  const rules = [
                    { ok: pwStatus.minLength, label: 'At least 8 characters' },
                    { ok: pwStatus.hasNumber, label: 'At least 1 number (0-9)' },
                    { ok: pwStatus.hasSpecial, label: 'At least 1 special character (!@#$...)' },
                  ];
                  return (
                    <ul
                      aria-label="Password complexity requirements"
                      className="space-y-1.5 px-1 text-xs"
                    >
                      {rules.map((r) => (
                        <li
                          key={r.label}
                          className={`flex items-center gap-2 font-medium ${
                            r.ok ? 'text-[#34C759]' : 'text-neutral-500'
                          }`}
                        >
                          {r.ok ? (
                            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                          ) : (
                            <Circle className="w-3.5 h-3.5 shrink-0 opacity-60" aria-hidden="true" />
                          )}
                          <span>{r.label}</span>
                        </li>
                      ))}
                    </ul>
                  );
                })()}
              </motion.div>
            ) : step === 'username' ? (
              <motion.div
                key={viewKey}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ type: 'spring', stiffness: 420, damping: 28 }}
                className="space-y-4 mb-7"
              >
                <label className="block rounded-2xl bg-black/[0.03] dark:bg-white/[0.05] border border-black/8 dark:border-white/10 px-4 py-3 focus-within:border-[#0071E3] focus-within:ring-2 focus-within:ring-[#0071E3]/20 focus-within:bg-white dark:focus-within:bg-[#1C1C1E] transition-all">
                  <div className="flex items-center gap-2">
                    <span className="text-xs sm:text-sm font-medium text-neutral-600 dark:text-neutral-400 whitespace-nowrap shrink-0">
                      Username/Email
                    </span>
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      disabled={isSubmitting}
                      className="w-full bg-transparent text-sm text-[#1D1D1F] dark:text-white outline-none"
                      autoComplete="username"
                      autoFocus
                    />
                  </div>
                </label>
              </motion.div>
            ) : (
              <motion.div
                key={viewKey}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ type: 'spring', stiffness: 420, damping: 28 }}
                className="space-y-4 mb-7"
              >
                <div className="flex items-center justify-between gap-3 px-1 pb-2 border-b border-black/[0.06] dark:border-white/[0.08] text-xs sm:text-sm">
                  <div className="min-w-0 truncate">
                    <span className="text-neutral-500">Account: </span>
                    <span className="font-semibold text-[#1D1D1F] dark:text-[#F5F5F7]">{verifiedUsername}</span>
                    {isAdminMode && (
                      <span className="text-[#0071E3] font-semibold"> · Admin</span>
                    )}
                  </div>
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => resetToUsernameStep(true)}
                    className="text-xs font-semibold text-neutral-700 dark:text-neutral-300 hover:text-[#0071E3] underline cursor-pointer whitespace-nowrap shrink-0"
                  >
                    Change
                  </button>
                </div>

                <label className="block rounded-2xl bg-black/[0.03] dark:bg-white/[0.05] border border-black/8 dark:border-white/10 px-4 py-3 focus-within:border-[#0071E3] focus-within:ring-2 focus-within:ring-[#0071E3]/20 focus-within:bg-white dark:focus-within:bg-[#1C1C1E] transition-all">
                  <div className="flex items-center gap-2">
                    <span className="text-xs sm:text-sm font-medium text-neutral-600 dark:text-neutral-400 whitespace-nowrap shrink-0">
                      Password:
                    </span>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={isSubmitting}
                      className="w-full bg-transparent text-sm text-[#1D1D1F] dark:text-white outline-none"
                      autoComplete="current-password"
                      autoFocus
                    />
                  </div>
                </label>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Inline validation or confirmation feedback */}
          {error && (
            <div
              role="alert"
              aria-live="polite"
              className="mb-4 flex items-start gap-2 rounded-2xl bg-[#FF3B30]/[0.08] border border-[#FF3B30]/20 px-3.5 py-2.5 text-xs font-medium text-[#FF3B30]"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}
          {submittedMessage && (
            <div
              aria-live="polite"
              className="mb-4 flex items-center justify-center gap-2 text-xs font-semibold text-[#0071E3]"
            >
              <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>{submittedMessage}</span>
            </div>
          )}

          {/* Bottom Center: Primary Submit FluidButton + Mode Switch */}
          <div className="flex flex-col items-center gap-3">
            <FluidButton
              type="submit"
              variant="primary"
              size="lg"
              disabled={isSubmitting}
              className="min-w-[160px]"
            >
              {submitLabel}
            </FluidButton>

            {!isAdminMode && (
              <p className="text-xs sm:text-sm text-neutral-600 dark:text-neutral-400">
                {isRegisterMode ? 'Already have an account? ' : "Don't have an account? "}
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={handleToggleRegisterMode}
                  className="font-semibold text-[#0071E3] hover:underline transition-colors cursor-pointer whitespace-nowrap shrink-0 ml-1"
                >
                  {isRegisterMode ? 'Sign In' : 'Sign Up'}
                </button>
              </p>
            )}
          </div>
        </form>
      </motion.div>
    </div>
  );
};
