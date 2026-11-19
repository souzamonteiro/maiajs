'use strict';

/**
 * Closure & Lexical Capture Analysis and C++98 Lowering for MaiaJS.
 *
 * Uses integer-ID dispatch (`if (__fid == N) { return __maia_closure_impl_N(...); }`)
 * and heap-allocated mutable cells (`int*` / `double*`) so that MaiaCpp -> MaiaC -> MaiaWASM
 * compiles and executes closures, shared mutable state, currying, IIFEs, and dynamic
 * Array higher-order callbacks without C++98 function-pointer cast limitations.
 */

const BUILTIN_GLOBAL_IDENTIFIERS = new Set([
  'undefined', 'null', 'true', 'false', 'NaN', 'Infinity', 'arguments', 'this',
  'console', 'Math', 'Number', 'String', 'Boolean', 'Object', 'Array', 'JSON',
  'Promise', 'Reflect', 'Proxy', 'Symbol', 'WeakMap', 'WeakSet', 'Map', 'Set',
  'Error', 'TypeError', 'RangeError', 'SyntaxError', 'ReferenceError',
  'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'setTimeout', 'clearTimeout',
  'Atomics', 'SharedArrayBuffer', 'ArrayBuffer', 'Int32Array', 'Uint8Array',
  'Float64Array', 'DataView', 'Date', 'RegExp'
]);

const MUTATING_ASSIGNMENT_OPS = new Set([
  '=', '+=', '-=', '*=', '/=', '%=', '**=', '<<=', '>>=', '>>>=', '&=', '|=', '^='
]);

function walkAst(node, visitor) {
  if (!node || typeof node !== 'object') {
    return;
  }
  const shouldDescend = visitor(node);
  if (shouldDescend === false) {
    return;
  }
  const children = node.children || [];
  for (let i = 0; i < children.length; i += 1) {
    walkAst(children[i], visitor);
  }
}

function isClosureCandidateNode(node, isTopLevel) {
  if (!node || node.kind !== 'nonterminal') {
    return false;
  }
  if (node.name === 'functionExpression'
    || node.name === 'arrowFunction'
    || node.name === 'asyncArrowFunction') {
    return true;
  }
  if (node.name === 'functionDeclaration' && !isTopLevel) {
    return true;
  }
  return false;
}

function collectParamNames(fnNode, helpers) {
  if (!fnNode || fnNode.kind !== 'nonterminal') {
    return [];
  }
  if (fnNode.name === 'arrowFunction' || fnNode.name === 'asyncArrowFunction') {
    return helpers.extractLambdaParameterNames(fnNode);
  }
  return helpers.extractFunctionParameterNames(fnNode);
}

function collectBodyNode(fnNode, helpers) {
  if (!fnNode || fnNode.kind !== 'nonterminal') {
    return null;
  }
  if (fnNode.name === 'arrowFunction' || fnNode.name === 'asyncArrowFunction') {
    return helpers.extractLambdaBodyNode(fnNode);
  }
  return (fnNode.children || []).find(
    (c) => c && c.kind === 'nonterminal' && c.name === 'functionBody'
  ) || fnNode;
}

function collectOwnDeclaredLocals(scopeRootNode, isProgramRoot, helpers) {
  const locals = new Set();

  function visit(node, isRoot) {
    if (!node || node.kind !== 'nonterminal') {
      return;
    }
    if (!isRoot && (node.name === 'functionDeclaration'
      || node.name === 'functionExpression'
      || node.name === 'arrowFunction'
      || node.name === 'asyncArrowFunction'
      || node.name === 'methodDefinition')) {
      if (node.name === 'functionDeclaration') {
        const fnName = helpers.extractFunctionDeclarationName(node);
        if (fnName) {
          locals.add(fnName);
        }
      }
      return;
    }

    if (node.name === 'variableDeclaration' || node.name === 'lexicalBinding') {
      const bindingId = helpers.findFirstNonterminal(node, 'bindingIdentifier')
        || helpers.findFirstNonterminal(node, 'identifier');
      const name = bindingId ? helpers.findFirstIdentifierValue(bindingId) : null;
      if (name) {
        locals.add(name);
      }
    }

    if (node.name === 'catchClause' || node.name === 'catch') {
      const id = helpers.findFirstIdentifierValue(node);
      if (id) {
        locals.add(id);
      }
    }

    const children = node.children || [];
    for (let i = 0; i < children.length; i += 1) {
      visit(children[i], false);
    }
  }

  visit(scopeRootNode, true);
  return locals;
}

