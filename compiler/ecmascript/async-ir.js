'use strict';

/**
 * Async/Await IR (Intermediate Representation)
 *
 * Each async function is lowered to an AsyncStateMachine IR node that describes:
 *   - the function name and parameters
 *   - a list of IR statements (sequential operations)
 *   - suspend points (await checkpoints) with state IDs
 *
 * This IR is consumed by a future C++98 code generator that emits a struct-based
 * coroutine compatible with the MaiaCpp/MaiaC toolchain.
 *
 * Current scope (Phase 3 skeleton):
 *   - Recognise async function declarations in the AST
 *   - Emit AsyncStateMachine IR with parameter list and empty body
 *   - Represent each await expression as a SuspendPoint with a sequential state ID
 *
 * Not yet implemented:
 *   - Control flow inside async bodies (if/while/try)
 *   - Promise chaining and rejection paths
 *   - C++ emission from this IR
 */

const ASYNC_IR_VERSION = '0.1.0';

/**
 * @typedef {Object} AsyncParam
 * @property {string} name
 * @property {string} cppType  - conservative default 'int'; refined later
 */

/**
 * @typedef {Object} SuspendPoint
 * @property {'suspend'} kind
 * @property {number} stateId    - monotonically increasing from 1
 * @property {string|null} awaitedExpr - lowered C++ expression string, or null if not yet lowered
 * @property {number} tryDepth   - nesting level of try/catch (0 = none, 1 = inside first try, etc.)
 * @property {Array<{paramName: string, typeCode: number}>} catchHandlers - list of catch handlers at this depth
 * @property {number} finallyDepth - nesting level of try/finally handlers that can intercept this await
 * @property {Array<{kind: 'finally'}>} finallyHandlers - finally handlers from innermost to outermost
 */

/**
 * @typedef {Object} CatchHandler
 * @property {string} paramName  - catch parameter name (e.g., "e", "err")
 * @property {number} typeCode   - exception type code (1 = generic, extensible)
 */

/**
 * @typedef {Object} AsyncStateMachine
 * @property {'AsyncStateMachine'} kind
 * @property {string} name
 * @property {AsyncParam[]} params
 * @property {string} returnValueCppType  - the resolved type wrapped by the future/promise
 * @property {Array<SuspendPoint|Object>} body  - ordered IR statements
 * @property {number} suspendPointCount
 */

/**
 * Walk an AST node tree, calling visitor on each node.
 * @param {Object} node
 * @param {function(Object): void} visitor
 */
function walk(node, visitor) {
  if (!node || typeof node !== 'object') { return; }
  visitor(node);
  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      walk(child, visitor);
    }
  }
}

/**
 * Find the first direct child nonterminal with the given name.
 * @param {Object} node
 * @param {string} name
 * @returns {Object|null}
 */
function findChild(node, name) {
  return (node && node.children || []).find(
    (c) => c && c.kind === 'nonterminal' && c.name === name
  ) || null;
}

/**
 * Return the text value of the first terminal Identifier token under node.
 * @param {Object} node
 * @returns {string|null}
 */
function firstIdentifierValue(node) {
  let found = null;
  walk(node, (n) => {
    if (found || !n || n.kind !== 'terminal') { return; }
    if (n.token === 'Identifier' || n.token === 'IdentifierName') {
      found = String(n.value || '').trim();
    }
  });
  return found;
}

/**
 * Count await expressions in a function body AST node.
 * @param {Object} functionBodyNode
 * @returns {number}
 */
function countAwaitExpressions(functionBodyNode) {
  let count = 0;
  walk(functionBodyNode, (n) => {
    if (n && n.kind === 'nonterminal' && n.name === 'awaitExpression') {
      count += 1;
    }
  });
  return count;
}

/**
 * Collect awaitExpression nodes from a function body in source order.
 * @param {Object|null} functionBodyNode
 * @returns {Object[]}
 */
function collectAwaitExpressions(functionBodyNode) {
  const awaitExpressions = [];
  if (!functionBodyNode) { return awaitExpressions; }

  walk(functionBodyNode, (n) => {
    if (n && n.kind === 'nonterminal' && n.name === 'awaitExpression') {
      awaitExpressions.push(n);
    }
  });

  return awaitExpressions;
}

/**
 * Return the awaited operand child from an awaitExpression node.
 * @param {Object|null} awaitExpressionNode
 * @returns {Object|null}
 */
function extractAwaitOperand(awaitExpressionNode) {
  if (!awaitExpressionNode || awaitExpressionNode.kind !== 'nonterminal' || awaitExpressionNode.name !== 'awaitExpression') {
    return null;
  }

  const nonterminalChildren = (awaitExpressionNode.children || []).filter(
    (child) => child && child.kind === 'nonterminal'
  );

  return nonterminalChildren.length === 1 ? nonterminalChildren[0] : null;
}

/**
 * Determine the try/catch nesting depth of an awaitExpression within a function body.
 * Returns 0 if not inside a try, 1 if inside one try, etc.
 * @param {Object|null} awaitExpressionNode
 * @param {Object|null} functionBodyNode
 * @returns {number}
 */
