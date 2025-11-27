'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useCcc, useSigner } from '@ckb-ccc/connector-react';
import { ccc, hexFrom, Hex } from '@ckb-ccc/core';
import ConnectWallet from '@/components/ConnectWallet';
import { getNetwork } from '@/utils/client';
import {
  ContributionCellInfo,
  PrjectCellInfo,
  shannonToCKB,
} from 'shared';

const claims = [
  { amount: 1000, deadline: '2024-08-01 12:00', status: 'Active' },
  { amount: 2500, deadline: '2024-06-01 09:00', status: 'Expired' },
];

function StatusBadge({ text }: { text: string }) {
  const base =
    'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold border border-transparent';
  const styles: Record<string, string> = {
    Active: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    ReadyFinish: 'bg-amber-50 text-amber-700 border-amber-200',
    'Ready to Finish': 'bg-amber-50 text-amber-700 border-amber-200',
    'Pending Merge': 'bg-amber-50 text-amber-700 border-amber-200',
    Expired: 'bg-rose-50 text-rose-700 border-rose-200',
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

class RandSigner {
  private static inst: RandSigner;
  public signer!: ccc.SignerCkbPrivateKey;

  private constructor(client: ccc.Client) {
    const clientInstance = client as ccc.Client;
    const randomBytes = new Uint8Array(32);
    crypto.getRandomValues(randomBytes);
    const privateKey = `0x${Array.from(randomBytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')}`;
    this.signer = new ccc.SignerCkbPrivateKey(clientInstance, privateKey);
  }
  static getInstance(client: ccc.Client) {
    if (!RandSigner.inst) RandSigner.inst = new RandSigner(client);
    return RandSigner.inst.signer;
  }
}
let lastTxHash: Hex = hexFrom("0x");

export default function ProjectsPage() {
  const network = getNetwork();
  const searchParams = useSearchParams();
  const txHashParam = searchParams.get('txHash');
  const txIndexParam = searchParams.get('txIndex');

  const [loadError, setLoadError] = useState<string | null>(null);

  const { client } = useCcc();
  const walletSigner = useSigner();

  const txIndex = useMemo(() => {
    if (!txIndexParam) return null;
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

  const fallbackSigner = RandSigner.getInstance(client);

  const activeSigner =
    (walletSigner as unknown as ccc.SignerCkbPrivateKey | undefined) ?? fallbackSigner;
  const usingFallbackSigner = !walletSigner;

  const [project, setProject] = useState<PrjectCellInfo | null>(null);
  const [contributionCells, setContributionCells] = useState<ContributionCellInfo[]>([]);
  const [loadingProject, setLoadingProject] = useState(false);

  const loadProject = useCallback(async () => {
    if (lastTxHash == txHash || txHash == null || txIndex == null)
      return;
    lastTxHash = txHash;

    console.log(`signer: ${ccc.stringify(activeSigner.privateKey)}`);
    setLoadingProject(true);
    setLoadError(null);

    let info = await PrjectCellInfo.getByTxHash(activeSigner, txHash, txIndex);
    setContributionCells(info.contributionInfo);
    setProject(info);

    setLoadingProject(false);
  }, [activeSigner, txHash, txIndex]);

  const reloadProject = useCallback(async () => {
    lastTxHash = "0x";
    loadProject();
  }, [activeSigner, txHash, txIndex]);

  useEffect(() => {
    if (!activeSigner || !txHash || txIndex === null)
      return;
    loadProject();
  }, [activeSigner, loadProject, txHash, txIndex]);

  const statusText = project ? project.status : 'Active';

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
              {usingFallbackSigner && (
                <p className="mt-1 text-xs text-amber-700">
                  Wallet not connected; using a random signer to read chain data.
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
            {project?.owner && (
              <span className="rounded-full bg-slate-900 text-white px-2 py-0.5 text-xs">
                Owner
              </span>
            )}
          </div>
          <div className="text-lg font-semibold">
            Raised / Goal:{' '}
            <span className="font-mono">
              {project ? project.raised.toLocaleString() : loadingProject ? 'Loading...' : '—'}
            </span>{' '}
            /{' '}
            <span className="font-mono">
              {project ? project.goal.toLocaleString() : loadingProject ? 'Loading...' : '—'}
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
          <div className="flex flex-wrap gap-3">
            <button
              className="rounded-lg bg-emerald-600 text-white px-4 py-2 text-sm hover:bg-emerald-500 disabled:opacity-60"
              disabled={!project?.owner || loadingProject}
            >
              Finish
            </button>
            <button
              className="rounded-lg bg-rose-600 text-white px-4 py-2 text-sm hover:bg-rose-500 disabled:opacity-60"
              disabled={!project?.owner || loadingProject}
            >
              Destroy
            </button>
            <span className="text-xs text-muted-foreground">
              Buttons are mocked for layout; wire to tx logic later.
            </span>
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Contributions</h2>
            <div className="flex gap-2">
              <button className="rounded-md bg-slate-900 text-white px-4 py-2 text-sm hover:bg-slate-800">
                Donate
              </button>
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
                  <th className="px-4 py-3 font-medium">Lock Hash</th>
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
                    <tr key={`${c.scriptHash}-${idx}`} className="border-t border-slate-200">
                      <td className="px-4 py-3 font-mono text-xs break-all">{c.scriptHash}</td>
                      <td className="px-4 py-3">
                        {shannonToCKB(c.capacity).toLocaleString()}
                      </td>
                      <td className="px-4 py-3">
                        <input type="checkbox" className="h-4 w-4" />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Your Claims for this Project</h2>
          <div className="overflow-hidden rounded-xl border border-slate-200">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-medium">Amount (CKB)</th>
                  <th className="px-4 py-3 font-medium">Deadline</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {claims.map((c, idx) => (
                  <tr key={`${c.amount}-${idx}`} className="border-t border-slate-200">
                    <td className="px-4 py-3">{c.amount.toLocaleString()}</td>
                    <td className="px-4 py-3 text-xs text-slate-600">{c.deadline}</td>
                    <td className="px-4 py-3">
                      <StatusBadge text={c.status} />
                    </td>
                    <td className="px-4 py-3 space-x-2">
                      {c.status === 'Expired' ? (
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
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
