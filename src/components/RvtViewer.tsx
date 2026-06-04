import { useEffect, useRef, useState } from 'react';
import { Loader2, Eye } from 'lucide-react';
import { rvtGetViewerToken } from '../rvt/aps-client';
import { useLang } from '../i18n/LanguageContext';

interface RvtViewerProps {
  urn: string | null;
}

export default function RvtViewer({ urn }: RvtViewerProps) {
  const { t } = useLang();
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Autodesk.Viewing.GuiViewer3D | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!urn || !containerRef.current) return;

    let destroyed = false;
    setLoading(true);
    setError('');

    Autodesk.Viewing.Initializer(
      {
        env: 'AutodeskProduction2',
        getAccessToken: async (cb) => {
          try {
            const { access_token, expires_in } = await rvtGetViewerToken();
            cb(access_token, expires_in);
          } catch {
            setError('Failed to authenticate with APS.');
          }
        },
      },
      () => {
        if (destroyed || !containerRef.current) return;

        const viewer = new Autodesk.Viewing.GuiViewer3D(containerRef.current, {});
        viewer.start();
        viewer.setTheme('dark-theme');
        viewerRef.current = viewer;

        const documentId = `urn:${urn}`;
        Autodesk.Viewing.Document.load(
          documentId,
          (doc) => {
            if (destroyed) return;
            const defaultGeom = doc.getRoot().getDefaultGeometry();
            viewer.loadDocumentNode(doc, defaultGeom).then(() => setLoading(false));
          },
          (_code, msg) => {
            if (destroyed) return;
            setError(`Viewer load failed: ${msg}`);
            setLoading(false);
          },
        );
      },
    );

    return () => {
      destroyed = true;
      viewerRef.current?.finish();
      viewerRef.current = null;
    };
  }, [urn]);

  if (!urn) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20">
        <Eye className="h-12 w-12 text-slate-600" />
        <div className="text-sm text-slate-500">{t('rvt.viewerWaiting')}</div>
      </div>
    );
  }

  return (
    <div className="relative h-[500px] w-full">
      {loading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-900/80">
          <Loader2 className="h-8 w-8 animate-spin text-blue-400" />
          <span className="ml-3 text-sm text-slate-300">{t('rvt.viewerLoading')}</span>
        </div>
      )}
      {error && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-900/80">
          <div className="rounded-lg border border-red-900 bg-red-950/60 px-4 py-3 text-sm text-red-300">{error}</div>
        </div>
      )}
      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
}
