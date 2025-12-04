'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useCcc, useSigner } from '@ckb-ccc/connector-react';
import { ccc, hexFrom, Hex, OutPoint } from '@ckb-ccc/core';
import ConnectWallet from '@/components/ConnectWallet';
import { getNetwork, buildClient } from '@/utils/client';
import * as shared from 'shared';

type ProjectDetailCacheEntry = {
  data: shared.PrjectCellInfo | null;
  updating: boolean;
};

function StatusBadge({ text }: { text: string }) {
  const base =
    'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold border border-transparent';
  const styles: Record<string, string> = {
    Active: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    ReadyFinish: 'bg-amber-50 text-amber-700 border-amber-200',
    'Ready to Finish': 'bg-amber-50 text-amber-700 border-amber-200',
    'Pending Merge': 'bg-amber-50 text-amber-700 border-amber-200',
    Expired: 'bg-rose-50 text-rose-700 border-rose-200',
    Destroyed: 'bg-slate-100 text-slate-500 border-slate-200',
    Live: 'bg-slate-100 text-slate-700 border-slate-200',
  };
  const label = text === 'ReadyFinish' ? 'Ready to Finish' : text;
  return <span className={`${base} ${styles[text] ?? ''}`}>{label}</span>;
}

const formatDeadline = (deadline?: Date) =>
  deadline?.toLocaleString(undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }) ?? '—';

const projectDetailCache: Record<string, ProjectDetailCacheEntry> = {};
const preferredClient = buildClient(getNetwork());

const getProjectKey = (tx: OutPoint) => `${tx.txHash}-${tx.index.toString()}`;

const fetchProjectByTx = async (
  client: ccc.Client | null | undefined,
  tx: OutPoint,
  forceRefresh = false,
) => {
  const key = getProjectKey(tx);
  const cache = projectDetailCache[key] ?? { data: null, updating: false, promise: undefined };
  projectDetailCache[key] = cache;
  if (cache.updating)
    return null;

  if (forceRefresh)
    cache.data = null;
  if (!forceRefresh && cache.data)
    return cache.data;

  cache.updating = true;
  const clientForNetwork = client && client.url === preferredClient.url ? client : preferredClient;
  cache.data = await shared.PrjectCellInfo.getByTxHash(clientForNetwork, tx);
  cache.updating = false;

  return cache.data;
};

const getContributionKey = (c: shared.ContributionCellInfo) => `${c.tx.txHash}-${c.tx.index}`;

