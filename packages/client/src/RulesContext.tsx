import { createContext, useContext, useState, type ReactNode } from 'react';

interface RulesContextValue {
  showRules: boolean;
  openRules: () => void;
  closeRules: () => void;
}

const RulesContext = createContext<RulesContextValue | null>(null);

export function RulesProvider({ children }: { children: ReactNode }) {
  const [showRules, setShowRules] = useState(false);
  return (
    <RulesContext.Provider
      value={{ showRules, openRules: () => setShowRules(true), closeRules: () => setShowRules(false) }}
    >
      {children}
    </RulesContext.Provider>
  );
}

export function useRules(): RulesContextValue {
  const ctx = useContext(RulesContext);
  if (!ctx) throw new Error('useRules must be used within RulesProvider');
  return ctx;
}
