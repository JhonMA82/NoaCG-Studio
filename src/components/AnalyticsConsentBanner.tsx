import { useEffect, useState } from 'react';
import { isBackendConfigured } from '../backend/config';
import {
  ANALYTICS_CONSENT_EVENT,
  analyticsBlockedByBrowser,
  analyticsConsent,
  setAnalyticsConsent,
} from '../backend/events';

/** Optional, non-blocking product analytics choice for the hosted service. */
export default function AnalyticsConsentBanner() {
  const [consent, setConsent] = useState(analyticsConsent);

  useEffect(() => {
    const refresh = () => setConsent(analyticsConsent());
    window.addEventListener(ANALYTICS_CONSENT_EVENT, refresh);
    return () => window.removeEventListener(ANALYTICS_CONSENT_EVENT, refresh);
  }, []);

  if (!isBackendConfigured() || analyticsBlockedByBrowser() || consent !== 'undecided') return null;

  return (
    <aside className="analytics-consent" aria-label="Optional analytics" data-testid="analytics-consent">
      <div>
        <strong>Help improve NoaCG</strong>
        <p>
          Share five limited milestones - visits, return visits, signup, creation, and export -
          so we can see whether people successfully make and deliver graphics. No project
          content, prompts, advertising, or marketing attribution. Kept for 90 days.
        </p>
        <a href="/privacy" target="_blank" rel="noreferrer">Privacy details</a>
      </div>
      <div className="analytics-consent-actions">
        <button onClick={() => setAnalyticsConsent(false)}>No thanks</button>
        <button className="primary" onClick={() => setAnalyticsConsent(true)}>Allow</button>
      </div>
    </aside>
  );
}
