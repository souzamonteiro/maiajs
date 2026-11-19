'use strict';

const {
  walk,
  flattenNodeText,
  findFirstIdentifierValue,
  findNodePath,
  findFirstNonterminal
} = require('./ast-utils');

function createCallLowering(deps) {
  const {
    JS_RUNTIME_METHODS,
    buildFlattenedWeakMapPropertyWrites,
    buildLocalFunctionCallArgs,
    collectArgumentExpressions,
    collectLambdaCaptureNames,
    collectVisibleVariableBindingsAtNode,
    err,
    extractCallableParameterNames,
    extractCallableReturnExpressionNode,
    extractDirectCallExpressionNode,
    extractLambdaBodyNode,
    extractLambdaParameterDefaultExpressions,
    extractLambdaParameterNames,
    extractOutermostCallMemberExpression,
    extractPathFromMemberExpression,
    extractStatementsFromScopeContainer,
    extractStringLiteralValue,
    findBoundClassInstanceTypeAtNode,
    findClassMethodOwnerType,
    findEnclosingClassNameAtNode,
    findEnclosingFunctionArgumentsInfoAtNode,
    findPrototypeMethodSymbolForInstanceType,
    getCallExpressionTrailingPropertyName,
    getCallExpressionTrailingPropertyNames,
    getCallableParameterArityAtNode,
    getClassMethodWrapperName,
    getLambdaBindingStateAtCallNode,
    hostCallNeedsReceiverArg,
    inferExprType,
    inferPreciseCppTypeFromExpression,
    isBoundVariableInitializedWithHostCtorAtNode,
    isIdentifierBoundAtNode,
    isLocalFunctionPath,
    lowerArgumentsNode,
    lowerConsoleLogCallArguments,
    lowerExpressionValue,
    lowerIdentifierValue,
    lowerLiteralValue,
    lowerStatementNode,
    lowerStaticModelToExpression,
    lowerStaticModelToRuntimeExpression,
    reportUnsupportedLowering,
    resolveCallableNodeFromExpression,
    resolveStaticModelFromExpression,
    staticStringLiteralCpp,
    tryLowerDynamicHandleMethodCall,
    tryLowerStaticPromiseThenChain,
    tryResolveStaticFilterResultModel
  } = deps;

  function isSideEffectFreeInlineArgument(node) {
    if (!node || node.kind !== 'nonterminal') {
      return false;
    }
    let hasSideEffect = Boolean(findFirstNonterminal(node, 'callExpression'));
    walk(node, (candidate) => {
      if (hasSideEffect || !candidate || candidate.kind !== 'terminal') {
        return;
      }
      if (['=', '+=', '-=', '*=', '/=', '%=', '++', '--'].includes(candidate.value)) {
        hasSideEffect = true;
      }
    });
    return !hasSideEffect;
  }

  function isUnshadowedUndefinedExpression(node, compileContext) {
    if (!node || flattenNodeText(node) !== 'undefined') {
      return false;
    }
    if (!compileContext) {
      return true;
    }
    const visibleBindings = collectVisibleVariableBindingsAtNode(node, compileContext);
    return !visibleBindings.has('undefined');
  }

  function lowerImmediateCapturedArrowCall(arrowNode, argExprs, compileContext) {
    if (!arrowNode || arrowNode.kind !== 'nonterminal' || arrowNode.name !== 'arrowFunction') {
      return null;
    }
    if (collectLambdaCaptureNames(arrowNode, compileContext).length === 0) {
      return null;
    }
    const bodyNode = extractLambdaBodyNode(arrowNode);
    const hasBlockBody = bodyNode && (
      findFirstNonterminal(bodyNode, 'functionBody')
      || findFirstNonterminal(bodyNode, 'block')
    );
    if (!bodyNode || hasBlockBody) {
      return null;
    }
    const parameterNames = extractLambdaParameterNames(arrowNode);
    const parameterDefaults = extractLambdaParameterDefaultExpressions(arrowNode);
    const returnExpression = extractCallableReturnExpressionNode(arrowNode);
    if (!returnExpression
      || argExprs.length > parameterNames.length
      || parameterNames.slice(argExprs.length).some((name, index) => !parameterDefaults[argExprs.length + index])) {
      return null;
    }

    const replacements = new Map(compileContext.inlineIdentifierExpressions || []);
    if (!Array.isArray(compileContext._preludeStatements)) {
      compileContext._preludeStatements = [];
    }
    const initialPreludeLength = compileContext._preludeStatements.length;
    for (let index = 0; index < parameterNames.length; index += 1) {
      const suppliedArgument = argExprs[index] || null;
      const argumentNode = (!suppliedArgument
        || (parameterDefaults[index] && isUnshadowedUndefinedExpression(suppliedArgument, compileContext)))
        ? parameterDefaults[index]
        : suppliedArgument;
      const previousReplacements = compileContext.inlineIdentifierExpressions;
      if (!argExprs[index]) {
        compileContext.inlineIdentifierExpressions = replacements;
      }
      let loweredArgument = null;
      try {
        loweredArgument = lowerExpressionValue(argumentNode, compileContext);
      } finally {
        compileContext.inlineIdentifierExpressions = previousReplacements;
      }
      if (loweredArgument === null) {
        compileContext._preludeStatements.splice(initialPreludeLength);
        return null;
      }
      let replacement = `(${loweredArgument})`;
      if (!isSideEffectFreeInlineArgument(argumentNode)) {
        const argumentType = inferPreciseCppTypeFromExpression(argumentNode, compileContext);
        if (!argumentType || argumentType === 'void') {
          compileContext._preludeStatements.splice(initialPreludeLength);
          return null;
        }
        const tempIndex = Number(compileContext._inlineCapturedArgumentCounter || 0);
        compileContext._inlineCapturedArgumentCounter = tempIndex + 1;
        const tempName = `__maia_inline_arg_${tempIndex}`;
        compileContext._preludeStatements.push(`${argumentType} ${tempName} = ${loweredArgument};`);
        replacement = tempName;
      }
      replacements.set(parameterNames[index], replacement);
    }

    const previousReplacements = compileContext.inlineIdentifierExpressions;
    compileContext.inlineIdentifierExpressions = replacements;
    try {
      const loweredReturn = lowerExpressionValue(returnExpression, compileContext);
      if (loweredReturn === null) {
        compileContext._preludeStatements.splice(initialPreludeLength);
      }
      return loweredReturn;
    } finally {
      compileContext.inlineIdentifierExpressions = previousReplacements;
    }
  }

  function isDirectExpressionStatementCall(callNode, compileContext) {
    if (!callNode || !compileContext || !compileContext.tree) {
      return false;
    }
    const path = findNodePath(compileContext.tree, callNode);
    for (let index = path.length - 2; index >= 0; index -= 1) {
      const ancestor = path[index];
      if (!ancestor || ancestor.kind !== 'nonterminal') {
        continue;
      }
      if (ancestor.name === 'expressionStatement') {
        const expressionNode = (ancestor.children || []).find(
          (child) => child && child.kind === 'nonterminal' && child.name === 'expression'
        );
        return extractDirectCallExpressionNode(expressionNode) === callNode;
      }
      if (ancestor.name === 'statement' || ancestor.name === 'sourceElement' || ancestor.name === 'functionBody') {
        return false;
      }
    }
    return false;
  }

  function lowerImmediateCapturedArrowBlockCall(arrowNode, argExprs, compileContext) {
    if (!arrowNode || arrowNode.kind !== 'nonterminal' || arrowNode.name !== 'arrowFunction') {
      return null;
    }
    if (collectLambdaCaptureNames(arrowNode, compileContext).length === 0) {
      return null;
    }
    const bodyNode = extractLambdaBodyNode(arrowNode);
    const bodyBlock = bodyNode && (
      findFirstNonterminal(bodyNode, 'functionBody')
      || findFirstNonterminal(bodyNode, 'block')
    );
    const parameterNames = extractLambdaParameterNames(arrowNode);
    const parameterDefaults = extractLambdaParameterDefaultExpressions(arrowNode);
    if (!bodyBlock
      || findFirstNonterminal(bodyBlock, 'returnStatement')
      || argExprs.length > parameterNames.length
      || parameterNames.slice(argExprs.length).some((name, index) => !parameterDefaults[argExprs.length + index])) {
      return null;
    }

    const replacements = new Map(compileContext.inlineIdentifierExpressions || []);
    const parameterModels = [];
    const argumentDeclarations = [];
    for (let index = 0; index < parameterNames.length; index += 1) {
      const suppliedArgument = argExprs[index] || null;
      const argumentNode = (!suppliedArgument
        || (parameterDefaults[index] && isUnshadowedUndefinedExpression(suppliedArgument, compileContext)))
        ? parameterDefaults[index]
        : suppliedArgument;
      const previousReplacements = compileContext.inlineIdentifierExpressions;
      if (!argExprs[index]) {
        compileContext.inlineIdentifierExpressions = replacements;
      }
      let loweredArgument = null;
      try {
        loweredArgument = lowerExpressionValue(argumentNode, compileContext);
      } finally {
        compileContext.inlineIdentifierExpressions = previousReplacements;
      }
      if (loweredArgument === null) {
        return null;
      }
      let replacement = `(${loweredArgument})`;
      if (!isSideEffectFreeInlineArgument(argumentNode)) {
        const argumentType = inferPreciseCppTypeFromExpression(argumentNode, compileContext);
        if (!argumentType || argumentType === 'void') {
          return null;
        }
        const tempIndex = Number(compileContext._inlineCapturedArgumentCounter || 0);
        compileContext._inlineCapturedArgumentCounter = tempIndex + 1;
        const tempName = `__maia_inline_arg_${tempIndex}`;
        argumentDeclarations.push(`${argumentType} ${tempName} = ${loweredArgument};`);
        replacement = tempName;
      }
      replacements.set(parameterNames[index], replacement);
      parameterModels.push(resolveStaticModelFromExpression(argumentNode, argumentNode, compileContext));
    }

    const previousReplacements = compileContext.inlineIdentifierExpressions;
    const previousStaticModels = compileContext.inlineIdentifierStaticModels;
    const previousStaticModelCache = compileContext._staticModelCache;
    const previousConsoleConcatExprCache = compileContext._consoleConcatExprCache;
    const previousConsoleConcatPieceCache = compileContext._consoleConcatPieceCache;
    const statements = ['{', ...argumentDeclarations.map((declaration) => `  ${declaration}`)];
    compileContext.inlineIdentifierExpressions = replacements;
    const staticModels = new Map(previousStaticModels || []);
    for (let index = 0; index < parameterNames.length; index += 1) {
      if (parameterModels[index]) {
        staticModels.set(parameterNames[index], parameterModels[index]);
      }
    }
    compileContext.inlineIdentifierStaticModels = staticModels;
    compileContext._staticModelCache = new WeakMap();
    compileContext._consoleConcatExprCache = new WeakMap();
    compileContext._consoleConcatPieceCache = new WeakMap();
    try {
      for (const statementNode of extractStatementsFromScopeContainer(bodyBlock)) {
        statements.push(...lowerStatementNode(statementNode, compileContext, 1));
      }
    } finally {
      compileContext.inlineIdentifierExpressions = previousReplacements;
      compileContext.inlineIdentifierStaticModels = previousStaticModels;
      compileContext._staticModelCache = previousStaticModelCache;
      compileContext._consoleConcatExprCache = previousConsoleConcatExprCache;
      compileContext._consoleConcatPieceCache = previousConsoleConcatPieceCache;
    }
    statements.push('}');
    return statements;
  }

  function lowerStaticCapturedForEachCallbacks(callbackNode, baseModel, loweredBase, compileContext) {
    if (!callbackNode || callbackNode.kind !== 'nonterminal' || callbackNode.name !== 'arrowFunction') {
      return null;
    }
    if (!baseModel || baseModel.kind !== 'array' || !Array.isArray(baseModel.values)
      || collectLambdaCaptureNames(callbackNode, compileContext).length === 0) {
      return null;
    }
    const bodyNode = extractLambdaBodyNode(callbackNode);
    const bodyExpression = extractCallableReturnExpressionNode(callbackNode);
    const blockNode = bodyNode && (
      findFirstNonterminal(bodyNode, 'functionBody')
      || findFirstNonterminal(bodyNode, 'block')
    );
    const blockStatements = blockNode ? extractStatementsFromScopeContainer(blockNode) : [];
    const parameterNames = extractLambdaParameterNames(callbackNode);
    if (!bodyNode
      || (!bodyExpression && !blockNode)
      || (blockNode && findFirstNonterminal(blockNode, 'returnStatement'))
      || parameterNames.length > 3) {
      return null;
    }

    const previousReplacements = compileContext.inlineIdentifierExpressions;
    const previousStaticModels = compileContext.inlineIdentifierStaticModels;
    const previousStaticModelCache = compileContext._staticModelCache;
    const previousConsoleConcatExprCache = compileContext._consoleConcatExprCache;
    const previousConsoleConcatPieceCache = compileContext._consoleConcatPieceCache;
    const statements = [];
    if (!Array.isArray(compileContext._preludeStatements)) {
      compileContext._preludeStatements = [];
    }
    const initialPreludeLength = compileContext._preludeStatements.length;

    try {
      for (let index = 0; index < baseModel.values.length; index += 1) {
        const valueExpr = lowerStaticModelToExpression(baseModel.values[index]);
        if (valueExpr === null || (parameterNames.length >= 3 && loweredBase === null)) {
          return null;
        }
        const replacements = new Map(previousReplacements || []);
        if (parameterNames[0]) { replacements.set(parameterNames[0], `(${valueExpr})`); }
        if (parameterNames[1]) { replacements.set(parameterNames[1], String(index)); }
        if (parameterNames[2]) { replacements.set(parameterNames[2], `(${loweredBase})`); }
        compileContext.inlineIdentifierExpressions = replacements;
        const staticModels = new Map(previousStaticModels || []);
        if (parameterNames[0]) { staticModels.set(parameterNames[0], baseModel.values[index]); }
        if (parameterNames[1]) { staticModels.set(parameterNames[1], { kind: 'number', value: index }); }
        if (parameterNames[2]) { staticModels.set(parameterNames[2], baseModel); }
        compileContext.inlineIdentifierStaticModels = staticModels;
        compileContext._staticModelCache = new WeakMap();
        compileContext._consoleConcatExprCache = new WeakMap();
        compileContext._consoleConcatPieceCache = new WeakMap();

        const preludeLength = compileContext._preludeStatements.length;
        if (bodyExpression && !blockNode) {
          const loweredBody = lowerExpressionValue(bodyExpression, compileContext);
          if (loweredBody === null) {
            return null;
          }
          statements.push(...compileContext._preludeStatements.splice(preludeLength));
          statements.push(`${loweredBody};`);
        } else {
          statements.push('{');
          for (const statementNode of blockStatements) {
            statements.push(...lowerStatementNode(statementNode, compileContext, 1));
          }
          statements.push('}');
        }
      }
    } finally {
      compileContext.inlineIdentifierExpressions = previousReplacements;
      compileContext.inlineIdentifierStaticModels = previousStaticModels;
      compileContext._staticModelCache = previousStaticModelCache;
      compileContext._consoleConcatExprCache = previousConsoleConcatExprCache;
      compileContext._consoleConcatPieceCache = previousConsoleConcatPieceCache;
      if (compileContext._preludeStatements.length > initialPreludeLength) {
        compileContext._preludeStatements.splice(initialPreludeLength);
      }
    }

    return statements;
  }

  function lowerCallExpressionValue(node, compileContext) {
    if (!node || node.kind !== 'nonterminal' || node.name !== 'callExpression') {
      reportUnsupportedLowering(
        compileContext,
        'call-expression-unlowerable',
        'call expression node is missing, malformed, or unexpected kind'
      );
      if (compileContext && compileContext.strictLowering) {
        err('unsupported lowering: call expression node shape');
      }
      return null;
    }

    const children = node.children || [];
    const superCallNode = children.find((c) => c && c.kind === 'nonterminal' && c.name === 'superCall') || null;
    if (superCallNode) {
      const superArgsNode = findFirstNonterminal(superCallNode, 'arguments');
      let superArgListNode = superArgsNode
        ? (superArgsNode.children || []).find((c) => c && c.kind === 'nonterminal' && c.name === 'argumentList') || null
        : null;
      if (!superArgListNode && superArgsNode) {
        superArgListNode = findFirstNonterminal(superArgsNode, 'argumentList');
      }
      const superArgs = superArgListNode ? collectArgumentExpressions(superArgListNode) : [];
      if (superArgs.length > 0) {
        reportUnsupportedLowering(
          compileContext,
          'call-expression-unlowerable',
          'super call with arguments is not supported by current class wrapper lowering'
        );
        if (compileContext && compileContext.strictLowering) {
          err('unsupported lowering: super call arguments');
        }
        return null;
      }
      return '';
    }

    let memberExprNode = extractOutermostCallMemberExpression(node);
    let argsNode = children.find((c) => c && c.kind === 'nonterminal' && c.name === 'arguments') || null;
    if (!argsNode) {
      argsNode = findFirstNonterminal(node, 'arguments');
    }
    
    // Additional fallback: search for argumentList directly if arguments wrapper not found
    if (!argsNode) {
      for (const child of children) {
        if (child && child.kind === 'nonterminal') {
          const argListCandidate = findFirstNonterminal(child, 'argumentList');
          if (argListCandidate) {
            argsNode = child;
            break;
          }
        }
      }
    }
    
    if (!memberExprNode || !argsNode) {
      reportUnsupportedLowering(
        compileContext,
        'call-expression-unlowerable',
        'call expression is missing member expression or arguments'
      );
      if (compileContext && compileContext.strictLowering) {
        err('unsupported lowering: malformed call expression');
      }
      return null;
    }

    const pathSegments = extractPathFromMemberExpression(memberExprNode, null);
    const memberChildren = memberExprNode.children || [];
    const directPropertyIndex = memberChildren.findIndex((child) => child && child.kind === 'terminal' && child.value === '.');
    const directPropertyNode = directPropertyIndex >= 0 ? memberChildren[directPropertyIndex + 1] : null;
    const directPropertyName = directPropertyNode ? findFirstIdentifierValue(directPropertyNode) : null;
    const baseExpressionNode = directPropertyIndex > 0 ? memberChildren[0] : null;
    const pathLabel = Array.isArray(pathSegments) ? pathSegments.join('.') : '';

    let argListNode = (argsNode.children || []).find((c) => c && c.kind === 'nonterminal' && c.name === 'argumentList') || null;
    if (!argListNode) {
      argListNode = findFirstNonterminal(argsNode, 'argumentList');
    }
    const argExprs = argListNode ? collectArgumentExpressions(argListNode) : [];
    const isParenthesizedCallableIife = Boolean(
      memberExprNode
      && directPropertyIndex < 0
      && (findFirstNonterminal(memberExprNode, 'arrowFunction')
        || findFirstNonterminal(memberExprNode, 'asyncArrowFunction')
        || findFirstNonterminal(memberExprNode, 'functionExpression'))
    );
    if (isParenthesizedCallableIife) {
      const innerCallable = findFirstNonterminal(memberExprNode, 'arrowFunction')
        || findFirstNonterminal(memberExprNode, 'asyncArrowFunction')
        || findFirstNonterminal(memberExprNode, 'functionExpression');
      const calleeExpr = lowerExpressionValue(innerCallable || memberExprNode, compileContext);
      if (calleeExpr && calleeExpr !== 'nullptr') {
        const castArgs = argExprs.map((argExpr) => {
          const loweredArg = lowerExpressionValue(argExpr, compileContext);
          return `(int)(${loweredArg !== null ? loweredArg : '0'})`;
        });
        return `__maia_closure_call_i32_${argExprs.length}(${[`(void*)(${calleeExpr})`, ...castArgs].join(', ')})`;
      }
    }
    const dynamicMethodCall = tryLowerDynamicHandleMethodCall(node, compileContext);
    if (dynamicMethodCall !== null) {
      const trailingPropertyName = getCallExpressionTrailingPropertyName(node);
      if (trailingPropertyName) {
        const trailingPropertyNames = getCallExpressionTrailingPropertyNames(node);
        let propertyReceiver = dynamicMethodCall;
        for (let index = 0; index < trailingPropertyNames.length - 1; index += 1) {
          propertyReceiver = `__async_handle_get_handle(${propertyReceiver}, (const char*)"${trailingPropertyNames[index]}")`;
        }
        const finalPropertyName = trailingPropertyNames[trailingPropertyNames.length - 1];
        if (compileContext.dynamicHandleMethodPropertyResultType === 'string') {
          return `__async_handle_get_handle(${propertyReceiver}, (const char*)"${finalPropertyName}")`;
        }
        const getter = compileContext.dynamicHandleNumericType === 'f64'
          ? '__async_handle_get_f64'
          : '__async_handle_get_i32';
        return `${getter}(${propertyReceiver}, (const char*)"${finalPropertyName}")`;
      }
      return dynamicMethodCall;
    }
    if (pathLabel === 'Array.prototype.slice.call'
      && argExprs.length >= 1
      && argExprs[0]
      && findFirstIdentifierValue(argExprs[0]) === 'arguments') {
      const enclosingFunctionArgumentsInfo = findEnclosingFunctionArgumentsInfoAtNode(node, compileContext);
      if (enclosingFunctionArgumentsInfo && enclosingFunctionArgumentsInfo.usesArguments) {
        const startExpr = argExprs.length >= 2 ? lowerExpressionValue(argExprs[1], compileContext) : '0';
        return `__maia_runtime_arguments_slice(__maia_argc, (int)(${startExpr === null ? '0' : startExpr}))`;
      }
    }

    // console.log has a specialized lowering path below. Its arguments must not
    // be lowered here as well: a captured-arrow argument can allocate prelude
    // temporaries, and lowering it twice would evaluate it twice.
    const isConsoleLogCall = Array.isArray(pathSegments) && pathSegments.join('.') === 'console.log';
    const args = isConsoleLogCall ? [] : lowerArgumentsNode(argsNode, compileContext);
    const loweredStaticPromiseThenChain = tryLowerStaticPromiseThenChain(node, compileContext);
    if (loweredStaticPromiseThenChain !== null) {
      return loweredStaticPromiseThenChain;
    }

    // A call whose receiver and arguments resolve to immutable local values must
    // stay inside the generated runtime. Restrict this to methods implemented by
    // the static evaluator: resolving arbitrary calls here is both unsound and
    // unnecessarily expensive for host APIs such as Reflect.set.
    const staticLocalMethodNames = new Set([
      'padStart', 'padEnd', 'map', 'filter', 'some', 'every', 'find', 'findIndex', 'reduce', 'reduceRight', 'includes'
    ]);
    const hasDynamicClosureArg = Boolean(
      compileContext
      && compileContext.closurePlan
      && compileContext.closurePlan.orderedClosures.length > 0
      && argExprs.some((a) => findFirstNonterminal(a, 'arrowFunction') || findFirstNonterminal(a, 'functionExpression'))
    );
    if (staticLocalMethodNames.has(directPropertyName) && !hasDynamicClosureArg) {
      const staticCallModel = resolveStaticModelFromExpression(node, node, compileContext);
      const loweredStaticCall = lowerStaticModelToRuntimeExpression(staticCallModel);
      if (loweredStaticCall !== null) {
        return loweredStaticCall;
      }
    }

    let loweredCall = null;
    const lambdaBindingState = getLambdaBindingStateAtCallNode(node, pathSegments, compileContext);
    let droppedJsRuntimeMethodCall = false;

    if (Array.isArray(pathSegments) && pathSegments.length === 1) {
      loweredCall = lowerImmediateCapturedArrowCall(
        resolveCallableNodeFromExpression(memberExprNode, compileContext),
        argExprs,
        compileContext
      );
      if (!loweredCall && isDirectExpressionStatementCall(node, compileContext)) {
        const blockStatements = lowerImmediateCapturedArrowBlockCall(
          resolveCallableNodeFromExpression(memberExprNode, compileContext),
          argExprs,
          compileContext
        );
        if (blockStatements !== null) {
          if (!Array.isArray(compileContext._preludeStatements)) {
            compileContext._preludeStatements = [];
          }
          compileContext._preludeStatements.push(...blockStatements);
          loweredCall = '0';
        }
      }
    }

    // Constructor-style function expressions are emitted as __new__Name() and
    // __Name__call(receiver, ...). A bare Name(...) would require a JavaScript
    // global `this` receiver, which this C++ runtime intentionally does not
    // model. Do not fall through and emit an undefined C++ symbol.
    if (pathSegments
      && pathSegments.length === 1
      && compileContext
      && compileContext.topLevelConstructorBindingNames
      && compileContext.topLevelConstructorBindingNames.has(pathSegments[0])) {
      reportUnsupportedLowering(
        compileContext,
        'constructor-call-without-new',
        `constructor-style function expression '${pathSegments[0]}' must be invoked with new or .call(receiver, ...)`
      );
      return '0';
    }

    if (!loweredCall
      && compileContext
      && compileContext.hasLambdaCapturePayload
      && lambdaBindingState
      && lambdaBindingState.isCaptureAware
      && Array.isArray(pathSegments)
      && pathSegments.length === 1) {
      const calleeExpr = lowerIdentifierValue(pathSegments[0], compileContext);
      if (calleeExpr) {
        if (lambdaBindingState.isAsync || lambdaBindingState.fromAssignment) {
          loweredCall = `__maia_runtime_lambda_invoke_function_id((void*)${calleeExpr}, ${argExprs.length}, ${lambdaBindingState.isAsync ? 1 : 0})`;
        } else {
          const castArgs = argExprs.map((argExpr) => {
            const loweredArg = lowerExpressionValue(argExpr, compileContext);
            return `(int)(${loweredArg !== null ? loweredArg : '0'})`;
          });
          loweredCall = `__maia_closure_call_i32_${argExprs.length}(${[`(void*)(${calleeExpr})`, ...castArgs].join(', ')})`;
        }
      }
    }

    if (pathSegments && pathSegments.length > 0 && isLocalFunctionPath(pathSegments, compileContext)) {
      if (!loweredCall) {
        loweredCall = `${pathSegments[0]}(${buildLocalFunctionCallArgs(pathSegments[0], args, argExprs, compileContext)})`;
      }
    }

    if (!loweredCall && pathSegments && pathSegments.length === 1 && isLocalFunctionPath(pathSegments, compileContext)) {
      loweredCall = `${pathSegments[0]}(${buildLocalFunctionCallArgs(pathSegments[0], args, argExprs, compileContext)})`;
    }

    if (!loweredCall && pathSegments && pathSegments.length === 1) {
      const callableParamArity = getCallableParameterArityAtNode(pathSegments[0], node, compileContext);
      if (callableParamArity !== null) {
        const calleeExpr = lowerIdentifierValue(pathSegments[0], compileContext) || pathSegments[0];
        const castArgs = argExprs.map((argExpr) => {
          const loweredArg = lowerExpressionValue(argExpr, compileContext);
          return `(int)(${loweredArg !== null ? loweredArg : '0'})`;
        });
        loweredCall = `__maia_closure_call_i32_${argExprs.length}(${[`(void*)(${calleeExpr})`, ...castArgs].join(', ')})`;
      }
    }

    if (!loweredCall && pathSegments && pathSegments.length === 1) {
      const globalCallName = pathSegments[0];
      const isBoundLocalCall = isIdentifierBoundAtNode(globalCallName, node, compileContext);
      const hostResolvedGlobalCall = compileContext
        && compileContext.hostRegistry
        && typeof compileContext.hostRegistry.resolvePath === 'function'
        ? compileContext.hostRegistry.resolvePath(pathSegments)
        : null;
      if (!isBoundLocalCall && !hostResolvedGlobalCall) {
        reportUnsupportedLowering(
          compileContext,
          'unresolved-global-call',
          `global call '${globalCallName}' is not locally bound and will be treated as host symbol`
        );
        if (compileContext && compileContext.strictLowering) {
          err(`unsupported lowering: unresolved global call '${globalCallName}'`);
        }
      }
    }

    if (!loweredCall && directPropertyName && ['get', 'set', 'has'].includes(directPropertyName)) {
      const weakMapBaseName = (pathSegments && pathSegments.length > 0 ? pathSegments[0] : null)
        || (baseExpressionNode ? findFirstIdentifierValue(baseExpressionNode) : null);
      const weakMapLookupNode = baseExpressionNode || node;
      if (weakMapBaseName
        && isBoundVariableInitializedWithHostCtorAtNode(weakMapBaseName, weakMapLookupNode, 'WeakMap', compileContext)
        && argExprs.length >= 1) {
        const hiddenKey = `__maia_weakmap_${weakMapBaseName}`;
        const loweredKeyExpr = lowerExpressionValue(argExprs[0], compileContext);
        if (loweredKeyExpr !== null) {
          if (directPropertyName === 'get') {
            loweredCall = `__maia_runtime_value_get_property((void*)(${loweredKeyExpr}), (void*)"${hiddenKey}")`;
          } else if (directPropertyName === 'has') {
            loweredCall = `(__maia_runtime_value_get_property((void*)(${loweredKeyExpr}), (void*)"${hiddenKey}") != 0)`;
          } else if (directPropertyName === 'set' && argExprs.length >= 2) {
            const loweredValueExpr = lowerExpressionValue(argExprs[1], compileContext);
            if (loweredValueExpr !== null) {
              const objectLiteralNode = findFirstNonterminal(argExprs[1], 'objectLiteral');
              const flattenedWrites = buildFlattenedWeakMapPropertyWrites(hiddenKey, loweredKeyExpr, objectLiteralNode, compileContext);
              loweredCall = flattenedWrites.length > 0
                ? `(${[`__Reflect((void*)(${loweredKeyExpr}), "${hiddenKey}", (long)(${loweredValueExpr}))`, ...flattenedWrites].join(', ')})`
                : `__Reflect((void*)(${loweredKeyExpr}), "${hiddenKey}", (long)(${loweredValueExpr}))`;
            }
          }
        }
      }
    }

    if (!loweredCall && pathSegments && pathSegments.length === 1) {
      const weakMapBaseName = pathSegments[0];
      if (isBoundVariableInitializedWithHostCtorAtNode(weakMapBaseName, node, 'WeakMap', compileContext) && argExprs.length >= 1) {
        const hiddenKey = `__maia_weakmap_${weakMapBaseName}`;
        const inferredMethod = argExprs.length >= 2 ? 'set' : 'get';
        const loweredKeyExpr = lowerExpressionValue(argExprs[0], compileContext);
        if (loweredKeyExpr !== null) {
          if (inferredMethod === 'get') {
            loweredCall = `__maia_runtime_value_get_property((void*)(${loweredKeyExpr}), (void*)"${hiddenKey}")`;
          } else {
            const loweredValueExpr = lowerExpressionValue(argExprs[1], compileContext);
            if (loweredValueExpr !== null) {
              const objectLiteralNode = findFirstNonterminal(argExprs[1], 'objectLiteral');
              const flattenedWrites = buildFlattenedWeakMapPropertyWrites(hiddenKey, loweredKeyExpr, objectLiteralNode, compileContext);
              loweredCall = flattenedWrites.length > 0
                ? `(${[`__Reflect((void*)(${loweredKeyExpr}), "${hiddenKey}", (long)(${loweredValueExpr}))`, ...flattenedWrites].join(', ')})`
                : `__Reflect((void*)(${loweredKeyExpr}), "${hiddenKey}", (long)(${loweredValueExpr}))`;
            }
          }
        }
      }
    }

    if (!loweredCall && pathLabel === 'Reflect.set' && argExprs.length >= 3) {
      const loweredTarget = lowerExpressionValue(argExprs[0], compileContext);
      const loweredKey = lowerExpressionValue(argExprs[1], compileContext);
      const loweredValue = lowerExpressionValue(argExprs[2], compileContext);
      if (loweredTarget !== null && loweredKey !== null && loweredValue !== null) {
        loweredCall = `__Reflect((void*)(${loweredTarget}), ${loweredKey}, (long)(${loweredValue}))`;
      }
    }

    if (!loweredCall && pathLabel === 'Reflect.ownKeys' && argExprs.length >= 1) {
      const loweredTarget = lowerExpressionValue(argExprs[0], compileContext);
      if (loweredTarget !== null) {
        loweredCall = `__Reflect__ownKeys(${loweredTarget})`;
      }
    }

    if (!loweredCall && pathSegments && pathSegments.length === 2 && pathSegments[1] === 'call') {
      const ctorName = pathSegments[0];
      const isCtorBinding = compileContext
        && compileContext.topLevelConstructorBindingNames
        && compileContext.topLevelConstructorBindingNames.has(ctorName);
      if (isCtorBinding && argExprs.length >= 1) {
        const receiverExpr = lowerExpressionValue(argExprs[0], compileContext);
        const loweredCallArgs = [];
        let allArgsLowered = receiverExpr !== null;
        for (const argExpr of argExprs.slice(1)) {
          const loweredArg = lowerExpressionValue(argExpr, compileContext);
          if (loweredArg === null) {
            allArgsLowered = false;
            break;
          }
          loweredCallArgs.push(loweredArg);
        }
        if (allArgsLowered) {
          loweredCall = `__${ctorName}__call(${receiverExpr}${loweredCallArgs.length ? `, ${loweredCallArgs.join(', ')}` : ''})`;
        }
      }
    }

    // Member method call: this->method(args) or obj.method(args)
    if (!loweredCall && pathSegments && pathSegments.length >= 2) {
      const objectLiteralAssignedSymbol = compileContext
        && compileContext.topLevelObjectLiteralFunctionExpressionSymbols
        ? compileContext.topLevelObjectLiteralFunctionExpressionSymbols.get(pathSegments.join('.'))
        : null;
      if (objectLiteralAssignedSymbol) {
        loweredCall = `${objectLiteralAssignedSymbol}(${pathSegments[0]}${args && args.trim() ? `, ${args}` : ''})`;
      }
    }

    if (!loweredCall && pathSegments && pathSegments.length >= 2) {
      const directAssignedSymbol = compileContext
        && compileContext.topLevelAssignedFunctionExpressionSymbols
        ? compileContext.topLevelAssignedFunctionExpressionSymbols.get(pathSegments.join('.'))
        : null;
      if (directAssignedSymbol) {
        loweredCall = `${directAssignedSymbol}(${args})`;
      }
    }

    if (!loweredCall && pathSegments && pathSegments.length >= 2) {
      const instanceType = findBoundClassInstanceTypeAtNode(pathSegments[0], node, compileContext);
      const prototypeMethodSymbol = findPrototypeMethodSymbolForInstanceType(
        instanceType,
        pathSegments[pathSegments.length - 1],
        compileContext
      );
      if (instanceType && prototypeMethodSymbol) {
        loweredCall = `${prototypeMethodSymbol}(${pathSegments[0]}${args && args.trim() ? `, ${args}` : ''})`;
      }
    }

    if (!loweredCall && pathSegments && pathSegments.length >= 2) {
      const isThisCall = pathSegments.length === 2 && pathSegments[0] === 'this';
      const methodName = pathSegments[pathSegments.length - 1];
      const localClassType = isThisCall ? null : findBoundClassInstanceTypeAtNode(pathSegments[0], node, compileContext);
      {
        let loweredCall = null;
        if (compileContext && compileContext.collectionsPlan && compileContext.collectionsPlan.enabled
            && Array.isArray(pathSegments) && pathSegments.length === 2) {
            const objName = pathSegments[0];
            const mName = pathSegments[1];
            if (objName === 'Array' && mName === 'from') {
              compileContext.runtimeFallbackHelpersUsed = true;
              const a0 = argExprs.length >= 1 ? (lowerExpressionValue(argExprs[0], compileContext) || '0') : '0';
              loweredCall = `__maia_array_from((void*)(${a0}))`;
            } else {
              const instType = findBoundClassInstanceTypeAtNode(objName, node, compileContext);
              const resolvedObj = (compileContext && compileContext.inlineIdentifierExpressions && compileContext.inlineIdentifierExpressions.get(objName)) || objName;
              if (instType === 'Set' || instType === 'WeakSet') {
                compileContext.runtimeFallbackHelpersUsed = true;
                const a0 = argExprs.length >= 1 ? (lowerExpressionValue(argExprs[0], compileContext) || '0') : '0';
                if (mName === 'add') loweredCall = `__maia_set_add((void*)(${resolvedObj}), (long)(${a0}))`;
                else if (mName === 'has') loweredCall = `__maia_set_has((void*)(${resolvedObj}), (long)(${a0}))`;
                else if (mName === 'delete') loweredCall = `__maia_set_delete((void*)(${resolvedObj}), (long)(${a0}))`;
              } else if (instType === 'Map' || instType === 'WeakMap') {
                compileContext.runtimeFallbackHelpersUsed = true;
                const a0 = argExprs.length >= 1 ? (lowerExpressionValue(argExprs[0], compileContext) || '0') : '0';
                const a1 = argExprs.length >= 2 ? (lowerExpressionValue(argExprs[1], compileContext) || '0') : '0';
                if (mName === 'set') loweredCall = `__maia_map_set((void*)(${resolvedObj}), (long)(${a0}), (long)(${a1}))`;
                else if (mName === 'get') loweredCall = `__maia_map_get((void*)(${resolvedObj}), (long)(${a0}))`;
                else if (mName === 'has') loweredCall = `__maia_map_has((void*)(${resolvedObj}), (long)(${a0}))`;
                else if (mName === 'delete') loweredCall = `__maia_map_delete((void*)(${resolvedObj}), (long)(${a0}))`;
                else if (mName === 'forEach') loweredCall = `__maia_map_forEach((void*)(${resolvedObj}), (void*)(${a0}))`;
              }
            }
          }
        if (loweredCall !== null) return loweredCall;
      }
      const isLocalObjectCall = isThisCall || Boolean(localClassType);
      if (isLocalObjectCall) {
        const loweredBase = baseExpressionNode ? lowerExpressionValue(baseExpressionNode, compileContext) : pathSegments[0];
        const wrapperClassName = isThisCall ? null : localClassType;
        if (wrapperClassName) {
          if (loweredBase === null) {
            reportUnsupportedLowering(
              compileContext,
              'method-call-base-unlowerable',
              `object method base expression could not be lowered for '${pathSegments[0]}.${methodName}'`
            );
            if (compileContext && compileContext.strictLowering) {
              err(`unsupported lowering: object method base '${pathSegments[0]}.${methodName}'`);
            }
          } else {
            const prototypeMethodSymbol = findPrototypeMethodSymbolForInstanceType(wrapperClassName, methodName, compileContext);
            if (prototypeMethodSymbol) {
              loweredCall = `${prototypeMethodSymbol}(${loweredBase}${args && args.trim() ? `, ${args}` : ''})`;
            } else {
              const methodOwnerType = findClassMethodOwnerType(wrapperClassName, methodName, compileContext) || wrapperClassName;
              if (!(methodOwnerType === 'Promise' && compileContext && compileContext.promisePlan && compileContext.promisePlan.enabled)) {
                loweredCall = `${getClassMethodWrapperName(methodOwnerType, methodName)}(&${loweredBase}${args && args.trim() ? `, ${args}` : ''})`;
              }
            }
          }
        } else {
          const enclosingClassName = findEnclosingClassNameAtNode(node, compileContext);
          if (enclosingClassName) {
            loweredCall = `${getClassMethodWrapperName(enclosingClassName, methodName)}(self${args && args.trim() ? `, ${args}` : ''})`;
          } else {
            reportUnsupportedLowering(
              compileContext,
              'method-call-base-unlowerable',
              `this-method call could not resolve enclosing class for '${methodName}'`
            );
            if (compileContext && compileContext.strictLowering) {
              err(`unsupported lowering: this-method call '${methodName}'`);
            }
          }
        }
      }
    }

    if (!loweredCall && Array.isArray(pathSegments)) {
      const fullPath = pathSegments.join('.');
      if (fullPath === 'Object.prototype.hasOwnProperty.call' && argExprs.length >= 2) {
        const a0 = lowerExpressionValue(argExprs[0], compileContext) || '0';
        const a1 = lowerExpressionValue(argExprs[1], compileContext) || '""';
        if (compileContext) compileContext.runtimeFallbackHelpersUsed = true;
        loweredCall = `__maia_runtime_value_has_property((void*)(${a0}), (const char*)(${a1}))`;
      } else if ((fullPath === 'Math.min' || fullPath === 'Math.max') && argExprs.length >= 2) {
        const fnBase = fullPath === 'Math.min' ? '__maia_math_min2' : '__maia_math_max2';
        if (compileContext) compileContext.mathMinMaxHelpersUsed = true;
        const toDoubleExpr = (exprNode, lowered) => {
          const t = inferExprType(exprNode, compileContext);
          return (t === 'number' || t === 'bool') ? `(double)(${lowered})` : `(double)(long)(${lowered})`;
        };
        const loweredArgs = argExprs.map((e) => toDoubleExpr(e, lowerExpressionValue(e, compileContext) || '0'));
        let acc = loweredArgs[0];
        for (let ai = 1; ai < loweredArgs.length; ai += 1) {
          acc = `${fnBase}(${acc}, ${loweredArgs[ai]})`;
        }
        loweredCall = acc;
      } else if (fullPath === 'JSON.stringify' && argExprs.length >= 1 && argExprs.length < 3) {
        const a0 = lowerExpressionValue(argExprs[0], compileContext) || '0';
        const a1 = argExprs.length >= 2 ? (lowerExpressionValue(argExprs[1], compileContext) || '0') : '0';
        if (compileContext) {
          if (!compileContext.externHosts) compileContext.externHosts = new Set();
        }
        loweredCall = `__JSON__stringify((void*)(${a0}), (void*)(${a1}), (void*)(0))`;
      }
    }

      if (!loweredCall && directPropertyName === 'match' && baseExpressionNode && baseExpressionNode.kind === 'nonterminal' && argExprs.length >= 1) {
      const loweredBase = lowerExpressionValue(baseExpressionNode, compileContext);
      const patArg = lowerExpressionValue(argExprs[0], compileContext);
      if (loweredBase !== null && patArg !== null) {
        if (compileContext) compileContext.regexUsed = true;
        loweredCall = `__maiaregex__match((const char*)(${loweredBase}), (void*)(${patArg}))`;
      }
    }

      // Constant-fold: stringLiteral.repeat(numericLiteral) → C string literal (C++98-safe)
    if (!loweredCall && directPropertyName === 'repeat' && baseExpressionNode && argExprs.length === 1) {
      const loweredBase = lowerExpressionValue(baseExpressionNode, compileContext);
      const loweredCount = lowerExpressionValue(argExprs[0], compileContext);
      if (loweredBase !== null && loweredCount !== null) {
        const strMatch = loweredBase.match(/^"((?:[^"\\]|\\.)*)"$/);
        const n = parseInt(loweredCount, 10);
        if (strMatch && Number.isFinite(n) && n >= 0 && n <= 10000) {
          loweredCall = `"${strMatch[1].repeat(n)}"`;
        }
      }
    }

    if (!loweredCall && (directPropertyName === 'padStart' || directPropertyName === 'padEnd') && baseExpressionNode && argExprs.length >= 1) {
      const baseLiteral = extractStringLiteralValue(baseExpressionNode);
      const widthLiteralNode = findFirstNonterminal(argExprs[0], 'literal');
      const fillLiteralNode = argExprs.length >= 2 ? findFirstNonterminal(argExprs[1], 'literal') : null;
      const widthLiteral = widthLiteralNode ? lowerLiteralValue(widthLiteralNode, null) : null;
      const fillLiteral = fillLiteralNode ? extractStringLiteralValue(fillLiteralNode) : null;
      if (baseLiteral !== null && widthLiteral !== null && /^-?\d+$/.test(String(widthLiteral))) {
        const width = Math.max(0, Math.trunc(Number(widthLiteral)));
        const fillText = fillLiteral !== null ? fillLiteral : ' ';
        loweredCall = JSON.stringify(
          directPropertyName === 'padStart'
            ? baseLiteral.padStart(width, fillText)
            : baseLiteral.padEnd(width, fillText)
        );
      }
    }

    if (!loweredCall && directPropertyName === 'replace' && baseExpressionNode && baseExpressionNode.kind === 'nonterminal' && argExprs.length >= 2) {
      const strBase = lowerExpressionValue(baseExpressionNode, compileContext);
      const patArg = lowerExpressionValue(argExprs[0], compileContext);
      const repArg = lowerExpressionValue(argExprs[1], compileContext);
      if (strBase !== null && patArg !== null && repArg !== null) {
        if (compileContext) compileContext.regexUsed = true;
        loweredCall = `__maiaregex__replace((const char*)(${strBase}), (void*)(${patArg}), (const char*)(${repArg}))`;
      }
    }

    if (!loweredCall && directPropertyName === 'test' && baseExpressionNode && baseExpressionNode.kind === 'nonterminal' && argExprs.length >= 1) {
      const reBase = lowerExpressionValue(baseExpressionNode, compileContext);
      const strArg = lowerExpressionValue(argExprs[0], compileContext);
      if (reBase !== null && strArg !== null) {
        if (compileContext) compileContext.regexUsed = true;
        loweredCall = `__maiaregex__test((void*)(${reBase}), (const char*)(${strArg}))`;
      }
    }

    if (!loweredCall && directPropertyName === 'filter' && !hasDynamicClosureArg) {
      const filteredModel = tryResolveStaticFilterResultModel(node, baseExpressionNode, argExprs, node, compileContext, new Set());
      const loweredFiltered = lowerStaticModelToRuntimeExpression(filteredModel);
      if (loweredFiltered !== null) {
        loweredCall = loweredFiltered;
      }
    }

    if (!loweredCall && compileContext && compileContext.atomicsPlan && compileContext.atomicsPlan.enabled
      && Array.isArray(pathSegments) && pathSegments.length === 2 && pathSegments[0] === 'Atomics') {
      const m = pathSegments[1];
      const a0 = argExprs.length >= 1 ? (lowerExpressionValue(argExprs[0], compileContext) || '0') : '0';
      const a1 = argExprs.length >= 2 ? (lowerExpressionValue(argExprs[1], compileContext) || '0') : '0';
      const a2 = argExprs.length >= 3 ? (lowerExpressionValue(argExprs[2], compileContext) || '0') : '0';
      const a3 = argExprs.length >= 4 ? (lowerExpressionValue(argExprs[3], compileContext) || '0') : '0';
      if (m === 'load') loweredCall = `__maia_atomics_load((void*)(${a0}), (int)(${a1}))`;
      else if (m === 'store') loweredCall = `__maia_atomics_store((void*)(${a0}), (int)(${a1}), (long)(${a2}))`;
      else if (m === 'add') loweredCall = `__maia_atomics_add((void*)(${a0}), (int)(${a1}), (long)(${a2}))`;
      else if (m === 'sub') loweredCall = `__maia_atomics_sub((void*)(${a0}), (int)(${a1}), (long)(${a2}))`;
      else if (m === 'and') loweredCall = `__maia_atomics_and((void*)(${a0}), (int)(${a1}), (long)(${a2}))`;
      else if (m === 'or') loweredCall = `__maia_atomics_or((void*)(${a0}), (int)(${a1}), (long)(${a2}))`;
      else if (m === 'xor') loweredCall = `__maia_atomics_xor((void*)(${a0}), (int)(${a1}), (long)(${a2}))`;
      else if (m === 'exchange') loweredCall = `__maia_atomics_exchange((void*)(${a0}), (int)(${a1}), (long)(${a2}))`;
      else if (m === 'compareExchange') loweredCall = `__maia_atomics_compareExchange((void*)(${a0}), (int)(${a1}), (long)(${a2}), (long)(${a3}))`;
      else if (m === 'isLockFree') loweredCall = `__maia_atomics_isLockFree((int)(${a0}))`;
      else if (m === 'wait') loweredCall = `__maia_atomics_wait((void*)(${a0}), (int)(${a1}), (long)(${a2}), ${argExprs.length >= 4 ? 1 : 0}, (int)(${a3}))`;
      else if (m === 'notify') loweredCall = `__maia_atomics_notify((void*)(${a0}), (int)(${a1}), (int)(${argExprs.length >= 3 ? a2 : '1'}))`;
    }


    if (!loweredCall && compileContext && compileContext.promisePlan && compileContext.promisePlan.enabled) {
      if (Array.isArray(pathSegments) && pathSegments.length === 2 && pathSegments[0] === 'Promise') {
        const m = pathSegments[1];
        if (m === 'resolve' || m === 'reject' || m === 'all' || m === 'race') {
          const arg0 = argExprs.length >= 1 ? lowerExpressionValue(argExprs[0], compileContext) : '0';
          const safeArg0 = arg0 !== null ? arg0 : '0';
          if (m === 'resolve') {
            loweredCall = `__maia_promise_static_resolve((int)(${safeArg0}))`;
          } else if (m === 'reject') {
            loweredCall = `__maia_promise_static_reject((int)(${safeArg0}))`;
          } else if (m === 'all') {
            loweredCall = `__maia_promise_all((void*)(${safeArg0}))`;
          } else {
            loweredCall = `__maia_promise_race((void*)(${safeArg0}))`;
          }
        }
      } else if (Array.isArray(pathSegments) && pathSegments.length === 1 && pathSegments[0] === 'setTimeout') {
        const fnExpr = argExprs.length >= 1 ? lowerExpressionValue(argExprs[0], compileContext) : '0';
        const delayExpr = argExprs.length >= 2 ? lowerExpressionValue(argExprs[1], compileContext) : '0';
        loweredCall = `__maia_set_timeout((void*)(${fnExpr !== null ? fnExpr : '0'}), (int)(${delayExpr !== null ? delayExpr : '0'}))`;
      } else if (baseExpressionNode && (directPropertyName === 'then' || directPropertyName === 'catch' || directPropertyName === 'finally')) {
        const baseExpr = lowerExpressionValue(baseExpressionNode, compileContext);
        const safeBase = baseExpr !== null ? baseExpr : '0';
        const fn1 = argExprs.length >= 1 ? lowerExpressionValue(argExprs[0], compileContext) : '0';
        const safeFn1 = fn1 !== null ? fn1 : '0';
        if (directPropertyName === 'then') {
          const fn2 = argExprs.length >= 2 ? lowerExpressionValue(argExprs[1], compileContext) : '0';
          loweredCall = `__maia_promise_then((void*)(${safeBase}), (void*)(${safeFn1}), (void*)(${fn2 !== null ? fn2 : '0'}))`;
        } else if (directPropertyName === 'catch') {
          loweredCall = `__maia_promise_catch((void*)(${safeBase}), (void*)(${safeFn1}))`;
        } else {
          loweredCall = `__maia_promise_finally((void*)(${safeBase}), (void*)(${safeFn1}))`;
        }
      }
    }

    if (!loweredCall && compileContext && compileContext.iteratorPlan && compileContext.iteratorPlan.enabled && directPropertyName === 'next' && baseExpressionNode) {
      const baseExpr = lowerExpressionValue(baseExpressionNode, compileContext);
      const arg0 = argExprs.length >= 1 ? lowerExpressionValue(argExprs[0], compileContext) : '0';
      loweredCall = `__maia_iter_next((void*)(${baseExpr !== null ? baseExpr : '0'}), (int)(${arg0 !== null ? arg0 : '0'}))`;
    }

    if (!loweredCall && directPropertyName === 'forEach' && baseExpressionNode && argExprs.length >= 1) {
      const baseModel = resolveStaticModelFromExpression(baseExpressionNode, node, compileContext, new Set());
      const prevInForEachCb = compileContext._inStaticForEachCallback;
      compileContext._inStaticForEachCallback = true;
      const callbackSymbol = lowerExpressionValue(argExprs[0], compileContext);
      compileContext._inStaticForEachCallback = prevInForEachCb;
      const callbackNode = resolveCallableNodeFromExpression(argExprs[0], compileContext);
      const callbackParams = extractCallableParameterNames(callbackNode);
      const callbackHasLexicalCapture = Boolean(
        callbackNode
        && (callbackNode.name === 'arrowFunction' || callbackNode.name === 'asyncArrowFunction')
        && collectLambdaCaptureNames(callbackNode, compileContext).length > 0
      );
      const loweredBase = lowerExpressionValue(baseExpressionNode, compileContext);
      if (callbackHasLexicalCapture) {
        const callbackStatements = lowerStaticCapturedForEachCallbacks(
          callbackNode,
          baseModel,
          loweredBase,
          compileContext
        );
        if (callbackStatements !== null) {
          if (!Array.isArray(compileContext._preludeStatements)) {
            compileContext._preludeStatements = [];
          }
          compileContext._preludeStatements.push(...callbackStatements);
          loweredCall = '0';
        }
      }
      if (!loweredCall
        && baseModel
        && baseModel.kind === 'array'
        && Array.isArray(baseModel.values)
        && callbackSymbol
        && callbackSymbol !== 'nullptr'
        && !callbackHasLexicalCapture) {
        const callbackCalls = [];
        for (let index = 0; index < baseModel.values.length; index += 1) {
          const valueExpr = lowerStaticModelToExpression(baseModel.values[index]);
          if (valueExpr === null) {
            callbackCalls.length = 0;
            break;
          }
          const callArgs = [];
          if (callbackParams.length >= 1) {
            callArgs.push(valueExpr);
          }
          if (callbackParams.length >= 2) {
            callArgs.push(String(index));
          }
          if (callbackParams.length >= 3) {
            if (loweredBase === null) {
              callbackCalls.length = 0;
              break;
            }
            callArgs.push(loweredBase);
          }
          while (callArgs.length < callbackParams.length) {
            callArgs.push('0');
          }
          callbackCalls.push(`${callbackSymbol}(${callArgs.join(', ')})`);
        }
        if (callbackCalls.length > 0) {
          if (!Array.isArray(compileContext._preludeStatements)) {
            compileContext._preludeStatements = [];
          }
          for (const callbackCall of callbackCalls) {
            compileContext._preludeStatements.push(`${callbackCall};`);
          }
          loweredCall = '0';
        }
      }
    }

    const DYNAMIC_ARRAY_HOFS = new Set([
      'forEach', 'map', 'filter', 'reduce', 'reduceRight', 'find', 'findIndex', 'some', 'every'
    ]);
    if (!loweredCall && baseExpressionNode && directPropertyName && DYNAMIC_ARRAY_HOFS.has(directPropertyName) && argExprs.length >= 1) {
      const baseHead = Array.isArray(pathSegments) && pathSegments.length > 0 ? pathSegments[0] : null;
      if (!['Promise', 'Object', 'Reflect', 'Math', 'JSON', 'console', 'Atomics'].includes(baseHead)) {
        const arrExpr = lowerExpressionValue(baseExpressionNode, compileContext);
        const cbExpr = lowerExpressionValue(argExprs[0], compileContext);
        if (arrExpr !== null && cbExpr !== null) {
          if (directPropertyName === 'reduce' || directPropertyName === 'reduceRight') {
            if (argExprs.length >= 2) {
              const initExpr = lowerExpressionValue(argExprs[1], compileContext);
              loweredCall = `__maia_array_${directPropertyName}((void*)(${arrExpr}), (void*)(${cbExpr}), 1, (int)(${initExpr !== null ? initExpr : '0'}))`;
            } else {
              loweredCall = `__maia_array_${directPropertyName}((void*)(${arrExpr}), (void*)(${cbExpr}), 0, 0)`;
            }
          } else {
            loweredCall = `__maia_array_${directPropertyName}((void*)(${arrExpr}), (void*)(${cbExpr}))`;
          }
        }
      }
    }

    if (!loweredCall && (!pathSegments || pathSegments.length === 0) && baseExpressionNode && directPropertyName) {
      // Only emit base.method(args) when the method is NOT a JS-runtime-only method.
      // JS-runtime methods (Promise.then, Array.filter, etc.) have no C++98 equivalent
      // on void* / primitive types and would produce invalid C++98 if emitted verbatim.
      if (!JS_RUNTIME_METHODS.has(directPropertyName)) {
        const loweredBase = lowerExpressionValue(baseExpressionNode, compileContext);
        if (loweredBase !== null) {
          loweredCall = `${loweredBase}.${directPropertyName}(${args})`;
        } else {
          reportUnsupportedLowering(
            compileContext,
            'method-call-base-unlowerable',
            `member call base expression could not be lowered for '${directPropertyName}'`
          );
          if (compileContext && compileContext.strictLowering) {
            err(`unsupported lowering: member call base '${directPropertyName}'`);
          }
        }
      } else if (baseExpressionNode && directPropertyName !== 'then' && directPropertyName !== 'catch' && directPropertyName !== 'finally') {
        const loweredBase = lowerExpressionValue(baseExpressionNode, compileContext);
        if (loweredBase !== null) {
          const loweredArgs = argExprs.map((e) => `(long)(${lowerExpressionValue(e, compileContext) || '0'})`);
          if (compileContext) {
            if (!compileContext.chainedJsRuntimeMethodsUsed) compileContext.chainedJsRuntimeMethodsUsed = new Map();
            const prevArity = compileContext.chainedJsRuntimeMethodsUsed.get(directPropertyName) || 0;
            if (loweredArgs.length > prevArity) compileContext.chainedJsRuntimeMethodsUsed.set(directPropertyName, loweredArgs.length);
          }
          const argTail = loweredArgs.length > 0 ? `, ${loweredArgs.join(', ')}` : '';
          loweredCall = `__maia_js_${directPropertyName}((void*)(${loweredBase})${argTail})`;
        } else {
          reportUnsupportedLowering(
            compileContext,
            'js-runtime-method-call',
            `dropping JS runtime member call '${directPropertyName}' on non-host base expression`
          );
          droppedJsRuntimeMethodCall = true;
        }
      } else {
        reportUnsupportedLowering(
          compileContext,
          'js-runtime-method-call',
          `dropping JS runtime member call '${directPropertyName}' on non-host base expression`
        );
        droppedJsRuntimeMethodCall = true;
      }
    }

    const buildClosureCall = (calleeExpr) => {
      const castArgs = argExprs.map((argExpr) => {
        const loweredArg = lowerExpressionValue(argExpr, compileContext);
        return `(int)(${loweredArg !== null ? loweredArg : '0'})`;
      });
      const allArgs = [`(void*)(${calleeExpr})`, ...castArgs];
      return `__maia_closure_call_i32_${argExprs.length}(${allArgs.join(', ')})`;
    };

    if (!loweredCall
      && !droppedJsRuntimeMethodCall
      && compileContext
      && compileContext.hasLambdaCapturePayload
      && lambdaBindingState
      && lambdaBindingState.isCaptureAware
      && Array.isArray(pathSegments)
      && pathSegments.length > 0) {
      const calleeExpr = lowerIdentifierValue(pathSegments[0], compileContext);
      if (calleeExpr) {
        if (lambdaBindingState.isAsync || lambdaBindingState.fromAssignment) {
          loweredCall = `__maia_runtime_lambda_invoke_function_id((void*)${calleeExpr}, ${argExprs.length}, ${lambdaBindingState.isAsync ? 1 : 0})`;
        } else {
          loweredCall = buildClosureCall(calleeExpr);
        }
      }
    }

    if (!loweredCall && droppedJsRuntimeMethodCall) {
      return null;
    }

    if (!loweredCall) {
      if (!compileContext || !compileContext.hostRegistry || typeof compileContext.hostRegistry.resolvePath !== 'function') {
        reportUnsupportedLowering(
          compileContext,
          'call-expression-unlowerable',
          'call expression cannot resolve host symbol because compileContext hostRegistry is unavailable'
        );
        if (compileContext && compileContext.strictLowering) {
          err('unsupported lowering: call expression host registry unavailable');
        }
        return null;
      }

      const singleCalleeName = Array.isArray(pathSegments) && pathSegments.length === 1
        ? pathSegments[0]
        : null;
      const isKnownClosureVarCallee = Boolean(
        singleCalleeName
        && !(compileContext.localFunctionNames && compileContext.localFunctionNames.has(singleCalleeName))
        && (
          (compileContext.localVariables && compileContext.localVariables.has(singleCalleeName))
          || (compileContext.topLevelBindingNames && compileContext.topLevelBindingNames.has(singleCalleeName))
          || (compileContext.inlineIdentifierExpressions && compileContext.inlineIdentifierExpressions.has(singleCalleeName))
          || (compileContext.activeBoxedVars && compileContext.activeBoxedVars.has(singleCalleeName))
        )
      );
      const hostSymbol = isKnownClosureVarCallee
        ? null
        : compileContext.hostRegistry.resolvePath(pathSegments);
      if (!hostSymbol) {
        const isSimpleIdentifier = Array.isArray(pathSegments)
          && pathSegments.length === 1
          && !compileContext.localFunctionNames.has(pathSegments[0]);
        if (isSimpleIdentifier) {
          const calleeExpr = lowerIdentifierValue(pathSegments[0], compileContext);
          if (calleeExpr) {
            loweredCall = buildClosureCall(calleeExpr);
          }
        } else if (!pathSegments || pathSegments.length === 0) {
          const calleeExpr = lowerExpressionValue(memberExprNode, compileContext);
          if (calleeExpr && calleeExpr !== 'nullptr') {
            loweredCall = buildClosureCall(calleeExpr);
          }
        }
      }
      if (!loweredCall && !hostSymbol) {
        const pathLabel = Array.isArray(pathSegments) && pathSegments.length > 0
          ? pathSegments.join('.')
          : '<unknown-call-path>';
        reportUnsupportedLowering(
          compileContext,
          'unresolved-host-call',
          `host call path not resolved: ${pathLabel}`
        );
        if (compileContext && compileContext.strictLowering) {
          err(`unsupported lowering: unresolved host call '${pathLabel}'`);
        }
        return null;
      }
      if (!loweredCall && hostSymbol === '__console__log') {
        const safeArg = lowerConsoleLogCallArguments(argExprs, compileContext);
        if (safeArg === null) {
          reportUnsupportedLowering(
            compileContext,
            'console-log-arguments-unlowerable',
            'console.log arguments could not be converted to the C++ string ABI'
          );
          return null;
        }
        loweredCall = `${hostSymbol}(${safeArg})`;
        return loweredCall;
      }
      if (!loweredCall) {
        if (hostCallNeedsReceiverArg(hostSymbol, directPropertyName, baseExpressionNode)) {
          const loweredBase = lowerExpressionValue(baseExpressionNode, compileContext);
          if (loweredBase === null) {
            reportUnsupportedLowering(
              compileContext,
              'method-call-base-unlowerable',
              `host receiver base expression could not be lowered for '${directPropertyName}'`
            );
            if (compileContext && compileContext.strictLowering) {
              err(`unsupported lowering: host receiver base '${directPropertyName}'`);
            }
            return null;
          }
          loweredCall = `${hostSymbol}(${[loweredBase, args].filter((piece) => piece && piece.trim()).join(', ')})`;
        } else {
          loweredCall = `${hostSymbol}(${args})`;
        }
      }
    }

    // Preserve call chains after the first invocation, e.g. a().b().c().
    // JS-runtime methods (Promise.then, Array.filter, etc.) have no C++98 equivalent
    // and must not be emitted as chained member calls. When encountered, truncate the
    // chain at that point — the statement retains the side-effects of the base call.
    const firstArgsIndex = children.indexOf(argsNode);
    let chainTruncated = false;
    for (let i = firstArgsIndex + 1; i < children.length; i += 1) {
      if (chainTruncated) { break; }
      const child = children[i];
      if (!child) {
        continue;
      }

      if (child.kind === 'terminal' && child.value === '.') {
        let propertyNode = children[i + 1] || null;
        if (propertyNode && (propertyNode.kind !== 'nonterminal' || propertyNode.name !== 'propertyIdentifierName')) {
          const fallbackPropertyNode = findFirstNonterminal(propertyNode, 'propertyIdentifierName');
          if (fallbackPropertyNode) {
            propertyNode = fallbackPropertyNode;
          }
        }
        if (!propertyNode || propertyNode.kind !== 'nonterminal' || propertyNode.name !== 'propertyIdentifierName') {
          reportUnsupportedLowering(
            compileContext,
            'call-chain-unlowerable',
            'call chain member access is missing propertyIdentifierName after dot'
          );
          if (compileContext && compileContext.strictLowering) {
            err('unsupported lowering: call chain property after dot');
          }
          chainTruncated = true;
          continue;
        }

        const propertyName = findFirstIdentifierValue(propertyNode);
        if (!propertyName) {
          reportUnsupportedLowering(
            compileContext,
            'call-chain-unlowerable',
            'call chain property name could not be resolved'
          );
          if (compileContext && compileContext.strictLowering) {
            err('unsupported lowering: call chain property name');
          }
          chainTruncated = true;
          i += 1;
          continue;
        }

        const nextChainChild = children[i + 2] || null;
        const propertyFollowedByArgs = Boolean(
          nextChainChild
          && nextChainChild.kind === 'nonterminal'
          && nextChainChild.name === 'arguments'
        );

        if (propertyName === 'message' && !propertyFollowedByArgs) {
          i += 1;
          continue;
        }

        if (propertyName === 'length' && !propertyFollowedByArgs) {
          loweredCall = `__maia_runtime_value_length((void*)(${loweredCall}))`;
          i += 1;
          continue;
        }

        if (!propertyFollowedByArgs) {
          const flattenedWeakMapReadMatch = loweredCall.match(/^__maia_runtime_value_get_property\(\(void\*\)\((.+)\), \(void\*\)"(__maia_weakmap_[A-Za-z0-9_]+)"\)$/);
          if (flattenedWeakMapReadMatch) {
            const receiverExpr = flattenedWeakMapReadMatch[1];
            const hiddenKey = flattenedWeakMapReadMatch[2];
            loweredCall = `__maia_runtime_value_get_property((void*)(${receiverExpr}), (void*)${JSON.stringify(`${hiddenKey}__${propertyName}`)})`;
            i += 1;
            continue;
          }
          loweredCall = `__maia_runtime_value_get_property((void*)(${loweredCall}), (void*)"${propertyName}")`;
          i += 1;
          continue;
        }

        if (compileContext && compileContext.promisePlan && compileContext.promisePlan.enabled
          && (propertyName === 'then' || propertyName === 'catch' || propertyName === 'finally')) {
          const nextArgsNode = nextChainChild;
          const chainArgList = nextArgsNode ? ((nextArgsNode.children || []).find((c) => c && c.kind === 'nonterminal' && c.name === 'argumentList') || null) : null;
          const chainArgExprs = chainArgList ? collectArgumentExpressions(chainArgList) : [];
          const fn1 = chainArgExprs.length >= 1 ? lowerExpressionValue(chainArgExprs[0], compileContext) : '0';
          const safeFn1 = fn1 !== null ? fn1 : '0';
          const tmpIdx = (compileContext._promiseChainTmpCount || 0) + 1;
          compileContext._promiseChainTmpCount = tmpIdx;
          const tmpVar = `__maia_p_chain_${tmpIdx}`;
          let callExpr;
          if (propertyName === 'then') {
            const fn2 = chainArgExprs.length >= 2 ? lowerExpressionValue(chainArgExprs[1], compileContext) : '0';
            callExpr = `__maia_promise_then((void*)(${loweredCall}), (void*)(${safeFn1}), (void*)(${fn2 !== null ? fn2 : '0'}))`;
          } else if (propertyName === 'catch') {
            callExpr = `__maia_promise_catch((void*)(${loweredCall}), (void*)(${safeFn1}))`;
          } else {
            callExpr = `__maia_promise_finally((void*)(${loweredCall}), (void*)(${safeFn1}))`;
          }
          if (!Array.isArray(compileContext._preludeStatements)) {
            compileContext._preludeStatements = [];
          }
          compileContext._preludeStatements.push(`void* ${tmpVar} = ${callExpr};`);
          loweredCall = tmpVar;
          i += 2;
          continue;
        }

        if (propertyName === 'match' && nextChainChild && nextChainChild.kind === 'nonterminal' && nextChainChild.name === 'arguments') {
          const chainArgList = (nextChainChild.children || []).find((c) => c && c.kind === 'nonterminal' && c.name === 'argumentList') || null;
          const chainArgExprs = chainArgList ? collectArgumentExpressions(chainArgList) : [];
          if (chainArgExprs.length >= 1) {
            const patArg = lowerExpressionValue(chainArgExprs[0], compileContext) || '0';
            if (compileContext) compileContext.regexUsed = true;
            const tmpIdx = ((compileContext && compileContext._strChainTmpCount) || 0) + 1;
            if (compileContext) compileContext._strChainTmpCount = tmpIdx;
            const tmpVar = `__maia_match_chain_${tmpIdx}`;
            if (compileContext) {
              if (!Array.isArray(compileContext._preludeStatements)) compileContext._preludeStatements = [];
              compileContext._preludeStatements.push(`void* ${tmpVar} = __maiaregex__match((const char*)(${loweredCall}), (void*)(${patArg}));`);
              loweredCall = tmpVar;
            } else {
              loweredCall = `__maiaregex__match((const char*)(${loweredCall}), (void*)(${patArg}))`;
            }
            i += 2;
            continue;
          }
        }

        if ((propertyName === 'substring' || propertyName === 'slice') && nextChainChild && nextChainChild.kind === 'nonterminal' && nextChainChild.name === 'arguments') {
          const chainArgList = (nextChainChild.children || []).find((c) => c && c.kind === 'nonterminal' && c.name === 'argumentList') || null;
          const chainArgExprs = chainArgList ? collectArgumentExpressions(chainArgList) : [];
          const a0 = chainArgExprs.length >= 1 ? (lowerExpressionValue(chainArgExprs[0], compileContext) || '0') : '0';
          const a1 = chainArgExprs.length >= 2 ? (lowerExpressionValue(chainArgExprs[1], compileContext) || '-1') : '-1';
          const hasEnd = chainArgExprs.length >= 2 ? 1 : 0;
          if (compileContext) compileContext.strSliceUsed = true;
          const tmpIdx = ((compileContext && compileContext._strChainTmpCount) || 0) + 1;
          if (compileContext) compileContext._strChainTmpCount = tmpIdx;
          const tmpVar = `__maia_str_chain_${tmpIdx}`;
          if (compileContext) {
            if (!Array.isArray(compileContext._preludeStatements)) compileContext._preludeStatements = [];
            compileContext._preludeStatements.push(`const char* ${tmpVar} = __maia_str_slice((const char*)(${loweredCall}), (int)(${a0}), (int)(${hasEnd}), (int)(${a1}));`);
            loweredCall = tmpVar;
          } else {
            loweredCall = `__maia_str_slice((const char*)(${loweredCall}), (int)(${a0}), (int)(${hasEnd}), (int)(${a1}))`;
          }
          i += 2;
          continue;
        }

        if (propertyName === 'join' && nextChainChild && nextChainChild.kind === 'nonterminal' && nextChainChild.name === 'arguments') {
          const chainArgList = (nextChainChild.children || []).find((c) => c && c.kind === 'nonterminal' && c.name === 'argumentList') || null;
          const chainArgExprs = chainArgList ? collectArgumentExpressions(chainArgList) : [];
          const sepArg = chainArgExprs.length >= 1 ? (lowerExpressionValue(chainArgExprs[0], compileContext) || '","') : '","';
          if (compileContext) {
            compileContext.runtimeFallbackHelpersUsed = true;
            compileContext.consoleConcatHelperUsed = true;
            compileContext.arrayJoinUsed = true;
          }
          const tmpIdx = ((compileContext && compileContext._strChainTmpCount) || 0) + 1;
          if (compileContext) compileContext._strChainTmpCount = tmpIdx;
          const tmpVar = `__maia_str_chain_${tmpIdx}`;
          if (compileContext) {
            if (!Array.isArray(compileContext._preludeStatements)) compileContext._preludeStatements = [];
            compileContext._preludeStatements.push(`const char* ${tmpVar} = __maia_array_join((void*)(${loweredCall}), (const char*)(${sepArg}));`);
            loweredCall = tmpVar;
          } else {
            loweredCall = `__maia_array_join((void*)(${loweredCall}), (const char*)(${sepArg}))`;
          }
          i += 2;
          continue;
        }

        if (propertyName === 'replace' && nextChainChild && nextChainChild.kind === 'nonterminal' && nextChainChild.name === 'arguments') {
          const chainArgList = (nextChainChild.children || []).find((c) => c && c.kind === 'nonterminal' && c.name === 'argumentList') || null;
          const chainArgExprs = chainArgList ? collectArgumentExpressions(chainArgList) : [];
          if (chainArgExprs.length >= 2) {
            const patArg = lowerExpressionValue(chainArgExprs[0], compileContext) || '0';
            const repArg = lowerExpressionValue(chainArgExprs[1], compileContext) || '""';
            if (compileContext) compileContext.regexUsed = true;
            const tmpIdx = ((compileContext && compileContext._strChainTmpCount) || 0) + 1;
            if (compileContext) compileContext._strChainTmpCount = tmpIdx;
            const tmpVar = `__maia_str_chain_${tmpIdx}`;
            if (compileContext) {
              if (!Array.isArray(compileContext._preludeStatements)) compileContext._preludeStatements = [];
              compileContext._preludeStatements.push(`const char* ${tmpVar} = __maiaregex__replace((const char*)(${loweredCall}), (void*)(${patArg}), (const char*)(${repArg}));`);
              loweredCall = tmpVar;
            } else {
              loweredCall = `__maiaregex__replace((const char*)(${loweredCall}), (void*)(${patArg}), (const char*)(${repArg}))`;
            }
            i += 2;
            continue;
          }
        }

        if ((propertyName === 'map' || propertyName === 'filter' || propertyName === 'find' || propertyName === 'some' || propertyName === 'every' || propertyName === 'forEach' || propertyName === 'findIndex' || propertyName === 'reduce' || propertyName === 'reduceRight') && nextChainChild && nextChainChild.kind === 'nonterminal' && nextChainChild.name === 'arguments') {
          const chainArgList = (nextChainChild.children || []).find((c) => c && c.kind === 'nonterminal' && c.name === 'argumentList') || null;
          const chainArgExprs = chainArgList ? collectArgumentExpressions(chainArgList) : [];
          if (chainArgExprs.length >= 1) {
            const cbExpr = lowerExpressionValue(chainArgExprs[0], compileContext) || '0';
            if (compileContext) {
              compileContext.runtimeFallbackHelpersUsed = true;
              compileContext.arrayCallbackHelpersUsed = true;
            }
            if (propertyName === 'reduce' || propertyName === 'reduceRight') {
              const hasInit = chainArgExprs.length >= 2 ? 1 : 0;
              const initExpr = hasInit ? (lowerExpressionValue(chainArgExprs[1], compileContext) || '0') : '0';
              loweredCall = `__maia_array_${propertyName}((void*)(${loweredCall}), (void*)(${cbExpr}), ${hasInit}, (int)(${initExpr}))`;
            } else {
              loweredCall = `__maia_array_${propertyName}((void*)(${loweredCall}), (void*)(${cbExpr}))`;
            }
            i += 2;
            continue;
          }
        }

        if (JS_RUNTIME_METHODS.has(propertyName) && propertyName !== 'then' && propertyName !== 'catch' && propertyName !== 'finally' && nextChainChild && nextChainChild.kind === 'nonterminal' && nextChainChild.name === 'arguments') {
          const chainArgList = (nextChainChild.children || []).find((c) => c && c.kind === 'nonterminal' && c.name === 'argumentList') || null;
          const chainArgExprs = chainArgList ? collectArgumentExpressions(chainArgList) : [];
          const loweredArgs = chainArgExprs.map((e) => `(long)(${lowerExpressionValue(e, compileContext) || '0'})`);
          if (compileContext) {
            if (!compileContext.chainedJsRuntimeMethodsUsed) compileContext.chainedJsRuntimeMethodsUsed = new Map();
            const prevArity = compileContext.chainedJsRuntimeMethodsUsed.get(propertyName) || 0;
            if (loweredArgs.length > prevArity) compileContext.chainedJsRuntimeMethodsUsed.set(propertyName, loweredArgs.length);
          }
          const argTail = loweredArgs.length > 0 ? `, ${loweredArgs.join(', ')}` : '';
          loweredCall = `__maia_js_${propertyName}((void*)(${loweredCall})${argTail})`;
          i += 2;
          continue;
        }

        if (JS_RUNTIME_METHODS.has(propertyName)) {
          // Truncate: this is a JS-only method; drop the rest of the chain.
          reportUnsupportedLowering(
            compileContext,
            'js-runtime-chain-truncated',
            `truncating call chain at unsupported JS runtime method '${propertyName}'`
          );
          chainTruncated = true;
        } else {
          loweredCall = `${loweredCall}.${propertyName}`;
        }
        i += 1;
        continue;
      }

      if (!chainTruncated && child.kind === 'nonterminal' && child.name === 'arguments') {
        let chainedArgList = (child.children || []).find((c) => c && c.kind === 'nonterminal' && c.name === 'argumentList') || null;
        if (!chainedArgList) {
          chainedArgList = findFirstNonterminal(child, 'argumentList');
        }
        const chainedArgExprs = chainedArgList ? collectArgumentExpressions(chainedArgList) : [];
        const castArgs = chainedArgExprs.map((argExpr) => {
          const lowered = lowerExpressionValue(argExpr, compileContext);
          return `(int)(${lowered !== null ? lowered : '0'})`;
        });
        const allArgs = [`(void*)(${loweredCall})`, ...castArgs];
        loweredCall = `__maia_closure_call_i32_${chainedArgExprs.length}(${allArgs.join(', ')})`;
        continue;
      }

      if (!chainTruncated && child.kind === 'terminal' && child.token === 'TOKEN__5B_') {
        const idxExprNode = children[i + 1] && children[i + 1].kind === 'nonterminal' ? children[i + 1] : null;
        const closeBracket = children[i + 2];
        if (idxExprNode && closeBracket && closeBracket.kind === 'terminal' && closeBracket.token === 'TOKEN__5D_') {
          const keyModel = compileContext ? resolveStaticModelFromExpression(idxExprNode, idxExprNode, compileContext) : null;
          const loweredIdx = lowerExpressionValue(idxExprNode, compileContext) || '0';
          if (compileContext) compileContext.runtimeFallbackHelpersUsed = true;
          if (keyModel && keyModel.kind === 'string') {
            loweredCall = `__maia_runtime_value_get_property((void*)(${loweredCall}), (void*)${staticStringLiteralCpp(keyModel.value)})`;
          } else {
            loweredCall = `__maia_runtime_value_get_index((void*)(${loweredCall}), (int)(${loweredIdx}))`;
          }
          i += 2;
          continue;
        }
      }

      reportUnsupportedLowering(
        compileContext,
        'call-chain-unlowerable',
        'call chain contains unsupported node after first invocation'
      );
      if (compileContext && compileContext.strictLowering) {
        err('unsupported lowering: call chain node');
      }
      chainTruncated = true;
    }

    return loweredCall;
  }


  return {
    isSideEffectFreeInlineArgument,
    isUnshadowedUndefinedExpression,
    lowerImmediateCapturedArrowCall,
    isDirectExpressionStatementCall,
    lowerImmediateCapturedArrowBlockCall,
    lowerStaticCapturedForEachCallbacks,
    lowerCallExpressionValue
  };
}

module.exports = { createCallLowering };