function collectMutatedIdentifiersInSubtree(rootNode, helpers) {
  const mutated = new Set();

  function visit(node, isRoot) {
    if (!node || node.kind !== 'nonterminal') {
      return;
    }
    if (!isRoot && (node.name === 'functionDeclaration'
      || node.name === 'functionExpression'
      || node.name === 'arrowFunction'
      || node.name === 'asyncArrowFunction')) {
      // We still want to know if an inner closure mutates an outer variable!
      // Descend into inner functions too.
    }

    if (node.name === 'assignmentExpression' || node.name === 'assignmentExpressionNoIn') {
      const children = node.children || [];
      const opNode = children.find((c) => c && c.kind === 'nonterminal' && c.name === 'assignmentOperator');
      if (opNode) {
        const opText = helpers.findFirstTerminalValue
          ? helpers.findFirstTerminalValue(opNode)
          : (opNode.children || []).filter((c) => c && c.kind === 'terminal').map((c) => c.value).join('');
        if (!opText || MUTATING_ASSIGNMENT_OPS.has(opText.trim())) {
          const lhs = children.find((c) => c && c.kind === 'nonterminal' && c.name === 'leftHandSideExpression');
          if (lhs) {
            // Direct identifier LHS (not member expression like obj.x = 1)
            const hasDotOrBracket = (lhs.children || []).some(
              (c) => c && c.kind === 'terminal' && (c.value === '.' || c.value === '[')
            ) || Boolean(helpers.findFirstNonterminal(lhs, 'arguments'));
            const memberNode = helpers.findFirstNonterminal(lhs, 'memberExpression');
            const memberHasDot = memberNode && (memberNode.children || []).some(
              (c) => c && c.kind === 'terminal' && (c.value === '.' || c.value === '[')
            );
            if (!hasDotOrBracket && !memberHasDot) {
              const id = helpers.findFirstIdentifierValue(lhs);
              if (id) {
                mutated.add(id);
              }
            }
          }
        }
      }
    }

    if (node.name === 'postfixExpression' || node.name === 'unaryExpression') {
      const children = node.children || [];
      const hasIncDec = children.some(
        (c) => c && c.kind === 'terminal' && (c.value === '++' || c.value === '--')
      );
      if (hasIncDec) {
        const lhs = helpers.findFirstNonterminal(node, 'leftHandSideExpression')
          || helpers.findFirstNonterminal(node, 'unaryExpression');
        if (lhs) {
          const memberNode = helpers.findFirstNonterminal(lhs, 'memberExpression');
          const memberHasDot = memberNode && (memberNode.children || []).some(
            (c) => c && c.kind === 'terminal' && (c.value === '.' || c.value === '[')
          );
          if (!memberHasDot) {
            const id = helpers.findFirstIdentifierValue(lhs);
            if (id) {
              mutated.add(id);
            }
          }
        }
      }
    }

    const children = node.children || [];
    for (let i = 0; i < children.length; i += 1) {
      visit(children[i], false);
    }
  }

  visit(rootNode, true);
  return mutated;
}

function collectReferencedIdentifiersDirect(bodyNode, helpers) {
  const refs = new Set();

  function visit(node) {
    if (!node || node.kind !== 'nonterminal') {
      return;
    }
    if (node.name === 'functionDeclaration'
      || node.name === 'functionExpression'
      || node.name === 'arrowFunction'
      || node.name === 'asyncArrowFunction') {
      return;
    }
    if (node.name === 'propertyName' || node.name === 'propertyIdentifierName' || node.name === 'bindingIdentifier') {
      return;
    }
    if (node.name === 'identifier' || node.name === 'identifierReference') {
      const id = helpers.findFirstIdentifierValue(node);
      if (id && !BUILTIN_GLOBAL_IDENTIFIERS.has(id)) {
        refs.add(id);
      }
      return;
    }
    const children = node.children || [];
    for (let i = 0; i < children.length; i += 1) {
      visit(children[i]);
    }
  }

  if (bodyNode) {
    visit(bodyNode);
  }
  return refs;
}

function isStaticArrayForEachCall(callExprNode, helpers) {
  if (!callExprNode || callExprNode.kind !== 'nonterminal' || callExprNode.name !== 'callExpression') {
    return false;
  }
  const memberExpr = helpers.findFirstNonterminal(callExprNode, 'memberExpression');
  if (!memberExpr) {
    return false;
  }
  const hasArrayLiteral = Boolean(helpers.findFirstNonterminal(memberExpr, 'arrayLiteral'));
  if (!hasArrayLiteral) {
    return false;
  }
  const propNode = helpers.findFirstNonterminal(memberExpr, 'propertyIdentifierName');
  const propName = propNode ? helpers.findFirstIdentifierValue(propNode) : null;
  return propName === 'forEach';
}

