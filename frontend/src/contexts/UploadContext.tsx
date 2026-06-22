import { createContext, useContext, useState, type ReactNode } from "react";
import type { UploadResult } from "@/types/api";

interface UploadContextValue {
  uploadResult: UploadResult | null;
  setUploadResult: (r: UploadResult | null) => void;
}

const UploadContext = createContext<UploadContextValue | null>(null);

export function UploadProvider({ children }: { children: ReactNode }) {
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  return (
    <UploadContext.Provider value={{ uploadResult, setUploadResult }}>
      {children}
    </UploadContext.Provider>
  );
}

export function useUpload(): UploadContextValue {
  const ctx = useContext(UploadContext);
  if (!ctx) throw new Error("useUpload must be used within <UploadProvider>");
  return ctx;
}
