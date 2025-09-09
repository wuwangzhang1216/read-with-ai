import React, { useEffect, useRef, useState } from 'react';
import 'pdfjs-dist/web/pdf_viewer.css';

// PDF.js core and viewer imports
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy } from 'pdfjs-dist';
// Vite worker URL for PDF.js worker
// @ts-ignore - Vite query suffix types
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?worker&url';
// @ts-ignore - pdfjs viewer types are not exported with typings
import { EventBus, PDFLinkService, PDFViewer } from 'pdfjs-dist/web/pdf_viewer';

interface PdfJsViewerProps {
  fileBuffer: ArrayBuffer;
  title?: string;
  currentPage?: number | null;
  onPageChange?: (page: number) => void;
  initialScale?: number | 'auto' | 'page-fit' | 'page-width';
}

const PdfJsViewer: React.FC<PdfJsViewerProps> = ({ fileBuffer, title, currentPage, onPageChange, initialScale = 'page-fit' }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<HTMLDivElement>(null);
  const pdfViewerRef = useRef<any>(null);
  const eventBusRef = useRef<any>(null);
  const linkServiceRef = useRef<any>(null);
  const pdfDocRef = useRef<PDFDocumentProxy | null>(null);
  const [scale, setScale] = useState<number>(1);
  const [page, setPage] = useState<number>(1);
  const [pageCount, setPageCount] = useState<number>(0);
  const onPageChangeRef = useRef<typeof onPageChange>();

  useEffect(() => {
    onPageChangeRef.current = onPageChange;
  }, [onPageChange]);

  useEffect(() => {
    // Configure worker (via URL so PDF.js can spawn it itself)
    try {
      // @ts-ignore: workerSrc expects a string URL
      GlobalWorkerOptions.workerSrc = pdfjsWorker;
    } catch {}

    const container = containerRef.current!;
    const viewer = viewerRef.current!;

    const eventBus = new EventBus();
    const linkService = new PDFLinkService({ eventBus });
    const pdfViewer = new PDFViewer({
      container,
      viewer,
      eventBus,
      linkService,
      // Enable text layer for selectable text
      textLayerMode: 2,
      enablePrintAutoRotate: true,
    });
    linkService.setViewer(pdfViewer);

    eventBus.on('pagesinit', () => {
      // Set a more comfortable initial scale (fit the whole page by default)
      try { (pdfViewer as any).currentScaleValue = initialScale; } catch {}
      try { setScale((pdfViewer as any).currentScale || 1); } catch {}
    });
    eventBus.on('pagechanging', (evt: any) => {
      const cb = onPageChangeRef.current;
      if (cb && typeof evt?.pageNumber === 'number') {
        cb(evt.pageNumber);
      }
      if (typeof evt?.pageNumber === 'number') {
        setPage(evt.pageNumber);
      }
    });
    // Track scale changes if the viewer dispatches them
    eventBus.on?.('scalechanging' as any, (evt: any) => {
      if (typeof evt?.scale === 'number') setScale(evt.scale);
      else try { setScale((pdfViewer as any).currentScale || 1); } catch {}
    });

    pdfViewerRef.current = pdfViewer;
    eventBusRef.current = eventBus;
    linkServiceRef.current = linkService;

    // Load the document from ArrayBuffer
    // Clone the ArrayBuffer so React StrictMode + worker transfer won't detach the original
    let data: Uint8Array | null = null;
    try {
      const src = new Uint8Array(fileBuffer); // views are okay; we copy next
      data = new Uint8Array(src.byteLength);
      data.set(src);
    } catch (e) {
      console.error('Unable to clone PDF ArrayBuffer:', e);
      return () => {};
    }

    let destroyed = false;
    const loadingTask = getDocument({ data });
    loadingTask.promise.then((pdf) => {
      if (destroyed) return;
      pdfDocRef.current = pdf;
      pdfViewer.setDocument(pdf);
      linkService.setDocument(pdf);
      try { setPageCount(pdf.numPages || 0); } catch {}
    }).catch((err) => {
      // Suppress noise when we explicitly destroyed during StrictMode double-invoke
      if (destroyed && /Worker was destroyed|terminated/i.test(String(err?.message || err))) {
        return;
      }
      console.error('Failed to load PDF with pdf.js:', err);
    });

    const handleResize = () => {
      // Notify viewer on container resize
      try { (eventBus as any).dispatch('resize', {}); } catch {}
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      destroyed = true;
      try { loadingTask.destroy(); } catch {}
      try { pdfViewer.cleanup(); } catch {}
      try { pdfViewer.setDocument(null); } catch {}
      pdfDocRef.current = null;
    };
  }, [fileBuffer, initialScale]);

  // Respond to external page navigation requests
  useEffect(() => {
    if (!currentPage || !pdfViewerRef.current) return;
    try {
      (pdfViewerRef.current as any).currentPageNumber = currentPage;
    } catch {}
  }, [currentPage]);

  // Text selection helper: expose selected text via CustomEvent for parent if needed
  // We keep selection handling in the parent (Reader) since it manages the popup.

  // Toolbar actions
  const applyScale = (value: number | 'page-fit' | 'page-width' | 'auto') => {
    const v = pdfViewerRef.current as any;
    if (!v) return;
    try {
      (v as any).currentScaleValue = value as any;
      setScale((v as any).currentScale || (typeof value === 'number' ? value : 1));
    } catch {}
  };
  const zoomStep = 0.1;
  const zoomIn = () => {
    const v = pdfViewerRef.current as any;
    if (!v) return;
    const next = Math.min((v.currentScale || scale) + zoomStep, 3);
    applyScale(Number(next.toFixed(2)));
  };
  const zoomOut = () => {
    const v = pdfViewerRef.current as any;
    if (!v) return;
    const next = Math.max((v.currentScale || scale) - zoomStep, 0.25);
    applyScale(Number(next.toFixed(2)));
  };
  const goToPage = (num: number) => {
    const v = pdfViewerRef.current as any;
    if (!v) return;
    const clamped = Math.max(1, Math.min(pageCount || 1, Math.floor(num)));
    try { v.currentPageNumber = clamped; setPage(clamped); } catch {}
  };

  return (
    <div
      ref={containerRef}
      className="pdfViewerContainer"
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'auto',
        backgroundColor: 'var(--bg-secondary)'
      }}
    >
      {/* Elegant compact toolbar */}
      <div
        style={{
          position: 'sticky',
          top: 12,
          zIndex: 65,
          display: 'flex',
          justifyContent: 'flex-end'
        }}
      >
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 10px',
            borderRadius: 12,
            background: 'rgba(52, 73, 94, 0.85)',
            color: 'var(--text-light)',
            border: '1px solid rgba(255,255,255,0.12)',
            boxShadow: '0 8px 18px rgba(0,0,0,0.18)'
          }}
        >
          <button onClick={zoomOut} title="Zoom out" style={{ padding: '4px 8px', borderRadius: 8, background: 'transparent', color: 'inherit', border: '1px solid rgba(255,255,255,0.15)' }}>
            −
          </button>
          <span style={{ minWidth: 48, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{Math.round((scale || 1) * 100)}%</span>
          <button onClick={zoomIn} title="Zoom in" style={{ padding: '4px 8px', borderRadius: 8, background: 'transparent', color: 'inherit', border: '1px solid rgba(255,255,255,0.15)' }}>
            +
          </button>

          <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.12)', margin: '0 6px' }} />

          <button onClick={() => applyScale('page-fit')} title="Fit page" style={{ padding: '4px 10px', borderRadius: 8, background: 'transparent', color: 'inherit', border: '1px solid rgba(255,255,255,0.15)' }}>
            Fit
          </button>
          <button onClick={() => applyScale('page-width')} title="Fit width" style={{ padding: '4px 10px', borderRadius: 8, background: 'transparent', color: 'inherit', border: '1px solid rgba(255,255,255,0.15)' }}>
            Width
          </button>

          <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.12)', margin: '0 6px' }} />

          <button onClick={() => goToPage((page || 1) - 1)} title="Previous page" style={{ padding: '4px 8px', borderRadius: 8, background: 'transparent', color: 'inherit', border: '1px solid rgba(255,255,255,0.15)' }}>
            ‹
          </button>
          <input
            value={page || 1}
            onChange={(e) => {
              const v = e.currentTarget.value.replace(/[^0-9]/g, '');
              const n = Number(v || '1');
              setPage(n);
            }}
            onBlur={() => goToPage(page || 1)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                (e.currentTarget as HTMLInputElement).blur();
              }
            }}
            title="Page number"
            style={{ width: 40, textAlign: 'center', borderRadius: 6, border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.1)', color: 'inherit', padding: '2px 4px' }}
          />
          <span style={{ opacity: 0.85 }}>/ {pageCount || 0}</span>
          <button onClick={() => goToPage((page || 1) + 1)} title="Next page" style={{ padding: '4px 8px', borderRadius: 8, background: 'transparent', color: 'inherit', border: '1px solid rgba(255,255,255,0.15)' }}>
            ›
          </button>
        </div>
      </div>

      <div ref={viewerRef} className="pdfViewer" style={{ position: 'relative' }} aria-label={title || 'PDF Document'} />
    </div>
  );
};

export default PdfJsViewer;
