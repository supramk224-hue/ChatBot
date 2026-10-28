export class ETagConflictError extends Error {
  constructor(key) {
    super(`Storage: error writing "${key}" due to eTag conflict.`);
    this.name = 'ETagConflictError';
    this.code = 'ETAG_CONFLICT';
    this.key = key;
  }
}

export class StorageAdapter {
  async read() {
    throw new Error('StorageAdapter.read() must be implemented by the storage provider.');
  }

  async write() {
    throw new Error('StorageAdapter.write() must be implemented by the storage provider.');
  }

  async delete() {
    throw new Error('StorageAdapter.delete() must be implemented by the storage provider.');
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export class MemoryStorage extends StorageAdapter {
  constructor(memory = new Map()) {
    super();
    this.memory = memory;
    this.etag = 1;
  }

  async read(keys) {
    if (!Array.isArray(keys)) {
      throw new ReferenceError('Keys are required when reading.');
    }

    const data = {};
    for (const key of keys) {
      const item = this.memory.get(key);
      if (item) {
        data[key] = clone(item);
      }
    }
    return data;
  }

  async write(changes) {
    if (!changes || typeof changes !== 'object') {
      throw new ReferenceError('Changes are required when writing.');
    }

    const keys = Object.keys(changes);
    for (const key of keys) {
      const nextItem = changes[key] || {};
      const current = this.memory.get(key);
      const tag = nextItem.eTag;
      const canOverwrite = !current || tag === '*' || tag == null || tag === '';
      if (!canOverwrite && tag !== current.eTag) {
        throw new ETagConflictError(key);
      }
    }

    for (const key of keys) {
      const nextItem = changes[key] || {};
      this.memory.set(key, {
        value: clone(nextItem.value ?? {}),
        eTag: String(this.etag++),
      });
    }
  }

  async delete(keys) {
    if (!Array.isArray(keys)) {
      throw new ReferenceError('Keys are required when deleting.');
    }

    for (const key of keys) {
      this.memory.delete(key);
    }
  }
}
