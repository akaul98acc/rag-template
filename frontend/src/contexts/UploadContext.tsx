import { createContext, useContext, useState, type ReactNode } from "react";
import type { HistoryItem, Selections, UploadResult } from "@/types/api";

interface UploadContextValue {
  uploadResult: UploadResult | null;
  setUploadResult: (r: UploadResult | null) => void;
  selectionsCache: Record<string, Selections>;
  saveSelections: (docId: string, selections: Selections) => void;
  restoredItem: HistoryItem | null;
  restoreItem: (item: HistoryItem) => void;
  clearRestoredItem: () => void;
}

const UploadContext = createContext<UploadContextValue | null>(null);

export function UploadProvider({ children }: { children: ReactNode }) {
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [selectionsCache, setSelectionsCache] = useState<Record<string, Selections>>({});
  const [restoredItem, setRestoredItem] = useState<HistoryItem | null>(null);

  function saveSelections(docId: string, selections: Selections) {
    setSelectionsCache((prev) => ({ ...prev, [docId]: selections }));
  }

  function restoreItem(item: HistoryItem) {
    setRestoredItem(item);
    setUploadResult({ doc_id: item.doc_id, metadata: item.metadata });
  }

  function clearRestoredItem() {
    setRestoredItem(null);
  }

  return (
    <UploadContext.Provider
      value={{
        uploadResult,
        setUploadResult,
        selectionsCache,
        saveSelections,
        restoredItem,
        restoreItem,
        clearRestoredItem,
      }}
    >
      {children}
    </UploadContext.Provider>
  );
}

export function useUpload(): UploadContextValue {
  const ctx = useContext(UploadContext);
  if (!ctx) throw new Error("useUpload must be used within <UploadProvider>");
  return ctx;
}
