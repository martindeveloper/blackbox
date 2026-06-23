export function createRpc(post) {
  let nextId = 1;
  const pending = new Map();
  const handlers = new Map();

  function request(type, payload = {}) {
    const id = nextId++;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      post({ type, id, ...payload });
    });
  }

  function on(type, handler) {
    handlers.set(type, handler);
  }

  async function dispatch(message) {
    if (message.type === undefined) {
      const entry = pending.get(message.id);
      if (!entry) return;
      pending.delete(message.id);
      if (message.ok) entry.resolve(message.value);
      else entry.reject(new Error(message.error));
      return;
    }

    const handler = handlers.get(message.type);
    if (!handler) return;

    if (message.id === undefined) {
      await handler(message);
      return;
    }

    try {
      post({ id: message.id, ok: true, value: await handler(message) });
    } catch (error) {
      post({ id: message.id, ok: false, error: errorMessage(error) });
    }
  }

  function rejectAll(reason) {
    for (const entry of pending.values()) entry.reject(reason);
    pending.clear();
  }

  return { request, on, dispatch, rejectAll };
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
