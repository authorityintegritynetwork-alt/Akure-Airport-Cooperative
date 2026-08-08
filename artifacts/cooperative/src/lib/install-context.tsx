import { createContext, useContext, type ReactNode } from "react";
import { useInstallPrompt } from "./use-install-prompt";

type InstallContextValue = ReturnType<typeof useInstallPrompt>;

const InstallContext = createContext<InstallContextValue | null>(null);

export function InstallProvider({ children }: { children: ReactNode }) {
  const install = useInstallPrompt();
  return (
    <InstallContext.Provider value={install}>
      {children}
    </InstallContext.Provider>
  );
}

export function useInstall(): InstallContextValue {
  const ctx = useContext(InstallContext);
  if (!ctx) throw new Error("useInstall must be used within InstallProvider");
  return ctx;
}
