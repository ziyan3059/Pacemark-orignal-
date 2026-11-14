"use client";

import React, { useCallback, useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, LogIn, RefreshCw, Search, UserPlus } from 'lucide-react';
import { FluidButton } from './ui/fluid-button';
import { ContinuousTabs, TabItem } from './watermelon/continuous-tabs';
import {
  AdminOverviewMetrics,
  AdminUserDetail,
  AdminUserSummary,
  apiJson,
  AuthAuditLogEntry,
  AuthUser,
  UserRole,
  UserStatus,
} from '../lib/api';

interface AdminConsoleProps {
  currentAdmin: AuthUser;
  onBackToApp: () => void;
  onLogout: () => void;
}

const FILTER_OPTIONS: Array<{ id: 'all' | 'user' | 'admin' | 'suspended'; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'user', label: 'Students' },
  { id: 'admin', label: 'Admins' },
  { id: 'suspended', label: 'Suspended' },
];

const DETAIL_TABS: TabItem[] = [
  { id: 'profile', label: 'Profile & Access' },
  { id: 'exams', label: 'Exam History' },
  { id: 'papers', label: 'Uploaded PDFs' },
];

const AUDIT_FILTERS: Array<{ id: 'all' | 'signup' | 'login'; label: string }> = [
  { id: 'all', label: 'All Activity' },
  { id: 'signup', label: 'Sign-Ups' },
  { id: 'login', label: 'Logins' },
];

function formatDateTime(iso: string | null): string {
  if (!iso) return 'Never';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const d = date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
  const t = date.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  });
  return `${d} · ${t}`;
}