function isNonEscapingArrowBinding(scopeBodyNode, varName, helpers) {
  let escapes = false;
  walkAst(scopeBodyNode, (n) => {
    if (escapes || !n || n.kind !== 'nonterminal') {
      return false;
    }
    if (n.name === 'returnStatement') {
      walkAst(n, (inner) => {
        if (inner && inner.kind === 'nonterminal' && inner.name === 'identifier') {
          if (helpers.findFirstIdentifierValue(inner) === varName) {
            escapes = true;
            return false;
          }
        }
        return true;
      });
      return false;
    }
    if (n.name === 'argumentList') {
      walkAst(n, (inner) => {
        if (inner && inner.kind === 'nonterminal' && inner.name === 'identifier') {
          if (helpers.findFirstIdentifierValue(inner) === varName) {
            escapes = true;
            return false;
          }
        }
        return true;
      });
      return false;
    }
    return true;
  });
  return !escapes;
}

function analyzeClosures(tree, compileContext, helpers) {
  const scopesByNode = new Map();
  const orderedClosures = [];
  let nextFnId = 1;

  const topLevelFnNames = new Set();
  const topLevelVarNames = new Set();
  if (compileContext && compileContext.localFunctionNames) {
    for (const name of compileContext.localFunctionNames) {
      topLevelFnNames.add(name);
    }
  }
  if (compileContext && compileContext.topLevelBindingNames) {
    for (const name of compileContext.topLevelBindingNames) {
      topLevelVarNames.add(name);
    }
  }

  // Step 1: Build scope tree for program + all functions/arrows
  function buildScope(node, parentScope, isProgram, isTopLevelDecl) {
    const isClosure = !isProgram && isClosureCandidateNode(node, isTopLevelDecl);
    const params = isProgram ? [] : collectParamNames(node, helpers);
    const bodyNode = isProgram ? node : collectBodyNode(node, helpers);
    const locals = collectOwnDeclaredLocals(bodyNode || node, isProgram, helpers);
    const directRefs = collectReferencedIdentifiersDirect(bodyNode || node, helpers);
    const mutatedInSubtree = collectMutatedIdentifiersInSubtree(bodyNode || node, helpers);

    let selfName = null;
    if (!isProgram && (node.name === 'functionDeclaration' || node.name === 'functionExpression')) {
      selfName = helpers.extractFunctionDeclarationName
        ? helpers.extractFunctionDeclarationName(node)
        : null;
      if (!selfName && helpers.findFirstNonterminal) {
        const bi = (node.children || []).find((c) => c && c.kind === 'nonterminal' && c.name === 'bindingIdentifier')
          || (node.children || []).find((c) => c && c.kind === 'nonterminal' && c.name === 'identifier');
        if (bi) {
          selfName = helpers.findFirstIdentifierValue(bi);
        }
      }
    }

    const scope = {
      node,
      parentScope,
      isProgram,
      isClosure,
      isAsync: Boolean(node && (node.name === 'asyncArrowFunction' || node.name === 'asyncFunctionDeclaration' || node.name === 'asyncFunctionExpression')),
      fnId: isClosure ? nextFnId++ : 0,
      selfName,
      params,
      paramSet: new Set(params),
      locals,
      ownVars: new Set([...params, ...locals]),
      directRefs,
      mutatedInSubtree,
      capturedByInner: new Set(),
      boxedVars: new Set(),
      captures: [],
      children: [],
      returnTypeCpp: 'int'
    };

    if (parentScope) {
      parentScope.children.push(scope);
    }
    scopesByNode.set(node, scope);
    if (isClosure) {
      orderedClosures.push(scope);
    }

    // Discover nested functions/arrows inside bodyNode
    function discoverNested(curr, isRoot, parentCallExpr, parentVarDeclName) {
      if (!curr || curr.kind !== 'nonterminal') {
        return;
      }
      if (!isRoot && (curr.name === 'functionDeclaration'
        || curr.name === 'functionExpression'
        || curr.name === 'arrowFunction'
        || curr.name === 'asyncArrowFunction'
        || curr.name === 'methodDefinition')) {
        const childIsTopLevel = (isProgram && curr.name === 'functionDeclaration') || curr.name === 'methodDefinition';
        const childScope = buildScope(curr, scope, false, childIsTopLevel);
        if (curr.name === 'arrowFunction') {
          if (parentCallExpr && isStaticArrayForEachCall(parentCallExpr, helpers)) {
            childScope.isStaticallyInlined = true;
          } else if (parentVarDeclName && isNonEscapingArrowBinding(bodyNode || node, parentVarDeclName, helpers)) {
            childScope.isStaticallyInlined = true;
          }
        }
        return;
      }
      let nextCallExpr = parentCallExpr;
      if (curr.name === 'callExpression') {
        nextCallExpr = curr;
      }
      let nextVarDeclName = null;
      if (curr.name === 'variableDeclaration' || curr.name === 'lexicalBinding') {
        const bi = helpers.findFirstNonterminal(curr, 'bindingIdentifier')
          || helpers.findFirstNonterminal(curr, 'identifier');
        nextVarDeclName = bi ? helpers.findFirstIdentifierValue(bi) : null;
      } else if (parentVarDeclName && curr.name !== 'block' && curr.name !== 'statement') {
        nextVarDeclName = parentVarDeclName;
      }
      const children = curr.children || [];
      for (let i = 0; i < children.length; i += 1) {
        discoverNested(children[i], false, nextCallExpr, nextVarDeclName);
      }
    }

    discoverNested(bodyNode || node, true, null, null);
    return scope;
  }

  const rootScope = buildScope(tree, null, true, false);

  // Step 2: Resolve free variables bottom-up (so nested captures propagate to outer closures)
  function resolveFreeVars(scope) {
    const neededFromOuter = new Set();
    for (const ref of scope.directRefs) {
      if (!scope.ownVars.has(ref) && ref !== scope.selfName) {
        neededFromOuter.add(ref);
      }
    }
    for (const child of scope.children) {
      const childNeeded = resolveFreeVars(child);
      for (const name of childNeeded) {
        if (scope.ownVars.has(name)) {
          scope.capturedByInner.add(name);
        } else if (name !== scope.selfName) {
          neededFromOuter.add(name);
        }
      }
    }

    // Determine which of this scope's ownVars need mutable heap cells
    // Only box if captured by a closure that is NOT statically unrolled/inlined.
    const escapingChildren = scope.children.filter((child) => !child.isStaticallyInlined);
    const escapingCaptured = new Set();
    for (const child of escapingChildren) {
      if (child.neededFromOuter) {
        for (const name of child.neededFromOuter) {
          if (scope.ownVars.has(name)) {
            escapingCaptured.add(name);
          }
        }
      }
    }
    for (const name of escapingCaptured) {
      if (scope.mutatedInSubtree.has(name)) {
        scope.boxedVars.add(name);
      }
    }

    scope.neededFromOuter = neededFromOuter;
    return neededFromOuter;
  }

  resolveFreeVars(rootScope);

  // Step 3: Build concrete capture lists for each closure (mapping each captured var to its defining scope)
  function findDefiningScope(startScope, varName) {
    let curr = startScope.parentScope;
    while (curr) {
      if (curr.ownVars.has(varName)) {
        return curr;
      }
      curr = curr.parentScope;
    }
    return null;
  }

  for (const closure of orderedClosures) {
    const captureList = [];
    const sortedNames = Array.from(closure.neededFromOuter).sort();
    for (const name of sortedNames) {
      // Skip top-level C++ functions unless they are mutable/local bindings
      if (topLevelFnNames.has(name)) {
        continue;
      }
      const defScope = findDefiningScope(closure, name);
      if (!defScope) {
        continue;
      }
      const isBoxed = defScope.boxedVars.has(name);
      captureList.push({
        name,
        defScope,
        isBoxed,
        slotIndex: captureList.length
      });
    }
    closure.captures = captureList;
  }

  // Step 4: Register top-level function bindings that are referenced as values (e.g., passed as callbacks)
  const topLevelClosureByName = new Map();
  const topLevelBindingNodes = new Map();
  for (const child of rootScope.children) {
    if (!child.isClosure && child.node.name === 'functionDeclaration') {
      const fnName = helpers.extractFunctionDeclarationName(child.node);
      if (fnName) {
        topLevelBindingNodes.set(fnName, child);
      }
    }
  }
  // Also scan top-level variableDeclarations initialized to functionExpression / arrowFunction
  walkAst(tree, (n) => {
    if (!n || n.kind !== 'nonterminal') return true;
    if (n.name === 'variableDeclaration' || n.name === 'lexicalBinding') {
      const bi = helpers.findFirstNonterminal(n, 'bindingIdentifier') || helpers.findFirstNonterminal(n, 'identifier');
      const vName = bi ? helpers.findFirstIdentifierValue(bi) : null;
      if (vName && (topLevelFnNames.has(vName) || topLevelVarNames.has(vName))) {
        const fnExpr = helpers.findFirstNonterminal(n, 'functionExpression')
          || helpers.findFirstNonterminal(n, 'arrowFunction')
          || helpers.findFirstNonterminal(n, 'asyncArrowFunction');
        if (fnExpr && scopesByNode.has(fnExpr)) {
          topLevelBindingNodes.set(vName, scopesByNode.get(fnExpr));
        }
      }
      return false;
    }
    if (n.name === 'functionDeclaration' && n !== tree) {
      return false;
    }
    return true;
  });

  // Find identifiers used inside argumentList or returnStatement or assignment RHS that match topLevelBindingNodes
  walkAst(tree, (n) => {
    if (!n || n.kind !== 'nonterminal') return true;
    if (n.name === 'argumentList' || n.name === 'returnStatement' || n.name === 'arrayLiteral') {
      walkAst(n, (inner) => {
        if (!inner || inner.kind !== 'nonterminal') return true;
        if (inner.name === 'propertyName' || inner.name === 'propertyIdentifierName') return false;
        if (inner.name === 'identifier' || inner.name === 'identifierReference') {
          const id = helpers.findFirstIdentifierValue(inner);
          if (id && topLevelBindingNodes.has(id) && !topLevelClosureByName.has(id)) {
            const targetScope = topLevelBindingNodes.get(id);
            if (!targetScope.isClosure) {
              targetScope.isClosure = true;
              targetScope.fnId = nextFnId++;
              orderedClosures.push(targetScope);
            }
            topLevelClosureByName.set(id, targetScope);
          }
        }
        return true;
      });
    }
    return true;
  });

  return {
    rootScope,
    scopesByNode,
    orderedClosures,
    topLevelClosureByName
  };
}

