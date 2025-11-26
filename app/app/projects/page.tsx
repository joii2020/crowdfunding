'use client';

import Link from 'next/link';
import ConnectWallet from '@/components/ConnectWallet';
import { getNetwork } from '@/utils/client';

const project = {
  id: 'proj-xxxx',
  raised: 12000,
  goal: 20000,
  deadline: '2024-08-01 12:00',
  status: 'Active',
  owner: true,
};

const contributions = [
  { tx: 'tx1:0', amount: 3000, time: '2024-05-01 08:00', status: 'Live' },
  { tx: 'tx2:1', amount: 2000, time: '2024-05-02 09:30', status: 'Live' },
  { tx: 'tx3:0', amount: 7000, time: '2024-05-05 10:15', status: 'Pending Merge' },
];

const claims = [
  { amount: 1000, deadline: '2024-08-01 12:00', status: 'Active' },
  { amount: 2500, deadline: '2024-06-01 09:00', status: 'Expired' },
];

function StatusBadge({ text }: { text: string }) {
  const base =
    'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold border border-transparent';
  const styles: Record<string, string> = {
    Active: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    'Ready to Finish': 'bg-amber-50 text-amber-700 border-amber-200',
    'Pending Merge': 'bg-amber-50 text-amber-700 border-amber-200',
    Expired: 'bg-rose-50 text-rose-700 border-rose-200',
    Live: 'bg-slate-100 text-slate-700 border-slate-200',
  };
  return <span className={`${base} ${styles[text] ?? ''}`}>{text}</span>;
}

export default function ProjectsPage() {
  const network = getNetwork();

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
              <p className="text-sm text-muted-foreground">Project Detail (Demo)</p>
              <h1 className="text-3xl font-bold">Project {project.id}</h1>
              <p className="text-xs text-muted-foreground mt-1">
                Network: <span className="font-mono">{network}</span>
              </p>
            </div>
          </div>
          <ConnectWallet />
        </header>

        <section className="rounded-xl border border-slate-200 bg-slate-50/60 p-5 space-y-3">
          <div className="flex items-center gap-3">
            <StatusBadge text={project.status} />
            {project.owner && (
              <span className="rounded-full bg-slate-900 text-white px-2 py-0.5 text-xs">
                Owner
              </span>
            )}
          </div>
          <div className="text-lg font-semibold">
            Raised / Goal:{' '}
            <span className="font-mono">{project.raised.toLocaleString()}</span> /{' '}
            <span className="font-mono">{project.goal.toLocaleString()}</span> CKB
          </div>
          <p className="text-sm text-slate-700">
            Deadline: <span className="font-mono">{project.deadline}</span>
          </p>
          <div className="flex flex-wrap gap-3">
            <button className="rounded-lg bg-emerald-600 text-white px-4 py-2 text-sm hover:bg-emerald-500">
              Finish
            </button>
            <button className="rounded-lg bg-rose-600 text-white px-4 py-2 text-sm hover:bg-rose-500">
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
              <button className="rounded-md border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50">
                Merge Selected
              </button>
            </div>
          </div>
          <div className="overflow-hidden rounded-xl border border-slate-200">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-medium">Tx/Index</th>
                  <th className="px-4 py-3 font-medium">Amount (CKB)</th>
                  <th className="px-4 py-3 font-medium">Created</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Select</th>
                </tr>
              </thead>
              <tbody>
                {contributions.map((c) => (
                  <tr key={c.tx} className="border-t border-slate-200">
                    <td className="px-4 py-3 font-mono text-xs">{c.tx}</td>
                    <td className="px-4 py-3">{c.amount.toLocaleString()}</td>
                    <td className="px-4 py-3 text-xs text-slate-600">{c.time}</td>
                    <td className="px-4 py-3">
                      <StatusBadge text={c.status} />
                    </td>
                    <td className="px-4 py-3">
                      <input type="checkbox" className="h-4 w-4" />
                    </td>
                  </tr>
                ))}
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
