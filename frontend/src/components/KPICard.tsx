import React from 'react';
import type { LucideIcon } from 'lucide-react';

interface KPICardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  trend?: {
    value: string;
    status: 'bad' | 'good' | 'neutral';
  };
  subtext?: string;
  progressVal?: number;
  progressColor?: string;
}

export const KPICard: React.FC<KPICardProps> = ({
  title,
  value,
  icon: Icon,
  trend,
  subtext,
  progressVal,
  progressColor = 'bg-blue-500'
}) => {
  return (
    <div className="card-hover bg-white border border-slate-200 rounded-xl p-5 shadow-sm group">
      <div className="flex items-start justify-between gap-2">
        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider leading-tight">{title}</span>
        <div className="bg-slate-50 p-2 rounded-lg border border-slate-100/80 group-hover:border-blue-200 transition-colors shrink-0">
          <Icon className="h-5 w-5 text-blue-600" />
        </div>
      </div>

      <div className="mt-3 flex items-baseline justify-between gap-2">
        <span className="text-3xl font-black text-slate-900 tracking-tight tabular-nums">{value}</span>
        {trend && (
          <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold border ${
            trend.status === 'bad'
              ? 'bg-rose-50  text-rose-600  border-rose-100/85 '
              : trend.status === 'good'
              ? 'bg-emerald-50  text-emerald-600  border-emerald-100/85 '
              : 'bg-slate-50  text-slate-500  border-slate-200 '
          }`}>
            {trend.value}
          </span>
        )}
      </div>

      {progressVal !== undefined && (
        <div className="mt-3">
          <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
            <div 
              className={`h-full ${progressColor} transition-all duration-500 rounded-full`}
              style={{ width: `${Math.min(Math.max(progressVal, 0), 100)}%` }}
            />
          </div>
        </div>
      )}

      {subtext && (
        <div className="mt-2.5 text-[11px] text-slate-400 font-semibold leading-tight">
          {subtext}
        </div>
      )}
    </div>
  );
};
