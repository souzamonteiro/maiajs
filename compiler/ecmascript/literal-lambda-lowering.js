'use strict';

const closures = require('./closures');
const iterators = require('./iterators');
const atomics = require('./atomics');
const {
  walk,
  findFirstIdentifierValue,
  findNodePath,
  nodeContainsTarget,
  findFirstTerminalByToken,
  findFirstNonterminal
} = require('./ast-utils');

function createLiteralLambdaLowering(deps) {
  const {
    collectArgumentExpressions,
    collectBindingNamesFromStatement,
    err,
    extractFormalParameterNamesFromNode,
    extractPathFromMemberExpression,
    extractStatementsFromScopeContainer,
    extractStringLiteralValue,
    findBoundVariableInitializerExpressionAtNode,
    findEnclosingCallableNode,
    getCallExpressionTrailingPropertyNames,
    getClassInitWrapperName,
    inferConstObjectLiteralPropertyTypeAtNode,
    inferExprType,
    isDynamicHandleMethodPropertyCall,
    lowerArgumentsNode,
    lowerExpressionValue,
    lowerIdentifierValue,
    lowerStaticModelToRuntimeExpression,
    reportUnsupportedLowering,
    resolveFlatStaticPrimitiveModel,
    resolveStaticModelFromExpression,
    staticModelToJsString,
    staticStringLiteralCpp,
    tryLowerDynamicHandleMethodCall,
    unwrapDirectIdentifierExpression,
    unwrapExpressionNode
  } = deps;

  function collectConsoleConcatExpressionPieces(node, out, compileContext) {
    if (!node || node.kind !== 'nonterminal') {
      return false;
    }

    const unwrapped = unwrapExpressionNode(node);
    if (!unwrapped || unwrapped.kind !== 'nonterminal') {
      return false;
    }

    if (unwrapped.name === 'additiveExpression') {
      if (inferExprType(unwrapped, compileContext) !== 'string') {
        out.push(unwrapped);
        return true;
      }
      let sawPlus = false;
      for (const child of (unwrapped.children || [])) {
        if (!child) {
          continue;
        }
        if (child.kind === 'terminal') {
          const operator = String(child.value || '').trim();
          if (!operator) {
            continue;
          }
          if (operator !== '+') {
            return false;
          }
          sawPlus = true;
          continue;
        }
        if (child.kind === 'nonterminal' && !collectConsoleConcatExpressionPieces(child, out, compileContext)) {
          return false;
        }
      }
      return sawPlus && out.length > 0;
    }

    out.push(unwrapped);
    return true;
  }

  function lowerConsoleConcatPieceAsCString(pieceNode, compileContext) {
    if (compileContext && pieceNode && typeof pieceNode === 'object') {
      if (!(compileContext._consoleConcatPieceCache instanceof WeakMap)) {
        compileContext._consoleConcatPieceCache = new WeakMap();
      }
      const cachedPiece = compileContext._consoleConcatPieceCache.get(pieceNode);
      const pieceIdent = findFirstIdentifierValue(pieceNode);
      const hasLocalOverride = Boolean(pieceIdent && compileContext.localVariables && compileContext.localVariables.has(pieceIdent));
      if (cachedPiece !== undefined && !hasLocalOverride) {
        return cachedPiece;
      }
    }

    const stripSimpleCasts = (expr) => {
      let current = String(expr || '').trim();
      let changed = true;
      while (changed) {
        changed = false;
        const castMatch = current.match(/^\((?:const\s+char\s*\*|char\s*\*|void\s*\*|double|int)\)\((.*)\)$/);
        if (castMatch) {
          current = castMatch[1].trim();
          changed = true;
        }
      }
      return current;
    };

    const literalText = extractStringLiteralValue(pieceNode);
    if (literalText !== null) {
      return staticStringLiteralCpp(literalText);
    }

    const dynamicMethodCall = tryLowerDynamicHandleMethodCall(pieceNode, compileContext);
    if (dynamicMethodCall !== null) {
      return `__maia_console_to_cstr_string(__async_handle_get_string(${dynamicMethodCall}))`;
    }

    const staticCallNode = pieceNode && pieceNode.kind === 'nonterminal'
      ? (pieceNode.name === 'callExpression' ? pieceNode : findFirstNonterminal(pieceNode, 'callExpression'))
      : null;
    const staticPieceModel = compileContext
      && pieceNode
      && pieceNode.kind === 'nonterminal'
      ? resolveStaticModelFromExpression(staticCallNode || pieceNode, staticCallNode || pieceNode, compileContext)
      : null;
    const staticPieceJsString = staticModelToJsString(staticPieceModel);
    if (staticPieceJsString !== null) {
      const loweredPiece = `__maia_console_to_cstr_string((const char*)(${JSON.stringify(staticPieceJsString)}))`;
      if (compileContext && pieceNode && typeof pieceNode === 'object') {
        compileContext._consoleConcatPieceCache.set(pieceNode, loweredPiece);
      }
      return loweredPiece;
    }
    const staticPieceExpr = staticPieceModel
      ? lowerStaticModelToRuntimeExpression(staticPieceModel)
      : null;
    const lowered = staticPieceExpr !== null
      ? staticPieceExpr
      : (pieceNode && pieceNode.kind === 'nonterminal' && pieceNode.name === 'literal'
        ? lowerLiteralValue(pieceNode, compileContext)
        : lowerExpressionValue(pieceNode, compileContext));
    if (lowered === null) {
      return null;
    }

    let pieceType = inferExprType(pieceNode, compileContext);
    if (compileContext && compileContext.localVariables && /^[A-Za-z_][A-Za-z0-9_]*$/.test(String(lowered || '').trim())) {
      const localCppType = compileContext.localVariables.get(String(lowered).trim());
      if (localCppType === 'const char*') pieceType = 'string';
      else if (localCppType === 'void*' || localCppType === 'const void*') pieceType = 'object';
    }
    if (staticPieceModel) {
      if (staticPieceModel.kind === 'string') {
        pieceType = 'string';
      } else if (staticPieceModel.kind === 'number') {
        pieceType = 'number';
      } else if (staticPieceModel.kind === 'bool') {
        pieceType = 'bool';
      }
    }
    const pieceMemberExpr = pieceNode && pieceNode.kind === 'nonterminal'
      ? (pieceNode.name === 'memberExpression' ? pieceNode : findFirstNonterminal(pieceNode, 'memberExpression'))
      : null;
    if (pieceType !== 'string' && pieceMemberExpr) {
      const memberChildren = pieceMemberExpr.children || [];
      const directPropertyIndex = memberChildren.findIndex((child) => child && child.kind === 'terminal' && child.value === '.');
      const directPropertyNode = directPropertyIndex >= 0 ? memberChildren[directPropertyIndex + 1] : null;
      const directPropertyName = directPropertyNode ? findFirstIdentifierValue(directPropertyNode) : null;
      const baseExpressionNode = directPropertyIndex > 0 ? memberChildren[0] : null;
      if (directPropertyName === 'message') {
        pieceType = 'string';
      } else if (directPropertyName === 'enumerable'
        && /__maia_runtime_value_get_property\(/.test(lowered)) {
        pieceType = 'bool';
      } else if (baseExpressionNode && compileContext && compileContext.objectLiteralPropertyTypesByFunctionNode) {
        const baseIsThis = Boolean(findFirstTerminalByToken(baseExpressionNode, 'TOKEN_this'));
        if (baseIsThis) {
          const enclosingCallableNode = findEnclosingCallableNode(pieceNode, compileContext);
          const propertyTypes = enclosingCallableNode
            ? compileContext.objectLiteralPropertyTypesByFunctionNode.get(enclosingCallableNode)
            : null;
          const propertyType = propertyTypes ? propertyTypes.get(directPropertyName) : null;
          if (propertyType === 'string') {
            pieceType = 'string';
          }
        }
      }
      if (baseExpressionNode && directPropertyName && compileContext) {
        const propertyType = inferConstObjectLiteralPropertyTypeAtNode(
          findFirstIdentifierValue(baseExpressionNode),
          directPropertyName,
          pieceNode,
          compileContext
        );
        if (propertyType === 'string' || propertyType === 'number' || propertyType === 'bool') {
          pieceType = propertyType;
        }
      }
    }
    const unwrappedLowered = stripSimpleCasts(lowered);
    if ((pieceType === 'any' || pieceType === 'object')
      && /__maia_runtime_value_get_property\(\(void\*\)\((?:__maia_runtime_value_get_property\([^\n]+|[A-Za-z_][A-Za-z0-9_]*)\), \(void\*\)"enumerable"\)/.test(unwrappedLowered)) {
      pieceType = 'bool';
    }
    if (pieceType === 'any' && /^"(?:[^"\\]|\\.)*"$/.test(unwrappedLowered)) {
      pieceType = 'string';
    } else if ((pieceType === 'any' || pieceType === 'object') && /^-?\d+(?:\.\d+)?$/.test(unwrappedLowered)) {
      pieceType = 'number';
    } else if ((pieceType === 'any' || pieceType === 'object') && /^(?:true|false)$/.test(unwrappedLowered)) {
      pieceType = 'bool';
    } else if (pieceType === 'any' || pieceType === 'object') {
      if (!/"(?:[^"\\]|\\.)*"/.test(unwrappedLowered)
        && /(==|!=|<=|>=|<|>|\&\&|\|\|)/.test(unwrappedLowered)) {
        pieceType = 'bool';
      } else if (!/"(?:[^"\\]|\\.)*"/.test(unwrappedLowered)
        && /(?:^|[^A-Za-z0-9_])(?:[A-Za-z_][A-Za-z0-9_]*|-?\d+(?:\.\d+)?)(?:\s*[-+*\/%]\s*)/.test(unwrappedLowered)) {
        pieceType = 'number';
      }
    }
    const canHoistConsolePiece = compileContext
      && Array.isArray(compileContext._preludeStatements)
      && !/^"(?:[^"\\]|\\.)*"$/.test(lowered)
      && !/^(?:-?\d+(?:\.\d+)?|true|false|nullptr|[A-Za-z_][A-Za-z0-9_]*)$/.test(lowered);

    const hoistConsolePiece = (cppType, expr) => {
      if (!canHoistConsolePiece) {
        return expr;
      }
      if (compileContext._consoleValueTempCount === undefined) {
        compileContext._consoleValueTempCount = 0;
      }
      const tempName = `__maia_console_value_tmp${compileContext._consoleValueTempCount++}`;
      compileContext._preludeStatements.push(`${cppType} ${tempName} = ${expr};`);
      return tempName;
    };

    if (/^__(?:maia_set_has|maia_map_has)\(/.test(String(lowered || '').trim())) {
      pieceType = 'bool';
    }
    if (pieceType === 'string') {
      const safeExpr = hoistConsolePiece('const char*', `(const char*)(${lowered})`);
      const loweredPiece = `__maia_console_to_cstr_string(${safeExpr})`;
      if (compileContext && pieceNode && typeof pieceNode === 'object') {
        compileContext._consoleConcatPieceCache.set(pieceNode, loweredPiece);
      }
      return loweredPiece;
    }
    if (pieceType === 'bool') {
      if (staticPieceModel && staticPieceModel.kind === 'bool') {
        const loweredPiece = `__maia_console_to_cstr_string((const char*)(${JSON.stringify(staticPieceModel.value ? 'true' : 'false')}))`;
        if (compileContext && pieceNode && typeof pieceNode === 'object') {
          compileContext._consoleConcatPieceCache.set(pieceNode, loweredPiece);
        }
        return loweredPiece;
      }
      const safeExpr = hoistConsolePiece('int', `(int)(${lowered})`);
      const loweredPiece = `__maia_console_to_cstr_bool((int)(${safeExpr}))`;
      if (compileContext && pieceNode && typeof pieceNode === 'object') {
        compileContext._consoleConcatPieceCache.set(pieceNode, loweredPiece);
      }
      return loweredPiece;
    }
    if (pieceType === 'number') {
      const safeExpr = hoistConsolePiece('double', `(double)(${lowered})`);
      const loweredPiece = `__maia_console_to_cstr_number((double)(${safeExpr}))`;
      if (compileContext && pieceNode && typeof pieceNode === 'object') {
        compileContext._consoleConcatPieceCache.set(pieceNode, loweredPiece);
      }
      return loweredPiece;
    }
    const safeExpr = hoistConsolePiece('void*', `(void*)(${lowered})`);
    const loweredPiece = `__maia_console_to_cstr_ptr((void*)(${safeExpr}))`;
    if (compileContext && pieceNode && typeof pieceNode === 'object') {
      compileContext._consoleConcatPieceCache.set(pieceNode, loweredPiece);
    }
    return loweredPiece;
  }

  function tryLowerConsoleLogConcatExpression(expressionNode, compileContext) {
    if (compileContext && expressionNode && typeof expressionNode === 'object') {
      if (!(compileContext._consoleConcatExprCache instanceof WeakMap)) {
        compileContext._consoleConcatExprCache = new WeakMap();
      }
      const cachedExpr = compileContext._consoleConcatExprCache.get(expressionNode);
      if (cachedExpr !== undefined) {
        return cachedExpr;
      }
    }

    const pieces = [];
    if (!collectConsoleConcatExpressionPieces(expressionNode, pieces, compileContext) || pieces.length < 2) {
      return null;
    }

    const hasStringLikePiece = pieces.some((pieceNode) => {
      const literalText = extractStringLiteralValue(pieceNode);
      return literalText !== null || inferExprType(pieceNode, compileContext) === 'string';
    });
    if (!hasStringLikePiece) {
      return null;
    }

    if (compileContext && !Array.isArray(compileContext._preludeStatements)) {
      compileContext._preludeStatements = [];
    }
    if (compileContext && compileContext._consoleConcatTempCount === undefined) {
      compileContext._consoleConcatTempCount = 0;
    }

    let currentExpr = lowerConsoleConcatPieceAsCString(pieces[0], compileContext);
    if (currentExpr === null) {
      return null;
    }

    if (compileContext) {
      compileContext.consoleConcatHelperUsed = true;
    }

    for (let i = 1; i < pieces.length; i += 1) {
      const nextExpr = lowerConsoleConcatPieceAsCString(pieces[i], compileContext);
      if (nextExpr === null) {
        return null;
      }
      if (!compileContext) {
        currentExpr = `__maia_console_concat2(${currentExpr}, ${nextExpr})`;
        continue;
      }
      const tempName = `__maia_console_tmp${compileContext._consoleConcatTempCount++}`;
      compileContext._preludeStatements.push(`const char* ${tempName} = (const char*)__maia_console_concat2(${currentExpr}, ${nextExpr});`);
      currentExpr = tempName;
    }

    if (compileContext && expressionNode && typeof expressionNode === 'object') {
      compileContext._consoleConcatExprCache.set(expressionNode, currentExpr);
    }
    return currentExpr;
  }

  function lowerRequiredExpressionValue(expressionNode, compileContext, code, detail) {
    const lowered = lowerExpressionValue(expressionNode, compileContext);
    if (lowered !== null) {
      return lowered;
    }

    reportUnsupportedLowering(compileContext, code, detail);
    err(`unsupported lowering: ${detail}`);
    return '0';
  }

  function lowerConsoleLogArgumentExpression(expressionNode, compileContext) {
    if (isDynamicHandleMethodPropertyCall(expressionNode, compileContext)) {
      const dynamicMethodCall = tryLowerDynamicHandleMethodCall(expressionNode, compileContext);
      const propertyNames = getCallExpressionTrailingPropertyNames(expressionNode);
      if (dynamicMethodCall !== null && propertyNames.length > 0) {
        let propertyReceiver = dynamicMethodCall;
        for (let index = 0; index < propertyNames.length - 1; index += 1) {
          propertyReceiver = `__async_handle_get_handle(${propertyReceiver}, (const char*)"${propertyNames[index]}")`;
        }
        const finalPropertyName = propertyNames[propertyNames.length - 1];
        return `__async_handle_get_property_string(${propertyReceiver}, (const char*)"${finalPropertyName}")`;
      }
    }

    const dynamicMethodCall = tryLowerDynamicHandleMethodCall(expressionNode, compileContext);
    if (dynamicMethodCall !== null) {
      return `__async_handle_get_string(${dynamicMethodCall})`;
    }

    const directIdentifierNode = unwrapDirectIdentifierExpression(expressionNode);
    if (directIdentifierNode) {
      const identifierValue = findFirstIdentifierValue(directIdentifierNode);
      if (identifierValue && identifierValue !== 'arguments') {
        const dynamicHandleField = compileContext
          && compileContext.asyncStateDynamicHandleFields
          && compileContext.asyncStateDynamicHandleFields.get(identifierValue);
        if (dynamicHandleField) {
          return `__async_handle_get_string(__sm->${dynamicHandleField})`;
        }
        const loweredId = lowerIdentifierValue(identifierValue, compileContext);
        const useRuntimeCstr = Boolean(
          compileContext && (
            (compileContext.closurePlan && compileContext.closurePlan.orderedClosures.some((c) => (c.captures && c.captures.length > 0) || (c.boxedVars && c.boxedVars.size > 0) || c.isNested || (compileContext.closurePlan.topLevelClosureByName && compileContext.closurePlan.topLevelClosureByName.size > 0)))
            || (compileContext.promisePlan && compileContext.promisePlan.enabled)
            || (compileContext.iteratorPlan && compileContext.iteratorPlan.enabled)
            || (compileContext.atomicsPlan && compileContext.atomicsPlan.enabled)
          || Boolean(compileContext.regexUsed)
          )
        );
        const knownLocalType = compileContext && compileContext.localVariables
          ? compileContext.localVariables.get(identifierValue)
          : null;
        if (useRuntimeCstr && knownLocalType !== 'const char*') {
          compileContext.consoleConcatHelperUsed = true;
          return `__maia_console_to_cstr_number((double)(${loweredId}))`;
        }
        return loweredId;
      }
    }

    const preludeCountBefore = compileContext && Array.isArray(compileContext._preludeStatements)
      ? compileContext._preludeStatements.length
      : 0;
    const lowered = lowerExpressionValue(expressionNode, compileContext);
    const preludeCountAfter = compileContext && Array.isArray(compileContext._preludeStatements)
      ? compileContext._preludeStatements.length
      : 0;
    if (lowered !== null && /^"(?:[^"\\]|\\.)*"$/.test(lowered)) {
      return lowered;
    }

    if (lowered !== null && inferExprType(expressionNode, compileContext) === 'string') {
      return lowered;
    }
    if (lowered !== null && compileContext && compileContext.hasStringYieldingGenerator && /^__maia_runtime_value_get_property\(.*"value"\)$/.test(lowered.trim())) {
      return `(const char*)(${lowered})`;
    }
    if (lowered !== null && /^__maia_atomics_wait\(/.test(lowered.trim())) {
      return `(const char*)(${lowered})`;
    }

    if (lowered === null || preludeCountAfter === preludeCountBefore) {
      const loweredConcat = tryLowerConsoleLogConcatExpression(expressionNode, compileContext);
      if (loweredConcat !== null) {
        return loweredConcat;
      }
    }

    if (lowered !== null) {
      const useRuntimeCstr = Boolean(
        compileContext && (
          (compileContext.closurePlan && compileContext.closurePlan.orderedClosures.some((c) => (c.captures && c.captures.length > 0) || (c.boxedVars && c.boxedVars.size > 0) || c.isNested || (compileContext.closurePlan.topLevelClosureByName && compileContext.closurePlan.topLevelClosureByName.size > 0)))
          || (compileContext.promisePlan && compileContext.promisePlan.enabled)
          || (compileContext.iteratorPlan && compileContext.iteratorPlan.enabled)
          || (compileContext.atomicsPlan && compileContext.atomicsPlan.enabled)
        )
      );
      const isPlainLocalCall = preludeCountAfter === preludeCountBefore
        && /^[A-Za-z_][A-Za-z0-9_]*\([^()]*\)$/.test(lowered.trim())
        && compileContext.localFunctionNames
        && compileContext.localFunctionNames.has(lowered.trim().split("(")[0])
        && compileContext.closurePlan
        && compileContext.closurePlan.orderedClosures.some((c) => c.node && c.node.name === 'arrowFunction' && (!c.captures || c.captures.length === 0) && !c.isNested)
        && true;
      if (useRuntimeCstr
        && !isPlainLocalCall
        && !/^__maia_console_to_cstr_/.test(lowered.trim())
        && !/^__maia_console_concat/.test(lowered.trim())) {
        compileContext.consoleConcatHelperUsed = true;
        if (/^__(?:maia_set_has|maia_map_has|maiaregex__test)\(/.test(lowered.trim())) {
          return `__maia_console_to_cstr_bool((int)(${lowered}))`;
        }
        if (compileContext && /[?:]|>>|<</.test(lowered)) {
          if (!Array.isArray(compileContext._preludeStatements)) compileContext._preludeStatements = [];
          compileContext._consoleLogArgTmpSeq = (compileContext._consoleLogArgTmpSeq || 0) + 1;
          const tmpVar = `__maia_log_val_${compileContext._consoleLogArgTmpSeq}`;
          compileContext._preludeStatements.push(`double ${tmpVar} = (double)(${lowered});`);
          return `__maia_console_to_cstr_number(${tmpVar})`;
        }
        return `__maia_console_to_cstr_number((double)(${lowered}))`;
      }
      return lowered;
    }

    reportUnsupportedLowering(
      compileContext,
      'console-log-argument-unlowerable',
      'console.log argument expression could not be lowered'
    );
    err('unsupported lowering: console.log argument expression');
    return '0';
  }

  function lowerConsoleLogCallArguments(argExprs, compileContext) {
    if (!Array.isArray(argExprs) || argExprs.length === 0) {
      return '""';
    }
    if (argExprs.length === 1) {
      return lowerConsoleLogArgumentExpression(argExprs[0], compileContext);
    }

    let combined = lowerConsoleConcatPieceAsCString(argExprs[0], compileContext);
    if (combined === null) {
      return null;
    }
    if (compileContext) {
      compileContext.consoleConcatHelperUsed = true;
    }
    for (let i = 1; i < argExprs.length; i += 1) {
      const next = lowerConsoleConcatPieceAsCString(argExprs[i], compileContext);
      if (next === null) {
        return null;
      }
      combined = `__maia_console_concat2(__maia_console_concat2(${combined}, " "), ${next})`;
    }
    return combined;
  }

  function lowerConditionalExpressionValue(node, compileContext) {
    if (!node || node.kind !== 'nonterminal' || (node.name !== 'conditionalExpression' && node.name !== 'conditionalExpressionNoIn')) {
      reportUnsupportedLowering(
        compileContext,
        'conditional-expression-unlowerable',
        'conditional expression node is missing, malformed, or unexpected kind'
      );
      if (compileContext && compileContext.strictLowering) {
        err('unsupported lowering: conditional expression node shape');
      }
      return null;
    }

    const children = node.children || [];
    const hasTernary = children.some((child) => child && child.kind === 'terminal' && child.value === '?');
    let nonterminalChildren = children.filter((child) => child && child.kind === 'nonterminal');

    if (!hasTernary) {
      if (nonterminalChildren.length !== 1) {
        const fallbackCandidates = [];
        const fallbackNames = [
          'logicalORExpression',
          'logicalANDExpression',
          'bitwiseORExpression',
          'bitwiseXORExpression',
          'bitwiseANDExpression',
          'equalityExpression',
          'relationalExpression',
          'shiftExpression',
          'additiveExpression',
          'multiplicativeExpression',
          'unaryExpression',
          'postfixExpression',
          'primaryExpression'
        ];
        for (const child of children) {
          if (!child || child.kind !== 'nonterminal') {
            continue;
          }
          let candidate = null;
          for (const name of fallbackNames) {
            candidate = findFirstNonterminal(child, name);
            if (candidate) {
              break;
            }
          }
          if (candidate) {
            fallbackCandidates.push(candidate);
          }
        }
        if (fallbackCandidates.length > 0) {
          nonterminalChildren = fallbackCandidates;
        }
      }

      if (nonterminalChildren.length !== 1) {
        reportUnsupportedLowering(
          compileContext,
          'conditional-expression-unlowerable',
          'conditional expression could not be reduced to a single child'
        );
        if (compileContext && compileContext.strictLowering) {
          err('unsupported lowering: conditional expression');
        }
        return null;
      }

      const loweredSingle = lowerExpressionValue(nonterminalChildren[0], compileContext);
      if (loweredSingle === null) {
        reportUnsupportedLowering(
          compileContext,
          'conditional-expression-unlowerable',
          'conditional expression child could not be lowered'
        );
        if (compileContext && compileContext.strictLowering) {
          err('unsupported lowering: conditional expression child');
        }
      }
      return loweredSingle;
    }

    if (nonterminalChildren.length < 3) {
      reportUnsupportedLowering(
        compileContext,
        'conditional-expression-unlowerable',
        'ternary conditional expression is missing branches'
      );
      if (compileContext && compileContext.strictLowering) {
        err('unsupported lowering: ternary conditional expression');
      }
      return null;
    }

    const testExpr = lowerExpressionValue(nonterminalChildren[0], compileContext);
    const consequentExpr = lowerExpressionValue(nonterminalChildren[1], compileContext);
    const alternateExpr = lowerExpressionValue(nonterminalChildren[2], compileContext);
    if (testExpr === null || consequentExpr === null || alternateExpr === null) {
      reportUnsupportedLowering(
        compileContext,
        'conditional-expression-unlowerable',
        'ternary conditional branch expression could not be lowered'
      );
      if (compileContext && compileContext.strictLowering) {
        err('unsupported lowering: ternary conditional branch expression');
      }
      return null;
    }

    return `((${testExpr}) ? (${consequentExpr}) : (${alternateExpr}))`;
  }

  function lowerMemberExpressionNewCallValue(node, compileContext) {
    if (!node || node.kind !== 'nonterminal' || node.name !== 'memberExpression') {
      return null;
    }

    const children = node.children || [];
    const startsWithNew = children[0]
      && children[0].kind === 'terminal'
      && children[0].token === 'TOKEN_new';

    let ctorMemberNode = children[1]
      && children[1].kind === 'nonterminal'
      && children[1].name === 'memberExpression'
      ? children[1]
      : null;
    let argsNode = children[2]
      && children[2].kind === 'nonterminal'
      && children[2].name === 'arguments'
      ? children[2]
      : null;

    if (startsWithNew && (!ctorMemberNode || !argsNode)) {
      for (const child of children) {
        if (!child || child.kind !== 'nonterminal') {
          continue;
        }
        if (!ctorMemberNode) {
          const candidateCtor = findFirstNonterminal(child, 'memberExpression');
          if (candidateCtor && candidateCtor !== node) {
            ctorMemberNode = candidateCtor;
          }
        }
        if (!argsNode) {
          const candidateArgs = findFirstNonterminal(child, 'arguments');
          if (candidateArgs) {
            argsNode = candidateArgs;
          }
        }
        if (ctorMemberNode && argsNode) {
          break;
        }
      }
    }

    const isNewCtor = Boolean(startsWithNew && ctorMemberNode && argsNode);

    if (!isNewCtor) {
      if (startsWithNew) {
        reportUnsupportedLowering(
          compileContext,
          'new-expression-unlowerable',
          'new expression does not match supported constructor call shape'
        );
        if (compileContext && compileContext.strictLowering) {
          err('unsupported lowering: new expression shape');
        }
      }
      return null;
    }

    const ctorPath = extractPathFromMemberExpression(ctorMemberNode, compileContext);
    const ctorBase = Array.isArray(ctorPath) && ctorPath.length > 0
      ? ctorPath.join('__')
      : findFirstIdentifierValue(ctorMemberNode);

    if (!ctorBase) {
      reportUnsupportedLowering(
        compileContext,
        'new-expression-unlowerable',
        'constructor base could not be resolved for new expression'
      );
      if (compileContext && compileContext.strictLowering) {
        err('unsupported lowering: new expression constructor base');
      }
      return null;
    }

    if (compileContext && compileContext.atomicsPlan && compileContext.atomicsPlan.enabled) {
      const newArgList = argsNode ? ((argsNode.children || []).find((c) => c && c.kind === 'nonterminal' && c.name === 'argumentList') || null) : null;
      const argExprs = newArgList ? collectArgumentExpressions(newArgList) : [];
      if (ctorBase === 'SharedArrayBuffer') {
        const lenExpr = argExprs.length >= 1 ? lowerExpressionValue(argExprs[0], compileContext) : '0';
        return `__maia_sab_new((int)(${lenExpr !== null ? lenExpr : '0'}))`;
      }
      if (Object.prototype.hasOwnProperty.call(atomics.TYPED_ARRAY_SPECS, ctorBase)) {
        const spec = atomics.TYPED_ARRAY_SPECS[ctorBase];
        if (argExprs.length === 0) {
          return `__maia_typed_array_from_len(0, ${spec.elemSize}, ${spec.isSigned})`;
        }
        const a0 = lowerExpressionValue(argExprs[0], compileContext);
        const safeA0 = a0 !== null ? a0 : '0';
        if (argExprs.length === 1 && (/^\d+$/.test(safeA0.trim()) || inferExprType(argExprs[0], compileContext) === 'number')) {
          return `__maia_typed_array_from_len((int)(${safeA0}), ${spec.elemSize}, ${spec.isSigned})`;
        }
        const a1 = argExprs.length >= 2 ? lowerExpressionValue(argExprs[1], compileContext) : '0';
        const a2 = argExprs.length >= 3 ? lowerExpressionValue(argExprs[2], compileContext) : '0';
        return `__maia_typed_array_from_sab((void*)(${safeA0}), ${spec.elemSize}, ${spec.isSigned}, (int)(${a1 !== null ? a1 : '0'}), ${argExprs.length >= 3 ? 1 : 0}, (int)(${a2 !== null ? a2 : '0'}))`;
      }
    }

    if (ctorBase === 'RegExp') {
      const newArgList = argsNode ? ((argsNode.children || []).find((c) => c && c.kind === 'nonterminal' && c.name === 'argumentList') || null) : null;
      const argExprs = newArgList ? collectArgumentExpressions(newArgList) : [];
      const pat = argExprs.length >= 1 ? (lowerExpressionValue(argExprs[0], compileContext) || '""') : '""';
      const flags = argExprs.length >= 2 ? (lowerExpressionValue(argExprs[1], compileContext) || '""') : '""';
      if (compileContext) compileContext.regexUsed = true;
      return `__maiaregex__new((const char*)(${pat}), (const char*)(${flags}))`;
    }

    if (ctorBase === 'Promise' && compileContext && compileContext.promisePlan && compileContext.promisePlan.enabled) {
      const newArgList = argsNode ? ((argsNode.children || []).find((c) => c && c.kind === 'nonterminal' && c.name === 'argumentList') || null) : null;
      const argExprs = newArgList ? collectArgumentExpressions(newArgList) : [];
      const execExpr = argExprs.length >= 1 ? lowerExpressionValue(argExprs[0], compileContext) : '0';
      return `__maia_promise_new((void*)(${execExpr !== null ? execExpr : '0'}))`;
    }

    if (compileContext && compileContext.collectionsPlan && compileContext.collectionsPlan.enabled
      && (ctorBase === 'Set' || ctorBase === 'Map' || ctorBase === 'WeakSet' || ctorBase === 'WeakMap')) {
      const newArgList = argsNode ? ((argsNode.children || []).find((c) => c && c.kind === 'nonterminal' && c.name === 'argumentList') || null) : null;
      const argExprs = newArgList ? collectArgumentExpressions(newArgList) : [];
      if (!(ctorBase === 'WeakMap' && argExprs.length === 0)) {
        compileContext.runtimeFallbackHelpersUsed = true;
        const initExpr = argExprs.length >= 1 ? (lowerExpressionValue(argExprs[0], compileContext) || '0') : '0';
        if (ctorBase === 'Set' || ctorBase === 'WeakSet') {
          return `__maia_set_new((void*)(${initExpr}))`;
        }
        return `__maia_map_new((void*)(${initExpr}))`;
      }
    }

    const args = lowerArgumentsNode(argsNode, compileContext);
    if (compileContext && compileContext.topLevelClassNames && compileContext.topLevelClassNames.has(ctorBase)) {
      if (args && args.trim()) {
        if (!Array.isArray(compileContext._preludeStatements)) compileContext._preludeStatements = [];
        const tmpIdx = (compileContext._newClassTmpCount || 0) + 1;
        compileContext._newClassTmpCount = tmpIdx;
        const tmpVar = `__maia_new_${ctorBase}_${tmpIdx}`;
        compileContext._preludeStatements.push(`${ctorBase}* ${tmpVar} = new ${ctorBase}();`);
        compileContext._preludeStatements.push(`${getClassInitWrapperName(ctorBase)}(${tmpVar}, ${args});`);
        return `(long)(${tmpVar})`;
      }
      return `new ${ctorBase}()`;
    }
    return `__new__${ctorBase}(${args})`;
  }

  function extractObjectLiteralProperties(objectLiteralNode, compileContext = null) {
    if (!objectLiteralNode || objectLiteralNode.kind !== 'nonterminal' || objectLiteralNode.name !== 'objectLiteral') {
      return [];
    }

    const properties = [];
    for (const child of (objectLiteralNode.children || [])) {
      if (!child || child.kind !== 'nonterminal' || child.name !== 'propertyAssignment') {
        continue;
      }

      let propertyNameNode = (child.children || []).find(
        (candidate) => candidate && candidate.kind === 'nonterminal' && candidate.name === 'propertyName'
      ) || null;
      if (!propertyNameNode) {
        propertyNameNode = findFirstNonterminal(child, 'propertyName');
      }
      let valueExprNode = (child.children || []).find(
        (candidate) => candidate
          && candidate.kind === 'nonterminal'
          && (
            candidate.name === 'functionExpression'
            || candidate.name === 'arrowFunction'
            || candidate.name === 'asyncArrowFunction'
            || candidate.name === 'asyncFunctionExpression'
          )
      ) || null;
      if (!valueExprNode) {
        valueExprNode = (child.children || []).find(
          (candidate) => candidate && candidate.kind === 'nonterminal' && candidate.name === 'assignmentExpression'
        ) || null;
      }
      if (!valueExprNode) {
        valueExprNode = findFirstNonterminal(child, 'assignmentExpression');
      }
      if (!propertyNameNode || !valueExprNode) {
        const hasEllipsis = (child.children || []).some((c) => c && c.kind === 'terminal' && String(c.value || '').trim() === '...');
        if (!hasEllipsis) {
          const shorthandIdent = findFirstNonterminal(child, 'identifier') || findFirstNonterminal(child, 'identifierReference');
          const shorthandName = shorthandIdent ? findFirstIdentifierValue(shorthandIdent) : null;
          if (shorthandName) {
            properties.push({ key: shorthandName, valueExprNode: shorthandIdent, sourceNode: child });
            continue;
          }
        }
        continue;
      }

      const computedPropertyName = findFirstNonterminal(propertyNameNode, 'computedPropertyName');
      let key = null;
      if (computedPropertyName && iterators.isSymbolIteratorPropertyNameNode(computedPropertyName)) {
        key = '__maia_sym_iterator';
      } else if (computedPropertyName) {
        const keyExpressionNode = (computedPropertyName.children || []).find(
          (candidate) => candidate && candidate.kind === 'nonterminal' && candidate.name === 'assignmentExpression'
        ) || findFirstNonterminal(computedPropertyName, 'assignmentExpression');
        let keyModel = keyExpressionNode && compileContext
          ? resolveStaticModelFromExpression(keyExpressionNode, computedPropertyName, compileContext)
          : resolveFlatStaticPrimitiveModel(keyExpressionNode);
        if (!keyModel && keyExpressionNode && compileContext) {
          const keyBindingName = findFirstIdentifierValue(keyExpressionNode);
          const keyInitializer = keyBindingName
            ? findBoundVariableInitializerExpressionAtNode(keyBindingName, computedPropertyName, compileContext)
            : null;
          keyModel = resolveFlatStaticPrimitiveModel(keyInitializer);
        }
        if (keyModel && (keyModel.kind === 'string' || keyModel.kind === 'number')) {
          key = String(keyModel.value);
        } else if (keyExpressionNode) {
          properties.push({ key: null, keyExprNode: keyExpressionNode, valueExprNode, sourceNode: child });
          continue;
        } else if (compileContext) {
          reportUnsupportedLowering(
            compileContext,
            'computed-object-property-unlowerable',
            'computed object property requires a static string or numeric key'
          );
        }
      } else {
        key = findFirstIdentifierValue(propertyNameNode);
        if (!key && propertyNameNode) {
          const strTok = findFirstTerminalByToken(propertyNameNode, 'StringLiteral');
          if (strTok && typeof strTok.value === 'string' && strTok.value.length >= 2) {
            key = strTok.value.slice(1, -1);
          }
        }
      }
      if (!key) {
        continue;
      }

      properties.push({ key, valueExprNode, sourceNode: child });
    }

    return properties;
  }

  function extractObjectLiteralOperations(objectLiteralNode, compileContext = null) {
    const properties = extractObjectLiteralProperties(objectLiteralNode, compileContext);
    const propertiesBySourceNode = new Map(properties.map((property) => [property.sourceNode, property]));
    const operations = [];

    for (const child of (objectLiteralNode.children || [])) {
      if (!child || child.kind !== 'nonterminal' || child.name !== 'propertyAssignment') {
        continue;
      }

      const spreadProperty = (child.children || []).find(
        (candidate) => candidate && candidate.kind === 'nonterminal' && candidate.name === 'spreadProperty'
      ) || findFirstNonterminal(child, 'spreadProperty');
      if (spreadProperty) {
        const valueExprNode = (spreadProperty.children || []).find(
          (candidate) => candidate && candidate.kind === 'nonterminal' && candidate.name === 'assignmentExpression'
        ) || findFirstNonterminal(spreadProperty, 'assignmentExpression');
        if (valueExprNode) {
          operations.push({ kind: 'spread', valueExprNode });
        } else {
          reportUnsupportedLowering(
            compileContext,
            'object-spread-unlowerable',
            'object spread property has no value expression'
          );
        }
        continue;
      }

      const property = propertiesBySourceNode.get(child);
      if (property) {
        operations.push({ kind: 'property', ...property });
      }
    }

    return operations;
  }

  function lowerObjectLiteralValue(objectLiteralNode, compileContext) {
    if (!objectLiteralNode || objectLiteralNode.kind !== 'nonterminal' || objectLiteralNode.name !== 'objectLiteral') {
      reportUnsupportedLowering(
        compileContext,
        'object-literal-unlowerable',
        'object literal node is missing, malformed, or unexpected kind'
      );
      if (compileContext && compileContext.strictLowering) {
        err('unsupported lowering: object literal node shape');
      }
      return null;
    }

    const properties = extractObjectLiteralProperties(objectLiteralNode, compileContext);
    const operations = extractObjectLiteralOperations(objectLiteralNode, compileContext);
    const propertyAssignmentCount = (objectLiteralNode.children || []).filter(
      (child) => child && child.kind === 'nonterminal' && child.name === 'propertyAssignment'
    ).length;

    if (propertyAssignmentCount > 0 && properties.length === 0) {
      reportUnsupportedLowering(
        compileContext,
        'object-literal-unlowerable',
        'object literal contains propertyAssignment entries that could not be resolved'
      );
      if (compileContext && compileContext.strictLowering) {
        err('unsupported lowering: object literal propertyAssignment resolution');
      }
    }

    if (operations.length === 0) {
      return '__maia_obj_literal0()';
    }

    if (operations.some((operation) => operation.kind === 'spread') || properties.length > 4) {
      // Builders preserve source-order overwrite semantics for spreads and large literals.
      let chain = '__maia_obj_builder_begin()';
      for (const operation of operations) {
        if (operation.kind === 'spread') {
          const loweredValue = lowerRequiredExpressionValue(
            operation.valueExprNode,
            compileContext,
            'object-spread-unlowerable',
            'object spread value expression'
          );
          chain = `__maia_obj_builder_spread(${chain}, (void*)(${loweredValue}))`;
          continue;
        }
        const property = operation;
        const keyLiteral = property.keyExprNode ? `(char*)(${lowerExpressionValue(property.keyExprNode, compileContext) || '""'})` : `(char*)${staticStringLiteralCpp(property.key)}`;
        const loweredValue = lowerRequiredExpressionValue(
          property.valueExprNode,
          compileContext,
          'object-literal-value-unlowerable',
          `object literal property '${property.key}' value expression`
        );
        chain = `__maia_obj_builder_set_key(${chain}, ${keyLiteral}, (long)(${loweredValue}))`;
      }
      return `__maia_obj_builder_end(${chain})`;
    }

    const args = [];
    for (const property of properties) {
      const keyLiteral = property.keyExprNode ? `(char*)(${lowerExpressionValue(property.keyExprNode, compileContext) || '""'})` : `(char*)${staticStringLiteralCpp(property.key)}`;
      const loweredValue = lowerRequiredExpressionValue(
        property.valueExprNode,
        compileContext,
        'object-literal-value-unlowerable',
        `object literal property '${property.key}' value expression`
      );
      args.push(`${keyLiteral}, (long)(${loweredValue})`);
    }

    return `__maia_obj_literal${properties.length}(${args.join(', ')})`;
  }

  function extractArrayLiteralElements(arrayLiteralNode) {
    if (!arrayLiteralNode || arrayLiteralNode.kind !== 'nonterminal' || arrayLiteralNode.name !== 'arrayLiteral') {
      return {
        values: [],
        operations: [],
        hasSpread: false,
        hasElision: false
      };
    }

    const children = arrayLiteralNode.children || [];
    const values = [];
    const operations = [];
    let hasSpread = false;
    let hasElision = false;
    let previousSignificant = null;

    for (let i = 0; i < children.length; i += 1) {
      const child = children[i];
      if (!child) {
        continue;
      }

      if (child.kind === 'terminal' && child.token === 'TOKEN__2C_') {
        if (previousSignificant === 'comma' || previousSignificant === 'open') {
          const hasFollowingElement = children.slice(i + 1).some(
            (candidate) => candidate && candidate.kind === 'nonterminal' && candidate.name === 'arrayElement'
          );
          if (hasFollowingElement) {
            hasElision = true;
            operations.push({ kind: 'hole' });
          }
        }
        previousSignificant = 'comma';
        continue;
      }

      if (child.kind === 'terminal' && child.token === 'TOKEN__5B_') {
        previousSignificant = 'open';
        continue;
      }

      if (child.kind === 'terminal' && child.token === 'TOKEN__5D_') {
        previousSignificant = 'close';
        continue;
      }

      if (child.kind !== 'nonterminal' || child.name !== 'arrayElement') {
        continue;
      }

      let spreadElement = (child.children || []).find(
        (candidate) => candidate && candidate.kind === 'nonterminal' && candidate.name === 'spreadElement'
      ) || null;
      if (!spreadElement) {
        spreadElement = findFirstNonterminal(child, 'spreadElement');
      }
      if (spreadElement) {
        hasSpread = true;
        let spreadValue = (spreadElement.children || []).find(
          (candidate) => candidate && candidate.kind === 'nonterminal' && candidate.name === 'assignmentExpression'
        ) || null;
        if (!spreadValue) {
          spreadValue = findFirstNonterminal(spreadElement, 'assignmentExpression');
        }
        operations.push({ kind: 'spread', valueExprNode: spreadValue || null });
        previousSignificant = 'element';
        continue;
      }

      let assignmentExpression = (child.children || []).find(
        (candidate) => candidate && candidate.kind === 'nonterminal' && candidate.name === 'assignmentExpression'
      ) || null;
      if (!assignmentExpression) {
        assignmentExpression = findFirstNonterminal(child, 'assignmentExpression');
      }
      if (assignmentExpression) {
        values.push(assignmentExpression);
        operations.push({ kind: 'value', valueExprNode: assignmentExpression });
        previousSignificant = 'element';
      }
    }

    return {
      values,
      operations,
      hasSpread,
      hasElision
    };
  }

  function lowerAdvancedArrayLiteralValue(arrayInfo, compileContext) {
    if (!arrayInfo || !Array.isArray(arrayInfo.operations) || !Array.isArray(arrayInfo.values)) {
      reportUnsupportedLowering(
        compileContext,
        'array-literal-unlowerable',
        'advanced array literal info is missing or malformed'
      );
      if (compileContext && compileContext.strictLowering) {
        err('unsupported lowering: advanced array literal info shape');
      }
      return null;
    }

    const lowerArrayStorageValue = (exprNode) => {
      const loweredValue = exprNode
        ? lowerRequiredExpressionValue(
          exprNode,
          compileContext,
          'array-element-unlowerable',
          'array element expression'
        )
        : '0';

      if (!compileContext) {
        return `(long)(${loweredValue})`;
      }

      if (!Array.isArray(compileContext._preludeStatements)) {
        compileContext._preludeStatements = [];
      }
      if (compileContext._arrayValueTempCount === undefined) {
        compileContext._arrayValueTempCount = 0;
      }

      if (/__maia_(?:arr_literal|arr_builder_end|obj_literal|obj_builder_end)/.test(loweredValue)) {
        const tempName = `__maia_arr_value_tmp${compileContext._arrayValueTempCount++}`;
        compileContext._preludeStatements.push(`void* ${tempName} = (void*)(${loweredValue});`);
        return `(long)(${tempName})`;
      }

      return `(long)(${loweredValue})`;
    };

    if (compileContext) {
      if (!Array.isArray(compileContext._preludeStatements)) {
        compileContext._preludeStatements = [];
      }
      if (compileContext._arrayBuilderTempCount === undefined) {
        compileContext._arrayBuilderTempCount = 0;
      }
      let currentTempName = `__maia_arr_builder_tmp${compileContext._arrayBuilderTempCount++}`;
      compileContext._preludeStatements.push(`void* ${currentTempName} = __maia_arr_builder_begin();`);

      for (const operation of (arrayInfo.operations || [])) {
        const nextTempName = `__maia_arr_builder_tmp${compileContext._arrayBuilderTempCount++}`;
        if (operation.kind === 'hole') {
          compileContext._preludeStatements.push(`void* ${nextTempName} = __maia_arr_builder_push_hole(${currentTempName});`);
          currentTempName = nextTempName;
          continue;
        }

        if (operation.kind === 'spread') {
          const loweredSpread = operation.valueExprNode
            ? lowerRequiredExpressionValue(
              operation.valueExprNode,
              compileContext,
              'array-spread-unlowerable',
              'array spread expression'
            )
            : 'nullptr';
          compileContext._preludeStatements.push(`void* ${nextTempName} = __maia_arr_builder_spread(${currentTempName}, (void*)(${loweredSpread}));`);
          currentTempName = nextTempName;
          continue;
        }

        const loweredValue = lowerArrayStorageValue(operation.valueExprNode);
        compileContext._preludeStatements.push(`void* ${nextTempName} = __maia_arr_builder_push_value(${currentTempName}, ${loweredValue});`);
        currentTempName = nextTempName;
      }

      return `__maia_arr_builder_end(${currentTempName})`;
    }

    let chain = '__maia_arr_builder_begin()';

    for (const operation of (arrayInfo.operations || [])) {
      if (operation.kind === 'hole') {
        chain = `__maia_arr_builder_push_hole(${chain})`;
        continue;
      }

      if (operation.kind === 'spread') {
        const loweredSpread = operation.valueExprNode
          ? lowerRequiredExpressionValue(
            operation.valueExprNode,
            compileContext,
            'array-spread-unlowerable',
            'array spread expression'
          )
          : 'nullptr';
        chain = `__maia_arr_builder_spread(${chain}, (void*)(${loweredSpread}))`;
        continue;
      }

      const loweredValue = lowerArrayStorageValue(operation.valueExprNode);
      chain = `__maia_arr_builder_push_value(${chain}, ${loweredValue})`;
    }

    return `__maia_arr_builder_end(${chain})`;
  }

  function takePreludeStatements(compileContext, indent = '  ') {
    if (!compileContext || !Array.isArray(compileContext._preludeStatements) || compileContext._preludeStatements.length === 0) {
      return [];
    }
    const statements = compileContext._preludeStatements.splice(0);
    return statements.map((statement) => `${indent}${statement}`);
  }

  function beginDeferredPromiseQueueScope(compileContext) {
    if (!compileContext) {
      return;
    }
    compileContext._deferredPromiseMicrotasks = [];
    compileContext._deferredPromiseTimers = [];
  }

  function enqueueDeferredPromiseStatement(compileContext, scheduleKind, statement) {
    if (!compileContext || !statement) {
      return;
    }
    if (!Array.isArray(compileContext._deferredPromiseMicrotasks) || !Array.isArray(compileContext._deferredPromiseTimers)) {
      beginDeferredPromiseQueueScope(compileContext);
    }
    if (scheduleKind === 'timer') {
      compileContext._deferredPromiseTimers.push(statement);
      return;
    }
    compileContext._deferredPromiseMicrotasks.push(statement);
  }

  function takeDeferredPromiseStatements(compileContext, indent = '  ') {
    if (!compileContext) {
      return [];
    }
    const microtasks = Array.isArray(compileContext._deferredPromiseMicrotasks)
      ? compileContext._deferredPromiseMicrotasks.splice(0)
      : [];
    const timers = Array.isArray(compileContext._deferredPromiseTimers)
      ? compileContext._deferredPromiseTimers.splice(0)
      : [];
    return microtasks.concat(timers).map((statement) => `${indent}${statement}`);
  }

  function resetStatementLoweringState(compileContext) {
    if (!compileContext) {
      return;
    }
    compileContext._preludeStatements = [];
    compileContext._consoleConcatExprCache = new WeakMap();
    compileContext._consoleConcatPieceCache = new WeakMap();
  }

  function lowerArrayLiteralValue(arrayLiteralNode, compileContext) {
    if (!arrayLiteralNode || arrayLiteralNode.kind !== 'nonterminal' || arrayLiteralNode.name !== 'arrayLiteral') {
      reportUnsupportedLowering(
        compileContext,
        'array-literal-unlowerable',
        'array literal node is missing, malformed, or unexpected kind'
      );
      if (compileContext && compileContext.strictLowering) {
        err('unsupported lowering: array literal node shape');
      }
      return null;
    }

    const arrayInfo = extractArrayLiteralElements(arrayLiteralNode);
    const arrayElementCount = (arrayLiteralNode.children || []).filter(
      (child) => child && child.kind === 'nonterminal' && child.name === 'arrayElement'
    ).length;

    if (arrayElementCount > 0 && arrayInfo.operations.length === 0) {
      reportUnsupportedLowering(
        compileContext,
        'array-literal-unlowerable',
        'array literal contains arrayElement entries that could not be resolved'
      );
      if (compileContext && compileContext.strictLowering) {
        err('unsupported lowering: array literal arrayElement resolution');
      }
    }

    const elements = arrayInfo.values;
    const hasNestedAggregateElement = elements.some((element) => Boolean(
      findFirstNonterminal(element, 'arrayLiteral') || findFirstNonterminal(element, 'objectLiteral')
    ));

    const lowerArrayStorageValue = (exprNode) => {
      const lowered = lowerRequiredExpressionValue(
        exprNode,
        compileContext,
        'array-element-unlowerable',
        'array literal element expression'
      );

      if (!compileContext) {
        return `(long)(${lowered})`;
      }

      if (!Array.isArray(compileContext._preludeStatements)) {
        compileContext._preludeStatements = [];
      }
      if (compileContext._arrayValueTempCount === undefined) {
        compileContext._arrayValueTempCount = 0;
      }

      if (/__maia_(?:arr_literal|arr_builder_end|obj_literal|obj_builder_end)/.test(lowered)) {
        const tempName = `__maia_arr_value_tmp${compileContext._arrayValueTempCount++}`;
        compileContext._preludeStatements.push(`void* ${tempName} = (void*)(${lowered});`);
        return `(long)(${tempName})`;
      }

      return `(long)(${lowered})`;
    };

    if (!arrayInfo.hasSpread && !arrayInfo.hasElision && elements.length === 0) {
      return '__maia_arr_literal0()';
    }

    if (!arrayInfo.hasSpread && !arrayInfo.hasElision && !hasNestedAggregateElement && elements.length <= 4) {
      const args = elements.map((element) => lowerArrayStorageValue(element));

      return `__maia_arr_literal${elements.length}(${args.join(', ')})`;
    }

    return lowerAdvancedArrayLiteralValue(arrayInfo, compileContext);
  }

  function extractLambdaParameterNames(node) {
    if (!node || node.kind !== 'nonterminal') {
      return [];
    }

    const names = [];

    if (node.name === 'arrowFunction') {
      const arrowParams = (node.children || []).find(
        (child) => child && child.kind === 'nonterminal' && child.name === 'arrowFunctionParameters'
      );
      if (!arrowParams) {
        return names;
      }

      const directIdentifier = (arrowParams.children || []).find(
        (child) => child
          && child.kind === 'nonterminal'
          && (child.name === 'identifier' || child.name === 'identifierReference')
      );
      if (directIdentifier) {
        const id = findFirstIdentifierValue(directIdentifier);
        if (id) {
          names.push(id);
        }
        return names;
      }

      const formalList = (arrowParams.children || []).find(
        (child) => child && child.kind === 'nonterminal' && child.name === 'formalParameterList'
      );
      if (!formalList) {
        return names;
      }

      walk(formalList, (candidate) => {
        if (!candidate || candidate.kind !== 'nonterminal' || candidate.name !== 'formalParameter') {
          return;
        }
        const id = findFirstIdentifierValue(candidate);
        if (id) {
          names.push(id);
        }
      });
      return names;
    }

    if (node.name === 'asyncArrowFunction') {
      const bindingIdentifier = (node.children || []).find(
        (child) => child && child.kind === 'nonterminal' && child.name === 'asyncArrowBindingIdentifier'
      );
      if (bindingIdentifier) {
        const id = findFirstIdentifierValue(bindingIdentifier);
        if (id) {
          names.push(id);
        }
        return names;
      }

      const formalList = (node.children || []).find(
        (child) => child && child.kind === 'nonterminal' && child.name === 'formalParameterList'
      );
      if (!formalList) {
        return names;
      }

      walk(formalList, (candidate) => {
        if (!candidate || candidate.kind !== 'nonterminal' || candidate.name !== 'formalParameter') {
          return;
        }
        const id = findFirstIdentifierValue(candidate);
        if (id) {
          names.push(id);
        }
      });
    }

    return names;
  }

  function extractLambdaParameterDefaultExpressions(node) {
    if (!node || node.kind !== 'nonterminal') {
      return [];
    }
    const parameterContainer = node.name === 'arrowFunction'
      ? (node.children || []).find((child) => child && child.kind === 'nonterminal' && child.name === 'arrowFunctionParameters')
      : (node.name === 'asyncArrowFunction' ? node : null);
    const formalList = parameterContainer
      ? findFirstNonterminal(parameterContainer, 'formalParameterList')
      : null;
    if (!formalList) {
      return [];
    }
    const defaults = [];
    walk(formalList, (candidate) => {
      if (!candidate || candidate.kind !== 'nonterminal' || candidate.name !== 'formalParameter') {
        return;
      }
      const initializer = findFirstNonterminal(candidate, 'initializer');
      defaults.push(initializer ? findFirstNonterminal(initializer, 'assignmentExpression') : null);
    });
    return defaults;
  }

  function extractLambdaBodyNode(node) {
    if (!node || node.kind !== 'nonterminal') {
      return null;
    }

    if (node.name === 'arrowFunction') {
      return (node.children || []).find(
        (child) => child && child.kind === 'nonterminal' && child.name === 'arrowFunctionBody'
      ) || null;
    }

    if (node.name === 'asyncArrowFunction') {
      return (node.children || []).find(
        (child) => child && child.kind === 'nonterminal' && child.name === 'asyncConciseBody'
      ) || null;
    }

    return null;
  }

  function collectAvailableLambdaCaptureNames(node, compileContext) {
    const available = new Set();
    const path = compileContext && compileContext.tree ? findNodePath(compileContext.tree, node) : [];

    if (path.length === 0) {
      return available;
    }

    for (let i = path.length - 2; i >= 0; i -= 1) {
      const ancestor = path[i];
      if (!ancestor || ancestor.kind !== 'nonterminal') {
        continue;
      }

      if (ancestor.name === 'arrowFunction' || ancestor.name === 'asyncArrowFunction') {
        for (const name of extractLambdaParameterNames(ancestor)) {
          if (!available.has(name)) {
            available.add(name);
          }
        }
        continue;
      }

      if (ancestor.name === 'functionBody' || ancestor.name === 'asyncFunctionBody' || ancestor.name === 'block') {
        for (const statementNode of extractStatementsFromScopeContainer(ancestor)) {
          if (nodeContainsTarget(statementNode, node)) {
            break;
          }
          for (const name of collectBindingNamesFromStatement(statementNode)) {
            if (!available.has(name)) {
              available.add(name);
            }
          }
        }
        continue;
      }

      if (ancestor.name === 'functionDeclaration' || ancestor.name === 'asyncFunctionDeclaration' || ancestor.name === 'methodDefinition') {
        for (const name of extractFormalParameterNamesFromNode(ancestor)) {
          if (!available.has(name)) {
            available.add(name);
          }
        }
        break;
      }
    }

    return available;
  }

  function collectLambdaCaptureNames(node, compileContext) {
    if (!compileContext || !compileContext.topLevelBindingNames) {
      return [];
    }

    const params = new Set(extractLambdaParameterNames(node));
    const captures = [];
    const seen = new Set();
    const bodyNode = extractLambdaBodyNode(node);
    const availableCaptureNames = collectAvailableLambdaCaptureNames(node, compileContext);

    function addCaptureName(name) {
      if (!name || seen.has(name) || params.has(name) || compileContext.localFunctionNames.has(name)) {
        return;
      }
      seen.add(name);
      captures.push(name);
    }

    function visit(current) {
      if (!current || current.kind !== 'nonterminal') {
        return;
      }

      if (current !== node && (current.name === 'arrowFunction' || current.name === 'asyncArrowFunction')) {
        return;
      }

      if (current.name === 'propertyName') {
        return;
      }

      if (current.name === 'bindingIdentifier') {
        return;
      }

      if (current.name === 'identifier') {
        const name = findFirstIdentifierValue(current);
        if (!name || seen.has(name) || params.has(name) || compileContext.localFunctionNames.has(name)) {
          return;
        }

        if (availableCaptureNames.has(name) || compileContext.topLevelBindingNames.has(name)) {
          addCaptureName(name);
        }
        return;
      }

      for (const child of (current.children || [])) {
        if (child && child.kind === 'nonterminal') {
          visit(child);
        }
      }
    }

    if (bodyNode) {
      visit(bodyNode);
    }

    return captures;
  }

  function getLambdaRuntimeHookName(arity, captureCount, isAsync) {
    const prefix = isAsync ? '__maia_async_lambda' : '__maia_lambda';
    if (captureCount > 0) {
      return `${prefix}${arity}_capture${captureCount}`;
    }
    return `${prefix}${arity}`;
  }

  function getLambdaRuntimeFunctionId(arity, captureCount, isAsync) {
    return (isAsync ? 1000000 : 0) + (arity * 1000) + captureCount;
  }

  function lowerArrowFunctionValue(arrowNode, isAsync = false, compileContext = null) {
    const expectedNodeName = isAsync ? 'asyncArrowFunction' : 'arrowFunction';
    if (!arrowNode || arrowNode.kind !== 'nonterminal' || arrowNode.name !== expectedNodeName) {
      reportUnsupportedLowering(
        compileContext,
        'arrow-function-unlowerable',
        `${expectedNodeName} node is missing, malformed, or unexpected kind`
      );
      if (compileContext && compileContext.strictLowering) {
        err(`unsupported lowering: ${expectedNodeName} node shape`);
      }
      return null;
    }

    const inlineSymbol = !isAsync && compileContext && compileContext.inlineFunctionExpressionSymbols
      ? compileContext.inlineFunctionExpressionSymbols.get(arrowNode)
      : null;
    if (inlineSymbol) {
      return inlineSymbol;
    }

    const params = extractLambdaParameterNames(arrowNode);
    const arity = params.length;
    const captures = collectLambdaCaptureNames(arrowNode, compileContext);
    const hookName = getLambdaRuntimeHookName(arity, captures.length, isAsync);
    let hookCall;
    if (captures.length > 0) {
      const captureArgs = captures.map((name) => `(int)(${lowerIdentifierValue(name, compileContext)})`).join(', ');
      hookCall = `${hookName}(${captureArgs})`;
    } else {
      hookCall = `${hookName}()`;
    }

    const closureScope = compileContext && compileContext.closurePlan && compileContext.closurePlan.scopesByNode
      ? compileContext.closurePlan.scopesByNode.get(arrowNode)
      : null;
    if (closureScope && closureScope.isClosure) {
      const { preLines, envExpr } = closures.emitClosureCaptureEnvCode(closureScope, null, compileContext);
      if (compileContext._deferClosureBindForVarDecl) {
        compileContext._pendingClosureBind = {
          fnId: closureScope.fnId,
          preLines,
          envExpr
        };
        return hookCall;
      }
      if (preLines.length > 0) {
        if (!Array.isArray(compileContext._preludeStatements)) {
          compileContext._preludeStatements = [];
        }
        compileContext._preludeStatements.push(...preLines);
      }
      return `__maia_closure_alloc_from_hook(${hookCall}, ${closureScope.fnId}, ${arity}, ${isAsync ? 1 : 0}, ${envExpr})`;
    }

    return hookCall;
  }

  function normalizeJsStringLiteralForCpp(raw) {
    if (typeof raw !== 'string' || raw.length < 2) {
      return null;
    }

    const quote = raw[0];
    if ((quote !== '"' && quote !== '\'') || raw[raw.length - 1] !== quote) {
      return null;
    }

    let decoded = '';
    for (let i = 1; i < raw.length - 1; i += 1) {
      const ch = raw[i];
      if (ch !== '\\') {
        decoded += ch;
        continue;
      }

      if (i + 1 >= raw.length - 1) {
        decoded += '\\';
        break;
      }

      const esc = raw[i + 1];
      i += 1;
      if (esc === 'n') { decoded += '\n'; continue; }
      if (esc === 'r') { decoded += '\r'; continue; }
      if (esc === 't') { decoded += '\t'; continue; }
      if (esc === 'b') { decoded += '\b'; continue; }
      if (esc === 'f') { decoded += '\f'; continue; }
      if (esc === 'v') { decoded += '\v'; continue; }
      if (esc === '0') { decoded += '\0'; continue; }
      if (esc === '\\') { decoded += '\\'; continue; }
      if (esc === '\'') { decoded += '\''; continue; }
      if (esc === '"') { decoded += '"'; continue; }
      if (esc === '`') { decoded += '`'; continue; }

      if (esc === 'x' && i + 2 < raw.length - 1) {
        const hex = raw.slice(i + 1, i + 3);
        const code = Number.parseInt(hex, 16);
        if (!Number.isNaN(code)) {
          decoded += String.fromCharCode(code);
          i += 2;
          continue;
        }
      }

      if (esc === 'u' && i + 4 < raw.length - 1) {
        const hex = raw.slice(i + 1, i + 5);
        const code = Number.parseInt(hex, 16);
        if (!Number.isNaN(code)) {
          decoded += String.fromCharCode(code);
          i += 4;
          continue;
        }
      }

      decoded += esc;
    }

    return staticStringLiteralCpp(decoded);
  }

  function lowerLiteralValue(node, compileContext) {
    if (!node || node.kind !== 'nonterminal' || node.name !== 'literal') {
      reportUnsupportedLowering(
        compileContext,
        'literal-expression-unlowerable',
        'literal node is missing, malformed, or unexpected kind'
      );
      if (compileContext && compileContext.strictLowering) {
        err('unsupported lowering: literal node shape');
      }
      return null;
    }

    for (const child of (node.children || [])) {
      if (child.kind === 'terminal' && (child.token === 'RegularExpressionLiteral' || String(child.value || '').startsWith('/'))) {
        const raw = String(child.value || '');
        const lastSlash = raw.lastIndexOf('/');
        const pattern = lastSlash > 0 ? raw.slice(1, lastSlash) : raw;
        const flags = lastSlash > 0 ? raw.slice(lastSlash + 1) : '';
        if (compileContext) compileContext.regexUsed = true;
        return `__maiaregex__new(${staticStringLiteralCpp(pattern)}, ${staticStringLiteralCpp(flags)})`;
      }
      if (child.kind !== 'nonterminal') { continue; }
      if (child.name === 'regularExpressionLiteral') {
        const t = (child.children || []).find((c) => c && c.kind === 'terminal');
        if (t) {
          const raw = String(t.value || '');
          const lastSlash = raw.lastIndexOf('/');
          const pattern = lastSlash > 0 ? raw.slice(1, lastSlash) : raw;
          const flags = lastSlash > 0 ? raw.slice(lastSlash + 1) : '';
          if (compileContext) compileContext.regexUsed = true;
          return `__maiaregex__new(${staticStringLiteralCpp(pattern)}, ${staticStringLiteralCpp(flags)})`;
        }
      }
      if (child.name === 'stringLiteral') {
        const t = (child.children || []).find((c) => c.kind === 'terminal' && c.token === 'StringLiteral');
        if (!t) {
          reportUnsupportedLowering(
            compileContext,
            'literal-expression-unlowerable',
            'string literal terminal token could not be resolved'
          );
          if (compileContext && compileContext.strictLowering) {
            err('unsupported lowering: string literal token');
          }
          return null;
        }
        return normalizeJsStringLiteralForCpp(t.value) || t.value;
      }
      if (child.name === 'numericLiteral') {
        const t = (child.children || []).find((c) => c.kind === 'terminal');
        if (!t) {
          reportUnsupportedLowering(
            compileContext,
            'literal-expression-unlowerable',
            'numeric literal terminal token could not be resolved'
          );
          if (compileContext && compileContext.strictLowering) {
            err('unsupported lowering: numeric literal token');
          }
          return null;
        }
        return t.value;
      }
      if (child.name === 'nullLiteral') { return '0'; }
      if (child.name === 'booleanLiteral') {
        const t = (child.children || []).find((c) => c.kind === 'terminal');
        if (!t) {
          reportUnsupportedLowering(
            compileContext,
            'literal-expression-unlowerable',
            'boolean literal terminal token could not be resolved'
          );
          if (compileContext && compileContext.strictLowering) {
            err('unsupported lowering: boolean literal token');
          }
          return null;
        }
        return t.value;
      }
      if (child.name === 'objectLiteral') {
        return lowerObjectLiteralValue(child, compileContext);
      }
      if (child.name === 'arrayLiteral') {
        return lowerArrayLiteralValue(child, compileContext);
      }
    }
    reportUnsupportedLowering(
      compileContext,
      'literal-expression-unlowerable',
      'literal expression could not be matched to a supported literal kind'
    );
    if (compileContext && compileContext.strictLowering) {
      err('unsupported lowering: literal expression');
    }
    return null;
  }


  return {
    collectConsoleConcatExpressionPieces,
    lowerConsoleConcatPieceAsCString,
    tryLowerConsoleLogConcatExpression,
    lowerRequiredExpressionValue,
    lowerConsoleLogArgumentExpression,
    lowerConsoleLogCallArguments,
    lowerConditionalExpressionValue,
    lowerMemberExpressionNewCallValue,
    extractObjectLiteralProperties,
    extractObjectLiteralOperations,
    lowerObjectLiteralValue,
    extractArrayLiteralElements,
    lowerAdvancedArrayLiteralValue,
    takePreludeStatements,
    beginDeferredPromiseQueueScope,
    enqueueDeferredPromiseStatement,
    takeDeferredPromiseStatements,
    resetStatementLoweringState,
    lowerArrayLiteralValue,
    extractLambdaParameterNames,
    extractLambdaParameterDefaultExpressions,
    extractLambdaBodyNode,
    collectAvailableLambdaCaptureNames,
    collectLambdaCaptureNames,
    getLambdaRuntimeHookName,
    getLambdaRuntimeFunctionId,
    lowerArrowFunctionValue,
    normalizeJsStringLiteralForCpp,
    lowerLiteralValue
  };
}

module.exports = { createLiteralLambdaLowering };
