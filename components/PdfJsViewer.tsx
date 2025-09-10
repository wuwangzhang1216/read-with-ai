import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
}

const PdfJsViewer: React.FC<PdfJsViewerProps> = ({ fileBuffer, title, currentPage, onPageChange, initialScale = 'page-fit' }) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [numPages, setNumPages] = useState(0);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [fitMode, setFitMode] = useState<'width' | 'page'>(() => (initialScale === 'page-fit' ? 'page' : 'width'));
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const onPageChangeRef = useRef<typeof onPageChange>();
  const containerSizeRef = useRef<{ width: number; height: number }>({ width: 0, height: 0 });
  const [containerSize, setContainerSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const pendingScrollToRef = useRef<{ page: number; tries: number } | null>(null);
  // Until this timestamp, ignore scroll-driven page detection
  const programmaticScrollUntilRef = useRef<number>(0);
  const toolbarRef = useRef<HTMLDivElement>(null);

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

  // Helper: scroll to a given page, queueing retries if layout/refs not ready
  const tryScrollToPage = useCallback((targetPage: number, smooth: boolean) => {
    const sc = scrollContainerRef.current;
    const el = pageRefs.current.get(targetPage);
    const ready = !!(sc && el && containerSize.width && containerSize.height);
    if (!ready) {
      pendingScrollToRef.current = { page: targetPage, tries: (pendingScrollToRef.current?.tries || 0) + 1 };
      // Schedule a retry on next frame
      requestAnimationFrame(() => {
        if (pendingScrollToRef.current) {
          tryScrollToPage(pendingScrollToRef.current.page, smooth);
        }
      });
      return false;
    }
    // We are ready, clear pending flag
    pendingScrollToRef.current = null;
    // Compute target top relative to the scroll container, accounting for sticky toolbar height
    const elTop = el.getBoundingClientRect().top;
    const scTop = sc!.getBoundingClientRect().top;
    const stickyH = (toolbarRef.current?.offsetHeight || 0) + 12; // 12px top gap
    const top = sc!.scrollTop + (elTop - scTop) - stickyH;
    programmaticScrollUntilRef.current = Date.now() + 600; // ignore scroll-driven updates for a short while
    sc!.scrollTo({ top, behavior: smooth ? 'smooth' : 'auto' });
    return true;
  }, [containerSize.width, containerSize.height]);

  // Handle external navigation requests
  useEffect(() => {
    if (!currentPage) return;
    setPage(currentPage);
    tryScrollToPage(currentPage, true);
  }, [currentPage, tryScrollToPage]);

  // If a scroll was queued because layout/refs weren't ready, try again
  useEffect(() => {
    if (pendingScrollToRef.current) {
      tryScrollToPage(pendingScrollToRef.current.page, true);
    }
  }, [numPages, containerSize.width, containerSize.height, tryScrollToPage]);

  // When page changes internally, notify parent
  useEffect(() => {
    const cb = onPageChangeRef.current;
    if (cb) cb(page);
  }, [page]);

  // Scroll handler to update current page based on visibility
  useEffect(() => {
    const sc = scrollContainerRef.current;
    if (!sc) return;
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        try {
          if (Date.now() < programmaticScrollUntilRef.current) return; // ignore programmatic scrolls
          const containerTop = sc.scrollTop;
          const containerH = sc.clientHeight;
          let bestPage = 1;
          let bestDist = Infinity;
          pageRefs.current.forEach((node, p) => {
            const top = sc.scrollTop + (node.getBoundingClientRect().top - sc.getBoundingClientRect().top);
            const centerDist = Math.abs((top - containerTop) - containerH / 4);
            if (centerDist < bestDist) {
              bestDist = centerDist;
              bestPage = p;
            }
          });
          setPage(prev => (prev !== bestPage ? bestPage : prev));
        } catch {}
      });
    };
    sc.addEventListener('scroll', onScroll, { passive: true });
    return () => sc.removeEventListener('scroll', onScroll);
  }, [numPages]);

  const zoomStep = 0.1;
  const zoomIn = () => setZoom(z => Math.min(Number((z + zoomStep).toFixed(2)), 3));
  const zoomOut = () => setZoom(z => Math.max(Number((z - zoomStep).toFixed(2)), 0.25));
  const applyFit = (mode: 'width' | 'page') => setFitMode(mode);
  const goToPage = (n: number) => {
    const clamped = Math.max(1, Math.min(numPages || 1, Math.floor(n)));
    setPage(clamped);
    tryScrollToPage(clamped, true);
  };

  const registerPageRef = useCallback((p: number) => (el: HTMLDivElement | null) => {
    if (!el) {
      pageRefs.current.delete(p);
    } else {
      pageRefs.current.set(p, el);
    }
    // If there's a pending scroll to this page, try again now that ref is set
    if (pendingScrollToRef.current && pendingScrollToRef.current.page === p) {
      tryScrollToPage(p, true);
    }
  }, [tryScrollToPage]);

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

  // Stable file/options to prevent unnecessary reloads
  const fileSource = useMemo(() => ({ data: fileBuffer }), [fileBuffer]);

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
        {!containerSize.width || !containerSize.height ? (
          <div style={{ color: 'var(--text-secondary)', padding: '24px' }}>Preparing viewer…</div>
        ) : (
        <Document
          file={fileSource}
          onLoadSuccess={(info) => setNumPages(info.numPages || 0)}
          onLoadError={(err) => console.error('Failed to load PDF with react-pdf:', err)}
          loading={<div style={{ color: 'var(--text-secondary)' }}>Loading PDF…</div>}
          error={<div style={{ color: 'var(--accent-red)' }}>Failed to load PDF.</div>}
        >
          {Array.from(new Array(numPages), (_, i) => i + 1).map((p) => (
            <div key={p} ref={registerPageRef(p)} style={{ margin: '8px 0' }}>
              <Page
                pageNumber={p}
                renderTextLayer
                renderAnnotationLayer
                className="react-pdf__page"
                loading={<div style={{ color: 'var(--text-secondary)' }}>Rendering page {p}…</div>}
                onRenderError={(err) => console.error(`Failed to render page ${p}:`, err)}
                {...pageRenderProps}
              />
            </div>
          ))}
        </Document>
        )}
      </div>
    </div>
  );
};

export default PdfJsViewer;
