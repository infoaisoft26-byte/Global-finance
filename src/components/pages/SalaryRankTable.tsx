import React from 'react';
import { SALARY_RANK_RULES } from '../../data/salaryRules.ts';

export const SalaryRankTable: React.FC<{ currentRank?: string }> = ({ currentRank = 'MEMBER' }) => (
  <div className="space-y-3">
    <div>
      <h3 className="text-sm font-bold uppercase tracking-wider text-cyan-400">Salary Rank Plan</h3>
      <p className="text-[11px] text-slate-500 mt-1">Current rank: <span className="text-amber-300 font-bold">{currentRank.replace(/_/g, ' ')}</span></p>
    </div>
    <div className="rounded-2xl bg-[#091129] border border-blue-500/25 overflow-x-auto">
      <table className="w-full min-w-[760px] text-xs">
        <thead className="bg-[#060b1c] text-slate-400"><tr><th className="p-3 text-left">Rank</th><th className="p-3 text-right">Team Business</th><th className="p-3 text-right">Salary</th><th className="p-3 text-right">Recurring</th><th className="p-3 text-right">Direct IDs</th></tr></thead>
        <tbody>{SALARY_RANK_RULES.map(r => <tr key={r.code} className={`border-t border-blue-500/10 ${currentRank === r.code ? 'bg-amber-500/5' : ''}`}><td className="p-3 font-bold text-white">{r.title}{currentRank === r.code && <span className="ml-2 text-[10px] text-amber-300">CURRENT</span>}</td><td className="p-3 text-right font-mono">{r.teamBusiness.toLocaleString('en-IN')}</td><td className="p-3 text-right text-emerald-400 font-bold">{r.salaryPercent}%</td><td className="p-3 text-right text-cyan-300">{r.recurringPercent}%</td><td className="p-3 text-right">{r.directIds}</td></tr>)}</tbody>
      </table>
    </div>
  </div>
);
