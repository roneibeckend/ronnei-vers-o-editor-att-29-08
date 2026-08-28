import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { swAllowedHere } from '@/lib/pwa-sw';

export function PwaUpdateManager() {
  const [needRefresh, setNeedRefresh] = useState(false);

  useEffect(() => {
    if ('serviceWorker' in navigator && swAllowedHere()) {
      navigator.serviceWorker.ready.then((registration) => {
        // Verifica atualizações imediatamente
        registration.update().catch(() => { /* ignora falhas de update */ });

        
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                // Notifica sobre a nova versão para evitar conflitos de layout com ativos antigos
                setNeedRefresh(true);
              }
            });
          }
        });
      });

      // Polling para atualizações em background a cada 1 hora
      const interval = setInterval(() => {
        navigator.serviceWorker.ready
          .then(reg => reg.update())
          .catch(() => { /* ignora falhas de update */ });
      }, 60 * 60 * 1000);


      return () => clearInterval(interval);
    }
  }, []);

  if (!needRefresh) return null;

  return (
    <div className="fixed bottom-safe left-4 right-4 z-[100] animate-in slide-in-from-bottom-4">
      <div className="glass flex items-center justify-between gap-4 rounded-xl p-4 shadow-fire">
        <div className="text-sm font-medium">Nova versão disponível!</div>
        <button
          onClick={() => window.location.reload()}
          className="btn-fire flex items-center gap-2 px-4 py-2 text-xs"
        >
          <RefreshCw className="h-3 w-3" />
          Atualizar agora
        </button>
      </div>
    </div>
  );
}
