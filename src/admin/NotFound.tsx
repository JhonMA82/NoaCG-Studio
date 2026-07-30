// What every unauthorized visitor sees at /admin, and what the page shows while it is still
// asking whether this visitor is allowed.
//
// It is deliberately a plain, unbranded 404: no NoaCG wordmark, no sign-in prompt, no "you
// do not have access" - each of those would confirm to a stranger that they had found
// something real. The page starts in this state and only ever leaves it after the server
// says yes, so a failed or slow authorization can never flash the admin shell.

export function NotFound() {
  return (
    <main className="admin-notfound">
      <h1>404</h1>
      <p>Not found</p>
    </main>
  );
}