export const AdminConsole: React.FC<AdminConsoleProps> = ({
  currentAdmin,
  onBackToApp,
  onLogout,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'user' | 'admin' | 'suspended'>('all');
  const [overview, setOverview] = useState<AdminOverviewMetrics>({
    totalUsers: 0,
    activeStudents: 0,
    totalExams: 0,
    totalPapers: 0,
  });
  const [users, setUsers] = useState<AdminUserSummary[]>([]);
  const [isLoadingList, setIsLoadingList] = useState(true);
  const [listError, setListError] = useState('');

  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<AdminUserDetail | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [detailTab, setDetailTab] = useState<'profile' | 'exams' | 'papers'>('profile');
  const [previewPaperId, setPreviewPaperId] = useState<string | null>(null);

  const [actionBusy, setActionBusy] = useState(false);
  const [actionMessage, setActionMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const [auditLogs, setAuditLogs] = useState<AuthAuditLogEntry[]>([]);
  const [auditFilter, setAuditFilter] = useState<'all' | 'signup' | 'login'>('all');
  const [isLoadingAudit, setIsLoadingAudit] = useState(true);
  const [auditError, setAuditError] = useState('');

  const fetchUsers = useCallback(async () => {
    setIsLoadingList(true);
    setListError('');
    try {
      const params = new URLSearchParams();
      if (searchQuery.trim()) params.set('q', searchQuery.trim());
      if (filter !== 'all') params.set('filter', filter);

      const data = await apiJson<{
        overview: AdminOverviewMetrics;
        users: AdminUserSummary[];
      }>(`/api/admin/users?${params.toString()}`);

      setOverview(data.overview);
      setUsers(data.users);

      setSelectedUserId((prev) => {
        if (prev && data.users.some((u) => u.id === prev)) return prev;
        return data.users[0]?.id ?? null;
      });
    } catch (err) {
      setListError(err instanceof Error ? err.message : 'Failed to load users.');
    } finally {
      setIsLoadingList(false);
    }
  }, [searchQuery, filter]);

  const fetchAuditLogs = useCallback(async () => {
    setIsLoadingAudit(true);
    setAuditError('');
    try {
      const params = new URLSearchParams();
      if (auditFilter !== 'all') params.set('event', auditFilter);
      if (searchQuery.trim()) params.set('q', searchQuery.trim());

      const data = await apiJson<{ logs: AuthAuditLogEntry[] }>(
        `/api/admin/audit-logs?${params.toString()}`,
      );
      setAuditLogs(data.logs);
    } catch (err) {
      setAuditError(err instanceof Error ? err.message : 'Failed to load audit log.');
    } finally {
      setIsLoadingAudit(false);
    }
  }, [auditFilter, searchQuery]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchUsers();
      fetchAuditLogs();
    }, 150);
    return () => clearTimeout(timer);
  }, [fetchUsers, fetchAuditLogs]);

  const fetchUserDetail = useCallback(async (userId: string) => {
    setIsLoadingDetail(true);
    setActionMessage(null);
    setPreviewPaperId(null);
    try {
      const data = await apiJson<AdminUserDetail>(`/api/admin/users/${encodeURIComponent(userId)}`);
      setSelectedDetail(data);
    } catch (err) {
      setActionMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to load user details.',
      });
      setSelectedDetail(null);
    } finally {
      setIsLoadingDetail(false);
    }
  }, []);

  useEffect(() => {
    if (selectedUserId) {
      fetchUserDetail(selectedUserId);
    } else {
      setSelectedDetail(null);
    }
  }, [selectedUserId, fetchUserDetail]);

  const handleUpdateUser = async (updates: { role?: UserRole; status?: UserStatus }) => {
    if (!selectedDetail) return;
    setActionBusy(true);
    setActionMessage(null);
    try {
      const res = await apiJson<{ user: AuthUser }>(
        `/api/admin/users/${encodeURIComponent(selectedDetail.user.id)}`,
        {
          method: 'PATCH',
          body: JSON.stringify(updates),
        },
      );
      setSelectedDetail((prev) => (prev ? { ...prev, user: res.user } : null));
      setActionMessage({
        type: 'success',
        text: `Updated ${res.user.username} (${res.user.role === 'admin' ? 'Admin' : 'Student'} · ${res.user.status === 'active' ? 'Active' : 'Suspended'}).`,
      });
      await fetchUsers();
    } catch (err) {
      setActionMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Update failed.',
      });
    } finally {
      setActionBusy(false);
    }
  };

  return (
    <section className="relative pt-10 pb-16 px-6 w-full max-w-6xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        className="w-full rounded-[32px] bg-white/75 dark:bg-[#1C1C1E]/75 backdrop-blur-2xl border border-white/80 dark:border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.85)] p-6 sm:p-10"
      >
        {/* Top Bar */}
        <div className="w-full rounded-2xl bg-[#1D1D1F]/90 dark:bg-white/15 backdrop-blur-xl border border-white/20 px-5 sm:px-6 py-3 mb-8 shadow-sm flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-baseline gap-3">
            <h1 className="text-base sm:text-lg font-bold text-white tracking-tight whitespace-nowrap shrink-0">
              Admin Console
            </h1>
            <span className="text-xs sm:text-sm text-white/80 font-medium whitespace-nowrap shrink-0">
              Signed in as {currentAdmin.username}
            </span>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <FluidButton
              variant="secondary"
              size="sm"
              icon={<RefreshCw className="w-3.5 h-3.5" />}
              onClick={() => {
                fetchUsers();
                fetchAuditLogs();
              }}
            >
              Refresh
            </FluidButton>
            <FluidButton
              variant="secondary"
              size="sm"
              icon={<ArrowLeft className="w-3.5 h-3.5" />}
              onClick={onBackToApp}
            >
              Back to App
            </FluidButton>
            <FluidButton variant="primary" size="sm" onClick={onLogout}>
              Logout
            </FluidButton>
          </div>
        </div>

        {/* Unboxed Overview Metrics Strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 pb-7 mb-7 border-b border-black/[0.06] dark:border-white/[0.08]">
          <div>
            <p className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 mb-1">Total Accounts</p>
            <p className="text-2xl font-bold tracking-tight text-[#1D1D1F] dark:text-[#F5F5F7] font-mono tabular-nums">
              {overview.totalUsers}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 mb-1">Active Students</p>
            <p className="text-2xl font-bold tracking-tight text-[#1D1D1F] dark:text-[#F5F5F7] font-mono tabular-nums">
              {overview.activeStudents}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 mb-1">Completed Exams</p>
            <p className="text-2xl font-bold tracking-tight text-[#0071E3] font-mono tabular-nums">
              {overview.totalExams}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 mb-1">Uploaded PDFs</p>
            <p className="text-2xl font-bold tracking-tight text-[#1D1D1F] dark:text-[#F5F5F7] font-mono tabular-nums">
              {overview.totalPapers}
            </p>
          </div>
        </div>

        {/* Search & Filter Toolbar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search username or email..."
              className="w-full rounded-2xl bg-black/[0.03] dark:bg-white/[0.05] border border-black/8 dark:border-white/10 focus:border-[#0071E3] focus:ring-2 focus:ring-[#0071E3]/20 pl-10 pr-4 py-2 text-sm text-[#1D1D1F] dark:text-[#F5F5F7] placeholder:text-neutral-400 outline-none transition-all"
            />
          </div>

          <div className="flex items-center gap-1 p-1 bg-black/[0.04] dark:bg-white/[0.06] rounded-2xl self-start sm:self-auto">
            {FILTER_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setFilter(opt.id)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-xl transition-all whitespace-nowrap shrink-0 cursor-pointer active:scale-95 ${
                  filter === opt.id
                    ? 'bg-white dark:bg-[#2C2C2E] text-[#1D1D1F] dark:text-white shadow-xs'
                    : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-950 dark:hover:text-white'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {listError && (
          <p className="text-sm font-medium text-[#FF3B30] mb-4">{listError}</p>
        )}

        {/* Master-Detail User Directory & Inspector */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left: Compact User Directory Table */}
          <div className="lg:col-span-5 divide-y divide-black/[0.06] dark:divide-white/[0.08] border-t border-b border-black/[0.06] dark:border-white/[0.08]">
            {isLoadingList ? (
              <div className="space-y-3 py-4">
                {[1, 2, 3].map((row) => (
                  <div
                    key={row}
                    className="h-11 rounded-2xl bg-black/[0.04] dark:bg-white/[0.06] animate-pulse"
                  />
                ))}
              </div>
            ) : users.length === 0 ? (
              <div className="py-10 text-center">
                <p className="text-sm font-semibold text-[#1D1D1F] dark:text-[#F5F5F7]">No matching accounts</p>
                <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                  Try clearing your search or switching the role filter.
                </p>
              </div>
            ) : (
              users.map((u) => {
                const isSelected = selectedUserId === u.id;
                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => setSelectedUserId(u.id)}
                    className={`w-full text-left py-3 px-3 rounded-2xl transition-all cursor-pointer flex items-center justify-between gap-3 ${
                      isSelected
                        ? 'bg-[#0071E3]/[0.1] text-[#0071E3]'
                        : 'hover:bg-black/[0.025] dark:hover:bg-white/[0.04]'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className="text-sm font-bold text-[#1D1D1F] dark:text-[#F5F5F7] truncate">
                          {u.username}
                        </span>
                        <span
                          className={`text-xs font-semibold shrink-0 ${
                            u.status === 'suspended'
                              ? 'text-[#FF3B30]'
                              : u.role === 'admin'
                                ? 'text-[#0071E3]'
                                : 'text-neutral-500'
                          }`}
                        >
                          {u.status === 'suspended'
                            ? 'Suspended'
                            : u.role === 'admin'
                              ? 'Admin'
                              : 'Student'}
                        </span>
                      </div>
                      <p className="text-xs text-neutral-600 font-mono tabular-nums mt-0.5 truncate">
                        {u.examCount} exams · {u.paperCount} PDFs · Joined {formatDateTime(u.createdAt)}
                      </p>
                    </div>

                    {u.avgScore !== null && (
                      <span className="text-xs font-bold text-neutral-900 font-mono tabular-nums shrink-0">
                        {u.avgScore}% avg
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>

          {/* Right: Selected User Detail Inspector */}
          <div className="lg:col-span-7">
            {isLoadingDetail ? (
              <div className="space-y-4 py-4">
                <div className="h-10 rounded-xl bg-black/[0.04] animate-pulse" />
                <div className="h-32 rounded-xl bg-black/[0.04] animate-pulse" />
              </div>
            ) : !selectedDetail ? (
              <div className="py-12 text-center border border-dashed border-black/10 rounded-2xl">
                <p className="text-sm font-medium text-neutral-700">
                  Select a user from the directory to inspect their details, exam scores, and uploaded PDFs.
                </p>
              </div>
            ) : (
              <div>
                {/* Detail Header & Sub-Tabs */}
                <div className="flex flex-wrap items-center justify-between gap-3 pb-4 mb-5 border-b border-black/8">
                  <div>
                    <h2 className="text-xl font-bold text-neutral-950 tracking-tight">
                      {selectedDetail.user.username}
                    </h2>
                    <p className="text-xs font-medium text-neutral-600 font-mono tabular-nums mt-0.5">
                      {selectedDetail.user.role === 'admin' ? 'Administrator' : 'Student'} ·{' '}
                      <span
                        className={
                          selectedDetail.user.status === 'suspended'
                            ? 'text-red-700 font-semibold'
                            : 'text-emerald-700 font-semibold'
                        }
                      >
                        {selectedDetail.user.status === 'suspended' ? 'Suspended' : 'Active'}
                      </span>{' '}
                      · {selectedDetail.examHistory.length} exams · {selectedDetail.papers.length} PDFs
                    </p>
                  </div>

                  <ContinuousTabs
                    tabs={DETAIL_TABS}
                    activeId={detailTab}
                    onChange={(id) => setDetailTab(id as 'profile' | 'exams' | 'papers')}
                    groupId="admin-detail-tabs"
                    className="scale-90 origin-right"
                  />
                </div>

                {actionMessage && (
                  <p
                    className={`text-xs sm:text-sm font-medium mb-4 ${
                      actionMessage.type === 'error' ? 'text-red-700' : 'text-[#0055FF]'
                    }`}
                  >
                    {actionMessage.text}
                  </p>
                )}

                {detailTab === 'profile' && (
                  <div className="space-y-6">
                    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                      <div>
                        <dt className="text-xs font-medium text-neutral-600">Account ID</dt>
                        <dd className="font-mono text-xs text-neutral-900 mt-0.5 break-all">
                          {selectedDetail.user.id}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs font-medium text-neutral-600">Username / Email</dt>
                        <dd className="font-semibold text-neutral-950 mt-0.5">
                          {selectedDetail.user.username}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs font-medium text-neutral-600">Signed Up</dt>
                        <dd className="font-mono text-xs text-neutral-900 tabular-nums mt-0.5">
                          {formatDateTime(selectedDetail.user.createdAt)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs font-medium text-neutral-600">Last Login</dt>
                        <dd className="font-mono text-xs text-neutral-900 tabular-nums mt-0.5">
                          {formatDateTime(selectedDetail.user.lastLoginAt)}
                        </dd>
                      </div>
                    </dl>

                    <div className="pt-5 border-t border-black/8 flex flex-wrap items-center gap-3">
                      <FluidButton
                        variant="secondary"
                        size="sm"
                        disabled={
                          actionBusy || selectedDetail.user.id === currentAdmin.id
                        }
                        onClick={() =>
                          handleUpdateUser({
                            role: selectedDetail.user.role === 'admin' ? 'user' : 'admin',
                          })
                        }
                        className={
                          selectedDetail.user.id === currentAdmin.id
                            ? 'opacity-45 pointer-events-none'
                            : ''
                        }
                      >
                        {selectedDetail.user.role === 'admin'
                          ? 'Set as Student'
                          : 'Promote to Admin'}
                      </FluidButton>

                      <FluidButton
                        variant={
                          selectedDetail.user.status === 'active' ? 'primary' : 'secondary'
                        }
                        size="sm"
                        disabled={
                          actionBusy || selectedDetail.user.id === currentAdmin.id
                        }
                        onClick={() =>
                          handleUpdateUser({
                            status:
                              selectedDetail.user.status === 'active' ? 'suspended' : 'active',
                          })
                        }
                        className={
                          selectedDetail.user.id === currentAdmin.id
                            ? 'opacity-45 pointer-events-none'
                            : ''
                        }
                      >
                        {selectedDetail.user.status === 'active'
                          ? 'Suspend Account'
                          : 'Reactivate Account'}
                      </FluidButton>

                      {selectedDetail.user.id === currentAdmin.id && (
                        <span className="text-xs text-neutral-600">
                          Active self-protection enabled on current admin account.
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {detailTab === 'exams' && (
                  <div className="divide-y divide-black/8">
                    {selectedDetail.examHistory.length === 0 ? (
                      <p className="py-8 text-sm text-neutral-600 text-center">
                        This user has not completed any exams yet.
                      </p>
                    ) : (
                      selectedDetail.examHistory.map((exam) => (
                        <div key={exam.id} className="py-4">
                          <div className="flex flex-wrap items-baseline justify-between gap-2">
                            <span className="text-sm sm:text-base font-semibold text-neutral-950">
                              {exam.paperTitle}
                            </span>
                            <span className="text-base font-extrabold text-[#0055FF] font-mono tabular-nums">
                              {exam.scorePercent}%
                            </span>
                          </div>
                          <p className="text-xs text-neutral-600 font-mono tabular-nums mt-0.5">
                            {formatDateTime(exam.completedAt)} · Avg {exam.avgTimeLabel}/Q ·{' '}
                            {exam.questionsAnswered ?? 0}/{exam.totalQuestions ?? 5} answered
                          </p>
                          {exam.summary && (
                            <p className="text-sm text-neutral-800 mt-1.5 leading-relaxed">
                              {exam.summary}
                            </p>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                )}

                {detailTab === 'papers' && (
                  <div className="divide-y divide-black/8">
                    {selectedDetail.papers.length === 0 ? (
                      <p className="py-8 text-sm text-neutral-600 text-center">
                        This user has not uploaded any PDFs yet.
                      </p>
                    ) : (
                      selectedDetail.papers.map((paper) => {
                        const isOpen = previewPaperId === paper.id;
                        const qCount = paper.questions?.length ?? 0;
                        return (
                          <div key={paper.id} className="py-4">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <p className="text-sm sm:text-base font-semibold text-neutral-950 truncate">
                                  {paper.title}
                                </p>
                                <p className="text-xs text-neutral-600 font-mono tabular-nums mt-0.5">
                                  {paper.pageCount ?? 0} pages · {qCount} questions extracted
                                  {paper.createdAt ? ` · ${formatDateTime(paper.createdAt)}` : ''}
                                </p>
                              </div>

                              {paper.extractedText && (
                                <FluidButton
                                  variant="secondary"
                                  size="sm"
                                  onClick={() => setPreviewPaperId(isOpen ? null : paper.id)}
                                >
                                  {isOpen ? 'Hide text' : 'View text'}
                                </FluidButton>
                              )}
                            </div>

                            {isOpen && paper.extractedText && (
                              <pre className="mt-3 max-h-56 overflow-y-auto whitespace-pre-wrap rounded-xl bg-white/90 border border-black/10 p-4 text-xs text-neutral-800 font-mono leading-relaxed">
                                {paper.extractedText}
                              </pre>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Read-Only Sign-Up & Login Audit Log */}
        <div className="pt-8 mt-8 border-t border-black/10">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
            <div>
              <h2 className="text-base sm:text-lg font-bold text-neutral-950 tracking-tight">
                Sign-Up &amp; Login Audit Log
              </h2>
              <p className="text-xs text-neutral-600 mt-0.5">
                Read-only chronological record of account registrations and sign-ins across all users
              </p>
            </div>

            <div className="flex items-center gap-1 p-1 bg-black/[0.05] rounded-xl self-start sm:self-auto">
              {AUDIT_FILTERS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setAuditFilter(opt.id)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    auditFilter === opt.id
                      ? 'bg-white text-neutral-950 shadow-xs'
                      : 'text-neutral-600 hover:text-neutral-950'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {auditError && (
            <p className="text-xs font-medium text-red-700 mb-3">{auditError}</p>
          )}

          {isLoadingAudit ? (
            <div className="space-y-2 py-2">
              {[1, 2, 3].map((row) => (
                <div key={row} className="h-10 rounded-lg bg-black/[0.04] animate-pulse" />
              ))}
            </div>
          ) : auditLogs.length === 0 ? (
            <div className="py-8 text-center border-t border-b border-black/8">
              <p className="text-sm font-medium text-neutral-700">
                No sign-up or login activity recorded for the current filter.
              </p>
            </div>
          ) : (
            <div className="max-h-72 overflow-y-auto border-t border-b border-black/8">
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 bg-white/90 backdrop-blur-md border-b border-black/8 text-xs font-semibold text-neutral-600">
                  <tr>
                    <th className="py-2.5 pr-4">Account</th>
                    <th className="py-2.5 px-4">Role</th>
                    <th className="py-2.5 px-4">Activity</th>
                    <th className="py-2.5 pl-4 text-right">Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/6 text-xs sm:text-sm">
                  {auditLogs.map((entry) => (
                    <tr key={entry.id} className="h-10 hover:bg-white/60 transition-colors">
                      <td className="py-2 pr-4 font-semibold text-neutral-950 truncate max-w-[180px]">
                        {entry.username}
                      </td>
                      <td
                        className={`py-2 px-4 font-medium whitespace-nowrap ${
                          entry.role === 'admin' ? 'text-[#0055FF]' : 'text-neutral-700'
                        }`}
                      >
                        {entry.role === 'admin' ? 'Admin' : 'Student'}
                      </td>
                      <td className="py-2 px-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1.5 font-medium ${
                            entry.eventType === 'signup'
                              ? 'text-emerald-700'
                              : 'text-neutral-800'
                          }`}
                        >
                          {entry.eventType === 'signup' ? (
                            <UserPlus className="w-3.5 h-3.5 shrink-0" />
                          ) : (
                            <LogIn className="w-3.5 h-3.5 shrink-0" />
                          )}
                          <span>{entry.eventType === 'signup' ? 'Sign Up' : 'Login'}</span>
                        </span>
                      </td>
                      <td className="py-2 pl-4 text-right font-mono text-xs text-neutral-700 tabular-nums whitespace-nowrap">
                        {formatDateTime(entry.occurredAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </motion.div>
    </section>
  );
};
