'use strict';

/**
 * Pure AST traversal, indexing, and lookup utilities shared across MaiaJS compiler passes.
 */

const TREE_NAV_CACHE = new WeakMap();
const FIRST_NONTERMINAL_CACHE = new WeakMap();

function walk(node, visit) {
  if (!node || typeof node !== 'object') {
    return;
  }

  visit(node);

  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      walk(child, visit);
    }
  }
}

function flattenNodeText(node, maxLen = 160) {
  const parts = [];
  walk(node, (candidate) => {
    if (!candidate || candidate.kind !== 'terminal' || candidate.value == null) {
      return;
    }
    parts.push(String(candidate.value));
  });
  const text = parts.join('').replace(/\s+/g, ' ').trim();
  if (text.length <= maxLen) {
    return text;
  }
  return `${text.slice(0, maxLen - 3)}...`;
}

function getTreeNavigationIndex(root) {
  if (!root || typeof root !== 'object') {
    return null;
  }

  const cached = TREE_NAV_CACHE.get(root);
  if (cached) {
    return cached;
  }

  const parentByNode = new WeakMap();
  const enterByNode = new WeakMap();
  const exitByNode = new WeakMap();
  let clock = 0;

  function indexNode(node, parent = null) {
    if (!node || typeof node !== 'object') {
      return;
    }

    parentByNode.set(node, parent);
    enterByNode.set(node, clock++);

    if (Array.isArray(node.children)) {
      for (const child of node.children) {
        indexNode(child, node);
      }
    }

    exitByNode.set(node, clock++);
  }

  indexNode(root, null);

  const index = { parentByNode, enterByNode, exitByNode };
  TREE_NAV_CACHE.set(root, index);
  return index;
}

function findFirstIdentifierValue(node) {
  let found = null;

  walk(node, (candidate) => {
    if (found !== null) {
      return;
    }
    if (candidate.kind !== 'terminal') {
      return;
    }
    if (candidate.token === 'Identifier' || candidate.token === 'IdentifierName') {
      found = String(candidate.value || '').trim();
      return;
    }
    const tokenValue = String(candidate.value || '').trim();
    if (tokenValue
      && /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(tokenValue)
      && /^TOKEN_[A-Za-z_$][A-Za-z0-9_$]*$/.test(String(candidate.token || ''))) {
      found = tokenValue;
    }
  });

  return found;
}

function findNodePath(root, target) {
  if (!root || !target || typeof root !== 'object' || typeof target !== 'object') {
    return [];
  }

  const index = getTreeNavigationIndex(root);
  if (!index) {
    return [];
  }

  if (target !== root && !index.parentByNode.has(target)) {
    return [];
  }

  const path = [];
  let current = target;
  while (current) {
    path.push(current);
    if (current === root) {
      break;
    }
    current = index.parentByNode.get(current) || null;
  }

  if (path.length === 0 || path[path.length - 1] !== root) {
    return [];
  }

  return path.reverse();
}

function nodeContainsTarget(root, target) {
  if (!root || !target) {
    return false;
  }

  if (root === target) {
    return true;
  }

  const index = getTreeNavigationIndex(root);
  if (!index) {
    return false;
  }

  const rootEnter = index.enterByNode.get(root);
  const rootExit = index.exitByNode.get(root);
  const targetEnter = index.enterByNode.get(target);
  const targetExit = index.exitByNode.get(target);

  if (![rootEnter, rootExit, targetEnter, targetExit].every((v) => Number.isInteger(v))) {
    return false;
  }

  return rootEnter <= targetEnter && targetExit <= rootExit;
}

function findFirstTerminalByToken(node, tokenName) {
  if (!node || typeof node !== 'object') {
    return null;
  }
  if (node.kind === 'terminal' && node.token === tokenName) {
    return node;
  }
  for (const child of (node.children || [])) {
    const found = findFirstTerminalByToken(child, tokenName);
    if (found) {
      return found;
    }
  }
  return null;
}

function hasNonterminal(node, nonterminalName) {
  if (!node || typeof node !== 'object') {
    return false;
  }
  if (node.kind === 'nonterminal' && node.name === nonterminalName) {
    return true;
  }
  return (node.children || []).some((child) => hasNonterminal(child, nonterminalName));
}

function findFirstNonterminal(node, nonterminalName) {
  if (!node || typeof node !== 'object') {
    return null;
  }
  let cachedByName = FIRST_NONTERMINAL_CACHE.get(node);
  if (cachedByName && cachedByName.has(nonterminalName)) {
    return cachedByName.get(nonterminalName);
  }
  if (node.kind === 'nonterminal' && node.name === nonterminalName) {
    return node;
  }
  let found = null;
  for (const child of (node.children || [])) {
    found = findFirstNonterminal(child, nonterminalName);
    if (found) {
      break;
    }
  }
  if (!cachedByName) {
    cachedByName = new Map();
    FIRST_NONTERMINAL_CACHE.set(node, cachedByName);
  }
  cachedByName.set(nonterminalName, found || null);
  return found;
}

module.exports = {
  walk,
  flattenNodeText,
  getTreeNavigationIndex,
  findFirstIdentifierValue,
  findNodePath,
  nodeContainsTarget,
  findFirstTerminalByToken,
  hasNonterminal,
  findFirstNonterminal
};
