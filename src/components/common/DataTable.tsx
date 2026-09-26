import React, { useState, useMemo } from 'react';
import { 
  Search, 
  RotateCcw, 
  RefreshCw, 
  Copy, 
  FileSpreadsheet, 
  FileText, 
  Printer, 
  ChevronLeft, 
  ChevronRight,
  Check
} from 'lucide-react';

export interface Column<T> {
  key: string;
  header: string;
  render?: (item: T, index: number) => React.ReactNode;
  accessor?: (item: T) => any;
  sortable?: boolean;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  title?: string;
  onRefresh?: () => void;
  isLoading?: boolean;
  emptyMessage?: string;
}

export function DataTable<T extends Record<string, any>>({
  columns,
  data,
  title,
  onRefresh,
  isLoading = false,
  emptyMessage = "No matching records found"
}: DataTableProps<T>) {
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [copied, setCopied] = useState(false);

  // Filtered data based on search
  const filteredData = useMemo(() => {
    if (!searchTerm.trim()) return data;
    const term = searchTerm.toLowerCase();

    return data.filter((item) => {
      return Object.values(item).some((val) => {
        if (val === null || val === undefined) return false;
        return String(val).toLowerCase().includes(term);
      });
    });
  }, [data, searchTerm]);

  // Pagination calculation
  const totalEntries = filteredData.length;
  const totalPages = Math.ceil(totalEntries / pageSize) || 1;
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalEntries);
  const currentRows = useMemo(() => {
    return filteredData.slice(startIndex, endIndex);
  }, [filteredData, startIndex, endIndex]);

  // Reset filter
  const handleReset = () => {
    setSearchTerm('');
    setCurrentPage(1);
  };

  // Copy table to clipboard
  const handleCopy = () => {
    const headers = columns.map(c => c.header).join('\t');
    const rows = filteredData.map(item => {
      return columns.map(col => {
        if (col.accessor) return String(col.accessor(item) ?? '');
        return String(item[col.key] ?? '');
      }).join('\t');
    }).join('\n');

    const fullText = `${headers}\n${rows}`;
    navigator.clipboard.writeText(fullText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Export to Excel / CSV
  const handleExportCsv = () => {
    const headers = columns.map(c => `"${c.header.replace(/"/g, '""')}"`).join(',');
    const rows = filteredData.map(item => {
      return columns.map(col => {
        const val = col.accessor ? col.accessor(item) : item[col.key];
        return `"${String(val ?? '').replace(/"/g, '""')}"`;
      }).join(',');
    }).join('\n');

    const csvContent = "data:text/csv;charset=utf-8," + encodeURIComponent(`${headers}\n${rows}`);
    const link = document.createElement("a");
    link.setAttribute("href", csvContent);
    link.setAttribute("download", `${title ? title.toLowerCase().replace(/\s+/g, '_') : 'global_finance'}_report.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Export to PDF / Formatted text
  const handleExportPdf = () => {
    // Open printable pop-up formatted view
    window.print();
  };

  // Print view
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="bg-[#0b132b]/80 border border-blue-500/20 rounded-xl overflow-hidden shadow-xl backdrop-blur-md data-table-container">
      {/* Top Action Toolbar */}
      <div className="p-4 sm:p-5 border-b border-blue-500/20 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4 no-print">
        {/* Left: Export Buttons */}
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          <button
            onClick={handleCopy}
            title="Copy to clipboard"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-[#142044] hover:bg-[#1c2c5c] text-slate-200 border border-blue-500/30 transition-colors shadow-sm"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-cyan-400" />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>

          <button
            onClick={handleExportCsv}
            title="Export CSV / Excel"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-[#142044] hover:bg-[#1c2c5c] text-slate-200 border border-blue-500/30 transition-colors shadow-sm"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
            <span>Excel</span>
          </button>

          <button
            onClick={handleExportPdf}
            title="Export to PDF"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-[#142044] hover:bg-[#1c2c5c] text-slate-200 border border-blue-500/30 transition-colors shadow-sm"
          >
            <FileText className="w-3.5 h-3.5 text-rose-400" />
            <span>PDF</span>
          </button>

          <button
            onClick={handlePrint}
            title="Print Table"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-[#142044] hover:bg-[#1c2c5c] text-slate-200 border border-blue-500/30 transition-colors shadow-sm"
          >
            <Printer className="w-3.5 h-3.5 text-blue-400" />
            <span>Print</span>
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

        {/* Right: Search & Page size */}
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

      {/* Table Title on Print */}
      {title && (
        <div className="hidden print-only p-4 border-b border-gray-200">
          <h2 className="text-xl font-bold text-gray-800">GLOBAL FINANCE - {title}</h2>
          <p className="text-sm text-gray-500">Generated on {new Date().toLocaleString()}</p>
        </div>
      )}

      {/* Table Content */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-[#0f1b40] border-b border-blue-500/30 text-xs font-semibold text-cyan-300 uppercase tracking-wider">
              <th className="py-3.5 px-4 text-center w-12 text-slate-400">#</th>
              {columns.map((col) => (
                <th key={col.key} className="py-3.5 px-4 whitespace-nowrap">
                  {col.header}
                </th>
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
                    <button
                      onClick={handleReset}
                      className="mt-2 text-xs text-cyan-400 hover:underline"
                    >
                      Clear search filter
                    </button>
                  )}
                </td>
              </tr>
            ) : (
              currentRows.map((item, rowIdx) => {
                const globalIndex = startIndex + rowIdx + 1;
                return (
                  <tr 
                    key={item.id || globalIndex} 
                    className="hover:bg-[#121e48]/70 transition-colors"
                  >
                    <td className="py-3.5 px-4 text-center text-xs text-slate-500 font-mono">
                      {globalIndex}
                    </td>
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

      {/* Pagination Footer */}
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

          {/* Page numbers */}
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