export default function ProjectsPage() {
  const network = getNetwork();
  const searchParams = useSearchParams();
  const txHashParam = searchParams.get('txHash');
  const txIndexParam = searchParams.get('txIndex');

  const [loadError, setLoadError] = useState<string | null>(null);
  const [showDonateModal, setShowDonateModal] = useState(false);
  const [donationAmount, setDonationAmount] = useState('');
  const [donationError, setDonationError] = useState<string | null>(null);
  const [submittingDonation, setSubmittingDonation] = useState(false);

  const context = useCcc();
  const walletSigner = useSigner();
  const [signerLockScriptHash, setSignerLockScriptHash] = useState<Hex | null>(null);

  const txIndex = useMemo(() => {
    if (!txIndexParam)
      return null;
    try {
      return BigInt(txIndexParam);
    } catch {
      return null;
    }
  }, [txIndexParam]);
  if (!txHashParam || txIndex === null) {
    setLoadError('txHash and txIndex are required in the URL.');
    return;
  }
  const txHash = hexFrom(txHashParam);

  const [project, setProject] = useState<shared.PrjectCellInfo | null>(null);
  const [contributionCells, setContributionCells] = useState<shared.ContributionCellInfo[]>([]);
  const [loadingProject, setLoadingProject] = useState(false);
  const [claims, setClaims] = useState<shared.ClaimCellInfo[]>([]);
  const [loadingClaims, setLoadingClaims] = useState(false);
  const [claimsError, setClaimsError] = useState<string | null>(null);
  const [selectedContributions, setSelectedContributions] = useState<Set<string>>(new Set());
  const [finishingProject, setFinishingProject] = useState(false);
  const [destroyingProject, setDestroyingProject] = useState(false);
  const [destroyingClaimTxHash, setDestroyingClaimTxHash] = useState<Hex | null>(null);
  const [refundingClaimTxHash, setRefundingClaimTxHash] = useState<Hex | null>(null);

  useEffect(() => {
    let canceled = false;

    const loadSignerLockHash = async () => {
      if (!walletSigner) {
        if (!canceled) {
          setSignerLockScriptHash(null);
        }
        return;
      }
      try {
        const signerLock = (await walletSigner.getRecommendedAddressObj()).script;
        if (!canceled) {
          setSignerLockScriptHash(signerLock.hash());
        }
      } catch (error) {
        console.warn('Failed to load signer lock script hash', error);
        if (!canceled) {
          setSignerLockScriptHash(null);
        }
      }
    };

    loadSignerLockHash();

    return () => {
      canceled = true;
    };
  }, [walletSigner]);

  const loadProject = useCallback(async (forceRefresh = false) => {
    if (!txHash || txIndex === null) return;

    setLoadingProject(true);
    setLoadError(null);

    const info = await fetchProjectByTx(context.client, new OutPoint(txHash, txIndex), forceRefresh);
    if (!info) {
      setContributionCells([]);
      setProject(null);
      setLoadingProject(false);
      return;
    }
    setContributionCells(info.contributionInfo);
    setProject(info);

    setLoadingProject(false);
  }, [context.client, txHash, txIndex]);

  const reloadProject = useCallback(async () => {
    loadProject(true);
  }, [loadProject]);

  useEffect(() => {
    if (!txHash || txIndex === null)
      return;
    loadProject();
  }, [loadProject, txHash, txIndex]);

  useEffect(() => {
    let canceled = false;
    const loadClaims = async () => {
      if (loadingProject)
        return;
      if (!walletSigner || !project) {
        if (!canceled) {
          setClaims([]);
          setClaimsError(null);
          setLoadingClaims(false);
        }
        return;
      }

      setLoadingClaims(true);
      setClaimsError(null);
      try {
        const signer = walletSigner as unknown as ccc.SignerCkbPrivateKey;
        const cachedProject =
          projectDetailCache[getProjectKey(project.tx)]?.data ?? project;
        const claimCells = await shared.ClaimCellInfo.getAll(signer, cachedProject);
        if (!canceled) {
          setClaims(claimCells ?? []);
        }
      } catch (error) {
        if (!canceled) {
          const message = error instanceof Error ? error.message : 'Failed to load claims';
          setClaimsError(message);
        }
      }
      if (!canceled) {
        setLoadingClaims(false);
      }
    };

    loadClaims();
    return () => {
      canceled = true;
    };
  }, [walletSigner, project, loadingProject]);

  const handleOpenDonate = () => {
    setDonationAmount('');
    setDonationError(null);
    setShowDonateModal(true);
  };

  const handleSubmitDonation = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setDonationError(null);

      let amount: bigint;
      try {
        amount = BigInt(donationAmount);
      } catch {
        setDonationError('Please enter a valid integer amount in CKB.');
        return;
      }
      if (amount <= 0n) {
        setDonationError('Donation amount must be greater than zero.');
        return;
      }
      if (!walletSigner) {
        setDonationError('Connect your wallet to donate.');
        return;
      }

      setSubmittingDonation(true);

      try {
        const activeSigner = walletSigner as unknown as ccc.SignerCkbPrivateKey;
        await shared.donationToProject(activeSigner, amount, new OutPoint(txHash, txIndex));
        setShowDonateModal(false);
      } catch (error) {
        console.error('Failed to submit donation', error);
        setDonationError('Failed to submit donation. Please try again.');
      } finally {
        setSubmittingDonation(false);
      }
    },
    [donationAmount, txHash, txIndex, walletSigner],
  );

  useEffect(() => {
    setSelectedContributions(new Set());
  }, [contributionCells]);

  const handleToggleContribution = useCallback((key: string) => {
    setSelectedContributions((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const handleMergeSelected = useCallback(() => {
    const selected = contributionCells.filter((c) => selectedContributions.has(getContributionKey(c)));
    if (selected.length === 0)
      return;

    if (!walletSigner || !project)
      return;

    const signer = walletSigner as unknown as ccc.SignerCkbPrivateKey;
    shared.mergeDonation(signer, project.tx, selected)
      .then(() => {
        setSelectedContributions(new Set());
        reloadProject();
      })
      .catch((error) => {
        console.error('Failed to merge donations', error);
      });

  }, [contributionCells, selectedContributions, walletSigner, project, reloadProject]);

  const handleFinishProject = useCallback(async () => {
    if (!walletSigner || !project)
      return;

    setFinishingProject(true);
    setLoadError(null);
    try {
      const signer = walletSigner as unknown as ccc.SignerCkbPrivateKey;
      await shared.crowfundingSuccess(signer, project.tx);
      await reloadProject();
    } catch (error) {
      console.error('Failed to finish project', error);
      setLoadError('Failed to finish project. Please try again.');
    } finally {
      setFinishingProject(false);
    }
  }, [walletSigner, project, reloadProject]);

  const handleDestroyProject = useCallback(async () => {
    if (!walletSigner || !project)
      return;

    setDestroyingProject(true);
    setLoadError(null);
    try {
      const signer = walletSigner as unknown as ccc.SignerCkbPrivateKey;
      await shared.destroyProject(signer, project.tx.txHash);
      setContributionCells([]);
      setProject(null);
    } catch (error) {
      console.error('Failed to destroy project', error);
      setLoadError('Failed to destroy project. Please try again.');
    } finally {
      setDestroyingProject(false);
      setLoadingProject(false);
    }
  }, [walletSigner, project]);

  const handleDestroyClaim = useCallback(
    async (txHashToDestroy: Hex, txIndex: bigint) => {
      if (!walletSigner)
        return;

      setDestroyingClaimTxHash(txHashToDestroy);
      try {
        const signer = walletSigner as unknown as ccc.SignerCkbPrivateKey;
        await shared.destroyClaim(signer, txHashToDestroy);
        setClaims((prev) =>
          prev.filter((claim) => !(claim.txHash === txHashToDestroy && claim.txIndex === txIndex)),
        );
      } catch (error) {
        console.error('Failed to destroy claim', error);
      } finally {
        setDestroyingClaimTxHash(null);
      }
    },
    [walletSigner],
  );

  const handleRefundClaim = useCallback(
    async (txHashToRefund: Hex, txIndex: bigint) => {
      if (!walletSigner)
        return;

      setRefundingClaimTxHash(txHashToRefund);
      try {
        const signer = walletSigner as unknown as ccc.SignerCkbPrivateKey;
        await shared.refound(signer, txHashToRefund);
        setClaims((prev) =>
          prev.filter((claim) => !(claim.txHash === txHashToRefund && claim.txIndex === txIndex)),
        );
      } catch (error) {
        console.error('Failed to refund claim', error);
      } finally {
        setRefundingClaimTxHash(null);
      }
    },
    [walletSigner],
  );

  const isOwner = useMemo(
    () => Boolean(project && signerLockScriptHash && project.lockScriptHash === signerLockScriptHash),
    [project, signerLockScriptHash],
  );

  const canFinish = useMemo(
    () => Boolean(isOwner && project && project.status === 'ReadyFinish'),
    [isOwner, project],
  );

  const statusText = project?.status ?? 'Active';

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <div className="mx-auto max-w-5xl px-6 py-10 space-y-10">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="rounded-full border border-slate-300 px-3 py-1 text-sm hover:bg-slate-50"
            >
              ← Back
            </Link>
            <div>
              <p className="text-sm text-muted-foreground">Project Detail</p>
              <h1 className="text-3xl font-bold">Project</h1>
              <p className="text-xs text-muted-foreground mt-1">
                Network: <span className="font-mono">{network}</span>
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                TxHash:{' '}
                <span className="font-mono break-all">{txHash ?? 'Add txHash in the URL'}</span>
              </p>
              <p className="text-xs text-muted-foreground">
                TxIndex: <span className="font-mono">{txIndexParam ?? 'Add txIndex in the URL'}</span>
              </p>
              {!walletSigner && (
                <p className="mt-1 text-xs text-amber-700">
                  Wallet not connected; using a random signer for public project data. Will refresh
                  after you connect.
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <ConnectWallet />
          </div>
        </header>

        {loadError && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">
            {loadError}
          </div>
        )}

        <section className="rounded-xl border border-slate-200 bg-slate-50/60 p-5 space-y-3">
          <div className="flex items-center gap-3">
            <StatusBadge text={statusText} />
          </div>
          <div className="text-lg font-semibold">
            Raised / Goal:{' '}
            <span className="font-mono">
              {project ? shared.shannonToCKB(project.raised).toLocaleString() : loadingProject ? 'Loading...' : '—'}
            </span>{' '}
            /{' '}
            <span className="font-mono">
              {project ? shared.shannonToCKB(project.goal).toLocaleString() : loadingProject ? 'Loading...' : '—'}
            </span>{' '}
            CKB
          </div>
          <p className="text-sm text-slate-700">
            Deadline:{' '}
            <span className="font-mono">
              {project ? formatDeadline(project.deadline) : loadingProject ? 'Loading...' : '—'}
            </span>
          </p>
          <div className="text-xs text-muted-foreground">
            {txHash && txIndexParam
              ? `Loaded via txHash=${txHash}, txIndex=${txIndexParam}`
              : 'Add ?txHash=...&txIndex=... to load project data.'}
          </div>
          <p className="text-sm text-slate-700">
            Project Creator:{' '}
            {project ? (
              isOwner ? (
                <span className="rounded-full bg-emerald-100 text-emerald-700 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide">
                  You
                </span>
              ) : (
                <span className="font-mono break-all">{project.lockScriptHash}</span>
              )
            ) : (
              <span className="font-mono break-all">{loadingProject ? 'Loading...' : '—'}</span>
            )}
          </p>
          <div className="text-xs font-semibold uppercase text-slate-500 tracking-wide">Description</div>
          <p className="text-sm text-slate-800 whitespace-pre-line">
            {project
              ? project.description?.trim() || 'No description provided.'
              : loadingProject
                ? 'Loading description...'
                : '—'}
          </p>
          <div className="flex flex-wrap gap-3">
            {canFinish && (
              <button
                onClick={handleFinishProject}
                className="rounded-lg bg-emerald-600 text-white px-4 py-2 text-sm hover:bg-emerald-500 disabled:opacity-60"
                disabled={loadingProject || finishingProject}
              >
                {finishingProject ? 'Finishing...' : 'Finish'}
              </button>
            )}
            {project?.status !== 'Destroyed' && (
              <button
                onClick={handleDestroyProject}
                className="rounded-lg bg-rose-600 text-white px-4 py-2 text-sm hover:bg-rose-500 disabled:opacity-60"
                disabled={!project || project.status !== 'Expired' || !isOwner || loadingProject || destroyingProject}
              >
                {destroyingProject ? 'Destroying...' : 'Destroy'}
              </button>
            )}
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Contributions</h2>
            <div className="flex gap-2">
              {project?.status !== 'Destroyed' && (
                <>
                  <button
                    onClick={handleOpenDonate}
                    disabled={!walletSigner}
                    className={`rounded-md px-4 py-2 text-sm text-white ${walletSigner
                      ? 'bg-slate-900 hover:bg-slate-800'
                      : 'bg-slate-400 cursor-not-allowed'
                      }`}
                  >
                    Donate
                  </button>
                  <button
                    onClick={handleMergeSelected}
                    disabled={!walletSigner || selectedContributions.size === 0}
                    className={`rounded-md px-4 py-2 text-sm text-white ${walletSigner && selectedContributions.size > 0
                      ? 'bg-indigo-600 hover:bg-indigo-500'
                      : 'bg-slate-400 cursor-not-allowed'
                      }`}
                  >
                    Merge
                  </button>
                </>
              )}
              <button
                onClick={reloadProject}
                className="rounded-md border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50"
              >
                Reload
              </button>
            </div>
          </div>
          <div className="overflow-hidden rounded-xl border border-slate-200">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-medium">TxHash/Index</th>
                  <th className="px-4 py-3 font-medium">Amount (CKB)</th>
                  <th className="px-4 py-3 font-medium">Select</th>
                </tr>
              </thead>
              <tbody>
                {loadingProject ? (
                  <tr>
                    <td className="px-4 py-6 text-center text-xs text-slate-500" colSpan={3}>
                      Loading project data from chain...
                    </td>
                  </tr>
                ) : contributionCells.length === 0 ? (
                  <tr>
                    <td className="px-4 py-6 text-center text-xs text-slate-500" colSpan={3}>
                      No contribution cells found for this project yet.
                    </td>
                  </tr>
                ) : (
                  contributionCells.map((c, idx) => (
                    <tr key={`${c.tx.txHash}-${idx}`} className="border-t border-slate-200">
                      <td className="px-4 py-3 font-mono text-xs break-all">{c.tx.txHash}/{c.tx.index}</td>
                      <td className="px-4 py-3">
                        {shared.shannonToCKB(c.capacity).toLocaleString()}
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          className="h-4 w-4"
                          checked={selectedContributions.has(getContributionKey(c))}
                          onChange={() => handleToggleContribution(getContributionKey(c))}
                        />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        {walletSigner && (
          <section className="space-y-3">
            <h2 className="text-xl font-semibold">Your Claims for this Project</h2>
            {claimsError && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-xs text-amber-800">
                Failed to load: {claimsError}
              </div>
            )}
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-slate-600">
                  <tr>
                    <th className="px-4 py-3 font-medium">TxHash/Index</th>
                    <th className="px-4 py-3 font-medium">Amount (CKB)</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingClaims ? (
                    <tr>
                      <td className="px-4 py-6 text-center text-xs text-slate-500" colSpan={4}>
                        Loading your claim cells...
                      </td>
                    </tr>
                  ) : claims.length === 0 ? (
                    <tr>
                      <td className="px-4 py-6 text-center text-xs text-slate-500" colSpan={4}>
                        No claim cells found for this project.
                      </td>
                    </tr>
                  ) : (
                    claims.map((c) => {
                      const status = c.isLive ? (c.deadline.getTime() < Date.now() ? 'Expired' : 'Active') : 'Destroyed';
                      return (
                        <tr key={`${c.txHash}-${c.txIndex.toString()}`} className="border-t border-slate-200">
                          <td className="px-4 py-3 font-mono text-xs break-all">{c.txHash}/{c.txIndex.toString()}</td>
                          <td className="px-4 py-3">
                            {shared.shannonToCKB(c.capacity).toLocaleString()}
                          </td>
                          <td className="px-4 py-3">
                            <StatusBadge text={status} />
                          </td>
                          <td className="px-4 py-3">
                            {status === 'Expired' ? (
                              <div className="flex gap-2">
                                <button
                                  onClick={() => handleRefundClaim(c.txHash, c.txIndex)}
                                  disabled={
                                    refundingClaimTxHash === c.txHash || destroyingClaimTxHash === c.txHash
                                  }
                                  className="rounded-md bg-slate-900 px-3 py-1 text-white hover:bg-slate-800 disabled:opacity-60"
                                >
                                  Refund
                                </button>
                                <button
                                  onClick={() => handleDestroyClaim(c.txHash, c.txIndex)}
                                  disabled={
                                    destroyingClaimTxHash === c.txHash || refundingClaimTxHash === c.txHash
                                  }
                                  className="rounded-md border border-slate-300 px-3 py-1 hover:bg-slate-50 disabled:opacity-60"
                                >
                                  Destroy
                                </button>
                              </div>
                            ) : (
                              <span className="text-xs text-slate-400">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>

      {showDonateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 px-4 py-6">
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200">
            <form onSubmit={handleSubmitDonation} className="space-y-5 p-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs text-muted-foreground">Donate to Project</p>
                  <h3 className="text-xl font-semibold">Enter donation details</h3>
                  <p className="mt-1 text-xs text-slate-500">
                    TxHash: <span className="font-mono break-all">{txHash}</span>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowDonateModal(false)}
                  className="rounded-full p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                  aria-label="Close"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-800" htmlFor="donationAmount">
                  Donation amount (CKB)
                </label>
                <div className="relative">
                  <input
                    id="donationAmount"
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    value={donationAmount}
                    onChange={(e) => setDonationAmount(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-4 py-2.5 pr-16 text-sm focus:border-slate-500 focus:outline-none"
                    placeholder="e.g. 500"
                  />
                  <span className="absolute inset-y-0 right-3 flex items-center text-xs font-semibold text-slate-500">
                    CKB
                  </span>
                </div>
              </div>

              {donationError && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-xs text-amber-800">
                  {donationError}
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setShowDonateModal(false)}
                    className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submittingDonation}
                    className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
                  >
                    {submittingDonation ? 'Submitting...' : 'Confirm donation'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
