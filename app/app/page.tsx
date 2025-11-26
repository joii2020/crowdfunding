'use client';

import Link from 'next/link';
import ConnectWallet from '@/components/ConnectWallet';
import { getContractConfig } from '@/utils/config';
import { getNetwork } from '@/utils/client';

const sampleProjects = [
  {
    id: 'proj-xxxx',
    raised: 12000,
    goal: 20000,
    deadline: '2024-08-01 12:00',
    status: 'Active',
    owner: true,
    readyToFinish: false,
  },
  {
    id: 'proj-yyyy',
    raised: 25000,
    goal: 20000,
    deadline: '2024-07-15 10:00',
    status: 'ReadyFinish',
    owner: false,
    readyToFinish: true,
  },
  {
    id: 'proj-zzzz',
    raised: 5000,
    goal: 10000,
    deadline: '2024-06-01 09:00',
    status: 'Expired',
    owner: false,
    readyToFinish: false,
  },
];

const sampleClaims = [
  { projectId: 'proj-xxxx', amount: 1000, deadline: '2024-08-01 12:00', status: 'Active' },
  { projectId: 'proj-zzzz', amount: 2500, deadline: '2024-06-01 09:00', status: 'Expired' },
];

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

export default function Home() {
  const network = getNetwork();
  const { claimScript, contributionScript, projectScript } = getContractConfig(network);

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
            <p className="text-xs text-muted-foreground">
              Owner/Finish/Destroy buttons are mocked for layout only.
            </p>
          </div>
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
                {sampleProjects.map((p) => (
                  <tr key={p.id} className="border-t border-slate-200">
                    <td className="px-4 py-3 font-mono text-xs">{p.id}</td>
                    <td className="px-4 py-3">
                      <span className="font-semibold">{p.raised.toLocaleString()}</span>{' '}
                      / {p.goal.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">{p.deadline}</td>
                    <td className="px-4 py-3">
                      <StatusBadge text={p.status} />
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {p.owner ? (
                        <span className="rounded-full bg-slate-900 text-white px-2 py-0.5">
                          Owner
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-4 py-3 space-x-2">
                      {p.readyToFinish && (
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
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Your Claims</h2>
          <div className="overflow-hidden rounded-xl border border-slate-200">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-medium">Project ID</th>
                  <th className="px-4 py-3 font-medium">Amount (CKB)</th>
                  <th className="px-4 py-3 font-medium">Deadline</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sampleClaims.map((c) => (
                  <tr key={`${c.projectId}-${c.deadline}`} className="border-t border-slate-200">
                    <td className="px-4 py-3 font-mono text-xs">{c.projectId}</td>
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
