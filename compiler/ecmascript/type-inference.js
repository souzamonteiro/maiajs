'use strict';

const {
  findFirstIdentifierValue,
  findFirstNonterminal,
  findFirstTerminalByToken,
  findNodePath,
  hasNonterminal,
  walk
} = require('./ast-utils');

function createTypeInference(deps) {
  const {
    EXPR_PASSTHROUGH_NODES,
    INFIX_EXPRESSION_NODES,
    INT_ONLY_INFIX_OPERATORS,
    collectTopLevelArrowFunctionBindings,
    collectTopLevelAssignedFunctionExpressionBindings,
    collectTopLevelCallArgumentFunctionExpressionBindings,
    collectTopLevelFunctionDeclarations,
    collectTopLevelFunctionExpressionBindings,
    collectTopLevelObjectLiteralFunctionExpressionBindings,
    collectTopLevelObjectLiteralPropertyTypeInfo,
    extractCallExpressionMemberAndArgs,
    extractCallableReturnExpressionNode,
    extractFunctionDeclarationName,
    extractObjectLiteralProperties,
    extractOutermostCallMemberExpression,
    extractPathFromMemberExpression,
    extractVariableDeclarationInitializer,
    extractVariableDeclarationName,
    extractVariableDeclarations,
    findBoundClassInstanceTypeAtNode,
    findBoundVariableInitializerExpressionAtNode,
    findEnclosingCallableNode,
    findPrototypeMethodSymbolForInstanceType,
    inferConstObjectLiteralPropertyTypeAtNode,
    isIdentifierBoundAtNode,
    lowerExpressionValue,
    lowerIdentifierValue,
    lowerMemberExpressionNewCallValue,
    mapInfixOperator,
    resolveStaticModelFromExpression,
    unwrapDirectIdentifierExpression
  } = deps;

  function inferExprType(node, compileContext = null) {
    if (!node || node.kind !== 'nonterminal') { return 'any'; }
    if (compileContext) {
      if (!compileContext._inferExprTypeCache) compileContext._inferExprTypeCache = new WeakMap();
      if (!compileContext._inferExprTypeActive) compileContext._inferExprTypeActive = new WeakSet();
      if (compileContext._inferExprTypeCache.has(node)) return compileContext._inferExprTypeCache.get(node);
      if (compileContext._inferExprTypeActive.has(node)) return 'any';
      compileContext._inferExprTypeActive.add(node);
    }
    try {
      const result = _inferExprTypeUncached(node, compileContext);
      if (compileContext && compileContext._inferExprTypeCache) {
        compileContext._inferExprTypeCache.set(node, result);
      }
      return result;
    } finally {
      if (compileContext && compileContext._inferExprTypeActive) {
        compileContext._inferExprTypeActive.delete(node);
      }
    }
  }

  function _inferExprTypeUncached(node, compileContext = null) {
    if (!node || node.kind !== 'nonterminal') { return 'any'; }
    const staticModel = compileContext
      ? resolveStaticModelFromExpression(node, node, compileContext)
      : null;
    if (staticModel) {
      if (staticModel.kind === 'string') { return 'string'; }
      if (staticModel.kind === 'number') { return 'number'; }
      if (staticModel.kind === 'bool') { return 'bool'; }
      if (staticModel.kind === 'array') { return 'array'; }
      if (staticModel.kind === 'object' || staticModel.kind === 'catch-param') { return 'object'; }
    }
    if (node.name === 'identifier') {
      const identifierValue = findFirstIdentifierValue(node);
      if (identifierValue && compileContext && compileContext.tree && compileContext.callableParameterTypesByNode) {
        const path = findNodePath(compileContext.tree, node);
        for (let i = path.length - 2; i >= 0; i -= 1) {
          const ancestor = path[i];
          if (!ancestor || ancestor.kind !== 'nonterminal') {
            continue;
          }

          let callableNode = null;
          if (ancestor.name === 'functionDeclaration' || ancestor.name === 'functionExpression'
            || ancestor.name === 'arrowFunction' || ancestor.name === 'asyncArrowFunction') {
            callableNode = ancestor;
          }
          if (!callableNode) {
            continue;
          }

          const paramTypes = compileContext.callableParameterTypesByNode.get(callableNode);
          const cppType = paramTypes ? paramTypes.get(identifierValue) : null;
          if (cppType === 'const char*') { return 'string'; }
          if (cppType === 'double' || cppType === 'int') { return 'number'; }
          if (cppType === 'void*') { return 'object'; }
          break;
        }
      }
      if (compileContext) {
        const initializerExpr = findBoundVariableInitializerExpressionAtNode(identifierValue, node, compileContext);
        if (initializerExpr && initializerExpr !== node) {
          return inferExprType(initializerExpr, compileContext);
        }
      }
    }
    if (node.name === 'arrowFunction' || node.name === 'asyncArrowFunction') {
      return 'function';
    }
    if (node.name === 'conditionalExpression' || node.name === 'conditionalExpressionNoIn') {
      const children = node.children || [];
      const hasTernary = children.some((child) => child && child.kind === 'terminal' && child.value === '?');
      if (!hasTernary) {
        const ntc = children.filter((child) => child && child.kind === 'nonterminal');
        return ntc.length === 1 ? inferExprType(ntc[0], compileContext) : 'any';
      }

      const branchTypes = children
        .filter((child) => child && child.kind === 'nonterminal' && child.name === 'assignmentExpression')
        .map((child) => inferExprType(child, compileContext));
      return branchTypes.every((type) => type === 'number' || type === 'bool') ? 'number' : 'any';
    }
    if (INFIX_EXPRESSION_NODES.has(node.name) || node.name === 'unaryExpression' || node.name === 'postfixExpression') {
      if (INFIX_EXPRESSION_NODES.has(node.name)) {
        const operatorTokens = (node.children || [])
          .filter((child) => child && child.kind === 'terminal')
          .map((child) => mapInfixOperator(String(child.value || '').trim()))
          .filter(Boolean);
        if (operatorTokens.includes('instanceof')) {
          return 'bool';
        }
        if (operatorTokens.some((token) => ['==', '!=', '<', '<=', '>', '>='].includes(token))) {
          return 'bool';
        }
        if (operatorTokens.some((token) => INT_ONLY_INFIX_OPERATORS.has(token))) {
          return 'number';
        }
      }

      const loweredKinds = (node.children || []).filter((child) => child && child.kind === 'nonterminal');
      const childTypes = loweredKinds.map((child) => inferExprType(child, compileContext));
      if (childTypes.some((type) => type === 'string')) {
        return 'string';
      }
      if (childTypes.every((type) => type === 'number' || type === 'bool')) {
        return 'number';
      }
    }
    if (node.name === 'exponentiationExpression' || node.name === 'exponentiationExpressionNoIn') {
      const childTypes = (node.children || [])
        .filter((child) => child && child.kind === 'nonterminal')
        .map((child) => inferExprType(child, compileContext));
      if (childTypes.some((type) => type === 'string')) {
        return 'string';
      }
      if (childTypes.every((type) => type === 'number' || type === 'bool')) {
        return 'number';
      }
    }
    if (node.name === 'memberExpression' || node.name === 'memberExpressionNoIn') {
      const memberChildren = node.children || [];
      const directPropertyIndex = memberChildren.findIndex(
        (child) => child && child.kind === 'terminal' && child.value === '.'
      );
      const baseExpressionNode = directPropertyIndex > 0 ? memberChildren[0] : null;
      const baseBindingName = baseExpressionNode ? findFirstIdentifierValue(baseExpressionNode) : null;
      if (baseBindingName && findBoundClassInstanceTypeAtNode(baseBindingName, node, compileContext)) {
        return 'number';
      }
    }
    if (EXPR_PASSTHROUGH_NODES.has(node.name)) {
      const ntc = (node.children || []).filter((c) => c.kind === 'nonterminal');
      return ntc.length === 1 ? inferExprType(ntc[0], compileContext) : 'any';
    }
    if (node.name === 'callExpression') {
      const { memberExprNode, argExprs } = extractCallExpressionMemberAndArgs(node);
      const pathSegments = memberExprNode ? extractPathFromMemberExpression(memberExprNode) : null;
      const memberChildren = memberExprNode ? (memberExprNode.children || []) : [];
      const directPropertyIndex = memberChildren.findIndex((child) => child && child.kind === 'terminal' && child.value === '.');
      const directPropertyNode = directPropertyIndex >= 0 ? memberChildren[directPropertyIndex + 1] : null;
      const directPropertyName = directPropertyNode ? findFirstIdentifierValue(directPropertyNode) : null;
      if (directPropertyName === 'padStart' || directPropertyName === 'padEnd' || directPropertyName === 'join' || directPropertyName === 'slice' || directPropertyName === 'substring' || directPropertyName === 'replace' || directPropertyName === 'trim') {
        return 'string';
      }
      if (Array.isArray(pathSegments)) {
        const fullPath = pathSegments.join('.');
        if (fullPath === 'JSON.stringify' || fullPath === 'String' || fullPath === 'String.fromCharCode') return 'string';
        if (fullPath === 'Math.min' || fullPath === 'Math.max' || fullPath === 'Number') return 'number';
        if (fullPath === 'Array.isArray' || fullPath === 'Number.isInteger' || fullPath === 'Object.prototype.hasOwnProperty.call') return 'bool';
      }
      if (Array.isArray(pathSegments) && pathSegments.join('.') === 'Array.prototype.slice.call') {
        return 'array';
      }
      if (Array.isArray(pathSegments) && pathSegments.length === 2
        && !['console', 'Math', 'Object', 'Reflect', 'Promise', 'Atomics', 'Array', 'JSON', 'String', 'Number', 'this'].includes(pathSegments[0])
        && compileContext && !isIdentifierBoundAtNode(pathSegments[0], node, compileContext)) {
        return 'number';
      }
      if (directPropertyName === 'includes' || directPropertyName === 'has' || directPropertyName === 'test') {
        return 'bool';
      }
      if (directPropertyName === 'map' || directPropertyName === 'filter' || directPropertyName === 'match') {
        return 'array';
      }
      if (directPropertyName === 'reduce' || directPropertyName === 'reduceRight') {
        if (argExprs.length >= 2) {
          return inferExprType(argExprs[1], compileContext);
        }
        return 'any';
      }
      if (directPropertyName === 'indexOf' || directPropertyName === 'lastIndexOf' || directPropertyName === 'findIndex') {
        return 'number';
      }
      if (Array.isArray(pathSegments) && pathSegments.length === 1 && compileContext) {
        const calleeName = pathSegments[0];
        const returnTypeCpp = compileContext.functionReturnTypes && compileContext.functionReturnTypes.get(calleeName);
        if (returnTypeCpp === 'const char*') { return 'string'; }
        if (returnTypeCpp === 'double' || returnTypeCpp === 'int') { return 'number'; }
        if (returnTypeCpp === 'void*') { return 'object'; }
        if (isIdentifierBoundAtNode(calleeName, node, compileContext)) { return 'number'; }
      }

      if (Array.isArray(pathSegments) && pathSegments.length === 2 && compileContext && compileContext.topLevelAssignedFunctionExpressionSymbols) {
        const directAssignedSymbol = compileContext.topLevelAssignedFunctionExpressionSymbols.get(pathSegments.join('.'));
        const directAssignedReturnType = directAssignedSymbol
          ? compileContext.functionReturnTypes && compileContext.functionReturnTypes.get(directAssignedSymbol)
          : null;
        if (directAssignedReturnType === 'const char*') { return 'string'; }
        if (directAssignedReturnType === 'double' || directAssignedReturnType === 'int') { return 'number'; }
        if (directAssignedReturnType === 'void*') { return 'object'; }
      }

      if (Array.isArray(pathSegments) && pathSegments.length >= 2 && compileContext && isIdentifierBoundAtNode(pathSegments[0], node, compileContext)) {
          const instanceType = findBoundClassInstanceTypeAtNode(pathSegments[0], node, compileContext);
        const prototypeMethodSymbol = findPrototypeMethodSymbolForInstanceType(
          instanceType,
          pathSegments[pathSegments.length - 1],
          compileContext
        );
        const prototypeReturnType = prototypeMethodSymbol
          ? (compileContext.functionReturnTypes && compileContext.functionReturnTypes.get(prototypeMethodSymbol))
          : null;
        if (prototypeReturnType === 'const char*') { return 'string'; }
        if (prototypeReturnType === 'double' || prototypeReturnType === 'int') { return 'number'; }
        if (prototypeReturnType === 'void*') { return 'object'; }
        return 'number';
      }
    }
    if (node.name === 'memberExpression') {
      const staticModel = resolveStaticModelFromExpression(node, node, compileContext);
      if (staticModel) {
        if (staticModel.kind === 'string') { return 'string'; }
        if (staticModel.kind === 'number') { return 'number'; }
        if (staticModel.kind === 'bool') { return 'bool'; }
        if (staticModel.kind === 'array') { return 'array'; }
        if (staticModel.kind === 'object' || staticModel.kind === 'catch-param') { return 'object'; }
      }

      const memberChildren = node.children || [];
      const directPropertyIndex = memberChildren.findIndex((child) => child && child.kind === 'terminal' && child.value === '.');
      const directPropertyNode = directPropertyIndex >= 0 ? memberChildren[directPropertyIndex + 1] : null;
      const directPropertyName = directPropertyNode ? findFirstIdentifierValue(directPropertyNode) : null;
      const baseExpressionNode = directPropertyIndex > 0 ? memberChildren[0] : null;
      if (directPropertyName === 'length') {
        return 'number';
      }
      if (directPropertyName === 'message') {
        return 'string';
      }
      if (baseExpressionNode && directPropertyName) {
        const baseIsThis = Boolean(findFirstTerminalByToken(baseExpressionNode, 'TOKEN_this'));
        if (baseIsThis && compileContext && compileContext.objectLiteralPropertyTypesByFunctionNode) {
          const enclosingCallableNode = findEnclosingCallableNode(node, compileContext);
          const propertyTypes = enclosingCallableNode
            ? compileContext.objectLiteralPropertyTypesByFunctionNode.get(enclosingCallableNode)
            : null;
          const propertyType = propertyTypes ? propertyTypes.get(directPropertyName) : null;
          if (propertyType) {
            return propertyType;
          }
        }

        const basePath = baseExpressionNode && baseExpressionNode.name === 'memberExpression'
          ? extractPathFromMemberExpression(baseExpressionNode, null)
          : null;
        const baseBindingName = Array.isArray(basePath) && basePath.length === 1
          ? basePath[0]
          : findFirstIdentifierValue(baseExpressionNode);
        if (baseBindingName) {
          const instanceType = findBoundClassInstanceTypeAtNode(baseBindingName, node, compileContext);
          if (instanceType) {
            // Class fields emitted by the current C++98 class wrapper are int.
            // Method calls use the callExpression branch above, so a direct
            // instance property access can safely retain numeric formatting.
            return 'number';
          }
          const propertyType = inferConstObjectLiteralPropertyTypeAtNode(
            baseBindingName,
            directPropertyName,
            node,
            compileContext
          );
          if (propertyType) {
            return propertyType;
          }
        }
      }
    }
    if (node.name === 'identifierReference') { return lowerIdentifierValue(findFirstIdentifierValue(node), compileContext); }
    if (node.name === 'primaryExpression') {
      const thisToken = (node.children || []).find((c) => c && c.kind === 'terminal' && c.token === 'TOKEN_this');
      if (thisToken) {
        return 'object';
      }
      const litChild = (node.children || []).find((c) => c.kind === 'nonterminal' && c.name === 'literal');
      if (litChild) {
        return inferExprType(litChild, compileContext);
      }
      const objectChild = (node.children || []).find((c) => c.kind === 'nonterminal' && c.name === 'objectLiteral');
      if (objectChild) {
        return 'object';
      }
      const arrayChild = (node.children || []).find((c) => c.kind === 'nonterminal' && c.name === 'arrayLiteral');
      if (arrayChild) {
        return 'array';
      }
      const directChildren = (node.children || []).filter((c) => c && c.kind === 'nonterminal');
      if (directChildren.length === 1) {
        return inferExprType(directChildren[0], compileContext);
      }
      return 'any';
    }
    if (node.name === 'templateLiteral') { return 'string'; }
    if (node.name === 'literal') {
      for (const child of (node.children || [])) {
        if (child.kind !== 'nonterminal') { continue; }
        if (child.name === 'stringLiteral') { return 'string'; }
        if (child.name === 'numericLiteral') { return 'number'; }
        if (child.name === 'booleanLiteral') { return 'bool'; }
        if (child.name === 'nullLiteral') { return 'null'; }
        if (child.name === 'objectLiteral') { return 'object'; }
        if (child.name === 'arrayLiteral') { return 'array'; }
      }
    }
    return 'any';
  }

  function inferPreciseCppTypeFromExpression(expressionNode, compileContext = null, localBindingCppTypes = new Map()) {
    if (!expressionNode || expressionNode.kind !== 'nonterminal') {
      return null;
    }

    const staticModel = compileContext
      ? resolveStaticModelFromExpression(expressionNode, expressionNode, compileContext)
      : null;
    if (staticModel) {
      if (staticModel.kind === 'string') { return 'const char*'; }
      if (staticModel.kind === 'bool') { return 'int'; }
      if (staticModel.kind === 'null' || staticModel.kind === 'object' || staticModel.kind === 'array' || staticModel.kind === 'catch-param') {
        return 'void*';
      }
      if (staticModel.kind === 'number') {
        return Number.isInteger(Number(staticModel.value)) ? 'int' : 'double';
      }
    }

    if (hasNonterminal(expressionNode, 'stringLiteral')) {
      return 'const char*';
    }
    if (hasNonterminal(expressionNode, 'nullLiteral')) {
      return 'void*';
    }
    if (hasNonterminal(expressionNode, 'booleanLiteral')) {
      return 'int';
    }
    if (hasNonterminal(expressionNode, 'numericLiteral')) {
      const decimalToken = findFirstTerminalByToken(expressionNode, 'DecimalLiteral');
      return decimalToken && /[.eE]/.test(String(decimalToken.value || '')) ? 'double' : 'int';
    }

    const directIdentifierNode = unwrapDirectIdentifierExpression(expressionNode);
    const directIdentifierName = directIdentifierNode ? findFirstIdentifierValue(directIdentifierNode) : null;
    if (directIdentifierName && localBindingCppTypes.has(directIdentifierName)) {
      return localBindingCppTypes.get(directIdentifierName);
    }
    if (directIdentifierName && compileContext && compileContext.tree && compileContext.callableParameterTypesByNode) {
      const path = findNodePath(compileContext.tree, directIdentifierNode);
      for (let i = path.length - 2; i >= 0; i -= 1) {
        const ancestor = path[i];
        if (!ancestor || ancestor.kind !== 'nonterminal') {
          continue;
        }
        if (ancestor.name !== 'functionDeclaration'
          && ancestor.name !== 'functionExpression'
          && ancestor.name !== 'arrowFunction'
          && ancestor.name !== 'asyncArrowFunction') {
          continue;
        }
        const paramTypes = compileContext.callableParameterTypesByNode.get(ancestor);
        const cppType = paramTypes ? paramTypes.get(directIdentifierName) : null;
        if (cppType) {
          return cppType;
        }
        break;
      }
    }

    const callExpressionNode = expressionNode.name === 'callExpression'
      ? expressionNode
      : findFirstNonterminal(expressionNode, 'callExpression');
    if (callExpressionNode) {
      const memberExpressionNode = extractOutermostCallMemberExpression(callExpressionNode);
      const pathSegments = memberExpressionNode ? extractPathFromMemberExpression(memberExpressionNode, null) : null;
      if (Array.isArray(pathSegments) && pathSegments.length === 1 && compileContext && compileContext.functionReturnTypes) {
        const returnType = compileContext.functionReturnTypes.get(pathSegments[0]);
        if (returnType) {
          return returnType;
        }
      }
      if (Array.isArray(pathSegments) && pathSegments.join('.') === 'Array.prototype.slice.call') {
        return 'void*';
      }
      if (Array.isArray(pathSegments) && pathSegments.length === 2
        && !['console', 'Math', 'Object', 'Reflect', 'Promise', 'Atomics', 'Array', 'JSON', 'String', 'Number'].includes(pathSegments[0])
        && compileContext && !isIdentifierBoundAtNode(pathSegments[0], callExpressionNode, compileContext)) {
        return 'int';
      }
    }

    const nonterminalChildren = (expressionNode.children || []).filter((child) => child && child.kind === 'nonterminal');
    if (nonterminalChildren.length > 0) {
      const childTypes = nonterminalChildren
        .map((child) => inferPreciseCppTypeFromExpression(child, compileContext, localBindingCppTypes))
        .filter(Boolean);
      if (childTypes.includes('const char*')) {
        return 'const char*';
      }
      if (childTypes.includes('void*')) {
        return 'void*';
      }
      if (childTypes.includes('double')) {
        return 'double';
      }
      if (childTypes.length > 0 && childTypes.every((type) => type === 'int')) {
        return 'int';
      }
    }

    const inferredExprType = inferExprType(expressionNode, compileContext);
    if (inferredExprType === 'string') { return 'const char*'; }
    if (inferredExprType === 'bool') { return 'int'; }
    if (inferredExprType === 'number') { return 'double'; }
    if (inferredExprType === 'object' || inferredExprType === 'array' || inferredExprType === 'function' || inferredExprType === 'null') {
      return 'void*';
    }
    return null;
  }

  function cppArgType(jsType) {
    const typeMap = { string: 'const char*', number: 'double', int: 'int', bool: 'int', null: 'void*', object: 'void*', array: 'void*', function: 'void*' };
    return typeMap[jsType] || 'void*';
  }

  function inferDirectNewClassCppType(node, compileContext) {
    if (!compileContext || !compileContext.topLevelClassNames) {
      return null;
    }

    let current = node;
    while (current && current.kind === 'nonterminal' && EXPR_PASSTHROUGH_NODES.has(current.name)) {
      const ntc = (current.children || []).filter((child) => child && child.kind === 'nonterminal');
      if (ntc.length !== 1) {
        break;
      }
      current = ntc[0];
    }

    if (!current || current.kind !== 'nonterminal' || current.name !== 'memberExpression') {
      return null;
    }

    const loweredNewCall = lowerMemberExpressionNewCallValue(current, compileContext);
    if (!loweredNewCall || !/^new\s+[A-Za-z_][A-Za-z0-9_]*\(/.test(loweredNewCall)) {
      return null;
    }

    const match = loweredNewCall.match(/^new\s+([A-Za-z_][A-Za-z0-9_]*)\(/);
    return match ? `${match[1]}*` : null;
  }

  function inferInitializerCppType(initializerExpr, compileContext) {
    const classPtrType = inferDirectNewClassCppType(initializerExpr, compileContext);
    if (classPtrType) {
      return classPtrType;
    }

    // Bitwise/shift expressions must be materialized as integers in C++98.
    let normalizedExpr = initializerExpr;
    while (normalizedExpr && normalizedExpr.kind === 'nonterminal' && EXPR_PASSTHROUGH_NODES.has(normalizedExpr.name)) {
      const ntc = (normalizedExpr.children || []).filter((child) => child && child.kind === 'nonterminal');
      if (ntc.length !== 1) {
        break;
      }
      normalizedExpr = ntc[0];
    }
    if (normalizedExpr && normalizedExpr.kind === 'nonterminal' && INFIX_EXPRESSION_NODES.has(normalizedExpr.name)) {
      const operatorTokens = (normalizedExpr.children || [])
        .filter((child) => child && child.kind === 'terminal')
        .map((child) => String(child.value || '').trim())
        .filter(Boolean);
      if (operatorTokens.some((token) => INT_ONLY_INFIX_OPERATORS.has(mapInfixOperator(token)))) {
        return 'int';
      }
    }

    const inferredType = initializerExpr ? inferExprType(initializerExpr, compileContext) : 'any';
    if (inferredType === 'any' && initializerExpr) {
      const loweredExpr = lowerExpressionValue(initializerExpr, compileContext);
      if (loweredExpr && /^"(?:[^"\\]|\\.)*"$/.test(loweredExpr)) {
        return 'const char*';
      }
      if (loweredExpr && /^(?:true|false)$/.test(loweredExpr)) {
        return 'int';
      }
      if (loweredExpr && /^-?\d+(?:\.\d+)?$/.test(loweredExpr)) {
        return loweredExpr.includes('.') ? 'double' : 'int';
      }
    }
    return cppArgType(inferredType);
  }

  function defaultCppValue(cppType) {
    if (cppType === 'const char*') {
      return '""';
    }
    if (cppType === 'double') {
      return '0.0';
    }
    if (cppType === 'int') {
      return '0';
    }
    return '0';
  }

  function castReturnExpression(expression, returnTypeCpp) {
    if (returnTypeCpp === 'double') {
      return `(double)(${expression})`;
    }
    if (returnTypeCpp === 'const char*') {
      return `(const char*)(${expression})`;
    }
    if (returnTypeCpp === 'void*') {
      return `(void*)(${expression})`;
    }
    return `(int)(${expression})`;
  }

  function isStringLikeLoweredReturnExpression(expr) {
    if (typeof expr !== 'string' || !expr.trim()) {
      return false;
    }

    const normalizedExpr = expr.replace(/\((?:const\s+char\s*\*|char\s*\*|void\s*\*|double|int)\)/g, '');

    if (normalizedExpr.includes('__maia_console_concat2(') || normalizedExpr.includes('(const char*)')) {
      return true;
    }

    const strippedLogicalOr = normalizedExpr.replace(/\|\|/g, '');
    const readsPropertyLikeValue = normalizedExpr.includes('__maia_runtime_value_get_property(')
      || /(?:\bthis\b|\bself\b)(?:->|\.)[A-Za-z_][A-Za-z0-9_]*/.test(normalizedExpr);
    if (!readsPropertyLikeValue) {
      return false;
    }

    const operatorNormalized = strippedLogicalOr
      .replace(/->/g, '')
      .replace(/\./g, '');
    if (/[+\-*\/%<>=&^]/.test(operatorNormalized)) {
      return false;
    }

    if (/\b\d+(?:\.\d+)?\b/.test(normalizedExpr)) {
      return false;
    }

    return true;
  }

  function buildFlattenedWeakMapPropertyWrites(hiddenKey, loweredKeyExpr, objectLiteralNode, compileContext) {
    if (!hiddenKey || !loweredKeyExpr || !objectLiteralNode) {
      return [];
    }

    const flattenedWrites = [];
    for (const property of extractObjectLiteralProperties(objectLiteralNode)) {
      const loweredPropertyValue = lowerExpressionValue(property.valueExprNode, compileContext);
      if (loweredPropertyValue === null) {
        continue;
      }
      flattenedWrites.push(
        `__Reflect((void*)(${loweredKeyExpr}), ${JSON.stringify(`${hiddenKey}__${property.key}`)}, (long)(${loweredPropertyValue}))`
      );
    }
    return flattenedWrites;
  }

  function collectFunctionBodyStatementNodes(functionNode) {
    let functionBody = (functionNode && functionNode.children) ? (functionNode.children || []).find(
      (child) => child && child.kind === 'nonterminal' && (child.name === 'functionBody' || child.name === 'asyncFunctionBody' || child.name === 'generatorBody')
    ) : null;
    if (!functionBody && functionNode && functionNode.children) {
      const arrowBody = (functionNode.children || []).find(
        (child) => child && child.kind === 'nonterminal' && child.name === 'arrowFunctionBody'
      );
      if (arrowBody && arrowBody.children) {
        functionBody = arrowBody.children.find(
          (child) => child && child.kind === 'nonterminal' && (child.name === 'functionBody' || child.name === 'asyncFunctionBody')
        ) || null;
      }
    }
    if (functionBody && (functionBody.name === 'asyncFunctionBody' || functionBody.name === 'generatorBody') && functionBody.children) {
      functionBody = functionBody.children.find(
        (child) => child && child.kind === 'nonterminal' && child.name === 'functionBody'
      ) || functionBody;
    }

    return (functionBody && functionBody.children
      ? functionBody.children
          .filter((child) => child && child.kind === 'nonterminal' && child.name === 'sourceElement')
          .map((sourceElement) => (sourceElement.children || []).find(
            (child) => child && child.kind === 'nonterminal' && child.name === 'statement'
          ))
          .filter(Boolean)
      : []);
  }

  function collectReturnExpressionNodesFromStatement(statementNode, out = []) {
    if (!statementNode || statementNode.kind !== 'nonterminal' || statementNode.name !== 'statement') {
      return out;
    }

    const returnStmtNode = (statementNode.children || []).find(
      (child) => child && child.kind === 'nonterminal' && child.name === 'returnStatement'
    );
    if (returnStmtNode) {
      const returnExpr = (returnStmtNode.children || []).find(
        (child) => child && child.kind === 'nonterminal' && child.name === 'expression'
      );
      if (returnExpr) {
        out.push(returnExpr);
      }
      return out;
    }

    const ifStmtNode = (statementNode.children || []).find(
      (child) => child && child.kind === 'nonterminal' && child.name === 'ifStatement'
    );
    if (ifStmtNode) {
      const nestedStatements = (ifStmtNode.children || []).filter(
        (child) => child && child.kind === 'nonterminal' && child.name === 'statement'
      );
      for (const nested of nestedStatements) {
        collectReturnExpressionNodesFromStatement(nested, out);
      }
      return out;
    }

    const blockNode = (statementNode.children || []).find(
      (child) => child && child.kind === 'nonterminal' && child.name === 'block'
    );
    if (blockNode) {
      const nestedStatements = (blockNode.children || []).filter(
        (child) => child && child.kind === 'nonterminal' && child.name === 'statement'
      );
      for (const nested of nestedStatements) {
        collectReturnExpressionNodesFromStatement(nested, out);
      }
      }

      // while / do-while / for / for-in — descend into body statement(s)
      const iterationNode = (statementNode.children || []).find(
        (child) => child && child.kind === 'nonterminal' && child.name === 'iterationStatement'
      );
      if (iterationNode) {
        const bodyStatements = (iterationNode.children || []).filter(
          (child) => child && child.kind === 'nonterminal' && child.name === 'statement'
        );
        for (const nested of bodyStatements) {
          collectReturnExpressionNodesFromStatement(nested, out);
        }
      }

      return out;
    }

    function mergeReturnCppTypes(cppTypes) {
      if (!cppTypes || cppTypes.length === 0) {
        return 'int';
      }

      const uniqueTypes = new Set(cppTypes);
      if (uniqueTypes.size === 1) {
        return cppTypes[0];
      }

      if (uniqueTypes.has('void*')) {
        return 'void*';
      }

      if (uniqueTypes.has('const char*')) {
        return 'void*';
      }

      if (uniqueTypes.has('double')) {
        return 'double';
      }

      return 'int';
    }




  function inferReturnExpressionCppType(expressionNode, returnTypeMap = new Map(), localBindingCppTypes = new Map(), analysisContext = null) {
    if (!expressionNode || expressionNode.kind !== 'nonterminal') {
      return 'int';
    }

    const analysisCompileContext = analysisContext && analysisContext.tree
      ? {
        tree: analysisContext.tree,
        strictLowering: false,
        loweringWarnings: [],
        loweringWarningKeys: new Set(),
        functionReturnTypes: returnTypeMap,
        objectLiteralPropertyTypesByFunctionNode: analysisContext.objectLiteralPropertyTypesByFunctionNode || null,
        callableParameterTypesByNode: analysisContext.callableParameterTypesByNode || null,
        _visibleVariableBindingsCache: analysisContext._visibleVariableBindingsCache || null,
        _staticModelCache: analysisContext._staticModelCache || null,
        _staticModelNullSentinel: analysisContext._staticModelNullSentinel || null,
        _inferExprTypeCache: analysisContext._inferExprTypeCache || null,
        _inferExprTypeActive: analysisContext._inferExprTypeActive || null
      }
      : null;

    let loweredExprForTypeHint = null;
    const isSmallExprForHint = (() => {
      let count = 0;
      const stack = [expressionNode];
      while (stack.length > 0) {
        const cur = stack.pop();
        if (!cur) continue;
        count += 1;
        if (count > 80) return false;
        if (cur.children) {
          for (let ci = 0; ci < cur.children.length; ci += 1) stack.push(cur.children[ci]);
        }
      }
      return true;
    })();

    const nestedLogicalNode = expressionNode.name === 'logicalORExpression' || expressionNode.name === 'logicalANDExpression'
      ? expressionNode
      : (findFirstNonterminal(expressionNode, 'logicalORExpression') || findFirstNonterminal(expressionNode, 'logicalANDExpression'));
    const logicalOperatorTokens = ((nestedLogicalNode && nestedLogicalNode.children) || [])
      .filter((child) => child && child.kind === 'terminal')
      .map((child) => String(child.value || '').trim())
      .filter((token) => token === '||' || token === '&&');
    if (logicalOperatorTokens.length > 0 && analysisCompileContext && isSmallExprForHint) {
      const logicalOperands = ((nestedLogicalNode && nestedLogicalNode.children) || []).filter(
        (child) => child && child.kind === 'nonterminal'
      );
      const loweredOperands = logicalOperands.map((operandNode) => {
        try {
          return lowerExpressionValue(operandNode, analysisCompileContext);
        } catch (_) {
          return null;
        }
      });
      if (loweredOperands.length >= 2 && loweredOperands.every((expr) => isStringLikeLoweredReturnExpression(expr))) {
        return 'const char*';
      }
    }

    const directIdentifierNode = unwrapDirectIdentifierExpression(expressionNode);
    const directIdentifierName = directIdentifierNode ? findFirstIdentifierValue(directIdentifierNode) : null;
    if (directIdentifierName && localBindingCppTypes.has(directIdentifierName)) {
      return localBindingCppTypes.get(directIdentifierName);
    }

    const preciseCppType = inferPreciseCppTypeFromExpression(
      expressionNode,
      analysisCompileContext || {
        tree: analysisContext && analysisContext.tree ? analysisContext.tree : null,
        functionReturnTypes: returnTypeMap,
        objectLiteralPropertyTypesByFunctionNode: analysisContext && analysisContext.objectLiteralPropertyTypesByFunctionNode
          ? analysisContext.objectLiteralPropertyTypesByFunctionNode
          : null,
        callableParameterTypesByNode: analysisContext && analysisContext.callableParameterTypesByNode
          ? analysisContext.callableParameterTypesByNode
          : null
      },
      localBindingCppTypes
    );
    if (preciseCppType) {
      return preciseCppType;
    }

    const inferredExprType = inferExprType(expressionNode, analysisCompileContext || {
        tree: analysisContext && analysisContext.tree ? analysisContext.tree : null,
        functionReturnTypes: returnTypeMap,
        objectLiteralPropertyTypesByFunctionNode: analysisContext && analysisContext.objectLiteralPropertyTypesByFunctionNode
          ? analysisContext.objectLiteralPropertyTypesByFunctionNode
          : null
      });
    if (inferredExprType === 'string') {
      return 'const char*';
    }
    if (inferredExprType === 'number') {
      return 'double';
    }
    if (inferredExprType === 'bool') {
      return 'int';
    }
    if (inferredExprType === 'object' || inferredExprType === 'array' || inferredExprType === 'function') {
      return 'void*';
    }

    if (analysisContext && analysisContext.tree && inferredExprType === 'any') {
      if (loweredExprForTypeHint === null && analysisCompileContext && isSmallExprForHint) {
        try {
          loweredExprForTypeHint = lowerExpressionValue(expressionNode, analysisCompileContext);
        } catch (_) {
          loweredExprForTypeHint = null;
        }
      }
      const loweredExpr = loweredExprForTypeHint;
      if (isStringLikeLoweredReturnExpression(loweredExpr)) {
        return 'const char*';
      }
    }

    if (analysisContext
      && analysisContext.currentFunctionNode
      && analysisContext.objectLiteralPropertyTypesByFunctionNode
      && analysisContext.objectLiteralPropertyTypesByFunctionNode.has(analysisContext.currentFunctionNode)) {
      const propertyTypes = analysisContext.objectLiteralPropertyTypesByFunctionNode.get(analysisContext.currentFunctionNode);
      let readsKnownStringProperty = false;
      walk(expressionNode, (node) => {
        if (readsKnownStringProperty || !node || node.kind !== 'nonterminal' || node.name !== 'memberExpression') {
          return;
        }
        const memberChildren = node.children || [];
        const directPropertyIndex = memberChildren.findIndex((child) => child && child.kind === 'terminal' && child.value === '.');
        const directPropertyNode = directPropertyIndex >= 0 ? memberChildren[directPropertyIndex + 1] : null;
        const directPropertyName = directPropertyNode ? findFirstIdentifierValue(directPropertyNode) : null;
        const baseExpressionNode = directPropertyIndex > 0 ? memberChildren[0] : null;
        const baseIsThis = Boolean(baseExpressionNode && findFirstTerminalByToken(baseExpressionNode, 'TOKEN_this'));
        if (baseIsThis && directPropertyName && propertyTypes && propertyTypes.get(directPropertyName) === 'string') {
          readsKnownStringProperty = true;
        }
      });
      if (readsKnownStringProperty) {
        return 'const char*';
      }
    }

    if (hasNonterminal(expressionNode, 'stringLiteral')) {
      return 'const char*';
    }

    if (hasNonterminal(expressionNode, 'nullLiteral')) {
      return 'void*';
    }

    if (hasNonterminal(expressionNode, 'booleanLiteral')) {
      return 'int';
    }

    if (hasNonterminal(expressionNode, 'numericLiteral')) {
      const decimalToken = findFirstTerminalByToken(expressionNode, 'DecimalLiteral');
      if (decimalToken && /[.eE]/.test(String(decimalToken.value || ''))) {
        return 'double';
      }
      return 'int';
    }

    if (hasNonterminal(expressionNode, 'callExpression')) {
      const callExpressionNode = findFirstNonterminal(expressionNode, 'callExpression');
      const memberExpressionNode = callExpressionNode
        ? extractOutermostCallMemberExpression(callExpressionNode)
        : null;
      const pathSegments = memberExpressionNode ? extractPathFromMemberExpression(memberExpressionNode) : null;

      if (Array.isArray(pathSegments) && pathSegments.length === 1) {
        const calleeName = pathSegments[0];
        const calleeReturnType = returnTypeMap.get(calleeName);
        if (calleeReturnType) {
          return calleeReturnType;
        }
      }
      if (Array.isArray(pathSegments) && pathSegments.join('.') === 'Array.prototype.slice.call') {
        return 'void*';
      }

      return 'int';
    }

    if (hasNonterminal(expressionNode, 'identifier')) {
      const identifierName = findFirstIdentifierValue(expressionNode);
      if (identifierName && localBindingCppTypes.has(identifierName)) {
        return localBindingCppTypes.get(identifierName);
      }
      return 'int';
    }

    return 'int';
  }

  function inferFunctionReturnCppType(functionDeclarationNode, returnTypeMap = new Map(), analysisContext = null) {
    let scanCache = analysisContext && analysisContext._fnReturnScanCache;
    let cachedScan = scanCache ? scanCache.get(functionDeclarationNode) : null;
    let returnExprNodes;
    let localBindingCppTypes;
    if (cachedScan) {
      returnExprNodes = cachedScan.returnExprNodes;
      localBindingCppTypes = cachedScan.localBindingCppTypes;
    } else {
      const statementNodes = collectFunctionBodyStatementNodes(functionDeclarationNode);
      returnExprNodes = [];
      localBindingCppTypes = new Map();

    for (const statementNode of statementNodes) {
      collectReturnExpressionNodesFromStatement(statementNode, returnExprNodes);
      const declarationNode = (statementNode.children || []).find(
        (child) => child
          && child.kind === 'nonterminal'
          && (child.name === 'variableStatement' || child.name === 'letDeclaration' || child.name === 'constDeclaration')
      );
      const declarationListNode = declarationNode
        ? (declarationNode.children || []).find((child) => child && child.kind === 'nonterminal' && child.name === 'variableDeclarationList')
        : null;
      for (const variableDeclaration of extractVariableDeclarations(declarationListNode)) {
        const variableName = extractVariableDeclarationName(variableDeclaration);
        const initializerExpr = extractVariableDeclarationInitializer(variableDeclaration);
        if (!variableName || !initializerExpr) {
          continue;
        }
        const callExpressionNode = findFirstNonterminal(initializerExpr, 'callExpression');
        const callMemberExpressionNode = callExpressionNode
          ? extractOutermostCallMemberExpression(callExpressionNode)
          : null;
        const callPathSegments = callMemberExpressionNode ? extractPathFromMemberExpression(callMemberExpressionNode, null) : null;
        if (Array.isArray(callPathSegments) && callPathSegments.join('.') === 'Array.prototype.slice.call') {
          localBindingCppTypes.set(variableName, 'void*');
          continue;
        }
        const nullCacheCtx = analysisContext ? (analysisContext._nullInferCtx || (analysisContext._nullInferCtx = { _inferExprTypeCache: new WeakMap(), _inferExprTypeActive: new WeakSet() })) : null;
        const inferredType = cppArgType(inferExprType(initializerExpr, nullCacheCtx));
        localBindingCppTypes.set(variableName, inferredType);
      }
    }

    if (returnExprNodes.length === 0) {
      const directReturnExpr = extractCallableReturnExpressionNode(functionDeclarationNode);
      if (directReturnExpr) {
        returnExprNodes.push(directReturnExpr);
      }
    }
    if (scanCache) {
      scanCache.set(functionDeclarationNode, { returnExprNodes, localBindingCppTypes });
    }
    }

    const returnCppTypes = returnExprNodes.map((expr) => inferReturnExpressionCppType(
        expr,
        returnTypeMap,
        localBindingCppTypes,
        {
          ...(analysisContext || {}),
          currentFunctionNode: functionDeclarationNode
        }
      ));
    return mergeReturnCppTypes(returnCppTypes);
  }

  function inferTopLevelFunctionReturnTypes(tree) {
    const declarations = collectTopLevelFunctionDeclarations(tree);
    const functionExpressionBindings = collectTopLevelFunctionExpressionBindings(tree);
    const arrowFunctionBindings = collectTopLevelArrowFunctionBindings(tree);
    const assignedFunctionExpressionBindings = collectTopLevelAssignedFunctionExpressionBindings(tree);
    const objectLiteralFunctionExpressionBindings = collectTopLevelObjectLiteralFunctionExpressionBindings(tree);
    const callArgumentFunctionExpressionBindings = collectTopLevelCallArgumentFunctionExpressionBindings(tree);
    const analysisContext = {
      tree,
      objectLiteralPropertyTypesByFunctionNode: collectTopLevelObjectLiteralPropertyTypeInfo(tree),
      _visibleVariableBindingsCache: new WeakMap(),
      _staticModelCache: new WeakMap(),
      _staticModelNullSentinel: Symbol('analysis-static-model-null'),
      _fnReturnScanCache: new WeakMap(),
      _inferExprTypeCache: new WeakMap(),
      _inferExprTypeActive: new WeakSet()
    };
    const returnTypes = new Map();

    for (const functionDeclaration of declarations) {
      const functionName = extractFunctionDeclarationName(functionDeclaration);
      if (functionName) {
        returnTypes.set(functionName, 'int');
      }
    }

    for (const { bindingName } of functionExpressionBindings) {
      returnTypes.set(bindingName, 'int');
    }

    for (const { bindingName } of arrowFunctionBindings) {
      returnTypes.set(bindingName, 'int');
    }

    for (const { symbolName } of assignedFunctionExpressionBindings) {
      returnTypes.set(symbolName, 'int');
    }

    for (const { symbolName } of objectLiteralFunctionExpressionBindings) {
      returnTypes.set(symbolName, 'int');
    }

    for (const { symbolName } of callArgumentFunctionExpressionBindings) {
      returnTypes.set(symbolName, 'int');
    }

    const maxIterations = Math.min(16, declarations.length + functionExpressionBindings.length + arrowFunctionBindings.length + assignedFunctionExpressionBindings.length + objectLiteralFunctionExpressionBindings.length + callArgumentFunctionExpressionBindings.length + 1);
    for (let i = 0; i < maxIterations; i += 1) {
      let changed = false;

      for (const functionDeclaration of declarations) {
        const functionName = extractFunctionDeclarationName(functionDeclaration);
        if (!functionName) {
          continue;
        }

        const inferredType = inferFunctionReturnCppType(functionDeclaration, returnTypes, analysisContext);
        if (returnTypes.get(functionName) !== inferredType) {
          returnTypes.set(functionName, inferredType);
          changed = true;
        }
      }

      for (const { bindingName, functionExpressionNode } of functionExpressionBindings) {
        const inferredType = inferFunctionReturnCppType(functionExpressionNode, returnTypes, analysisContext);
        if (returnTypes.get(bindingName) !== inferredType) {
          returnTypes.set(bindingName, inferredType);
          changed = true;
        }
      }

      for (const { bindingName, arrowFunctionNode } of arrowFunctionBindings) {
        const inferredType = inferFunctionReturnCppType(arrowFunctionNode, returnTypes, analysisContext);
        if (returnTypes.get(bindingName) !== inferredType) {
          returnTypes.set(bindingName, inferredType);
          changed = true;
        }
      }

      for (const { symbolName, functionExpressionNode } of assignedFunctionExpressionBindings) {
        const inferredType = inferFunctionReturnCppType(functionExpressionNode, returnTypes, analysisContext);
        if (returnTypes.get(symbolName) !== inferredType) {
          returnTypes.set(symbolName, inferredType);
          changed = true;
        }
      }

      for (const { symbolName, functionExpressionNode } of objectLiteralFunctionExpressionBindings) {
        const inferredType = inferFunctionReturnCppType(functionExpressionNode, returnTypes, analysisContext);
        if (returnTypes.get(symbolName) !== inferredType) {
          returnTypes.set(symbolName, inferredType);
          changed = true;
        }
      }

      for (const { symbolName, functionExpressionNode } of callArgumentFunctionExpressionBindings) {
        const inferredType = inferFunctionReturnCppType(functionExpressionNode, returnTypes, analysisContext);
        if (returnTypes.get(symbolName) !== inferredType) {
          returnTypes.set(symbolName, inferredType);
          changed = true;
        }
      }

      if (!changed) {
        break;
      }
    }

    return returnTypes;
  }

  function refineFunctionReturnTypesWithParameterInfo(tree, returnTypes, callableParameterTypesByNode) {
    if (!tree || !returnTypes || !callableParameterTypesByNode) {
      return returnTypes;
    }

    const declarations = collectTopLevelFunctionDeclarations(tree);
    const functionExpressionBindings = collectTopLevelFunctionExpressionBindings(tree);
    const arrowFunctionBindings = collectTopLevelArrowFunctionBindings(tree);
    const assignedFunctionExpressionBindings = collectTopLevelAssignedFunctionExpressionBindings(tree);
    const objectLiteralFunctionExpressionBindings = collectTopLevelObjectLiteralFunctionExpressionBindings(tree);
    const callArgumentFunctionExpressionBindings = collectTopLevelCallArgumentFunctionExpressionBindings(tree);
    const analysisContext = {
      tree,
      objectLiteralPropertyTypesByFunctionNode: collectTopLevelObjectLiteralPropertyTypeInfo(tree),
      callableParameterTypesByNode,
      _visibleVariableBindingsCache: new WeakMap(),
      _staticModelCache: new WeakMap(),
      _staticModelNullSentinel: Symbol('analysis-static-model-null')
    };

    for (let i = 0; i < declarations.length + functionExpressionBindings.length + arrowFunctionBindings.length + assignedFunctionExpressionBindings.length + objectLiteralFunctionExpressionBindings.length + callArgumentFunctionExpressionBindings.length + 1; i += 1) {
      let changed = false;

      for (const functionDeclaration of declarations) {
        const functionName = extractFunctionDeclarationName(functionDeclaration);
        if (!functionName) {
          continue;
        }

        const inferredType = inferFunctionReturnCppType(functionDeclaration, returnTypes, analysisContext);
        if (returnTypes.get(functionName) !== inferredType) {
          returnTypes.set(functionName, inferredType);
          changed = true;
        }
      }

      for (const { bindingName, functionExpressionNode } of functionExpressionBindings) {
        const inferredType = inferFunctionReturnCppType(functionExpressionNode, returnTypes, analysisContext);
        if (returnTypes.get(bindingName) !== inferredType) {
          returnTypes.set(bindingName, inferredType);
          changed = true;
        }
      }

      for (const { bindingName, arrowFunctionNode } of arrowFunctionBindings) {
        const inferredType = inferFunctionReturnCppType(arrowFunctionNode, returnTypes, analysisContext);
        if (returnTypes.get(bindingName) !== inferredType) {
          returnTypes.set(bindingName, inferredType);
          changed = true;
        }
      }

      for (const { symbolName, functionExpressionNode } of assignedFunctionExpressionBindings) {
        const inferredType = inferFunctionReturnCppType(functionExpressionNode, returnTypes, analysisContext);
        if (returnTypes.get(symbolName) !== inferredType) {
          returnTypes.set(symbolName, inferredType);
          changed = true;
        }
      }

      for (const { symbolName, functionExpressionNode } of objectLiteralFunctionExpressionBindings) {
        const inferredType = inferFunctionReturnCppType(functionExpressionNode, returnTypes, analysisContext);
        if (returnTypes.get(symbolName) !== inferredType) {
          returnTypes.set(symbolName, inferredType);
          changed = true;
        }
      }

      for (const { symbolName, functionExpressionNode } of callArgumentFunctionExpressionBindings) {
        const inferredType = inferFunctionReturnCppType(functionExpressionNode, returnTypes, analysisContext);
        if (returnTypes.get(symbolName) !== inferredType) {
          returnTypes.set(symbolName, inferredType);
          changed = true;
        }
      }

      if (!changed) {
        break;
      }
    }

    return returnTypes;
  }

  function refineFunctionReturnTypesWithLoweredExpressions(tree, compileContext) {
    if (!tree || !compileContext || !compileContext.functionReturnTypes) {
      return;
    }

    const candidateBindings = [
      ...collectTopLevelFunctionExpressionBindings(tree).map((binding) => ({
        functionName: binding.bindingName,
        functionNode: binding.functionExpressionNode
      })),
      ...collectTopLevelAssignedFunctionExpressionBindings(tree).map((binding) => ({
        functionName: binding.symbolName,
        functionNode: binding.functionExpressionNode
      })),
      ...collectTopLevelFunctionDeclarations(tree).map((functionNode) => ({
        functionName: extractFunctionDeclarationName(functionNode),
        functionNode
      }))
    ].filter((entry) => entry.functionName && entry.functionNode);

    for (const { functionName, functionNode } of candidateBindings) {
      const currentReturnType = compileContext.functionReturnTypes.get(functionName);
      if (currentReturnType === 'const char*') {
        continue;
      }

      const statementNodes = collectFunctionBodyStatementNodes(functionNode);
      const returnExprNodes = [];
      for (const statementNode of statementNodes) {
        collectReturnExpressionNodesFromStatement(statementNode, returnExprNodes);
      }
      if (returnExprNodes.length === 0) {
        const directReturnExpr = extractCallableReturnExpressionNode(functionNode);
        if (directReturnExpr) {
          returnExprNodes.push(directReturnExpr);
        }
      }
      if (returnExprNodes.length === 0) {
        continue;
      }

      const loweredReturnExprs = returnExprNodes.map((expr) => {
        try {
          return lowerExpressionValue(expr, compileContext);
        } catch (_) {
          return null;
        }
      });

      if (loweredReturnExprs.length > 0
        && loweredReturnExprs.every((expr) => isStringLikeLoweredReturnExpression(expr))) {
        compileContext.functionReturnTypes.set(functionName, 'const char*');
      }
    }
  }

  return {
    inferExprType,
    _inferExprTypeUncached,
    inferPreciseCppTypeFromExpression,
    cppArgType,
    inferDirectNewClassCppType,
    inferInitializerCppType,
    defaultCppValue,
    castReturnExpression,
    isStringLikeLoweredReturnExpression,
    buildFlattenedWeakMapPropertyWrites,
    collectFunctionBodyStatementNodes,
    collectReturnExpressionNodesFromStatement,
    inferReturnExpressionCppType,
    inferFunctionReturnCppType,
    inferTopLevelFunctionReturnTypes,
    refineFunctionReturnTypesWithParameterInfo,
    refineFunctionReturnTypesWithLoweredExpressions
  };
}

module.exports = { createTypeInference };
