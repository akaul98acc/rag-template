import { useState, useEffect, useRef } from "react";
import { toast } from "@/hooks/use-toast";

interface UseEntityListOptions<T> {
  fetcher: (params: {
    page: number;
    page_size: number;
    search?: string;
  }) => Promise<{ items: T[]; total: number; page: number; page_size: number }>;
  pageSize?: number;
}

interface UseEntityListResult<T> {
  items: T[];
  total: number;
  page: number;
  setPage: (p: number) => void;
  search: string;
  setSearch: (s: string) => void;
  loading: boolean;
  refresh: () => void;
}

export function useEntityList<T>({
  fetcher,
  pageSize = 20,
}: UseEntityListOptions<T>): UseEntityListResult<T> {
  const [items, setItems] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  // Always hold a ref to the latest fetcher. Callers that bake extra params
  // into the fetcher (e.g. a plan filter) must also call refresh() to trigger
  // a new fetch after changing those params, because the effect below does not
  // list fetcher as a dependency.
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  // Debounce search input → reset page to 1 on change
  useEffect(() => {
    const id = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(id);
  }, [search]);

  // Fetch list
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetcherRef
      .current({
        page,
        page_size: pageSize,
        ...(debouncedSearch ? { search: debouncedSearch } : {}),
      })
      .then((res) => {
        if (cancelled) return;
        setItems(res.items);
        setTotal(res.total);
      })
      .catch(() => {
        if (cancelled) return;
        toast({ variant: "destructive", title: "Failed to load data." });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, debouncedSearch, pageSize, refreshKey]);

  return {
    items,
    total,
    page,
    setPage,
    search,
    setSearch,
    loading,
    refresh: () => setRefreshKey((k) => k + 1),
  };
}
