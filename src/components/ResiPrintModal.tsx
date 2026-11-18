import React, { useRef } from 'react';
import {
  X,
  Printer,
  Download,
  ExternalLink,
  FileText,
  FolderOpen,
} from 'lucide-react';
import { OrderRecord } from '../types';
import { SENTRA_RESI_DRIVE_FOLDER_URL } from '../utils/googleDriveUpload';

interface ResiPrintModalProps {
  order: OrderRecord | null;
  onClose: () => void;
}

export const ResiPrintModal: React.FC<ResiPrintModalProps> = ({ order, onClose }) => {
  const printFrameRef = useRef<HTMLIFrameElement>(null);

  if (!order) return null;

  const hasUploadedFile = Boolean(order.resiFileData);
  const hasDriveUrl = Boolean(order.drivePrintUrl);

  // Extract Google Drive file ID if drivePrintUrl is a Google Drive link so we can embed preview
  const getDriveEmbedUrl = (url: string): string | null => {
    const match = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (match && match[1]) {
      return `https://drive.google.com/file/d/${match[1]}/preview`;
    }
    return null;
  };

  const driveEmbedUrl = hasDriveUrl ? getDriveEmbedUrl(order.drivePrintUrl) : null;

  const handleDirectPrint = () => {
    if (hasUploadedFile && order.resiFileData) {
      const iframe = printFrameRef.current;
      if (iframe && iframe.contentWindow) {
        const doc = iframe.contentWindow.document;
        doc.open();
        doc.write(`
          <!DOCTYPE html>
          <html>
            <head>
              <title>Cetak Resi - ${order.noPemesanan || order.id}</title>
              <style>
                @page {
                  margin: 4mm;
                  size: auto;
                }
                body {
                  margin: 0;
                  padding: 0;
                  display: flex;
                  justify-content: center;
                  align-items: flex-start;
                  background: #fff;
                }
                img {
                  max-width: 100%;
                  max-height: 98vh;
                  width: auto;
                  height: auto;
                  object-fit: contain;
                }
              </style>
            </head>
            <body>
              <img src="${order.resiFileData}" onload="setTimeout(function(){ window.focus(); window.print(); }, 150);" />
            </body>
          </html>
        `);
        doc.close();
        return;
      }
    }

    if (hasDriveUrl) {
      window.open(order.drivePrintUrl, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-2xl w-full border border-slate-200 shadow-2xl overflow-hidden my-6 animate-scale-up">
        {/* Top Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center shadow-xs">
              <Printer className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <span>Cetak Label Resi Pengiriman</span>
                {order.courier && (
                  <span className="text-[10px] font-semibold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">
                    {order.courier}
                  </span>
                )}
              </h3>
              <p className="text-[11px] text-slate-500 font-mono">
                Order ID: <strong className="text-slate-800">{order.noPemesanan}</strong>
                {order.noResi && order.noResi !== order.noPemesanan && (
                  <> &bull; Resi: <strong className="text-slate-800">{order.noResi}</strong></>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {(hasUploadedFile || hasDriveUrl) && (
              <button
                type="button"
                onClick={handleDirectPrint}
                className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-xs transition-all cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print Resi</span>
              </button>
            )}
            {hasDriveUrl && (
              <a
                href={order.drivePrintUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-2.5 py-1.5 rounded-xl border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-700 font-semibold text-xs flex items-center gap-1 transition-colors"
                title="Buka File Resi di Google Drive"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Drive</span>
              </a>
            )}
            <a
              href={SENTRA_RESI_DRIVE_FOLDER_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 transition-colors"
              title="Buka Folder Google Drive Resi Sentra Naturindo"
            >
              <FolderOpen className="w-4 h-4 text-emerald-700" />
            </a>
            {hasUploadedFile && order.resiFileData && (
              <a
                href={order.resiFileData}
                download={order.resiFileName ? `${order.resiFileName.replace(/\.[a-z]+$/i, '')}.jpg` : `Resi-${order.noPemesanan}.jpg`}
                className="p-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 transition-colors"
                title="Download File Resi"
              >
                <Download className="w-4 h-4" />
              </a>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Order Quick Info Bar */}
        <div className="px-5 py-2.5 bg-emerald-50/70 border-b border-emerald-100 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 text-slate-700">
            <span className="font-semibold text-emerald-950">{order.storeName}</span>
            <span>&bull;</span>
            <span className="font-medium">{order.marketplace}</span>
            <span>&bull;</span>
            <span className="font-bold text-slate-900">
              {order.productsSold} ({order.quantity}x)
            </span>
          </div>
          {order.resiFileName && (
            <span className="text-[11px] text-slate-500 font-mono truncate max-w-[200px]">
              {order.resiFileName}
            </span>
          )}
        </div>

        {/* Main Resi Preview Area */}
        <div className="p-5 bg-slate-100/80 max-h-[72vh] overflow-y-auto flex flex-col items-center justify-center">
          {hasUploadedFile && order.resiFileData ? (
            <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm max-w-full">
              <img
                src={order.resiFileData}
                alt={`Resi ${order.noPemesanan}`}
                className="max-h-[62vh] w-auto mx-auto object-contain rounded"
              />
            </div>
          ) : driveEmbedUrl ? (
            <div className="w-full bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
              <iframe
                src={driveEmbedUrl}
                title={`Resi ${order.noPemesanan}`}
                className="w-full h-[60vh] border-0"
              />
            </div>
          ) : hasDriveUrl ? (
            <div className="py-12 text-center space-y-3">
              <FileText className="w-10 h-10 text-emerald-600 mx-auto" />
              <p className="text-xs text-slate-600">
                File resi tersimpan di tautan eksternal. Klik tombol di bawah untuk membuka & mencetak:
              </p>
              <a
                href={order.drivePrintUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-sm"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Buka File Resi untuk Print</span>
              </a>
            </div>
          ) : (
            <div className="py-12 text-center text-slate-400 text-xs">
              Belum ada file resi yang diunggah untuk order ini.
            </div>
          )}
        </div>

        {/* Hidden iframe used for clean 1-click thermal label printing */}
        <iframe ref={printFrameRef} title="Print Resi Frame" className="hidden" />
      </div>
    </div>
  );
};