function getBoxedVarsForNode(closurePlan, scopeNode) {
  if (!closurePlan || !closurePlan.scopesByNode) {
    return new Set();
  }
  const scope = closurePlan.scopesByNode.get(scopeNode);
  return scope ? scope.boxedVars : new Set();
}

function emitClosureCaptureEnvCode(closureScope, parentScope, compileContext) {
  if (!closureScope || !closureScope.captures || closureScope.captures.length === 0) {
    return { preLines: [], envExpr: '0' };
  }
  const envId = compileContext
    ? (compileContext._closureEnvCounter = (compileContext._closureEnvCounter || 0) + 1)
    : closureScope.fnId;
  const envVar = `__maia_env_${envId}`;
  const count = closureScope.captures.length;
  const preLines = [`int* ${envVar} = new int[${count}];`];
  for (let i = 0; i < count; i += 1) {
    const cap = closureScope.captures[i];
    if (cap.isBoxed) {
      // Pass the cell pointer as int
      preLines.push(`${envVar}[${i}] = (int)(__cell_${cap.name});`);
    } else {
      // Pass value directly (or if parent is itself a closure with inline mapping, use inlineIdentifierExpressions)
      const valExpr = (compileContext && compileContext.inlineIdentifierExpressions && compileContext.inlineIdentifierExpressions.get(cap.name))
        || cap.name;
      preLines.push(`${envVar}[${i}] = (int)(${valExpr});`);
    }
  }
  return { preLines, envExpr: `(void*)(${envVar})` };
}

