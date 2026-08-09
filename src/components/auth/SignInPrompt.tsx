import { useAuthUi } from './authUi';

/**
 * The inline gate shown where an account-only feature would render (AI panel, community, …):
 * one line of copy + a Sign in button that opens the SignInDialog. Render it only when
 * useAuthState().needsSignIn is true — offline builds never show it.
 *
 * `offerSignUp` adds the CREATE-ACCOUNT half, leading. A gate says "sign in" to somebody who
 * has an account; a visitor who has none reads that as a wall. Where the honest answer is
 * "a free account is what unlocks this" — the AI door a student arrives at — the prompt has to
 * offer the account as well as the sign-in, or the product's answer to them is a dead end.
 * Opt-in rather than the default, because the gates a signed-out USER hits (their own sync,
 * their own saved work) are genuinely about signing back in.
 */
export default function SignInPrompt({
  feature,
  reason,
  offerSignUp = false,
}: {
  feature: string;
  reason: string;
  offerSignUp?: boolean;
}) {
  const openSignIn = useAuthUi((s) => s.openSignIn);
  return (
    <div className="panel-section signin-prompt" data-testid="signin-prompt">
      <h3>{feature}</h3>
      <p className="hint">{reason}</p>
      {offerSignUp ? (
        <div className="signin-prompt-actions">
          <button
            className="primary"
            onClick={() => openSignIn(reason, 'signup')}
            data-testid="signin-prompt-signup"
          >
            Create a free account
          </button>
          <button onClick={() => openSignIn(reason)} data-testid="signin-prompt-signin">
            I have an account
          </button>
        </div>
      ) : (
        <button className="primary" onClick={() => openSignIn(reason)}>Sign in</button>
      )}
    </div>
  );
}
