import React, { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, AlertCircle, CheckCircle2, Circle, Info } from 'lucide-react';
import { FluidButton } from './ui/fluid-button';
import { apiJson, setStoredAuthToken } from '../lib/api';
import { validateStudentPassword } from '../lib/examEngine';

export const AuthScreen = ({
  onBack,
  onLoginSuccess,
  highContrast = false,
}) => {
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [step, setStep] = useState('username');
  const [username, setUsername] = useState('');
  const [verifiedUsername, setVerifiedUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [infoNotice, setInfoNotice] = useState('');
  const [submittedMessage, setSubmittedMessage] = useState('');

  const passwordValidation = validateStudentPassword(password);
  const passwordRules = [
    { satisfied: passwordValidation.minLength, label: 'At least 8 characters' },
    { satisfied: passwordValidation.hasNumber, label: 'At least 1 number (0-9)' },
    { satisfied: passwordValidation.hasSpecial, label: 'At least 1 special character (!@#$...)' },
  ];

  const resetToUsernameStep = (clearError = true) => {
    setStep('username');
    setUsername('');
    setVerifiedUsername('');
    setPassword('');
    if (clearError) setErrorMessage('');
    setInfoNotice('');
    setSubmittedMessage('');
  };

  const handleToggleRegisterMode = () => {
    setIsRegisterMode((prev) => !prev);
    resetToUsernameStep(true);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setErrorMessage('');
    setInfoNotice('');
    setSubmittedMessage('');

    if (isRegisterMode) {
      const trimmedUsername = username.trim();
      if (!trimmedUsername || !password) {
        setErrorMessage('Please enter both Username/Email and Password to register.');
        return;
      }

      if (!passwordValidation.valid) {
        setErrorMessage(passwordValidation.message);
        return;
      }

      setIsSubmitting(true);
      try {
        const authResponse = await apiJson('/api/auth/register', {
          method: 'POST',
          body: JSON.stringify({
            username: trimmedUsername,
            password,
          }),
        });

        if (authResponse.token) {
          setStoredAuthToken(authResponse.token);
        }

        setSubmittedMessage(`Student account created for ${authResponse.user?.username}.`);
        setTimeout(() => {
          onLoginSuccess?.(authResponse);
        }, 250);
      } catch (registerError) {
        setErrorMessage(
          registerError instanceof Error ? registerError.message : 'Registration failed.',
        );
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    if (step === 'username') {
      const trimmedUsername = username.trim();
      if (!trimmedUsername) {
        setErrorMessage('Please enter your Username/Email first.');
        return;
      }

      setIsSubmitting(true);
      try {
        const eligibility = await apiJson('/api/auth/check-username', {
          method: 'POST',
          body: JSON.stringify({
            username: trimmedUsername,
          }),
        });

        if (eligibility.eligible) {
          setVerifiedUsername(eligibility.canonicalUsername || trimmedUsername);
          setPassword('');
          setStep('password');
          return;
        }

        if (eligibility.reason === 'NOT_FOUND') {
          setIsRegisterMode(true);
          resetToUsernameStep(true);
          setInfoNotice('Account not found. Please sign up below to create a student account.');
          return;
        }

        resetToUsernameStep(false);
        setErrorMessage('This account has been suspended.');
      } catch (lookupError) {
        setErrorMessage(
          lookupError instanceof Error ? lookupError.message : 'Unable to verify username.',
        );
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    if (!password) {
      setErrorMessage('Please enter your password.');
      return;
    }

    setIsSubmitting(true);
    try {
      const authResponse = await apiJson('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          username: verifiedUsername,
          password,
        }),
      });

      if (authResponse.token) {
        setStoredAuthToken(authResponse.token);
      }

      setSubmittedMessage(`Signed in as ${authResponse.user?.username}.`);
      setTimeout(() => {
        onLoginSuccess?.(authResponse);
      }, 250);
    } catch (loginError) {
      const rawMessage = loginError instanceof Error ? loginError.message : 'Authentication failed.';
      // Return to step 1 with cleared inputs so credentials cannot be retried blind
      resetToUsernameStep(false);
      setErrorMessage(
        rawMessage.toLowerCase().includes('invalid username or password')
          ? 'Incorrect password. Please re-enter your username and password.'
          : `${rawMessage.replace(/\.$/, '')}. Please re-enter your username and password.`,
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const viewKey = isRegisterMode ? 'register' : `user-${step}`;

  const submitLabel = isSubmitting
    ? isRegisterMode
      ? 'Creating...'
      : step === 'username'
        ? 'Checking...'
        : 'Signing in...'
    : isRegisterMode
      ? 'Register'
      : 'Login';

  const cardSurfaceClass = highContrast
    ? 'bg-white border-2 border-black text-black shadow-none'
    : 'bg-white/88 backdrop-blur-2xl border border-black/10 text-[#1D1D1F] shadow-[0_24px_64px_rgba(0,0,0,0.1),inset_0_1px_0_rgba(255,255,255,0.9)]';

  const inputWrapperClass = highContrast
    ? 'block rounded-2xl bg-white border-2 border-black px-4 py-3 focus-within:ring-2 focus-within:ring-[#005BB5] transition-all'
    : 'block rounded-2xl bg-[#F2F4F8] border border-black/10 px-4 py-3 focus-within:border-[#005BB5] focus-within:ring-2 focus-within:ring-[#005BB5]/20 focus-within:bg-white transition-all';

  return (
    <div className="relative min-h-screen w-full flex flex-col items-center justify-center px-6 py-12">
      <div className="fixed top-5 left-5 z-50">
        <FluidButton
          variant="secondary"
          size="sm"
          highContrast={highContrast}
          icon={<ArrowLeft className="w-3.5 h-3.5" />}
          onClick={onBack}
        >
          Back
        </FluidButton>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 380, damping: 30 }}
        className={`w-full max-w-md rounded-[32px] p-8 sm:p-10 ${cardSurfaceClass}`}
      >
        <form onSubmit={handleSubmit} className="flex flex-col">
          <div className="flex flex-col items-center mb-8 text-center">
            <div
              className={`inline-flex items-center gap-2.5 px-5 py-2.5 rounded-2xl ${
                highContrast
                  ? 'bg-white border-2 border-black text-black'
                  : 'bg-black/[0.04] border border-black/10'
              }`}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
                className={highContrast ? 'text-black shrink-0' : 'text-[#1D1D1F] shrink-0'}
              >
                <rect x="3" y="3" width="8" height="8" rx="2" fill="currentColor" />
                <rect x="13" y="3" width="8" height="8" rx="4" fill="#0071E3" />
                <rect x="3" y="13" width="8" height="8" rx="4" fill="#FF9500" />
                <rect x="13" y="13" width="8" height="8" rx="2" fill="currentColor" fillOpacity="0.3" />
              </svg>
              <span
                className={`text-sm font-bold tracking-tight whitespace-nowrap shrink-0 ${
                  highContrast ? 'text-black' : 'text-[#1D1D1F]'
                }`}
              >
                PaceMark
              </span>
            </div>

            <h1
              className={`mt-4 text-xl font-bold tracking-tight ${
                highContrast ? 'text-black' : 'text-[#1D1D1F]'
              }`}
            >
              {isRegisterMode ? 'Create Student Account' : 'Sign In'}
            </h1>
            <p
              className={`mt-1 text-xs font-medium ${
                highContrast ? 'text-black' : 'text-[#48484A]'
              }`}
            >
              {isRegisterMode
                ? 'Student accounts only · Standard learner access'
                : step === 'username'
                  ? 'Step 1 of 2 · Enter your username to continue'
                  : 'Step 2 of 2 · Enter your account password'}
            </p>
          </div>

          {infoNotice && (
            <div
              className={`mb-5 flex items-start gap-2 rounded-2xl px-3.5 py-2.5 text-xs font-medium ${
                highContrast
                  ? 'bg-white border-2 border-black text-black'
                  : 'bg-[#EFF6FF] border border-[#BFDBFE] text-[#1E3A8A]'
              }`}
            >
              <Info
                className={`w-4 h-4 shrink-0 mt-0.5 ${
                  highContrast ? 'text-black' : 'text-[#1D4ED8]'
                }`}
                aria-hidden="true"
              />
              <span>{infoNotice}</span>
            </div>
          )}

          <AnimatePresence mode="wait">
            {isRegisterMode ? (
              <motion.div
                key={viewKey}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ type: 'spring', stiffness: 420, damping: 28 }}
                className="space-y-4 mb-7"
              >
                <label className={inputWrapperClass}>
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-xs sm:text-sm font-semibold whitespace-nowrap shrink-0 ${
                        highContrast ? 'text-black' : 'text-[#3A3A3C]'
                      }`}
                    >
                      Username/Email
                    </span>
                    <input
                      type="text"
                      value={username}
                      onChange={(event) => setUsername(event.target.value)}
                      disabled={isSubmitting}
                      className={`w-full bg-transparent text-sm outline-none ${
                        highContrast ? 'text-black' : 'text-[#1D1D1F]'
                      }`}
                      autoComplete="username"
                      autoFocus
                    />
                  </div>
                </label>

                <label className={inputWrapperClass}>
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-xs sm:text-sm font-semibold whitespace-nowrap shrink-0 ${
                        highContrast ? 'text-black' : 'text-[#3A3A3C]'
                      }`}
                    >
                      Password:
                    </span>
                    <input
                      type="password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      disabled={isSubmitting}
                      aria-label="New student account password"
                      className={`w-full bg-transparent text-sm outline-none ${
                        highContrast ? 'text-black' : 'text-[#1D1D1F]'
                      }`}
                      autoComplete="new-password"
                    />
                  </div>
                </label>

                <ul
                  aria-label="Password complexity requirements"
                  className="space-y-1.5 px-1 text-xs"
                >
                  {passwordRules.map((rule) => (
                    <li
                      key={rule.label}
                      className={`flex items-center gap-2 font-medium ${
                        rule.satisfied
                          ? highContrast
                            ? 'text-black font-bold'
                            : 'text-[#15803D]'
                          : highContrast
                            ? 'text-black'
                            : 'text-[#48484A]'
                      }`}
                    >
                      {rule.satisfied ? (
                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                      ) : (
                        <Circle className="w-3.5 h-3.5 shrink-0 opacity-70" aria-hidden="true" />
                      )}
                      <span>{rule.label}</span>
                    </li>
                  ))}
                </ul>
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
                <label className={inputWrapperClass}>
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-xs sm:text-sm font-semibold whitespace-nowrap shrink-0 ${
                        highContrast ? 'text-black' : 'text-[#3A3A3C]'
                      }`}
                    >
                      Username/Email
                    </span>
                    <input
                      type="text"
                      value={username}
                      onChange={(event) => setUsername(event.target.value)}
                      disabled={isSubmitting}
                      className={`w-full bg-transparent text-sm outline-none ${
                        highContrast ? 'text-black' : 'text-[#1D1D1F]'
                      }`}
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
                <div
                  className={`flex items-center justify-between gap-3 px-1 pb-2 border-b text-xs sm:text-sm ${
                    highContrast ? 'border-black' : 'border-black/[0.08]'
                  }`}
                >
                  <div className="min-w-0 truncate">
                    <span className={highContrast ? 'text-black' : 'text-[#48484A]'}>
                      Account:{' '}
                    </span>
                    <span
                      className={`font-semibold ${
                        highContrast ? 'text-black' : 'text-[#1D1D1F]'
                      }`}
                    >
                      {verifiedUsername}
                    </span>
                  </div>
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => resetToUsernameStep(true)}
                    className={`text-xs font-semibold underline cursor-pointer whitespace-nowrap shrink-0 ${
                      highContrast ? 'text-black' : 'text-[#005BB5] hover:text-[#1D1D1F]'
                    }`}
                  >
                    Change
                  </button>
                </div>

                <label className={inputWrapperClass}>
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-xs sm:text-sm font-semibold whitespace-nowrap shrink-0 ${
                        highContrast ? 'text-black' : 'text-[#3A3A3C]'
                      }`}
                    >
                      Password:
                    </span>
                    <input
                      type="password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      disabled={isSubmitting}
                      className={`w-full bg-transparent text-sm outline-none ${
                        highContrast ? 'text-black' : 'text-[#1D1D1F]'
                      }`}
                      autoComplete="current-password"
                      autoFocus
                    />
                  </div>
                </label>
              </motion.div>
            )}
          </AnimatePresence>

          {errorMessage && (
            <div
              role="alert"
              aria-live="polite"
              className={`mb-4 flex items-start gap-2 rounded-2xl px-3.5 py-2.5 text-xs font-semibold ${
                highContrast
                  ? 'bg-white border-2 border-black text-black'
                  : 'bg-[#FEE2E2] border border-[#FCA5A5] text-[#991B1B]'
              }`}
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
              <span>{errorMessage}</span>
            </div>
          )}

          {submittedMessage && (
            <div
              aria-live="polite"
              className={`mb-4 flex items-center justify-center gap-2 text-xs font-semibold ${
                highContrast ? 'text-black' : 'text-[#005BB5]'
              }`}
            >
              <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>{submittedMessage}</span>
            </div>
          )}

          <div className="flex flex-col items-center gap-3">
            <FluidButton
              type="submit"
              variant="primary"
              size="lg"
              highContrast={highContrast}
              disabled={isSubmitting}
              className="min-w-[160px]"
            >
              {submitLabel}
            </FluidButton>

            <p className={`text-xs sm:text-sm ${highContrast ? 'text-black' : 'text-[#48484A]'}`}>
              {isRegisterMode ? 'Already have an account? ' : "Don't have an account? "}
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleToggleRegisterMode}
                className={`font-semibold hover:underline transition-colors cursor-pointer whitespace-nowrap shrink-0 ml-1 ${
                  highContrast ? 'text-black underline' : 'text-[#005BB5]'
                }`}
              >
                {isRegisterMode ? 'Sign In' : 'Sign Up'}
              </button>
            </p>
          </div>
        </form>
      </motion.div>
    </div>
  );
};