function findTryDepth(awaitExpressionNode, functionBodyNode) {
  if (!awaitExpressionNode || !functionBodyNode) { return 0; }

  let depth = 0;
  let found = false;
  let target = awaitExpressionNode;

  // Walk the tree and track try statements
  const analyzeNode = (node, parents = []) => {
    if (found) { return; }
    if (!node || typeof node !== 'object') { return; }

    // Check if this node is or contains the target
    if (node === target) {
      // Count how many tryStatement ancestors we have
      depth = parents.filter((p) => p && p.kind === 'nonterminal' && p.name === 'tryStatement').length;
      found = true;
      return;
    }

    if (Array.isArray(node.children)) {
      for (const child of node.children) {
        analyzeNode(child, [...parents, node]);
        if (found) { return; }
      }
    }
  };

  analyzeNode(functionBodyNode);
  return depth;
}

/**
 * Extract catch parameter name from a catch nonterminal.
 * @param {Object|null} catchNode
 * @returns {string|null}
 */
function extractCatchParameterName(catchNode) {
  if (!catchNode || catchNode.kind !== 'nonterminal' || catchNode.name !== 'catch') {
    return null;
  }

  let found = null;
  walk(catchNode, (n) => {
    if (found || !n || n.kind !== 'terminal') { return; }
    if (n.token === 'Identifier' || n.token === 'IdentifierName') {
      found = String(n.value || '').trim();
    }
  });

  return found;
}

/**
 * Collect all catch handlers from a try statement in nesting order.
 * Maps each catch parameter to a generic type code (1 for now).
 * @param {Object|null} tryStatementNode
 * @returns {Array<CatchHandler>}
 */
function collectCatchHandlers(tryStatementNode) {
  if (!tryStatementNode || tryStatementNode.kind !== 'nonterminal' || tryStatementNode.name !== 'tryStatement') {
    return [];
  }

  const handlers = [];
  for (const child of (tryStatementNode.children || [])) {
    if (!child || child.kind !== 'nonterminal' || child.name !== 'catch') {
      continue;
    }

    const paramName = extractCatchParameterName(child);
    if (paramName) {
      handlers.push({
        paramName: paramName,
        typeCode: 1  // Generic exception type for now; can be refined later
      });
    }
  }

  return handlers;
}

/**
 * Collect catch handlers for an awaitExpression from all enclosing try statements.
 * Returns array of handler arrays, innermost first.
 * @param {Object|null} awaitExpressionNode
 * @param {Object|null} functionBodyNode
 * @returns {Array<Array<CatchHandler>>}
 */
function collectCatchHandlersForAwait(awaitExpressionNode, functionBodyNode) {
  if (!awaitExpressionNode || !functionBodyNode) { return []; }

  let target = awaitExpressionNode;
  let tryAncestors = [];
  let found = false;

  const walkForParents = (node, parents = []) => {
    if (found) { return; }
    if (!node || typeof node !== 'object') { return; }

    if (node === target) {
      // Collect all tryStatement ancestors
      tryAncestors = parents.filter((p) => p && p.kind === 'nonterminal' && p.name === 'tryStatement');
      found = true;
      return;
    }

    if (Array.isArray(node.children)) {
      for (const child of node.children) {
        walkForParents(child, [...parents, node]);
        if (found) { return; }
      }
    }
  };

  walkForParents(functionBodyNode);

  // Extract handlers from innermost to outermost
  return tryAncestors.map((tryNode) => collectCatchHandlers(tryNode));
}

/**
 * Determine whether a subtree contains a target node.
 * @param {Object|null} root
 * @param {Object|null} target
 * @returns {boolean}
 */
function containsNode(root, target) {
  if (!root || !target) { return false; }
  let found = false;
  walk(root, (n) => {
    if (!found && n === target) {
      found = true;
    }
  });
  return found;
}

/**
 * Collect finally handlers for an awaitExpression from enclosing try statements.
 * Returns handlers from innermost to outermost.
 * @param {Object|null} awaitExpressionNode
 * @param {Object|null} functionBodyNode
 * @returns {Array<{kind: 'finally'}>}
 */
function collectFinallyHandlersForAwait(awaitExpressionNode, functionBodyNode) {
  if (!awaitExpressionNode || !functionBodyNode) { return []; }

  let tryAncestors = [];
  let found = false;

  const walkForParents = (node, parents = []) => {
    if (found) { return; }
    if (!node || typeof node !== 'object') { return; }

    if (node === awaitExpressionNode) {
      tryAncestors = parents.filter((p) => p && p.kind === 'nonterminal' && p.name === 'tryStatement');
      found = true;
      return;
    }

    if (Array.isArray(node.children)) {
      for (const child of node.children) {
        walkForParents(child, [...parents, node]);
        if (found) { return; }
      }
    }
  };

  walkForParents(functionBodyNode);

  const handlers = [];
  for (let i = tryAncestors.length - 1; i >= 0; i -= 1) {
    const tryNode = tryAncestors[i];
    const finallyNode = findChild(tryNode, 'finally');
    if (!finallyNode) { continue; }

    // If the await itself is inside this finally block, this finally is not an intercepting handler.
    if (containsNode(finallyNode, awaitExpressionNode)) {
      continue;
    }

    handlers.push({ kind: 'finally' });
  }

  return handlers;
}

