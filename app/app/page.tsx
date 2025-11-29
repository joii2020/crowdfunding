'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useCcc, useSigner } from '@ckb-ccc/connector-react';
import { ccc } from '@ckb-ccc/core';
import ConnectWallet from '@/components/ConnectWallet';
import { getContractConfig } from '@/utils/config';
import { buildClient, getNetwork } from '@/utils/client';
import { ClaimCellInfo, PrjectCellInfo, createCrowfunding, shannonToCKB } from 'shared';

function StatusBadge({ text }: { text: string }) {
  const base =
    'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold border border-transparent';
  const styles: Record<string, string> = {
    Active: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    ReadyFinish: 'bg-amber-50 text-amber-700 border-amber-200',
    Expired: 'bg-rose-50 text-rose-700 border-rose-200',
  };
  return <span className={`${base} ${styles[text] ?? ''}`}>{text}</span>;
}

const formatDeadline = (deadline: Date) =>
  deadline.toLocaleString(undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

const toDateTimeLocalValue = (date: Date) => {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
};

const getDefaultDeadlineInput = () => {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return toDateTimeLocalValue(d);
};

const projectCache: {
  data: PrjectCellInfo[] | null;
  updating: boolean;
} = {
  data: null,
  updating: false,
};

const preferredClient = buildClient(getNetwork());

type ProjectListItem = PrjectCellInfo & { owner?: boolean };

const fetchProjects = async (client: ccc.Client, forceRefresh = false) => {
  if (forceRefresh) {
    projectCache.data = null;
  }

  if (!forceRefresh && projectCache.data)
    return projectCache.data;
  if (projectCache.updating)
    return [];

  projectCache.updating = true;

  const clientForNetwork = client.url === preferredClient.url ? client : preferredClient;
  const data = await PrjectCellInfo.getAll(clientForNetwork);
  if (data.length != 0)
    projectCache.data = data;

  projectCache.updating = false;
  return data;
};

export default function Home() {
  const network = getNetwork();
  const { claimScript, contributionScript, projectScript } = getContractConfig(network);

  const walletSigner = useSigner();

  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [goalAmount, setGoalAmount] = useState('');
  const [deadlineInput, setDeadlineInput] = useState(() => getDefaultDeadlineInput());
  const [description, setDescription] = useState('');
  const [claims, setClaims] = useState<ClaimCellInfo[]>([]);
  const [loadingClaims, setLoadingClaims] = useState(false);
  const [claimsError, setClaimsError] = useState<string | null>(null);

  const context = useCcc();

  const loadProjects = useCallback(async (forceRefresh = false) => {
    setLoadingProjects(true);
    setLoadError(null);

    try {
      const infos = await fetchProjects(context.client, forceRefresh);

      let signerLockScriptHash: string | null = null;
      if (walletSigner) {
        try {
          const signerLock = (await walletSigner.getRecommendedAddressObj()).script;
          signerLockScriptHash = signerLock.hash();
        } catch (error) {
          console.warn('Failed to load signer lock script hash', error);
        }
      }

      const infosWithOwner: ProjectListItem[] = signerLockScriptHash
        ? infos.map((info) => ({ ...info, owner: info.lockScriptHash === signerLockScriptHash }))
        : infos;

      const ownerWeight = (p: ProjectListItem) => (p.owner ? 0 : 1);
      const statusWeight = (p: PrjectCellInfo) => (p.status === 'ReadyFinish' ? 0 : 1);

      const sorted = infosWithOwner
        .map((p, idx) => ({ p, idx }))
        .sort((a, b) => {
          if (signerLockScriptHash) {
            const ownerDiff = ownerWeight(a.p) - ownerWeight(b.p);
            if (ownerDiff !== 0) return ownerDiff; // owners first
          }

          const statusDiff = statusWeight(a.p) - statusWeight(b.p);
          if (statusDiff !== 0) return statusDiff; // ready to finish before others

          return a.idx - b.idx; // keep original order otherwise
        })
        .map((item) => item.p);
      setProjects(sorted);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load projects';
      setLoadError(message);
    }

    setLoadingProjects(false);

  }, [context.client, walletSigner]);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    let canceled = false;
    const loadClaims = async () => {
      if (!walletSigner) {
        setClaims([]);
        setClaimsError(null);
        setLoadingClaims(false);
        return;
      }

      setLoadingClaims(true);
      setClaimsError(null);
      try {
        const signer = walletSigner as unknown as ccc.SignerCkbPrivateKey;
        const claimCells = (await ClaimCellInfo.getAll(signer, null)) ?? [];
        if (!canceled) {
          setClaims(claimCells);
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
  }, [walletSigner]);

  const handleOpenCreate = () => {
    setGoalAmount('');
    setDeadlineInput(getDefaultDeadlineInput());
    setDescription('');
    setShowCreateModal(true);
  };

  const handleCreateProject = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const goal = goalAmount ? BigInt(goalAmount) : BigInt(0);
      const deadline = new Date(deadlineInput);

      const activeSigner =
        walletSigner as unknown as ccc.SignerCkbPrivateKey | undefined;
      if (activeSigner == undefined) {
        alert('Please connect your wallet to create a project.');
      } else {
        createCrowfunding(activeSigner, goal, deadline, description);
      }

      setShowCreateModal(false);
    },
    [deadlineInput, description, goalAmount],
  );

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <div className="mx-auto max-w-6xl px-6 py-10 space-y-10">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm text-muted-foreground">CKB Crowdfunding Demo</p>
            <h1 className="text-3xl font-bold">Projects</h1>
            <p className="text-xs text-muted-foreground mt-1">
              Network: <span className="font-mono">{network}</span>
            </p>
            {
              <p className="mt-1 text-xs text-amber-700">
                Wallet not connected; using a random signer for public project data. Will refresh
                after you connect.
              </p>
            }
          </div>
          <div className="flex items-center gap-3">
            <ConnectWallet />
          </div>
        </header>

        <section className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50/80 p-4 sm:grid-cols-3">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Project Script</p>
            <p className="break-all font-mono text-xs">{projectScript?.codeHash}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Contribution Script</p>
            <p className="break-all font-mono text-xs">{contributionScript?.codeHash}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Claim Script</p>
            <p className="break-all font-mono text-xs">{claimScript?.codeHash}</p>
          </div>
        </section>

        <section className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <p className="text-lg font-semibold">Create a new project</p>
            <p className="text-sm text-muted-foreground">
              Goal amount, deadline, creator lock will be filled here (demo only).
            </p>
          </div>
          <button
            onClick={handleOpenCreate}
            disabled={!walletSigner}
            className={`rounded-lg px-4 py-2 text-sm text-white ${walletSigner
              ? 'bg-slate-900 hover:bg-slate-800'
              : 'bg-slate-400 cursor-not-allowed'
              }`}
          >
            Create Project
          </button>
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">All Projects</h2>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <p>Owner/Destroy buttons are mocked for layout only.</p>
              <button
                onClick={() => loadProjects(true)}
                className="rounded-full border border-slate-300 px-3 py-1 text-xs hover:bg-slate-50"
              >
                Refresh
              </button>
            </div>
          </div>
          {loadError && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-xs text-amber-800">
              Failed to load: {loadError}
            </div>
          )}
          <div className="overflow-hidden rounded-xl border border-slate-200">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50">
                <tr className="text-left text-slate-600">
                  <th className="px-4 py-3 font-medium">TxHash</th>
                  <th className="px-4 py-3 font-medium">Raised / Goal (CKB)</th>
                  <th className="px-4 py-3 font-medium">Deadline</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Owner</th>
                  <th className="px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loadingProjects ? (
                  <tr>
                    <td className="px-4 py-6 text-center text-xs text-slate-500" colSpan={6}>
                      Loading projects from chain...
                    </td>
                  </tr>
                ) : projects.length === 0 ? (
                  <tr>
                    <td className="px-4 py-6 text-center text-xs text-slate-500" colSpan={6}>
                      No projects found.
                    </td>
                  </tr>
                ) : (
                  projects.map((p) => (
                    <tr key={p.tx.txHash} className="border-t border-slate-200">
                      <td className="px-4 py-3 font-mono text-xs break-all">{p.tx.txHash}</td>
                      <td className="px-4 py-3">
                        <span className="font-semibold">{shannonToCKB(p.raised).toLocaleString()}</span> /{' '}
                        {shannonToCKB(p.goal).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600">
                        {formatDeadline(p.deadline)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <StatusBadge text={p.status} />
                      </td>
                      <td className="px-4 py-3 text-xs text-center">
                        {p.owner ? (
                          <span className="rounded-full bg-slate-900 text-white px-2 py-0.5">
                            Owner
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          {p.status === 'Expired' && (
                            <button className="rounded-md bg-rose-600 px-3 py-1 text-white hover:bg-rose-500">
                              Destroy
                            </button>
                          )}
                          <Link
                            href={`/projects?txHash=${encodeURIComponent(p.tx.txHash)}&txIndex=${p.tx.index.toString()}`}
                            className="rounded-md border border-slate-300 px-3 py-1 hover:bg-slate-50"
                          >
                            View
                          </Link>
                        </div>
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
            <h2 className="text-xl font-semibold">Your Claims</h2>
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
                    <th className="px-4 py-3 font-medium">Deadline</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingClaims ? (
                    <tr>
                      <td className="px-4 py-6 text-center text-xs text-slate-500" colSpan={5}>
                        Loading your claim cells...
                      </td>
                    </tr>
                  ) : claims.length === 0 ? (
                    <tr>
                      <td className="px-4 py-6 text-center text-xs text-slate-500" colSpan={5}>
                        No claim cells found for this address.
                      </td>
                    </tr>
                  ) : (
                    claims.map((c) => {
                      const status = c.deadline.getTime() < Date.now() ? 'Expired' : 'Active';
                      return (
                        <tr key={`${c.txHash}-${c.txIndex.toString()}`} className="border-t border-slate-200">
                          <td className="px-4 py-3 font-mono text-xs break-all">{c.txHash}/{c.txIndex.toString()}</td>
                          <td className="px-4 py-3">
                            {shannonToCKB(c.capacity).toLocaleString()}
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-600">
                            {formatDeadline(c.deadline)}
                          </td>
                          <td className="px-4 py-3">
                            <StatusBadge text={status} />
                          </td>
                          <td className="px-4 py-3 space-x-2">
                            {status === 'Expired' ? (
                              <>
                                <button className="rounded-md bg-slate-900 px-3 py-1 text-white hover:bg-slate-800">
                                  Refund
                                </button>
                                <button className="rounded-md border border-slate-300 px-3 py-1 hover:bg-slate-50">
                                  Destroy Claim
                                </button>
                              </>
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

      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 px-4 py-6">
          <div className="w-full max-w-xl rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200">
            <form onSubmit={handleCreateProject} className="space-y-5 p-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs text-muted-foreground">Create Project</p>
                  <h3 className="text-xl font-semibold">Fill project details</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="rounded-full p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                  aria-label="Close"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-800" htmlFor="goalAmount">
                  goalAmount (CKB)
                </label>
                <div className="relative">
                  <input
                    id="goalAmount"
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    value={goalAmount}
                    onChange={(e) => setGoalAmount(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-4 py-2.5 pr-16 text-sm focus:border-slate-500 focus:outline-none"
                    placeholder="e.g. 10000"
                  />
                  <span className="absolute inset-y-0 right-3 flex items-center text-xs font-semibold text-slate-500">
                    CKB
                  </span>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-800" htmlFor="deadline">
                  deadline (final end time)
                </label>
                <input
                  id="deadline"
                  type="datetime-local"
                  required
                  min={toDateTimeLocalValue(new Date())}
                  value={deadlineInput}
                  onChange={(e) => setDeadlineInput(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm focus:border-slate-500 focus:outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-800" htmlFor="description">
                  Project description
                </label>
                <textarea
                  id="description"
                  rows={5}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe goals, milestones, fund usage, etc. You can add line breaks."
                  className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm focus:border-slate-500 focus:outline-none"
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
                <span>Submit is not wired on-chain yet; it only collects parameters for now.</span>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                  >
                    Confirm create
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
