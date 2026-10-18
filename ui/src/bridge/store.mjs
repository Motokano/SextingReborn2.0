/** Read-only presentation domains. Gameplay objects never enter this store. */
export function createUiBridge(readers, schedule = queueMicrotask) {
  const snapshots = new Map();
  const signatures = new Map();
  const listeners = new Map();
  const dirty = new Set();
  let queued = false;
  let disposed = false;

  function freeze(value) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  }

  function read(domain) {
    if (!Object.hasOwn(readers, domain)) throw new Error(`Unknown UI domain: ${domain}`);
    const value = readers[domain]();
    const signature = JSON.stringify(value);
    if (signature !== signatures.get(domain)) {
      const snapshot = freeze({ ...value, revision: (snapshots.get(domain)?.revision || 0) + 1 });
      signatures.set(domain, signature);
      snapshots.set(domain, snapshot);
      return true;
    }
    return false;
  }

  function flush() {
    queued = false;
    if (disposed) return;
    const domains = [...dirty];
    dirty.clear();
    for (const domain of domains) {
      if (read(domain)) {
        for (const listener of [...(listeners.get(domain) || [])]) listener(snapshots.get(domain));
      }
    }
  }

  return {
    getSnapshot(domain) {
      if (!snapshots.has(domain)) read(domain);
      return snapshots.get(domain);
    },
    subscribe(domain, listener) {
      if (disposed) throw new Error('UI bridge disposed');
      if (!listeners.has(domain)) listeners.set(domain, new Set());
      listeners.get(domain).add(listener);
      listener(this.getSnapshot(domain));
      return () => listeners.get(domain)?.delete(listener);
    },
    invalidate(domain) {
      if (disposed) return;
      if (!Object.hasOwn(readers, domain)) throw new Error(`Unknown UI domain: ${domain}`);
      dirty.add(domain);
      if (!queued) { queued = true; schedule(flush); }
    },
    flush,
    dispose() { disposed = true; dirty.clear(); listeners.clear(); },
  };
}
