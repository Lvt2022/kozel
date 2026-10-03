import { useKozelClient } from '../KozelClientProvider.js';

export function ErrorBanner() {
  const { error, clearError } = useKozelClient();
  if (!error) return null;

  return (
    <div className="error-banner">
      <span>{error}</span>
      <button type="button" onClick={clearError}>
        ✕
      </button>
    </div>
  );
}
