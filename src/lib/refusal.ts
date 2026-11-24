/**
 * A request refused for a reason a person can act on: an HTTP status, a short code for scripts,
 * and a message in plain words. Route handlers throw it and answer with `refusalResponse`.
 */
export class Refusal extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }

  response(): Response {
    return Response.json({ error: this.code, message: this.message }, { status: this.status });
  }
}

/** Turn a thrown refusal into its response; anything else is a server error. */
export function refusalResponse(error: unknown): Response {
  if (error instanceof Refusal) return error.response();
  console.error(error);
  return Response.json(
    { error: "server", message: "Something went wrong on the server. Try again." },
    { status: 500 },
  );
}
