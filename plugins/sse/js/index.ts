import { isTauri } from "@tauri-apps/api/core";
import { commands as generatedCommands, events as generatedEvents } from "./bindings.gen";

export const commands = {
  async fetch(
    input: Parameters<typeof globalThis.fetch>[0],
    init?: Parameters<typeof globalThis.fetch>[1],
  ): Promise<Response> {
    if (!isTauri()) {
      return globalThis.fetch(input, init);
    }

    const {
      signal,
      method = "GET",
      body = [],
    } = init || {};

    // Use the updated headers from init (not the destructured value)
    const finalHeaders = init?.headers || {};

    let unlisten: Promise<() => void> | undefined;
    // @ts-ignore
    let setRequestId: Function | undefined;
    const requestIdPromise = new Promise<number>((resolve) => (setRequestId = resolve));
    const ts = new TransformStream();
    const writer = ts.writable.getWriter();
    let responseStatus: number | null = null;
    let responseHeaders: Record<string, string> = {};
    let loggedErrorChunkPreview = false;

    let closed = false;
    const close = () => {
      if (closed) {
        return;
      }

      closed = true;
      unlisten?.then(fn => fn());

      writer.ready.then(() => {
        writer.close().catch((e) => console.error(e));
      });
    };

    if (signal) {
      signal.addEventListener("abort", () => close());
    }

    // Set up event listener BEFORE making the request
    unlisten = generatedEvents.serverSentEvent.listen((e) => {
      requestIdPromise.then((currentRequestId) => {
        // Try both camelCase and snake_case (tauri-specta bug: doesn't rename request_id -> requestId)
        const payload = e?.payload || {};
        const requestId = (payload as any).requestId ?? (payload as any).request_id;
        const chunk = (payload as any).chunk;

        if (currentRequestId != requestId) {
          return; // Ignore events from other requests
        }
        if (chunk) {
          if (responseStatus !== null && responseStatus >= 400 && !loggedErrorChunkPreview) {
            loggedErrorChunkPreview = true;
            const preview = new TextDecoder().decode(new Uint8Array(chunk)).slice(0, 500);
            console.error("[SSE] Error response chunk preview", {
              url: input.toString(),
              method,
              status: responseStatus,
              headers: responseHeaders,
              preview,
            });
          }
          writer.ready.then(() => {
            writer.write(new Uint8Array(chunk));
          });
        } else {
          close(); // End of stream
        }
      });
    });

    return generatedCommands
      .fetch({
        method,
        url: input.toString(),
        headers: Object.fromEntries(Object.entries(finalHeaders)),
        body: typeof body === "string"
          ? Array.from(new TextEncoder().encode(body))
          : [],
      })
      .then((res) => {
        // tauri-specta bug: Response.requestId isn't renamed from request_id
        const requestId = (res as any).requestId ?? (res as any).request_id;
        setRequestId!(requestId);
        responseStatus = res.status;
        responseHeaders = (res.headers as Record<string, string>) || {};

        if (res.status >= 400) {
          console.error("[SSE] Non-success response", {
            url: input.toString(),
            method,
            status: res.status,
            headers: responseHeaders,
          });
        }

        return new Response(ts.readable, {
          status: res.status,
          headers: new Headers(res.headers as Record<string, string>),
        });
      })
      .catch((err) => {
        console.error("[SSE] Fetch error:", err);
        close();
        throw err;
      });
  },
};