function emitClosureRuntimeHelpersCpp(closurePlan, options = {}) {
  const hasPromises = Boolean(options && options.hasPromises);
  const closures = (closurePlan && closurePlan.orderedClosures) ? closurePlan.orderedClosures : [];
  const maxArity = closures.reduce((acc, c) => Math.max(acc, c.params.length), 4);
  const callArities = [];
  for (let a = 0; a <= Math.max(4, maxArity); a += 1) {
    callArities.push(a);
  }

  const lines = [];

  if (hasPromises) {
    lines.push('static int __maia_promise_resolve_value(void* p_ptr, int val);');
    lines.push('static int __maia_promise_reject_value(void* p_ptr, int reason);');
    lines.push('static int __maia_promise_all_on_resolve(void* item_ptr, int val);');
    lines.push('static int __maia_promise_all_on_reject(void* sh_ptr, int reason);');
    lines.push('static int __maia_promise_race_on_resolve(void* p_ptr, int val);');
    lines.push('static int __maia_promise_race_on_reject(void* p_ptr, int reason);');
    lines.push('static int __maia_promise_async_resume(void* env_ptr, int val);');
  }

  lines.push('static void* __maia_closure_alloc(int fn_id, int arity, int is_async, void* env) {');
  lines.push('  __maia_runtime_value* v = (__maia_runtime_value*)__maia_runtime_alloc_value(3, arity, is_async, 0);');
  lines.push('  v->fn_id = fn_id;');
  lines.push('  v->closure_env = env;');
  lines.push('  return (void*)v;');
  lines.push('}');

  lines.push('static void* __maia_closure_alloc_from_hook(void* ignored, int fn_id, int arity, int is_async, void* env) {');
  lines.push('  return __maia_closure_alloc(fn_id, arity, is_async, env);');
  lines.push('}');
  lines.push('static void* __maia_closure_bind(void* raw, int fn_id, void* env) {');
  lines.push('  __maia_runtime_value* v = (__maia_runtime_value*)raw;');
  lines.push('  if (v) {');
  lines.push('    v->fn_id = fn_id;');
  lines.push('    v->closure_env = env;');
  lines.push('  }');
  lines.push('  return raw;');
  lines.push('}');

  // Forward declarations for closure implementation functions
  for (const c of closures) {
    const retType = c.returnTypeCpp || 'int';
    const paramDecls = ['void* __maia_env'];
    for (let i = 0; i < c.params.length; i += 1) {
      paramDecls.push(`int __p${i}`);
    }
    lines.push(`static ${retType} __maia_closure_impl_${c.fnId}(${paramDecls.join(', ')});`);
  }

  // Forward declare dispatchers
  for (const arity of callArities) {
    const sigArgs = ['void* __fn_ptr'];
    for (let i = 0; i < arity; i += 1) {
      sigArgs.push(`int __a${i}`);
    }
    lines.push(`static int __maia_closure_call_i32_${arity}(${sigArgs.join(', ')});`);
    lines.push(`static void* __maia_closure_call_ptr_${arity}(${sigArgs.join(', ')});`);
    lines.push(`static double __maia_closure_call_f64_${arity}(${sigArgs.join(', ')});`);
  }

  // Dispatcher definitions
  for (const arity of callArities) {
    const sigArgs = ['void* __fn_ptr'];
    for (let i = 0; i < arity; i += 1) {
      sigArgs.push(`int __a${i}`);
    }

    // i32 dispatcher
    lines.push(`static int __maia_closure_call_i32_${arity}(${sigArgs.join(', ')}) {`);
    lines.push('  __maia_runtime_value* __c = (__maia_runtime_value*)__fn_ptr;');
    lines.push('  if (!__c) { return 0; }');
    lines.push('  int __fid = __c->fn_id;');
    if (hasPromises && arity === 0) {
      lines.push('  if (__fid == -1) { return __maia_promise_resolve_value(__c->closure_env, 0); }');
      lines.push('  if (__fid == -2) { return __maia_promise_reject_value(__c->closure_env, 0); }');
    } else if (hasPromises && arity >= 1) {
      lines.push('  if (__fid == -1) { return __maia_promise_resolve_value(__c->closure_env, __a0); }');
      lines.push('  if (__fid == -2) { return __maia_promise_reject_value(__c->closure_env, __a0); }');
      lines.push('  if (__fid == -3) { return __maia_promise_all_on_resolve(__c->closure_env, __a0); }');
      lines.push('  if (__fid == -4) { return __maia_promise_all_on_reject(__c->closure_env, __a0); }');
      lines.push('  if (__fid == -5) { return __maia_promise_race_on_resolve(__c->closure_env, __a0); }');
      lines.push('  if (__fid == -6) { return __maia_promise_race_on_reject(__c->closure_env, __a0); }');
      lines.push('  if (__fid == -7) { return __maia_promise_async_resume(__c->closure_env, __a0); }');
    }
    for (const c of closures) {
      const callArgs = ['__c->closure_env'];
      for (let i = 0; i < c.params.length; i += 1) {
        callArgs.push(i < arity ? `__a${i}` : '0');
      }
      const invoke = `__maia_closure_impl_${c.fnId}(${callArgs.join(', ')})`;
      const retCast = c.returnTypeCpp === 'int' ? invoke : `(int)(${invoke})`;
      lines.push(`  if (__fid == ${c.fnId}) { return ${retCast}; }`);
    }
    lines.push('  return 0;');
    lines.push('}');

    // ptr dispatcher
    lines.push(`static void* __maia_closure_call_ptr_${arity}(${sigArgs.join(', ')}) {`);
    lines.push('  __maia_runtime_value* __c = (__maia_runtime_value*)__fn_ptr;');
    lines.push('  if (!__c) { return 0; }');
    lines.push('  int __fid = __c->fn_id;');
    if (hasPromises && arity >= 1) {
      lines.push('  if (__fid == -1) { return (void*)__maia_promise_resolve_value(__c->closure_env, __a0); }');
      lines.push('  if (__fid == -2) { return (void*)__maia_promise_reject_value(__c->closure_env, __a0); }');
    }
    for (const c of closures) {
      const callArgs = ['__c->closure_env'];
      for (let i = 0; i < c.params.length; i += 1) {
        callArgs.push(i < arity ? `__a${i}` : '0');
      }
      const invoke = `__maia_closure_impl_${c.fnId}(${callArgs.join(', ')})`;
      const retCast = c.returnTypeCpp === 'void*' ? invoke : `(void*)(${invoke})`;
      lines.push(`  if (__fid == ${c.fnId}) { return ${retCast}; }`);
    }
    lines.push('  return 0;');
    lines.push('}');

    // f64 dispatcher
    lines.push(`static double __maia_closure_call_f64_${arity}(${sigArgs.join(', ')}) {`);
    lines.push('  __maia_runtime_value* __c = (__maia_runtime_value*)__fn_ptr;');
    lines.push('  if (!__c) { return 0.0; }');
    lines.push('  int __fid = __c->fn_id;');
    for (const c of closures) {
      const callArgs = ['__c->closure_env'];
      for (let i = 0; i < c.params.length; i += 1) {
        callArgs.push(i < arity ? `__a${i}` : '0');
      }
      const invoke = `__maia_closure_impl_${c.fnId}(${callArgs.join(', ')})`;
      let retCast = invoke;
      if (c.returnTypeCpp === 'void*') {
        retCast = `(double)(int)(${invoke})`;
      } else if (c.returnTypeCpp !== 'double') {
        retCast = `(double)(${invoke})`;
      }
      lines.push(`  if (__fid == ${c.fnId}) { return ${retCast}; }`);
    }
    lines.push('  return 0.0;');
    lines.push('}');
  }

  // Dynamic Array higher-order functions operating on __maia_runtime_value* arrays (tag == 2 || tag == 4)
  lines.push('static int __maia_array_forEach(void* arr_ptr, void* fn_ptr) {');
  lines.push('  __maia_runtime_value* arr = (__maia_runtime_value*)arr_ptr;');
  lines.push('  if (!arr || !fn_ptr) { return 0; }');
  lines.push('  for (int i = 0; i < arr->a; i++) {');
  lines.push('    __maia_closure_call_i32_3(fn_ptr, (int)(arr->items[i]), i, (int)arr_ptr);');
  lines.push('  }');
  lines.push('  return 0;');
  lines.push('}');

  lines.push('static void* __maia_array_map(void* arr_ptr, void* fn_ptr) {');
  lines.push('  __maia_runtime_value* arr = (__maia_runtime_value*)arr_ptr;');
  lines.push('  if (!arr) { return __maia_runtime_alloc_value(2, 0, 0, 0); }');
  lines.push('  __maia_runtime_value* out = (__maia_runtime_value*)__maia_runtime_alloc_value(2, arr->a, 0, 0);');
  lines.push('  if (!fn_ptr) { return (void*)out; }');
  lines.push('  for (int i = 0; i < arr->a; i++) {');
  lines.push('    out->items[i] = (long)__maia_closure_call_i32_3(fn_ptr, (int)(arr->items[i]), i, (int)arr_ptr);');
  lines.push('  }');
  lines.push('  return (void*)out;');
  lines.push('}');

  lines.push('static void* __maia_array_filter(void* arr_ptr, void* fn_ptr) {');
  lines.push('  __maia_runtime_value* arr = (__maia_runtime_value*)arr_ptr;');
  lines.push('  if (!arr) { return __maia_runtime_alloc_value(2, 0, 0, 0); }');
  lines.push('  __maia_runtime_value* out = (__maia_runtime_value*)__maia_runtime_alloc_value(2, arr->a, 0, 0);');
  lines.push('  int count = 0;');
  lines.push('  if (fn_ptr) {');
  lines.push('    for (int i = 0; i < arr->a; i++) {');
  lines.push('      if (__maia_closure_call_i32_3(fn_ptr, (int)(arr->items[i]), i, (int)arr_ptr)) {');
  lines.push('        out->items[count] = arr->items[i];');
  lines.push('        count++;');
  lines.push('      }');
  lines.push('    }');
  lines.push('  }');
  lines.push('  out->a = count;');
  lines.push('  return (void*)out;');
  lines.push('}');

  lines.push('static int __maia_array_reduce(void* arr_ptr, void* fn_ptr, int has_init, int init_val) {');
  lines.push('  __maia_runtime_value* arr = (__maia_runtime_value*)arr_ptr;');
  lines.push('  if (!arr || !fn_ptr) { return init_val; }');
  lines.push('  int start = 0;');
  lines.push('  int acc = init_val;');
  lines.push('  if (!has_init) {');
  lines.push('    if (arr->a <= 0) { return 0; }');
  lines.push('    acc = (int)(arr->items[0]);');
  lines.push('    start = 1;');
  lines.push('  }');
  lines.push('  for (int i = start; i < arr->a; i++) {');
  lines.push('    acc = __maia_closure_call_i32_4(fn_ptr, acc, (int)(arr->items[i]), i, (int)arr_ptr);');
  lines.push('  }');
  lines.push('  return acc;');
  lines.push('}');

  lines.push('static int __maia_array_reduceRight(void* arr_ptr, void* fn_ptr, int has_init, int init_val) {');
  lines.push('  __maia_runtime_value* arr = (__maia_runtime_value*)arr_ptr;');
  lines.push('  if (!arr || !fn_ptr) { return init_val; }');
  lines.push('  int start = arr->a - 1;');
  lines.push('  int acc = init_val;');
  lines.push('  if (!has_init) {');
  lines.push('    if (arr->a <= 0) { return 0; }');
  lines.push('    acc = (int)(arr->items[start]);');
  lines.push('    start = start - 1;');
  lines.push('  }');
  lines.push('  for (int i = start; i >= 0; i--) {');
  lines.push('    acc = __maia_closure_call_i32_4(fn_ptr, acc, (int)(arr->items[i]), i, (int)arr_ptr);');
  lines.push('  }');
  lines.push('  return acc;');
  lines.push('}');

  lines.push('static int __maia_array_find(void* arr_ptr, void* fn_ptr) {');
  lines.push('  __maia_runtime_value* arr = (__maia_runtime_value*)arr_ptr;');
  lines.push('  if (!arr || !fn_ptr) { return 0; }');
  lines.push('  for (int i = 0; i < arr->a; i++) {');
  lines.push('    if (__maia_closure_call_i32_3(fn_ptr, (int)(arr->items[i]), i, (int)arr_ptr)) {');
  lines.push('      return (int)(arr->items[i]);');
  lines.push('    }');
  lines.push('  }');
  lines.push('  return 0;');
  lines.push('}');

  lines.push('static int __maia_array_findIndex(void* arr_ptr, void* fn_ptr) {');
  lines.push('  __maia_runtime_value* arr = (__maia_runtime_value*)arr_ptr;');
  lines.push('  if (!arr || !fn_ptr) { return -1; }');
  lines.push('  for (int i = 0; i < arr->a; i++) {');
  lines.push('    if (__maia_closure_call_i32_3(fn_ptr, (int)(arr->items[i]), i, (int)arr_ptr)) {');
  lines.push('      return i;');
  lines.push('    }');
  lines.push('  }');
  lines.push('  return -1;');
  lines.push('}');

  lines.push('static int __maia_array_some(void* arr_ptr, void* fn_ptr) {');
  lines.push('  __maia_runtime_value* arr = (__maia_runtime_value*)arr_ptr;');
  lines.push('  if (!arr || !fn_ptr) { return 0; }');
  lines.push('  for (int i = 0; i < arr->a; i++) {');
  lines.push('    if (__maia_closure_call_i32_3(fn_ptr, (int)(arr->items[i]), i, (int)arr_ptr)) {');
  lines.push('      return 1;');
  lines.push('    }');
  lines.push('  }');
  lines.push('  return 0;');
  lines.push('}');

  lines.push('static int __maia_array_every(void* arr_ptr, void* fn_ptr) {');
  lines.push('  __maia_runtime_value* arr = (__maia_runtime_value*)arr_ptr;');
  lines.push('  if (!arr || !fn_ptr) { return 1; }');
  lines.push('  for (int i = 0; i < arr->a; i++) {');
  lines.push('    if (!__maia_closure_call_i32_3(fn_ptr, (int)(arr->items[i]), i, (int)arr_ptr)) {');
  lines.push('      return 0;');
  lines.push('    }');
  lines.push('  }');
  lines.push('  return 1;');
  lines.push('}');

  return lines.join('\n');
}

module.exports = {
  analyzeClosures,
  getBoxedVarsForNode,
  emitClosureCaptureEnvCode,
  emitClosureRuntimeHelpersCpp
};
