'use strict';

class HostRegistry {
  constructor(options = {}) {
    this.hostPrefix = options.hostPrefix || '__';
    this.separator = options.separator || '__';
    this.internalHostSymbols = new Set(options.internalHostSymbols || []);
  }

  resolveMemberCall(objectName, methodName) {
    return this.resolvePath([objectName, methodName]);
  }

  resolveFunctionCall(functionName) {
    return this.resolvePath([functionName]);
  }

  resolvePath(pathSegments) {
    if (!Array.isArray(pathSegments) || pathSegments.length === 0) {
      return null;
    }

    const normalized = pathSegments
      .map((segment) => this.normalizeSegment(segment))
      .filter(Boolean);

    if (normalized.length === 0) {
      return null;
    }

    const hostSymbol = `${this.hostPrefix}${normalized.join(this.separator)}`;
    if (this.internalHostSymbols.has(hostSymbol)) {
      return null;
    }

    if (!hostSymbol.startsWith(this.hostPrefix)) {
      throw new Error(`invalid host symbol generated without required prefix '${this.hostPrefix}': ${hostSymbol}`);
    }

    return hostSymbol;
  }

  normalizeSegment(value) {
    const raw = String(value || '').trim();
    if (!raw) {
      return '';
    }

    return raw.replace(/[^A-Za-z0-9_$]/g, '_');
  }

  listMappings() {
    return [];
  }

  strategy() {
    return {
      mode: 'dynamic-prefix',
      hostPrefix: this.hostPrefix,
      separator: this.separator,
      internalHostSymbols: Array.from(this.internalHostSymbols)
    };
  }
}

module.exports = {
  HostRegistry
};
