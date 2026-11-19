'use strict';

const {
  walk,
  findFirstIdentifierValue,
  findFirstNonterminal
} = require('./ast-utils');

function createAstCollectors(deps) {
  const {
    extractPathFromMemberExpression,
    extractVariableDeclarations,
    extractVariableDeclarationName,
    extractVariableDeclarationInitializer,
    extractObjectLiteralProperties,
    inferExprType,
    collectArgumentExpressions,
    lowerMemberExpressionNewCallValue,
    lowerIdentifierFromLeftHandSideExpression,
    collectFunctionBodyStatementNodes,
    extractFunctionParameterNames,
    extractLambdaParameterNames,
    extractDirectCallExpressionNode,
    extractOutermostCallMemberExpression,
    findCallableNodeFromExpression,
    collectLambdaCaptureNames
  } = deps;

  function extractTopLevelStatementNodes(tree) {
    if (!tree || tree.kind !== 'nonterminal') {
      return [];
    }

    const statements = [];
    for (const child of (tree.children || [])) {
      if (!child || child.kind !== 'nonterminal' || child.name !== 'sourceElement') {
        continue;
      }
      const statementNode = (child.children || []).find(
        (candidate) => candidate && candidate.kind === 'nonterminal' && candidate.name === 'statement'
      );
      if (statementNode) {
        statements.push(statementNode);
      }
    }
    return statements;
  }

  function extractFunctionDeclarationFromStatement(statementNode) {
    if (!statementNode || statementNode.kind !== 'nonterminal' || statementNode.name !== 'statement') {
      return null;
    }

    return (statementNode.children || []).find(
      (child) => child && child.kind === 'nonterminal' && child.name === 'functionDeclaration'
    ) || null;
  }

  function extractAsyncFunctionDeclarationFromStatement(statementNode) {
    if (!statementNode || statementNode.kind !== 'nonterminal' || statementNode.name !== 'statement') {
      return null;
    }

    return (statementNode.children || []).find(
      (child) => child && child.kind === 'nonterminal' && child.name === 'asyncFunctionDeclaration'
    ) || null;
  }

  function collectTopLevelFunctionDeclarations(tree) {
    return extractTopLevelStatementNodes(tree)
      .map(extractFunctionDeclarationFromStatement)
      .filter(Boolean);
  }

  function extractDirectFunctionExpressionInitializer(exprNode) {
    return extractDirectCallableInitializer(exprNode, new Set(['functionExpression']));
  }

  function extractDirectArrowFunctionInitializer(exprNode) {
    return extractDirectCallableInitializer(exprNode, new Set(['arrowFunction', 'asyncArrowFunction']));
  }

  function extractDirectCallableInitializer(exprNode, callableNames) {
    if (!exprNode || exprNode.kind !== 'nonterminal') {
      return null;
    }

    const wrapperNames = new Set([
      'assignmentExpression',
      'conditionalExpression',
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
      'exponentiationExpression',
      'unaryExpression',
      'postfixExpression',
      'leftHandSideExpression',
      'newExpression',
      'memberExpression'
    ]);

    let current = exprNode;
    while (current && current.kind === 'nonterminal') {
      if (callableNames.has(current.name)) {
        return current;
      }

      if (!wrapperNames.has(current.name)) {
        return null;
      }

      const nonterminalChildren = (current.children || []).filter((child) => child && child.kind === 'nonterminal');
      if (nonterminalChildren.length !== 1) {
        return null;
      }

      current = nonterminalChildren[0];
    }

    return null;
  }

  function collectTopLevelArrowFunctionBindings(tree) {
    const bindings = [];
    const topLevelBindingNames = collectTopLevelBindingNames(tree);
    const baseLocalFunctionNames = new Set();
    for (const fnNode of collectTopLevelFunctionDeclarations(tree)) {
      const fnName = extractFunctionDeclarationName(fnNode);
      if (fnName) {
        baseLocalFunctionNames.add(fnName);
      }
    }
    for (const { bindingName } of collectTopLevelFunctionExpressionBindings(tree)) {
      baseLocalFunctionNames.add(bindingName);
    }
    const lambdaCompileContext = {
      tree,
      topLevelBindingNames,
      localFunctionNames: baseLocalFunctionNames
    };

    for (const statementNode of extractTopLevelStatementNodes(tree)) {
      const declarationNode = (statementNode.children || []).find(
        (child) => child
          && child.kind === 'nonterminal'
          && (child.name === 'variableStatement' || child.name === 'letDeclaration' || child.name === 'constDeclaration')
      );
      if (!declarationNode) {
        continue;
      }

      const variableDeclarationList = (declarationNode.children || []).find(
        (child) => child && child.kind === 'nonterminal' && child.name === 'variableDeclarationList'
      );
      const declarations = extractVariableDeclarations(variableDeclarationList);
      for (const declaration of declarations) {
        const bindingName = extractVariableDeclarationName(declaration);
        const initializerExpr = extractVariableDeclarationInitializer(declaration);
        const arrowFunctionNode = extractDirectArrowFunctionInitializer(initializerExpr);
        if (!bindingName || !arrowFunctionNode) {
          continue;
        }

        if (collectLambdaCaptureNames(arrowFunctionNode, lambdaCompileContext).length > 0) {
          continue;
        }

        bindings.push({ bindingName, arrowFunctionNode });
      }
    }

    return bindings;
  }

  function collectTopLevelFunctionExpressionBindings(tree) {
    const bindings = [];

    for (const statementNode of extractTopLevelStatementNodes(tree)) {
      const declarationNode = (statementNode.children || []).find(
        (child) => child
          && child.kind === 'nonterminal'
          && (child.name === 'variableStatement' || child.name === 'letDeclaration' || child.name === 'constDeclaration')
      );
      if (!declarationNode) {
        continue;
      }

      const variableDeclarationList = (declarationNode.children || []).find(
        (child) => child && child.kind === 'nonterminal' && child.name === 'variableDeclarationList'
      );
      const declarations = extractVariableDeclarations(variableDeclarationList);
      for (const declaration of declarations) {
        const bindingName = extractVariableDeclarationName(declaration);
        const initializerExpr = extractVariableDeclarationInitializer(declaration);
        const functionExpressionNode = extractDirectFunctionExpressionInitializer(initializerExpr);
        if (!bindingName || !functionExpressionNode) {
          continue;
        }

        bindings.push({ bindingName, functionExpressionNode });
      }
    }

    return bindings;
  }

  function sanitizeFunctionSymbolSuffix(value) {
    return String(value || '')
      .replace(/[^A-Za-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'anonymous';
  }

  function collectTopLevelAssignedFunctionExpressionBindings(tree) {
    const bindings = [];

    for (const statementNode of extractTopLevelStatementNodes(tree)) {
      const expressionStatementNode = (statementNode.children || []).find(
        (child) => child && child.kind === 'nonterminal' && child.name === 'expressionStatement'
      );
      if (!expressionStatementNode) {
        continue;
      }

      const expressionNode = (expressionStatementNode.children || []).find(
        (child) => child && child.kind === 'nonterminal' && child.name === 'expression'
      );
      const assignmentExpressionNode = expressionNode ? (expressionNode.children || []).find(
        (child) => child && child.kind === 'nonterminal' && child.name === 'assignmentExpression'
      ) : null;
      if (!assignmentExpressionNode) {
        continue;
      }

      const assignmentChildren = assignmentExpressionNode.children || [];
      if (assignmentChildren.length !== 3
        || !assignmentChildren[0]
        || assignmentChildren[0].kind !== 'nonterminal'
        || assignmentChildren[0].name !== 'leftHandSideExpression'
        || !assignmentChildren[1]
        || assignmentChildren[1].kind !== 'nonterminal'
        || assignmentChildren[1].name !== 'assignmentOperator'
        || !assignmentChildren[2]
        || assignmentChildren[2].kind !== 'nonterminal'
        || assignmentChildren[2].name !== 'assignmentExpression') {
        continue;
      }

      const operatorToken = (assignmentChildren[1].children || []).find(
        (child) => child && child.kind === 'terminal'
      );
      if (!operatorToken || operatorToken.value !== '=') {
        continue;
      }

      const lhs = lowerIdentifierFromLeftHandSideExpression(assignmentChildren[0]);
      const functionExpressionNode = extractDirectFunctionExpressionInitializer(assignmentChildren[2]);
      if (!lhs || !functionExpressionNode) {
        continue;
      }

      bindings.push({
        lhs,
        symbolName: `__maia_fn_${sanitizeFunctionSymbolSuffix(lhs)}`,
        functionExpressionNode
      });
    }

    return bindings;
  }

  function collectTopLevelObjectLiteralFunctionExpressionBindings(tree) {
    const bindings = [];

    for (const statementNode of extractTopLevelStatementNodes(tree)) {
      const declarationNode = (statementNode.children || []).find(
        (child) => child
          && child.kind === 'nonterminal'
          && (child.name === 'variableStatement' || child.name === 'letDeclaration' || child.name === 'constDeclaration')
      );
      if (!declarationNode) {
        continue;
      }

      const variableDeclarationList = (declarationNode.children || []).find(
        (child) => child && child.kind === 'nonterminal' && child.name === 'variableDeclarationList'
      );
      const declarations = extractVariableDeclarations(variableDeclarationList);
      for (const declaration of declarations) {
        const bindingName = extractVariableDeclarationName(declaration);
        const initializerExpr = extractVariableDeclarationInitializer(declaration);
        const objectLiteralNode = initializerExpr ? findFirstNonterminal(initializerExpr, 'objectLiteral') : null;
        if (!bindingName || !objectLiteralNode) {
          continue;
        }

        for (const property of extractObjectLiteralProperties(objectLiteralNode)) {
          const functionExpressionNode = extractDirectFunctionExpressionInitializer(property.valueExprNode);
          if (!functionExpressionNode) {
            continue;
          }

          bindings.push({
            ownerName: bindingName,
            propertyName: property.key,
            symbolName: `__maia_fn_${sanitizeFunctionSymbolSuffix(`${bindingName}_${property.key}`)}`,
            functionExpressionNode
          });
        }
      }
    }

    return bindings;
  }

  function collectTopLevelObjectLiteralPropertyTypeInfo(tree) {
    const propertyTypesByFunctionNode = new Map();

    for (const statementNode of extractTopLevelStatementNodes(tree)) {
      const declarationNode = (statementNode.children || []).find(
        (child) => child
          && child.kind === 'nonterminal'
          && (child.name === 'variableStatement' || child.name === 'letDeclaration' || child.name === 'constDeclaration')
      );
      if (!declarationNode) {
        continue;
      }

      const variableDeclarationList = (declarationNode.children || []).find(
        (child) => child && child.kind === 'nonterminal' && child.name === 'variableDeclarationList'
      );
      const declarations = extractVariableDeclarations(variableDeclarationList);
      for (const declaration of declarations) {
        const initializerExpr = extractVariableDeclarationInitializer(declaration);
        const objectLiteralNode = initializerExpr ? findFirstNonterminal(initializerExpr, 'objectLiteral') : null;
        if (!objectLiteralNode) {
          continue;
        }

        const propertyTypes = new Map();
        for (const property of extractObjectLiteralProperties(objectLiteralNode)) {
          const functionExpressionNode = extractDirectFunctionExpressionInitializer(property.valueExprNode);
          if (!functionExpressionNode) {
            propertyTypes.set(property.key, inferExprType(property.valueExprNode, null));
          }
        }

        for (const property of extractObjectLiteralProperties(objectLiteralNode)) {
          const functionExpressionNode = extractDirectFunctionExpressionInitializer(property.valueExprNode);
          if (functionExpressionNode) {
            propertyTypesByFunctionNode.set(functionExpressionNode, new Map(propertyTypes));
          }
        }
      }
    }

    const constructorPropertyTypesByBinding = new Map();
    for (const { bindingName, functionExpressionNode } of collectTopLevelConstructorFunctionExpressionBindings(tree)) {
      const propertyTypes = new Map();
      for (const statementNode of collectFunctionBodyStatementNodes(functionExpressionNode)) {
        const expressionStatementNode = (statementNode.children || []).find(
          (child) => child && child.kind === 'nonterminal' && child.name === 'expressionStatement'
        );
        const expressionNode = expressionStatementNode
          ? ((expressionStatementNode.children || []).find((child) => child && child.kind === 'nonterminal' && child.name === 'expression') || null)
          : null;
        const assignmentExpressionNode = expressionNode
          ? ((expressionNode.children || []).find((child) => child && child.kind === 'nonterminal' && child.name === 'assignmentExpression') || null)
          : null;
        const assignmentChildren = assignmentExpressionNode ? (assignmentExpressionNode.children || []) : [];
        if (assignmentChildren.length !== 3) {
          continue;
        }
        const operatorToken = (assignmentChildren[1].children || []).find(
          (child) => child && child.kind === 'terminal'
        );
        if (!operatorToken || operatorToken.value !== '=') {
          continue;
        }
        const lhsIdentifier = lowerIdentifierFromLeftHandSideExpression(assignmentChildren[0], null);
        if (!lhsIdentifier || !lhsIdentifier.startsWith('this.')) {
          continue;
        }
        const propertyName = lhsIdentifier.slice('this.'.length);
        if (!propertyName) {
          continue;
        }
        propertyTypes.set(propertyName, inferExprType(assignmentChildren[2], null));
      }
      if (propertyTypes.size > 0) {
        constructorPropertyTypesByBinding.set(bindingName, propertyTypes);
      }
    }

    for (const { lhs, functionExpressionNode } of collectTopLevelAssignedFunctionExpressionBindings(tree)) {
      if (!lhs || !lhs.includes('.prototype.')) {
        continue;
      }
      const match = lhs.match(/^([A-Za-z_][A-Za-z0-9_]*)\.prototype\./);
      if (!match) {
        continue;
      }
      const ctorPropertyTypes = constructorPropertyTypesByBinding.get(match[1]);
      if (ctorPropertyTypes && !propertyTypesByFunctionNode.has(functionExpressionNode)) {
        propertyTypesByFunctionNode.set(functionExpressionNode, new Map(ctorPropertyTypes));
      }
    }

    return propertyTypesByFunctionNode;
  }

  function collectTopLevelPrototypeHeritageMap(tree) {
    const heritageMap = new Map();

    for (const statementNode of extractTopLevelStatementNodes(tree)) {
      const expressionStatementNode = (statementNode.children || []).find(
        (child) => child && child.kind === 'nonterminal' && child.name === 'expressionStatement'
      );
      if (!expressionStatementNode) {
        continue;
      }

      const expressionNode = (expressionStatementNode.children || []).find(
        (child) => child && child.kind === 'nonterminal' && child.name === 'expression'
      );
      const assignmentExpressionNode = expressionNode ? (expressionNode.children || []).find(
        (child) => child && child.kind === 'nonterminal' && child.name === 'assignmentExpression'
      ) : null;
      if (!assignmentExpressionNode) {
        continue;
      }

      const assignmentChildren = assignmentExpressionNode.children || [];
      if (assignmentChildren.length !== 3) {
        continue;
      }

      const lhs = lowerIdentifierFromLeftHandSideExpression(assignmentChildren[0]);
      const rhsCallExpression = extractDirectCallExpressionNode(assignmentChildren[2]);
      const rhsMemberExpression = rhsCallExpression
        ? (rhsCallExpression.children || []).find(
            (child) => child && child.kind === 'nonterminal' && child.name === 'memberExpression'
          ) || null
        : null;
      const rhsPathSegments = rhsMemberExpression ? extractPathFromMemberExpression(rhsMemberExpression, null) : null;

      if (!lhs || !Array.isArray(rhsPathSegments) || rhsPathSegments.join('.') !== 'Object.create') {
        continue;
      }

      const argsNode = rhsCallExpression
        ? (rhsCallExpression.children || []).find(
            (child) => child && child.kind === 'nonterminal' && child.name === 'arguments'
          ) || null
        : null;
      const argListNode = argsNode
        ? ((argsNode.children || []).find((child) => child && child.kind === 'nonterminal' && child.name === 'argumentList') || null)
        : null;
      const argExprs = argListNode ? collectArgumentExpressions(argListNode) : [];
      const basePath = argExprs.length > 0 ? extractPathFromMemberExpression(findFirstNonterminal(argExprs[0], 'memberExpression') || argExprs[0], null) : null;
      const match = lhs.match(/^([A-Za-z_][A-Za-z0-9_]*)\.prototype$/);
      if (match && Array.isArray(basePath) && basePath.length === 2 && basePath[1] === 'prototype') {
        heritageMap.set(match[1], basePath[0]);
      }
    }

    return heritageMap;
  }

  function collectTopLevelCallArgumentFunctionExpressionBindings(tree) {
    const bindings = [];
    const promiseChainMethods = new Set(['then', 'catch', 'finally']);

    for (const statementNode of extractTopLevelStatementNodes(tree)) {
      walk(statementNode, (node) => {
        if (!node || node.kind !== 'nonterminal' || node.name !== 'callExpression') {
          return;
        }

        const children = node.children || [];
        const memberExprNode = children.find((child) => child && child.kind === 'nonterminal' && child.name === 'memberExpression');
        const argsNode = children.find((child) => child && child.kind === 'nonterminal' && child.name === 'arguments');
        if (!memberExprNode || !argsNode) {
          return;
        }

        const pathSegments = extractPathFromMemberExpression(memberExprNode) || [];
        const terminalMethodName = pathSegments.length > 0 ? pathSegments[pathSegments.length - 1] : '';
        if (promiseChainMethods.has(terminalMethodName)) {
          return;
        }
        if (terminalMethodName === 'forEach' && pathSegments.length === 2) {
          let isMapReceiver = false;
          walk(tree, (n) => {
            if (isMapReceiver || !n || n.kind !== 'nonterminal' || (n.name !== 'lexicalBinding' && n.name !== 'variableDeclaration')) return;
            const bId = findFirstIdentifierValue(n);
            if (bId === pathSegments[0]) {
              const newN = findFirstNonterminal(n, 'newExpression');
              const ctor = newN ? findFirstIdentifierValue(newN) : null;
              if (ctor === 'Map' || ctor === 'WeakMap') isMapReceiver = true;
            }
          });
          if (isMapReceiver) return;
          let hasExternalMutation = false;
          walk(node, (sub) => {
            if (hasExternalMutation || !sub || sub.kind !== 'nonterminal' || sub.name !== 'assignmentExpression') return;
            if ((sub.children || []).some((c) => c && c.kind === 'nonterminal' && c.name === 'assignmentOperator')) {
              hasExternalMutation = true;
            }
          });
          if (hasExternalMutation) return;
        }
        const targetName = pathSegments.length > 0 ? pathSegments.join('_') : 'call';
        const argListNode = (argsNode.children || []).find(
          (child) => child && child.kind === 'nonterminal' && child.name === 'argumentList'
        );
        const argExprs = argListNode ? collectArgumentExpressions(argListNode) : [];

        argExprs.forEach((argExpr, index) => {
          const functionExpressionNode = extractDirectFunctionExpressionInitializer(argExpr);
          if (!functionExpressionNode) {
            return;
          }

          bindings.push({
            symbolName: `__maia_fn_arg_${sanitizeFunctionSymbolSuffix(`${targetName}_${index}`)}`,
            functionExpressionNode
          });
        });
      });
    }

    return bindings;
  }

  function collectTopLevelForEachArrowFunctionBindings(tree) {
    const bindings = [];
    const topLevelBindingNames = collectTopLevelBindingNames(tree);
    const localFunctionNames = new Set(collectTopLevelFunctionNames(tree));
    for (const { bindingName } of collectTopLevelFunctionExpressionBindings(tree)) {
      localFunctionNames.add(bindingName);
    }
    const lambdaCompileContext = { tree, topLevelBindingNames, localFunctionNames };

    for (const statementNode of extractTopLevelStatementNodes(tree)) {
      walk(statementNode, (node) => {
        if (!node || node.kind !== 'nonterminal' || node.name !== 'callExpression') {
          return;
        }
        const memberExpressionNode = (node.children || []).find(
          (child) => child && child.kind === 'nonterminal' && child.name === 'memberExpression'
        );
        const memberChildren = memberExpressionNode ? (memberExpressionNode.children || []) : [];
        const directPropertyIndex = memberChildren.findIndex(
          (child) => child && child.kind === 'terminal' && child.value === '.'
        );
        const directPropertyNode = directPropertyIndex >= 0 ? memberChildren[directPropertyIndex + 1] : null;
        if (!directPropertyNode || findFirstIdentifierValue(directPropertyNode) !== 'forEach') {
          return;
        }
        const argsNode = (node.children || []).find(
          (child) => child && child.kind === 'nonterminal' && child.name === 'arguments'
        );
        const argListNode = argsNode && (argsNode.children || []).find(
          (child) => child && child.kind === 'nonterminal' && child.name === 'argumentList'
        );
        const argExprs = argListNode ? collectArgumentExpressions(argListNode) : [];
        argExprs.forEach((argExpr) => {
          const arrowFunctionNode = findCallableNodeFromExpression(argExpr);
          if (!arrowFunctionNode || arrowFunctionNode.name !== 'arrowFunction') {
            return;
          }
          if (collectLambdaCaptureNames(arrowFunctionNode, lambdaCompileContext).length > 0) {
            return;
          }
          bindings.push({
            symbolName: `__maia_fn_arrow_arg_${bindings.length}`,
            arrowFunctionNode
          });
        });
      });
    }

    return bindings;
  }

  function nodeContainsThisReference(node) {
    let found = false;
    walk(node, (candidate) => {
      if (found || !candidate || candidate.kind !== 'terminal') {
        return;
      }
      if (candidate.token === 'TOKEN_this') {
        found = true;
      }
    });
    return found;
  }

  function collectNewExpressionTargetNames(tree) {
    const names = new Set();

    walk(tree, (node) => {
      if (!node || node.kind !== 'nonterminal' || node.name !== 'memberExpression') {
        return;
      }

      const loweredNewCall = lowerMemberExpressionNewCallValue(node, null);
      if (!loweredNewCall || !loweredNewCall.startsWith('__new__')) {
        return;
      }

      const ctorName = loweredNewCall.slice('__new__'.length).split('(')[0];
      if (ctorName) {
        names.add(ctorName);
      }
    });

    return names;
  }

  function collectTopLevelConstructorFunctionExpressionBindings(tree) {
    const newTargets = collectNewExpressionTargetNames(tree);
    const prototypeOwners = new Set(
      collectTopLevelAssignedFunctionExpressionBindings(tree)
        .map(({ lhs }) => {
          const match = String(lhs || '').match(/^([A-Za-z_][A-Za-z0-9_]*)\.prototype\./);
          return match ? match[1] : null;
        })
        .filter(Boolean)
    );

    return collectTopLevelFunctionExpressionBindings(tree)
      .filter(({ bindingName, functionExpressionNode }) => (
        nodeContainsThisReference(functionExpressionNode)
        && (newTargets.has(bindingName) || prototypeOwners.has(bindingName))
      ));
  }

  function rewriteConstructorThisReferences(line) {
    if (typeof line !== 'string' || line.length === 0) {
      return line;
    }

    const thisPropertyAssignment = line.match(/^(\s*)this->([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+);\s*$/);
    if (thisPropertyAssignment) {
      const indent = thisPropertyAssignment[1] || '';
      const propertyName = thisPropertyAssignment[2];
      const propertyValue = thisPropertyAssignment[3];
      return `${indent}__Reflect(__maia_this, "${propertyName}", ${propertyValue});`;
    }

    return line
      .replace(/\bthis->([A-Za-z_][A-Za-z0-9_]*)\b/g, '__maia_this')
      .replace(/\bthis\b/g, '__maia_this');
  }

  function rewriteObjectLiteralMethodThisReferences(line) {
    if (typeof line !== 'string' || line.length === 0) {
      return line;
    }

    const thisPropertyAssignment = line.match(/^(\s*)this->([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+);\s*$/);
    if (thisPropertyAssignment) {
      const indent = thisPropertyAssignment[1] || '';
      const propertyName = thisPropertyAssignment[2];
      const propertyValue = thisPropertyAssignment[3];
      return `${indent}__Reflect(self, "${propertyName}", ${propertyValue});`;
    }

    const hoistedThisStringTemp = line.match(/^\s*int\s+(__maia_console_value_tmp[0-9]+)\s*=\s*\(int\)\(this->([A-Za-z_][A-Za-z0-9_]*)\)\s*;\s*$/);
    if (hoistedThisStringTemp) {
      return `  const char* ${hoistedThisStringTemp[1]} = (const char*)__maia_runtime_value_get_property((void*)(self), (void*)"${hoistedThisStringTemp[2]}");`;
    }

    return line
      .replace(/__maia_console_to_cstr_bool\(\(int\)\((__maia_console_value_tmp[0-9]+)\)\)/g, '__maia_console_to_cstr_string((const char*)($1))')
      .replace(/\bthis->([A-Za-z_][A-Za-z0-9_]*)\b(?!\s*\()/g, '((const char*)__maia_runtime_value_get_property((void*)(self), (void*)"$1"))')
      .replace(/\bthis\b/g, 'self');
  }

  function extractClassDeclarationFromStatement(statementNode) {
    if (!statementNode || statementNode.kind !== 'nonterminal' || statementNode.name !== 'statement') {
      return null;
    }

    return (statementNode.children || []).find(
      (child) => child && child.kind === 'nonterminal' && child.name === 'classDeclaration'
    ) || null;
  }

  function collectTopLevelClassDeclarations(tree) {
    return extractTopLevelStatementNodes(tree)
      .map(extractClassDeclarationFromStatement)
      .filter(Boolean);
  }

  function extractClassDeclarationName(classDeclarationNode) {
    if (!classDeclarationNode || classDeclarationNode.kind !== 'nonterminal' || classDeclarationNode.name !== 'classDeclaration') {
      return null;
    }

    const identifierNode = (classDeclarationNode.children || []).find(
      (child) => child && child.kind === 'nonterminal' && child.name === 'identifier'
    );
    return identifierNode ? findFirstIdentifierValue(identifierNode) : null;
  }

  function extractClassHeritageName(classDeclarationNode) {
    if (!classDeclarationNode || classDeclarationNode.kind !== 'nonterminal' || classDeclarationNode.name !== 'classDeclaration') {
      return null;
    }

    const classTail = (classDeclarationNode.children || []).find(
      (child) => child && child.kind === 'nonterminal' && child.name === 'classTail'
    );
    if (!classTail) {
      return null;
    }

    const classHeritage = (classTail.children || []).find(
      (child) => child && child.kind === 'nonterminal' && child.name === 'classHeritage'
    );
    if (!classHeritage) {
      return null;
    }

    const lhsExpression = (classHeritage.children || []).find(
      (child) => child && child.kind === 'nonterminal' && child.name === 'leftHandSideExpression'
    );
    return lhsExpression ? findFirstIdentifierValue(lhsExpression) : null;
  }

  function extractClassMethodDefinitions(classDeclarationNode) {
    if (!classDeclarationNode || classDeclarationNode.kind !== 'nonterminal' || classDeclarationNode.name !== 'classDeclaration') {
      return [];
    }

    const classTail = (classDeclarationNode.children || []).find(
      (child) => child && child.kind === 'nonterminal' && child.name === 'classTail'
    );
    if (!classTail) {
      return [];
    }

    const classBody = (classTail.children || []).find(
      (child) => child && child.kind === 'nonterminal' && child.name === 'classBody'
    );
    if (!classBody) {
      return [];
    }

    const methodDefinitions = [];
    for (const classElement of (classBody.children || [])) {
      if (!classElement || classElement.kind !== 'nonterminal' || classElement.name !== 'classElement') {
        continue;
      }

      const methodDefinition = (classElement.children || []).find(
        (child) => child && child.kind === 'nonterminal' && child.name === 'methodDefinition'
      );
      if (methodDefinition) {
        methodDefinitions.push(methodDefinition);
      }
    }

    return methodDefinitions;
  }

  // Returns array of { methodDefinition, isStatic }
  function extractClassMethodEntries(classDeclarationNode) {
    if (!classDeclarationNode || classDeclarationNode.kind !== 'nonterminal' || classDeclarationNode.name !== 'classDeclaration') {
      return [];
    }

    const classTail = (classDeclarationNode.children || []).find(
      (child) => child && child.kind === 'nonterminal' && child.name === 'classTail'
    );
    if (!classTail) { return []; }

    const classBody = (classTail.children || []).find(
      (child) => child && child.kind === 'nonterminal' && child.name === 'classBody'
    );
    if (!classBody) { return []; }

    const entries = [];
    for (const classElement of (classBody.children || [])) {
      if (!classElement || classElement.kind !== 'nonterminal' || classElement.name !== 'classElement') {
        continue;
      }
      const isStatic = (classElement.children || []).some(
        (c) => c && c.kind === 'terminal' && c.token === 'TOKEN_static'
      );
      const methodDefinition = (classElement.children || []).find(
        (child) => child && child.kind === 'nonterminal' && child.name === 'methodDefinition'
      );
      if (methodDefinition) {
        entries.push({ methodDefinition, isStatic });
      }
    }
    return entries;
  }

  function extractMethodDefinitionName(methodDefinitionNode) {
    if (!methodDefinitionNode || methodDefinitionNode.kind !== 'nonterminal' || methodDefinitionNode.name !== 'methodDefinition') {
      return null;
    }

    const propertyName = (methodDefinitionNode.children || []).find(
      (child) => child && child.kind === 'nonterminal' && child.name === 'propertyName'
    );
    return propertyName ? findFirstIdentifierValue(propertyName) : null;
  }

  function extractMethodParameterNames(methodDefinitionNode) {
    if (!methodDefinitionNode || methodDefinitionNode.kind !== 'nonterminal' || methodDefinitionNode.name !== 'methodDefinition') {
      return [];
    }

    const formalParameterList = (methodDefinitionNode.children || []).find(
      (child) => child && child.kind === 'nonterminal' && child.name === 'formalParameterList'
    );
    if (!formalParameterList) {
      return [];
    }

    const names = [];
    walk(formalParameterList, (candidate) => {
      if (!candidate || candidate.kind !== 'nonterminal' || candidate.name !== 'formalParameter') {
        return;
      }
      const identifier = findFirstIdentifierValue(candidate);
      if (identifier) {
        names.push(identifier);
      }
    });

    return names;
  }

  function extractFunctionDeclarationName(functionDeclarationNode) {
    if (!functionDeclarationNode || functionDeclarationNode.kind !== 'nonterminal'
      || (functionDeclarationNode.name !== 'functionDeclaration' && functionDeclarationNode.name !== 'asyncFunctionDeclaration' && functionDeclarationNode.name !== 'generatorDeclaration')) {
      return null;
    }

    const identifierNode = (functionDeclarationNode.children || []).find(
      (child) => child && child.kind === 'nonterminal' && child.name === 'identifier'
    );
    return identifierNode ? findFirstIdentifierValue(identifierNode) : null;
  }

  function collectTopLevelFunctionNames(tree) {
    const names = new Set();
    for (const fnNode of collectTopLevelFunctionDeclarations(tree)) {
      const fnName = extractFunctionDeclarationName(fnNode);
      if (fnName) {
        names.add(fnName);
      }
    }

    for (const statementNode of extractTopLevelStatementNodes(tree)) {
      const genFunction = findFirstNonterminal(statementNode, 'generatorDeclaration');
      const genName = extractFunctionDeclarationName(genFunction);
      if (genName) {
        names.add(genName);
      }
      const asyncFunction = extractAsyncFunctionDeclarationFromStatement(statementNode);
      const fnName = extractFunctionDeclarationName(asyncFunction);
      if (fnName) {
        names.add(fnName);
      }
    }

    for (const { bindingName } of collectTopLevelFunctionExpressionBindings(tree)) {
      names.add(bindingName);
    }

    for (const { bindingName } of collectTopLevelArrowFunctionBindings(tree)) {
      names.add(bindingName);
    }

    return names;
  }

  function functionBodyUsesArguments(functionNode) {
    if (!functionNode || functionNode.kind !== 'nonterminal') {
      return false;
    }

    let usesArguments = false;
    walk(functionNode, (candidate) => {
      if (usesArguments || !candidate || candidate.kind !== 'nonterminal' || candidate.name !== 'identifier') {
        return;
      }
      if (findFirstIdentifierValue(candidate) === 'arguments') {
        usesArguments = true;
      }
    });
    return usesArguments;
  }

  function collectLocalFunctionArgumentsInfo(tree) {
    const info = new Map();

    const declarations = [
      ...collectTopLevelFunctionDeclarations(tree),
      ...extractTopLevelStatementNodes(tree)
        .map(extractAsyncFunctionDeclarationFromStatement)
        .filter(Boolean)
    ];
    for (const functionDeclaration of declarations) {
      const functionName = extractFunctionDeclarationName(functionDeclaration);
      if (!functionName) {
        continue;
      }
      const formalCount = extractFunctionParameterNames(functionDeclaration).length;
      info.set(functionName, {
        usesArguments: functionBodyUsesArguments(functionDeclaration),
        formalCount,
        maxCallArity: formalCount
      });
    }

    for (const { bindingName, functionExpressionNode } of collectTopLevelFunctionExpressionBindings(tree)) {
      const formalCount = extractFunctionParameterNames(functionExpressionNode).length;
      info.set(bindingName, {
        usesArguments: functionBodyUsesArguments(functionExpressionNode),
        formalCount,
        maxCallArity: formalCount
      });
    }

    for (const { bindingName, arrowFunctionNode } of collectTopLevelArrowFunctionBindings(tree)) {
      const formalCount = extractLambdaParameterNames(arrowFunctionNode).length;
      info.set(bindingName, {
        usesArguments: false,
        formalCount,
        maxCallArity: formalCount
      });
    }

    walk(tree, (node) => {
      if (!node || node.kind !== 'nonterminal' || node.name !== 'callExpression') {
        return;
      }

      const children = node.children || [];
      const memberExprNode = extractOutermostCallMemberExpression(node);
      const argsNode = children.find((child) => child && child.kind === 'nonterminal' && child.name === 'arguments') || null;
      if (!memberExprNode || !argsNode) {
        return;
      }

      const pathSegments = extractPathFromMemberExpression(memberExprNode, null);
      if (!Array.isArray(pathSegments) || pathSegments.length !== 1) {
        return;
      }

      const functionInfo = info.get(pathSegments[0]) || null;
      if (!functionInfo) {
        return;
      }

      const argListNode = (argsNode.children || []).find(
        (child) => child && child.kind === 'nonterminal' && child.name === 'argumentList'
      ) || findFirstNonterminal(argsNode, 'argumentList');
      const argCount = argListNode ? collectArgumentExpressions(argListNode).length : 0;
      functionInfo.maxCallArity = Math.max(functionInfo.maxCallArity, argCount);
    });

    return info;
  }

  function collectTopLevelBindingNames(tree) {
    const names = new Set();

    for (const statementNode of extractTopLevelStatementNodes(tree)) {
      const declarationNode = (statementNode.children || []).find(
        (child) => child
          && child.kind === 'nonterminal'
          && (child.name === 'variableStatement' || child.name === 'letDeclaration' || child.name === 'constDeclaration')
      );
      if (!declarationNode) {
        continue;
      }

      walk(declarationNode, (candidate) => {
        if (!candidate || candidate.kind !== 'nonterminal' || candidate.name !== 'bindingIdentifier') {
          return;
        }

        const name = findFirstIdentifierValue(candidate);
        if (name) {
          names.add(name);
        }
      });
    }

    return names;
  }

  function collectTopLevelClassNames(tree) {
    const names = new Set();

    for (const classNode of collectTopLevelClassDeclarations(tree)) {
      const className = extractClassDeclarationName(classNode);
      if (className) {
        names.add(className);
      }
    }

    return names;
  }

  function collectTopLevelClassHeritageMap(tree) {
    const heritageMap = new Map();

    for (const classNode of collectTopLevelClassDeclarations(tree)) {
      const className = extractClassDeclarationName(classNode);
      const heritageName = extractClassHeritageName(classNode);
      if (className && heritageName) {
        heritageMap.set(className, heritageName);
      }
    }

    return heritageMap;
  }

  function collectTopLevelLambdaBindingInfo(tree) {
    const bindings = new Map();
    const topLevelBindingNames = collectTopLevelBindingNames(tree);
    const lambdaCompileContext = {
      tree,
      topLevelBindingNames,
      localFunctionNames: collectTopLevelFunctionNames(tree)
    };

    function collectCaptureAwareBindingInfoFromExpression(exprNode) {
      let captureAwareBindingInfo = null;
      walk(exprNode, (candidate) => {
        if (captureAwareBindingInfo || !candidate || candidate.kind !== 'nonterminal') {
          return;
        }
        if (candidate.name !== 'arrowFunction' && candidate.name !== 'asyncArrowFunction') {
          return;
        }

        const captureCount = collectLambdaCaptureNames(candidate, lambdaCompileContext).length;
        if (captureCount > 0) {
          captureAwareBindingInfo = {
            isAsync: candidate.name === 'asyncArrowFunction'
          };
        }
      });

      return captureAwareBindingInfo;
    }

    for (const statementNode of extractTopLevelStatementNodes(tree)) {
      const declarationNode = (statementNode.children || []).find(
        (child) => child
          && child.kind === 'nonterminal'
          && (child.name === 'variableStatement' || child.name === 'letDeclaration' || child.name === 'constDeclaration')
      );
      if (!declarationNode) {
        continue;
      }

      const variableDeclarationList = (declarationNode.children || []).find(
        (child) => child && child.kind === 'nonterminal' && child.name === 'variableDeclarationList'
      );
      const declarations = extractVariableDeclarations(variableDeclarationList);
      for (const variableDeclaration of declarations) {
        const variableName = extractVariableDeclarationName(variableDeclaration);
        const initializerExpr = extractVariableDeclarationInitializer(variableDeclaration);
        if (!variableName || !initializerExpr) {
          continue;
        }

        const captureAwareBindingInfo = collectCaptureAwareBindingInfoFromExpression(initializerExpr);

        if (captureAwareBindingInfo) {
          bindings.set(variableName, captureAwareBindingInfo);
        }
      }
    }

    for (const statementNode of extractTopLevelStatementNodes(tree)) {
      const expressionStatementNode = (statementNode.children || []).find(
        (child) => child && child.kind === 'nonterminal' && child.name === 'expressionStatement'
      );
      if (!expressionStatementNode) {
        continue;
      }

      const expressionNode = (expressionStatementNode.children || []).find(
        (child) => child && child.kind === 'nonterminal' && child.name === 'expression'
      );
      const assignmentExpressionNode = expressionNode ? (expressionNode.children || []).find(
        (child) => child && child.kind === 'nonterminal' && child.name === 'assignmentExpression'
      ) : null;
      if (!assignmentExpressionNode) {
        continue;
      }

      const assignmentChildren = assignmentExpressionNode.children || [];
      if (assignmentChildren.length !== 3
        || !assignmentChildren[0]
        || assignmentChildren[0].kind !== 'nonterminal'
        || assignmentChildren[0].name !== 'leftHandSideExpression'
        || !assignmentChildren[1]
        || assignmentChildren[1].kind !== 'nonterminal'
        || assignmentChildren[1].name !== 'assignmentOperator'
        || !assignmentChildren[2]
        || assignmentChildren[2].kind !== 'nonterminal'
        || assignmentChildren[2].name !== 'assignmentExpression') {
        continue;
      }

      const operatorToken = (assignmentChildren[1].children || []).find(
        (child) => child && child.kind === 'terminal'
      );
      if (!operatorToken || operatorToken.value !== '=') {
        continue;
      }

      const lhsIdentifier = lowerIdentifierFromLeftHandSideExpression(assignmentChildren[0]);
      if (!lhsIdentifier || !topLevelBindingNames.has(lhsIdentifier)) {
        continue;
      }

      const captureAwareBindingInfo = collectCaptureAwareBindingInfoFromExpression(assignmentChildren[2]);
      if (!captureAwareBindingInfo) {
        continue;
      }

      bindings.set(lhsIdentifier, captureAwareBindingInfo);
    }

    return bindings;
  }


  return {
    extractTopLevelStatementNodes,
    extractFunctionDeclarationFromStatement,
    extractAsyncFunctionDeclarationFromStatement,
    collectTopLevelFunctionDeclarations,
    extractDirectFunctionExpressionInitializer,
    extractDirectArrowFunctionInitializer,
    extractDirectCallableInitializer,
    collectTopLevelArrowFunctionBindings,
    collectTopLevelFunctionExpressionBindings,
    sanitizeFunctionSymbolSuffix,
    collectTopLevelAssignedFunctionExpressionBindings,
    collectTopLevelObjectLiteralFunctionExpressionBindings,
    collectTopLevelObjectLiteralPropertyTypeInfo,
    collectTopLevelPrototypeHeritageMap,
    collectTopLevelCallArgumentFunctionExpressionBindings,
    collectTopLevelForEachArrowFunctionBindings,
    nodeContainsThisReference,
    collectNewExpressionTargetNames,
    collectTopLevelConstructorFunctionExpressionBindings,
    rewriteConstructorThisReferences,
    rewriteObjectLiteralMethodThisReferences,
    extractClassDeclarationFromStatement,
    collectTopLevelClassDeclarations,
    extractClassDeclarationName,
    extractClassHeritageName,
    extractClassMethodDefinitions,
    extractClassMethodEntries,
    extractMethodDefinitionName,
    extractMethodParameterNames,
    extractFunctionDeclarationName,
    collectTopLevelFunctionNames,
    functionBodyUsesArguments,
    collectLocalFunctionArgumentsInfo,
    collectTopLevelBindingNames,
    collectTopLevelClassNames,
    collectTopLevelClassHeritageMap,
    collectTopLevelLambdaBindingInfo
  };
}

module.exports = { createAstCollectors };
