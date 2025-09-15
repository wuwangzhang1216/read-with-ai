import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
// Configure worker using a URL string tied to installed pdfjs-dist
try {
  // @ts-ignore: workerSrc expects a string URL
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.mjs', import.meta.url).toString();
} catch {}

interface PdfJsViewerProps {
  fileBuffer: ArrayBuffer;
  title?: string;
  currentPage?: number | null;
  onPageChange?: (page: number) => void;
  initialScale?: number | 'auto' | 'page-fit' | 'page-width';
  targetPosition?: { page: number; yPercent?: number };
}

const PdfJsViewer: React.FC<PdfJsViewerProps> = ({ fileBuffer, title, currentPage, onPageChange, initialScale = 'page-fit', targetPosition }) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [numPages, setNumPages] = useState(0);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [fitMode, setFitMode] = useState<'width' | 'page'>(() => (initialScale === 'page-fit' ? 'page' : 'width'));
  const onPageChangeRef = useRef<typeof onPageChange>(undefined);
  const containerSizeRef = useRef<{ width: number; height: number }>({ width: 0, height: 0 });
  const [containerSize, setContainerSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const toolbarRef = useRef<HTMLDivElement>(null);
  const pendingYPercentRef = useRef<number | null>(null);

  const scrollToYPercent = (y: number) => {
    const sc = scrollContainerRef.current;
    if (!sc) return;
    const pageEl = sc.querySelector('.react-pdf__page') as HTMLElement | null;
    if (!pageEl) return;
    const stickyH = (toolbarRef.current?.offsetHeight || 0) + 12;
    const scRect = sc.getBoundingClientRect();
    const pageRect = pageEl.getBoundingClientRect();
    const topBase = sc.scrollTop + (pageRect.top - scRect.top) - stickyH;
    const targetTop = topBase + y * pageRect.height;
    const maxTop = Math.max(0, sc.scrollHeight - sc.clientHeight);
    const clamped = Math.max(0, Math.min(maxTop, targetTop));
    sc.scrollTo({ top: clamped, behavior: 'auto' });
  };

  // No-op: worker is configured at module load above

  useEffect(() => {
    onPageChangeRef.current = onPageChange;
  }, [onPageChange]);

  // Track container size for fit calculations
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const apply = (w: number, h: number) => {
      if (w !== containerSizeRef.current.width || h !== containerSizeRef.current.height) {
        containerSizeRef.current = { width: w, height: h };
        setContainerSize({ width: w, height: h });
      }
    };
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        const cr = entry.contentRect;
        apply(cr.width, cr.height);
      }
    });
    ro.observe(el);
    // Initialize once on next frame to wait for layout
    requestAnimationFrame(() => {
      const rect = el.getBoundingClientRect();
      apply(rect.width, rect.height);
    });
    return () => ro.disconnect();
  }, []);

  // Handle external navigation requests
  useEffect(() => {
    if (!currentPage) return;
    setPage(currentPage);
    // In single-page mode, just reset scroll to top on navigation
    try { scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'auto' }); } catch {}
  }, [currentPage]);

  // Handle target position navigation with optional y offset
  useEffect(() => {
    if (!targetPosition) return;
    const { page: p, yPercent } = targetPosition;
    if (typeof p === 'number' && p > 0) {
      setPage(p);
      // Normalize yPercent to 0..1
      let yNorm: number | null = null;
      if (typeof yPercent === 'number') {
        yNorm = yPercent > 1 ? Math.max(0, Math.min(1, yPercent / 100)) : Math.max(0, Math.min(1, yPercent));
      }
      pendingYPercentRef.current = yNorm;
      try { scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'auto' }); } catch {}
      // If the requested page is already rendered, attempt immediate scroll
      if (yNorm !== null) {
        requestAnimationFrame(() => {
          try { scrollToYPercent(yNorm!); } catch {}
        });
      }
    }
  }, [targetPosition?.page, targetPosition?.yPercent]);

  // When page changes internally, notify parent
  useEffect(() => {
    const cb = onPageChangeRef.current;
    if (cb) cb(page);
  }, [page]);

  // Removed scroll-driven page detection: single-page mode only

  const zoomStep = 0.1;
  const zoomIn = () => setZoom(z => Math.min(Number((z + zoomStep).toFixed(2)), 3));
  const zoomOut = () => setZoom(z => Math.max(Number((z - zoomStep).toFixed(2)), 0.25));
  const applyFit = (mode: 'width' | 'page') => setFitMode(mode);
  const goToPage = (n: number) => {
    const clamped = Math.max(1, Math.min(numPages || 1, Math.floor(n)));
    setPage(clamped);
    // Reset scroll position to top for new page
    try { scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'auto' }); } catch {}
  };
  // No per-page refs needed in single-page mode

  // Compute width/height props for Page based on fit mode
  const pageRenderProps = useMemo(() => {
    const { width, height } = containerSize;
    if (fitMode === 'page') {
      // Fit whole page height; apply zoom as a multiplier via scale
      const target = Math.max(200, height - 120); // leave room for toolbar
      return { height: Math.floor(target), scale: zoom } as const;
    }
    // Fit width (default)
    const target = Math.max(320, Math.floor(width - 32));
    return { width: target, scale: zoom } as const;
  }, [fitMode, zoom, containerSize.width, containerSize.height]);

  // Create a stable reference to the file buffer
  const [fileSource, setFileSource] = useState<{ data: ArrayBuffer } | null>(null);

  useEffect(() => {
    if (!fileBuffer) {
      console.error('No fileBuffer provided to PdfJsViewer');
      setFileSource(null);
      return;
    }

    // Check if buffer is valid before trying to use it
    try {
      // Test if buffer is detached by trying to get its byteLength
      const length = fileBuffer.byteLength;
      if (length > 0) {
        // Create a copy to avoid detachment issues
        const bufferCopy = fileBuffer.slice(0);
        setFileSource({ data: bufferCopy });
      } else {
        console.error('FileBuffer has zero length');
        setFileSource(null);
      }
    } catch (e) {
      console.error('FileBuffer may be detached or invalid:', e);
      setFileSource(null);
    }
  }, [fileBuffer]);

  return (
    <div
      ref={scrollContainerRef}
      className="pdfViewerContainer"
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'auto',
        backgroundColor: 'var(--bg-secondary)'
      }}
    >
      <div
        ref={toolbarRef}
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
            –
          </button>
          <span style={{ minWidth: 48, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{Math.round((zoom || 1) * 100)}%</span>
          <button onClick={zoomIn} title="Zoom in" style={{ padding: '4px 8px', borderRadius: 8, background: 'transparent', color: 'inherit', border: '1px solid rgba(255,255,255,0.15)' }}>
            +
          </button>

          <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.12)', margin: '0 6px' }} />

          <button onClick={() => applyFit('page')} title="Fit page" style={{ padding: '4px 10px', borderRadius: 8, background: 'transparent', color: 'inherit', border: '1px solid rgba(255,255,255,0.15)' }}>
            Fit
          </button>
          <button onClick={() => applyFit('width')} title="Fit width" style={{ padding: '4px 10px', borderRadius: 8, background: 'transparent', color: 'inherit', border: '1px solid rgba(255,255,255,0.15)' }}>
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
          <span style={{ opacity: 0.85 }}>/ {numPages || 0}</span>
          <button onClick={() => goToPage((page || 1) + 1)} title="Next page" style={{ padding: '4px 8px', borderRadius: 8, background: 'transparent', color: 'inherit', border: '1px solid rgba(255,255,255,0.15)' }}>
            ›
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '12px 0 40px 0' }} aria-label={title || 'PDF Document'}>
        {!fileSource ? (
          <div style={{ color: 'var(--accent-red)', padding: '24px' }}>
            No PDF file available. The translated version may not have the original PDF attached.
          </div>
        ) : !containerSize.width || !containerSize.height ? (
          <div style={{ color: 'var(--text-secondary)', padding: '24px' }}>Preparing viewer…</div>
        ) : (
        <Document
          key={fileSource ? 'pdf-loaded' : 'pdf-empty'} // Stable key to prevent re-renders
          file={fileSource}
          onLoadSuccess={(info) => setNumPages(info.numPages || 0)}
          onLoadError={(err) => console.error('Failed to load PDF with react-pdf:', err)}
          loading={<div style={{ color: 'var(--text-secondary)' }}>Loading PDF…</div>}
          error={<div style={{ color: 'var(--accent-red)' }}>Failed to load PDF.</div>}
        >
          <div key={page} style={{ margin: '8px 0' }}>
            <Page
              pageNumber={page}
              renderTextLayer
              renderAnnotationLayer
              className="react-pdf__page"
              loading={<div style={{ color: 'var(--text-secondary)' }}>Rendering page {page}…</div>}
              onRenderError={(err) => console.error(`Failed to render page ${page}:`, err)}
              onRenderSuccess={() => {
                const y = pendingYPercentRef.current;
                if (y === null || typeof y === 'undefined') return;
                try { scrollToYPercent(y); } finally { pendingYPercentRef.current = null; }
              }}
              {...pageRenderProps}
            />
          </div>
        </Document>
        )}
      </div>
    </div>
  );
};

export default PdfJsViewer;
