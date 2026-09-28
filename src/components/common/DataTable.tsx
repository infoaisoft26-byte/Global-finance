import React, { useState, useMemo } from 'react';
import {
  Search,
  RotateCcw,
  RefreshCw,
  FileText,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';

export interface Column<T> {
  key: string;
  header: string;
  render?: (item: T, index: number) => React.ReactNode;
  accessor?: (item: T) => any;
  pdfAccessor?: (item: T, index: number) => any;
  pdfHeader?: string;
  sortable?: boolean;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  title?: string;
  onRefresh?: () => void;
  isLoading?: boolean;
  emptyMessage?: string;
  pdfDocumentTitle?: string;
}

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatPdfValue(value: unknown) {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}

export function DataTable<T extends Record<string, any>>({
  columns,
  data,
  title,
  onRefresh,
  isLoading = false,
  emptyMessage = 'No matching records found',
  pdfDocumentTitle = 'Member Dashboard - Global Finance'
}: DataTableProps<T>) {
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const filteredData = useMemo(() => {
    if (!searchTerm.trim()) return data;
    const term = searchTerm.toLowerCase();
    return data.filter((item) => Object.values(item).some((val) => {
      if (val === null || val === undefined) return false;
      return String(val).toLowerCase().includes(term);
    }));
  }, [data, searchTerm]);

  const totalEntries = filteredData.length;
  const totalPages = Math.ceil(totalEntries / pageSize) || 1;
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalEntries);
  const currentRows = useMemo(
    () => filteredData.slice(startIndex, endIndex),
    [filteredData, startIndex, endIndex]
  );

  const handleReset = () => {
    setSearchTerm('');
    setCurrentPage(1);
  };

  const handleExportPdf = () => {
    const popup = window.open('', '_blank', 'noopener,noreferrer,width=1000,height=760');
    if (!popup) {
      window.alert('Please allow pop-ups to download the PDF report.');
      return;
    }

    const headers = ['Sr', ...columns.map(col => col.pdfHeader || col.header)];
    const rows = filteredData.map((item, index) => {
      const values = columns.map(col => {
        const value = col.pdfAccessor
          ? col.pdfAccessor(item, index + 1)
          : col.accessor
            ? col.accessor(item)
            : item[col.key];
        return formatPdfValue(value);
      });
      return [String(index + 1), ...values];
    });

    const headerHtml = headers.map(h => `<th>${escapeHtml(h)}</th>`).join('');
    const bodyHtml = rows.length
      ? rows.map(row => `<tr>${row.map(cell => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('')
      : `<tr><td colspan="${headers.length}" class="empty">No records found</td></tr>`;

    const safeFileName = (title || 'member_report')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'member_report';

    popup.document.open();
    popup.document.write(`<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title || 'Member Report')}</title>
<style>
  @page { size: A4 landscape; margin: 16mm; }
  * { box-sizing: border-box; }
  body { margin: 0; color: #111; background: #fff; font-family: Arial, Helvetica, sans-serif; }
  .sheet { width: 100%; padding-top: 8mm; }
  h1 { margin: 0 0 12mm; text-align: center; font-size: 20px; font-weight: 500; }
  .report-name { text-align: center; font-size: 11px; color: #555; margin-top: -8mm; margin-bottom: 8mm; }
  table { width: 100%; border-collapse: collapse; table-layout: auto; }
  th { font-size: 12px; font-weight: 700; text-align: left; padding: 7px 8px; white-space: nowrap; border-bottom: 1px solid #222; }
  td { font-size: 11px; padding: 7px 8px; vertical-align: top; border-bottom: 1px solid #ddd; word-break: break-word; }
  .empty { text-align: center; padding: 24px; color: #666; }
  .actions { margin-top: 18px; text-align: center; }
  .actions button { border: 0; border-radius: 6px; padding: 10px 18px; font-size: 13px; cursor: pointer; background: #111827; color: #fff; }
  @media print {
    .actions, .report-name { display: none !important; }
    h1 { margin-bottom: 12mm; }
    thead { display: table-header-group; }
    tr { break-inside: avoid; }
  }
</style>
</head>
<body>
  <div class="sheet">
    <h1>${escapeHtml(pdfDocumentTitle)}</h1>
    ${title ? `<div class="report-name">${escapeHtml(title)}</div>` : ''}
    <table>
      <thead><tr>${headerHtml}</tr></thead>
      <tbody>${bodyHtml}</tbody>
    </table>
    <div class="actions"><button onclick="window.print()">Save / Download PDF</button></div>
  </div>
<script>
  document.title = '${safeFileName}_report';
  setTimeout(function () { window.print(); }, 250);
</script>
</body>
</html>`);
    popup.document.close();
  };

  return (
    <div className="bg-[#0b132b]/80 border border-blue-500/20 rounded-xl overflow-hidden shadow-xl backdrop-blur-md data-table-container">
      <div className="p-4 sm:p-5 border-b border-blue-500/20 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4 no-print">
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          <button
            onClick={handleExportPdf}
            title="Download PDF"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-[#142044] hover:bg-[#1c2c5c] text-slate-200 border border-blue-500/30 transition-colors shadow-sm"
          >
            <FileText className="w-3.5 h-3.5 text-rose-400" />
            <span>Download PDF</span>
          </button>

          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={isLoading}
              title="Refresh Data"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-[#142044] hover:bg-[#1c2c5c] text-slate-200 border border-blue-500/30 transition-colors shadow-sm disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-amber-400 ${isLoading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          )}

          <button
            onClick={handleReset}
            title="Reset Filters"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-[#142044] hover:bg-[#1c2c5c] text-slate-200 border border-blue-500/30 transition-colors shadow-sm"
          >
            <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
            <span>Reset</span>
          </button>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span>Show</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="bg-[#0e1738] border border-blue-500/30 text-slate-200 rounded-md px-2 py-1 text-xs focus:outline-none focus:border-cyan-400"
            >
              <option value={5}>5</option>
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
            <span>entries</span>
          </div>

          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search records..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full sm:w-64 pl-9 pr-3 py-1.5 text-xs rounded-lg bg-[#0e1738] border border-blue-500/30 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-400 transition-colors"
            />
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-[#0f1b40] border-b border-blue-500/30 text-xs font-semibold text-cyan-300 uppercase tracking-wider">
              <th className="py-3.5 px-4 text-center w-12 text-slate-400">#</th>
              {columns.map((col) => (
                <th key={col.key} className="py-3.5 px-4 whitespace-nowrap">{col.header}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-blue-500/10 text-xs sm:text-sm text-slate-300">
            {isLoading ? (
              <tr>
                <td colSpan={columns.length + 1} className="py-12 text-center text-slate-400">
                  <div className="flex items-center justify-center gap-2">
                    <RefreshCw className="w-5 h-5 animate-spin text-cyan-400" />
                    <span>Loading data from secure ledger...</span>
                  </div>
                </td>
              </tr>
            ) : currentRows.length === 0 ? (
              <tr>
                <td colSpan={columns.length + 1} className="py-12 text-center text-slate-400">
                  <p className="text-sm">{emptyMessage}</p>
                  {searchTerm && (
                    <button onClick={handleReset} className="mt-2 text-xs text-cyan-400 hover:underline">Clear search filter</button>
                  )}
                </td>
              </tr>
            ) : (
              currentRows.map((item, rowIdx) => {
                const globalIndex = startIndex + rowIdx + 1;
                return (
                  <tr key={item.id || globalIndex} className="hover:bg-[#121e48]/70 transition-colors">
                    <td className="py-3.5 px-4 text-center text-xs text-slate-500 font-mono">{globalIndex}</td>
                    {columns.map((col) => (
                      <td key={col.key} className="py-3.5 px-4">
                        {col.render
                          ? col.render(item, globalIndex)
                          : col.accessor
                            ? col.accessor(item)
                            : String(item[col.key] ?? '—')}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="p-4 border-t border-blue-500/20 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400 no-print">
        <div>
          Showing <span className="font-semibold text-slate-200">{totalEntries === 0 ? 0 : startIndex + 1}</span> to{' '}
          <span className="font-semibold text-slate-200">{endIndex}</span> of{' '}
          <span className="font-semibold text-slate-200">{totalEntries}</span> entries
          {searchTerm && ` (filtered from ${data.length} total entries)`}
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
            disabled={currentPage === 1}
            className="flex items-center justify-center p-1.5 rounded-lg border border-blue-500/20 bg-[#101b3d] text-slate-300 hover:bg-[#18295c] disabled:opacity-30 disabled:pointer-events-none transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
            let pageNum = i + 1;
            if (totalPages > 5 && currentPage > 3) {
              pageNum = currentPage - 2 + i;
              if (pageNum > totalPages) pageNum = totalPages - (4 - i);
            }
            return (
              <button
                key={pageNum}
                onClick={() => setCurrentPage(pageNum)}
                className={`min-w-8 h-8 px-2 rounded-lg font-medium text-xs transition-colors ${
                  currentPage === pageNum
                    ? 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white font-bold shadow-md shadow-cyan-900/30'
                    : 'border border-blue-500/20 bg-[#101b3d] text-slate-300 hover:bg-[#18295c]'
                }`}
              >
                {pageNum}
              </button>
            );
          })}

          <button
            onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
            disabled={currentPage >= totalPages}
            className="flex items-center justify-center p-1.5 rounded-lg border border-blue-500/20 bg-[#101b3d] text-slate-300 hover:bg-[#18295c] disabled:opacity-30 disabled:pointer-events-none transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
