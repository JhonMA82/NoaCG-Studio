// React's view of the caller's own entitlement (backend/myEntitlement.ts does the fetching).

import { useEffect, useState } from 'react';
import { defaultEntitlement, myEntitlement } from '../backend/myEntitlement';
import type { MyEntitlement } from '../entitlements/clientTypes';

/**
 * The caller's entitlement.
 *
 * Starts at the anonymous defaults so nothing can flash as available and then vanish - the
 * first paint is the CONSERVATIVE answer and the real one replaces it. Offline it never
 * changes, which is correct there.
 */
export function useMyEntitlement(): MyEntitlement {
  const [state, setState] = useState<MyEntitlement>(defaultEntitlement);
  useEffect(() => {
    let cancelled = false;
    void myEntitlement().then((value) => {
      if (!cancelled) setState(value);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return state;
}
