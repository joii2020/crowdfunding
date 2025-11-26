'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useCcc, useSigner } from '@ckb-ccc/connector-react';
import { ccc } from '@ckb-ccc/core';
import ConnectWallet from '@/components/ConnectWallet';
import { getContractConfig } from '@/utils/config';
import { getNetwork } from '@/utils/client';
import { PrjectCellInfo } from 'shared';

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

export default function Home() {
  const network = getNetwork();
  const { claimScript, contributionScript, projectScript } = getContractConfig(network);

  const { client } = useCcc();
  const walletSigner = useSigner();

  const [projects, setProjects] = useState<PrjectCellInfo[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const fallbackSigner = useMemo(() => {
    if (!client || typeof window === 'undefined' || !crypto?.getRandomValues) {
      return undefined;
    }
    const randomBytes = new Uint8Array(32);
    crypto.getRandomValues(randomBytes);
    const privateKey = `0x${Array.from(randomBytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')}`;
    return new ccc.SignerCkbPrivateKey(client as ccc.Client, privateKey);
  }, [client]);

  const activeSigner =
    (walletSigner as unknown as ccc.SignerCkbPrivateKey | undefined) ?? fallbackSigner;
  const usingFallbackSigner = !walletSigner;

  const loadProjects = useCallback(async () => {
    if (!activeSigner) {
      return;
    }
    const requestId = ++requestIdRef.current; // track latest request to avoid stale overwrites
    setLoadingProjects(true);
    setLoadError(null);
    try {
      const infos = await PrjectCellInfo.getAll(activeSigner);
      const sorted = infos
        .map((p, idx) => ({ p, idx }))
        .sort((a, b) => {
          const aPriority = a.p.owner && a.p.status === 'ReadyFinish' ? 0 : 1;
          const bPriority = b.p.owner && b.p.status === 'ReadyFinish' ? 0 : 1;
          if (aPriority !== bPriority) return aPriority - bPriority;
          return a.idx - b.idx; // keep original order otherwise
        })
        .map((item) => item.p);
      if (requestId === requestIdRef.current) {
        setProjects(sorted);
      }
    } catch (err) {
      if (requestId === requestIdRef.current) {
        setLoadError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      if (requestId === requestIdRef.current) {
        setLoadingProjects(false);
      }
    }
  }, [activeSigner]);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

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
            {usingFallbackSigner && (
              <p className="mt-1 text-xs text-amber-700">
                未连接钱包，使用随机 signer 查看公共项目数据，连接后会自动刷新。
              </p>
            )}
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/projects"
              className="rounded-full border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50"
            >
              Go to Projects Page
            </Link>
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
          <button className="rounded-lg bg-slate-900 text-white px-4 py-2 text-sm hover:bg-slate-800">
            Create Project
          </button>
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">All Projects</h2>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <p>Owner/Finish/Destroy buttons are mocked for layout only.</p>
              <button
                onClick={loadProjects}
                className="rounded-full border border-slate-300 px-3 py-1 text-xs hover:bg-slate-50"
              >
                Refresh
              </button>
            </div>
          </div>
          {loadError && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-xs text-amber-800">
              加载失败：{loadError}
            </div>
          )}
          <div className="overflow-hidden rounded-xl border border-slate-200">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50">
                <tr className="text-left text-slate-600">
                  <th className="px-4 py-3 font-medium">ID</th>
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
                    <tr key={p.scriptHash} className="border-t border-slate-200">
                      <td className="px-4 py-3 font-mono text-xs break-all">{p.scriptHash}</td>
                      <td className="px-4 py-3">
                        <span className="font-semibold">{p.raised.toLocaleString()}</span> /{' '}
                        {p.goal.toLocaleString()}
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
                          {p.status === 'ReadyFinish' && p.owner && (
                            <button className="rounded-md bg-emerald-600 px-3 py-1 text-white hover:bg-emerald-500">
                              Finish
                            </button>
                          )}
                          {p.status === 'Expired' && (
                            <button className="rounded-md bg-rose-600 px-3 py-1 text-white hover:bg-rose-500">
                              Destroy
                            </button>
                          )}
                          <Link
                            href={`/projects`}
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

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Your Claims</h2>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            Claims list is not wired yet; connect your wallet to identify your contribution
            cells, then hook it up to the claim logic.
          </div>
        </section>
      </div>
    </div>
  );
}