/**
 * Extract parameter names from a formal parameter list nonterminal.
 * @param {Object|null} formalParameterListNode
 * @returns {AsyncParam[]}
 */
function extractParams(formalParameterListNode) {
  if (!formalParameterListNode) { return []; }
  const params = [];
  walk(formalParameterListNode, (n) => {
    if (!n || n.kind !== 'nonterminal') { return; }
    if (n.name === 'bindingIdentifier' || n.name === 'singleNameBinding') {
      const name = firstIdentifierValue(n);
      if (name && !params.find((p) => p.name === name)) {
        params.push({ name, cppType: 'int' });
      }
    }
  });
  return params;
}

/**
 * Build a minimal AsyncStateMachine IR for one async function declaration node.
 * @param {Object} functionDeclarationNode  - must have async:true or be under asyncFunctionDeclaration
 * @param {{ lowerAwaitOperand?: function(Object): (string|null) }} [options]
 * @returns {AsyncStateMachine}
 */
function buildAsyncStateMachine(functionDeclarationNode, options = {}) {
  const nameNode = findChild(functionDeclarationNode, 'identifier')
    || findChild(functionDeclarationNode, 'bindingIdentifier');
  const name = nameNode ? firstIdentifierValue(nameNode) : '<anonymous>';

  const formalParams = findChild(functionDeclarationNode, 'formalParameterList');
  const params = extractParams(formalParams);

  const functionBody = findChild(functionDeclarationNode, 'functionBody')
    || findChild(functionDeclarationNode, 'asyncFunctionBody');

  const awaitExpressions = collectAwaitExpressions(functionBody);
  const suspendPointCount = awaitExpressions.length;

  const body = [];
  for (let i = 0; i < suspendPointCount; i += 1) {
    const awaitNode = awaitExpressions[i];
    const awaitOperand = extractAwaitOperand(awaitNode);
    const awaitedExpr = options.lowerAwaitOperand && awaitOperand
      ? options.lowerAwaitOperand(awaitOperand)
      : null;
    const tryDepth = findTryDepth(awaitNode, functionBody);
    const catchHandlerArrays = collectCatchHandlersForAwait(awaitNode, functionBody);
    // Get handlers from the innermost try (last in array), or empty if not in try
    const catchHandlers = catchHandlerArrays.length > 0 ? catchHandlerArrays[catchHandlerArrays.length - 1] : [];
    const finallyHandlers = collectFinallyHandlersForAwait(awaitNode, functionBody);
    const finallyDepth = finallyHandlers.length;

    body.push({
      kind: 'suspend',
      stateId: i + 1,
      awaitedExpr: awaitedExpr !== null ? awaitedExpr : null,
      tryDepth: tryDepth,
      catchHandlers: catchHandlers,
      finallyDepth: finallyDepth,
      finallyHandlers: finallyHandlers
    });
  }

  return {
    kind: 'AsyncStateMachine',
    name,
    params,
    returnValueCppType: 'int',
    body,
    suspendPointCount
  };
}

/**
 * Collect all top-level async function declarations from a parse tree.
 * @param {Object} tree  - root program nonterminal
 * @param {{ lowerAwaitOperand?: function(Object): (string|null) }} [options]
 * @returns {AsyncStateMachine[]}
 */
function collectAsyncStateMachines(tree, options = {}) {
  const machines = [];
  for (const child of (tree && tree.children || [])) {
    if (!child || child.kind !== 'nonterminal' || child.name !== 'sourceElement') { continue; }
    for (const stmtOrDecl of (child.children || [])) {
      if (!stmtOrDecl || stmtOrDecl.kind !== 'nonterminal') { continue; }

      // async function declarations may surface as asyncFunctionDeclaration
      if (stmtOrDecl.name === 'asyncFunctionDeclaration') {
        machines.push(buildAsyncStateMachine(stmtOrDecl, options));
        continue;
      }

      // or wrapped in statement -> functionDeclaration with an async modifier
      if (stmtOrDecl.name === 'statement') {
        const fnDecl = findChild(stmtOrDecl, 'asyncFunctionDeclaration');
        if (fnDecl) {
          machines.push(buildAsyncStateMachine(fnDecl, options));
        }
      }
    }
  }
  return machines;
}

/**
 * Top-level entry: given a parse tree, produce the async IR manifest.
 * @param {Object} tree
 * @param {{ lowerAwaitOperand?: function(Object): (string|null) }} [options]
 * @returns {{ version: string, asyncFunctions: AsyncStateMachine[] }}
 */
function buildAsyncIR(tree, options = {}) {
  return {
    version: ASYNC_IR_VERSION,
    asyncFunctions: collectAsyncStateMachines(tree, options)
  };
}

module.exports = { buildAsyncIR, buildAsyncStateMachine, ASYNC_IR_VERSION };
