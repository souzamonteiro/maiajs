'use strict';

const closures = require('./closures');
const iterators = require('./iterators');
const {
  walk,
  flattenNodeText,
  findFirstIdentifierValue,
  findFirstNonterminal
} = require('./ast-utils');

function createStatementLowering(deps) {
  const {
    beginDeferredPromiseQueueScope,
    castReturnExpression,
    cppArgType,
    defaultCppValue,
    emitTopLevelFunctionDefinitions,
    err,
    extractAsyncFunctionDeclarationFromStatement,
    extractClassDeclarationFromStatement,
    extractDirectArrowFunctionInitializer,
    extractDirectCallExpressionNode,
    extractDirectFunctionExpressionInitializer,
    extractDirectNewClassInfo,
    extractFunctionDeclarationFromStatement,
    extractFunctionDeclarationName,
    extractTopLevelStatementNodes,
    findFirstPromiseThenCallExpression,
    getClassInitWrapperMangledName,
    inferExprType,
    inferInitializerCppType,
    isDroppedDirectJsRuntimeMethodCallExpression,
    lowerExpressionValue,
    lowerRequiredExpressionValue,
    lowerStaticModelToExpression,
    lowerStaticModelToRuntimeExpression,
    profileLog,
    reportUnsupportedLowering,
    resetStatementLoweringState,
    resolveStaticModelFromExpression,
    sanitizeCppIdentifier,
    staticStringLiteralCpp,
    takeDeferredPromiseStatements,
    takePreludeStatements,
    tryLowerIifeExpressionStatement,
    tryLowerStaticPromiseThenChain
  } = deps;

  function extractArrayBindingIdentifiers(arrayBindingPatternNode, compileContext = null) {
    const names = [];
    if (!arrayBindingPatternNode || arrayBindingPatternNode.kind !== 'nonterminal' || arrayBindingPatternNode.name !== 'arrayBindingPattern') {
      if (compileContext) {
        reportUnsupportedLowering(
          compileContext,
          'destructuring-binding-unlowerable',
          'arrayBindingPattern node is missing or malformed while extracting identifiers'
        );
        if (compileContext.strictLowering) {
          err('unsupported lowering: arrayBindingPattern node');
        }
      }
      return names;
    }

    let bel = (arrayBindingPatternNode.children || []).find(
      (c) => c && c.kind === 'nonterminal' && c.name === 'bindingElementList'
    ) || null;
    if (!bel) {
      bel = findFirstNonterminal(arrayBindingPatternNode, 'bindingElementList');
    }
    if (!bel) { return names; }
    for (const child of (bel.children || [])) {
      if (!child || child.kind !== 'nonterminal' || child.name !== 'bindingElisionElement') { continue; }
      const ident = findFirstIdentifierValue(child);
      if (ident) { names.push(ident); }
    }
    return names;
  }

  // Returns simple array bindings together with their source indexes. This keeps
  // the supported destructuring subset deliberately narrow: defaults, nested
  // patterns, and rest bindings need JavaScript runtime semantics.
  function extractSimpleArrayBindingEntries(arrayBindingPatternNode) {
    if (!arrayBindingPatternNode
      || arrayBindingPatternNode.kind !== 'nonterminal'
      || arrayBindingPatternNode.name !== 'arrayBindingPattern') {
      return null;
    }

    const bindingElementList = (arrayBindingPatternNode.children || []).find(
      (child) => child && child.kind === 'nonterminal' && child.name === 'bindingElementList'
    ) || findFirstNonterminal(arrayBindingPatternNode, 'bindingElementList');
    const restBinding = (arrayBindingPatternNode.children || []).find(
      (child) => child && child.kind === 'nonterminal' && child.name === 'bindingRestElement'
    );
    if (!bindingElementList || restBinding) {
      return null;
    }

    const entries = [];
    let sourceIndex = 0;
    for (const child of (bindingElementList.children || [])) {
      if (!child || child.kind !== 'nonterminal' || child.name !== 'bindingElisionElement') {
        continue;
      }
      const elision = (child.children || []).find(
        (candidate) => candidate && candidate.kind === 'nonterminal' && candidate.name === 'elision'
      );
      if (elision) {
        sourceIndex += (elision.children || []).filter(
          (candidate) => candidate && candidate.kind === 'terminal' && candidate.value === ','
        ).length;
      }
      const bindingElement = (child.children || []).find(
        (candidate) => candidate && candidate.kind === 'nonterminal' && candidate.name === 'bindingElement'
      );
      const singleNameBinding = bindingElement && (bindingElement.children || []).find(
        (candidate) => candidate && candidate.kind === 'nonterminal' && candidate.name === 'singleNameBinding'
      );
      if (!bindingElement || !singleNameBinding || findFirstNonterminal(singleNameBinding, 'initializer')) {
        return null;
      }
      const bindingName = findFirstIdentifierValue(singleNameBinding);
      if (!bindingName) {
        return null;
      }
      entries.push({ name: bindingName, index: sourceIndex });
      sourceIndex += 1;
    }
    return entries.length > 0 ? entries : null;
  }

  // Returns array of identifier name strings from objectBindingPattern
  function extractObjectBindingIdentifiers(objectBindingPatternNode, compileContext = null) {
    const names = [];
    if (!objectBindingPatternNode || objectBindingPatternNode.kind !== 'nonterminal' || objectBindingPatternNode.name !== 'objectBindingPattern') {
      if (compileContext) {
        reportUnsupportedLowering(
          compileContext,
          'destructuring-binding-unlowerable',
          'objectBindingPattern node is missing or malformed while extracting identifiers'
        );
        if (compileContext.strictLowering) {
          err('unsupported lowering: objectBindingPattern node');
        }
      }
      return names;
    }

    let bpl = (objectBindingPatternNode.children || []).find(
      (c) => c && c.kind === 'nonterminal' && c.name === 'bindingPropertyList'
    ) || null;
    if (!bpl) {
      bpl = findFirstNonterminal(objectBindingPatternNode, 'bindingPropertyList');
    }
    if (!bpl) { return names; }
    for (const child of (bpl.children || [])) {
      if (!child || child.kind !== 'nonterminal' || child.name !== 'bindingProperty') { continue; }
      const ident = findFirstIdentifierValue(child);
      if (ident) { names.push(ident); }
    }
    return names;
  }

  // The parser currently exposes shorthand object bindings directly as
  // bindingProperty -> singleNameBinding. Keep aliases and defaults on the
  // diagnostic path until their JavaScript evaluation rules are lowered.
  function extractSimpleObjectBindingEntries(objectBindingPatternNode) {
    if (!objectBindingPatternNode
      || objectBindingPatternNode.kind !== 'nonterminal'
      || objectBindingPatternNode.name !== 'objectBindingPattern') {
      return null;
    }

    const bindingPropertyList = (objectBindingPatternNode.children || []).find(
      (child) => child && child.kind === 'nonterminal' && child.name === 'bindingPropertyList'
    ) || findFirstNonterminal(objectBindingPatternNode, 'bindingPropertyList');
    const restBinding = (objectBindingPatternNode.children || []).find(
      (child) => child && child.kind === 'nonterminal' && child.name === 'bindingRestProperty'
    );
    if (!bindingPropertyList || restBinding) {
      return null;
    }

    const entries = [];
    for (const child of (bindingPropertyList.children || [])) {
      if (!child || child.kind !== 'nonterminal' || child.name !== 'bindingProperty') {
        continue;
      }
      const singleNameBinding = (child.children || []).find(
        (candidate) => candidate && candidate.kind === 'nonterminal' && candidate.name === 'singleNameBinding'
      );
      if (singleNameBinding) {
        const bindingName = findFirstIdentifierValue(singleNameBinding);
        if (!bindingName) return null;
        entries.push({ name: bindingName, property: bindingName });
        continue;
      }
      const propNameNode = (child.children || []).find((c) => c && c.kind === 'nonterminal' && c.name === 'propertyName');
      const bindingElemNode = (child.children || []).find((c) => c && c.kind === 'nonterminal' && c.name === 'bindingElement');
      const propName = propNameNode ? findFirstIdentifierValue(propNameNode) : null;
      const bindingName = bindingElemNode ? findFirstIdentifierValue(bindingElemNode) : null;
      if (!propName || !bindingName) {
        return null;
      }
      entries.push({ name: bindingName, property: propName });
    }
    return entries.length > 0 ? entries : null;
  }

  function extractVariableDeclarations(variableDeclarationListNode, compileContext = null) {
    if (!variableDeclarationListNode || variableDeclarationListNode.kind !== 'nonterminal' || variableDeclarationListNode.name !== 'variableDeclarationList') {
      if (compileContext) {
        reportUnsupportedLowering(
          compileContext,
          'variable-declaration-unlowerable',
          'variableDeclarationList node is missing or malformed while extracting declarations'
        );
        if (compileContext.strictLowering) {
          err('unsupported lowering: variableDeclarationList node');
        }
      }
      return [];
    }

    let declarations = (variableDeclarationListNode.children || []).filter(
      (child) => child && child.kind === 'nonterminal' && child.name === 'variableDeclaration'
    );
    if (declarations.length === 0) {
      const fallbackCandidates = [];
      walk(variableDeclarationListNode, (node) => {
        if (node && node.kind === 'nonterminal' && node.name === 'variableDeclaration' && node !== variableDeclarationListNode) {
          fallbackCandidates.push(node);
        }
      });
      if (fallbackCandidates.length > 0) {
        declarations = fallbackCandidates;
      }
    }
    return declarations;
  }

  function extractVariableDeclarationName(variableDeclarationNode, compileContext = null) {
    if (!variableDeclarationNode || variableDeclarationNode.kind !== 'nonterminal' || variableDeclarationNode.name !== 'variableDeclaration') {
      if (compileContext) {
        reportUnsupportedLowering(
          compileContext,
          'variable-name-unlowerable',
          'variable declaration node is missing or malformed while extracting name'
        );
        if (compileContext.strictLowering) {
          err('unsupported lowering: variable declaration name node');
        }
      }
      return null;
    }

    const bindingPattern = (variableDeclarationNode.children || []).find(
      (child) => child && child.kind === 'nonterminal' && child.name === 'bindingPattern'
    ) || null;
    if (bindingPattern) {
      return null;
    }

    let bindingIdentifier = (variableDeclarationNode.children || []).find(
      (child) => child && child.kind === 'nonterminal' && child.name === 'bindingIdentifier'
    ) || null;
    if (!bindingIdentifier) {
      bindingIdentifier = findFirstNonterminal(variableDeclarationNode, 'bindingIdentifier');
    }
    const variableName = bindingIdentifier ? findFirstIdentifierValue(bindingIdentifier) : null;
    if (!variableName && compileContext) {
      reportUnsupportedLowering(
        compileContext,
        'variable-name-unlowerable',
        'variable declaration bindingIdentifier could not be resolved'
      );
      if (compileContext.strictLowering) {
        err('unsupported lowering: variable declaration bindingIdentifier');
      }
    }
    return variableName;
  }

  function extractVariableDeclarationInitializer(variableDeclarationNode, compileContext = null) {
    if (!variableDeclarationNode || variableDeclarationNode.kind !== 'nonterminal' || variableDeclarationNode.name !== 'variableDeclaration') {
      if (compileContext) {
        reportUnsupportedLowering(
          compileContext,
          'variable-initializer-unlowerable',
          'variable declaration node is missing or malformed while extracting initializer'
        );
        if (compileContext.strictLowering) {
          err('unsupported lowering: variable declaration initializer node');
        }
      }
      return null;
    }

    let initializer = (variableDeclarationNode.children || []).find(
      (child) => child && child.kind === 'nonterminal' && child.name === 'initializer'
    ) || null;
    if (!initializer) {
      initializer = findFirstNonterminal(variableDeclarationNode, 'initializer');
    }
    if (!initializer) {
      return null;
    }

    let assignmentExpression = (initializer.children || []).find(
      (child) => child && child.kind === 'nonterminal' && child.name === 'assignmentExpression'
    ) || null;
    if (!assignmentExpression) {
      assignmentExpression = findFirstNonterminal(initializer, 'assignmentExpression');
    }
    if (!assignmentExpression && compileContext) {
      reportUnsupportedLowering(
        compileContext,
        'variable-initializer-unlowerable',
        'variable initializer node does not contain assignmentExpression'
      );
      if (compileContext.strictLowering) {
        err('unsupported lowering: variable initializer assignmentExpression');
      }
    }
    return assignmentExpression;
  }

  function lowerVariableDeclarations(statementNode, compileContext, indent = '  ') {
    const lowered = [];
    // Use compileContext to maintain unique temp var count across statements
    if (compileContext && compileContext._destrCount === undefined) {
      compileContext._destrCount = 0;
    }
    const nextDestrIdx = () => compileContext ? compileContext._destrCount++ : 0;
    const declarationNode = (statementNode.children || []).find(
      (child) => child
        && child.kind === 'nonterminal'
        && (child.name === 'variableStatement' || child.name === 'letDeclaration' || child.name === 'constDeclaration')
    );

    if (!declarationNode) {
      return lowered;
    }

    const isConst = declarationNode.name === 'constDeclaration';
    const variableDeclarationList = (declarationNode.children || []).find(
      (child) => child && child.kind === 'nonterminal' && child.name === 'variableDeclarationList'
    );
    if (!variableDeclarationList) {
      reportUnsupportedLowering(
        compileContext,
        'variable-declaration-unlowerable',
        'variable declaration statement is missing variableDeclarationList'
      );
      if (compileContext && compileContext.strictLowering) {
        err('unsupported lowering: variable declaration list missing');
      }
      return lowered;
    }

    const declarations = extractVariableDeclarations(variableDeclarationList, compileContext);
    if (declarations.length === 0) {
      reportUnsupportedLowering(
        compileContext,
        'variable-declaration-unlowerable',
        'variable declaration list contains no variableDeclaration nodes'
      );
      if (compileContext && compileContext.strictLowering) {
        err('unsupported lowering: empty variable declaration list');
      }
      return lowered;
    }

    const topLevelStatements = compileContext && compileContext.tree
      ? extractTopLevelStatementNodes(compileContext.tree)
      : [];
    const isTopLevelStatement = topLevelStatements.includes(statementNode);

    for (const variableDeclaration of declarations) {
      const variableName = extractVariableDeclarationName(variableDeclaration, compileContext);
      if (!variableName) {
        // Check for destructuring pattern
        const bindingPatternNode = (variableDeclaration.children || []).find(
          (c) => c && c.kind === 'nonterminal' && c.name === 'bindingPattern'
        );
        if (bindingPatternNode) {
          const arrayPattern = (bindingPatternNode.children || []).find(
            (c) => c && c.kind === 'nonterminal' && c.name === 'arrayBindingPattern'
          );
          const objectPattern = (bindingPatternNode.children || []).find(
            (c) => c && c.kind === 'nonterminal' && c.name === 'objectBindingPattern'
          );

          if (arrayPattern) {
            const names = extractArrayBindingIdentifiers(arrayPattern, compileContext);
            const namesLabel = names.length > 0 ? names.join(', ') : '(empty pattern)';
            const arrayBindings = extractSimpleArrayBindingEntries(arrayPattern);
            const initializerExpr = extractVariableDeclarationInitializer(variableDeclaration, compileContext);
            const sourceModel = arrayBindings && initializerExpr
              ? resolveStaticModelFromExpression(initializerExpr, initializerExpr, compileContext)
              : null;
            const hasStaticScalarValues = sourceModel
              && sourceModel.kind === 'array'
              && Array.isArray(sourceModel.values)
              && arrayBindings
              && arrayBindings.every((binding) => {
                const value = sourceModel.values[binding.index];
                return value && ['number', 'string', 'bool'].includes(value.kind);
              });
            if (hasStaticScalarValues) {
              for (const binding of arrayBindings) {
                const valueModel = sourceModel.values[binding.index];
                const cppType = valueModel.kind === 'string'
                  ? 'const char*'
                  : (valueModel.kind === 'number' ? 'double' : 'int');
                const constQualifier = isConst && cppType !== 'const char*' ? 'const ' : '';
                lowered.push(`${indent}${constQualifier}${cppType} ${binding.name} = ${lowerStaticModelToExpression(valueModel)};`);
              }
              continue;
            }
            if (arrayBindings && initializerExpr) {
              const loweredInit = lowerExpressionValue(initializerExpr, compileContext);
              if (loweredInit !== null) {
                if (compileContext) compileContext.runtimeFallbackHelpersUsed = true;
                lowered.push(...takePreludeStatements(compileContext, indent));
                const tmpIdx = ((compileContext && compileContext._destrTmpCount) || 0) + 1;
                if (compileContext) compileContext._destrTmpCount = tmpIdx;
                const tmpVar = `__maia_destr_arr_${tmpIdx}`;
                lowered.push(`${indent}void* ${tmpVar} = (void*)(${loweredInit});`);
                for (const binding of arrayBindings) {
                  if (compileContext) {
                    if (!compileContext.localVariables) compileContext.localVariables = new Map();
                    compileContext.localVariables.set(binding.name, 'void*');
                  }
                  lowered.push(`${indent}void* ${binding.name} = (void*)(__maia_runtime_value_get_index(${tmpVar}, ${binding.index}));`);
                }
                continue;
              }
            }
            reportUnsupportedLowering(
              compileContext,
              'unsupported-array-destructuring',
              `array destructuring is not supported (${namesLabel})`
            );
            lowered.push(`${indent}// [unsupported array destructuring lowered to default values] ${namesLabel}`);
          } else if (objectPattern) {
            const names = extractObjectBindingIdentifiers(objectPattern, compileContext);
            const namesLabel = names.length > 0 ? names.join(', ') : '(empty pattern)';
            const objectBindings = extractSimpleObjectBindingEntries(objectPattern);
            const initializerExpr = extractVariableDeclarationInitializer(variableDeclaration, compileContext);
            const sourceModel = objectBindings && initializerExpr
              ? resolveStaticModelFromExpression(initializerExpr, initializerExpr, compileContext)
              : null;
            const hasStaticScalarValues = sourceModel
              && sourceModel.kind === 'object'
              && sourceModel.properties instanceof Map
              && objectBindings
              && objectBindings.every((binding) => {
                const value = sourceModel.properties.get(binding.property);
                return value && ['number', 'string', 'bool'].includes(value.kind);
              });
            if (hasStaticScalarValues) {
              for (const binding of objectBindings) {
                const valueModel = sourceModel.properties.get(binding.property);
                const cppType = valueModel.kind === 'string'
                  ? 'const char*'
                  : (valueModel.kind === 'number' ? 'double' : 'int');
                const constQualifier = isConst && cppType !== 'const char*' ? 'const ' : '';
                lowered.push(`${indent}${constQualifier}${cppType} ${binding.name} = ${lowerStaticModelToExpression(valueModel)};`);
              }
              continue;
            }
            if (objectBindings && initializerExpr) {
              const loweredInit = lowerExpressionValue(initializerExpr, compileContext);
              if (loweredInit !== null) {
                if (compileContext) compileContext.runtimeFallbackHelpersUsed = true;
                lowered.push(...takePreludeStatements(compileContext, indent));
                const tmpIdx = ((compileContext && compileContext._destrTmpCount) || 0) + 1;
                if (compileContext) compileContext._destrTmpCount = tmpIdx;
                const tmpVar = `__maia_destr_obj_${tmpIdx}`;
                lowered.push(`${indent}void* ${tmpVar} = (void*)(${loweredInit});`);
                for (const binding of objectBindings) {
                  if (compileContext) {
                    if (!compileContext.localVariables) compileContext.localVariables = new Map();
                    compileContext.localVariables.set(binding.name, 'void*');
                  }
                  lowered.push(`${indent}void* ${binding.name} = (void*)(__maia_runtime_value_get_property(${tmpVar}, (void*)${staticStringLiteralCpp(binding.property)}));`);
                }
                continue;
              }
            }
            reportUnsupportedLowering(
              compileContext,
              'unsupported-object-destructuring',
              `object destructuring is not supported (${namesLabel})`
            );
            lowered.push(`${indent}// [unsupported object destructuring lowered to default values] ${namesLabel}`);
          } else {
            reportUnsupportedLowering(
              compileContext,
              'unsupported-destructuring-pattern',
              'destructuring pattern is not supported'
            );
            lowered.push(`${indent}// [unsupported destructuring pattern lowered to default values]`);
          }
          continue;
        } else {
          reportUnsupportedLowering(
            compileContext,
            'variable-name-unlowerable',
            'variable declaration has no extractable binding name and is not destructuring'
          );
          if (compileContext && compileContext.strictLowering) {
            err('unsupported lowering: variable binding name extraction');
          }
          lowered.push(`${indent}// [variable declaration without supported binding name]`);
        }
        continue;
      }

      const initializerExpr = extractVariableDeclarationInitializer(variableDeclaration, compileContext);
      const asyncStateField = compileContext
        && compileContext.asyncStateLocalFields
        && compileContext.asyncStateLocalFields.get(variableName);
      const topLevelFunctionExpression = isTopLevelStatement
        ? extractDirectFunctionExpressionInitializer(initializerExpr)
        : null;
      if (topLevelFunctionExpression) {
        continue;
      }

      const topLevelArrowFunction = isTopLevelStatement
        ? extractDirectArrowFunctionInitializer(initializerExpr)
        : null;
      // Non-capturing top-level arrows have a concrete C++ function definition
      // emitted by emitTopLevelFunctionDefinitions(). Emitting a second void*
      // variable with the same binding name shadows that function and turns a
      // valid call such as increment(4) into an invalid pointer invocation.
      if (topLevelArrowFunction
        && topLevelArrowFunction.name === 'arrowFunction'
        && compileContext
        && compileContext.topLevelArrowFunctionSymbols
        && compileContext.topLevelArrowFunctionSymbols.has(topLevelArrowFunction)) {
        continue;
      }

      const newClassInfo = extractDirectNewClassInfo(initializerExpr, compileContext);
      if (newClassInfo) {
        lowered.push(`${indent}${newClassInfo.className} ${variableName};`);
        const ctorSymbol = getClassInitWrapperMangledName(newClassInfo.className, newClassInfo.argCount);
        lowered.push(`${indent}${ctorSymbol}((${newClassInfo.className}*)&${variableName}${newClassInfo.args && newClassInfo.args.trim() ? `, ${newClassInfo.args}` : ''});`);
        continue;
      }

      const cppType = inferInitializerCppType(initializerExpr, compileContext);
      // Only replace a declaration initializer with a static result when it is
      // itself a call. Aggregate literals have dedicated lowerers that preserve
      // their values, spreads and holes; resolving them here would discard that
      // structure and emit only a length-tagged runtime allocation.
      const directInitializerCall = initializerExpr
        ? extractDirectCallExpressionNode(initializerExpr)
        : null;
      const hasDynamicClosureCallback = Boolean(
        directInitializerCall
        && compileContext
        && compileContext.closurePlan
        && compileContext.closurePlan.orderedClosures.length > 0
        && (() => {
          const fn = findFirstNonterminal(directInitializerCall, 'arrowFunction') || findFirstNonterminal(directInitializerCall, 'functionExpression');
          if (!fn) return false;
          const scope = compileContext.closurePlan.scopesByNode && compileContext.closurePlan.scopesByNode.get(fn);
          const hasCapture = Boolean(scope && ((scope.captures && scope.captures.length > 0) || (scope.boxedVars && scope.boxedVars.size > 0)));
          const isLiteralBase = Boolean(findFirstNonterminal(directInitializerCall, 'arrayLiteral'));
          return hasCapture || !isLiteralBase;
        })()
      );
      const staticRuntimeInit = (directInitializerCall && !hasDynamicClosureCallback)
        ? lowerStaticModelToRuntimeExpression(
          resolveStaticModelFromExpression(directInitializerCall, directInitializerCall, compileContext)
        )
        : null;
      const droppedDirectJsRuntimeCall = staticRuntimeInit === null && Boolean(
        initializerExpr && isDroppedDirectJsRuntimeMethodCallExpression(initializerExpr, compileContext)
      );
      const directArrowInit = extractDirectArrowFunctionInitializer(initializerExpr);
      if (directArrowInit && compileContext) {
        compileContext._deferClosureBindForVarDecl = true;
        compileContext._pendingClosureBind = null;
      }
      const loweredInit = staticRuntimeInit !== null
        ? staticRuntimeInit
        : (droppedDirectJsRuntimeCall
          ? null
          : (initializerExpr ? lowerExpressionValue(initializerExpr, compileContext) : null));
      const pendingClosureBind = compileContext ? compileContext._pendingClosureBind : null;
      if (compileContext) {
        compileContext._deferClosureBindForVarDecl = false;
        compileContext._pendingClosureBind = null;
      }
      lowered.push(...takePreludeStatements(compileContext, indent));
      if (initializerExpr && loweredInit === null && !droppedDirectJsRuntimeCall) {
        reportUnsupportedLowering(
          compileContext,
          'variable-initializer-unlowerable',
          `variable initializer for '${variableName}' could not be lowered`
        );
        if (compileContext && compileContext.strictLowering) {
          err(`unsupported lowering: variable initializer '${variableName}'`);
        }
      }
      let inferredFromLoweredInit = loweredInit && /(^|[^A-Za-z0-9_])(\||\^|&|<<|>>)([^A-Za-z0-9_]|$)/.test(loweredInit)
        ? 'int'
        : cppType;
      const trimmedCallMatch = loweredInit ? loweredInit.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)\(/) : null;
      if (loweredInit && (/^__maia_iter_next\(/.test(loweredInit.trim()) || (trimmedCallMatch && compileContext && compileContext.generatorFunctionNames && compileContext.generatorFunctionNames.has(trimmedCallMatch[1])))) {
        inferredFromLoweredInit = 'void*';
        if (compileContext && compileContext.localVariables) compileContext.localVariables.set(variableName, 'void*');
      }
      if (inferredFromLoweredInit === 'void*' && loweredInit) {
        const trimmedInit = loweredInit.trim();
        if (/^__maia_closure_call_i32_\d+\(/.test(trimmedInit)) {
          inferredFromLoweredInit = 'int';
        } else if (/^(?:__maia_str_chain_\d+|__maiaregex__replace\(|__maia_array_join\(|__maia_str_slice\()/.test(trimmedInit)) {
          inferredFromLoweredInit = 'const char*';
        } else if (
          !/["]|void\*|__maia_closure_alloc|__maia_closure_bind|__maia_array_|__maia_runtime_|new /.test(trimmedInit)
          && /(^|[^A-Za-z0-9_])[+\-*/%]([^A-Za-z0-9_]|$)/.test(trimmedInit)
        ) {
          inferredFromLoweredInit = 'int';
        }
        if (inferredFromLoweredInit !== cppType && compileContext && compileContext.localVariables) {
          compileContext.localVariables.set(variableName, inferredFromLoweredInit);
        }
      }
      const initValue = loweredInit !== null ? loweredInit : defaultCppValue(inferredFromLoweredInit);

      if (asyncStateField) {
        lowered.push(`${indent}__sm->${asyncStateField} = ${initValue};`);
        continue;
      }

      if (compileContext && compileContext.activeBoxedVars && compileContext.activeBoxedVars.has(variableName)) {
        if (!compileContext.inlineIdentifierExpressions) {
          compileContext.inlineIdentifierExpressions = new Map();
        }
        lowered.push(`${indent}int* __cell_${variableName} = new int[1];`);
        lowered.push(`${indent}__cell_${variableName}[0] = (int)(${initValue});`);
        compileContext.inlineIdentifierExpressions.set(variableName, `__cell_${variableName}[0]`);
        if (pendingClosureBind) {
          for (const pre of pendingClosureBind.preLines) {
            lowered.push(`${indent}${pre}`);
          }
          lowered.push(`${indent}__maia_closure_bind((void*)(__cell_${variableName}[0]), ${pendingClosureBind.fnId}, ${pendingClosureBind.envExpr});`);
        }
        continue;
      }

      const canEmitConstQualifier = inferredFromLoweredInit !== 'const char*'
        && !/\*$/.test(inferredFromLoweredInit.replace(/^void\*$/, ''));
      const constQualifier = isConst && canEmitConstQualifier ? 'const ' : '';
      if (compileContext) {
        if (!compileContext.localVariables) compileContext.localVariables = new Map();
        compileContext.localVariables.set(variableName, inferredFromLoweredInit);
        compileContext._consoleConcatExprCache = new WeakMap();
      }
      lowered.push(`${indent}${constQualifier}${inferredFromLoweredInit} ${sanitizeCppIdentifier(variableName)} = ${initValue};`);
      if (pendingClosureBind) {
        for (const pre of pendingClosureBind.preLines) {
          lowered.push(`${indent}${pre}`);
        }
        lowered.push(`${indent}__maia_closure_bind((void*)${variableName}, ${pendingClosureBind.fnId}, ${pendingClosureBind.envExpr});`);
      }
    }

    return lowered;
  }

  function indentation(level) {
    return '  '.repeat(level);
  }

  function isIterationStatementNode(statementNode) {
    return !!(statementNode
      && statementNode.kind === 'nonterminal'
      && (statementNode.children || []).some(
        (child) => child && child.kind === 'nonterminal' && child.name === 'iterationStatement'
      ));
  }

  function allocateLabelTarget(compileContext, label, kind) {
    if (!compileContext) {
      return `__maia_${kind}_${label}`;
    }
    compileContext._labelTargetCount = (compileContext._labelTargetCount || 0) + 1;
    const safeLabel = String(label).replace(/[^A-Za-z0-9_]/g, '_');
    return `__maia_${kind}_${safeLabel}_${compileContext._labelTargetCount}`;
  }

  function lowerStatementNode(statementNode, compileContext, indentLevel = 1, options = {}) {
    const lines = [];
    const indent = indentation(indentLevel);
    const returnTypeCpp = options.returnTypeCpp || 'int';
    const nestedFuncDecl = (statementNode.children || []).find(
      (child) => child && child.kind === 'nonterminal' && child.name === 'functionDeclaration'
    );
    if (nestedFuncDecl && compileContext && compileContext.closurePlan && compileContext.closurePlan.scopesByNode) {
      const closureScope = compileContext.closurePlan.scopesByNode.get(nestedFuncDecl);
      const fnName = extractFunctionDeclarationName(nestedFuncDecl);
      if (closureScope && closureScope.isClosure && fnName) {
        const { preLines, envExpr } = closures.emitClosureCaptureEnvCode(closureScope, null, compileContext);
        for (const pre of preLines) {
          lines.push(`${indent}${pre}`);
        }
        const allocExpr = `__maia_closure_alloc(${closureScope.fnId}, ${closureScope.params.length}, ${closureScope.isAsync ? 1 : 0}, ${envExpr})`;
        if (compileContext.activeBoxedVars && compileContext.activeBoxedVars.has(fnName)) {
          if (!compileContext.inlineIdentifierExpressions) {
            compileContext.inlineIdentifierExpressions = new Map();
          }
          lines.push(`${indent}int* __cell_${fnName} = new int[1];`);
          lines.push(`${indent}__cell_${fnName}[0] = (int)(${allocExpr});`);
          compileContext.inlineIdentifierExpressions.set(fnName, `__cell_${fnName}[0]`);
        } else {
          if (!compileContext.localVariables) {
            compileContext.localVariables = new Map();
          }
          compileContext.localVariables.set(fnName, 'void*');
          lines.push(`${indent}void* ${fnName} = ${allocExpr};`);
        }
        return lines;
      }
    }

    const declarationNode = (statementNode.children || []).find(
      (child) => child
        && child.kind === 'nonterminal'
        && (child.name === 'variableStatement' || child.name === 'letDeclaration' || child.name === 'constDeclaration')
    );

    const loweredDeclarations = lowerVariableDeclarations(statementNode, compileContext, indent);
    if (loweredDeclarations.length > 0) {
      return loweredDeclarations;
    }
    if (declarationNode) {
      return [];
    }

    const returnStmtNode = (statementNode.children || []).find(
      (child) => child && child.kind === 'nonterminal' && child.name === 'returnStatement'
    );
    if (returnStmtNode) {
      let returnExprNode = (returnStmtNode.children || []).find(
        (child) => child && child.kind === 'nonterminal' && child.name === 'expression'
      ) || null;
      if (!returnExprNode) {
        returnExprNode = findFirstNonterminal(returnStmtNode, 'expression');
      }

      if (!returnExprNode) {
        return [returnTypeCpp === 'void' ? `${indent}return;` : `${indent}return ${defaultCppValue(returnTypeCpp)};`];
      }

      const loweredReturn = lowerExpressionValue(returnExprNode, compileContext);
      if (loweredReturn === null) {
        reportUnsupportedLowering(
          compileContext,
          'return-expression-unlowerable',
          'return expression could not be lowered'
        );
        if (compileContext && compileContext.strictLowering) {
          err('unsupported lowering: return expression');
        }
        return [`${indent}return ${defaultCppValue(returnTypeCpp)};`];
      }

      return [
        ...takePreludeStatements(compileContext, indent),
        `${indent}return ${castReturnExpression(loweredReturn, returnTypeCpp)};`
      ];
    }

    const ifStmtNode = (statementNode.children || []).find(
      (child) => child && child.kind === 'nonterminal' && child.name === 'ifStatement'
    );
    if (ifStmtNode) {
      const ifChildren = ifStmtNode.children || [];
      let conditionExpr = ifChildren.find(
        (child) => child && child.kind === 'nonterminal' && child.name === 'expression'
      ) || null;
      if (!conditionExpr) {
        conditionExpr = findFirstNonterminal(ifStmtNode, 'expression');
      }

      let nestedStatements = ifChildren.filter(
        (child) => child && child.kind === 'nonterminal' && child.name === 'statement'
      );
      if (nestedStatements.length === 0) {
        const collectedStatements = [];
        const collectBranchStatements = (node) => {
          if (!node || typeof node !== 'object' || node.kind !== 'nonterminal') {
            return;
          }
          if (node.name === 'statement') {
            collectedStatements.push(node);
            return;
          }
          for (const child of (node.children || [])) {
            collectBranchStatements(child);
          }
        };
        for (const child of ifChildren) {
          collectBranchStatements(child);
        }
        nestedStatements = collectedStatements;
      }

      let hasElse = ifChildren.some(
        (child) => child && child.kind === 'terminal' && child.token === 'TOKEN_else'
      );
      // Do not walk into nested then-branch statements when checking for an outer else

      const thenStatement = nestedStatements[0] || null;
      const elseStatement = hasElse ? (nestedStatements[1] || null) : null;

      let loweredCondition = null;
      if (!conditionExpr) {
        reportUnsupportedLowering(
          compileContext,
          'if-condition-unlowerable',
          'if statement is missing condition expression'
        );
        if (compileContext && compileContext.strictLowering) {
          err('unsupported lowering: if statement missing condition');
        }
      } else {
        loweredCondition = lowerExpressionValue(conditionExpr, compileContext);
        if (loweredCondition === null) {
          reportUnsupportedLowering(
            compileContext,
            'if-condition-unlowerable',
            'if statement condition could not be lowered'
          );
          if (compileContext && compileContext.strictLowering) {
            err('unsupported lowering: if statement condition');
          }
        }
      }
      lines.push(...takePreludeStatements(compileContext, indent));
      lines.push(loweredCondition !== null ? `${indent}if (${loweredCondition}) {` : `${indent}if (0) {`);

      if (thenStatement) {
        lines.push(...lowerStatementNode(thenStatement, compileContext, indentLevel + 1, options));
      } else {
        reportUnsupportedLowering(
          compileContext,
          'if-statement-unlowerable',
          'if statement then-branch contains no statement child'
        );
        if (compileContext && compileContext.strictLowering) {
          err('unsupported lowering: if statement then-branch');
        }
        lines.push(`${indentation(indentLevel + 1)}// [then statement not yet lowered]`);
      }
      lines.push(`${indent}}`);

      if (hasElse) {
        lines.push(`${indent}else {`);
        if (elseStatement) {
          lines.push(...lowerStatementNode(elseStatement, compileContext, indentLevel + 1, options));
        } else {
          reportUnsupportedLowering(
            compileContext,
            'if-statement-unlowerable',
            'if statement else-branch contains no statement child'
          );
          if (compileContext && compileContext.strictLowering) {
            err('unsupported lowering: if statement else-branch');
          }
          lines.push(`${indentation(indentLevel + 1)}// [else statement not yet lowered]`);
        }
        lines.push(`${indent}}`);
      }

      return lines;
    }

    const blockNode = (statementNode.children || []).find(
      (child) => child && child.kind === 'nonterminal' && child.name === 'block'
    );
    if (blockNode) {
      let nestedStatements = (blockNode.children || []).filter(
        (child) => child && child.kind === 'nonterminal' && child.name === 'statement'
      );
      if (nestedStatements.length === 0) {
        const collected = [];
        const collectBlockStatements = (node) => {
          if (!node || node.kind !== 'nonterminal') { return; }
          if (node.name === 'statement') { collected.push(node); return; }
          for (const child of (node.children || [])) { collectBlockStatements(child); }
        };
        for (const child of (blockNode.children || [])) { collectBlockStatements(child); }
        nestedStatements = collected;
      }

      lines.push(`${indent}{`);
      for (const nested of nestedStatements) {
        lines.push(...lowerStatementNode(nested, compileContext, indentLevel + 1, options));
      }

      if (nestedStatements.length === 0) {
        lines.push(`${indentation(indentLevel + 1)}// [empty block]`);
      }
      lines.push(`${indent}}`);

      return lines;
    }

    const exprStmtNode = (statementNode.children || []).find(
      (c) => c && c.kind === 'nonterminal' && c.name === 'expressionStatement'
    );
    if (exprStmtNode) {
      let exprNode = (exprStmtNode.children || []).find(
        (c) => c && c.kind === 'nonterminal' && c.name === 'expression'
      ) || null;
      if (!exprNode) {
        exprNode = findFirstNonterminal(exprStmtNode, 'expression');
      }
      if (!exprNode) {
        reportUnsupportedLowering(
          compileContext,
          'expression-statement-unlowerable',
          'expression statement is missing expression'
        );
        if (compileContext && compileContext.strictLowering) {
          err('unsupported lowering: expression statement missing expression');
        }
        return [`${indent}// [expression statement missing expression]`];
      }

      // C++98 has no lambda syntax. A side-effect-only parameterless IIFE can
      // preserve its semantics by lowering its body directly at the call site.
      const loweredIife = tryLowerIifeExpressionStatement(exprNode, compileContext, indentLevel, options);
      if (loweredIife !== null) {
        return loweredIife;
      }

      // A class construction used as a statement has no JavaScript result to
      // retain, but it still must run the generated Maia constructor wrapper.
      // `new Class(args)` is not valid for our lowered plain C++98 structs.
      const directNewClass = extractDirectNewClassInfo(exprNode, compileContext);
      if (directNewClass) {
        if (compileContext._newClassStatementTempCount === undefined) {
          compileContext._newClassStatementTempCount = 0;
        }
        const tempName = `__maia_new_${directNewClass.className}_${compileContext._newClassStatementTempCount++}`;
        const ctorSymbol = getClassInitWrapperMangledName(directNewClass.className, directNewClass.argCount);
        return [
          `${indent}${directNewClass.className} ${tempName};`,
          `${indent}${ctorSymbol}((${directNewClass.className}*)&${tempName}${directNewClass.args && directNewClass.args.trim() ? `, ${directNewClass.args}` : ''});`
        ];
      }

      const promiseThenCallNode = findFirstPromiseThenCallExpression(exprNode);
      const lowered = promiseThenCallNode
        ? (tryLowerStaticPromiseThenChain(promiseThenCallNode, compileContext) || lowerExpressionValue(exprNode, compileContext))
        : lowerExpressionValue(exprNode, compileContext);
      if (lowered === null) {
        reportUnsupportedLowering(
          compileContext,
          'expression-statement-unlowerable',
          'expression statement could not be lowered'
        );
        if (compileContext && compileContext.strictLowering) {
          err('unsupported lowering: expression statement');
        }
        return [`${indent}(void)0;`];
      }
      return [
        ...takePreludeStatements(compileContext, indent),
        `${indent}${lowered};`
      ];
    }

    const iterationStmtNode = (statementNode.children || []).find((c) => c && c.kind === 'nonterminal' && c.name === 'iterationStatement');
    if (iterationStmtNode) {
      const iterChildren = iterationStmtNode.children || [];
      let firstToken = iterChildren.find((c) => c && c.kind === 'terminal') || null;
      if (!firstToken) {
        walk(iterationStmtNode, (node) => {
          if (firstToken || !node || node.kind !== 'terminal') {
            return;
          }
          if (node.token === 'TOKEN_while' || node.token === 'TOKEN_do' || node.token === 'TOKEN_for') {
            firstToken = node;
          }
        });
      }
      
      if (!firstToken) {
        reportUnsupportedLowering(
          compileContext,
          'iteration-statement-unlowerable',
          'iteration statement is missing loop token'
        );
        if (compileContext && compileContext.strictLowering) {
          err('unsupported lowering: iteration statement missing loop token');
        }
        return [`${indent}// [iteration statement with no token]`];
      }

      const loopType = firstToken.token;

      // WHILE LOOP: 'while' '(' expression ')' statement
      if (loopType === 'TOKEN_while') {
        const bodyIndex = iterChildren.findIndex((c) => c && c.kind === 'nonterminal' && c.name === 'statement');
        let condExpr = iterChildren.find((c, i) => c && c.kind === 'nonterminal' && c.name === 'expression' && (bodyIndex < 0 || i < bodyIndex)) || null;
        let bodyStmt = iterChildren.find((c) => c && c.kind === 'nonterminal' && c.name === 'statement') || null;

        if (!condExpr) {
          for (let i = 0; i < iterChildren.length; i += 1) {
            if (bodyIndex >= 0 && i >= bodyIndex) {
              break;
            }
            const candidate = iterChildren[i];
            const nestedExpr = findFirstNonterminal(candidate, 'expression');
            if (nestedExpr) {
              condExpr = nestedExpr;
              break;
            }
          }
        }
        if (!bodyStmt) {
          bodyStmt = findFirstNonterminal(iterationStmtNode, 'statement');
        }

        const loweredCond = condExpr
          ? lowerRequiredExpressionValue(condExpr, compileContext, 'while-condition-unlowerable', 'while loop condition expression')
          : '0';
        lines.push(`${indent}while (${loweredCond}) {`);
        
        if (bodyStmt) {
          lines.push(...lowerStatementNode(bodyStmt, compileContext, indentLevel + 1, Object.assign({}, options, {
            labelledContinueTarget: null
          })));
        } else {
          reportUnsupportedLowering(
            compileContext,
            'iteration-statement-unlowerable',
            'while loop body statement is missing'
          );
          if (compileContext && compileContext.strictLowering) {
            err('unsupported lowering: while loop body statement');
          }
          lines.push(`${indentation(indentLevel + 1)}// [while body not yet lowered]`);
        }
        if (options.labelledContinueTarget) {
          lines.push(`${indentation(indentLevel + 1)}${options.labelledContinueTarget}: ;`);
        }
        
        lines.push(`${indent}}`);
        return lines;
      }

      // DO-WHILE LOOP: 'do' statement 'while' '(' expression ')' semicolon
      if (loopType === 'TOKEN_do') {
        const bodyIndex = iterChildren.findIndex((c) => c && c.kind === 'nonterminal' && c.name === 'statement');
        let bodyStmt = iterChildren.find((c) => c && c.kind === 'nonterminal' && c.name === 'statement') || null;
        let condExpr = iterChildren.find((c, i) => c && c.kind === 'nonterminal' && c.name === 'expression' && (bodyIndex < 0 || i > bodyIndex)) || null;

        if (!bodyStmt) {
          bodyStmt = findFirstNonterminal(iterationStmtNode, 'statement');
        }
        if (!condExpr) {
          for (let i = Math.max(0, bodyIndex + 1); i < iterChildren.length; i += 1) {
            const candidate = iterChildren[i];
            const nestedExpr = findFirstNonterminal(candidate, 'expression');
            if (nestedExpr) {
              condExpr = nestedExpr;
              break;
            }
          }
        }

        lines.push(`${indent}do {`);
        
        if (bodyStmt) {
          lines.push(...lowerStatementNode(bodyStmt, compileContext, indentLevel + 1, Object.assign({}, options, {
            labelledContinueTarget: null
          })));
        } else {
          reportUnsupportedLowering(
            compileContext,
            'iteration-statement-unlowerable',
            'do-while loop body statement is missing'
          );
          if (compileContext && compileContext.strictLowering) {
            err('unsupported lowering: do-while loop body statement');
          }
          lines.push(`${indentation(indentLevel + 1)}// [do-while body not yet lowered]`);
        }
        if (options.labelledContinueTarget) {
          lines.push(`${indentation(indentLevel + 1)}${options.labelledContinueTarget}: ;`);
        }
        
        const loweredCond = condExpr
          ? lowerRequiredExpressionValue(condExpr, compileContext, 'do-while-condition-unlowerable', 'do-while loop condition expression')
          : '0';
        lines.push(`${indent}} while (${loweredCond});`);
        
        return lines;
      }

      if (loopType === 'TOKEN_for' && iterators.isForOfStatementNode(iterationStmtNode)) {
        const ofIdx = iterChildren.findIndex((c) => c && c.kind === 'terminal' && c.value === 'of');
        const rparenIdx = iterChildren.findIndex((c, idx) => idx > ofIdx && c && c.kind === 'terminal' && c.token === 'TOKEN__29_');
        let varName = '__for_of_v';
        for (let idx = 0; idx < ofIdx; idx += 1) {
          const id = findFirstIdentifierValue(iterChildren[idx]);
          if (id && id !== 'for' && id !== 'const' && id !== 'let' && id !== 'var') {
            varName = id;
            break;
          }
        }
        const iterableNode = iterChildren.slice(ofIdx + 1, rparenIdx).find((c) => c && c.kind === 'nonterminal') || null;
        const bodyStmt = iterChildren.slice(rparenIdx + 1).find((c) => c && c.kind === 'nonterminal' && c.name === 'statement') || null;
        const loweredIterable = iterableNode ? lowerExpressionValue(iterableNode, compileContext) : '0';
        const preludes = takePreludeStatements(compileContext, indent);
        const iterIdx = (compileContext._forOfCount || 0) + 1;
        compileContext._forOfCount = iterIdx;
        const itVar = `__maia_it_${iterIdx}`;
        const resVar = `__maia_res_${iterIdx}`;
        const prevVarType = compileContext.localVariables ? compileContext.localVariables.get(varName) : undefined;
        if (compileContext.localVariables) compileContext.localVariables.set(varName, 'int');
        const bodyLines = bodyStmt ? lowerStatementNode(bodyStmt, compileContext, indentLevel + 1) : [];
        if (compileContext.localVariables) {
          if (prevVarType === undefined) compileContext.localVariables.delete(varName);
          else compileContext.localVariables.set(varName, prevVarType);
        }
        return [
          ...preludes,
          `${indent}void* ${itVar} = __maia_iter_get_iterator((void*)(${loweredIterable !== null ? loweredIterable : '0'}));`,
          `${indent}while (1) {`,
          `${indent}  void* ${resVar} = __maia_iter_next(${itVar}, 0);`,
          `${indent}  if (__maia_iter_result_done(${resVar})) { break; }`,
          `${indent}  int ${varName} = (int)__maia_iter_result_value(${resVar});`,
          ...bodyLines,
          `${indent}}`
        ];
      }

      // FOR LOOP: 'for' '(' init? ';' condition? ';' increment? ')' statement
      if (loopType === 'TOKEN_for') {
        // The structure of FOR loop is:
        // for ( [var/let/const] init? ; condition? ; increment? ) statement
        // In AST: for TOKEN__28_ [TOKEN_var/TOKEN_let/TOKEN_const] [declarations/expression] TOKEN__3B_ [expression] TOKEN__3B_ [expression] TOKEN__29_ statement
        
        // Find top-level semicolons in the for-header.
        const semicolonIndices = [];
        for (let i = 0; i < iterChildren.length; i++) {
          const child = iterChildren[i];
          if (child && child.kind === 'terminal' && child.token === 'TOKEN__3B_') {
            semicolonIndices.push(i);
          }
        }

        // AST-first fallback view of the for-header (tokens/expressions before first ')').
        let headerClosed = false;
        let fallbackSemicolonCount = 0;
        let fallbackVarKeyword = '';
        const fallbackHeaderExpressions = [];
        walk(iterationStmtNode, (node) => {
          if (headerClosed || !node) {
            return;
          }
          if (node.kind === 'terminal') {
            if (node.token === 'TOKEN__29_') {
              headerClosed = true;
              return;
            }
            if (node.token === 'TOKEN__3B_') {
              fallbackSemicolonCount += 1;
              return;
            }
            if (!fallbackVarKeyword && (node.token === 'TOKEN_var' || node.token === 'TOKEN_let' || node.token === 'TOKEN_const')) {
              fallbackVarKeyword = `${node.value} `;
            }
            return;
          }
          if (node.kind === 'nonterminal' && node.name === 'expression') {
            fallbackHeaderExpressions.push(node);
          }
        });

        let closeParenIndex = iterChildren.findIndex((c) => c && c.kind === 'terminal' && c.token === 'TOKEN__29_');
        if (closeParenIndex < 0 && headerClosed) {
          // Header was observed by AST walk even when ')' is not a direct child.
          closeParenIndex = iterChildren.length;
        }
        let bodyStmt = iterChildren.find((c) => c && c.kind === 'nonterminal' && c.name === 'statement') || null;
        if (!bodyStmt) {
          bodyStmt = findFirstNonterminal(iterationStmtNode, 'statement');
        }

        if (closeParenIndex < 0) {
          reportUnsupportedLowering(
            compileContext,
            'for-statement-unlowerable',
            'for loop header is missing closing parenthesis'
          );
          if (compileContext && compileContext.strictLowering) {
            err('unsupported lowering: for loop header missing closing parenthesis');
          }
          return [`${indent}// [for loop missing closing paren]`];
        }

        // Support both parser shapes:
        // 1) for (init ; cond ; incr)               -> 2 top-level semicolons
        // 2) for (lexicalDeclaration cond ; incr)   -> lexicalDeclaration contains first ';', so only 1 top-level semicolon
        let lexicalDeclNode = iterChildren.find((c) => c && c.kind === 'nonterminal' && c.name === 'lexicalDeclaration') || null;
        if (!lexicalDeclNode) {
          lexicalDeclNode = findFirstNonterminal(iterationStmtNode, 'lexicalDeclaration');
        }
        const hasLexicalShape = !!lexicalDeclNode;
        const effectiveSemicolonCount = semicolonIndices.length > 0 ? semicolonIndices.length : fallbackSemicolonCount;
        if (effectiveSemicolonCount !== 2 && !(hasLexicalShape && effectiveSemicolonCount === 1)) {
          reportUnsupportedLowering(
            compileContext,
            'for-statement-unlowerable',
            `for loop header has unexpected semicolon count: ${effectiveSemicolonCount}`
          );
          if (compileContext && compileContext.strictLowering) {
            err(`unsupported lowering: for loop semicolon count ${effectiveSemicolonCount}`);
          }
          return [`${indent}// [for loop with unexpected semicolon count: ${effectiveSemicolonCount}]`];
        }

        let initCode = '';
        const lexicalDeclLines = [];
        if (hasLexicalShape) {
          const isConst = (lexicalDeclNode.children || []).some(
            (c) => c && c.kind === 'terminal' && c.token === 'TOKEN_const'
          );
          const bindingListNode = (lexicalDeclNode.children || []).find(
            (c) => c && c.kind === 'nonterminal' && c.name === 'bindingList'
          );
          const lexicalBindings = bindingListNode
            ? (bindingListNode.children || []).filter((c) => c && c.kind === 'nonterminal' && c.name === 'lexicalBinding')
            : [];
          for (const binding of lexicalBindings) {
            const bindingId = (binding.children || []).find(
              (c) => c && c.kind === 'nonterminal' && c.name === 'bindingIdentifier'
            );
            const initializer = (binding.children || []).find(
              (c) => c && c.kind === 'nonterminal' && c.name === 'initializer'
            );
            const variableName = bindingId ? findFirstIdentifierValue(bindingId) : null;
            if (!variableName) continue;

            const initExpr = initializer
              ? (initializer.children || []).find((c) => c && c.kind === 'nonterminal' && c.name === 'assignmentExpression')
              : null;
            const inferredType = initExpr ? inferExprType(initExpr) : 'any';
            const cppType = cppArgType(inferredType);
            const constQualifier = isConst && cppType !== 'const char*' ? 'const ' : '';
            const loweredInitExpr = initExpr ? lowerExpressionValue(initExpr, compileContext) : null;
            if (initExpr && loweredInitExpr === null) {
              reportUnsupportedLowering(
                compileContext,
                'for-init-unlowerable',
                `for lexical initializer expression for '${variableName}' could not be lowered`
              );
              if (compileContext && compileContext.strictLowering) {
                err(`unsupported lowering: for lexical initializer '${variableName}'`);
              }
            }
            if (initExpr && loweredInitExpr === null) {
              reportUnsupportedLowering(
                compileContext,
                'variable-initializer-unlowerable',
                `lexical variable initializer for '${variableName}' could not be lowered`
              );
              if (compileContext && compileContext.strictLowering) {
                err(`unsupported lowering: lexical variable initializer '${variableName}'`);
              }
            }
            const initValue = loweredInitExpr !== null ? loweredInitExpr : defaultCppValue(cppType);
            const declIndent = indentation(indentLevel + 1);
            lexicalDeclLines.push(`${declIndent}${constQualifier}${cppType} ${variableName} = ${initValue};`);
          }

          // Variables are initialized in the lexical scope block; for-header init stays empty.
          initCode = '';
        } else {
          // Legacy form with explicit first semicolon at top-level.
          let varKeyword = fallbackVarKeyword;
          if (semicolonIndices.length >= 1) {
            for (let i = 2; i < semicolonIndices[0]; i++) {
              const child = iterChildren[i];
              if (!child) continue;

              if (child.kind === 'terminal' && (child.token === 'TOKEN_var' || child.token === 'TOKEN_let' || child.token === 'TOKEN_const')) {
                varKeyword = child.value + ' ';
              } else if (child.kind === 'nonterminal' && child.name === 'variableDeclarationListNoIn') {
                const declNoInList = (child.children || []).filter((c) => c && c.kind === 'nonterminal' && c.name === 'variableDeclarationNoIn');
                const varParts = [];

                for (const declNoIn of declNoInList) {
                  const bindingId = (declNoIn.children || []).find((c) => c && c.kind === 'nonterminal' && c.name === 'bindingIdentifier');
                  const initializer = (declNoIn.children || []).find((c) => c && c.kind === 'nonterminal' && c.name === 'initializerNoIn');

                  const varName = bindingId ? findFirstIdentifierValue(bindingId) : null;
                  if (!varName) continue;

                  let varDecl = varName;
                  if (initializer) {
                    const initExpr = (initializer.children || []).find((c) => c && c.kind === 'nonterminal');
                    const loweredInitExpr = initExpr ? lowerExpressionValue(initExpr, compileContext) : null;
                    if (initExpr && loweredInitExpr === null) {
                      reportUnsupportedLowering(
                        compileContext,
                        'for-init-unlowerable',
                        `for initializer expression for '${varName}' could not be lowered`
                      );
                      if (compileContext && compileContext.strictLowering) {
                        err(`unsupported lowering: for initializer '${varName}'`);
                      }
                    }
                    if (loweredInitExpr !== null) {
                      varDecl += ' = ' + loweredInitExpr;
                    }
                  }
                  varParts.push(varDecl);
                }

                initCode = varParts.join(', ');
              } else if (child.kind === 'nonterminal' && (child.name === 'expression' || child.name === 'expressionNoIn')) {
                const loweredExpr = lowerExpressionValue(child, compileContext);
                if (loweredExpr !== null) {
                  initCode += loweredExpr;
                } else {
                  reportUnsupportedLowering(
                    compileContext,
                    'for-init-unlowerable',
                    'for initializer expression could not be lowered'
                  );
                  if (compileContext && compileContext.strictLowering) {
                    err('unsupported lowering: for initializer expression');
                  }
                }
              }
            }
          } else if (fallbackHeaderExpressions.length > 0) {
            // No top-level semicolon indexes available: use first header expression as initializer.
            const loweredExpr = lowerExpressionValue(fallbackHeaderExpressions[0], compileContext);
            if (loweredExpr !== null) {
              initCode = loweredExpr;
            }
          }

          initCode = `${varKeyword}${initCode}`;
        }

        let condCode = '';
        if (hasLexicalShape) {
          const condExprNode = semicolonIndices.length >= 1
            ? iterChildren.find(
                (c, index) => c && c.kind === 'nonterminal' && c.name === 'expression' && index < semicolonIndices[0]
              )
            : (fallbackHeaderExpressions[0] || null);
          const loweredExpr = condExprNode ? lowerExpressionValue(condExprNode, compileContext) : null;
          if (loweredExpr !== null) {
            condCode = loweredExpr;
          } else if (condExprNode) {
            reportUnsupportedLowering(
              compileContext,
              'for-condition-unlowerable',
              'for loop condition expression could not be lowered'
            );
            if (compileContext && compileContext.strictLowering) {
              err('unsupported lowering: for loop condition expression');
            }
          }
        } else {
          if (semicolonIndices.length >= 2) {
            for (let i = semicolonIndices[0] + 1; i < semicolonIndices[1]; i++) {
              const child = iterChildren[i];
              if (!child || child.kind === 'terminal') continue;

              if (child.kind === 'nonterminal' && child.name === 'expression') {
                const loweredExpr = lowerExpressionValue(child, compileContext);
                if (loweredExpr !== null) {
                  condCode = loweredExpr;
                } else {
                  reportUnsupportedLowering(
                    compileContext,
                    'for-condition-unlowerable',
                    'for loop condition expression could not be lowered'
                  );
                  if (compileContext && compileContext.strictLowering) {
                    err('unsupported lowering: for loop condition expression');
                  }
                }
              }
            }
          } else if (fallbackHeaderExpressions.length >= 2) {
            const loweredExpr = lowerExpressionValue(fallbackHeaderExpressions[1], compileContext);
            if (loweredExpr !== null) {
              condCode = loweredExpr;
            }
          }
        }

        let incrCode = '';
        if (semicolonIndices.length >= (hasLexicalShape ? 1 : 2)) {
          const incrStart = hasLexicalShape ? (semicolonIndices[0] + 1) : (semicolonIndices[1] + 1);
          for (let i = incrStart; i < closeParenIndex; i++) {
            const child = iterChildren[i];
            if (!child || child.kind === 'terminal') continue;

            if (child.kind === 'nonterminal' && child.name === 'expression') {
              const loweredExpr = lowerExpressionValue(child, compileContext);
              if (loweredExpr !== null) {
                incrCode = loweredExpr;
              } else {
                reportUnsupportedLowering(
                  compileContext,
                  'for-increment-unlowerable',
                  'for loop increment expression could not be lowered'
                );
                if (compileContext && compileContext.strictLowering) {
                  err('unsupported lowering: for loop increment expression');
                }
              }
            }
          }
        } else {
          const fallbackIndex = hasLexicalShape ? 1 : 2;
          if (fallbackHeaderExpressions.length > fallbackIndex) {
            const loweredExpr = lowerExpressionValue(fallbackHeaderExpressions[fallbackIndex], compileContext);
            if (loweredExpr !== null) {
              incrCode = loweredExpr;
            }
          }
        }

        // Build for loop. Lexical for-loops get a dedicated block to keep declarations valid in C89-like parsers.
        const useLexicalScopeBlock = hasLexicalShape && lexicalDeclLines.length > 0;
        const forIndentLevel = useLexicalScopeBlock ? (indentLevel + 1) : indentLevel;
        const forIndent = indentation(forIndentLevel);
        const bodyIndentLevel = forIndentLevel + 1;

        if (useLexicalScopeBlock) {
          lines.push(`${indent}{`);
          lines.push(...lexicalDeclLines);
        }

        const forHeader = `${forIndent}for (${initCode}; ${condCode}; ${incrCode}) {`;
        lines.push(forHeader);

        if (bodyStmt) {
          lines.push(...lowerStatementNode(bodyStmt, compileContext, bodyIndentLevel, Object.assign({}, options, {
            labelledContinueTarget: null
          })));
        } else {
          reportUnsupportedLowering(
            compileContext,
            'iteration-statement-unlowerable',
            'for loop body statement is missing'
          );
          if (compileContext && compileContext.strictLowering) {
            err('unsupported lowering: for loop body statement');
          }
          lines.push(`${indentation(bodyIndentLevel)}// [for body not yet lowered]`);
        }
        if (options.labelledContinueTarget) {
          lines.push(`${indentation(bodyIndentLevel)}${options.labelledContinueTarget}: ;`);
        }

        lines.push(`${forIndent}}`);
        if (useLexicalScopeBlock) {
          lines.push(`${indent}}`);
        }
        return lines;
      }

      reportUnsupportedLowering(
        compileContext,
        'iteration-statement-unlowerable',
        `iteration statement type not yet lowered: ${loopType}`
      );
      if (compileContext && compileContext.strictLowering) {
        err(`unsupported lowering: iteration statement type ${loopType}`);
      }
      return [`${indent}// [iteration statement type not yet lowered: ${loopType}]`];
    }

    const tryStmtNode = (statementNode.children || []).find((c) => c && c.kind === 'nonterminal' && c.name === 'tryStatement');
    if (tryStmtNode) {
      const tryChildren = tryStmtNode.children || [];
      
      // Extract try/catch/finally nodes with direct-child fast path and AST fallback.
      let tryBlock = tryChildren.find((c) => c && c.kind === 'nonterminal' && c.name === 'block') || null;
      if (!tryBlock) {
        tryBlock = findFirstNonterminal(tryStmtNode, 'block');
      }
      
      // Extract catch clause (if present)
      let catchClause = tryChildren.find((c) => c && c.kind === 'nonterminal' && c.name === 'catch') || null;
      if (!catchClause) {
        catchClause = findFirstNonterminal(tryStmtNode, 'catch');
      }
      
      // Extract finally clause (if present)
      let finallyClause = tryChildren.find((c) => c && c.kind === 'nonterminal' && c.name === 'finally') || null;
      if (!finallyClause) {
        finallyClause = findFirstNonterminal(tryStmtNode, 'finally');
      }
      
      // Must have at least try block
      if (!tryBlock) {
        reportUnsupportedLowering(
          compileContext,
          'try-statement-unlowerable',
          'try statement is missing try block'
        );
        if (compileContext && compileContext.strictLowering) {
          err('unsupported lowering: try statement missing block');
        }
        return [`${indent}// [try statement missing block]`];
      }

      // Try block
      lines.push(`${indent}try {`);
      
      const tryStatements = (tryBlock.children || []).filter((c) => c && c.kind === 'nonterminal' && c.name === 'statement');
      for (const stmt of tryStatements) {
        lines.push(...lowerStatementNode(stmt, compileContext, indentLevel + 1, options));
      }
      
      if (tryStatements.length === 0) {
        lines.push(`${indentation(indentLevel + 1)}// [empty try block]`);
      }
      
      lines.push(`${indent}}`);

      // Catch clause (if present)
      if (catchClause) {
        const catchChildren = catchClause.children || [];
        let catchIdentifier = catchChildren.find((c) => c && c.kind === 'nonterminal' && c.name === 'identifier') || null;
        let catchBlock = catchChildren.find((c) => c && c.kind === 'nonterminal' && c.name === 'block') || null;
        if (!catchIdentifier) {
          catchIdentifier = findFirstNonterminal(catchClause, 'identifier');
        }
        if (!catchBlock) {
          catchBlock = findFirstNonterminal(catchClause, 'block');
        }
        
        let catchParam = 'e';
        if (catchIdentifier) {
          catchParam = findFirstIdentifierValue(catchIdentifier) || 'e';
        }
        
        lines.push(`${indent}catch (const char* ${catchParam}) {`);
        
        if (catchBlock) {
          const catchStatements = (catchBlock.children || []).filter((c) => c && c.kind === 'nonterminal' && c.name === 'statement');
          for (const stmt of catchStatements) {
            lines.push(...lowerStatementNode(stmt, compileContext, indentLevel + 1, options));
          }
          
          if (catchStatements.length === 0) {
            lines.push(`${indentation(indentLevel + 1)}// [empty catch block]`);
          }
        } else {
          reportUnsupportedLowering(
            compileContext,
            'catch-block-unlowerable',
            'catch clause is missing catch block'
          );
          if (compileContext && compileContext.strictLowering) {
            err('unsupported lowering: catch clause block');
          }
          lines.push(`${indentation(indentLevel + 1)}// [catch block not yet lowered]`);
        }
        
        lines.push(`${indent}}`);
      } else {
        lines.push(`${indent}catch (const char* __maia_unused_err) {`);
        lines.push(`${indentation(indentLevel + 1)}(void)__maia_unused_err;`);
        lines.push(`${indent}}`);
      }

      // Finally clause (if present)
      if (finallyClause) {
        const finallyChildren = finallyClause.children || [];
        let finallyBlock = finallyChildren.find((c) => c && c.kind === 'nonterminal' && c.name === 'block') || null;
        if (!finallyBlock) {
          finallyBlock = findFirstNonterminal(finallyClause, 'block');
        }
        
        if (finallyBlock) {
          const finallyStatements = (finallyBlock.children || []).filter((c) => c && c.kind === 'nonterminal' && c.name === 'statement');
          for (const stmt of finallyStatements) {
            lines.push(...lowerStatementNode(stmt, compileContext, indentLevel, options));
          }
          
          if (finallyStatements.length === 0) {
            lines.push(`${indentation(indentLevel)}// [empty finally block]`);
          }
        } else {
          reportUnsupportedLowering(
            compileContext,
            'finally-block-unlowerable',
            'finally clause is missing finally block'
          );
          if (compileContext && compileContext.strictLowering) {
            err('unsupported lowering: finally clause block');
          }
          lines.push(`${indent}// [finally block not found]`);
        }
      }

      return lines;
    }

    const switchStmtNode = (statementNode.children || []).find((c) => c && c.kind === 'nonterminal' && c.name === 'switchStatement');
    if (switchStmtNode) {
      const switchChildren = switchStmtNode.children || [];
      
      // Extract switch header nodes, preferring direct children and falling back to AST search.
      let switchExpr = switchChildren.find((c) => c && c.kind === 'nonterminal' && c.name === 'expression') || null;
      let caseBlock = switchChildren.find((c) => c && c.kind === 'nonterminal' && c.name === 'caseBlock') || null;

      if (!switchExpr) {
        switchExpr = findFirstNonterminal(switchStmtNode, 'expression');
      }
      if (!caseBlock) {
        caseBlock = findFirstNonterminal(switchStmtNode, 'caseBlock');
      }
      
      if (!switchExpr || !caseBlock) {
        reportUnsupportedLowering(
          compileContext,
          'switch-statement-unlowerable',
          'switch statement is missing expression or case block'
        );
        if (compileContext && compileContext.strictLowering) {
          err('unsupported lowering: switch statement missing expression or case block');
        }
        return [`${indent}// [switch statement missing expression or caseBlock]`];
      }

      const loweredExpr = lowerExpressionValue(switchExpr, compileContext);
      if (loweredExpr === null) {
        reportUnsupportedLowering(
          compileContext,
          'switch-expression-unlowerable',
          'switch expression could not be lowered'
        );
        if (compileContext && compileContext.strictLowering) {
          err('unsupported lowering: switch expression');
        }
      }
      lines.push(`${indent}switch (${loweredExpr !== null ? loweredExpr : '/* expression */'}) {`);

      // Collect case/default clauses in AST order and avoid relying on a flat child shape.
      const clauseNodes = [];
      const collectClauseNodes = (node) => {
        if (!node || typeof node !== 'object') {
          return;
        }
        if (node.kind !== 'nonterminal') {
          return;
        }
        if (node.name === 'caseClause' || node.name === 'defaultClause') {
          clauseNodes.push(node);
          return;
        }
        for (const child of (node.children || [])) {
          collectClauseNodes(child);
        }
      };
      for (const child of (caseBlock.children || [])) {
        collectClauseNodes(child);
      }

      if (clauseNodes.length === 0) {
        reportUnsupportedLowering(
          compileContext,
          'switch-statement-unlowerable',
          'switch statement case block has no case clauses and no default clause'
        );
        if (compileContext && compileContext.strictLowering) {
          err('unsupported lowering: switch statement case block empty');
        }
      }
    
      // Process case/default clauses in source order.
      for (const clauseNode of clauseNodes) {
        if (clauseNode.name === 'caseClause') {
          const caseChildren = clauseNode.children || [];
          const caseExpr = caseChildren.find((c) => c && c.kind === 'nonterminal' && c.name === 'expression');
          let caseStatements = caseChildren.filter((c) => c && c.kind === 'nonterminal' && c.name === 'statement');
          if (caseStatements.length === 0) {
            const collectedCase = [];
            const collectCaseStmts = (node) => {
              if (!node || node.kind !== 'nonterminal') { return; }
              if (node.name === 'statement') { collectedCase.push(node); return; }
              for (const child of (node.children || [])) { collectCaseStmts(child); }
            };
            for (const child of caseChildren) { collectCaseStmts(child); }
            caseStatements = collectedCase;
          }

          if (caseExpr) {
            const loweredCaseExpr = lowerExpressionValue(caseExpr, compileContext);
            if (loweredCaseExpr === null) {
              reportUnsupportedLowering(
                compileContext,
                'switch-case-expression-unlowerable',
                'switch case expression could not be lowered'
              );
              if (compileContext && compileContext.strictLowering) {
                err('unsupported lowering: switch case expression');
              }
            }
            lines.push(`${indentation(indentLevel + 1)}case ${loweredCaseExpr !== null ? loweredCaseExpr : '/* expression */'}:`);
          } else {
            reportUnsupportedLowering(
              compileContext,
              'switch-case-expression-unlowerable',
              'switch case clause is missing expression'
            );
            if (compileContext && compileContext.strictLowering) {
              err('unsupported lowering: switch case missing expression');
            }
            lines.push(`${indentation(indentLevel + 1)}case /* expression */:`);
          }

          // Add case body statements through the regular AST statement lowering path.
          for (const stmt of caseStatements) {
            lines.push(...lowerStatementNode(stmt, compileContext, indentLevel + 2, options));
          }
        } else {
          const defaultChildren = clauseNode.children || [];
          let defaultStatements = defaultChildren.filter((c) => c && c.kind === 'nonterminal' && c.name === 'statement');
          if (defaultStatements.length === 0) {
            const collectedDefault = [];
            const collectDefaultStmts = (node) => {
              if (!node || node.kind !== 'nonterminal') { return; }
              if (node.name === 'statement') { collectedDefault.push(node); return; }
              for (const child of (node.children || [])) { collectDefaultStmts(child); }
            };
            for (const child of defaultChildren) { collectDefaultStmts(child); }
            defaultStatements = collectedDefault;
          }

          lines.push(`${indentation(indentLevel + 1)}default:`);

          // Add default body statements through the regular AST statement lowering path.
          for (const stmt of defaultStatements) {
            lines.push(...lowerStatementNode(stmt, compileContext, indentLevel + 2, options));
          }
        }
      }

      lines.push(`${indent}}`);
      return lines;
    }

    // breakStatement: break [label];
    const breakStmtNode = (statementNode.children || []).find(
      (c) => c && c.kind === 'nonterminal' && c.name === 'breakStatement'
    );
    if (breakStmtNode) {
      let labelIdNode = (breakStmtNode.children || []).find(
        (c) => c && c.kind === 'nonterminal' && c.name === 'identifier'
      ) || null;
      if (!labelIdNode) {
        labelIdNode = findFirstNonterminal(breakStmtNode, 'identifier');
      }
      const label = labelIdNode ? findFirstIdentifierValue(labelIdNode) : null;
      if (label) {
        const target = options.labelTargets && options.labelTargets[label];
        if (target && target.breakTarget) {
          return [`${indent}goto ${target.breakTarget};`];
        }
        reportUnsupportedLowering(
          compileContext,
          'break-label-unsupported',
          `break statement with label '${label}' is not supported`
        );
        if (compileContext && compileContext.strictLowering) {
          err(`unsupported lowering: break label '${label}'`);
        }
        return [`${indent}break;`];
      }
      return [label ? `${indent}break ${label};` : `${indent}break;`];
    }

    // continueStatement: continue [label];
    const continueStmtNode = (statementNode.children || []).find(
      (c) => c && c.kind === 'nonterminal' && c.name === 'continueStatement'
    );
    if (continueStmtNode) {
      let labelIdNode = (continueStmtNode.children || []).find(
        (c) => c && c.kind === 'nonterminal' && c.name === 'identifier'
      ) || null;
      if (!labelIdNode) {
        labelIdNode = findFirstNonterminal(continueStmtNode, 'identifier');
      }
      const label = labelIdNode ? findFirstIdentifierValue(labelIdNode) : null;
      if (label) {
        const target = options.labelTargets && options.labelTargets[label];
        if (target && target.continueTarget) {
          return [`${indent}goto ${target.continueTarget};`];
        }
        reportUnsupportedLowering(
          compileContext,
          'continue-label-unsupported',
          `continue statement with label '${label}' is not supported`
        );
        if (compileContext && compileContext.strictLowering) {
          err(`unsupported lowering: continue label '${label}'`);
        }
        return [`${indent}continue;`];
      }
      return [label ? `${indent}continue ${label};` : `${indent}continue;`];
    }

    // throwStatement: throw expression;
    const throwStmtNode = (statementNode.children || []).find(
      (c) => c && c.kind === 'nonterminal' && c.name === 'throwStatement'
    );
    if (throwStmtNode) {
      const throwChildren = throwStmtNode.children || [];
      let throwExpr = throwChildren.find(
        (c) => c && c.kind === 'nonterminal' && c.name === 'expression'
      ) || null;
      if (!throwExpr) {
        throwExpr = findFirstNonterminal(throwStmtNode, 'expression');
      }

      if (!throwExpr) {
        reportUnsupportedLowering(
          compileContext,
          'throw-expression-unlowerable',
          'throw statement is missing an expression'
        );
        if (compileContext && compileContext.strictLowering) {
          err('unsupported lowering: throw statement missing expression');
        }
        return [`${indent}throw 0;`];
      }

      const loweredThrowExpr = lowerExpressionValue(throwExpr, compileContext);
      if (loweredThrowExpr === null) {
        reportUnsupportedLowering(
          compileContext,
          'throw-expression-unlowerable',
          'throw expression could not be lowered'
        );
        if (compileContext && compileContext.strictLowering) {
          err('unsupported lowering: throw expression');
        }
      }
      const throwValue = loweredThrowExpr !== null ? loweredThrowExpr : '0';
      return [...takePreludeStatements(compileContext, indent), `${indent}throw ${throwValue};`];
    }

    // labelledStatement: label: statement
    const labelledStmtNode = (statementNode.children || []).find(
      (c) => c && c.kind === 'nonterminal' && c.name === 'labelledStatement'
    );
    if (labelledStmtNode) {
      const labelChildren = labelledStmtNode.children || [];
      let labelIdNode = labelChildren.find((c) => c && c.kind === 'nonterminal' && c.name === 'identifier') || null;
      let nestedStmt = labelChildren.find((c) => c && c.kind === 'nonterminal' && c.name === 'statement') || null;
      if (!labelIdNode) {
        labelIdNode = findFirstNonterminal(labelledStmtNode, 'identifier');
      }
      if (!nestedStmt) {
        nestedStmt = findFirstNonterminal(labelledStmtNode, 'statement');
      }
      const label = labelIdNode ? findFirstIdentifierValue(labelIdNode) : null;
      if (label && nestedStmt) {
        const breakTarget = allocateLabelTarget(compileContext, label, 'break');
        const continueTarget = isIterationStatementNode(nestedStmt)
          ? allocateLabelTarget(compileContext, label, 'continue')
          : null;
        const labelTargets = Object.assign({}, options.labelTargets || {}, {
          [label]: { breakTarget, continueTarget }
        });
        lines.push(...lowerStatementNode(nestedStmt, compileContext, indentLevel, Object.assign({}, options, {
          labelTargets,
          labelledContinueTarget: continueTarget
        })));
        lines.push(`${indent}${breakTarget}: ;`);
      } else if (label) {
        lines.push(`${indent}${label}: ;`);
      } else if (nestedStmt) {
        lines.push(...lowerStatementNode(nestedStmt, compileContext, indentLevel, options));
      } else {
        reportUnsupportedLowering(
          compileContext,
          'labelled-statement-unlowerable',
          'labelled statement is missing nested statement'
        );
        if (compileContext && compileContext.strictLowering) {
          err('unsupported lowering: labelled statement body');
        }
        lines.push(`${indentation(indentLevel)}// [labelled statement body not yet lowered]`);
      }
      return lines;
    }

    const statementName =
      statementNode && statementNode.kind === 'nonterminal' && statementNode.name
        ? statementNode.name
        : 'unknown';
    const directChildNames = (statementNode && Array.isArray(statementNode.children)
      ? statementNode.children
      : [])
      .filter((child) => child && child.kind === 'nonterminal' && typeof child.name === 'string')
      .map((child) => child.name);
    const childSummary = directChildNames.length > 0 ? directChildNames.join(', ') : 'none';

    reportUnsupportedLowering(
      compileContext,
      'statement-unlowerable',
      `statement node could not be lowered (node=${statementName}, directChildren=${childSummary})`
    );
    if (compileContext && compileContext.strictLowering) {
      err('unsupported lowering: statement node');
    }
    return [`${indent}// [statement not yet lowered]`];
  }

  function lowerProgramToCppStatements(tree, compileContext, options = {}) {
    const includeFunctionDeclarations = options.includeFunctionDeclarations !== false;
    const includeClassDeclarations = options.includeClassDeclarations !== false;
    const lines = [];
    beginDeferredPromiseQueueScope(compileContext);
    const topLevelStatements = extractTopLevelStatementNodes(tree);
    for (let stmtIndex = 0; stmtIndex < topLevelStatements.length; stmtIndex += 1) {
      const stmtNode = topLevelStatements[stmtIndex];
      if (!stmtNode) { continue; }

      if (!includeFunctionDeclarations
        && (extractFunctionDeclarationFromStatement(stmtNode)
          || extractAsyncFunctionDeclarationFromStatement(stmtNode)
          || (compileContext && compileContext.iteratorPlan && compileContext.iteratorPlan.enabled && findFirstNonterminal(stmtNode, 'generatorDeclaration')))) {
        continue;
      }

      if (!includeClassDeclarations && extractClassDeclarationFromStatement(stmtNode)) {
        continue;
      }

      resetStatementLoweringState(compileContext);
      profileLog(`TOPLEVEL START #${stmtIndex + 1}: ${flattenNodeText(stmtNode, 120)}`);
      lines.push(...lowerStatementNode(stmtNode, compileContext, 1));
      profileLog(`TOPLEVEL END   #${stmtIndex + 1}: ${flattenNodeText(stmtNode, 120)}`);
    }
    lines.push(...takeDeferredPromiseStatements(compileContext, '  '));
    return lines;
  }


  return {
    extractArrayBindingIdentifiers,
    extractSimpleArrayBindingEntries,
    extractObjectBindingIdentifiers,
    extractSimpleObjectBindingEntries,
    extractVariableDeclarations,
    extractVariableDeclarationName,
    extractVariableDeclarationInitializer,
    lowerVariableDeclarations,
    indentation,
    isIterationStatementNode,
    allocateLabelTarget,
    lowerStatementNode,
    lowerProgramToCppStatements
  };
}

module.exports = { createStatementLowering };
