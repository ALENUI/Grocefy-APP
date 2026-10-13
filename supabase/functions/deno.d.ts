// Minimal Deno declarations for type-checking Edge Functions without the Deno toolchain.
declare namespace Deno {
  const env: { get(name: string): string | undefined };
  function serve(handler: (request: Request) => Response | Promise<Response>): unknown;
}
