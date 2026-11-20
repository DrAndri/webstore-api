'use client';
import { useSearchParams } from 'next/navigation';
import {
  createContext,
  SetStateAction,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import { MAX_COMPARED } from '../../utils/compareLimits';

export const SELECTION_PARAM = 'selectedProductIds';

export interface SelectedProduct {
  id: string;
  label: string;
}

export const productLabel = (product: {
  name?: string | null;
  sku: string;
  storeName?: string;
}) =>
  [product.name || product.sku, product.storeName].filter(Boolean).join(' · ');

interface SelectionContextValue {
  // null until a page has read the selection from its url on the first load
  selected: SelectedProduct[] | null;
  setSelected: (update: SetStateAction<SelectedProduct[]>) => void;
  initialize: (selected: SelectedProduct[]) => void;
  // The query of the last advanced search, so going back to it from another
  // page shows the same search
  lastSearch: string;
  setLastSearch: (query: string) => void;
}

const SelectionContext = createContext<SelectionContextValue>({
  selected: null,
  setSelected: () => {},
  initialize: () => {},
  lastSearch: '',
  setLastSearch: () => {}
});

// Labels for products that are only known by their id, the compare api gives
// a few products at a time
const fetchLabels = async (ids: string[]) => {
  const labels = new Map<string, string>();
  for (let i = 0; i < ids.length; i += MAX_COMPARED) {
    const response = await fetch('/api/compare', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productIds: ids.slice(i, i + MAX_COMPARED) })
    });
    if (!response.ok) break;
    const products = (await response.json()) as {
      id: string;
      name: string | null;
      sku: string;
      storeName: string;
    }[];
    for (const product of products)
      labels.set(String(product.id), productLabel(product));
  }
  return labels;
};

// The products selected in the advanced search, shared by the pages of the
// site so they stay selected when moving between the search and the price
// history. Lives in the root layout, which stays mounted between pages.
export default function SelectionProvider({
  children
}: {
  children: React.ReactNode;
}) {
  const [selected, setSelectedState] = useState<SelectedProduct[] | null>(null);
  const [lastSearch, setLastSearch] = useState('');
  const labelsRequested = useRef(new Set<string>());

  const setSelected = useCallback(
    (update: SetStateAction<SelectedProduct[]>) =>
      setSelectedState((current) =>
        typeof update === 'function' ? update(current ?? []) : update
      ),
    []
  );
  const initialize = useCallback(
    (initial: SelectedProduct[]) =>
      setSelectedState((current) => current ?? initial),
    []
  );

  useEffect(() => {
    const unlabeled = (selected ?? [])
      .filter((s) => s.id === s.label && !labelsRequested.current.has(s.id))
      .map((s) => s.id);
    if (unlabeled.length === 0) return;
    unlabeled.forEach((id) => labelsRequested.current.add(id));
    fetchLabels(unlabeled)
      .then((labels) =>
        setSelectedState(
          (current) =>
            current?.map((s) =>
              s.id === s.label && labels.has(s.id)
                ? { id: s.id, label: labels.get(s.id)! }
                : s
            ) ?? null
        )
      )
      .catch((error) => console.error('Loading product names failed', error));
  }, [selected]);

  const context = useMemo(
    () => ({ selected, setSelected, initialize, lastSearch, setLastSearch }),
    [selected, setSelected, initialize, lastSearch]
  );
  return (
    <SelectionContext.Provider value={context}>
      {children}
    </SelectionContext.Provider>
  );
}

// The selected products. On the first load of the site they come from the
// url, so links to a selection can be shared, after that the selection is kept
// while moving between pages. Uses the search params, so it must be rendered
// inside Suspense.
export const useSelection = () => {
  const context = useContext(SelectionContext);
  const params = useSearchParams();
  const [fromUrl] = useState(() =>
    (params.get(SELECTION_PARAM) ?? '')
      .split(',')
      .filter(Boolean)
      .map((id) => ({ id, label: id }))
  );
  const { initialize, setSelected } = context;
  useEffect(() => initialize(fromUrl), [initialize, fromUrl]);

  // Until the context has it, the selection in the url is shown, the same on
  // the server and the client
  const selected = context.selected ?? fromUrl;
  const toggle = useCallback(
    (
      product: {
        id: string;
        name?: string | null;
        sku: string;
        storeName?: string;
      },
      checked: boolean
    ) =>
      setSelected((current) =>
        checked
          ? [
              ...current.filter((s) => s.id !== product.id),
              { id: product.id, label: productLabel(product) }
            ]
          : current.filter((s) => s.id !== product.id)
      ),
    [setSelected]
  );
  return {
    selected,
    selectedIds: selected.map((s) => s.id),
    setSelected,
    toggle,
    lastSearch: context.lastSearch,
    setLastSearch: context.setLastSearch
  };
};
