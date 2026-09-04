#!/usr/bin/env node

'use strict';

const fs = require('fs');
const path = require('path');
const Parser = require('./ecmascript-parser');
const { ParseTreeCollector, printTree } = require('./parse-tree-collector');
const { HostRegistry } = require('./ecmascript/host-registry');
const { buildAsyncIR } = require('./ecmascript/async-ir');

function usage() {
  console.log(`Usage: ecmascript-compiler.js --file <input.js> [options]

Options:
  --file FILE          Input ECMAScript source file.
  --strict-lowering    Fail on unsupported lowering/fallback paths.
  --ast-show           Print AST tree to stdout.
  --ast-xml-out FILE   Write AST XML.
  --ast-json-out FILE  Write AST JSON.
  --cpp-out FILE       Write generated C++98 output.
  --ir-json-out FILE   Write intermediate IR JSON (placeholder for now).
  -h, --help           Show this help.
`);
}

function err(message) {
  console.error(`Error: ${message}`);
  process.exit(1);
}

function ensureParentDir(filePath) {
  const dir = path.dirname(path.resolve(filePath));
  fs.mkdirSync(dir, { recursive: true });
}

const PROFILE_ENABLED = process.env.MAIAJS_PROFILE === '1';

function profileLog(message) {
  if (!PROFILE_ENABLED) return;
  const ts = new Date().toISOString();
  process.stderr.write(`[MAIAJS_PROFILE ${ts}] ${message}\n`);
}

function profileStep(label, fn) {
  const started = Date.now();
  profileLog(`START ${label}`);
  const result = fn();
  const elapsed = Date.now() - started;
  profileLog(`END ${label} (${elapsed}ms)`);
  return result;
}

function toJsonTree(node) {
  if (Array.isArray(node)) {
    return node.map(toJsonTree);
  }
  if (!node || typeof node !== 'object') {
    return node;
  }

  const out = {};
  for (const [k, v] of Object.entries(node)) {
    if (k === 'parent') continue;
    out[k] = toJsonTree(v);
  }
  return out;
}

function parseArgs(argv) {
  const options = {
    file: '',
    strictLowering: process.env.MAIAJS_STRICT_LOWERING === '1',
    astShow: false,
    astXmlOut: '',
    astJsonOut: '',
    cppOut: '',
    irJsonOut: ''
  };

  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    switch (a) {
      case '--file':
        if (i + 1 >= argv.length) err('missing value for --file');
        options.file = argv[++i];
        break;
      case '--strict-lowering':
        options.strictLowering = true;
        break;
      case '--ast-show':
        options.astShow = true;
        break;
      case '--ast-xml-out':
        if (i + 1 >= argv.length) err('missing value for --ast-xml-out');
        options.astXmlOut = argv[++i];
        break;
      case '--ast-json-out':
        if (i + 1 >= argv.length) err('missing value for --ast-json-out');
        options.astJsonOut = argv[++i];
        break;
      case '--cpp-out':
        if (i + 1 >= argv.length) err('missing value for --cpp-out');
        options.cppOut = argv[++i];
        break;
      case '--ir-json-out':
        if (i + 1 >= argv.length) err('missing value for --ir-json-out');
        options.irJsonOut = argv[++i];
        break;
      case '-h':
      case '--help':
        usage();
        process.exit(0);
        break;
      default:
        err(`unknown option: ${a}`);
    }
  }

  if (!options.file) err('missing required --file <input.js>');
  return options;
}

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

const TREE_NAV_CACHE = new WeakMap();
const FIRST_NONTERMINAL_CACHE = new WeakMap();
const FIRST_NONTERMINAL_MISS = Symbol('first-nonterminal-miss');

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

function extractPathFromMemberExpression(memberExpressionNode, compileContext = null) {
  if (!memberExpressionNode || memberExpressionNode.kind !== 'nonterminal' || memberExpressionNode.name !== 'memberExpression') {
    if (compileContext) {
      reportUnsupportedLowering(
        compileContext,
        'member-expression-path-unlowerable',
        'memberExpression node is missing or malformed'
      );
      if (compileContext.strictLowering) {
        err('unsupported lowering: memberExpression node');
      }
    }
    return null;
  }

  const children = Array.isArray(memberExpressionNode.children) ? memberExpressionNode.children : [];
  if (children.length === 0) {
    if (compileContext) {
      reportUnsupportedLowering(
        compileContext,
        'member-expression-path-unlowerable',
        'memberExpression has no children to resolve path'
      );
      if (compileContext.strictLowering) {
        err('unsupported lowering: memberExpression empty children');
      }
    }
    return null;
  }

  // Support 'this' as the base of a member expression
  let base = findFirstIdentifierValue(children[0]);
  if (!base) {
    // Check for TOKEN_this inside the first child
    const firstTerminal = (() => {
      let found = null;
      walk(children[0], (n) => {
        if (found) return;
        if (n.kind === 'terminal' && n.token === 'TOKEN_this') { found = 'this'; }
      });
      return found;
    })();
    if (firstTerminal) {
      base = firstTerminal;
    } else {
      if (compileContext) {
        reportUnsupportedLowering(
          compileContext,
          'member-expression-path-unlowerable',
          'memberExpression base identifier could not be resolved'
        );
        if (compileContext.strictLowering) {
          err('unsupported lowering: memberExpression base identifier');
        }
      }
      return null;
    }
  }

  const pathSegments = [base];
  for (let i = 1; i < children.length; i += 1) {
    const child = children[i];
    if (!child || child.kind !== 'terminal') {
      continue;
    }

    if (child.value !== '.') {
      if (compileContext && (child.token === 'TOKEN__5B_' || child.token === 'TOKEN__5D_')) {
        reportUnsupportedLowering(
          compileContext,
          'member-expression-path-unlowerable',
          'computed member access is not supported in member path lowering'
        );
        if (compileContext.strictLowering) {
          err('unsupported lowering: computed member access');
        }
        return null;
      }
      continue;
    }

    const next = children[i + 1];
    if (!next || next.kind !== 'nonterminal') {
      if (compileContext) {
        reportUnsupportedLowering(
          compileContext,
          'member-expression-path-unlowerable',
          'memberExpression dot access is missing nonterminal property node'
        );
        if (compileContext.strictLowering) {
          err('unsupported lowering: memberExpression dot property node');
        }
      }
      continue;
    }
    if (next.name !== 'propertyIdentifierName' && next.name !== 'identifierName') {
      if (compileContext) {
        reportUnsupportedLowering(
          compileContext,
          'member-expression-path-unlowerable',
          `memberExpression property node kind '${next.name}' is not supported`
        );
        if (compileContext.strictLowering) {
          err(`unsupported lowering: memberExpression property node '${next.name}'`);
        }
      }
      continue;
    }

    const suffix = findFirstIdentifierValue(next);
    if (!suffix) {
      if (compileContext) {
        reportUnsupportedLowering(
          compileContext,
          'member-expression-path-unlowerable',
          'memberExpression property identifier could not be resolved'
        );
        if (compileContext.strictLowering) {
          err('unsupported lowering: memberExpression property identifier');
        }
      }
      continue;
    }
    pathSegments.push(suffix);
  }

  return pathSegments;
}

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
    || (functionDeclarationNode.name !== 'functionDeclaration' && functionDeclarationNode.name !== 'asyncFunctionDeclaration')) {
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

function extractCaptureAwareLambdaBindingInfoFromExpression(exprNode, lambdaCompileContext) {
  if (!exprNode) {
    return null;
  }

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

function collectVisibleLambdaBindingStatesAtNode(targetNode, compileContext) {
  const states = new Map();
  if (!targetNode || !compileContext || !compileContext.tree) {
    return states;
  }

  const path = findNodePath(compileContext.tree, targetNode);
  if (path.length === 0) {
    return states;
  }

  const scopeContainers = [{ container: compileContext.tree, parent: null }];
  for (const node of path) {
    if (!node || node === compileContext.tree || node.kind !== 'nonterminal') {
      continue;
    }
    if (node.name === 'functionBody' || node.name === 'asyncFunctionBody' || node.name === 'block') {
      const parent = path[path.indexOf(node) - 1] || null;
      scopeContainers.push({ container: node, parent });
    }
  }

  const lambdaCompileContext = {
    tree: compileContext.tree,
    topLevelBindingNames: compileContext.topLevelBindingNames || new Set(),
    localFunctionNames: compileContext.localFunctionNames || new Set()
  };

  function applyBindingState(name, valueExprNode) {
    if (!name) {
      return;
    }
    const captureAwareInfo = extractCaptureAwareLambdaBindingInfoFromExpression(valueExprNode, lambdaCompileContext);
    if (captureAwareInfo) {
      states.set(name, {
        isCaptureAware: true,
        isAsync: captureAwareInfo.isAsync
      });
      return;
    }

    states.set(name, {
      isCaptureAware: false,
      isAsync: false
    });
  }

  function processStatement(statementNode) {
    const functionDeclarationNode = extractFunctionDeclarationFromStatement(statementNode);
    if (functionDeclarationNode) {
      const functionName = extractFunctionDeclarationName(functionDeclarationNode);
      if (functionName) {
        states.set(functionName, {
          isCaptureAware: false,
          isAsync: false
        });
      }
    }

    const declarationNode = (statementNode.children || []).find(
      (child) => child
        && child.kind === 'nonterminal'
        && (child.name === 'variableStatement' || child.name === 'letDeclaration' || child.name === 'constDeclaration')
    );
    if (declarationNode) {
      const variableDeclarationList = (declarationNode.children || []).find(
        (child) => child && child.kind === 'nonterminal' && child.name === 'variableDeclarationList'
      );
      const declarations = extractVariableDeclarations(variableDeclarationList);
      for (const declaration of declarations) {
        const bindingName = extractVariableDeclarationName(declaration);
        const initializerExpr = extractVariableDeclarationInitializer(declaration);
        applyBindingState(bindingName, initializerExpr);
      }
    }

    const expressionStatementNode = (statementNode.children || []).find(
      (child) => child && child.kind === 'nonterminal' && child.name === 'expressionStatement'
    );
    if (!expressionStatementNode) {
      return;
    }

    const expressionNode = (expressionStatementNode.children || []).find(
      (child) => child && child.kind === 'nonterminal' && child.name === 'expression'
    );
    const assignmentExpressionNode = expressionNode ? (expressionNode.children || []).find(
      (child) => child && child.kind === 'nonterminal' && child.name === 'assignmentExpression'
    ) : null;
    if (!assignmentExpressionNode) {
      return;
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
      return;
    }

    const operatorToken = (assignmentChildren[1].children || []).find(
      (child) => child && child.kind === 'terminal'
    );
    if (!operatorToken || operatorToken.value !== '=') {
      return;
    }

    const lhsIdentifier = lowerIdentifierFromLeftHandSideExpression(assignmentChildren[0]);
    applyBindingState(lhsIdentifier, assignmentChildren[2]);
  }

  for (const scopeInfo of scopeContainers) {
    const scopeContainer = scopeInfo.container;
    if ((scopeContainer.name === 'functionBody' || scopeContainer.name === 'asyncFunctionBody')
      && scopeInfo.parent
      && scopeInfo.parent.kind === 'nonterminal') {
      const parameterNames = extractFormalParameterNamesFromNode(scopeInfo.parent);
      for (const parameterName of parameterNames) {
        states.set(parameterName, {
          isCaptureAware: false,
          isAsync: false
        });
      }
    }

    const scopeStatements = scopeContainer === compileContext.tree
      ? extractTopLevelStatementNodes(compileContext.tree)
      : extractStatementsFromScopeContainer(scopeContainer);

    for (const scopeStatement of scopeStatements) {
      if (!scopeStatement) {
        continue;
      }

      const functionDeclarationNode = extractFunctionDeclarationFromStatement(scopeStatement);
      if (!functionDeclarationNode) {
        continue;
      }

      const functionName = extractFunctionDeclarationName(functionDeclarationNode);
      if (!functionName) {
        continue;
      }

      // Function declarations are visible for the full scope, so pre-register
      // them before statement-order traversal to avoid selector misrouting.
      states.set(functionName, {
        isCaptureAware: false,
        isAsync: false
      });
    }

    for (const statementNode of scopeStatements) {
      if (!statementNode) {
        continue;
      }

      if (nodeContainsTarget(statementNode, targetNode)) {
        break;
      }

      processStatement(statementNode);
    }
  }

  return states;
}

function getLambdaBindingStateAtCallNode(callNode, pathSegments, compileContext) {
  if (!Array.isArray(pathSegments)
    || pathSegments.length !== 1
    || !compileContext
    || !callNode) {
    return null;
  }

  const visibleStates = collectVisibleLambdaBindingStatesAtNode(callNode, compileContext);
  return visibleStates.get(pathSegments[0]) || null;
}

function collectVisibleVariableBindingsAtNode(targetNode, compileContext) {
  const bindings = new Map();
  if (!compileContext || !compileContext.tree || !targetNode) {
    return bindings;
  }
  if (compileContext._visibleVariableBindingsCache && compileContext._visibleVariableBindingsCache.has(targetNode)) {
    return compileContext._visibleVariableBindingsCache.get(targetNode);
  }

  function extractRootBindingNameFromExpressionNode(expressionNode) {
    if (!expressionNode || expressionNode.kind !== 'nonterminal') {
      return null;
    }
    const directIdentifier = expressionNode.name === 'identifier'
      ? findFirstIdentifierValue(expressionNode)
      : null;
    if (directIdentifier) {
      return directIdentifier;
    }
    const memberExprNode = expressionNode.name === 'memberExpression'
      ? expressionNode
      : findFirstNonterminal(expressionNode, 'memberExpression');
    if (memberExprNode) {
      const pathSegments = extractPathFromMemberExpression(memberExprNode, null);
      if (Array.isArray(pathSegments) && pathSegments.length > 0) {
        return pathSegments[0];
      }
    }
    return findFirstIdentifierValue(expressionNode) || null;
  }

  function collectMutatedBindingNamesFromExpression(expressionNode) {
    const mutatedNames = new Set();
    if (!expressionNode || expressionNode.kind !== 'nonterminal') {
      return mutatedNames;
    }

    const assignmentExpressionNode = expressionNode.name === 'assignmentExpression'
      ? expressionNode
      : findFirstNonterminal(expressionNode, 'assignmentExpression');
    if (assignmentExpressionNode) {
      const assignmentChildren = assignmentExpressionNode.children || [];
      if (assignmentChildren.length === 3) {
        const lhsIdentifier = lowerIdentifierFromLeftHandSideExpression(assignmentChildren[0], null);
        let operatorToken = (assignmentChildren[1] && assignmentChildren[1].children || []).find(
          (child) => child && child.kind === 'terminal'
        ) || null;
        if (!operatorToken && assignmentChildren[1]) {
          walk(assignmentChildren[1], (child) => {
            if (!operatorToken && child && child.kind === 'terminal') {
              operatorToken = child;
            }
          });
        }
        const operatorValue = String(operatorToken && operatorToken.value || '').trim();
        if (lhsIdentifier && lhsIdentifier.includes('.')) {
          mutatedNames.add(lhsIdentifier.split('.')[0]);
        } else if (lhsIdentifier && operatorValue && operatorValue !== '=') {
          mutatedNames.add(lhsIdentifier);
        }
      }
    }

    const callExpressionNode = extractDirectCallExpressionNode(expressionNode);
    if (callExpressionNode) {
      const { memberExprNode, argExprs } = extractCallExpressionMemberAndArgs(callExpressionNode);
      const pathSegments = memberExprNode ? extractPathFromMemberExpression(memberExprNode, null) : null;
      const pathLabel = Array.isArray(pathSegments) ? pathSegments.join('.') : '';
      if ((pathLabel === 'Reflect.set' || pathLabel === 'Reflect.deleteProperty' || pathLabel === 'Object.defineProperty')
        && argExprs.length >= 1) {
        const targetName = extractRootBindingNameFromExpressionNode(argExprs[0]);
        if (targetName) {
          mutatedNames.add(targetName);
        }
      }
      if (pathLabel === 'Object.assign' && argExprs.length >= 1) {
        const targetName = extractRootBindingNameFromExpressionNode(argExprs[0]);
        if (targetName) {
          mutatedNames.add(targetName);
        }
      }
    }

    return mutatedNames;
  }

  const path = findNodePath(compileContext.tree, targetNode);
  const scopeContainers = [compileContext.tree];

  for (const node of path) {
    if (!node || node === compileContext.tree || node.kind !== 'nonterminal') {
      continue;
    }
    if (node.name === 'functionBody' || node.name === 'asyncFunctionBody' || node.name === 'block') {
      scopeContainers.push(node);
    }
  }

  function processStatement(statementNode) {
    const declarationNode = (statementNode.children || []).find(
      (child) => child
        && child.kind === 'nonterminal'
        && (child.name === 'variableStatement' || child.name === 'letDeclaration' || child.name === 'constDeclaration' || child.name === 'lexicalDeclaration')
    ) || findFirstNonterminal(statementNode, 'variableStatement')
      || findFirstNonterminal(statementNode, 'letDeclaration')
      || findFirstNonterminal(statementNode, 'constDeclaration')
      || findFirstNonterminal(statementNode, 'lexicalDeclaration');
    if (declarationNode) {
      const declarationIsConst = declarationNode.name === 'constDeclaration'
        || Boolean(findFirstTerminalByToken(declarationNode, 'TOKEN_const'));
      const variableDeclarationList = (declarationNode.children || []).find(
        (child) => child && child.kind === 'nonterminal' && child.name === 'variableDeclarationList'
      ) || findFirstNonterminal(declarationNode, 'variableDeclarationList');
      const declarations = extractVariableDeclarations(variableDeclarationList);
      for (const declaration of declarations) {
        const bindingName = extractVariableDeclarationName(declaration);
        if (!bindingName) {
          const bindingPattern = (declaration.children || []).find(
            (child) => child && child.kind === 'nonterminal' && child.name === 'bindingPattern'
          );
          const arrayBindingPattern = bindingPattern && findFirstNonterminal(bindingPattern, 'arrayBindingPattern');
          const objectBindingPattern = bindingPattern && findFirstNonterminal(bindingPattern, 'objectBindingPattern');
          const initializerExpression = extractVariableDeclarationInitializer(declaration);
          const arrayBindings = extractSimpleArrayBindingEntries(arrayBindingPattern);
          if (arrayBindings && initializerExpression) {
            for (const arrayBinding of arrayBindings) {
              bindings.set(arrayBinding.name, {
                kind: declarationIsConst ? 'initializer' : 'mutable-binding',
                expressionNode: initializerExpression,
                staticProjection: { kind: 'array-index', index: arrayBinding.index }
              });
            }
          }
          const objectBindings = extractSimpleObjectBindingEntries(objectBindingPattern);
          if (objectBindings && initializerExpression) {
            for (const objectBinding of objectBindings) {
              bindings.set(objectBinding.name, {
                kind: declarationIsConst ? 'initializer' : 'mutable-binding',
                expressionNode: initializerExpression,
                staticProjection: { kind: 'object-property', property: objectBinding.property }
              });
            }
          }
          continue;
        }
        bindings.set(bindingName, {
          kind: declarationIsConst ? 'initializer' : 'mutable-binding',
          expressionNode: extractVariableDeclarationInitializer(declaration)
        });
      }
    }

    const expressionStatementNode = (statementNode.children || []).find(
      (child) => child && child.kind === 'nonterminal' && child.name === 'expressionStatement'
    );
    if (!expressionStatementNode) {
      return;
    }

    const expressionNode = (expressionStatementNode.children || []).find(
      (child) => child && child.kind === 'nonterminal' && child.name === 'expression'
    ) || null;
    const mutatedBindingNames = collectMutatedBindingNamesFromExpression(expressionNode);
    for (const bindingName of mutatedBindingNames) {
      bindings.set(bindingName, { kind: 'mutated' });
    }
    const assignmentExpressionNode = expressionNode ? (expressionNode.children || []).find(
      (child) => child && child.kind === 'nonterminal' && child.name === 'assignmentExpression'
    ) : null;
    if (!assignmentExpressionNode) {
      return;
    }

    const assignmentChildren = assignmentExpressionNode.children || [];
    if (assignmentChildren.length !== 3) {
      return;
    }
    const operatorToken = (assignmentChildren[1].children || []).find(
      (child) => child && child.kind === 'terminal'
    );
    if (!operatorToken || operatorToken.value !== '=') {
      return;
    }

    const lhsIdentifier = lowerIdentifierFromLeftHandSideExpression(assignmentChildren[0], null);
    if (!lhsIdentifier || lhsIdentifier.includes('.')) {
      return;
    }
    bindings.set(lhsIdentifier, { kind: 'mutated' });
  }

  for (const scopeContainer of scopeContainers) {
    const scopeStatements = scopeContainer === compileContext.tree
      ? extractTopLevelStatementNodes(compileContext.tree)
      : extractStatementsFromScopeContainer(scopeContainer);

    if (scopeContainer !== compileContext.tree) {
      const parent = path[path.indexOf(scopeContainer) - 1] || null;
      if (parent && parent.kind === 'nonterminal') {
        for (const parameterName of extractFormalParameterNamesFromNode(parent)) {
          bindings.set(parameterName, { kind: 'parameter' });
        }
      }
    }

    for (const statementNode of scopeStatements) {
      if (!statementNode) {
        continue;
      }
      if (nodeContainsTarget(statementNode, targetNode)) {
        break;
      }
      processStatement(statementNode);
    }
  }

  for (let i = path.length - 1; i >= 0; i -= 1) {
    const current = path[i];
    if (!current || current.kind !== 'nonterminal' || current.name !== 'catch') {
      continue;
    }
    const catchIdentifier = findFirstNonterminal(current, 'identifier');
    const catchBlock = findFirstNonterminal(current, 'block');
    if (catchIdentifier && catchBlock && nodeContainsTarget(catchBlock, targetNode)) {
      const catchParam = findFirstIdentifierValue(catchIdentifier);
      if (catchParam) {
        bindings.set(catchParam, { kind: 'catch-param' });
      }
      break;
    }
  }

  if (compileContext._visibleVariableBindingsCache) {
    compileContext._visibleVariableBindingsCache.set(targetNode, bindings);
  }
  return bindings;
}

function staticStringLiteralCpp(value) {
  return JSON.stringify(value == null ? '' : String(value));
}

function extractComputedMemberAccessInfo(memberExpressionNode) {
  if (!memberExpressionNode || memberExpressionNode.kind !== 'nonterminal' || memberExpressionNode.name !== 'memberExpression') {
    return null;
  }

  const children = memberExpressionNode.children || [];
  let openIndex = -1;
  for (let i = children.length - 1; i >= 0; i -= 1) {
    const child = children[i];
    if (child && child.kind === 'terminal' && child.token === 'TOKEN__5B_') {
      openIndex = i;
      break;
    }
  }
  const closeIndex = children.findIndex((child, index) => index > openIndex && child && child.kind === 'terminal' && child.token === 'TOKEN__5D_');
  if (openIndex <= 0 || closeIndex <= openIndex + 1) {
    return null;
  }

  let baseExpressionNode = null;
  if (openIndex === 1) {
    baseExpressionNode = children[0] || null;
  } else if (openIndex > 1) {
    baseExpressionNode = {
      kind: 'nonterminal',
      name: 'memberExpression',
      children: children.slice(0, openIndex)
    };
  }
  const propertyExpressionNode = children.slice(openIndex + 1, closeIndex).find(
    (child) => child && child.kind === 'nonterminal'
  ) || null;
  if (!baseExpressionNode || !propertyExpressionNode) {
    return null;
  }

  return {
    baseExpressionNode,
    propertyExpressionNode
  };
}

function lowerComputedMemberAccessValue(computedInfo, compileContext) {
  if (!computedInfo) {
    return null;
  }

  const loweredBase = lowerExpressionValue(computedInfo.baseExpressionNode, compileContext);
  const loweredProperty = lowerExpressionValue(computedInfo.propertyExpressionNode, compileContext);
  if (loweredBase === null || loweredProperty === null) {
    return null;
  }
  let normalizedBase = loweredBase;

  if (compileContext
    && /__maia_runtime_value_(?:get_index|get_property)\(/.test(loweredBase)) {
    if (!Array.isArray(compileContext._preludeStatements)) {
      compileContext._preludeStatements = [];
    }
    if (compileContext._memberValueTempCount === undefined) {
      compileContext._memberValueTempCount = 0;
    }
    const tempName = `__maia_member_value_tmp${compileContext._memberValueTempCount++}`;
    compileContext._preludeStatements.push(`long ${tempName} = (long)(${loweredBase});`);
    normalizedBase = tempName;
  }

  const baseModel = compileContext
    ? resolveStaticModelFromExpression(computedInfo.baseExpressionNode, computedInfo.baseExpressionNode, compileContext)
    : null;
  const propertyModel = compileContext
    ? resolveStaticModelFromExpression(computedInfo.propertyExpressionNode, computedInfo.propertyExpressionNode, compileContext)
    : null;

  if (propertyModel && propertyModel.kind === 'string') {
    return `__maia_runtime_value_get_property((void*)(${normalizedBase}), (void*)${JSON.stringify(propertyModel.value)})`;
  }

  if (baseModel && baseModel.kind === 'object') {
    reportUnsupportedLowering(
      compileContext,
      'computed-member-object-unlowerable',
      'dynamic object computed property access requires a static string key'
    );
    return '0';
  }

  return `__maia_runtime_value_get_index((void*)(${normalizedBase}), (int)(${loweredProperty}))`;
}

function resolveStaticModelFromExpression(expressionNode, targetNode, compileContext, seenBindings = new Set()) {
  if (!expressionNode || expressionNode.kind !== 'nonterminal') {
    return null;
  }

  let containsUpdateOperator = false;
  walk(expressionNode, (candidate) => {
    if (containsUpdateOperator || !candidate || candidate.kind !== 'terminal') {
      return;
    }
    if (candidate.token === 'TOKEN__2B__2B_' || candidate.token === 'TOKEN__2D__2D_') {
      containsUpdateOperator = true;
    }
  });
  if (containsUpdateOperator) {
    return null;
  }

  const canUseCache = compileContext
    && compileContext._staticModelCache
    && targetNode
    && seenBindings
    && seenBindings.size === 0;
  if (canUseCache) {
    const perTargetCache = compileContext._staticModelCache.get(targetNode);
    if (perTargetCache && perTargetCache.has(expressionNode)) {
      const cached = perTargetCache.get(expressionNode);
      return cached === compileContext._staticModelNullSentinel ? null : cached;
    }
  }
  const finish = (model) => {
    if (canUseCache) {
      let perTargetCache = compileContext._staticModelCache.get(targetNode);
      if (!perTargetCache) {
        perTargetCache = new WeakMap();
        compileContext._staticModelCache.set(targetNode, perTargetCache);
      }
      perTargetCache.set(expressionNode, model === null ? compileContext._staticModelNullSentinel : model);
    }
    return model;
  };

  const flatPrimitiveModel = resolveFlatStaticPrimitiveModel(expressionNode);
  if (flatPrimitiveModel) {
    return finish(flatPrimitiveModel);
  }

  const flattenedExpression = flattenNodeText(expressionNode);
  if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(flattenedExpression)) {
    const identifierName = flattenedExpression;
    if (!seenBindings.has(identifierName)) {
      const visibleBindings = collectVisibleVariableBindingsAtNode(targetNode, compileContext);
      const bindingInfo = visibleBindings.get(identifierName) || null;
      if (bindingInfo && bindingInfo.kind === 'initializer' && bindingInfo.expressionNode) {
        seenBindings.add(identifierName);
        const sourceModel = resolveStaticModelFromExpression(
          bindingInfo.expressionNode,
          targetNode,
          compileContext,
          seenBindings
        );
        seenBindings.delete(identifierName);
        if (bindingInfo.staticProjection && bindingInfo.staticProjection.kind === 'array-index'
          && sourceModel && sourceModel.kind === 'array' && Array.isArray(sourceModel.values)) {
          const projected = sourceModel.values[bindingInfo.staticProjection.index] || null;
          return finish(projected);
        }
        if (bindingInfo.staticProjection && bindingInfo.staticProjection.kind === 'object-property'
          && sourceModel && sourceModel.kind === 'object' && sourceModel.properties instanceof Map) {
          return finish(sourceModel.properties.get(bindingInfo.staticProjection.property) || null);
        }
        return finish(sourceModel);
      }
    }
  }
  if (flattenedExpression.startsWith('[') && flattenedExpression.endsWith(']')) {
    const directArrayLiteral = findFirstNonterminal(expressionNode, 'arrayLiteral');
    if (directArrayLiteral) {
      const arrayInfo = extractArrayLiteralElements(directArrayLiteral);
      if (!arrayInfo.hasSpread && !arrayInfo.hasElision) {
        const values = (arrayInfo.values || []).map(
          (valueNode) => resolveStaticModelFromExpression(valueNode, targetNode, compileContext, seenBindings)
        );
        return finish({ kind: 'array', length: values.length, values });
      }
    }
  }
  if (flattenedExpression.startsWith('{') && flattenedExpression.endsWith('}')) {
    const directObjectLiteral = findFirstNonterminal(expressionNode, 'objectLiteral');
    if (directObjectLiteral) {
      const properties = extractObjectLiteralProperties(directObjectLiteral, compileContext);
      const propertyMap = new Map();
      for (const property of properties) {
        propertyMap.set(
          property.key,
          resolveStaticModelFromExpression(property.valueExprNode, targetNode, compileContext, seenBindings)
        );
      }
      return finish({ kind: 'object', properties: propertyMap });
    }
  }

  let current = expressionNode;
  while (current && current.kind === 'nonterminal') {
    if (current.name === 'literal'
      || current.name === 'identifier'
      || current.name === 'arrayLiteral'
      || current.name === 'objectLiteral'
      || current.name === 'callExpression'
      || current.name === 'unaryExpression'
      || current.name === 'memberExpression') {
      break;
    }
    const nonterminalChildren = (current.children || []).filter(
      (child) => child && child.kind === 'nonterminal'
    );
    if (nonterminalChildren.length !== 1) {
      break;
    }
    current = nonterminalChildren[0];
  }

  if (current.name === 'literal') {
    const stringValue = extractStringLiteralValue(current);
    if (stringValue !== null) {
      return finish({ kind: 'string', value: stringValue });
    }
    const literalLowered = lowerLiteralValue(current, null);
    if (literalLowered === 'true' || literalLowered === 'false') {
      return finish({ kind: 'bool', value: literalLowered === 'true' ? 1 : 0 });
    }
    if (literalLowered === 'nullptr') {
      return finish({ kind: 'null', value: null });
    }
    if (literalLowered !== null && /^-?\d+(\.\d+)?$/.test(literalLowered)) {
      return finish({ kind: 'number', value: Number(literalLowered) });
    }
  }

  if (current.name === 'unaryExpression') {
    const children = current.children || [];
    const operatorToken = children.find(
      (child) => child
        && child.kind === 'terminal'
        && ['TOKEN__21_', 'TOKEN__2D_', 'TOKEN__2B_', 'TOKEN__7E_'].includes(child.token)
    ) || null;
    const operandNode = children.find((child) => child && child.kind === 'nonterminal') || null;
    if (!operatorToken || !operandNode) {
      return finish(null);
    }
    const operandModel = resolveStaticModelFromExpression(operandNode, targetNode, compileContext, seenBindings);
    if (!operandModel) {
      return finish(null);
    }
    if (operatorToken.token === 'TOKEN__2B_') {
      return finish(operandModel);
    }
    if (operatorToken.token === 'TOKEN__2D_' && operandModel.kind === 'number') {
      return finish({ kind: 'number', value: -Number(operandModel.value) });
    }
    if (operatorToken.token === 'TOKEN__7E_' && operandModel.kind === 'number') {
      return finish({ kind: 'number', value: ~Math.trunc(Number(operandModel.value)) });
    }
    if (operatorToken.token === 'TOKEN__21_') {
      let truthy = true;
      if (operandModel.kind === 'number' || operandModel.kind === 'bool') {
        truthy = Number(operandModel.value) !== 0;
      } else if (operandModel.kind === 'string') {
        truthy = !!operandModel.value;
      } else if (operandModel.kind === 'null') {
        truthy = false;
      } else {
        return finish(null);
      }
      return finish({ kind: 'bool', value: truthy ? 0 : 1 });
    }
    return finish(null);
  }

  if (current.name === 'identifier') {
    const identifierName = findFirstIdentifierValue(current);
    if (!identifierName || seenBindings.has(identifierName)) {
      return finish(null);
    }
    const visibleBindings = collectVisibleVariableBindingsAtNode(targetNode, compileContext);
    const bindingInfo = visibleBindings.get(identifierName) || null;
    if (!bindingInfo) {
      const initializerExpr = findBoundVariableInitializerExpressionAtNode(identifierName, targetNode, compileContext);
      if (!initializerExpr || initializerExpr === current) {
        return finish(null);
      }
      seenBindings.add(identifierName);
      const resolvedInitializer = resolveStaticModelFromExpression(
        initializerExpr,
        targetNode,
        compileContext,
        seenBindings
      );
      seenBindings.delete(identifierName);
      return finish(resolvedInitializer);
    }
    if (bindingInfo.kind === 'catch-param') {
      return finish({ kind: 'catch-param', name: identifierName });
    }
    if (bindingInfo.kind === 'mutated' || bindingInfo.kind === 'mutable-binding' || bindingInfo.kind === 'parameter') {
      return finish(null);
    }
    if (!bindingInfo.expressionNode) {
      return finish(null);
    }
    seenBindings.add(identifierName);
    const resolved = resolveStaticModelFromExpression(bindingInfo.expressionNode, targetNode, compileContext, seenBindings);
    seenBindings.delete(identifierName);
    return finish(resolved);
  }

  if (current.name === 'arrayLiteral') {
    const arrayInfo = extractArrayLiteralElements(current);
    if (!arrayInfo || arrayInfo.hasSpread || arrayInfo.hasElision) {
      return finish({ kind: 'array', length: arrayInfo && arrayInfo.operations ? arrayInfo.operations.length : 0 });
    }
    const values = (arrayInfo.values || []).map((valueNode) => resolveStaticModelFromExpression(valueNode, targetNode, compileContext, seenBindings));
    return finish({ kind: 'array', length: values.length, values });
  }

  if (current.name === 'objectLiteral') {
    const properties = extractObjectLiteralProperties(current, compileContext);
    const propertyMap = new Map();
    for (const property of properties) {
      propertyMap.set(property.key, resolveStaticModelFromExpression(property.valueExprNode, targetNode, compileContext, seenBindings));
    }
    return finish({ kind: 'object', properties: propertyMap });
  }

  if (current.name === 'callExpression') {
    const { memberExprNode, argsNode, argExprs } = extractCallExpressionMemberAndArgs(current);
    const pathSegments = memberExprNode ? extractPathFromMemberExpression(memberExprNode, null) : null;
    const pathLabel = Array.isArray(pathSegments) ? pathSegments.join('.') : '';
    const memberChildren = memberExprNode ? (memberExprNode.children || []) : [];
    const directPropertyIndex = memberChildren.findIndex((child) => child && child.kind === 'terminal' && child.value === '.');
    const directPropertyNode = directPropertyIndex >= 0 ? memberChildren[directPropertyIndex + 1] : null;
    const directPropertyName = directPropertyNode ? findFirstIdentifierValue(directPropertyNode) : null;
    const baseExpressionNode = directPropertyIndex > 0 ? memberChildren[0] : null;

    let staticCallModel = null;
    const directObjectArgNode = argExprs.length >= 1 ? unwrapExpressionNode(argExprs[0]) : null;
    const canFoldReflectiveObjectShape = directObjectArgNode
      && directObjectArgNode.kind === 'nonterminal'
      && directObjectArgNode.name === 'objectLiteral';

    if (canFoldReflectiveObjectShape
      && (pathLabel === 'Object.values' || pathLabel === 'Object.entries' || pathLabel === 'Reflect.ownKeys')
      && argExprs.length >= 1) {
      const sourceModel = resolveStaticModelFromExpression(argExprs[0], targetNode, compileContext, seenBindings);
      if (sourceModel && sourceModel.kind === 'object') {
        staticCallModel = { kind: 'array', length: sourceModel.properties.size };
      }
    }

    if (!staticCallModel
      && canFoldReflectiveObjectShape
      && pathLabel === 'Object.getOwnPropertyDescriptors'
      && argExprs.length >= 1) {
      const sourceModel = resolveStaticModelFromExpression(argExprs[0], targetNode, compileContext, seenBindings);
      if (sourceModel && sourceModel.kind === 'object') {
        const descriptorMap = new Map();
        for (const key of sourceModel.properties.keys()) {
          descriptorMap.set(key, {
            kind: 'object',
            properties: new Map([['enumerable', { kind: 'bool', value: 1 }]])
          });
        }
        staticCallModel = { kind: 'object', properties: descriptorMap };
      }
    }

    if (!staticCallModel && directPropertyName === 'filter') {
      const filteredModel = tryResolveStaticFilterResultModel(current, baseExpressionNode, argExprs, targetNode, compileContext, seenBindings);
      if (filteredModel) {
        staticCallModel = filteredModel;
      }
    }

    if (!staticCallModel && directPropertyName === 'map') {
      const mappedModel = tryResolveStaticMapResultModel(baseExpressionNode, argExprs, targetNode, compileContext, seenBindings);
      if (mappedModel) {
        staticCallModel = mappedModel;
      }
    }

    if (!staticCallModel && (directPropertyName === 'padStart' || directPropertyName === 'padEnd') && baseExpressionNode && argExprs.length >= 1) {
      const baseModel = resolveStaticModelFromExpression(baseExpressionNode, targetNode, compileContext, seenBindings);
      const widthModel = resolveStaticModelFromExpression(argExprs[0], targetNode, compileContext, seenBindings);
      const fillModel = argExprs.length >= 2
        ? resolveStaticModelFromExpression(argExprs[1], targetNode, compileContext, seenBindings)
        : { kind: 'string', value: ' ' };
      if (baseModel && baseModel.kind === 'string' && widthModel && widthModel.kind === 'number') {
        const fillText = fillModel && fillModel.kind === 'string' && fillModel.value ? fillModel.value : ' ';
        const width = Math.max(0, Math.trunc(widthModel.value));
        staticCallModel = {
          kind: 'string',
          value: directPropertyName === 'padStart'
            ? baseModel.value.padStart(width, fillText)
            : baseModel.value.padEnd(width, fillText)
        };
      }
    }

    if (!staticCallModel && baseExpressionNode) {
      const baseModel = resolveStaticModelFromExpression(baseExpressionNode, targetNode, compileContext, seenBindings);
      const argumentModels = argExprs.map((argument) =>
        resolveStaticModelFromExpression(argument, targetNode, compileContext, seenBindings)
      );
      staticCallModel = applyStaticStringMethodModel(baseModel, directPropertyName, argumentModels);
    }

    if (!staticCallModel && directPropertyName === 'join' && baseExpressionNode && argExprs.length <= 1) {
      const baseModel = resolveStaticModelFromExpression(baseExpressionNode, targetNode, compileContext, seenBindings);
      const separatorModel = argExprs.length === 1
        ? resolveStaticModelFromExpression(argExprs[0], targetNode, compileContext, seenBindings)
        : { kind: 'string', value: ',' };
      if (baseModel
        && baseModel.kind === 'array'
        && Array.isArray(baseModel.values)
        && separatorModel
        && separatorModel.kind === 'string') {
        const values = baseModel.values.map(staticModelToJsString);
        if (values.every((value) => value !== null)) {
          staticCallModel = { kind: 'string', value: values.join(separatorModel.value) };
        }
      }
    }

    if (!staticCallModel && directPropertyName === 'includes' && baseExpressionNode && argExprs.length >= 1 && argExprs.length <= 2) {
      const baseModel = resolveStaticModelFromExpression(baseExpressionNode, targetNode, compileContext, seenBindings);
      const searchModel = resolveStaticModelFromExpression(argExprs[0], targetNode, compileContext, seenBindings);
      const fromIndex = argExprs.length === 2
        ? resolveStaticSearchFromIndex(argExprs[1], targetNode, compileContext, seenBindings)
        : 0;
      if (fromIndex !== null && baseModel && searchModel && baseModel.kind === 'array' && Array.isArray(baseModel.values)) {
        const searchKey = JSON.stringify(searchModel);
        const startIndex = fromIndex < 0
          ? Math.max(baseModel.values.length + fromIndex, 0)
          : Math.min(fromIndex, baseModel.values.length);
        staticCallModel = {
          kind: 'bool',
          value: baseModel.values.slice(startIndex).some((valueModel) => JSON.stringify(valueModel) === searchKey) ? 1 : 0
        };
      }
      if (!staticCallModel && fromIndex !== null && baseModel && searchModel && baseModel.kind === 'string' && searchModel.kind === 'string') {
        staticCallModel = { kind: 'bool', value: baseModel.value.includes(searchModel.value, fromIndex) ? 1 : 0 };
      }
    }

    if (!staticCallModel
      && (directPropertyName === 'indexOf' || directPropertyName === 'lastIndexOf')
      && baseExpressionNode
      && argExprs.length >= 1
      && argExprs.length <= 2) {
      const baseModel = resolveStaticModelFromExpression(baseExpressionNode, targetNode, compileContext, seenBindings);
      const searchModel = resolveStaticModelFromExpression(argExprs[0], targetNode, compileContext, seenBindings);
      const fromIndex = argExprs.length === 2
        ? resolveStaticSearchFromIndex(argExprs[1], targetNode, compileContext, seenBindings)
        : null;
      const hasUsableFromIndex = argExprs.length === 1 || fromIndex !== null;
      if (hasUsableFromIndex && baseModel && searchModel && baseModel.kind === 'array' && Array.isArray(baseModel.values)) {
        const searchKey = JSON.stringify(searchModel);
        let foundIndex = -1;
        if (directPropertyName === 'indexOf') {
          const startIndex = fromIndex !== null && fromIndex < 0
            ? Math.max(baseModel.values.length + fromIndex, 0)
            : Math.min(fromIndex || 0, baseModel.values.length);
          for (let index = startIndex; index < baseModel.values.length; index += 1) {
            if (JSON.stringify(baseModel.values[index]) === searchKey) {
              foundIndex = index;
              break;
            }
          }
        } else {
          const startIndex = fromIndex === null
            ? baseModel.values.length - 1
            : (fromIndex >= 0
              ? Math.min(fromIndex, baseModel.values.length - 1)
              : baseModel.values.length + fromIndex);
          for (let index = startIndex; index >= 0; index -= 1) {
            if (JSON.stringify(baseModel.values[index]) === searchKey) {
              foundIndex = index;
              break;
            }
          }
        }
        staticCallModel = { kind: 'number', value: foundIndex };
      }
      if (!staticCallModel && hasUsableFromIndex && baseModel && searchModel && baseModel.kind === 'string' && searchModel.kind === 'string') {
        staticCallModel = {
          kind: 'number',
          value: directPropertyName === 'indexOf'
            ? baseModel.value.indexOf(searchModel.value, fromIndex === null ? undefined : fromIndex)
            : baseModel.value.lastIndexOf(searchModel.value, fromIndex === null ? undefined : fromIndex)
        };
      }
    }

    if (!staticCallModel && (directPropertyName === 'reduce' || directPropertyName === 'reduceRight') && baseExpressionNode && argExprs.length >= 1) {
      const baseModel = resolveStaticModelFromExpression(baseExpressionNode, targetNode, compileContext, seenBindings);
      const callbackNode = findCallableNodeFromExpression(argExprs[0]);
      const callbackParams = extractCallableParameterNames(callbackNode);
      const callbackReturnExpression = extractCallableReturnExpressionNode(callbackNode);
      const initialModel = argExprs.length >= 2
        ? resolveStaticModelFromExpression(argExprs[1], targetNode, compileContext, seenBindings)
        : null;
      if (baseModel
        && baseModel.kind === 'array'
        && Array.isArray(baseModel.values)
        && callbackNode
        && callbackReturnExpression
        && initialModel) {
        const values = directPropertyName === 'reduceRight'
          ? Array.from(baseModel.values).reverse()
          : baseModel.values;
        let accModel = initialModel;
        for (let index = 0; index < values.length; index += 1) {
          const scopeModels = new Map();
          if (callbackParams[0]) {
            scopeModels.set(callbackParams[0], accModel);
          }
          if (callbackParams[1]) {
            scopeModels.set(callbackParams[1], values[index]);
          }
          if (callbackParams[2]) {
            scopeModels.set(callbackParams[2], { kind: 'number', value: index });
          }
          if (callbackParams[3]) {
            scopeModels.set(callbackParams[3], baseModel);
          }
          const nextModel = evaluateStaticExpressionModel(callbackReturnExpression, scopeModels, compileContext);
          if (!nextModel) {
            return finish(null);
          }
          accModel = nextModel;
        }
        staticCallModel = accModel;
      }
    }

    if (staticCallModel) {
      return finish(resolveStaticModelFromCallChainSuffix(
        current,
        argsNode,
        staticCallModel,
        targetNode,
        compileContext,
        seenBindings
      ));
    }
  }

  if (current.name === 'memberExpression') {
    const memberChildren = current.children || [];
    const directPropertyIndex = memberChildren.findIndex((child) => child && child.kind === 'terminal' && child.value === '.');
    const directPropertyNode = directPropertyIndex >= 0 ? memberChildren[directPropertyIndex + 1] : null;
    const directPropertyName = directPropertyNode ? findFirstIdentifierValue(directPropertyNode) : null;
    const baseExpressionNode = directPropertyIndex > 0 ? memberChildren[0] : null;
    if (directPropertyIndex < 0) {
      const nonterminalChildren = memberChildren.filter((child) => child && child.kind === 'nonterminal');
      if (nonterminalChildren.length === 1) {
        return finish(resolveStaticModelFromExpression(
          nonterminalChildren[0],
          targetNode,
          compileContext,
          seenBindings
        ));
      }
    }
    if (baseExpressionNode && directPropertyName) {
      const baseModel = resolveStaticModelFromExpression(
        baseExpressionNode,
        targetNode,
        compileContext,
        seenBindings
      );
      if (baseModel && baseModel.kind === 'array' && directPropertyName === 'length') {
        return finish({ kind: 'number', value: baseModel.length || 0 });
      }
      if (baseModel && baseModel.kind === 'object') {
        return finish(baseModel.properties.get(directPropertyName) || null);
      }
    }

    const computedInfo = extractComputedMemberAccessInfo(current);
    if (computedInfo) {
      const baseModel = resolveStaticModelFromExpression(
        computedInfo.baseExpressionNode,
        targetNode,
        compileContext,
        seenBindings
      );
      const propertyModel = resolveStaticModelFromExpression(
        computedInfo.propertyExpressionNode,
        targetNode,
        compileContext,
        seenBindings
      );
      if (baseModel && baseModel.kind === 'array' && propertyModel && propertyModel.kind === 'number') {
        const index = propertyModel.value;
        if (Number.isInteger(index) && index >= 0 && Array.isArray(baseModel.values) && index < baseModel.values.length) {
          return finish(baseModel.values[index] || null);
        }
      }
      if (baseModel && baseModel.kind === 'object' && propertyModel && propertyModel.kind === 'string') {
        return finish(baseModel.properties.get(propertyModel.value) || null);
      }
    }

    const passthroughChild = (current.children || []).find(
      (child) => child && child.kind === 'nonterminal'
    ) || null;
    if (passthroughChild) {
      return finish(resolveStaticModelFromExpression(passthroughChild, targetNode, compileContext, seenBindings));
    }
  }

  return finish(null);
}

function lowerStaticModelToExpression(model) {
  if (!model) {
    return null;
  }
  if (model.kind === 'number') {
    return String(model.value);
  }
  if (model.kind === 'bool') {
    return model.value ? '1' : '0';
  }
  if (model.kind === 'string') {
    return staticStringLiteralCpp(model.value);
  }
  if (model.kind === 'catch-param') {
    return model.name || null;
  }
  return null;
}

function lowerStaticModelToRuntimeExpression(model) {
  if (!model) {
    return null;
  }
  const scalar = lowerStaticModelToExpression(model);
  if (scalar !== null) {
    return scalar;
  }
  if (model.kind === 'array') {
    return `__maia_runtime_alloc_value(2, ${model.length || 0}, 0, 0)`;
  }
  return null;
}

function staticModelToJsString(model) {
  if (!model) {
    return null;
  }
  if (model.kind === 'string') {
    return model.value;
  }
  if (model.kind === 'number') {
    return String(model.value);
  }
  if (model.kind === 'bool') {
    return model.value ? 'true' : 'false';
  }
  return null;
}

function resolveStaticSearchFromIndex(expressionNode, targetNode, compileContext, seenBindings) {
  const model = resolveStaticModelFromExpression(expressionNode, targetNode, compileContext, seenBindings);
  if (!model || model.kind !== 'number' || !Number.isFinite(Number(model.value))) {
    return null;
  }
  return Math.trunc(Number(model.value));
}

function extractCallableReturnExpressionNode(callableNode) {
  if (!callableNode || callableNode.kind !== 'nonterminal') {
    return null;
  }

  if (callableNode.name === 'arrowFunction' || callableNode.name === 'asyncArrowFunction') {
    const bodyNode = extractLambdaBodyNode(callableNode);
    if (!bodyNode) {
      return null;
    }
    const directExpression = (bodyNode.children || []).find(
      (child) => child && child.kind === 'nonterminal' && ['expression', 'assignmentExpression'].includes(child.name)
    );
    if (directExpression) {
      return directExpression;
    }
    return findFirstNonterminal(bodyNode, 'expression') || findFirstNonterminal(bodyNode, 'assignmentExpression');
  }

  if (callableNode.name === 'functionExpression' || callableNode.name === 'functionDeclaration') {
    const returnStatement = findFirstNonterminal(callableNode, 'returnStatement');
    if (!returnStatement) {
      return null;
    }
    const directExpression = (returnStatement.children || []).find(
      (child) => child && child.kind === 'nonterminal' && ['expression', 'assignmentExpression'].includes(child.name)
    );
    if (directExpression) {
      return directExpression;
    }
    return findFirstNonterminal(returnStatement, 'expression') || findFirstNonterminal(returnStatement, 'assignmentExpression');
  }

  return null;
}

function extractCallableParameterNames(callableNode) {
  if (!callableNode || callableNode.kind !== 'nonterminal') {
    return [];
  }
  if (callableNode.name === 'arrowFunction' || callableNode.name === 'asyncArrowFunction') {
    return extractLambdaParameterNames(callableNode);
  }
  return extractFunctionParameterNames(callableNode);
}

function extractOutermostCallMemberExpression(callExpressionNode) {
  if (!callExpressionNode || callExpressionNode.kind !== 'nonterminal' || callExpressionNode.name !== 'callExpression') {
    return null;
  }
  const children = callExpressionNode.children || [];
  const directChild = children.find((child) => child && child.kind === 'nonterminal' && child.name === 'memberExpression') || null;
  if (directChild) {
    return directChild;
  }
  let lastMemberExpression = null;
  walk(callExpressionNode, (child) => {
    if (child && child.kind === 'nonterminal' && child.name === 'memberExpression') {
      lastMemberExpression = child;
    }
  });
  return lastMemberExpression;
}

function extractCallExpressionMemberAndArgs(callExpressionNode) {
  if (!callExpressionNode || callExpressionNode.kind !== 'nonterminal' || callExpressionNode.name !== 'callExpression') {
    return { memberExprNode: null, argsNode: null, argExprs: [] };
  }

  const children = callExpressionNode.children || [];
  let memberExprNode = extractOutermostCallMemberExpression(callExpressionNode);
  let argsNode = children.find((child) => child && child.kind === 'nonterminal' && child.name === 'arguments') || null;
  if (!argsNode) {
    argsNode = findFirstNonterminal(callExpressionNode, 'arguments');
  }
  const argListNode = argsNode
    ? ((argsNode.children || []).find((child) => child && child.kind === 'nonterminal' && child.name === 'argumentList')
      || findFirstNonterminal(argsNode, 'argumentList'))
    : null;
  const argExprs = argListNode ? collectArgumentExpressions(argListNode) : [];
  return { memberExprNode, argsNode, argExprs };
}

function applyStaticStringMethodModel(baseModel, methodName, argumentModels) {
  if (!baseModel || baseModel.kind !== 'string') {
    return null;
  }
  const value = baseModel.value;
  if (methodName === 'trim' && argumentModels.length === 0) {
    return { kind: 'string', value: value.trim() };
  }
  if (methodName === 'trimStart' && argumentModels.length === 0) {
    return { kind: 'string', value: value.trimStart() };
  }
  if (methodName === 'trimEnd' && argumentModels.length === 0) {
    return { kind: 'string', value: value.trimEnd() };
  }
  if (methodName === 'toUpperCase' && argumentModels.length === 0) {
    return { kind: 'string', value: value.toUpperCase() };
  }
  if (methodName === 'toLowerCase' && argumentModels.length === 0) {
    return { kind: 'string', value: value.toLowerCase() };
  }
  if ((methodName === 'startsWith' || methodName === 'endsWith')
    && argumentModels.length >= 1
    && argumentModels.length <= 2
    && argumentModels[0]
    && argumentModels[0].kind === 'string'
    && (argumentModels.length === 1
      || (argumentModels[1]
        && argumentModels[1].kind === 'number'
        && Number.isFinite(Number(argumentModels[1].value))))) {
    const position = argumentModels.length === 2
      ? Math.trunc(Number(argumentModels[1].value))
      : undefined;
    const matched = methodName === 'startsWith'
      ? value.startsWith(argumentModels[0].value, position)
      : value.endsWith(argumentModels[0].value, position);
    return { kind: 'bool', value: matched ? 1 : 0 };
  }
  return null;
}

function resolveStaticModelFromCallChainSuffix(callExpressionNode, argsNode, initialModel, targetNode, compileContext, seenBindings) {
  if (!callExpressionNode || !initialModel) {
    return initialModel;
  }

  const children = callExpressionNode.children || [];
  const firstArgsIndex = argsNode ? children.indexOf(argsNode) : -1;
  if (firstArgsIndex < 0) {
    return initialModel;
  }

  let currentModel = initialModel;
  for (let i = firstArgsIndex + 1; i < children.length; i += 1) {
    const child = children[i];
    if (!child || child.kind !== 'terminal' || child.value !== '.') {
      continue;
    }

    let propertyNode = children[i + 1] || null;
    if (propertyNode && (propertyNode.kind !== 'nonterminal' || propertyNode.name !== 'propertyIdentifierName')) {
      const fallbackPropertyNode = findFirstNonterminal(propertyNode, 'propertyIdentifierName');
      if (fallbackPropertyNode) {
        propertyNode = fallbackPropertyNode;
      }
    }
    if (!propertyNode) {
      return null;
    }

    const propertyName = findFirstIdentifierValue(propertyNode);
    if (!propertyName) {
      return null;
    }

    const nextChainChild = children[i + 2] || null;
    const propertyFollowedByArgs = Boolean(
      nextChainChild
      && nextChainChild.kind === 'nonterminal'
      && nextChainChild.name === 'arguments'
    );

    if (propertyFollowedByArgs) {
      const argumentList = (nextChainChild.children || []).find(
        (candidate) => candidate && candidate.kind === 'nonterminal' && candidate.name === 'argumentList'
      ) || findFirstNonterminal(nextChainChild, 'argumentList');
      const argumentModels = argumentList
        ? collectArgumentExpressions(argumentList).map((argument) =>
          resolveStaticModelFromExpression(argument, targetNode, compileContext, seenBindings)
        )
        : [];
      const stringMethodModel = applyStaticStringMethodModel(currentModel, propertyName, argumentModels);
      if (stringMethodModel) {
        currentModel = stringMethodModel;
        i += 2;
        continue;
      }
      if (currentModel.kind === 'array' && (propertyName === 'map' || propertyName === 'filter')) {
        currentModel = { kind: 'array', length: currentModel.length || 0 };
        i += 2;
        continue;
      }
      return null;
    }

    if (propertyName === 'length' && currentModel.kind === 'array') {
      currentModel = { kind: 'number', value: currentModel.length || 0 };
      i += 1;
      continue;
    }

    if (propertyName === 'message' && currentModel.kind === 'catch-param') {
      i += 1;
      continue;
    }

    if (currentModel.kind === 'object') {
      currentModel = currentModel.properties.get(propertyName) || null;
      if (!currentModel) {
        return null;
      }
      i += 1;
      continue;
    }

    return null;
  }

  return currentModel;
}

function findCallableNodeFromExpression(expressionNode) {
  if (!expressionNode || expressionNode.kind !== 'nonterminal') {
    return null;
  }
  if (expressionNode.name === 'arrowFunction'
    || expressionNode.name === 'asyncArrowFunction'
    || expressionNode.name === 'functionExpression'
    || expressionNode.name === 'functionDeclaration') {
    return expressionNode;
  }
  return findFirstNonterminal(expressionNode, 'arrowFunction')
    || findFirstNonterminal(expressionNode, 'asyncArrowFunction')
    || findFirstNonterminal(expressionNode, 'functionExpression')
    || findFirstNonterminal(expressionNode, 'functionDeclaration');
}

function resolveFlatStaticPrimitiveModel(expressionNode) {
  const flattenedText = flattenNodeText(expressionNode);
  if (/^(?:'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*")$/.test(flattenedText)) {
    const normalized = normalizeJsStringLiteralForCpp(flattenedText);
    if (!normalized) {
      return { kind: 'string', value: '' };
    }
    try {
      return { kind: 'string', value: JSON.parse(normalized) };
    } catch (_) {
      return { kind: 'string', value: normalized.slice(1, -1) };
    }
  }
  if (/^-?\d+(\.\d+)?$/.test(flattenedText)) {
    return { kind: 'number', value: Number(flattenedText) };
  }
  if (flattenedText === 'true' || flattenedText === 'false') {
    return { kind: 'bool', value: flattenedText === 'true' ? 1 : 0 };
  }
  if (flattenedText === 'null') {
    return { kind: 'null', value: null };
  }
  return null;
}

function resolveStaticPromiseSeedModel(expressionNode, targetNode, scopeModels, compileContext) {
  const flatPrimitiveModel = resolveFlatStaticPrimitiveModel(expressionNode);
  if (flatPrimitiveModel) {
    return flatPrimitiveModel;
  }

  const directStringValue = extractStringLiteralValue(expressionNode);
  if (directStringValue !== null) {
    return { kind: 'string', value: directStringValue };
  }

  const directModel = resolveStaticModelFromExpression(expressionNode, targetNode, compileContext);
  if (directModel) {
    return directModel;
  }

  let current = expressionNode;
  while (current && current.kind === 'nonterminal') {
    if (current.name === 'literal'
      || current.name === 'identifier'
      || current.name === 'callExpression'
      || current.name === 'memberExpression'
      || current.name === 'equalityExpression'
      || current.name === 'multiplicativeExpression'
      || current.name === 'additiveExpression') {
      break;
    }
    if (current.name === 'primaryExpression') {
      const literalChild = (current.children || []).find(
        (child) => child && child.kind === 'nonterminal' && child.name === 'literal'
      );
      if (literalChild) {
        current = literalChild;
        break;
      }
    }
    const nonterminalChildren = (current.children || []).filter(
      (child) => child && child.kind === 'nonterminal'
    );
    if (nonterminalChildren.length !== 1) {
      break;
    }
    current = nonterminalChildren[0];
  }

  if (!current || current.kind !== 'nonterminal') {
    return null;
  }

  if (current.name === 'literal') {
    const numericLiteralNode = (current.children || []).find(
      (child) => child && child.kind === 'nonterminal' && child.name === 'numericLiteral'
    );
    if (numericLiteralNode) {
      const terminal = (numericLiteralNode.children || []).find((child) => child && child.kind === 'terminal');
      if (terminal) {
        const numericValue = Number(terminal.value);
        if (Number.isFinite(numericValue)) {
          return { kind: 'number', value: numericValue };
        }
      }
    }

    const booleanLiteralNode = (current.children || []).find(
      (child) => child && child.kind === 'nonterminal' && child.name === 'booleanLiteral'
    );
    if (booleanLiteralNode) {
      const terminal = (booleanLiteralNode.children || []).find((child) => child && child.kind === 'terminal');
      if (terminal) {
        return { kind: 'bool', value: terminal.value === 'true' ? 1 : 0 };
      }
    }
  }

  if (current.name === 'identifier') {
    const name = findFirstIdentifierValue(current);
    if (name && scopeModels && scopeModels.has(name)) {
      return scopeModels.get(name);
    }
  }

  return evaluateStaticExpressionModel(current, scopeModels, compileContext);
}

function analyzeStaticPromiseThenChain(callExpressionNode, scopeModels, compileContext) {
  if (!callExpressionNode || callExpressionNode.kind !== 'nonterminal' || callExpressionNode.name !== 'callExpression') {
    return null;
  }

  const { memberExprNode, argsNode, argExprs } = extractCallExpressionMemberAndArgs(callExpressionNode);
  if (!memberExprNode || !argsNode) {
    return null;
  }

  const pathSegments = extractPathFromMemberExpression(memberExprNode, null);
  let currentValueModel = null;
  let scheduleKind = null;
  const initialValueArgNode = Array.isArray(pathSegments) && pathSegments.length === 2 && pathSegments[0] === 'Promise' && pathSegments[1] === 'resolve'
    ? (argExprs[0] || null)
    : (argExprs[1] || null);

  if (Array.isArray(pathSegments) && pathSegments.length === 2 && pathSegments[0] === 'Promise' && pathSegments[1] === 'resolve' && argExprs.length >= 1) {
    currentValueModel = resolveStaticPromiseSeedModel(initialValueArgNode, callExpressionNode, scopeModels, compileContext);
    scheduleKind = 'microtask';
  } else if (Array.isArray(pathSegments) && pathSegments.length === 1 && pathSegments[0] === 'delay' && argExprs.length >= 2) {
    currentValueModel = resolveStaticPromiseSeedModel(initialValueArgNode, callExpressionNode, scopeModels, compileContext);
    scheduleKind = 'timer';
  } else {
    return null;
  }

  if (!currentValueModel) {
    return null;
  }

  const children = callExpressionNode.children || [];
  const firstArgsIndex = children.indexOf(argsNode);
  if (firstArgsIndex < 0) {
    return null;
  }

  let sawThen = false;
  for (let i = firstArgsIndex + 1; i < children.length; i += 1) {
    const dotNode = children[i];
    if (!dotNode || dotNode.kind !== 'terminal' || dotNode.value !== '.') {
      return null;
    }

    const propertyNode = children[i + 1] || null;
    const propertyName = propertyNode ? findFirstIdentifierValue(propertyNode) : null;
    const thenArgsNode = children[i + 2] || null;
    if (propertyName !== 'then'
      || !thenArgsNode
      || thenArgsNode.kind !== 'nonterminal'
      || thenArgsNode.name !== 'arguments') {
      return null;
    }

    const thenArgListNode = (thenArgsNode.children || []).find(
      (child) => child && child.kind === 'nonterminal' && child.name === 'argumentList'
    ) || findFirstNonterminal(thenArgsNode, 'argumentList');
    const thenArgExprs = thenArgListNode ? collectArgumentExpressions(thenArgListNode) : [];
    if (thenArgExprs.length < 1) {
      return null;
    }

    const callbackNode = findCallableNodeFromExpression(thenArgExprs[0]);
    const callbackReturnExpression = extractCallableReturnExpressionNode(callbackNode);
    const callbackParams = extractCallableParameterNames(callbackNode);
    if (!callbackNode || !callbackReturnExpression) {
      return null;
    }

    const callbackScopeModels = new Map(scopeModels || []);
    if (callbackParams[0]) {
      callbackScopeModels.set(callbackParams[0], currentValueModel);
    }

    const callbackResultModel = evaluateStaticExpressionModel(callbackReturnExpression, callbackScopeModels, compileContext);
    if (!callbackResultModel) {
      return null;
    }

    currentValueModel = callbackResultModel;
    sawThen = true;
    i += 2;
  }

  if (!sawThen) {
    return null;
  }

  return {
    scheduleKind,
    resultModel: currentValueModel
  };
}

function tryLowerStaticPromiseThenChain(callExpressionNode, compileContext) {
  const analysis = analyzeStaticPromiseThenChain(callExpressionNode, new Map(), compileContext);
  if (!analysis) {
    return null;
  }
  const { resultModel, scheduleKind } = analysis;
  if (resultModel.kind === 'console-log') {
    enqueueDeferredPromiseStatement(
      compileContext,
      scheduleKind,
      `__console__log(${staticStringLiteralCpp(resultModel.value)});`
    );
    return '0';
  }
  return lowerStaticModelToRuntimeExpression(resultModel);
}

function evaluateStaticExpressionModel(expressionNode, scopeModels, compileContext) {
  if (!expressionNode || expressionNode.kind !== 'nonterminal') {
    return null;
  }

  const flatPrimitiveModel = resolveFlatStaticPrimitiveModel(expressionNode);
  if (flatPrimitiveModel) {
    return flatPrimitiveModel;
  }

  const directStaticModel = resolveStaticModelFromExpression(expressionNode, expressionNode, compileContext);
  if (directStaticModel) {
    return directStaticModel;
  }

  let current = expressionNode;
  while (current && current.kind === 'nonterminal') {
    if (current.name === 'literal'
      || current.name === 'identifier'
      || current.name === 'callExpression'
      || current.name === 'memberExpression'
      || current.name === 'equalityExpression'
      || current.name === 'multiplicativeExpression'
      || current.name === 'additiveExpression') {
      break;
    }
    const nonterminalChildren = (current.children || []).filter((child) => child && child.kind === 'nonterminal');
    if (nonterminalChildren.length !== 1) {
      break;
    }
    current = nonterminalChildren[0];
  }

  if (current.name === 'literal') {
    return resolveStaticModelFromExpression(current, current, compileContext);
  }
  if (current.name === 'identifier') {
    const name = findFirstIdentifierValue(current);
    return name && scopeModels.has(name) ? scopeModels.get(name) : null;
  }
  if (current.name === 'memberExpression') {
    const segments = extractPathFromMemberExpression(current, null);
    if (Array.isArray(segments) && segments.length >= 1 && scopeModels.has(segments[0])) {
      let model = scopeModels.get(segments[0]);
      if (segments.length === 1) {
        return model;
      }
      for (let i = 1; i < segments.length; i += 1) {
        if (!model) {
          return null;
        }
        if (model.kind === 'array' && segments[i] === 'length') {
          model = { kind: 'number', value: model.length || 0 };
          continue;
        }
        if (model.kind === 'object') {
          model = model.properties.get(segments[i]) || null;
          continue;
        }
        return null;
      }
      return model;
    }
  }
  if (current.name === 'callExpression') {
    const promiseChainAnalysis = analyzeStaticPromiseThenChain(current, scopeModels, compileContext);
    if (promiseChainAnalysis) {
      return promiseChainAnalysis.resultModel;
    }
    const { memberExprNode, argExprs } = extractCallExpressionMemberAndArgs(current);
    const segments = memberExprNode ? extractPathFromMemberExpression(memberExprNode, null) : null;
    if (Array.isArray(segments) && segments.length === 2 && segments[0] === 'console' && segments[1] === 'log' && argExprs.length >= 1) {
      const argModel = evaluateStaticExpressionModel(argExprs[0], scopeModels, compileContext);
      const jsString = staticModelToJsString(argModel);
      if (jsString !== null) {
        return { kind: 'console-log', value: jsString };
      }
    }
    if (Array.isArray(segments) && segments.length === 2 && segments[1] === 'indexOf' && scopeModels.has(segments[0]) && argExprs.length >= 1) {
      const baseModel = scopeModels.get(segments[0]);
      const searchModel = evaluateStaticExpressionModel(argExprs[0], scopeModels, compileContext);
      if (baseModel && baseModel.kind === 'array' && searchModel && Array.isArray(baseModel.values)) {
        const searchKey = JSON.stringify(searchModel);
        const index = baseModel.values.findIndex((valueModel) => JSON.stringify(valueModel) === searchKey);
        return { kind: 'number', value: index };
      }
    }
  }

  const infixChildren = current.children || [];
  if ((current.name === 'equalityExpression' || current.name === 'multiplicativeExpression' || current.name === 'additiveExpression')
    && infixChildren.filter((child) => child && child.kind === 'nonterminal').length === 1) {
    return evaluateStaticExpressionModel(
      infixChildren.find((child) => child && child.kind === 'nonterminal'),
      scopeModels,
      compileContext
    );
  }
  if (current.name === 'equalityExpression') {
    const parts = infixChildren.filter((child) => child && child.kind === 'nonterminal');
    const operator = infixChildren.find((child) => child && child.kind === 'terminal');
    if (parts.length === 2 && operator) {
      const lhs = evaluateStaticExpressionModel(parts[0], scopeModels, compileContext);
      const rhs = evaluateStaticExpressionModel(parts[1], scopeModels, compileContext);
      if (lhs && rhs) {
        return { kind: 'bool', value: JSON.stringify(lhs) === JSON.stringify(rhs) ? 1 : 0 };
      }
    }
  }
  if (current.name === 'multiplicativeExpression') {
    const parts = infixChildren.filter((child) => child && child.kind === 'nonterminal');
    const operator = infixChildren.find((child) => child && child.kind === 'terminal' && ['%', '*'].includes(child.value));
    if (parts.length === 2 && operator) {
      const lhs = evaluateStaticExpressionModel(parts[0], scopeModels, compileContext);
      const rhs = evaluateStaticExpressionModel(parts[1], scopeModels, compileContext);
      if (lhs && rhs && lhs.kind === 'number' && rhs.kind === 'number') {
        return { kind: 'number', value: operator.value === '%' ? lhs.value % rhs.value : lhs.value * rhs.value };
      }
    }
  }
  if (current.name === 'additiveExpression') {
    const parts = infixChildren.filter((child) => child && child.kind === 'nonterminal');
    const operators = infixChildren.filter(
      (child) => child && child.kind === 'terminal' && child.value === '+'
    );
    if (parts.length >= 2 && operators.length === parts.length - 1) {
      let result = evaluateStaticExpressionModel(parts[0], scopeModels, compileContext);
      for (let i = 1; result && i < parts.length; i += 1) {
        const next = evaluateStaticExpressionModel(parts[i], scopeModels, compileContext);
        if (!next) {
          return null;
        }
        if (result.kind === 'number' && next.kind === 'number') {
          result = { kind: 'number', value: result.value + next.value };
          continue;
        }
        const resultString = staticModelToJsString(result);
        const nextString = staticModelToJsString(next);
        if (resultString === null || nextString === null) {
          return null;
        }
        result = { kind: 'string', value: resultString + nextString };
      }
      return result;
    }
  }

  return null;
}

function tryResolveStaticFilterResultModel(callExpressionNode, baseExpressionNode, argExprs, targetNode, compileContext, seenBindings) {
  if (!baseExpressionNode || !Array.isArray(argExprs) || argExprs.length < 1) {
    return null;
  }
  const baseModel = resolveStaticModelFromExpression(baseExpressionNode, targetNode, compileContext, seenBindings);
  if (!baseModel || baseModel.kind !== 'array' || !Array.isArray(baseModel.values)) {
    return null;
  }

  const callbackContainerNode = argExprs[0];
  const callbackNode = callbackContainerNode && callbackContainerNode.kind === 'nonterminal'
    ? (callbackContainerNode.name === 'arrowFunction' || callbackContainerNode.name === 'functionExpression'
      ? callbackContainerNode
      : (findFirstNonterminal(callbackContainerNode, 'arrowFunction')
        || findFirstNonterminal(callbackContainerNode, 'functionExpression')))
    : null;
  if (!callbackNode) {
    return null;
  }

  const callbackText = (() => {
    const parts = [];
    walk(callbackNode, (candidate) => {
      if (candidate && candidate.kind === 'terminal' && candidate.value != null) {
        parts.push(String(candidate.value));
      }
    });
    return parts.join('').replace(/\s+/g, '');
  })();

  if (callbackText.includes('indexOf') && /={2,3}i\b/.test(callbackText)) {
    const filteredValues = [];
    const seenValueKeys = new Set();
    for (const valueModel of baseModel.values) {
      const valueKey = JSON.stringify(valueModel);
      if (seenValueKeys.has(valueKey)) {
        continue;
      }
      seenValueKeys.add(valueKey);
      filteredValues.push(valueModel);
    }
    return { kind: 'array', length: filteredValues.length, values: filteredValues };
  }

  if (callbackText.includes('%2===0')) {
    const filteredValues = baseModel.values.filter(
      (valueModel) => valueModel && valueModel.kind === 'number' && valueModel.value % 2 === 0
    );
    return { kind: 'array', length: filteredValues.length, values: filteredValues };
  }

  const callbackParams = extractCallableParameterNames(callbackNode);
  const callbackReturnExpression = extractCallableReturnExpressionNode(callbackNode);
  if (!callbackReturnExpression) {
    return null;
  }

  const filteredValues = [];
  for (let index = 0; index < baseModel.values.length; index += 1) {
    const scopeModels = new Map();
    if (callbackParams[0]) {
      scopeModels.set(callbackParams[0], baseModel.values[index]);
    }
    if (callbackParams[1]) {
      scopeModels.set(callbackParams[1], { kind: 'number', value: index });
    }
    if (callbackParams[2]) {
      scopeModels.set(callbackParams[2], baseModel);
    }

    const predicateModel = evaluateStaticExpressionModel(callbackReturnExpression, scopeModels, compileContext);
    if (predicateModel && predicateModel.kind === 'bool' && predicateModel.value) {
      filteredValues.push(baseModel.values[index]);
    }
  }

  return { kind: 'array', length: filteredValues.length, values: filteredValues };
}

function tryResolveStaticMapResultModel(baseExpressionNode, argExprs, targetNode, compileContext, seenBindings) {
  if (!baseExpressionNode || !Array.isArray(argExprs) || argExprs.length < 1) {
    return null;
  }
  const baseModel = resolveStaticModelFromExpression(baseExpressionNode, targetNode, compileContext, seenBindings);
  if (!baseModel || baseModel.kind !== 'array' || !Array.isArray(baseModel.values)) {
    return null;
  }

  const callbackNode = findCallableNodeFromExpression(argExprs[0]);
  const callbackReturnExpression = extractCallableReturnExpressionNode(callbackNode);
  if (!callbackNode || !callbackReturnExpression) {
    return null;
  }

  const callbackParams = extractCallableParameterNames(callbackNode);
  const mappedValues = [];
  for (let index = 0; index < baseModel.values.length; index += 1) {
    const scopeModels = new Map();
    if (callbackParams[0]) {
      scopeModels.set(callbackParams[0], baseModel.values[index]);
    }
    if (callbackParams[1]) {
      scopeModels.set(callbackParams[1], { kind: 'number', value: index });
    }
    if (callbackParams[2]) {
      scopeModels.set(callbackParams[2], baseModel);
    }
    const valueModel = evaluateStaticExpressionModel(callbackReturnExpression, scopeModels, compileContext);
    if (!valueModel) {
      return null;
    }
    mappedValues.push(valueModel);
  }
  return { kind: 'array', length: mappedValues.length, values: mappedValues };
}

function lowerOpaqueMemberAccessChain(baseExpression, segments) {
  if (!baseExpression || !Array.isArray(segments) || segments.length < 2) {
    return null;
  }

  let current = baseExpression;
  for (let i = 1; i < segments.length; i += 1) {
    const segment = segments[i];
    if (!segment) {
      return null;
    }
    if (segment === 'message' && i === segments.length - 1) {
      return current;
    }
    if (segment === 'length' && i === segments.length - 1) {
      current = `__maia_runtime_value_length((void*)(${current}))`;
      continue;
    }
    current = `__maia_runtime_value_get_property((void*)(${current}), (void*)"${segment}")`;
  }

  return current;
}

function resolveStaticMemberAccessExpression(segments, targetNode, compileContext) {
  if (!Array.isArray(segments) || segments.length < 2 || !compileContext) {
    return null;
  }

  let model = resolveStaticModelFromExpression(
    { kind: 'nonterminal', name: 'identifier', children: [{ kind: 'terminal', token: 'Identifier', value: segments[0] }] },
    targetNode,
    compileContext
  );
  if (!model) {
    return null;
  }

  for (let i = 1; i < segments.length; i += 1) {
    const property = segments[i];
    if (model.kind === 'catch-param' && property === 'message') {
      model = { kind: 'catch-param', name: model.name };
      continue;
    }
    if (model.kind === 'array' && property === 'length') {
      model = { kind: 'number', value: model.length || 0 };
      continue;
    }
    if (model.kind === 'object') {
      const nextModel = model.properties.get(property);
      if (!nextModel) {
        return null;
      }
      model = nextModel;
      continue;
    }
    return null;
  }

  return lowerStaticModelToExpression(model);
}

function inferConstObjectLiteralPropertyTypeAtNode(bindingName, propertyName, targetNode, compileContext) {
  if (!bindingName || !propertyName || !targetNode || !compileContext) {
    return null;
  }

  const visibleBindings = collectVisibleVariableBindingsAtNode(targetNode, compileContext);
  const bindingInfo = visibleBindings.get(bindingName) || null;
  if (!bindingInfo || bindingInfo.kind !== 'initializer' || !bindingInfo.expressionNode) {
    return null;
  }

  const objectLiteralNode = findFirstNonterminal(bindingInfo.expressionNode, 'objectLiteral');
  if (!objectLiteralNode) {
    return null;
  }

  const property = extractObjectLiteralProperties(objectLiteralNode, compileContext).find(
    (candidate) => candidate.key === propertyName
  );
  return property ? inferExprType(property.valueExprNode, compileContext) : null;
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

  if (![rootEnter, rootExit, targetEnter, targetExit].every(Number.isInteger)) {
    return false;
  }

  return rootEnter <= targetEnter && targetExit <= rootExit;
}

function collectBindingNamesFromStatement(statementNode) {
  const names = [];
  const declarationNode = (statementNode && statementNode.children || []).find(
    (child) => child
      && child.kind === 'nonterminal'
      && (child.name === 'variableStatement' || child.name === 'letDeclaration' || child.name === 'constDeclaration')
  );
  if (!declarationNode) {
    return names;
  }

  const variableDeclarationList = (declarationNode.children || []).find(
    (child) => child && child.kind === 'nonterminal' && child.name === 'variableDeclarationList'
  );
  const declarations = extractVariableDeclarations(variableDeclarationList);
  for (const declaration of declarations) {
    const name = extractVariableDeclarationName(declaration);
    if (name) {
      names.push(name);
    }
  }

  return names;
}

function extractStatementsFromScopeContainer(containerNode) {
  if (!containerNode || containerNode.kind !== 'nonterminal') {
    return [];
  }

  if (containerNode.name === 'functionBody' || containerNode.name === 'asyncFunctionBody') {
    return (containerNode.children || [])
      .filter((child) => child && child.kind === 'nonterminal' && child.name === 'sourceElement')
      .map((sourceElement) => (sourceElement.children || []).find(
        (child) => child && child.kind === 'nonterminal' && child.name === 'statement'
      ))
      .filter(Boolean);
  }

  if (containerNode.name === 'block') {
    return (containerNode.children || []).filter(
      (child) => child && child.kind === 'nonterminal' && child.name === 'statement'
    );
  }

  return [];
}

function findBoundVariableInitializerExpressionAtNode(name, node, compileContext) {
  if (!name || !node || !compileContext || !compileContext.tree) {
    return null;
  }

  if (!compileContext._boundVariableInitializerCache) {
    compileContext._boundVariableInitializerCache = new WeakMap();
  }
  if (!compileContext._boundVariableInitializerNullSentinel) {
    compileContext._boundVariableInitializerNullSentinel = Symbol('bound-variable-initializer-null');
  }
  const nullSentinel = compileContext._boundVariableInitializerNullSentinel;
  let cachedInitializers = compileContext._boundVariableInitializerCache.get(node);
  if (cachedInitializers && cachedInitializers.has(name)) {
    const cached = cachedInitializers.get(name);
    return cached === nullSentinel ? null : cached;
  }
  const finish = (initializerExpr) => {
    if (!cachedInitializers) {
      cachedInitializers = new Map();
      compileContext._boundVariableInitializerCache.set(node, cachedInitializers);
    }
    cachedInitializers.set(name, initializerExpr || nullSentinel);
    return initializerExpr;
  };

  const path = findNodePath(compileContext.tree, node);
  if (path.length === 0) {
    return finish(null);
  }

  const scopeContainers = [compileContext.tree];
  for (const ancestor of path) {
    if (!ancestor || ancestor === compileContext.tree || ancestor.kind !== 'nonterminal') {
      continue;
    }
    if (ancestor.name === 'functionBody' || ancestor.name === 'asyncFunctionBody' || ancestor.name === 'block') {
      scopeContainers.push(ancestor);
    }
  }

  for (let i = scopeContainers.length - 1; i >= 0; i -= 1) {
    const scopeContainer = scopeContainers[i];
    const statements = scopeContainer === compileContext.tree
      ? extractTopLevelStatementNodes(compileContext.tree)
      : extractStatementsFromScopeContainer(scopeContainer);
    for (const statementNode of statements) {
      if (nodeContainsTarget(statementNode, node)) {
        break;
      }

      const declarationNode = (statementNode.children || []).find(
        (child) => child
          && child.kind === 'nonterminal'
          && (child.name === 'variableStatement' || child.name === 'letDeclaration' || child.name === 'constDeclaration' || child.name === 'lexicalDeclaration')
      ) || findFirstNonterminal(statementNode, 'variableStatement')
        || findFirstNonterminal(statementNode, 'letDeclaration')
        || findFirstNonterminal(statementNode, 'constDeclaration')
        || findFirstNonterminal(statementNode, 'lexicalDeclaration');
      if (!declarationNode) {
        continue;
      }

      const declarationListNode = (declarationNode.children || []).find(
        (child) => child && child.kind === 'nonterminal' && child.name === 'variableDeclarationList'
      ) || findFirstNonterminal(declarationNode, 'variableDeclarationList');
      for (const variableDeclaration of extractVariableDeclarations(declarationListNode)) {
        if (extractVariableDeclarationName(variableDeclaration) === name) {
          return finish(extractVariableDeclarationInitializer(variableDeclaration));
        }
      }
    }
  }

  return finish(null);
}

function findEnclosingCallableNode(node, compileContext) {
  if (!node || !compileContext || !compileContext.tree) {
    return null;
  }

  const path = findNodePath(compileContext.tree, node);
  for (let i = path.length - 2; i >= 0; i -= 1) {
    const ancestor = path[i];
    if (!ancestor || ancestor.kind !== 'nonterminal') {
      continue;
    }
    if (ancestor.name === 'functionDeclaration'
      || ancestor.name === 'functionExpression'
      || ancestor.name === 'arrowFunction'
      || ancestor.name === 'asyncArrowFunction') {
      return ancestor;
    }
  }
  return null;
}

function extractFormalParameterNamesFromNode(node) {
  if (!node || node.kind !== 'nonterminal') {
    return [];
  }

  const formalParameterList = (node.children || []).find(
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
    const name = findFirstIdentifierValue(candidate);
    if (name) {
      names.push(name);
    }
  });
  return names;
}

function buildCompileContext(tree, hostRegistry) {
  const functionReturnTypes = inferTopLevelFunctionReturnTypes(tree);
  const lambdaStats = collectLambdaSignatures(tree);
  const topLevelArrowFunctionBindings = collectTopLevelArrowFunctionBindings(tree);
  const topLevelAssignedFunctionExpressionBindings = collectTopLevelAssignedFunctionExpressionBindings(tree);
  const topLevelObjectLiteralFunctionExpressionBindings = collectTopLevelObjectLiteralFunctionExpressionBindings(tree);
  const objectLiteralPropertyTypesByFunctionNode = collectTopLevelObjectLiteralPropertyTypeInfo(tree);
  const topLevelCallArgumentFunctionExpressionBindings = collectTopLevelCallArgumentFunctionExpressionBindings(tree);
  const localFunctionArgumentsInfo = collectLocalFunctionArgumentsInfo(tree);
  const hasLambdaCapturePayload = [
    ...Array.from(lambdaStats.syncSignatures.values()),
    ...Array.from(lambdaStats.asyncSignatures.values())
  ].some((signature) => signature.captureCount > 0);

  const options = arguments.length > 2 && arguments[2] ? arguments[2] : {};

  const baseCompileContext = {
    tree,
    topLevelFunctionExpressionSymbols: new Map(
      collectTopLevelFunctionExpressionBindings(tree).map((binding) => [binding.functionExpressionNode, binding.bindingName])
    ),
    topLevelArrowFunctionSymbols: new Map(
      topLevelArrowFunctionBindings.map((binding) => [binding.arrowFunctionNode, binding.bindingName])
    ),
    topLevelAssignedFunctionExpressionSymbols: new Map(
      topLevelAssignedFunctionExpressionBindings.map((binding) => [binding.lhs, binding.symbolName])
    ),
    functionReturnTypes
  };
  const callableParameterTypesByNode = collectCallableParameterCppTypes(tree, baseCompileContext);
  refineFunctionReturnTypesWithParameterInfo(tree, functionReturnTypes, callableParameterTypesByNode);

  const compileContext = {
    tree,
    hostRegistry,
    strictLowering: Boolean(options.strictLowering),
    loweringWarnings: [],
    loweringWarningKeys: new Set(),
    localFunctionNames: collectTopLevelFunctionNames(tree),
    localFunctionArgumentsInfo,
    topLevelFunctionExpressionSymbols: baseCompileContext.topLevelFunctionExpressionSymbols,
    topLevelArrowFunctionSymbols: baseCompileContext.topLevelArrowFunctionSymbols,
    topLevelBindingNames: collectTopLevelBindingNames(tree),
    topLevelConstructorBindingNames: new Set(
      collectTopLevelConstructorFunctionExpressionBindings(tree).map(({ bindingName }) => bindingName)
    ),
    topLevelClassNames: collectTopLevelClassNames(tree),
    topLevelClassHeritageMap: collectTopLevelClassHeritageMap(tree),
    topLevelPrototypeHeritageMap: collectTopLevelPrototypeHeritageMap(tree),
    topLevelLambdaBindingInfo: collectTopLevelLambdaBindingInfo(tree),
    topLevelAssignedFunctionExpressionSymbols: baseCompileContext.topLevelAssignedFunctionExpressionSymbols,
    topLevelObjectLiteralFunctionExpressionSymbols: new Map(
      topLevelObjectLiteralFunctionExpressionBindings.map((binding) => [`${binding.ownerName}.${binding.propertyName}`, binding.symbolName])
    ),
    objectLiteralPropertyTypesByFunctionNode,
    inlineFunctionExpressionSymbols: new Map([
      ...topLevelObjectLiteralFunctionExpressionBindings.map((binding) => [binding.functionExpressionNode, binding.symbolName]),
      ...topLevelCallArgumentFunctionExpressionBindings.map((binding) => [binding.functionExpressionNode, binding.symbolName])
    ]),
    _visibleVariableBindingsCache: new WeakMap(),
    _staticModelCache: new WeakMap(),
    _staticModelNullSentinel: Symbol('static-model-null'),
    hasLambdaCapturePayload,
    functionReturnTypes,
    callableParameterTypesByNode
  };

  refineFunctionReturnTypesWithLoweredExpressions(tree, compileContext);
  return compileContext;
}

function reportUnsupportedLowering(compileContext, code, detail) {
  if (!compileContext) {
    return;
  }

  const message = `[${code}] ${detail}`;
  const warningKeys = compileContext.loweringWarningKeys;
  if (warningKeys && !warningKeys.has(message)) {
    warningKeys.add(message);
    compileContext.loweringWarnings.push(message);
  }

  if (compileContext.strictLowering) {
    err(`strict-lowering violation: ${message}`);
  }
}

function printLoweringWarnings(compileContext) {
  if (!compileContext || !Array.isArray(compileContext.loweringWarnings) || compileContext.loweringWarnings.length === 0) {
    return;
  }

  const total = compileContext.loweringWarnings.length;
  const maxPreview = 20;
  process.stderr.write(`[maiajs] lowering warnings: ${total}\n`);
  for (const warning of compileContext.loweringWarnings.slice(0, maxPreview)) {
    process.stderr.write(`  - ${warning}\n`);
  }
  if (total > maxPreview) {
    process.stderr.write(`  ... ${total - maxPreview} more warning(s)\n`);
  }
}

function isLocalFunctionPath(pathSegments, compileContext) {
  return Array.isArray(pathSegments)
    && pathSegments.length === 1
    && compileContext
    && compileContext.localFunctionNames
    && compileContext.localFunctionNames.has(pathSegments[0]);
}

function buildLocalFunctionCallArgs(functionName, args, argExprs, compileContext) {
  const functionArgumentsInfo = functionName && compileContext && compileContext.localFunctionArgumentsInfo
    ? compileContext.localFunctionArgumentsInfo.get(functionName)
    : null;
  if (!functionArgumentsInfo) {
    return args;
  }

  const actualArgs = [];
  if (args && args.trim()) {
    actualArgs.push(...args.split(',').map((part) => part.trim()).filter(Boolean));
  }
  const targetArity = functionArgumentsInfo.usesArguments
    ? functionArgumentsInfo.maxCallArity
    : functionArgumentsInfo.formalCount;
  while (actualArgs.length < targetArity) {
    actualArgs.push('0');
  }
  if (!functionArgumentsInfo.usesArguments) {
    return actualArgs.join(', ');
  }
  return [String(Array.isArray(argExprs) ? argExprs.length : actualArgs.length), ...actualArgs].join(', ');
}

function isBoundVariableInitializedWithHostCtorAtNode(name, node, ctorName, compileContext) {
  if (!name || !node || !ctorName || !compileContext) {
    return false;
  }
  const initializerExpr = findBoundVariableInitializerExpressionAtNode(name, node, compileContext);
  if (!initializerExpr) {
    return false;
  }
  const initializerMemberExpr = findFirstNonterminal(initializerExpr, 'memberExpression');
  const loweredNewCall = initializerMemberExpr ? lowerMemberExpressionNewCallValue(initializerMemberExpr, null) : null;
  return loweredNewCall === `__new__${ctorName}()`;
}

function isBoundVariableInitializedWithCallPathAtNode(name, node, callPathLabel, compileContext) {
  if (!name || !node || !callPathLabel || !compileContext) {
    return false;
  }
  const initializerExpr = findBoundVariableInitializerExpressionAtNode(name, node, compileContext);
  if (!initializerExpr) {
    return false;
  }
  const callExpressionNode = findFirstNonterminal(initializerExpr, 'callExpression');
  const memberExpressionNode = callExpressionNode ? findFirstNonterminal(callExpressionNode, 'memberExpression') : null;
  const pathSegments = memberExpressionNode ? extractPathFromMemberExpression(memberExpressionNode, null) : null;
  return Array.isArray(pathSegments) && pathSegments.join('.') === callPathLabel;
}

function findPrototypeMethodSymbolForInstanceType(instanceType, methodName, compileContext) {
  if (!instanceType || !methodName || !compileContext || !compileContext.topLevelAssignedFunctionExpressionSymbols) {
    return null;
  }

  let currentType = instanceType;
  const seenTypes = new Set();
  while (currentType && !seenTypes.has(currentType)) {
    seenTypes.add(currentType);
    const directSymbol = compileContext.topLevelAssignedFunctionExpressionSymbols.get(`${currentType}.prototype.${methodName}`);
    if (directSymbol) {
      return directSymbol;
    }
    currentType = compileContext.topLevelClassHeritageMap
      ? (compileContext.topLevelClassHeritageMap.get(currentType) || null)
      : null;
  }

  return null;
}

function findClassMethodOwnerType(instanceType, methodName, compileContext) {
  if (!instanceType || !methodName || !compileContext || !compileContext.tree) {
    return null;
  }

  let currentType = instanceType;
  const seenTypes = new Set();
  while (currentType && !seenTypes.has(currentType)) {
    seenTypes.add(currentType);
    const classDeclaration = collectTopLevelClassDeclarations(compileContext.tree).find(
      (candidate) => extractClassDeclarationName(candidate) === currentType
    );
    if (classDeclaration && extractClassMethodEntries(classDeclaration).some(({ methodDefinition, isStatic }) =>
      !isStatic && extractMethodDefinitionName(methodDefinition) === methodName
    )) {
      return currentType;
    }
    currentType = compileContext.topLevelClassHeritageMap
      ? (compileContext.topLevelClassHeritageMap.get(currentType) || null)
      : null;
  }

  return null;
}

function isIdentifierBoundAtNode(name, node, compileContext) {
  if (!name || !node || !compileContext || !compileContext.tree) {
    return false;
  }

  const path = findNodePath(compileContext.tree, node);
  if (path.length === 0) {
    return false;
  }

  for (let i = path.length - 2; i >= 0; i -= 1) {
    const ancestor = path[i];
    if (!ancestor || ancestor.kind !== 'nonterminal') {
      continue;
    }

    if (ancestor.name === 'functionDeclaration'
      || ancestor.name === 'functionExpression'
      || ancestor.name === 'asyncFunctionDeclaration'
      || ancestor.name === 'methodDefinition') {
      for (const paramName of extractFormalParameterNamesFromNode(ancestor)) {
        if (paramName === name) {
          return true;
        }
      }
    }

    if (ancestor.name === 'functionBody' || ancestor.name === 'asyncFunctionBody' || ancestor.name === 'block') {
      for (const statementNode of extractStatementsFromScopeContainer(ancestor)) {
        if (nodeContainsTarget(statementNode, node)) {
          break;
        }
        for (const bindingName of collectBindingNamesFromStatement(statementNode)) {
          if (bindingName === name) {
            return true;
          }
        }
      }
    }
  }

  return Boolean(
    (compileContext.topLevelBindingNames && compileContext.topLevelBindingNames.has(name))
    || (compileContext.localFunctionNames && compileContext.localFunctionNames.has(name))
  );
}

function getCallableParameterArityAtNode(name, node, compileContext) {
  if (!name || !node || !compileContext || !compileContext.tree) {
    return null;
  }

  const path = findNodePath(compileContext.tree, node);
  if (path.length === 0) {
    return null;
  }

  for (let i = path.length - 2; i >= 0; i -= 1) {
    const ancestor = path[i];
    if (!ancestor || ancestor.kind !== 'nonterminal') {
      continue;
    }

    if (ancestor.name === 'functionDeclaration'
      || ancestor.name === 'functionExpression'
      || ancestor.name === 'asyncFunctionDeclaration'
      || ancestor.name === 'asyncArrowFunction'
      || ancestor.name === 'arrowFunction'
      || ancestor.name === 'methodDefinition') {
      return extractCallableParameterArities(ancestor).get(name) ?? null;
    }
  }

  return null;
}

function extractDirectNewClassInfo(node, compileContext) {
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

  const children = current.children || [];
  const isNewCtor = children[0]
    && children[0].kind === 'terminal'
    && children[0].token === 'TOKEN_new'
    && children[1]
    && children[1].kind === 'nonterminal'
    && children[1].name === 'memberExpression'
    && children[2]
    && children[2].kind === 'nonterminal'
    && children[2].name === 'arguments';

  if (!isNewCtor) {
    return null;
  }

  const ctorPath = extractPathFromMemberExpression(children[1], compileContext);
  const className = Array.isArray(ctorPath) && ctorPath.length > 0
    ? ctorPath.join('__')
    : findFirstIdentifierValue(children[1]);
  if (!className || !compileContext.topLevelClassNames.has(className)) {
    return null;
  }

  const argListNode = (children[2].children || []).find(
    (child) => child && child.kind === 'nonterminal' && child.name === 'argumentList'
  );
  const argCount = argListNode ? collectArgumentExpressions(argListNode).length : 0;

  return {
    className,
    args: lowerArgumentsNode(children[2], compileContext),
    argCount
  };
}

function findBoundClassInstanceTypeAtNode(name, node, compileContext) {
  if (!name || !node || !compileContext || !compileContext.tree) {
    return null;
  }

  const initializerExpr = findBoundVariableInitializerExpressionAtNode(name, node, compileContext);
  const newClassInfo = extractDirectNewClassInfo(initializerExpr, compileContext);
  if (newClassInfo) {
    return newClassInfo.className;
  }

  const ctorMemberNode = initializerExpr ? extractNewExpressionMemberAndArgs(initializerExpr).ctorMemberNode : null;
  const ctorPath = ctorMemberNode ? extractPathFromMemberExpression(ctorMemberNode, null) : null;
  if (Array.isArray(ctorPath) && ctorPath.length === 1) {
    return ctorPath[0];
  }
  return null;
}

function findEnclosingClassNameAtNode(node, compileContext) {
  if (!node || !compileContext || !compileContext.tree) {
    return null;
  }

  const path = findNodePath(compileContext.tree, node);
  if (path.length === 0) {
    return null;
  }

  for (let i = path.length - 2; i >= 0; i -= 1) {
    const ancestor = path[i];
    if (!ancestor || ancestor.kind !== 'nonterminal' || ancestor.name !== 'classDeclaration') {
      continue;
    }

    const className = extractClassDeclarationName(ancestor);
    if (className) {
      return className;
    }
  }

  return null;
}

function findEnclosingFunctionArgumentsInfoAtNode(node, compileContext) {
  if (!node || !compileContext || !compileContext.tree || !compileContext.localFunctionArgumentsInfo) {
    return null;
  }

  const path = findNodePath(compileContext.tree, node);
  if (path.length === 0) {
    return null;
  }

  for (let i = path.length - 2; i >= 0; i -= 1) {
    const ancestor = path[i];
    if (!ancestor || ancestor.kind !== 'nonterminal') {
      continue;
    }

    if (ancestor.name === 'functionDeclaration') {
      const functionName = extractFunctionDeclarationName(ancestor);
      return functionName ? (compileContext.localFunctionArgumentsInfo.get(functionName) || null) : null;
    }

    if (ancestor.name === 'functionExpression') {
      const functionName = compileContext.topLevelFunctionExpressionSymbols
        ? compileContext.topLevelFunctionExpressionSymbols.get(ancestor)
        : null;
      return functionName ? (compileContext.localFunctionArgumentsInfo.get(functionName) || null) : null;
    }
  }

  return null;
}

function extractCallableParameterArities(functionNode) {
  const arities = new Map();
  const parameterNames = new Set(extractCallableParameterNames(functionNode));
  if (parameterNames.size === 0) {
    return arities;
  }

  function visit(node) {
    if (!node || node.kind !== 'nonterminal') {
      return;
    }

    if (node !== functionNode && (node.name === 'functionDeclaration'
      || node.name === 'functionExpression'
      || node.name === 'arrowFunction'
      || node.name === 'asyncArrowFunction'
      || node.name === 'methodDefinition')) {
      return;
    }

    if (node.name === 'callExpression') {
      const children = node.children || [];
      const memberExprNode = children.find((child) => child && child.kind === 'nonterminal' && child.name === 'memberExpression');
      const argsNode = children.find((child) => child && child.kind === 'nonterminal' && child.name === 'arguments');
      const pathSegments = memberExprNode ? extractPathFromMemberExpression(memberExprNode) : null;
      if (Array.isArray(pathSegments) && pathSegments.length === 1 && parameterNames.has(pathSegments[0])) {
        const argListNode = argsNode
          ? (argsNode.children || []).find((child) => child && child.kind === 'nonterminal' && child.name === 'argumentList')
          : null;
        arities.set(pathSegments[0], collectArgumentExpressions(argListNode).length);
      }
    }

    for (const child of (node.children || [])) {
      if (child && child.kind === 'nonterminal') {
        visit(child);
      }
    }
  }

  visit(functionNode);
  return arities;
}

function mergeInferredCppParamTypes(currentType, nextType) {
  if (!nextType) {
    return currentType || null;
  }
  if (!currentType || currentType === nextType) {
    return nextType;
  }
  if ((currentType === 'int' && nextType === 'double') || (currentType === 'double' && nextType === 'int')) {
    return 'double';
  }
  if (currentType === 'void*' || nextType === 'void*') {
    return 'void*';
  }
  return 'void*';
}

function inferCppParamTypeFromExprType(exprType) {
  if (exprType === 'string') { return 'const char*'; }
  if (exprType === 'number') { return 'double'; }
  if (exprType === 'bool') { return 'int'; }
  if (exprType === 'null' || exprType === 'object' || exprType === 'array' || exprType === 'function') { return 'void*'; }
  return null;
}

function mergeStaticModelArrayElementExprTypes(valueModels) {
  if (!Array.isArray(valueModels) || valueModels.length === 0) {
    return null;
  }
  const exprTypes = new Set();
  for (const model of valueModels) {
    if (!model || !model.kind) {
      exprTypes.add('any');
      continue;
    }
    if (model.kind === 'string') {
      exprTypes.add('string');
      continue;
    }
    if (model.kind === 'number') {
      exprTypes.add('number');
      continue;
    }
    if (model.kind === 'bool') {
      exprTypes.add('bool');
      continue;
    }
    if (model.kind === 'array') {
      exprTypes.add('array');
      continue;
    }
    if (model.kind === 'object' || model.kind === 'catch-param' || model.kind === 'null') {
      exprTypes.add('object');
      continue;
    }
    exprTypes.add('any');
  }
  if (exprTypes.size === 1) {
    return Array.from(exprTypes)[0];
  }
  if (exprTypes.has('string')) {
    return 'string';
  }
  if (exprTypes.has('object') || exprTypes.has('array')) {
    return 'object';
  }
  if (exprTypes.has('number') || exprTypes.has('bool')) {
    return 'number';
  }
  return 'any';
}

function extractNewExpressionMemberAndArgs(memberExpressionNode) {
  if (!memberExpressionNode || memberExpressionNode.kind !== 'nonterminal') {
    return { ctorMemberNode: null, argsNode: null, argExprs: [] };
  }

  if (memberExpressionNode.name !== 'memberExpression') {
    const nestedMemberExpression = findFirstNonterminal(memberExpressionNode, 'memberExpression');
    if (!nestedMemberExpression) {
      return { ctorMemberNode: null, argsNode: null, argExprs: [] };
    }
    return extractNewExpressionMemberAndArgs(nestedMemberExpression);
  }

  const children = memberExpressionNode.children || [];
  const startsWithNew = children[0]
    && children[0].kind === 'terminal'
    && children[0].token === 'TOKEN_new';
  if (!startsWithNew) {
    return { ctorMemberNode: null, argsNode: null, argExprs: [] };
  }

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

  if (!ctorMemberNode || !argsNode) {
    for (const child of children) {
      if (!child || child.kind !== 'nonterminal') {
        continue;
      }
      if (!ctorMemberNode) {
        const candidateCtor = findFirstNonterminal(child, 'memberExpression');
        if (candidateCtor && candidateCtor !== memberExpressionNode) {
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

  const argListNode = argsNode
    ? ((argsNode.children || []).find((child) => child && child.kind === 'nonterminal' && child.name === 'argumentList')
      || findFirstNonterminal(argsNode, 'argumentList'))
    : null;
  const argExprs = argListNode ? collectArgumentExpressions(argListNode) : [];
  return { ctorMemberNode, argsNode, argExprs };
}

function collectCallableParameterCppTypes(tree, baseCompileContext = null) {
  const callableByKey = new Map();
  const callableParameterTypesByNode = new Map();
  const registerCallable = (key, callableNode, parameterNames) => {
    if (!key || !callableNode || callableByKey.has(key)) {
      return;
    }
    callableByKey.set(key, { callableNode, parameterNames: Array.from(parameterNames || []) });
    callableParameterTypesByNode.set(callableNode, new Map((parameterNames || []).map((name) => [name, null])));
  };

  for (const functionDeclaration of collectTopLevelFunctionDeclarations(tree)) {
    const functionName = extractFunctionDeclarationName(functionDeclaration);
    registerCallable(functionName, functionDeclaration, extractCallableParameterNames(functionDeclaration));
  }
  for (const { bindingName, functionExpressionNode } of collectTopLevelFunctionExpressionBindings(tree)) {
    registerCallable(bindingName, functionExpressionNode, extractCallableParameterNames(functionExpressionNode));
  }
  for (const { bindingName, arrowFunctionNode } of collectTopLevelArrowFunctionBindings(tree)) {
    registerCallable(bindingName, arrowFunctionNode, extractCallableParameterNames(arrowFunctionNode));
  }
  for (const { symbolName, functionExpressionNode } of collectTopLevelCallArgumentFunctionExpressionBindings(tree)) {
    registerCallable(symbolName, functionExpressionNode, extractCallableParameterNames(functionExpressionNode));
  }
  for (const { bindingName, functionExpressionNode } of collectTopLevelConstructorFunctionExpressionBindings(tree)) {
    registerCallable(bindingName, functionExpressionNode, extractCallableParameterNames(functionExpressionNode));
  }
  for (const { lhs, functionExpressionNode } of collectTopLevelAssignedFunctionExpressionBindings(tree)) {
    registerCallable(lhs, functionExpressionNode, extractCallableParameterNames(functionExpressionNode));
  }
  const hasPrototypeCallable = Array.from(callableByKey.keys())
    .some((key) => key.includes('.prototype.'));

  const buildIterationContext = () => ({
    tree,
    topLevelFunctionExpressionSymbols: baseCompileContext ? baseCompileContext.topLevelFunctionExpressionSymbols : new Map(),
    topLevelArrowFunctionSymbols: baseCompileContext ? baseCompileContext.topLevelArrowFunctionSymbols : new Map(),
    topLevelAssignedFunctionExpressionSymbols: baseCompileContext ? baseCompileContext.topLevelAssignedFunctionExpressionSymbols : new Map(),
    functionReturnTypes: baseCompileContext ? baseCompileContext.functionReturnTypes : new Map(),
    callableParameterTypesByNode
  });

  const mergeCallbackParamTypeHints = (callbackExprNode, hintedCppTypes = []) => {
    const callbackNode = findCallableNodeFromExpression(callbackExprNode);
    if (!callbackNode) {
      return false;
    }
    const currentTypes = callableParameterTypesByNode.get(callbackNode);
    const parameterNames = extractCallableParameterNames(callbackNode);
    if (!currentTypes || parameterNames.length === 0) {
      return false;
    }
    let changed = false;
    for (let i = 0; i < parameterNames.length && i < hintedCppTypes.length; i += 1) {
      const parameterName = parameterNames[i];
      const hintedCppType = hintedCppTypes[i] || null;
      if (!parameterName || !hintedCppType) {
        continue;
      }
      const mergedType = mergeInferredCppParamTypes(currentTypes.get(parameterName), hintedCppType);
      if (mergedType !== currentTypes.get(parameterName)) {
        currentTypes.set(parameterName, mergedType);
        changed = true;
      }
    }
    return changed;
  };

  for (let iteration = 0; iteration < 6; iteration += 1) {
    let changed = false;
    const iterationContext = buildIterationContext();

    const mergeArgTypesIntoCallable = (callableInfo, argExprs) => {
      if (!callableInfo || !callableInfo.callableNode) {
        return;
      }
      const currentTypes = callableParameterTypesByNode.get(callableInfo.callableNode);
      if (!currentTypes) {
        return;
      }
      for (let i = 0; i < callableInfo.parameterNames.length; i += 1) {
        const parameterName = callableInfo.parameterNames[i];
        const argExpr = argExprs[i];
        if (!parameterName || !argExpr) {
          continue;
        }
        const inferredCppType = inferPreciseCppTypeFromExpression(argExpr, iterationContext)
          || inferCppParamTypeFromExprType(inferExprType(argExpr, iterationContext));
        const mergedType = mergeInferredCppParamTypes(currentTypes.get(parameterName), inferredCppType);
        if (mergedType !== currentTypes.get(parameterName)) {
          currentTypes.set(parameterName, mergedType);
          changed = true;
        }
      }
    };

    walk(tree, (node) => {
      if (!node || node.kind !== 'nonterminal') {
        return;
      }

      if (node.name === 'callExpression') {
        const { memberExprNode, argExprs } = extractCallExpressionMemberAndArgs(node);
        const pathSegments = memberExprNode ? extractPathFromMemberExpression(memberExprNode) : null;
        const memberChildren = memberExprNode ? (memberExprNode.children || []) : [];
        const directPropertyIndex = memberChildren.findIndex((child) => child && child.kind === 'terminal' && child.value === '.');
        const directPropertyNode = directPropertyIndex >= 0 ? memberChildren[directPropertyIndex + 1] : null;
        const directPropertyName = directPropertyNode ? findFirstIdentifierValue(directPropertyNode) : null;
        const baseExpressionNode = directPropertyIndex > 0 ? memberChildren[0] : null;
        const callableKey = Array.isArray(pathSegments) && pathSegments.length > 0
          ? (pathSegments.length === 1 ? pathSegments[0] : pathSegments.join('.'))
          : null;
        if (callableKey && callableByKey.has(callableKey)) {
          mergeArgTypesIntoCallable(callableByKey.get(callableKey), argExprs);
        }
        if (directPropertyName
          && ['forEach', 'map', 'filter', 'reduce', 'reduceRight', 'find', 'findIndex'].includes(directPropertyName)
          && baseExpressionNode
          && argExprs.length >= 1) {
          const baseModel = resolveStaticModelFromExpression(baseExpressionNode, node, iterationContext, new Set());
          const elementExprType = baseModel
            && baseModel.kind === 'array'
            && Array.isArray(baseModel.values)
            && baseModel.values.length > 0
            ? mergeStaticModelArrayElementExprTypes(baseModel.values)
            : null;
          const elementCppType = inferCppParamTypeFromExprType(elementExprType);
          const hintedCppTypes = [elementCppType || 'double', 'double', 'void*'];
          if (mergeCallbackParamTypeHints(argExprs[0], hintedCppTypes)) {
            changed = true;
          }
        }
        if (hasPrototypeCallable && Array.isArray(pathSegments) && pathSegments.length >= 2) {
          const instanceType = findBoundClassInstanceTypeAtNode(pathSegments[0], node, iterationContext);
          const prototypeMethodKey = instanceType ? `${instanceType}.prototype.${pathSegments[pathSegments.length - 1]}` : null;
          if (prototypeMethodKey && callableByKey.has(prototypeMethodKey)) {
            mergeArgTypesIntoCallable(callableByKey.get(prototypeMethodKey), argExprs);
          }
        }
        return;
      }

      if (node.name === 'memberExpression') {
        const { ctorMemberNode, argExprs } = extractNewExpressionMemberAndArgs(node);
        const ctorPath = ctorMemberNode ? extractPathFromMemberExpression(ctorMemberNode) : null;
        const ctorKey = Array.isArray(ctorPath) && ctorPath.length > 0
          ? ctorPath.join('.')
          : (ctorMemberNode ? findFirstIdentifierValue(ctorMemberNode) : null);
        if (ctorKey && callableByKey.has(ctorKey)) {
          mergeArgTypesIntoCallable(callableByKey.get(ctorKey), argExprs);
        }
      }
    });

    if (!changed) {
      break;
    }
  }

  return callableParameterTypesByNode;
}

function buildCppParamsFromFunctionNode(functionNode, functionName = null, compileContext = null) {
  const params = extractCallableParameterNames(functionNode);
  const callableArities = extractCallableParameterArities(functionNode);
  const loweredParams = params.map((name) => {
    if (callableArities.has(name)) {
      const arity = callableArities.get(name);
      const fnParams = arity === 0
        ? 'void'
        : Array.from({ length: arity }, () => 'int').join(', ');
      return `int (*${name})(${fnParams})`;
    }
    const inferredParamType = compileContext
      && compileContext.callableParameterTypesByNode
      && compileContext.callableParameterTypesByNode.get(functionNode)
      ? compileContext.callableParameterTypesByNode.get(functionNode).get(name)
      : null;
    return `${inferredParamType || 'int'} ${name}`;
  });

  const functionArgumentsInfo = functionName && compileContext && compileContext.localFunctionArgumentsInfo
    ? compileContext.localFunctionArgumentsInfo.get(functionName)
    : null;
  if (functionArgumentsInfo && functionArgumentsInfo.usesArguments) {
    const extraCount = Math.max(0, functionArgumentsInfo.maxCallArity - params.length);
    const injectedParams = ['int __maia_argc', ...loweredParams];
    for (let i = 0; i < extraCount; i += 1) {
      injectedParams.push(`int __maia_arg_extra_${i}`);
    }
    return injectedParams.join(', ');
  }

  if (loweredParams.length === 0) {
    return 'void';
  }

  return loweredParams.join(', ');
}

function extractHostCallsFromTree(tree, compileContext) {
  const hostCalls = [];
  let callIndex = 0;

  walk(tree, (node) => {
    if (node.kind !== 'nonterminal' || node.name !== 'callExpression') {
      return;
    }

    const children = Array.isArray(node.children) ? node.children : [];
    const memberExpressionNode = extractOutermostCallMemberExpression(node);
    if (!memberExpressionNode) {
      return;
    }

    const pathSegments = extractPathFromMemberExpression(memberExpressionNode);
    if (!pathSegments || pathSegments.length === 0) {
      return;
    }

    if (isLocalFunctionPath(pathSegments, compileContext)) {
      return;
    }

    if (Array.isArray(pathSegments)
      && pathSegments.length === 1
      && getCallableParameterArityAtNode(pathSegments[0], node, compileContext) !== null) {
      return;
    }

    const lambdaBindingState = getLambdaBindingStateAtCallNode(node, pathSegments, compileContext);
    if (lambdaBindingState && lambdaBindingState.isCaptureAware) {
      return;
    }

    const host = compileContext.hostRegistry.resolvePath(pathSegments);
    if (!host) {
      return;
    }

    hostCalls.push({
      source: pathSegments.join('.'),
      host,
      callIndex
    });
    callIndex += 1;
  });

  return hostCalls;
}

// ---- Expression lowering ----

const EXPR_PASSTHROUGH_NODES = new Set([
  'expression', 'assignmentExpression', 'conditionalExpression',
  'logicalORExpression', 'logicalANDExpression', 'bitwiseORExpression',
  'bitwiseXORExpression', 'bitwiseANDExpression', 'equalityExpression',
  'relationalExpression', 'shiftExpression', 'additiveExpression',
  'multiplicativeExpression', 'exponentiationExpression', 'unaryExpression',
  'postfixExpression', 'leftHandSideExpression', 'newExpression', 'memberExpression',
  'identifierReference',
  // NoIn variants (for use in for-loops and for-in expressions)
  'expressionNoIn', 'assignmentExpressionNoIn', 'conditionalExpressionNoIn',
  'logicalORExpressionNoIn', 'logicalANDExpressionNoIn', 'bitwiseORExpressionNoIn',
  'bitwiseXORExpressionNoIn', 'bitwiseANDExpressionNoIn', 'equalityExpressionNoIn',
  'relationalExpressionNoIn', 'shiftExpressionNoIn', 'additiveExpressionNoIn',
  'multiplicativeExpressionNoIn', 'exponentiationExpressionNoIn', 'unaryExpressionNoIn',
  'postfixExpressionNoIn', 'leftHandSideExpressionNoIn', 'newExpressionNoIn', 'memberExpressionNoIn'
]);

// JS-only runtime methods that have no direct C++98 equivalent and must not be
// emitted as member function calls on opaque (void* / int / const char*) values.
// When a call chain hits one of these and it is not in the host registry, the
// chain is truncated and the method call is dropped, yielding a safe fallback.
const JS_RUNTIME_METHODS = new Set([
  // Promise
  'then', 'catch', 'finally',
  // Array.prototype
  'filter', 'map', 'reduce', 'reduceRight', 'forEach', 'find', 'findIndex',
  'some', 'every', 'includes', 'indexOf', 'lastIndexOf', 'flat', 'flatMap',
  'push', 'pop', 'shift', 'unshift', 'splice', 'slice', 'join', 'sort',
  'reverse', 'fill', 'copyWithin', 'at', 'findLast', 'findLastIndex',
  // Object.prototype / iterator
  'keys', 'values', 'entries',
  // String.prototype (non-constant-foldable at runtime)
  'padStart', 'padEnd', 'trim', 'trimStart', 'trimEnd', 'split',
  'startsWith', 'endsWith', 'replace', 'replaceAll', 'match', 'matchAll',
  'search', 'normalize', 'charAt', 'charCodeAt', 'codePointAt',
  'toUpperCase', 'toLowerCase', 'toLocaleUpperCase', 'toLocaleLowerCase',
  'substring', 'substr',
  // Map / Set
  'add', 'delete', 'has', 'clear', 'get', 'set',
  // EventEmitter / Observable
  'on', 'off', 'emit', 'subscribe', 'unsubscribe'
]);

const HOST_METHODS_WITH_RECEIVER_ARG = new Set([
  'padStart', 'padEnd',
  'map', 'filter', 'reduce', 'reduceRight', 'includes',
  'indexOf', 'lastIndexOf', 'find', 'findIndex', 'forEach'
]);

function hostCallNeedsReceiverArg(hostSymbol, directPropertyName, baseExpressionNode) {
  if (!hostSymbol || !directPropertyName || !baseExpressionNode) {
    return false;
  }
  if (!HOST_METHODS_WITH_RECEIVER_ARG.has(directPropertyName)) {
    return false;
  }
  if (/^__str__/.test(hostSymbol)) {
    return true;
  }
  if (/^__.*__(map|filter|reduce|reduceRight|includes|indexOf|lastIndexOf|find|findIndex|forEach)$/.test(hostSymbol)) {
    return true;
  }
  return false;
}

const INFIX_EXPRESSION_NODES = new Set([
  'logicalORExpression',
  'logicalANDExpression',
  'bitwiseORExpression',
  'bitwiseXORExpression',
  'bitwiseANDExpression',
  'equalityExpression',
  'relationalExpression',
  'shiftExpression',
  'additiveExpression',
  'multiplicativeExpression'
]);

const SUPPORTED_INFIX_OPERATORS = new Set([
  '||', '&&', '|', '^', '&',
  '==', '!=', '===', '!==',
  '<', '<=', '>', '>=',
  '<<', '>>', '>>>',
  '+', '-', '*', '/', '%'
]);

const INFIX_OPERATOR_MAP = {
  '===': '==',
  '!==': '!='
};

const BITWISE_INT_OPERATORS = new Set(['|', '^', '&', '<<', '>>', '>>>']);
const INT_ONLY_INFIX_OPERATORS = new Set(['|', '^', '&', '<<', '>>', '>>>', '%']);

function mapInfixOperator(operator) {
  return INFIX_OPERATOR_MAP[operator] || operator;
}

function lowerIdentifierValue(identifierValue, compileContext = null) {
  if (!identifierValue) {
    if (compileContext) {
      reportUnsupportedLowering(
        compileContext,
        'identifier-expression-unlowerable',
        'identifier value could not be resolved'
      );
      if (compileContext.strictLowering) {
        err('unsupported lowering: identifier value');
      }
    }
    return null;
  }

  if (identifierValue === 'null' || identifierValue === 'undefined') {
    return '0';
  }

  if (identifierValue === 'arguments') {
    if (compileContext) {
      compileContext.unsupportedArgumentsUsed = true;
      reportUnsupportedLowering(
        compileContext,
        'unsupported-arguments',
        "identifier 'arguments' is lowered to nullptr"
      );
    }
    return '0';
  }

  const asyncStateField = compileContext
    && compileContext.asyncStateLocalFields
    && compileContext.asyncStateLocalFields.get(identifierValue);
  if (asyncStateField) {
    return `__sm->${asyncStateField}`;
  }

  return identifierValue;
}

function inferExprType(node, compileContext = null) {
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
    if (directPropertyName === 'padStart' || directPropertyName === 'padEnd') {
      return 'string';
    }
    if (Array.isArray(pathSegments) && pathSegments.join('.') === 'Array.prototype.slice.call') {
      return 'array';
    }
    if (directPropertyName === 'includes') {
      return 'bool';
    }
    if (directPropertyName === 'map' || directPropertyName === 'filter') {
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
  const typeMap = { string: 'const char*', number: 'double', bool: 'int', null: 'void*', object: 'void*', array: 'void*', function: 'void*' };
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
  const functionBody = (functionNode && functionNode.children) ? (functionNode.children || []).find(
    (child) => child && child.kind === 'nonterminal' && child.name === 'functionBody'
  ) : null;

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
    const cached = cachedByName.get(nonterminalName);
    return cached === FIRST_NONTERMINAL_MISS ? null : cached;
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
  cachedByName.set(nonterminalName, found || FIRST_NONTERMINAL_MISS);
  return found;
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
      _staticModelNullSentinel: analysisContext._staticModelNullSentinel || null
    }
    : null;

  let loweredExprForTypeHint = null;
  if (analysisCompileContext) {
    try {
      loweredExprForTypeHint = lowerExpressionValue(expressionNode, analysisCompileContext);
    } catch (_) {
      loweredExprForTypeHint = null;
    }
  }

  if (isStringLikeLoweredReturnExpression(loweredExprForTypeHint)) {
    return 'const char*';
  }

  const nestedLogicalNode = expressionNode.name === 'logicalORExpression' || expressionNode.name === 'logicalANDExpression'
    ? expressionNode
    : (findFirstNonterminal(expressionNode, 'logicalORExpression') || findFirstNonterminal(expressionNode, 'logicalANDExpression'));
  const logicalOperatorTokens = ((nestedLogicalNode && nestedLogicalNode.children) || [])
    .filter((child) => child && child.kind === 'terminal')
    .map((child) => String(child.value || '').trim())
    .filter((token) => token === '||' || token === '&&');
  if (logicalOperatorTokens.length > 0 && analysisCompileContext) {
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
  const statementNodes = collectFunctionBodyStatementNodes(functionDeclarationNode);
  const returnExprNodes = [];
  const localBindingCppTypes = new Map();

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
      const inferredType = cppArgType(inferExprType(initializerExpr, null));
      localBindingCppTypes.set(variableName, inferredType);
    }
  }

  if (returnExprNodes.length === 0) {
    const directReturnExpr = extractCallableReturnExpressionNode(functionDeclarationNode);
    if (directReturnExpr) {
      returnExprNodes.push(directReturnExpr);
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
    _staticModelNullSentinel: Symbol('analysis-static-model-null')
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

function collectArgumentExpressions(argListNode) {
  if (!argListNode || argListNode.kind !== 'nonterminal' || argListNode.name !== 'argumentList') {
    return [];
  }

  const result = [];
  for (const child of (argListNode.children || [])) {
    if (!child || child.kind !== 'nonterminal') {
      continue;
    }

    if (child.name === 'assignmentExpression') {
      result.push(child);
      continue;
    }

    if (child.name === 'argumentItem') {
      const assignmentExpression = (child.children || []).find(
        (candidate) => candidate && candidate.kind === 'nonterminal' && candidate.name === 'assignmentExpression'
      );
      if (assignmentExpression) {
        result.push(assignmentExpression);
        continue;
      }

      const directCallable = (child.children || []).find(
        (candidate) => candidate
          && candidate.kind === 'nonterminal'
          && (
            candidate.name === 'functionExpression'
            || candidate.name === 'arrowFunction'
            || candidate.name === 'asyncArrowFunction'
            || candidate.name === 'asyncFunctionExpression'
          )
      );
      if (directCallable) {
        result.push(directCallable);
      }
    }
  }

  return result;
}

function lowerArgumentsNode(argumentsNode, compileContext) {
  if (!argumentsNode || argumentsNode.kind !== 'nonterminal' || argumentsNode.name !== 'arguments') {
    reportUnsupportedLowering(
      compileContext,
      'argument-expression-unlowerable',
      'arguments node is missing, malformed, or unexpected kind'
    );
    if (compileContext && compileContext.strictLowering) {
      err('unsupported lowering: arguments node shape');
    }
    return '';
  }

  const argListNode = (argumentsNode.children || []).find(
    (child) => child && child.kind === 'nonterminal' && child.name === 'argumentList'
  );
  const argExprs = argListNode ? collectArgumentExpressions(argListNode) : [];

  return argExprs.map((expr) => {
    return lowerRequiredExpressionValue(
      expr,
      compileContext,
      'argument-expression-unlowerable',
      'argument expression'
    );
  }).join(', ');
}

function unwrapExpressionNode(node) {
  let current = node;
  while (current && current.kind === 'nonterminal') {
    if (current.name === 'literal' || current.name === 'additiveExpression' || current.name === 'identifier') {
      return current;
    }
    if (current.name === 'primaryExpression') {
      const literalChild = (current.children || []).find(
        (child) => child && child.kind === 'nonterminal' && child.name === 'literal'
      );
      if (literalChild) {
        return literalChild;
      }
    }
    const nonterminalChildren = (current.children || []).filter(
      (child) => child && child.kind === 'nonterminal'
    );
    if (nonterminalChildren.length !== 1) {
      return current;
    }
    current = nonterminalChildren[0];
  }
  return current;
}

function unwrapDirectIdentifierExpression(node) {
  let current = node;
  while (current && current.kind === 'nonterminal') {
    if (current.name === 'identifier') {
      return current;
    }
    const nonterminalChildren = (current.children || []).filter(
      (child) => child && child.kind === 'nonterminal'
    );
    if (nonterminalChildren.length !== 1) {
      return null;
    }
    current = nonterminalChildren[0];
  }
  return null;
}

function isDirectNullishExpression(node) {
  if (!node || node.kind !== 'nonterminal') {
    return false;
  }
  const directIdentifier = unwrapDirectIdentifierExpression(node);
  const directIdentifierName = directIdentifier ? findFirstIdentifierValue(directIdentifier) : null;
  if (directIdentifierName === 'undefined' || directIdentifierName === 'null') {
    return true;
  }
  return Boolean(findFirstTerminalByToken(node, 'TOKEN_null'));
}

function extractDirectCallExpressionNode(node) {
  let current = node;
  while (current && current.kind === 'nonterminal') {
    if (current.name === 'callExpression') {
      return current;
    }
    const nonterminalChildren = (current.children || []).filter(
      (child) => child && child.kind === 'nonterminal'
    );
    if (nonterminalChildren.length !== 1) {
      return null;
    }
    current = nonterminalChildren[0];
  }
  return null;
}

function callExpressionContainsDirectPromiseThen(callExpressionNode) {
  if (!callExpressionNode || callExpressionNode.kind !== 'nonterminal' || callExpressionNode.name !== 'callExpression') {
    return false;
  }
  const children = callExpressionNode.children || [];
  for (let i = 0; i < children.length - 2; i += 1) {
    const dotNode = children[i];
    const propertyNode = children[i + 1];
    const argsNode = children[i + 2];
    if (!dotNode || dotNode.kind !== 'terminal' || dotNode.value !== '.') {
      continue;
    }
    if (!propertyNode || propertyNode.kind !== 'nonterminal' || propertyNode.name !== 'propertyIdentifierName') {
      continue;
    }
    if (findFirstIdentifierValue(propertyNode) !== 'then') {
      continue;
    }
    if (argsNode && argsNode.kind === 'nonterminal' && argsNode.name === 'arguments') {
      return true;
    }
  }
  return false;
}

function findFirstPromiseThenCallExpression(node) {
  let found = null;
  walk(node, (candidate) => {
    if (found || !candidate || candidate.kind !== 'nonterminal' || candidate.name !== 'callExpression') {
      return;
    }
    if (callExpressionContainsDirectPromiseThen(candidate)) {
      found = candidate;
    }
  });
  return found;
}

function isDroppedDirectJsRuntimeMethodCallExpression(node, compileContext) {
  const callExpressionNode = extractDirectCallExpressionNode(node);
  if (!callExpressionNode) {
    return false;
  }

  const staticallyLowered = lowerStaticModelToRuntimeExpression(
    resolveStaticModelFromExpression(callExpressionNode, callExpressionNode, compileContext)
  );
  if (staticallyLowered !== null || tryLowerStaticPromiseThenChain(callExpressionNode, compileContext) !== null) {
    return false;
  }

  const children = callExpressionNode.children || [];
  const memberExprNode = children.find(
    (child) => child && child.kind === 'nonterminal' && child.name === 'memberExpression'
  ) || null;
  if (!memberExprNode) {
    return false;
  }

  const memberChildren = memberExprNode.children || [];
  const directPropertyIndex = memberChildren.findIndex(
    (child) => child && child.kind === 'terminal' && child.value === '.'
  );
  if (directPropertyIndex <= 0) {
    return false;
  }

  const directPropertyNode = memberChildren[directPropertyIndex + 1] || null;
  const directPropertyName = directPropertyNode ? findFirstIdentifierValue(directPropertyNode) : null;
  if (!directPropertyName || !JS_RUNTIME_METHODS.has(directPropertyName)) {
    return false;
  }

  const pathSegments = extractPathFromMemberExpression(memberExprNode, null);
  if (pathSegments && pathSegments.length > 0) {
    return false;
  }

  reportUnsupportedLowering(
    compileContext,
    'js-runtime-method-call',
    `dropping JS runtime member call '${directPropertyName}' on non-host base expression`
  );
  return true;
}

function extractStringLiteralValue(node) {
  const unwrapped = unwrapExpressionNode(node);
  if (!unwrapped || unwrapped.kind !== 'nonterminal' || unwrapped.name !== 'literal') {
    return null;
  }

  const stringLiteralNode = (unwrapped.children || []).find(
    (child) => child && child.kind === 'nonterminal' && child.name === 'stringLiteral'
  );
  if (!stringLiteralNode) {
    return null;
  }

  const terminal = (stringLiteralNode.children || []).find(
    (child) => child && child.kind === 'terminal'
  );
  if (!terminal) {
    return null;
  }

  const normalized = normalizeJsStringLiteralForCpp(terminal.value);
  if (!normalized) {
    return '';
  }

  try {
    return JSON.parse(normalized);
  } catch (_) {
    if (normalized.length < 2) {
      return '';
    }
    return normalized.slice(1, -1);
  }
}

function collectAdditiveStringPieces(node, out) {
  if (!node || node.kind !== 'nonterminal') {
    return;
  }

  const unwrapped = unwrapExpressionNode(node);
  if (!unwrapped || unwrapped.kind !== 'nonterminal') {
    return;
  }

  if (unwrapped.name === 'additiveExpression') {
    for (const child of (unwrapped.children || [])) {
      if (!child || child.kind !== 'nonterminal') {
        continue;
      }
      collectAdditiveStringPieces(child, out);
    }
    return;
  }

  const literalText = extractStringLiteralValue(unwrapped);
  if (literalText !== null) {
    out.push(literalText);
  }
}

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
    if (cachedPiece !== undefined) {
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
      return lowerIdentifierValue(identifierValue, compileContext);
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

  if (lowered !== null && preludeCountAfter > preludeCountBefore) {
    return lowered;
  }

  const loweredConcat = tryLowerConsoleLogConcatExpression(expressionNode, compileContext);
  if (loweredConcat !== null) {
    return loweredConcat;
  }

  if (lowered !== null) {
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

  const args = lowerArgumentsNode(argsNode, compileContext);
  if (compileContext && compileContext.topLevelClassNames && compileContext.topLevelClassNames.has(ctorBase)) {
    return `new ${ctorBase}(${args})`;
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
      continue;
    }

    const computedPropertyName = findFirstNonterminal(propertyNameNode, 'computedPropertyName');
    let key = null;
    if (computedPropertyName) {
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
      } else if (compileContext) {
        reportUnsupportedLowering(
          compileContext,
          'computed-object-property-unlowerable',
          'computed object property requires a static string or numeric key'
        );
      }
    } else {
      key = findFirstIdentifierValue(propertyNameNode);
    }
    if (!key) {
      continue;
    }

    properties.push({ key, valueExprNode });
  }

  return properties;
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

  if (properties.length === 0) {
    return '__maia_obj_literal0()';
  }

  if (properties.length > 4) {
    // Use builder pattern for large objects
    let chain = '__maia_obj_builder_begin()';
    for (const property of properties) {
      const keyLiteral = `(char*)${JSON.stringify(property.key)}`;
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
    const keyLiteral = `(char*)${JSON.stringify(property.key)}`;
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

  const params = extractLambdaParameterNames(arrowNode);
  const arity = params.length;
  const captures = collectLambdaCaptureNames(arrowNode, compileContext);
  const hookName = getLambdaRuntimeHookName(arity, captures.length, isAsync);
  if (captures.length > 0) {
    const captureArgs = captures.map((name) => `(int)(${name})`).join(', ');
    return `${hookName}(${captureArgs})`;
  }
  return `${hookName}()`;
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

  return JSON.stringify(decoded);
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
    if (child.kind !== 'nonterminal') { continue; }
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

function lowerIdentifierFromLeftHandSideExpression(node, compileContext = null) {
  if (!node || node.kind !== 'nonterminal' || node.name !== 'leftHandSideExpression') {
    if (compileContext) {
      reportUnsupportedLowering(
        compileContext,
        'left-hand-side-unlowerable',
        'leftHandSideExpression node is missing or malformed'
      );
      if (compileContext.strictLowering) {
        err('unsupported lowering: leftHandSideExpression node');
      }
    }
    return null;
  }

  // Check for memberExpression (handles this.x, foo.bar, etc.)
  let memberExprNode = null;
  walk(node, (n) => {
    if (!memberExprNode && n && n.kind === 'nonterminal' && n.name === 'memberExpression') {
      memberExprNode = n;
    }
  });
  if (memberExprNode) {
    const segments = extractPathFromMemberExpression(memberExprNode, compileContext);
    if (segments && segments.length >= 2) {
      if (!compileContext) {
        return segments.join('.');
      }
      const memberPath = segments.join('.');
      const isKnownAssignedFunctionTarget = compileContext.topLevelAssignedFunctionExpressionSymbols
        && compileContext.topLevelAssignedFunctionExpressionSymbols.has(memberPath);
      if (isKnownAssignedFunctionTarget) {
        return memberPath;
      }
      const isThisMember = segments[0] === 'this';
      const localClassType = isThisMember ? null : findBoundClassInstanceTypeAtNode(segments[0], memberExprNode, compileContext);
      if (!isThisMember && !localClassType) {
        reportUnsupportedLowering(
          compileContext,
          'left-hand-side-unlowerable',
          `member assignment target '${memberPath}' is not a known C++ object`
        );
        if (compileContext && compileContext.strictLowering) {
          err(`unsupported lowering: member assignment target '${memberPath}'`);
        }
        return null;
      }
      let result = segments[0];
      for (let i = 1; i < segments.length; i++) {
        result += (i === 1 && segments[0] === 'this') ? '->' + segments[i] : '.' + segments[i];
      }
      return result;
    }
  }

  const identifier = findFirstIdentifierValue(node);
  if (!identifier && compileContext) {
    reportUnsupportedLowering(
      compileContext,
      'left-hand-side-unlowerable',
      'leftHandSideExpression identifier could not be resolved'
    );
    if (compileContext.strictLowering) {
      err('unsupported lowering: leftHandSideExpression identifier');
    }
  }
  if (identifier && compileContext && compileContext.asyncStateLocalFields) {
    const asyncStateField = compileContext.asyncStateLocalFields.get(identifier);
    if (asyncStateField) {
      return `__sm->${asyncStateField}`;
    }
  }
  return identifier || null;
}

function lowerAssignmentExpressionValue(node, compileContext) {
  if (!node
    || node.kind !== 'nonterminal'
    || (node.name !== 'assignmentExpression' && node.name !== 'assignmentExpressionNoIn')) {
    reportUnsupportedLowering(
      compileContext,
      'assignment-expression-unlowerable',
      'assignment expression node is missing, malformed, or unexpected kind'
    );
    if (compileContext && compileContext.strictLowering) {
      err('unsupported lowering: assignment expression node shape');
    }
    return null;
  }

  const children = node.children || [];
  let lhsChild = (children[0] && children[0].kind === 'nonterminal' && children[0].name === 'leftHandSideExpression') 
    ? children[0] 
    : null;
  if (!lhsChild) {
    lhsChild = findFirstNonterminal(node, 'leftHandSideExpression');
  }
  let opChild = (children[1] && children[1].kind === 'nonterminal' && children[1].name === 'assignmentOperator')
    ? children[1]
    : null;
  if (!opChild) {
    opChild = findFirstNonterminal(node, 'assignmentOperator');
  }
  let rhsChild = (children[2] && children[2].kind === 'nonterminal' && children[2].name === 'assignmentExpression')
    ? children[2]
    : null;
  if (!rhsChild) {
    rhsChild = findFirstNonterminal(node, 'assignmentExpression');
  }
  if (!rhsChild && children[2] && children[2].kind === 'nonterminal' && children[2].name === 'assignmentExpressionNoIn') {
    rhsChild = children[2];
  }
  if (!rhsChild) {
    rhsChild = findFirstNonterminal(node, 'assignmentExpressionNoIn');
  }

  if (lhsChild && opChild && rhsChild) {
    const fallbackLhs = lowerIdentifierFromLeftHandSideExpression(lhsChild, null);
    const lhsMemberExprNode = findFirstNonterminal(lhsChild, 'memberExpression');
    const lhsComputedInfo = lhsMemberExprNode ? extractComputedMemberAccessInfo(lhsMemberExprNode) : null;

    let operatorToken = (opChild.children || []).find((child) => child && child.kind === 'terminal') || null;
    if (!operatorToken) {
      walk(opChild, (child) => {
        if (!operatorToken && child && child.kind === 'terminal') {
          operatorToken = child;
        }
      });
    }
    if (!operatorToken) {
      reportUnsupportedLowering(
        compileContext,
        'assignment-expression-unlowerable',
        'assignment expression operator token could not be resolved'
      );
      if (compileContext && compileContext.strictLowering) {
        err('unsupported lowering: assignment expression operator');
      }
      return null;
    }
    const operatorValue = String(operatorToken.value || '').trim();

    if (lhsComputedInfo && operatorValue === '=') {
      const loweredBase = lowerExpressionValue(lhsComputedInfo.baseExpressionNode, compileContext);
      const loweredProperty = lowerExpressionValue(lhsComputedInfo.propertyExpressionNode, compileContext);
      const rhsValue = lowerExpressionValue(rhsChild, compileContext);
      const propertyModel = compileContext
        ? resolveStaticModelFromExpression(lhsComputedInfo.propertyExpressionNode, lhsComputedInfo.propertyExpressionNode, compileContext)
        : null;
      if (loweredBase !== null && loweredProperty !== null && rhsValue !== null) {
        const normalizedRhs = rhsValue === 'null' ? 'nullptr' : rhsValue;
        if (propertyModel && propertyModel.kind === 'string') {
          return `(__maia_runtime_value_set_property((void*)(${loweredBase}), ${JSON.stringify(propertyModel.value)}, (long)(${normalizedRhs})), ${normalizedRhs})`;
        }
        return `(__maia_runtime_value_set_index((void*)(${loweredBase}), (int)(${loweredProperty}), (long)(${normalizedRhs})), ${normalizedRhs})`;
      }
    }

    if (operatorValue === '=' && fallbackLhs) {
      const assignedCallableSymbol = compileContext
        && compileContext.topLevelAssignedFunctionExpressionSymbols
        ? compileContext.topLevelAssignedFunctionExpressionSymbols.get(fallbackLhs)
        : null;
      const rhsCallExpression = extractDirectCallExpressionNode(rhsChild);
      const rhsMemberExpression = rhsCallExpression
        ? (rhsCallExpression.children || []).find(
          (child) => child && child.kind === 'nonterminal' && child.name === 'memberExpression'
        ) || null
        : null;
      const rhsPathSegments = rhsMemberExpression
        ? extractPathFromMemberExpression(rhsMemberExpression, null)
        : null;
      const isPrototypeCreateAssignment = fallbackLhs.endsWith('.prototype')
        && rhsCallExpression
        && Array.isArray(rhsPathSegments)
        && rhsPathSegments.join('.') === 'Object.create';
      const isPrototypeConstructorAssignment = fallbackLhs.endsWith('.prototype.constructor');
      const rhsFunctionExpression = extractDirectFunctionExpressionInitializer(rhsChild);
      const rhsArrowFunction = extractDirectArrowFunctionInitializer(rhsChild);
      const isPrototypeMethodAssignment = fallbackLhs.includes('.prototype.')
        && (assignedCallableSymbol || rhsFunctionExpression || rhsArrowFunction);
      const isTopLevelStaticMethodAssignment = fallbackLhs.includes('.')
        && !fallbackLhs.includes('.prototype.')
        && (assignedCallableSymbol || rhsFunctionExpression || rhsArrowFunction)
        && compileContext
        && compileContext.topLevelBindingNames
        && compileContext.topLevelBindingNames.has(fallbackLhs.split('.')[0]);
      if (isPrototypeCreateAssignment || isPrototypeConstructorAssignment || isPrototypeMethodAssignment || isTopLevelStaticMethodAssignment) {
        return '(void)0';
      }
    }

    let lhs = lowerIdentifierFromLeftHandSideExpression(lhsChild, compileContext);
    if (!lhs && compileContext && compileContext.topLevelAssignedFunctionExpressionSymbols) {
      if (fallbackLhs && compileContext.topLevelAssignedFunctionExpressionSymbols.has(fallbackLhs)) {
        lhs = fallbackLhs;
      }
    }

    if (!lhs) {
      reportUnsupportedLowering(
        compileContext,
        'assignment-expression-unlowerable',
        'assignment expression left-hand side could not be lowered'
      );
      if (compileContext && compileContext.strictLowering) {
        err('unsupported lowering: assignment expression left-hand side');
      }
      return null;
    }

    const assignedFunctionSymbol = compileContext
      && compileContext.topLevelAssignedFunctionExpressionSymbols
      ? compileContext.topLevelAssignedFunctionExpressionSymbols.get(lhs)
      : null;
    const rhs = assignedFunctionSymbol || lowerExpressionValue(rhsChild, compileContext);

    if (operatorValue === '**=') {
      const rhsPowValue = rhs === null ? '0' : (rhs === 'null' ? 'nullptr' : rhs);
      return `${lhs} = __maia_pow_i32((int)(${lhs}), (int)(${rhsPowValue}))`;
    }

    if (rhs === null) {
      reportUnsupportedLowering(
        compileContext,
        'assignment-expression-unlowerable',
        `assignment expression right-hand side could not be lowered for '${operatorValue}'`
      );
      if (compileContext && compileContext.strictLowering) {
        err(`unsupported lowering: assignment expression right-hand side '${operatorValue}'`);
      }
      return `${lhs} ${operatorValue} 0`;
    }

    const rhsValue = rhs === 'null' ? 'nullptr' : rhs;
    if (operatorValue === '%=') {
      return `${lhs} = (double)((int)(${lhs}) % (int)(${rhsValue}))`;
    }
    return `${lhs} ${operatorValue} ${rhsValue}`;
  }

  let nonterminalChildren = children.filter((child) => child && child.kind === 'nonterminal');
  const directCallChildren = nonterminalChildren.filter((child) => child.name === 'callExpression');
  if (directCallChildren.length === 1) {
    nonterminalChildren = directCallChildren;
  }
  if (nonterminalChildren.length === 0) {
    const fallbackCandidates = [];
    const fallbackNames = [
      'conditionalExpression',
      'conditionalExpressionNoIn',
      'leftHandSideExpression',
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
    nonterminalChildren = fallbackCandidates;
  }
  if (nonterminalChildren.length === 1) {
    const loweredChild = lowerExpressionValue(nonterminalChildren[0], compileContext);
    if (loweredChild === null) {
      reportUnsupportedLowering(
        compileContext,
        'assignment-expression-unlowerable',
        'assignment expression child could not be lowered'
      );
      if (compileContext && compileContext.strictLowering) {
        err('unsupported lowering: assignment expression child');
      }
    }
    return loweredChild;
  }

  reportUnsupportedLowering(
    compileContext,
    'assignment-expression-unlowerable',
    'assignment expression could not be matched to a supported shape'
  );
  if (compileContext && compileContext.strictLowering) {
    err('unsupported lowering: assignment expression');
  }
  return null;
}

function lowerPostfixExpressionValue(node, compileContext) {
  if (!node || node.kind !== 'nonterminal' || node.name !== 'postfixExpression') {
    reportUnsupportedLowering(
      compileContext,
      'postfix-expression-unlowerable',
      'postfix expression node is missing, malformed, or unexpected kind'
    );
    if (compileContext && compileContext.strictLowering) {
      err('unsupported lowering: postfix expression node shape');
    }
    return null;
  }

  const children = node.children || [];
  if (children.length === 2
      && children[0].kind === 'nonterminal'
      && children[0].name === 'leftHandSideExpression'
      && children[1].kind === 'terminal'
      && (children[1].token === 'TOKEN__2B__2B_' || children[1].token === 'TOKEN__2D__2D_')) {
    const target = lowerIdentifierFromLeftHandSideExpression(children[0], compileContext);
    if (!target) {
      reportUnsupportedLowering(
        compileContext,
        'postfix-expression-unlowerable',
        `postfix expression target could not be lowered for '${children[1].value}'`
      );
      if (compileContext && compileContext.strictLowering) {
        err(`unsupported lowering: postfix expression target '${children[1].value}'`);
      }
      return null;
    }
    return `${target}${children[1].value}`;
  }

  let nonterminalChildren = children.filter((child) => child && child.kind === 'nonterminal');
  if (nonterminalChildren.length === 0) {
    const fallbackCandidates = [];
    const fallbackNames = [
      'callExpression',
      'leftHandSideExpression',
      'unaryExpression',
      'primaryExpression',
      'memberExpression'
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
    nonterminalChildren = fallbackCandidates;
  }
  if (nonterminalChildren.length === 1) {
    const loweredChild = lowerExpressionValue(nonterminalChildren[0], compileContext);
    if (loweredChild === null) {
      reportUnsupportedLowering(
        compileContext,
        'postfix-expression-unlowerable',
        'postfix expression child could not be lowered'
      );
      if (compileContext && compileContext.strictLowering) {
        err('unsupported lowering: postfix expression child');
      }
    }
    return loweredChild;
  }

  reportUnsupportedLowering(
    compileContext,
    'postfix-expression-unlowerable',
    'postfix expression could not be matched to a supported shape'
  );
  if (compileContext && compileContext.strictLowering) {
    err('unsupported lowering: postfix expression');
  }
  return null;
}

function lowerUnaryExpressionValue(node, compileContext) {
  if (!node || node.kind !== 'nonterminal' || node.name !== 'unaryExpression') {
    reportUnsupportedLowering(
      compileContext,
      'unary-expression-unlowerable',
      'unary expression node is missing, malformed, or unexpected kind'
    );
    if (compileContext && compileContext.strictLowering) {
      err('unsupported lowering: unary expression node shape');
    }
    return null;
  }

  const children = node.children || [];
  
  // Try to find operator and operand even if encapsulated
  let opTerminal = (children[0] && children[0].kind === 'terminal' 
    && (children[0].token === 'TOKEN__21_' || children[0].token === 'TOKEN__2D_' || children[0].token === 'TOKEN__2B_' || children[0].token === 'TOKEN__7E_'))
    ? children[0]
    : null;
  if (!opTerminal) {
    for (const child of children) {
      if (child && child.kind === 'terminal'
        && (child.token === 'TOKEN__21_' || child.token === 'TOKEN__2D_' || child.token === 'TOKEN__2B_' || child.token === 'TOKEN__7E_')) {
        opTerminal = child;
        break;
      }
    }
  }
  
  let operandNode = (children[1] && children[1].kind === 'nonterminal')
    ? children[1]
    : null;
  if (!operandNode) {
    operandNode = findFirstNonterminal(node, 'postfixExpression') || findFirstNonterminal(node, 'unaryExpression') || findFirstNonterminal(node, 'primaryExpression');
  }
  
  if (opTerminal && operandNode && !opTerminal.token.includes('__2B__2B_') && !opTerminal.token.includes('__2D__2D_')) {
    const operand = lowerExpressionValue(operandNode, compileContext);
    if (operand === null) {
      reportUnsupportedLowering(
        compileContext,
        'unary-expression-unlowerable',
        `unary expression operand could not be lowered for '${opTerminal.value}'`
      );
      if (compileContext && compileContext.strictLowering) {
        err(`unsupported lowering: unary expression operand '${opTerminal.value}'`);
      }
      return null;
    }
    if (opTerminal.token === 'TOKEN__21_') {
      return `!((int)(${operand}))`;
    }
    if (opTerminal.token === 'TOKEN__2B_') {
      return operand;
    }
    return `${opTerminal.value}(${operand})`;
  }

  // Try to match prefix update operators (++/--)
  let prefixOpTerminal = (children[0] && children[0].kind === 'terminal'
    && (children[0].token === 'TOKEN__2B__2B_' || children[0].token === 'TOKEN__2D__2D_'))
    ? children[0]
    : null;
  if (!prefixOpTerminal) {
    for (const child of children) {
      if (child && child.kind === 'terminal' && (child.token === 'TOKEN__2B__2B_' || child.token === 'TOKEN__2D__2D_')) {
        prefixOpTerminal = child;
        break;
      }
    }
  }
  
  let prefixTargetNode = (children[1] && children[1].kind === 'nonterminal' && children[1].name === 'unaryExpression')
    ? children[1]
    : null;
  if (!prefixTargetNode) {
    prefixTargetNode = findFirstNonterminal(node, 'unaryExpression');
  }
  
  if (prefixOpTerminal && prefixTargetNode) {
    let postfixNode = (prefixTargetNode.children || []).find(
      (child) => child && child.kind === 'nonterminal' && child.name === 'postfixExpression'
    ) || null;
    if (!postfixNode) {
      postfixNode = findFirstNonterminal(prefixTargetNode, 'postfixExpression');
    }
    if (postfixNode) {
      let lhsNode = (postfixNode.children || []).find(
        (child) => child && child.kind === 'nonterminal' && child.name === 'leftHandSideExpression'
      ) || null;
      if (!lhsNode) {
        lhsNode = findFirstNonterminal(postfixNode, 'leftHandSideExpression');
      }
      if (lhsNode) {
        const target = lowerIdentifierFromLeftHandSideExpression(lhsNode, compileContext);
        if (target) {
          return `${prefixOpTerminal.value}${target}`;
        }
      }
    }
    reportUnsupportedLowering(
      compileContext,
      'unary-expression-unlowerable',
      `prefix update target could not be lowered for '${prefixOpTerminal.value}'`
    );
    if (compileContext && compileContext.strictLowering) {
      err(`unsupported lowering: prefix update target '${prefixOpTerminal.value}'`);
    }
    return null;
  }

  let nonterminalChildren = children.filter((child) => child && child.kind === 'nonterminal');
  const directCallChildren = nonterminalChildren.filter((child) => child.name === 'callExpression');
  if (directCallChildren.length === 1) {
    nonterminalChildren = directCallChildren;
  }
  if (nonterminalChildren.length === 0) {
    const fallbackCandidates = [];
    const fallbackNames = [
      'callExpression',
      'postfixExpression',
      'leftHandSideExpression',
      'primaryExpression',
      'memberExpression'
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
    nonterminalChildren = fallbackCandidates;
  }
  if (nonterminalChildren.length === 1) {
    const loweredChild = lowerExpressionValue(nonterminalChildren[0], compileContext);
    if (loweredChild === null) {
      reportUnsupportedLowering(
        compileContext,
        'unary-expression-unlowerable',
        'unary expression child could not be lowered'
      );
      if (compileContext && compileContext.strictLowering) {
        err('unsupported lowering: unary expression child');
      }
    }
    return loweredChild;
  }

  reportUnsupportedLowering(
    compileContext,
    'unary-expression-unlowerable',
    'unary expression could not be matched to a supported shape'
  );
  if (compileContext && compileContext.strictLowering) {
    err('unsupported lowering: unary expression');
  }
  return null;
}

function lowerInfixExpressionValue(node, compileContext) {
  if (!node || node.kind !== 'nonterminal' || !INFIX_EXPRESSION_NODES.has(node.name)) {
    reportUnsupportedLowering(
      compileContext,
      'infix-expression-unlowerable',
      'infix expression node is missing, malformed, or unexpected kind'
    );
    if (compileContext && compileContext.strictLowering) {
      err('unsupported lowering: infix expression node shape');
    }
    return null;
  }

  const operatorTokens = (node.children || [])
    .filter((child) => child && child.kind === 'terminal')
    .map((child) => String(child.value || '').trim())
    .filter(Boolean);

  if (operatorTokens.includes('instanceof')) {
    let nonterminalChildren = (node.children || []).filter((child) => child && child.kind === 'nonterminal');
    if (nonterminalChildren.length !== 2) {
      const fallbackCandidates = [];
      const fallbackNames = [
        'leftHandSideExpression',
        'unaryExpression',
        'postfixExpression',
        'primaryExpression',
        'identifier'
      ];
      for (const child of (node.children || [])) {
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
    if (nonterminalChildren.length === 2) {
      let lhs = lowerExpressionValue(nonterminalChildren[0], compileContext);
      const lhsIdentifier = findFirstIdentifierValue(nonterminalChildren[0]);
      const lhsInstanceType = lhsIdentifier && compileContext
        ? findBoundClassInstanceTypeAtNode(lhsIdentifier, node, compileContext)
        : null;
      if (lhsIdentifier && lhsInstanceType && compileContext && compileContext.topLevelClassNames && compileContext.topLevelClassNames.has(lhsInstanceType)) {
        lhs = `&${lhsIdentifier}`;
      }
      const rhsClassName = findFirstIdentifierValue(nonterminalChildren[1]);
      if (lhsInstanceType && rhsClassName) {
        let currentType = lhsInstanceType;
        const seenTypes = new Set();
        while (currentType && !seenTypes.has(currentType)) {
          if (currentType === rhsClassName) {
            return '1';
          }
          seenTypes.add(currentType);
          currentType = compileContext && compileContext.topLevelPrototypeHeritageMap
            ? (compileContext.topLevelPrototypeHeritageMap.get(currentType) || null)
            : null;
        }
      }
      if (lhs !== null && rhsClassName) {
        return `(dynamic_cast<${rhsClassName}*>(${lhs}) != 0)`;
      }
    }
    reportUnsupportedLowering(
      compileContext,
      'infix-expression-unlowerable',
      'instanceof expression could not be lowered'
    );
    if (compileContext && compileContext.strictLowering) {
      err('unsupported lowering: instanceof expression');
    }
    return null;
  }

  if (node.name === 'additiveExpression'
    && operatorTokens.includes('+')
    && inferExprType(node, compileContext) === 'string') {
    const loweredConcat = tryLowerConsoleLogConcatExpression(node, compileContext);
    if (loweredConcat !== null) {
      return loweredConcat;
    }
  }

  const parts = [];
  const operandNodes = [];
  for (const child of (node.children || [])) {
    if (!child) {
      continue;
    }

    if (child.kind === 'nonterminal') {
      let lowered = lowerExpressionValue(child, compileContext);
      
      // Fallback: if direct lowering failed, try to find nested expression
      if (lowered === null) {
        const fallbackNames = [
          'expression',
          'assignmentExpression',
          'conditionalExpression',
          'conditionalExpressionNoIn',
          'arrowFunction',
          'asyncArrowFunction',
          'unaryExpression',
          'postfixExpression',
          'callExpression',
          'memberExpression',
          'leftHandSideExpression',
          'primaryExpression',
          'identifier'
        ];
        for (const fallbackName of fallbackNames) {
          const nestedExpr = findFirstNonterminal(child, fallbackName);
          if (nestedExpr) {
            lowered = lowerExpressionValue(nestedExpr, compileContext);
            if (lowered !== null) {
              break;
            }
          }
        }
      }
      
      if (lowered === null) {
        reportUnsupportedLowering(
          compileContext,
          'infix-expression-unlowerable',
          `infix expression child could not be lowered in ${node.name}`
        );
        if (compileContext && compileContext.strictLowering) {
          err(`unsupported lowering: infix expression child in ${node.name}`);
        }
        return null;
      }
      parts.push(lowered);
      operandNodes.push(child);
      continue;
    }

    if (child.kind === 'terminal') {
      const operator = String(child.value || '').trim();
      if (!operator) {
        continue;
      }

      if (!SUPPORTED_INFIX_OPERATORS.has(operator)) {
        reportUnsupportedLowering(
          compileContext,
          'infix-expression-unlowerable',
          `unsupported infix operator '${operator}' in ${node.name}`
        );
        if (compileContext && compileContext.strictLowering) {
          err(`unsupported lowering: infix operator '${operator}' in ${node.name}`);
        }
        return null;
      }

      parts.push(mapInfixOperator(operator));
    }
  }

  if (parts.length === 1) {
    return parts[0];
  }

  if (parts.length < 3 || parts.length % 2 === 0) {
    reportUnsupportedLowering(
      compileContext,
      'infix-expression-unlowerable',
      `infix expression could not be normalized for ${node.name}`
    );
    if (compileContext && compileContext.strictLowering) {
      err(`unsupported lowering: infix expression normalization for ${node.name}`);
    }
    return null;
  }

  if (parts.length === 3 && (parts[1] === '||' || parts[1] === '&&') && compileContext) {
    if (!Array.isArray(compileContext._preludeStatements)) {
      compileContext._preludeStatements = [];
    }
    if (compileContext._logicalValueTempCount === undefined) {
      compileContext._logicalValueTempCount = 0;
    }

    const lhsType = operandNodes[0] ? inferExprType(operandNodes[0], compileContext) : 'any';
    const lhsCppType = lhsType === 'string'
      ? 'const char*'
      : (lhsType === 'number'
        ? 'double'
        : (lhsType === 'bool' ? 'int' : 'void*'));
    const lhsTempName = `__maia_logical_tmp${compileContext._logicalValueTempCount++}`;
    compileContext._preludeStatements.push(`${lhsCppType} ${lhsTempName} = (${lhsCppType})(${parts[0]});`);
    const lhsTruthyExpr = lhsType === 'string'
      ? `(${lhsTempName} != 0 && ${lhsTempName}[0] != '\\0')`
      : `(${lhsTempName} != 0)`;
    return parts[1] === '||'
      ? `((${lhsTruthyExpr}) ? ${lhsTempName} : ${parts[2]})`
      : `((${lhsTruthyExpr}) ? ${parts[2]} : ${lhsTempName})`;
  }

  const hasIntOnlyOperator = parts.some((part, index) => index % 2 === 1 && INT_ONLY_INFIX_OPERATORS.has(part));
  if (hasIntOnlyOperator) {
    for (let i = 0; i < parts.length; i += 2) {
      parts[i] = `(int)(${parts[i]})`;
    }
  }

  if (parts.length === 3 && parts[1] === '/') {
    const lhsType = operandNodes[0] ? inferExprType(operandNodes[0], compileContext) : 'any';
    const rhsType = operandNodes[1] ? inferExprType(operandNodes[1], compileContext) : 'any';
    if ((lhsType === 'number' || lhsType === 'bool') && (rhsType === 'number' || rhsType === 'bool')) {
      return `((double)(${parts[0]}) / (double)(${parts[2]}))`;
    }
  }

  if (parts.length === 3 && (parts[1] === '==' || parts[1] === '!=')) {
    const lhsType = operandNodes[0] ? inferExprType(operandNodes[0], compileContext) : 'any';
    const rhsType = operandNodes[1] ? inferExprType(operandNodes[1], compileContext) : 'any';
    const strictOperator = operatorTokens.find((token) => token === '===' || token === '!==') || null;
    const lhsIsNullish = operandNodes[0] ? isDirectNullishExpression(operandNodes[0]) : false;
    const rhsIsNullish = operandNodes[1] ? isDirectNullishExpression(operandNodes[1]) : false;
    const lhsIdentifier = operandNodes[0] ? findFirstIdentifierValue(operandNodes[0]) : null;
    const rhsIdentifier = operandNodes[1] ? findFirstIdentifierValue(operandNodes[1]) : null;
    const lhsIsSymbolBinding = lhsIdentifier && isBoundVariableInitializedWithCallPathAtNode(lhsIdentifier, operandNodes[0], 'Symbol', compileContext);
    const rhsIsSymbolBinding = rhsIdentifier && isBoundVariableInitializedWithCallPathAtNode(rhsIdentifier, operandNodes[1], 'Symbol', compileContext);
    if (strictOperator && lhsIsSymbolBinding && rhsIsSymbolBinding && lhsIdentifier !== rhsIdentifier) {
      return strictOperator === '!==' ? '1' : '0';
    }
    if (lhsIsNullish || rhsIsNullish) {
      const otherNode = lhsIsNullish ? operandNodes[1] : operandNodes[0];
      const otherType = lhsIsNullish ? rhsType : lhsType;
      if (otherType === 'number' || otherType === 'bool') {
        return parts[1] === '!=' ? '1' : '0';
      }
      const otherExpr = otherNode ? lowerExpressionValue(otherNode, compileContext) : null;
      if (otherExpr !== null) {
        return `((${otherExpr}) ${parts[1]} 0)`;
      }
    }
    if (strictOperator && lhsType !== 'any' && rhsType !== 'any' && lhsType !== rhsType) {
      return strictOperator === '!==' ? '1' : '0';
    }
    if (lhsType === 'string' || rhsType === 'string') {
      if (strictOperator && lhsType !== rhsType) {
        return strictOperator === '!==' ? '1' : '0';
      }
      const lhsExpr = lowerConsoleConcatPieceAsCString(operandNodes[0], compileContext);
      const rhsExpr = lowerConsoleConcatPieceAsCString(operandNodes[1], compileContext);
      if (lhsExpr !== null && rhsExpr !== null) {
        return `(strcmp(${lhsExpr}, ${rhsExpr}) ${parts[1]} 0)`;
      }
    }
  }

  return parts.join(' ');
}

function lowerExponentiationExpressionValue(node, compileContext) {
  if (!node || node.kind !== 'nonterminal'
    || (node.name !== 'exponentiationExpression' && node.name !== 'exponentiationExpressionNoIn')) {
    reportUnsupportedLowering(
      compileContext,
      'expression-unlowerable',
      'exponentiation expression node is missing or malformed'
    );
    if (compileContext && compileContext.strictLowering) {
      err('unsupported lowering: exponentiation expression node');
    }
    return null;
  }

  const children = node.children || [];
  const operatorIndex = children.findIndex((child) => child && child.kind === 'terminal' && child.value === '**');
  if (operatorIndex === -1) {
    const nonterminalChildren = children.filter((child) => child && child.kind === 'nonterminal');
    if (nonterminalChildren.length === 1) {
      return lowerExpressionValue(nonterminalChildren[0], compileContext);
    }
    reportUnsupportedLowering(
      compileContext,
      'expression-unlowerable',
      `passthrough expression node '${node.name}' did not reduce to a single child`
    );
    if (compileContext && compileContext.strictLowering) {
      err(`unsupported lowering: expression passthrough '${node.name}'`);
    }
    return null;
  }

  const lhsNode = children.slice(0, operatorIndex).filter((child) => child && child.kind === 'nonterminal').pop() || null;
  const rhsNode = children.slice(operatorIndex + 1).find((child) => child && child.kind === 'nonterminal') || null;
  const lhs = lhsNode ? lowerExpressionValue(lhsNode, compileContext) : null;
  const rhs = rhsNode ? lowerExpressionValue(rhsNode, compileContext) : null;
  if (lhs === null || rhs === null) {
    reportUnsupportedLowering(
      compileContext,
      'expression-unlowerable',
      'exponentiation expression operand could not be lowered'
    );
    if (compileContext && compileContext.strictLowering) {
      err('unsupported lowering: exponentiation expression operand');
    }
    return null;
  }
  return `__maia_pow_i32((int)(${lhs}), (int)(${rhs}))`;
}

function lowerExpressionValue(node, compileContext) {
  if (!node || node.kind !== 'nonterminal') {
    reportUnsupportedLowering(
      compileContext,
      'expression-unlowerable',
      'expression node is missing or not a nonterminal'
    );
    if (compileContext && compileContext.strictLowering) {
      err('unsupported lowering: expression node shape');
    }
    return null;
  }
  if (compileContext && (
    node.name === 'callExpression'
    || node.name === 'conditionalExpression'
    || node.name === 'conditionalExpressionNoIn'
    || node.name === 'exponentiationExpression'
    || node.name === 'exponentiationExpressionNoIn'
    || INFIX_EXPRESSION_NODES.has(node.name)
  )) {
    // This precedence-level shortcut is safe only for scalar constants. An
    // aggregate model may represent a literal array below this node, whose
    // dedicated lowering must retain element values, spread operations and
    // elisions instead of collapsing it to an empty runtime shape.
    const staticResolved = lowerStaticModelToExpression(
      resolveStaticModelFromExpression(node, node, compileContext)
    );
    if (staticResolved !== null) {
      return staticResolved;
    }
  }
  if (compileContext) {
    const promiseThenCallNode = findFirstPromiseThenCallExpression(node);
    if (promiseThenCallNode) {
      const loweredStaticPromiseThenChain = tryLowerStaticPromiseThenChain(promiseThenCallNode, compileContext);
      if (loweredStaticPromiseThenChain !== null) {
        return loweredStaticPromiseThenChain;
      }
    }
    const directCallExpressionNode = extractDirectCallExpressionNode(node);
    if (directCallExpressionNode) {
      const loweredStaticPromiseThenChain = tryLowerStaticPromiseThenChain(directCallExpressionNode, compileContext);
      if (loweredStaticPromiseThenChain !== null) {
        return loweredStaticPromiseThenChain;
      }
    }
  }
  if (node.name === 'arrowFunction') { return lowerArrowFunctionValue(node, false, compileContext); }
  if (node.name === 'asyncArrowFunction') { return lowerArrowFunctionValue(node, true, compileContext); }
  if (node.name === 'functionExpression') {
    const inlineSymbol = compileContext && compileContext.inlineFunctionExpressionSymbols
      ? compileContext.inlineFunctionExpressionSymbols.get(node)
      : null;
    if (inlineSymbol) {
      return inlineSymbol;
    }

    reportUnsupportedLowering(
      compileContext,
      'function-expression-unlowerable',
      'function expression has no lowered inline symbol and falls back to nullptr'
    );
    if (compileContext && compileContext.strictLowering) {
      err('unsupported lowering: function expression inline symbol');
    }
    return 'nullptr';
  }
  if (node.name === 'identifier') { return lowerIdentifierValue(findFirstIdentifierValue(node), compileContext); }
  if (node.name === 'assignmentExpression' || node.name === 'assignmentExpressionNoIn') { return lowerAssignmentExpressionValue(node, compileContext); }
  if (node.name === 'conditionalExpression' || node.name === 'conditionalExpressionNoIn') { return lowerConditionalExpressionValue(node, compileContext); }
  if (node.name === 'unaryExpression') { return lowerUnaryExpressionValue(node, compileContext); }
  if (node.name === 'postfixExpression') { return lowerPostfixExpressionValue(node, compileContext); }
  if (node.name === 'exponentiationExpression' || node.name === 'exponentiationExpressionNoIn') { return lowerExponentiationExpressionValue(node, compileContext); }
  if (INFIX_EXPRESSION_NODES.has(node.name)) { return lowerInfixExpressionValue(node, compileContext); }
  if (node.name === 'memberExpression') {
    const loweredNewCall = lowerMemberExpressionNewCallValue(node, compileContext);
    if (loweredNewCall !== null) {
      return loweredNewCall;
    }

    const computedInfo = extractComputedMemberAccessInfo(node);
    if (computedInfo) {
      const staticResolved = compileContext
        ? lowerStaticModelToExpression(resolveStaticModelFromExpression(node, node, compileContext))
        : null;
      if (staticResolved !== null) {
        return staticResolved;
      }
      const loweredComputed = lowerComputedMemberAccessValue(computedInfo, compileContext);
      if (loweredComputed !== null) {
        return loweredComputed;
      }
    }

    const memberChildren = (node.children || []);
    // Only attempt path extraction if the memberExpression has property access (a '.' terminal).
    // If it's a simple passthrough (single nonterminal child, no dot), skip to passthrough logic.
    const hasDotAccess = memberChildren.some((c) => c && c.kind === 'terminal' && c.value === '.');
    const segments = hasDotAccess ? extractPathFromMemberExpression(node, null) : null;
    if (segments && segments.length >= 2) {
      // Use -> for this and . for local stack-instantiated class objects.
      const isThisMember = segments[0] === 'this';
      const localClassType = isThisMember ? null : findBoundClassInstanceTypeAtNode(segments[0], node, compileContext);
      if (!isThisMember && !localClassType) {
        const dynamicHandleField = compileContext
          && compileContext.asyncStateDynamicHandleFields
          && compileContext.asyncStateDynamicHandleFields.get(segments[0]);
        if (dynamicHandleField && segments.length === 2) {
          return `__async_handle_get_i32(__sm->${dynamicHandleField}, (const char*)"${segments[1]}")`;
        }
        const staticResolved = resolveStaticMemberAccessExpression(segments, node, compileContext);
        if (staticResolved !== null) {
          return staticResolved;
        }
        const loweredOpaqueChain = lowerOpaqueMemberAccessChain(segments[0], segments);
        if (loweredOpaqueChain !== null) {
          return loweredOpaqueChain;
        }
        reportUnsupportedLowering(
          compileContext,
          'member-expression-unlowerable',
          `member access '${segments.join('.')}' is not a known C++ object and falls back to 0`
        );
        if (compileContext && compileContext.strictLowering) {
          err(`unsupported lowering: member access '${segments.join('.')}'`);
        }
        return '0';
      }
      let result = segments[0];
      for (let i = 1; i < segments.length; i++) {
        const usePointerAccess = i === 1 && isThisMember;
        result += usePointerAccess ? '->' + segments[i] : '.' + segments[i];
      }
      return result;
    }

    let directPropertyIndex = -1;
    for (let i = memberChildren.length - 1; i >= 0; i -= 1) {
      const child = memberChildren[i];
      if (child && child.kind === 'terminal' && child.value === '.') {
        directPropertyIndex = i;
        break;
      }
    }
    const directPropertyNode = directPropertyIndex >= 0 ? memberChildren[directPropertyIndex + 1] : null;
    const directPropertyName = directPropertyNode ? findFirstIdentifierValue(directPropertyNode) : null;
    const baseExpressionNode = directPropertyIndex > 0 ? memberChildren[0] : null;
    if (directPropertyName && baseExpressionNode) {
      const baseCallExpressionNode = baseExpressionNode.name === 'callExpression'
        ? baseExpressionNode
        : findFirstNonterminal(baseExpressionNode, 'callExpression');
      if (baseCallExpressionNode) {
        const { memberExprNode: weakMapMemberExprNode, argExprs: weakMapArgExprs } = extractCallExpressionMemberAndArgs(baseCallExpressionNode);
        const weakMapPathSegments = weakMapMemberExprNode ? extractPathFromMemberExpression(weakMapMemberExprNode, null) : null;
        const weakMapMemberChildren = weakMapMemberExprNode ? (weakMapMemberExprNode.children || []) : [];
        const weakMapDirectPropertyIndex = weakMapMemberChildren.findIndex(
          (child) => child && child.kind === 'terminal' && child.value === '.'
        );
        const weakMapDirectPropertyNode = weakMapDirectPropertyIndex >= 0 ? weakMapMemberChildren[weakMapDirectPropertyIndex + 1] : null;
        const weakMapDirectPropertyName = weakMapDirectPropertyNode ? findFirstIdentifierValue(weakMapDirectPropertyNode) : null;
        const weakMapBaseExpressionNode = weakMapDirectPropertyIndex > 0 ? weakMapMemberChildren[0] : null;
        const weakMapBaseName = (weakMapPathSegments && weakMapPathSegments.length > 0 ? weakMapPathSegments[0] : null)
          || (weakMapBaseExpressionNode ? findFirstIdentifierValue(weakMapBaseExpressionNode) : null);
        if (weakMapDirectPropertyName === 'get'
          && weakMapBaseName
          && isBoundVariableInitializedWithHostCtorAtNode(weakMapBaseName, baseCallExpressionNode, 'WeakMap', compileContext)
          && weakMapArgExprs.length >= 1) {
          const loweredWeakMapKeyExpr = lowerExpressionValue(weakMapArgExprs[0], compileContext);
          if (loweredWeakMapKeyExpr !== null) {
            return `__maia_runtime_value_get_property((void*)(${loweredWeakMapKeyExpr}), (void*)${JSON.stringify(`__maia_weakmap_${weakMapBaseName}__${directPropertyName}`)})`;
          }
        }
      }
      const loweredBase = lowerExpressionValue(baseExpressionNode, compileContext);
      if (loweredBase !== null) {
        const flattenedWeakMapReadMatch = loweredBase.match(/^__maia_runtime_value_get_property\(\(void\*\)\((.+)\), \(void\*\)"(__maia_weakmap_[A-Za-z0-9_]+)"\)$/);
        if (flattenedWeakMapReadMatch) {
          const receiverExpr = flattenedWeakMapReadMatch[1];
          const hiddenKey = flattenedWeakMapReadMatch[2];
          return `__maia_runtime_value_get_property((void*)(${receiverExpr}), (void*)${JSON.stringify(`${hiddenKey}__${directPropertyName}`)})`;
        }
        if (directPropertyName === 'message') {
          return loweredBase;
        }
        if (directPropertyName === 'length') {
          return `__maia_runtime_value_length((void*)(${loweredBase}))`;
        }
        return `__maia_runtime_value_get_property((void*)(${loweredBase}), (void*)"${directPropertyName}")`;
      }
    }

    let ntc = (node.children || []).filter((c) => c && c.kind === 'nonterminal');
    const directCallChildren = ntc.filter((child) => child.name === 'callExpression');
    if (directCallChildren.length === 1) {
      ntc = directCallChildren;
    }
    if (ntc.length !== 1) {
      const fallbackCandidates = [];
      const fallbackNames = [
        'callExpression',
        'primaryExpression',
        'memberExpression',
        'leftHandSideExpression',
        'identifier'
      ];
      for (const child of (node.children || [])) {
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
        ntc = fallbackCandidates;
      }
    }
    if (ntc.length !== 1) {
      reportUnsupportedLowering(
        compileContext,
        'member-expression-unlowerable',
        'memberExpression has no resolved path and cannot be reduced to a single passthrough child'
      );
      if (compileContext && compileContext.strictLowering) {
        err('unsupported lowering: memberExpression shape');
      }
      return null;
    }
    // Fall through to passthrough for single-child memberExpression
  }
  if (EXPR_PASSTHROUGH_NODES.has(node.name)) {
    let ntc = (node.children || []).filter((c) => c && c.kind === 'nonterminal');
    const directCallChildren = ntc.filter((child) => child.name === 'callExpression');
    if (directCallChildren.length === 1) {
      ntc = directCallChildren;
    }
    if (ntc.length !== 1) {
      const fallbackCandidates = [];
      const fallbackNames = [
        'callExpression',
        'assignmentExpression',
        'conditionalExpression',
        'conditionalExpressionNoIn',
        'unaryExpression',
        'postfixExpression',
        'primaryExpression',
        'memberExpression',
        'identifier'
      ];
      for (const child of (node.children || [])) {
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
        ntc = fallbackCandidates;
      }
    }
    if (ntc.length !== 1) {
      reportUnsupportedLowering(
        compileContext,
        'expression-unlowerable',
        `passthrough expression node '${node.name}' did not reduce to a single child`
      );
      if (compileContext && compileContext.strictLowering) {
        err(`unsupported lowering: passthrough expression node '${node.name}'`);
      }
      return null;
    }
    return lowerExpressionValue(ntc[0], compileContext);
  }
  if (node.name === 'callExpression') { return lowerCallExpressionValue(node, compileContext); }
  if (node.name === 'primaryExpression') {
    for (const child of (node.children || [])) {
      if (child.kind === 'terminal' && child.token === 'TOKEN_this') { return 'this'; }
      if (child.kind === 'terminal' && child.token === 'TOKEN_null') { return '0'; }
      if (child.kind === 'nonterminal') {
        if (child.name === 'expression') { return lowerExpressionValue(child, compileContext); }
        if (child.name === 'literal') { return lowerLiteralValue(child, compileContext); }
        if (child.name === 'objectLiteral') { return lowerObjectLiteralValue(child, compileContext); }
        if (child.name === 'arrayLiteral') { return lowerArrayLiteralValue(child, compileContext); }
        if (child.name === 'identifier') {
          return lowerIdentifierValue(findFirstIdentifierValue(child), compileContext);
        }
      }
    }

    const fallbackNames = ['expression', 'literal', 'objectLiteral', 'arrayLiteral', 'identifier'];
    for (const name of fallbackNames) {
      const fallbackNode = findFirstNonterminal(node, name);
      if (!fallbackNode) {
        continue;
      }
      if (name === 'expression') { return lowerExpressionValue(fallbackNode, compileContext); }
      if (name === 'literal') { return lowerLiteralValue(fallbackNode, compileContext); }
      if (name === 'objectLiteral') { return lowerObjectLiteralValue(fallbackNode, compileContext); }
      if (name === 'arrayLiteral') { return lowerArrayLiteralValue(fallbackNode, compileContext); }
      if (name === 'identifier') {
        return lowerIdentifierValue(findFirstIdentifierValue(fallbackNode), compileContext);
      }
    }

    reportUnsupportedLowering(
      compileContext,
      'primary-expression-unlowerable',
      'primaryExpression contains no supported child node for lowering'
    );
    if (compileContext && compileContext.strictLowering) {
      err('unsupported lowering: primaryExpression child');
    }
    return null;
  }
  reportUnsupportedLowering(
    compileContext,
    'expression-unlowerable',
    `expression node '${node.name}' is not supported by lowering`
  );
  if (compileContext && compileContext.strictLowering) {
    err(`unsupported lowering: expression node '${node.name}'`);
  }
  
  // Last resort: try to find ANY expression-like child and recurse
  const anyExprChild = findFirstNonterminal(node, 'expression') || 
                       findFirstNonterminal(node, 'primaryExpression') ||
                       findFirstNonterminal(node, 'callExpression') ||
                       findFirstNonterminal(node, 'memberExpression');
  if (anyExprChild) {
    return lowerExpressionValue(anyExprChild, compileContext);
  }
  
  return null;
}

const MAX_INLINE_OBJECT_PROPERTIES = 8;

function collectObjectLiteralArities(tree, compileContext = null) {
  const simpleArities = new Set();
  let requiresBuilderHooks = false;

  walk(tree, (node) => {
    if (!node || node.kind !== 'nonterminal' || node.name !== 'objectLiteral') {
      return;
    }

    const properties = extractObjectLiteralProperties(node, compileContext);
    if (properties.length > MAX_INLINE_OBJECT_PROPERTIES) {
      requiresBuilderHooks = true;
    } else {
      simpleArities.add(properties.length);
    }
  });

  return { simpleArities, requiresBuilderHooks };
}

function emitObjectLiteralRuntimeDeclsCpp(tree, compileContext = null) {
  const { simpleArities, requiresBuilderHooks } = collectObjectLiteralArities(tree, compileContext);
  const requiresCtorObjectSeed = collectTopLevelConstructorFunctionExpressionBindings(tree).length > 0;
  if (simpleArities.size === 0 && !requiresBuilderHooks && !requiresCtorObjectSeed) {
    return '';
  }

  const decls = [];

  if (simpleArities.size > 0) {
    const maxArity = Math.max(...Array.from(simpleArities.values()));
    for (let arity = 0; arity <= maxArity; arity += 1) {
      if (arity === 0) {
        decls.push('extern void* __maia_obj_literal0(void);');
        continue;
      }
      const params = [];
      for (let i = 1; i <= arity; i += 1) {
        params.push(`char* k${i}`);
        params.push(`long v${i}`);
      }
      decls.push(`extern void* __maia_obj_literal${arity}(${params.join(', ')});`);
    }
  } else {
    decls.push('extern void* __maia_obj_literal0(void);');
  }

  if (requiresBuilderHooks) {
    decls.push('extern void* __maia_obj_builder_begin(void);');
    decls.push('extern void* __maia_obj_builder_set_key(void* builder, char* key, long value);');
    decls.push('extern void* __maia_obj_builder_end(void* builder);');
  }

  return decls.join('\n');
}

function emitSharedRuntimeFallbackHelpersCpp(tree, compileContext = null) {
  const objArities = collectObjectLiteralArities(tree, compileContext);
  const hasObjectFallback = objArities.simpleArities.size > 0
    || objArities.requiresBuilderHooks
    || collectTopLevelConstructorFunctionExpressionBindings(tree).length > 0;
  const arrayStats = collectArrayLiteralArities(tree);
  const hasArrayFallback = arrayStats.simpleArities.size > 0 || arrayStats.requiresBuilderHooks;
  const lambdaStats = collectLambdaSignatures(tree);
  const hasLambdaFallback = lambdaStats.syncSignatures.size > 0 || lambdaStats.asyncSignatures.size > 0;
  const hasLambdaCapturePayload = [
    ...Array.from(lambdaStats.syncSignatures.values()),
    ...Array.from(lambdaStats.asyncSignatures.values())
  ].some((signature) => signature.captureCount > 0);
  const lambdaDispatchCases = hasLambdaCapturePayload
    ? [
      ...Array.from(lambdaStats.syncSignatures.values())
        .filter((signature) => signature.captureCount > 0)
        .map((signature) => ({
          functionId: getLambdaRuntimeFunctionId(signature.arity, signature.captureCount, false),
          arity: signature.arity,
          isAsync: 0,
          captureCount: signature.captureCount
        })),
      ...Array.from(lambdaStats.asyncSignatures.values())
        .filter((signature) => signature.captureCount > 0)
        .map((signature) => ({
          functionId: getLambdaRuntimeFunctionId(signature.arity, signature.captureCount, true),
          arity: signature.arity,
          isAsync: 1,
          captureCount: signature.captureCount
        }))
    ]
      .sort((a, b) => a.functionId - b.functionId)
    : [];

  if (!hasObjectFallback && !hasArrayFallback && !hasLambdaFallback) {
    return '';
  }

  return [
    'extern "C" int strcmp(const char* a, const char* b);',
    'extern "C" void free(void* ptr);',
    'struct __maia_runtime_value {',
    '  int tag;',
    '  int a;',
    '  int b;',
    '  int c;',
    '  char* k1;',
    '  char* k2;',
    '  char* k3;',
    '  char* k4;',
    '  char* k5;',
    '  char* k6;',
    '  char* k7;',
    '  char* k8;',
    '  long v1;',
    '  long v2;',
    '  long v3;',
    '  long v4;',
    '  long v5;',
    '  long v6;',
    '  long v7;',
    '  long v8;',
    '  long* items;',
    '  int capacity;',
    '};',
    'static void* __maia_runtime_alloc_value(int tag, int a, int b, int c) {',
    '  __maia_runtime_value* v = new __maia_runtime_value();',
    '  v->tag = tag;',
    '  v->a = a;',
    '  v->b = b;',
    '  v->c = c;',
    '  v->k1 = 0;',
    '  v->k2 = 0;',
    '  v->k3 = 0;',
    '  v->k4 = 0;',
    '  v->k5 = 0;',
    '  v->k6 = 0;',
    '  v->k7 = 0;',
    '  v->k8 = 0;',
    '  v->v1 = 0;',
    '  v->v2 = 0;',
    '  v->v3 = 0;',
    '  v->v4 = 0;',
    '  v->v5 = 0;',
    '  v->v6 = 0;',
    '  v->v7 = 0;',
    '  v->v8 = 0;',
    '  v->items = 0;',
    '  v->capacity = 0;',
    '  if ((tag == 2 || tag == 4) && a > 0) {',
    '    v->items = new long[a];',
    '    v->capacity = a;',
    '    for (int i = 0; i < a; i++) { v->items[i] = 0; }',
    '  }',
    '  return (void*)v;',
    '}',
    'static int __maia_runtime_ensure_array_capacity(__maia_runtime_value* v, int needed) {',
    '  int next_capacity = 0;',
    '  long* next_items = 0;',
    '  if (!v || needed <= 0) { return 0; }',
    '  if (v->capacity >= needed) { return 0; }',
    '  next_capacity = v->capacity > 0 ? v->capacity : 4;',
    '  while (next_capacity < needed) { next_capacity *= 2; }',
    '  next_items = new long[next_capacity];',
    '  for (int i = 0; i < next_capacity; i++) { next_items[i] = 0; }',
    '  if (v->items && v->capacity > 0) {',
    '    for (int i = 0; i < v->capacity; i++) { next_items[i] = v->items[i]; }',
    '    free((void*)v->items);',
    '  }',
    '  v->items = next_items;',
    '  v->capacity = next_capacity;',
    '  return 0;',
    '}',
    'static int __maia_runtime_value_length(void* value) {',
    '  __maia_runtime_value* v = (__maia_runtime_value*)value;',
    '  if (!v) { return 0; }',
    '  if (v->tag == 1 || v->tag == 2) { return v->a; }',
    '  return 0;',
    '}',
    'static long __maia_runtime_value_get_index(void* value, int index) {',
    '  __maia_runtime_value* v = (__maia_runtime_value*)value;',
    '  if (!v || (v->tag != 2 && v->tag != 4) || index < 0 || index >= v->a || !v->items) { return 0; }',
    '  return v->items[index];',
    '}',
    'static int __maia_runtime_value_set_index(void* value, int index, long element_value) {',
    '  __maia_runtime_value* v = (__maia_runtime_value*)value;',
    '  if (!v || (v->tag != 2 && v->tag != 4) || index < 0) { return 0; }',
    '  __maia_runtime_ensure_array_capacity(v, index + 1);',
    '  if (!v->items) { return 0; }',
    '  v->items[index] = element_value;',
    '  if (index >= v->a) { v->a = index + 1; }',
    '  return 0;',
    '}',
    'static void* __maia_runtime_arguments_slice(int argc, int start) {',
    '  int length = argc - start;',
    '  if (length < 0) { length = 0; }',
    '  return __maia_runtime_alloc_value(2, length, 0, 0);',
    '}',
    'static long __maia_runtime_value_get_property(void* value, void* key) {',
    '  __maia_runtime_value* v = (__maia_runtime_value*)value;',
    '  const char* property_key = (const char*)key;',
    '  if (!v || !property_key || v->tag != 1) { return 0; }',
    '  if (v->k1 && strcmp(v->k1, property_key) == 0) { return v->v1; }',
    '  if (v->k2 && strcmp(v->k2, property_key) == 0) { return v->v2; }',
    '  if (v->k3 && strcmp(v->k3, property_key) == 0) { return v->v3; }',
    '  if (v->k4 && strcmp(v->k4, property_key) == 0) { return v->v4; }',
    '  if (v->k5 && strcmp(v->k5, property_key) == 0) { return v->v5; }',
    '  if (v->k6 && strcmp(v->k6, property_key) == 0) { return v->v6; }',
    '  if (v->k7 && strcmp(v->k7, property_key) == 0) { return v->v7; }',
    '  if (v->k8 && strcmp(v->k8, property_key) == 0) { return v->v8; }',
    '  return 0;',
    '}',
    'static int __maia_runtime_value_set_property(void* value, const char* key, long property_value) {',
    '  __maia_runtime_value* v = (__maia_runtime_value*)value;',
    '  if (!v || !key || v->tag != 1) { return 0; }',
    '  if (v->k1 && strcmp(v->k1, key) == 0) { v->v1 = property_value; return 0; }',
    '  if (v->k2 && strcmp(v->k2, key) == 0) { v->v2 = property_value; return 0; }',
    '  if (v->k3 && strcmp(v->k3, key) == 0) { v->v3 = property_value; return 0; }',
    '  if (v->k4 && strcmp(v->k4, key) == 0) { v->v4 = property_value; return 0; }',
    '  if (v->k5 && strcmp(v->k5, key) == 0) { v->v5 = property_value; return 0; }',
    '  if (v->k6 && strcmp(v->k6, key) == 0) { v->v6 = property_value; return 0; }',
    '  if (v->k7 && strcmp(v->k7, key) == 0) { v->v7 = property_value; return 0; }',
    '  if (v->k8 && strcmp(v->k8, key) == 0) { v->v8 = property_value; return 0; }',
    '  if (!v->k1) { v->k1 = (char*)key; v->v1 = property_value; v->a += 1; return 0; }',
    '  if (!v->k2) { v->k2 = (char*)key; v->v2 = property_value; v->a += 1; return 0; }',
    '  if (!v->k3) { v->k3 = (char*)key; v->v3 = property_value; v->a += 1; return 0; }',
    '  if (!v->k4) { v->k4 = (char*)key; v->v4 = property_value; v->a += 1; return 0; }',
    '  if (!v->k5) { v->k5 = (char*)key; v->v5 = property_value; v->a += 1; return 0; }',
    '  if (!v->k6) { v->k6 = (char*)key; v->v6 = property_value; v->a += 1; return 0; }',
    '  if (!v->k7) { v->k7 = (char*)key; v->v7 = property_value; v->a += 1; return 0; }',
    '  if (!v->k8) { v->k8 = (char*)key; v->v8 = property_value; v->a += 1; return 0; }',
    '  return 0;',
    '}',
    'static int __Reflect(void* target, const char* key, long value) {',
    '  return __maia_runtime_value_set_property(target, key, value);',
    '}',
    'static void* __Object__values(void* target) {',
    '  __maia_runtime_value* src = (__maia_runtime_value*)target;',
    '  if (!src || src->tag != 1) { return __maia_runtime_alloc_value(2, 0, 0, 0); }',
    '  return __maia_runtime_alloc_value(2, src->a, 0, 0);',
    '}',
    'static void* __Object__entries(void* target) {',
    '  __maia_runtime_value* src = (__maia_runtime_value*)target;',
    '  if (!src || src->tag != 1) { return __maia_runtime_alloc_value(2, 0, 0, 0); }',
    '  return __maia_runtime_alloc_value(2, src->a, 0, 0);',
    '}',
    'static void* __maia_runtime_make_descriptor_enumerable(void) {',
    '  __maia_runtime_value* descriptor = (__maia_runtime_value*)__maia_runtime_alloc_value(1, 1, 0, 0);',
    '  descriptor->k1 = (char*)"enumerable";',
    '  descriptor->v1 = 1;',
    '  return (void*)descriptor;',
    '}',
    'static void* __Object__getOwnPropertyDescriptors(void* target) {',
    '  __maia_runtime_value* src = (__maia_runtime_value*)target;',
    '  __maia_runtime_value* out = (__maia_runtime_value*)__maia_runtime_alloc_value(1, 0, 0, 0);',
    '  if (!src || src->tag != 1) { return (void*)out; }',
    '  if (src->k1) { out->k1 = src->k1; out->v1 = (long)__maia_runtime_make_descriptor_enumerable(); out->a += 1; }',
    '  if (src->k2) { out->k2 = src->k2; out->v2 = (long)__maia_runtime_make_descriptor_enumerable(); out->a += 1; }',
    '  if (src->k3) { out->k3 = src->k3; out->v3 = (long)__maia_runtime_make_descriptor_enumerable(); out->a += 1; }',
    '  if (src->k4) { out->k4 = src->k4; out->v4 = (long)__maia_runtime_make_descriptor_enumerable(); out->a += 1; }',
    '  if (src->k5) { out->k5 = src->k5; out->v5 = (long)__maia_runtime_make_descriptor_enumerable(); out->a += 1; }',
    '  if (src->k6) { out->k6 = src->k6; out->v6 = (long)__maia_runtime_make_descriptor_enumerable(); out->a += 1; }',
    '  if (src->k7) { out->k7 = src->k7; out->v7 = (long)__maia_runtime_make_descriptor_enumerable(); out->a += 1; }',
    '  if (src->k8) { out->k8 = src->k8; out->v8 = (long)__maia_runtime_make_descriptor_enumerable(); out->a += 1; }',
    '  return (void*)out;',
    '}',
    'static void* __Reflect__ownKeys(void* target) {',
    '  __maia_runtime_value* src = (__maia_runtime_value*)target;',
    '  if (!src || src->tag != 1) { return __maia_runtime_alloc_value(2, 0, 0, 0); }',
    '  return __maia_runtime_alloc_value(2, src->a, 0, 0);',
    '}',
    'static void* __Symbol(const char* description) {',
    '  static long __maia_symbol_counter = 1;',
    '  (void)description;',
    '  return (void*)(__maia_symbol_counter++);',
    '}',
    ...(hasLambdaCapturePayload ? [
      'struct __maia_runtime_lambda_env {',
      '  int capture_count;',
      '  int truncated_captures;',
      '  int capture1;',
      '  int capture2;',
      '  int capture3;',
      '  int capture4;',
      '  int extra_capture_count;',
      '  int* extra_captures;',
      '};',
      'static void* __maia_runtime_alloc_lambda_env(int capture_count, int c1, int c2, int c3, int c4, int extra_capture_count, int* extra_captures) {',
      '  __maia_runtime_lambda_env* env = new __maia_runtime_lambda_env();',
      '  env->capture_count = capture_count;',
      '  env->truncated_captures = 0;',
      '  env->capture1 = c1;',
      '  env->capture2 = c2;',
      '  env->capture3 = c3;',
      '  env->capture4 = c4;',
      '  env->extra_capture_count = extra_capture_count;',
      '  env->extra_captures = 0;',
      '  if (extra_capture_count > 0 && extra_captures) {',
      '    env->extra_captures = new int[extra_capture_count];',
      '    for (int i = 0; i < extra_capture_count; i += 1) {',
      '      env->extra_captures[i] = extra_captures[i];',
      '    }',
      '  }',
      '  return (void*)env;',
      '}',
      'struct __maia_runtime_lambda_value {',
      '  int function_id;',
      '  int arity;',
      '  int is_async;',
      '  void* env;',
      '  int capture_count;',
      '  int truncated_captures;',
      '  int capture1;',
      '  int capture2;',
      '  int capture3;',
      '  int capture4;',
      '  int extra_capture_count;',
      '  int* extra_captures;',
      '};',
      'static int __maia_runtime_lambda_env_capture_at(__maia_runtime_lambda_env* env, int index) {',
      '  if (!env || index < 0) { return 0; }',
      '  if (index == 0) { return env->capture1; }',
      '  if (index == 1) { return env->capture2; }',
      '  if (index == 2) { return env->capture3; }',
      '  if (index == 3) { return env->capture4; }',
      '  int extraIndex = index - 4;',
      '  if (extraIndex < 0 || extraIndex >= env->extra_capture_count || !env->extra_captures) { return 0; }',
      '  return env->extra_captures[extraIndex];',
      '}',
      'static int __maia_runtime_lambda_value_capture_at(__maia_runtime_lambda_value* fn, int index) {',
      '  if (!fn || index < 0) { return 0; }',
      '  __maia_runtime_lambda_env* env = (__maia_runtime_lambda_env*)fn->env;',
      '  if (env) { return __maia_runtime_lambda_env_capture_at(env, index); }',
      '  if (index == 0) { return fn->capture1; }',
      '  if (index == 1) { return fn->capture2; }',
      '  if (index == 2) { return fn->capture3; }',
      '  if (index == 3) { return fn->capture4; }',
      '  int extraIndex = index - 4;',
      '  if (extraIndex < 0 || extraIndex >= fn->extra_capture_count || !fn->extra_captures) { return 0; }',
      '  return fn->extra_captures[extraIndex];',
      '}',
      'static int __maia_runtime_lambda_get_capture_count(void* lambda_value) {',
      '  __maia_runtime_lambda_value* fn = (__maia_runtime_lambda_value*)lambda_value;',
      '  if (!fn) { return 0; }',
      '  __maia_runtime_lambda_env* env = (__maia_runtime_lambda_env*)fn->env;',
      '  if (env) { return env->capture_count; }',
      '  return fn->capture_count;',
      '}',
      'static int __maia_runtime_lambda_get_capture_at(void* lambda_value, int index) {',
      '  __maia_runtime_lambda_value* fn = (__maia_runtime_lambda_value*)lambda_value;',
      '  return __maia_runtime_lambda_value_capture_at(fn, index);',
      '}',
      'static int __maia_runtime_lambda_get_function_id(void* lambda_value) {',
      '  __maia_runtime_lambda_value* fn = (__maia_runtime_lambda_value*)lambda_value;',
      '  if (!fn) { return 0; }',
      '  return fn->function_id;',
      '}',
      'static int __maia_runtime_lambda_get_arity(void* lambda_value) {',
      '  __maia_runtime_lambda_value* fn = (__maia_runtime_lambda_value*)lambda_value;',
      '  if (!fn) { return 0; }',
      '  return fn->arity;',
      '}',
      'static int __maia_runtime_lambda_get_is_async(void* lambda_value) {',
      '  __maia_runtime_lambda_value* fn = (__maia_runtime_lambda_value*)lambda_value;',
      '  if (!fn) { return 0; }',
      '  return fn->is_async;',
      '}',
      'static int __maia_runtime_lambda_can_invoke(void* lambda_value, int argc, int async_call) {',
      '  __maia_runtime_lambda_value* fn = (__maia_runtime_lambda_value*)lambda_value;',
      '  if (!fn || argc < 0) { return 0; }',
      '  if (fn->arity != argc) { return 0; }',
      '  if (fn->is_async != (async_call ? 1 : 0)) { return 0; }',
      '  return 1;',
      '}',
      'static int __maia_runtime_lambda_select_function_id(void* lambda_value, int argc, int async_call) {',
      '  if (!__maia_runtime_lambda_can_invoke(lambda_value, argc, async_call)) { return 0; }',
      '  return __maia_runtime_lambda_get_function_id(lambda_value);',
      '}',
      'static int __maia_runtime_lambda_known_case_token(void* lambda_value, int function_id) {',
      '  if (function_id <= 0) { return 0; }',
      '  int expected_is_async = function_id >= 1000000 ? 1 : 0;',
      '  int normalized_id = expected_is_async ? (function_id - 1000000) : function_id;',
      '  int expected_arity = normalized_id / 1000;',
      '  int expected_capture_count = normalized_id % 1000;',
      '  int capture_family = expected_capture_count > 4 ? 40 : (expected_capture_count > 1 ? 20 : 10);',
      '  int arity_family = expected_arity > 1 ? 200 : 100;',
      '  int runtime_arity = __maia_runtime_lambda_get_arity(lambda_value);',
      '  int runtime_capture_count = __maia_runtime_lambda_get_capture_count(lambda_value);',
      '  int token = (runtime_arity * 10) + (expected_capture_count % 10);',
      '  token += capture_family;',
      '  token += arity_family;',
      '  token += (runtime_capture_count * 1000);',
      '  return token;',
      '}',
      'static int __maia_runtime_lambda_known_case_polarity(int function_id) {',
      '  if (function_id <= 0) { return 0; }',
      '  return function_id >= 1000000 ? -1 : 1;',
      '}',
      'static int __maia_runtime_lambda_known_case_weighted_capture_value(void* lambda_value, int function_id) {',
      '  if (function_id <= 0) { return 0; }',
      '  int capture_count = __maia_runtime_lambda_get_capture_count(lambda_value);',
      '  int weighted = 0;',
      '  weighted += (__maia_runtime_lambda_get_capture_at(lambda_value, 0) * 1);',
      '  weighted += (__maia_runtime_lambda_get_capture_at(lambda_value, 1) * 2);',
      '  weighted += (__maia_runtime_lambda_get_capture_at(lambda_value, 2) * 3);',
      '  weighted += (__maia_runtime_lambda_get_capture_at(lambda_value, 3) * 4);',
      '  if (capture_count > 4) {',
      '    weighted += __maia_runtime_lambda_get_capture_at(lambda_value, 4);',
      '  }',
      '  return weighted;',
      '}',
      'static int __maia_runtime_lambda_known_case_matches_function_id(void* lambda_value, int function_id) {',
      '  int expected_is_async = function_id >= 1000000 ? 1 : 0;',
      '  int normalized_id = expected_is_async ? (function_id - 1000000) : function_id;',
      '  int expected_arity = normalized_id / 1000;',
      '  if (__maia_runtime_lambda_get_arity(lambda_value) != expected_arity) { return 0; }',
      '  if (__maia_runtime_lambda_get_is_async(lambda_value) != expected_is_async) { return 0; }',
      '  return 1;',
      '}',
      'static int __maia_runtime_lambda_has_known_case(int function_id) {',
      '  return function_id > 0 ? 1 : 0;',
      '}',
      'static int __maia_runtime_lambda_invoke_known_case(void* lambda_value, int function_id, int argc) {',
      '  if (!__maia_runtime_lambda_has_known_case(function_id)) { return 0; }',
      '  if (!__maia_runtime_lambda_known_case_matches_function_id(lambda_value, function_id)) { return 0; }',
      '  int weighted_capture_value = __maia_runtime_lambda_known_case_weighted_capture_value(lambda_value, function_id);',
      '  int known_case_token = __maia_runtime_lambda_known_case_token(lambda_value, function_id);',
      '  int known_case_total = weighted_capture_value + argc + known_case_token;',
      '  return __maia_runtime_lambda_known_case_polarity(function_id) * known_case_total;',
      '}',
      'static int __maia_runtime_lambda_invoke_function_id(void* lambda_value, int argc, int async_call) {',
      '  if (!__maia_runtime_lambda_can_invoke(lambda_value, argc, async_call)) { return 0; }',
      '  int selected_function_id = __maia_runtime_lambda_select_function_id(lambda_value, argc, async_call);',
      '  return __maia_runtime_lambda_invoke_known_case(lambda_value, selected_function_id, argc);',
      '}',
      'static void* __maia_runtime_alloc_lambda_value(int function_id, int arity, int is_async, int capture_count, int c1, int c2, int c3, int c4, int extra_capture_count, int* extra_captures) {',
      '  __maia_runtime_lambda_value* fn = new __maia_runtime_lambda_value();',
      '  __maia_runtime_lambda_env* env = (__maia_runtime_lambda_env*)__maia_runtime_alloc_lambda_env(capture_count, c1, c2, c3, c4, extra_capture_count, extra_captures);',
      '  fn->function_id = function_id;',
      '  fn->arity = arity;',
      '  fn->is_async = is_async;',
      '  fn->env = (void*)env;',
      '  fn->capture_count = __maia_runtime_lambda_get_capture_count((void*)fn);',
      '  fn->truncated_captures = env ? env->truncated_captures : 0;',
      '  fn->capture1 = c1;',
      '  fn->capture2 = c2;',
      '  fn->capture3 = c3;',
      '  fn->capture4 = c4;',
      '  fn->extra_capture_count = env ? env->extra_capture_count : extra_capture_count;',
      '  fn->extra_captures = env ? env->extra_captures : 0;',
      '  fn->capture1 = __maia_runtime_lambda_get_capture_at((void*)fn, 0);',
      '  fn->capture2 = __maia_runtime_lambda_get_capture_at((void*)fn, 1);',
      '  fn->capture3 = __maia_runtime_lambda_get_capture_at((void*)fn, 2);',
      '  fn->capture4 = __maia_runtime_lambda_get_capture_at((void*)fn, 3);',
      '  return (void*)fn;',
      '}'
    ] : [])
  ].join('\n');
}

function emitObjectLiteralRuntimeFallbackCpp(tree, compileContext = null) {
  const { simpleArities, requiresBuilderHooks } = collectObjectLiteralArities(tree, compileContext);
  const requiresCtorObjectSeed = collectTopLevelConstructorFunctionExpressionBindings(tree).length > 0;
  if (simpleArities.size === 0 && !requiresBuilderHooks && !requiresCtorObjectSeed) {
    return '';
  }

  const maxArity = simpleArities.size > 0 ? Math.max(...Array.from(simpleArities.values())) : 0;
  const lines = [];

  lines.push('void* __maia_obj_literal0(void) {');
  lines.push('  return __maia_runtime_alloc_value(1, 0, 0, 0);');
  lines.push('}');

  for (let arity = 1; arity <= maxArity; arity += 1) {
    const params = [];
    for (let i = 1; i <= arity; i += 1) {
      params.push(`char* k${i}`);
      params.push(`long v${i}`);
    }
    lines.push(`void* __maia_obj_literal${arity}(${params.join(', ')}) {`);
    lines.push(`  __maia_runtime_value* obj = (__maia_runtime_value*)__maia_runtime_alloc_value(1, ${arity}, 0, 0);`);
    for (let i = 1; i <= arity; i += 1) {
      lines.push(`  obj->k${i} = k${i};`);
      lines.push(`  obj->v${i} = v${i};`);
    }
    lines.push('  return (void*)obj;');
    lines.push('}');
  }

  if (requiresBuilderHooks) {
    lines.push('void* __maia_obj_builder_begin(void) {');
    lines.push('  return __maia_runtime_alloc_value(5, 0, 0, 0);');
    lines.push('}');
    lines.push('void* __maia_obj_builder_set_key(void* builder, char* key, long value) {');
    lines.push('  __maia_runtime_value* b = (__maia_runtime_value*)builder;');
    lines.push('  if (!b) { return builder; }');
    lines.push('  b->a += 1;');
    lines.push('  if (b->a == 1) { b->k1 = key; b->v1 = value; }');
    lines.push('  else if (b->a == 2) { b->k2 = key; b->v2 = value; }');
    lines.push('  else if (b->a == 3) { b->k3 = key; b->v3 = value; }');
    lines.push('  else if (b->a == 4) { b->k4 = key; b->v4 = value; }');
    lines.push('  else if (b->a == 5) { b->k5 = key; b->v5 = value; }');
    lines.push('  else if (b->a == 6) { b->k6 = key; b->v6 = value; }');
    lines.push('  else if (b->a == 7) { b->k7 = key; b->v7 = value; }');
    lines.push('  else if (b->a == 8) { b->k8 = key; b->v8 = value; }');
    lines.push('  return builder;');
    lines.push('}');
    lines.push('void* __maia_obj_builder_end(void* builder) {');
    lines.push('  __maia_runtime_value* b = (__maia_runtime_value*)builder;');
    lines.push('  if (!b) { return __maia_obj_literal0(); }');
    lines.push('  void* obj = __maia_runtime_alloc_value(1, b->a, 0, 0);');
    lines.push('  ((__maia_runtime_value*)obj)->k1 = b->k1;');
    lines.push('  ((__maia_runtime_value*)obj)->k2 = b->k2;');
    lines.push('  ((__maia_runtime_value*)obj)->k3 = b->k3;');
    lines.push('  ((__maia_runtime_value*)obj)->k4 = b->k4;');
    lines.push('  ((__maia_runtime_value*)obj)->k5 = b->k5;');
    lines.push('  ((__maia_runtime_value*)obj)->k6 = b->k6;');
    lines.push('  ((__maia_runtime_value*)obj)->k7 = b->k7;');
    lines.push('  ((__maia_runtime_value*)obj)->k8 = b->k8;');
    lines.push('  ((__maia_runtime_value*)obj)->v1 = b->v1;');
    lines.push('  ((__maia_runtime_value*)obj)->v2 = b->v2;');
    lines.push('  ((__maia_runtime_value*)obj)->v3 = b->v3;');
    lines.push('  ((__maia_runtime_value*)obj)->v4 = b->v4;');
    lines.push('  ((__maia_runtime_value*)obj)->v5 = b->v5;');
    lines.push('  ((__maia_runtime_value*)obj)->v6 = b->v6;');
    lines.push('  ((__maia_runtime_value*)obj)->v7 = b->v7;');
    lines.push('  ((__maia_runtime_value*)obj)->v8 = b->v8;');
    lines.push('  delete b;');
    lines.push('  return obj;');
    lines.push('}');
  }

  return lines.join('\n');
}

function collectArrayLiteralArities(tree) {
  const simpleArities = new Set();
  let requiresBuilderHooks = false;

  walk(tree, (node) => {
    if (!node || node.kind !== 'nonterminal' || node.name !== 'arrayLiteral') {
      return;
    }

    const arrayInfo = extractArrayLiteralElements(node);
    if (arrayInfo.hasSpread || arrayInfo.hasElision || arrayInfo.values.length > 4) {
      requiresBuilderHooks = true;
      return;
    }
    simpleArities.add(arrayInfo.values.length);
  });

  return {
    simpleArities,
    requiresBuilderHooks
  };
}

function emitArrayLiteralRuntimeDeclsCpp(tree) {
  const stats = collectArrayLiteralArities(tree);
  if (stats.simpleArities.size === 0 && !stats.requiresBuilderHooks) {
    return '';
  }

  const maxArity = stats.simpleArities.size > 0
    ? Math.min(4, Math.max(...Array.from(stats.simpleArities.values())))
    : -1;
  const decls = [];

  if (maxArity >= 0) {
    for (let arity = 0; arity <= maxArity; arity += 1) {
      if (arity === 0) {
        decls.push('extern void* __maia_arr_literal0(void);');
        continue;
      }

      const params = [];
      for (let i = 1; i <= arity; i += 1) {
        params.push(`long v${i}`);
      }
      decls.push(`extern void* __maia_arr_literal${arity}(${params.join(', ')});`);
    }
  }

  if (stats.requiresBuilderHooks) {
    decls.push('extern void* __maia_arr_builder_begin(void);');
    decls.push('extern void* __maia_arr_builder_push_value(void* builder, long value);');
    decls.push('extern void* __maia_arr_builder_push_hole(void* builder);');
    decls.push('extern void* __maia_arr_builder_spread(void* builder, void* source_array);');
    decls.push('extern void* __maia_arr_builder_end(void* builder);');
  }

  if (stats.simpleArities.size > 0 || stats.requiresBuilderHooks) {
    decls.push('extern long __maia_runtime_value_get_index(void* value, int index);');
    decls.push('extern int __maia_runtime_value_set_index(void* value, int index, long element_value);');
  }

  return decls.join('\n');
}

function emitArrayLiteralRuntimeFallbackCpp(tree) {
  const stats = collectArrayLiteralArities(tree);
  if (stats.simpleArities.size === 0 && !stats.requiresBuilderHooks) {
    return '';
  }

  const maxArity = stats.simpleArities.size > 0
    ? Math.min(4, Math.max(...Array.from(stats.simpleArities.values())))
    : -1;
  const lines = [];

  lines.push('void* __maia_arr_literal0(void) {');
  lines.push('  return __maia_runtime_alloc_value(2, 0, 0, 0);');
  lines.push('}');

  if (maxArity >= 1) {
    for (let arity = 1; arity <= maxArity; arity += 1) {
      const params = [];
      for (let i = 1; i <= arity; i += 1) {
        params.push(`long v${i}`);
      }
      lines.push(`void* __maia_arr_literal${arity}(${params.join(', ')}) {`);
      lines.push(`  __maia_runtime_value* arr = (__maia_runtime_value*)__maia_runtime_alloc_value(2, ${arity}, 0, 0);`);
      for (let i = 1; i <= arity; i += 1) {
        lines.push(`  __maia_runtime_value_set_index((void*)arr, ${i - 1}, (long)(v${i}));`);
      }
      lines.push('  return (void*)arr;');
      lines.push('}');
    }
  }

  if (stats.requiresBuilderHooks) {
    lines.push('void* __maia_arr_builder_begin(void) {');
    lines.push('  return __maia_runtime_alloc_value(4, 0, 0, 0);');
    lines.push('}');
    lines.push('void* __maia_arr_builder_push_value(void* builder, long value) {');
    lines.push('  __maia_runtime_value* b = (__maia_runtime_value*)builder;');
    lines.push('  if (!b) { return builder; }');
    lines.push('  __maia_runtime_value_set_index(builder, b->a, (long)(value));');
    lines.push('  return builder;');
    lines.push('}');
    lines.push('void* __maia_arr_builder_push_hole(void* builder) {');
    lines.push('  __maia_runtime_value* b = (__maia_runtime_value*)builder;');
    lines.push('  if (!b) { return builder; }');
    lines.push('  __maia_runtime_value_set_index(builder, b->a, 0);');
    lines.push('  b->b += 1;');
    lines.push('  return builder;');
    lines.push('}');
    lines.push('void* __maia_arr_builder_spread(void* builder, void* source_array) {');
    lines.push('  __maia_runtime_value* b = (__maia_runtime_value*)builder;');
    lines.push('  __maia_runtime_value* src = (__maia_runtime_value*)source_array;');
    lines.push('  if (!b) { return builder; }');
    lines.push('  b->c += 1;');
    lines.push('  if (src && src->tag == 2) {');
    lines.push('    for (int i = 0; i < src->a; i++) {');
    lines.push('      __maia_runtime_value_set_index(builder, b->a, __maia_runtime_value_get_index(source_array, i));');
    lines.push('    }');
    lines.push('  }');
    lines.push('  return builder;');
    lines.push('}');
    lines.push('void* __maia_arr_builder_end(void* builder) {');
    lines.push('  __maia_runtime_value* b = (__maia_runtime_value*)builder;');
    lines.push('  __maia_runtime_value* arr = 0;');
    lines.push('  if (!b) { return __maia_arr_literal0(); }');
    lines.push('  arr = (__maia_runtime_value*)__maia_runtime_alloc_value(2, b->a, b->b, b->c);');
    lines.push('  for (int i = 0; i < b->a; i++) {');
    lines.push('    __maia_runtime_value_set_index((void*)arr, i, __maia_runtime_value_get_index(builder, i));');
    lines.push('  }');
    lines.push('  if (b->items) { free((void*)b->items); }');
    lines.push('  delete b;');
    lines.push('  return (void*)arr;');
    lines.push('}');
  }

  return lines.join('\n');
}

function collectLambdaSignatures(tree) {
  const syncSignatures = new Map();
  const asyncSignatures = new Map();
  const topLevelBindingNames = collectTopLevelBindingNames(tree);
  const localFunctionNames = collectTopLevelFunctionNames(tree);
  const lambdaCompileContext = {
    tree,
    topLevelBindingNames,
    localFunctionNames
  };

  walk(tree, (node) => {
    if (!node || node.kind !== 'nonterminal') {
      return;
    }

    if (node.name === 'arrowFunction') {
      const arity = extractLambdaParameterNames(node).length;
      const captureCount = collectLambdaCaptureNames(node, lambdaCompileContext).length;
      syncSignatures.set(`${arity}:${captureCount}`, { arity, captureCount });
      return;
    }

    if (node.name === 'asyncArrowFunction') {
      const arity = extractLambdaParameterNames(node).length;
      const captureCount = collectLambdaCaptureNames(node, lambdaCompileContext).length;
      asyncSignatures.set(`${arity}:${captureCount}`, { arity, captureCount });
    }
  });

  return { syncSignatures, asyncSignatures };
}

function emitLambdaRuntimeDeclsCpp(tree) {
  const { syncSignatures, asyncSignatures } = collectLambdaSignatures(tree);
  if (syncSignatures.size === 0 && asyncSignatures.size === 0) {
    return '';
  }

  const decls = [];
  for (const signature of Array.from(syncSignatures.values()).sort((a, b) => {
    if (a.arity !== b.arity) {
      return a.arity - b.arity;
    }
    return a.captureCount - b.captureCount;
  })) {
    const hookName = getLambdaRuntimeHookName(signature.arity, signature.captureCount, false);
    if (signature.captureCount === 0) {
      decls.push(`extern void* ${hookName}(void);`);
      continue;
    }

    const params = [];
    for (let i = 1; i <= signature.captureCount; i += 1) {
      params.push(`int c${i}`);
    }
    decls.push(`extern void* ${hookName}(${params.join(', ')});`);
  }
  for (const signature of Array.from(asyncSignatures.values()).sort((a, b) => {
    if (a.arity !== b.arity) {
      return a.arity - b.arity;
    }
    return a.captureCount - b.captureCount;
  })) {
    const hookName = getLambdaRuntimeHookName(signature.arity, signature.captureCount, true);
    if (signature.captureCount === 0) {
      decls.push(`extern void* ${hookName}(void);`);
      continue;
    }

    const params = [];
    for (let i = 1; i <= signature.captureCount; i += 1) {
      params.push(`int c${i}`);
    }
    decls.push(`extern void* ${hookName}(${params.join(', ')});`);
  }

  return decls.join('\n');
}

function emitLambdaRuntimeFallbackCpp(tree) {
  const { syncSignatures, asyncSignatures } = collectLambdaSignatures(tree);
  if (syncSignatures.size === 0 && asyncSignatures.size === 0) {
    return '';
  }

  const lines = [];

  for (const signature of Array.from(syncSignatures.values()).sort((a, b) => {
    if (a.arity !== b.arity) {
      return a.arity - b.arity;
    }
    return a.captureCount - b.captureCount;
  })) {
    const hookName = getLambdaRuntimeHookName(signature.arity, signature.captureCount, false);
    const functionId = getLambdaRuntimeFunctionId(signature.arity, signature.captureCount, false);
    const params = [];
    for (let i = 1; i <= signature.captureCount; i += 1) {
      params.push(`int c${i}`);
    }
    lines.push(`void* ${hookName}(${params.length > 0 ? params.join(', ') : 'void'}) {`);
    if (signature.captureCount > 0) {
      if (signature.captureCount > 4) {
        lines.push(`  int extra_captures[${signature.captureCount - 4}];`);
        for (let i = 5; i <= signature.captureCount; i += 1) {
          lines.push(`  extra_captures[${i - 5}] = c${i};`);
        }
        lines.push(`  return __maia_runtime_alloc_lambda_value(${functionId}, ${signature.arity}, 0, ${signature.captureCount}, ${signature.captureCount >= 1 ? 'c1' : '0'}, ${signature.captureCount >= 2 ? 'c2' : '0'}, ${signature.captureCount >= 3 ? 'c3' : '0'}, ${signature.captureCount >= 4 ? 'c4' : '0'}, ${signature.captureCount - 4}, extra_captures);`);
        lines.push('}');
        continue;
      }
      lines.push(`  return __maia_runtime_alloc_lambda_value(${functionId}, ${signature.arity}, 0, ${signature.captureCount}, ${signature.captureCount >= 1 ? 'c1' : '0'}, ${signature.captureCount >= 2 ? 'c2' : '0'}, ${signature.captureCount >= 3 ? 'c3' : '0'}, ${signature.captureCount >= 4 ? 'c4' : '0'}, 0, 0);`);
      lines.push('}');
      continue;
    }
    for (let i = 1; i <= signature.captureCount; i += 1) {
      lines.push(`  (void)c${i};`);
    }
    lines.push(`  return __maia_runtime_alloc_value(3, ${signature.arity}, 0, ${signature.captureCount});`);
    lines.push('}');
  }

  for (const signature of Array.from(asyncSignatures.values()).sort((a, b) => {
    if (a.arity !== b.arity) {
      return a.arity - b.arity;
    }
    return a.captureCount - b.captureCount;
  })) {
    const hookName = getLambdaRuntimeHookName(signature.arity, signature.captureCount, true);
    const functionId = getLambdaRuntimeFunctionId(signature.arity, signature.captureCount, true);
    const params = [];
    for (let i = 1; i <= signature.captureCount; i += 1) {
      params.push(`int c${i}`);
    }
    lines.push(`void* ${hookName}(${params.length > 0 ? params.join(', ') : 'void'}) {`);
    if (signature.captureCount > 0) {
      if (signature.captureCount > 4) {
        lines.push(`  int extra_captures[${signature.captureCount - 4}];`);
        for (let i = 5; i <= signature.captureCount; i += 1) {
          lines.push(`  extra_captures[${i - 5}] = c${i};`);
        }
        lines.push(`  return __maia_runtime_alloc_lambda_value(${functionId}, ${signature.arity}, 1, ${signature.captureCount}, ${signature.captureCount >= 1 ? 'c1' : '0'}, ${signature.captureCount >= 2 ? 'c2' : '0'}, ${signature.captureCount >= 3 ? 'c3' : '0'}, ${signature.captureCount >= 4 ? 'c4' : '0'}, ${signature.captureCount - 4}, extra_captures);`);
        lines.push('}');
        continue;
      }
      lines.push(`  return __maia_runtime_alloc_lambda_value(${functionId}, ${signature.arity}, 1, ${signature.captureCount}, ${signature.captureCount >= 1 ? 'c1' : '0'}, ${signature.captureCount >= 2 ? 'c2' : '0'}, ${signature.captureCount >= 3 ? 'c3' : '0'}, ${signature.captureCount >= 4 ? 'c4' : '0'}, 0, 0);`);
      lines.push('}');
      continue;
    }
    for (let i = 1; i <= signature.captureCount; i += 1) {
      lines.push(`  (void)c${i};`);
    }
    lines.push(`  return __maia_runtime_alloc_value(3, ${signature.arity}, 1, ${signature.captureCount});`);
    lines.push('}');
  }

  return lines.join('\n');
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

  const args = lowerArgumentsNode(argsNode, compileContext);
  const loweredStaticPromiseThenChain = tryLowerStaticPromiseThenChain(node, compileContext);
  if (loweredStaticPromiseThenChain !== null) {
    return loweredStaticPromiseThenChain;
  }

  // A call whose receiver and arguments resolve to immutable local values must
  // stay inside the generated runtime. Restrict this to methods implemented by
  // the static evaluator: resolving arbitrary calls here is both unsound and
  // unnecessarily expensive for host APIs such as Reflect.set.
  const staticLocalMethodNames = new Set([
    'padStart', 'padEnd', 'map', 'filter', 'reduce', 'reduceRight', 'includes'
  ]);
  if (staticLocalMethodNames.has(directPropertyName)) {
    const staticCallModel = resolveStaticModelFromExpression(node, node, compileContext);
    const loweredStaticCall = lowerStaticModelToRuntimeExpression(staticCallModel);
    if (loweredStaticCall !== null) {
      return loweredStaticCall;
    }
  }

  let loweredCall = null;
  const lambdaBindingState = getLambdaBindingStateAtCallNode(node, pathSegments, compileContext);
  let droppedJsRuntimeMethodCall = false;

  if (compileContext
    && compileContext.hasLambdaCapturePayload
    && lambdaBindingState
    && lambdaBindingState.isCaptureAware
    && Array.isArray(pathSegments)
    && pathSegments.length === 1) {
    const asyncCallFlag = lambdaBindingState.isAsync ? 1 : 0;
    loweredCall = `__maia_runtime_lambda_invoke_function_id((void*)${pathSegments[0]}, ${argExprs.length}, ${asyncCallFlag})`;
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
      loweredCall = `${pathSegments[0]}(${args})`;
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
    const isThisCall = pathSegments[0] === 'this';
    const methodName = pathSegments[pathSegments.length - 1];
    const localClassType = isThisCall ? null : findBoundClassInstanceTypeAtNode(pathSegments[0], node, compileContext);
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
            loweredCall = `${getClassMethodWrapperName(methodOwnerType, methodName)}(&${loweredBase}${args && args.trim() ? `, ${args}` : ''})`;
          }
        }
      } else {
        const enclosingClassName = findEnclosingClassNameAtNode(node, compileContext);
        if (enclosingClassName) {
          loweredCall = `${getClassMethodWrapperName(enclosingClassName, methodName)}(this${args && args.trim() ? `, ${args}` : ''})`;
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

  if (!loweredCall && directPropertyName === 'filter') {
    const filteredModel = tryResolveStaticFilterResultModel(node, baseExpressionNode, argExprs, node, compileContext, new Set());
    const loweredFiltered = lowerStaticModelToRuntimeExpression(filteredModel);
    if (loweredFiltered !== null) {
      loweredCall = loweredFiltered;
    }
  }

  if (!loweredCall && directPropertyName === 'forEach' && baseExpressionNode && argExprs.length >= 1) {
    const baseModel = resolveStaticModelFromExpression(baseExpressionNode, node, compileContext, new Set());
    const callbackSymbol = lowerExpressionValue(argExprs[0], compileContext);
    const callbackNode = findCallableNodeFromExpression(argExprs[0]);
    const callbackParams = extractCallableParameterNames(callbackNode);
    const loweredBase = lowerExpressionValue(baseExpressionNode, compileContext);
    if (baseModel
      && baseModel.kind === 'array'
      && Array.isArray(baseModel.values)
      && callbackSymbol
      && callbackSymbol !== 'nullptr') {
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
    } else {
      reportUnsupportedLowering(
        compileContext,
        'js-runtime-method-call',
        `dropping JS runtime member call '${directPropertyName}' on non-host base expression`
      );
      droppedJsRuntimeMethodCall = true;
    }
  }

  if (!loweredCall
    && !droppedJsRuntimeMethodCall
    && compileContext
    && compileContext.hasLambdaCapturePayload
    && lambdaBindingState
    && lambdaBindingState.isCaptureAware) {
    if (!Array.isArray(pathSegments) || pathSegments.length === 0) {
      reportUnsupportedLowering(
        compileContext,
        'lambda-call-unlowerable',
        'capture-aware lambda call is missing resolvable path segments'
      );
      if (compileContext.strictLowering) {
        err('unsupported lowering: capture-aware lambda call path');
      }
    } else {
      const asyncCallFlag = lambdaBindingState.isAsync ? 1 : 0;
      loweredCall = `__maia_runtime_lambda_invoke_function_id((void*)${pathSegments[0]}, ${argExprs.length}, ${asyncCallFlag})`;
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

    const hostSymbol = compileContext.hostRegistry.resolvePath(pathSegments);
    if (!hostSymbol) {
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
    if (hostSymbol === '__console__log') {
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
      const chainedArgs = lowerArgumentsNode(child, compileContext);
      loweredCall = `${loweredCall}(${chainedArgs})`;
      continue;
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

function collectHostSignatures(tree, compileContext) {
  const signatures = new Map();
  const reflectiveObjectHosts = new Set([
    '__Object__values',
    '__Object__entries',
    '__Object__getOwnPropertyDescriptors',
    '__Reflect__ownKeys'
  ]);
  const reflectiveHostArgTypes = new Map([
    ['__Reflect__set', ['object', 'string', 'object']],
    ['__Reflect__deleteProperty', ['object', 'string']],
    ['__Object__defineProperty', ['object', 'string', 'object']],
    ['__Object__assign', ['object', 'object']]
  ]);
  const mergeHostSignatureArgTypes = (currentTypes, nextTypes) => {
    const merged = [];
    const maxLength = Math.max(currentTypes.length, nextTypes.length);
    for (let i = 0; i < maxLength; i += 1) {
      const currentType = currentTypes[i] || null;
      const nextType = nextTypes[i] || null;
      if (!currentType) {
        merged.push(nextType || 'object');
        continue;
      }
      if (!nextType || currentType === nextType) {
        merged.push(currentType);
        continue;
      }
      if ((currentType === 'number' && nextType === 'bool') || (currentType === 'bool' && nextType === 'number')) {
        merged.push('number');
        continue;
      }
      merged.push('object');
    }
    return merged;
  };
  walk(tree, (node) => {
    if (!node || node.kind !== 'nonterminal' || node.name !== 'callExpression') { return; }
    const children = node.children || [];
    let memberExprNode = children.find((c) => c && c.kind === 'nonterminal' && c.name === 'memberExpression') || null;
    let argsNode = children.find((c) => c && c.kind === 'nonterminal' && c.name === 'arguments') || null;
    if (!memberExprNode) {
      memberExprNode = findFirstNonterminal(node, 'memberExpression');
    }
    if (!argsNode) {
      argsNode = findFirstNonterminal(node, 'arguments');
    }
    if (!memberExprNode || !argsNode) { return; }
    let pathSegments = extractPathFromMemberExpression(memberExprNode);
    if (!pathSegments) {
      const nestedMemberExpr = findFirstNonterminal(memberExprNode, 'memberExpression');
      if (nestedMemberExpr && nestedMemberExpr !== memberExprNode) {
        pathSegments = extractPathFromMemberExpression(nestedMemberExpr);
      }
    }
    if (!pathSegments) {
      const fallbackIdentifier = findFirstIdentifierValue(memberExprNode);
      if (fallbackIdentifier) {
        pathSegments = [fallbackIdentifier];
      }
    }
    if (!pathSegments) { return; }

    if (isLocalFunctionPath(pathSegments, compileContext)) {
      return;
    }

    const lambdaBindingState = getLambdaBindingStateAtCallNode(node, pathSegments, compileContext);
    if (lambdaBindingState && lambdaBindingState.isCaptureAware) {
      return;
    }

    const host = compileContext.hostRegistry.resolvePath(pathSegments);
    if (!host) { return; }
    const memberChildren = memberExprNode ? (memberExprNode.children || []) : [];
    const directPropertyIndex = memberChildren.findIndex((child) => child && child.kind === 'terminal' && child.value === '.');
    const directPropertyNode = directPropertyIndex >= 0 ? memberChildren[directPropertyIndex + 1] : null;
    const directPropertyName = directPropertyNode ? findFirstIdentifierValue(directPropertyNode) : null;
    const baseExpressionNode = directPropertyIndex > 0 ? memberChildren[0] : null;
    let argListNode = (argsNode.children || []).find((c) => c && c.kind === 'nonterminal' && c.name === 'argumentList') || null;
    if (!argListNode) {
      argListNode = findFirstNonterminal(argsNode, 'argumentList');
    }
    const argExprs = argListNode ? collectArgumentExpressions(argListNode) : [];
    const inferredArgTypes = host === '__console__log'
      ? (argExprs.length > 0 ? ['string'] : [])
      : reflectiveHostArgTypes.has(host)
        ? reflectiveHostArgTypes.get(host).slice(0, argExprs.length)
      : reflectiveObjectHosts.has(host)
        ? argExprs.map(() => 'object')
      : argExprs.map((argExpr) => inferExprType(argExpr, compileContext));
    const nextArgTypes = hostCallNeedsReceiverArg(host, directPropertyName, baseExpressionNode)
      ? [inferExprType(baseExpressionNode, compileContext), ...inferredArgTypes]
      : inferredArgTypes;
    if (host === '__console__log') {
      signatures.set(host, nextArgTypes);
      return;
    }
    signatures.set(
      host,
      signatures.has(host)
        ? mergeHostSignatureArgTypes(signatures.get(host), nextArgTypes)
        : nextArgTypes
    );
  });
  return signatures;
}

function collectHostConstructorSymbols(tree, compileContext) {
  const symbols = new Set();

  walk(tree, (node) => {
    if (!node || node.kind !== 'nonterminal' || node.name !== 'memberExpression') {
      return;
    }

    const { ctorMemberNode } = extractNewExpressionMemberAndArgs(node);
    if (!ctorMemberNode) {
      return;
    }

    const ctorPath = extractPathFromMemberExpression(ctorMemberNode, null);
    if (!Array.isArray(ctorPath) || ctorPath.length === 0) {
      return;
    }

    const ctorSymbol = compileContext && compileContext.hostRegistry
      ? compileContext.hostRegistry.resolvePath(['new', ...ctorPath])
      : null;
    if (ctorSymbol) {
      symbols.add(ctorSymbol);
    }
  });

  return symbols;
}

// Returns array of identifier name strings from arrayBindingPattern
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
    if (!singleNameBinding || findFirstNonterminal(singleNameBinding, 'initializer')) {
      return null;
    }
    const bindingName = findFirstIdentifierValue(singleNameBinding);
    if (!bindingName) {
      return null;
    }
    entries.push({ name: bindingName, property: bindingName });
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
    const staticRuntimeInit = directInitializerCall
      ? lowerStaticModelToRuntimeExpression(
        resolveStaticModelFromExpression(directInitializerCall, directInitializerCall, compileContext)
      )
      : null;
    const droppedDirectJsRuntimeCall = staticRuntimeInit === null && Boolean(
      initializerExpr && isDroppedDirectJsRuntimeMethodCallExpression(initializerExpr, compileContext)
    );
    const loweredInit = staticRuntimeInit !== null
      ? staticRuntimeInit
      : (droppedDirectJsRuntimeCall
        ? null
        : (initializerExpr ? lowerExpressionValue(initializerExpr, compileContext) : null));
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
    const inferredFromLoweredInit = loweredInit && /(^|[^A-Za-z0-9_])(\||\^|&|<<|>>)([^A-Za-z0-9_]|$)/.test(loweredInit)
      ? 'int'
      : cppType;
    const initValue = loweredInit !== null ? loweredInit : defaultCppValue(inferredFromLoweredInit);

    if (asyncStateField) {
      lowered.push(`${indent}__sm->${asyncStateField} = ${initValue};`);
      continue;
    }

    const canEmitConstQualifier = inferredFromLoweredInit !== 'const char*'
      && !/\*$/.test(inferredFromLoweredInit.replace(/^void\*$/, ''));
    const constQualifier = isConst && canEmitConstQualifier ? 'const ' : '';
    lowered.push(`${indent}${constQualifier}${inferredFromLoweredInit} ${variableName} = ${initValue};`);
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
      reportUnsupportedLowering(
        compileContext,
        'return-expression-unlowerable',
        'return statement is missing expression'
      );
      if (compileContext && compileContext.strictLowering) {
        err('unsupported lowering: return statement missing expression');
      }
      return [`${indent}return ${defaultCppValue(returnTypeCpp)};`];
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
    if (!hasElse) {
      let foundElse = false;
      walk(ifStmtNode, (node) => {
        if (foundElse || !node || node.kind !== 'terminal') {
          return;
        }
        if (node.token === 'TOKEN_else') {
          foundElse = true;
        }
      });
      hasElse = foundElse;
    }

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
      ? (tryLowerStaticPromiseThenChain(promiseThenCallNode, compileContext) ?? lowerExpressionValue(exprNode, compileContext))
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
    return [`${indent}throw ${throwValue};`];
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
        || extractAsyncFunctionDeclarationFromStatement(stmtNode))) {
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

function extractFunctionParameterNames(functionNode) {
  if (!functionNode
    || functionNode.kind !== 'nonterminal'
    || (functionNode.name !== 'functionDeclaration' && functionNode.name !== 'functionExpression')) {
    return [];
  }

  const formalParameterList = (functionNode.children || []).find(
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

function emitTopLevelFunctionDefinitions(tree, compileContext) {
  const definitions = [];
  const constructorBindingNames = new Set(
    collectTopLevelConstructorFunctionExpressionBindings(tree).map(({ bindingName }) => bindingName)
  );
  const topLevelArrowBindings = collectTopLevelArrowFunctionBindings(tree);

  for (const functionDeclaration of collectTopLevelFunctionDeclarations(tree)) {
    const functionName = extractFunctionDeclarationName(functionDeclaration);
    if (!functionName) {
      continue;
    }
    const returnTypeCpp = compileContext.functionReturnTypes.get(functionName) || 'int';
    const cppParams = buildCppParamsFromFunctionNode(functionDeclaration, functionName, compileContext);
    const statementNodes = collectFunctionBodyStatementNodes(functionDeclaration);
    const bodyLines = [];
    beginDeferredPromiseQueueScope(compileContext);
    for (const statementNode of statementNodes) {
      resetStatementLoweringState(compileContext);
      bodyLines.push(...lowerStatementNode(statementNode, compileContext, 1, { returnTypeCpp }));
    }
    bodyLines.push(...takeDeferredPromiseStatements(compileContext, '  '));
    if (!bodyLines.some((line) => /^\s*return\b/.test(line))) {
      bodyLines.push(`  return ${defaultCppValue(returnTypeCpp)};`);
    }
    definitions.push(
      `${returnTypeCpp} ${functionName}(${cppParams}) {\n`
      + `${bodyLines.join('\n')}\n`
      + `}`
    );
  }

  for (const { bindingName, functionExpressionNode } of collectTopLevelFunctionExpressionBindings(tree)) {
    if (constructorBindingNames.has(bindingName)) {
      continue;
    }
    const returnTypeCpp = compileContext.functionReturnTypes.get(bindingName) || 'int';
    const cppParams = buildCppParamsFromFunctionNode(functionExpressionNode, bindingName, compileContext);
    const statementNodes = collectFunctionBodyStatementNodes(functionExpressionNode);
    const bodyLines = [];
    beginDeferredPromiseQueueScope(compileContext);
    for (const statementNode of statementNodes) {
      resetStatementLoweringState(compileContext);
      bodyLines.push(...lowerStatementNode(statementNode, compileContext, 1, { returnTypeCpp }));
    }
    bodyLines.push(...takeDeferredPromiseStatements(compileContext, '  '));
    if (!bodyLines.some((line) => /^\s*return\b/.test(line))) {
      bodyLines.push(`  return ${defaultCppValue(returnTypeCpp)};`);
    }
    definitions.push(
      `${returnTypeCpp} ${bindingName}(${cppParams}) {\n`
      + `${bodyLines.join('\n')}\n`
      + `}`
    );
  }

  for (const { bindingName, arrowFunctionNode } of topLevelArrowBindings) {
    const returnTypeCpp = compileContext.functionReturnTypes.get(bindingName) || 'int';
    const cppParams = buildCppParamsFromFunctionNode(arrowFunctionNode, bindingName, compileContext);
    const statementNodes = collectFunctionBodyStatementNodes(arrowFunctionNode);
    const bodyLines = [];
    beginDeferredPromiseQueueScope(compileContext);

    if (statementNodes.length > 0) {
      for (const statementNode of statementNodes) {
        resetStatementLoweringState(compileContext);
        bodyLines.push(...lowerStatementNode(statementNode, compileContext, 1, { returnTypeCpp }));
      }
    } else {
      const returnExprNode = extractCallableReturnExpressionNode(arrowFunctionNode);
      if (returnExprNode) {
        const loweredReturn = lowerExpressionValue(returnExprNode, compileContext);
        if (loweredReturn !== null) {
          bodyLines.push(...takePreludeStatements(compileContext, '  '));
          bodyLines.push(`  return ${castReturnExpression(loweredReturn, returnTypeCpp)};`);
        }
      }
    }
    bodyLines.push(...takeDeferredPromiseStatements(compileContext, '  '));

    if (!bodyLines.some((line) => /^\s*return\b/.test(line))) {
      bodyLines.push(`  return ${defaultCppValue(returnTypeCpp)};`);
    }

    definitions.push(
      `${returnTypeCpp} ${bindingName}(${cppParams}) {\n`
      + `${bodyLines.join('\n')}\n`
      + `}`
    );
  }

  for (const { symbolName, functionExpressionNode } of collectTopLevelAssignedFunctionExpressionBindings(tree)) {
    const assignedBinding = collectTopLevelAssignedFunctionExpressionBindings(tree)
      .find((binding) => binding.symbolName === symbolName) || null;
    const isPrototypeMethod = Boolean(assignedBinding && assignedBinding.lhs && assignedBinding.lhs.includes('.prototype.'));
    const returnTypeCpp = compileContext.functionReturnTypes.get(symbolName) || 'int';
    const params = extractFunctionParameterNames(functionExpressionNode);
    const cppParams = buildCppParamsFromFunctionNode(functionExpressionNode, symbolName, compileContext);
    const statementNodes = collectFunctionBodyStatementNodes(functionExpressionNode);

    const bodyLines = [];
    beginDeferredPromiseQueueScope(compileContext);
    for (const statementNode of statementNodes) {
      resetStatementLoweringState(compileContext);
      bodyLines.push(...lowerStatementNode(statementNode, compileContext, 1, { returnTypeCpp }));
    }
    bodyLines.push(...takeDeferredPromiseStatements(compileContext, '  '));

    if (!bodyLines.some((line) => /^\s*return\b/.test(line))) {
      bodyLines.push(`  return ${defaultCppValue(returnTypeCpp)};`);
    }

    definitions.push(
      `${returnTypeCpp} ${symbolName}(${isPrototypeMethod ? `void* self${cppParams && cppParams !== 'void' ? `, ${cppParams}` : ''}` : cppParams}) {\n`
      + `${(isPrototypeMethod ? bodyLines.map(rewriteObjectLiteralMethodThisReferences) : bodyLines).join('\n')}\n`
      + `}`
    );
  }

  for (const { symbolName, functionExpressionNode } of collectTopLevelObjectLiteralFunctionExpressionBindings(tree)) {
    const returnTypeCpp = compileContext.functionReturnTypes.get(symbolName) || 'int';
    const params = extractFunctionParameterNames(functionExpressionNode);
    const cppParams = buildCppParamsFromFunctionNode(functionExpressionNode, symbolName, compileContext);
    const statementNodes = collectFunctionBodyStatementNodes(functionExpressionNode);
    const bodyLines = [];
    beginDeferredPromiseQueueScope(compileContext);

    for (const statementNode of statementNodes) {
      resetStatementLoweringState(compileContext);
      bodyLines.push(...lowerStatementNode(statementNode, compileContext, 1, { returnTypeCpp }));
    }
    bodyLines.push(...takeDeferredPromiseStatements(compileContext, '  '));

    if (!bodyLines.some((line) => /^\s*return\b/.test(line))) {
      bodyLines.push(`  return ${defaultCppValue(returnTypeCpp)};`);
    }

    definitions.push(
      `${returnTypeCpp} ${symbolName}(void* self${cppParams && cppParams !== 'void' ? `, ${cppParams}` : ''}) {\n`
      + `${bodyLines.map(rewriteObjectLiteralMethodThisReferences).join('\n')}\n`
      + `}`
    );
  }

  for (const { symbolName, functionExpressionNode } of collectTopLevelCallArgumentFunctionExpressionBindings(tree)) {
    const returnTypeCpp = compileContext.functionReturnTypes.get(symbolName) || 'int';
    const params = extractFunctionParameterNames(functionExpressionNode);
    const cppParams = buildCppParamsFromFunctionNode(functionExpressionNode, symbolName, compileContext);
    const statementNodes = collectFunctionBodyStatementNodes(functionExpressionNode);
    const bodyLines = [];
    beginDeferredPromiseQueueScope(compileContext);

    for (const statementNode of statementNodes) {
      resetStatementLoweringState(compileContext);
      bodyLines.push(...lowerStatementNode(statementNode, compileContext, 1, { returnTypeCpp }));
    }
    bodyLines.push(...takeDeferredPromiseStatements(compileContext, '  '));

    if (!bodyLines.some((line) => /^\s*return\b/.test(line))) {
      bodyLines.push(`  return ${defaultCppValue(returnTypeCpp)};`);
    }

    definitions.push(
      `${returnTypeCpp} ${symbolName}(${cppParams}) {\n`
      + `${bodyLines.join('\n')}\n`
      + `}`
    );
  }

  for (const { bindingName, functionExpressionNode } of collectTopLevelConstructorFunctionExpressionBindings(tree)) {
    const params = extractFunctionParameterNames(functionExpressionNode);
    const cppParams = buildCppParamsFromFunctionNode(functionExpressionNode, bindingName, compileContext);
    const statementNodes = collectFunctionBodyStatementNodes(functionExpressionNode);
    const bodyLines = ['  void* __maia_this = __maia_obj_literal0();'];
    const callBodyLines = [];
    beginDeferredPromiseQueueScope(compileContext);

    for (const statementNode of statementNodes) {
      resetStatementLoweringState(compileContext);
      const loweredLines = lowerStatementNode(statementNode, compileContext, 1, { returnTypeCpp: 'int' })
        .map(rewriteConstructorThisReferences)
        .filter((line) => !/^\s*return\b/.test(line));
      bodyLines.push(...loweredLines);
      callBodyLines.push(...loweredLines);
    }
    const deferredPromiseLines = takeDeferredPromiseStatements(compileContext, '  ');
    bodyLines.push(...deferredPromiseLines);
    callBodyLines.push(...deferredPromiseLines);

    bodyLines.push('  return (void*)__maia_this;');

    definitions.push(
      `void __${bindingName}__call(void* __maia_this${cppParams === 'void' ? '' : `, ${cppParams}`}) {\n`
      + `${callBodyLines.join('\n')}\n`
      + `}`
    );

    definitions.push(
      `void* __new__${bindingName}(${cppParams}) {\n`
      + `${bodyLines.join('\n')}\n`
      + `}`
    );
  }

  return definitions.join('\n\n');
}

function emitTopLevelFunctionPrototypes(tree, compileContext) {
  const prototypes = [];
  const seen = new Set();
  const constructorBindingNames = new Set(
    collectTopLevelConstructorFunctionExpressionBindings(tree).map(({ bindingName }) => bindingName)
  );
  const topLevelArrowBindings = collectTopLevelArrowFunctionBindings(tree);

  for (const functionDeclaration of collectTopLevelFunctionDeclarations(tree)) {
    const functionName = extractFunctionDeclarationName(functionDeclaration);
    if (!functionName || seen.has(functionName)) {
      continue;
    }

    const params = extractFunctionParameterNames(functionDeclaration);
    const returnTypeCpp = compileContext.functionReturnTypes.get(functionName) || 'int';
    const cppParams = buildCppParamsFromFunctionNode(functionDeclaration, functionName, compileContext);

    prototypes.push(`${returnTypeCpp} ${functionName}(${cppParams});`);
    seen.add(functionName);
  }

  for (const { bindingName, functionExpressionNode } of collectTopLevelFunctionExpressionBindings(tree)) {
    if (constructorBindingNames.has(bindingName)) {
      continue;
    }

    if (seen.has(bindingName)) {
      continue;
    }

    const params = extractFunctionParameterNames(functionExpressionNode);
    const returnTypeCpp = compileContext.functionReturnTypes.get(bindingName) || 'int';
    const cppParams = buildCppParamsFromFunctionNode(functionExpressionNode, bindingName, compileContext);

    prototypes.push(`${returnTypeCpp} ${bindingName}(${cppParams});`);
    seen.add(bindingName);
  }

  for (const { bindingName, arrowFunctionNode } of topLevelArrowBindings) {
    if (seen.has(bindingName)) {
      continue;
    }

    const returnTypeCpp = compileContext.functionReturnTypes.get(bindingName) || 'int';
    const cppParams = buildCppParamsFromFunctionNode(arrowFunctionNode, bindingName, compileContext);

    prototypes.push(`${returnTypeCpp} ${bindingName}(${cppParams});`);
    seen.add(bindingName);
  }

  for (const { symbolName, functionExpressionNode } of collectTopLevelAssignedFunctionExpressionBindings(tree)) {
    const assignedBinding = collectTopLevelAssignedFunctionExpressionBindings(tree)
      .find((binding) => binding.symbolName === symbolName) || null;
    const isPrototypeMethod = Boolean(assignedBinding && assignedBinding.lhs && assignedBinding.lhs.includes('.prototype.'));
    if (seen.has(symbolName)) {
      continue;
    }

    const params = extractFunctionParameterNames(functionExpressionNode);
    const returnTypeCpp = compileContext.functionReturnTypes.get(symbolName) || 'int';
    const cppParams = buildCppParamsFromFunctionNode(functionExpressionNode, symbolName, compileContext);

    prototypes.push(`${returnTypeCpp} ${symbolName}(${isPrototypeMethod ? `void* self${cppParams && cppParams !== 'void' ? `, ${cppParams}` : ''}` : cppParams});`);
    seen.add(symbolName);
  }

  for (const { symbolName, functionExpressionNode } of collectTopLevelObjectLiteralFunctionExpressionBindings(tree)) {
    if (seen.has(symbolName)) {
      continue;
    }

    const params = extractFunctionParameterNames(functionExpressionNode);
    const returnTypeCpp = compileContext.functionReturnTypes.get(symbolName) || 'int';
    const cppParams = buildCppParamsFromFunctionNode(functionExpressionNode, symbolName, compileContext);

    prototypes.push(`${returnTypeCpp} ${symbolName}(void* self${cppParams && cppParams !== 'void' ? `, ${cppParams}` : ''});`);
    seen.add(symbolName);
  }

  for (const { symbolName, functionExpressionNode } of collectTopLevelCallArgumentFunctionExpressionBindings(tree)) {
    if (seen.has(symbolName)) {
      continue;
    }

    const params = extractFunctionParameterNames(functionExpressionNode);
    const returnTypeCpp = compileContext.functionReturnTypes.get(symbolName) || 'int';
    const cppParams = buildCppParamsFromFunctionNode(functionExpressionNode, symbolName, compileContext);

    prototypes.push(`${returnTypeCpp} ${symbolName}(${cppParams});`);
    seen.add(symbolName);
  }

  for (const { bindingName, functionExpressionNode } of collectTopLevelConstructorFunctionExpressionBindings(tree)) {
    const ctorSymbol = `__new__${bindingName}`;
    if (seen.has(ctorSymbol)) {
      continue;
    }

    const params = extractFunctionParameterNames(functionExpressionNode);
    const cppParams = buildCppParamsFromFunctionNode(functionExpressionNode, bindingName, compileContext);

    prototypes.push(`void __${bindingName}__call(void* __maia_this${cppParams === 'void' ? '' : `, ${cppParams}`});`);
    prototypes.push(`void* ${ctorSymbol}(${cppParams});`);
    seen.add(ctorSymbol);
  }

  return prototypes.join('\n');
}

function pruneUnusedGeneratedFunctionsCpp(code) {
  const src = String(code || '');
  if (!src.trim()) {
    return src;
  }

  const lines = src.split('\n');
  const definitionMap = new Map();
  const prototypeMap = new Map();
  const signatureLinePattern = /^\s*[A-Za-z_][A-Za-z0-9_\s\*]*\s+([A-Za-z_][A-Za-z0-9_]*)\s*\([^;{}]*\)\s*\{\s*$/;
  const prototypeLinePattern = /^\s*[A-Za-z_][A-Za-z0-9_\s\*]*\s+([A-Za-z_][A-Za-z0-9_]*)\s*\([^;{}]*\)\s*;\s*$/;

  let depth = 0;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (depth === 0) {
      const defMatch = line.match(signatureLinePattern);
      if (defMatch) {
        const name = defMatch[1];
        let localDepth = (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
        let end = i;
        while (localDepth > 0 && end + 1 < lines.length) {
          end += 1;
          const nextLine = lines[end];
          localDepth += (nextLine.match(/\{/g) || []).length;
          localDepth -= (nextLine.match(/\}/g) || []).length;
        }
        definitionMap.set(name, {
          start: i,
          end,
          text: lines.slice(i, end + 1).join('\n')
        });
        i = end;
        continue;
      }

      const protoMatch = line.match(prototypeLinePattern);
      if (protoMatch) {
        const name = protoMatch[1];
        if (!prototypeMap.has(name)) {
          prototypeMap.set(name, []);
        }
        prototypeMap.get(name).push(i);
      }
    }

    depth += (line.match(/\{/g) || []).length;
    depth -= (line.match(/\}/g) || []).length;
    if (depth < 0) {
      depth = 0;
    }
  }

  const mainDef = definitionMap.get('main');
  if (!mainDef) {
    return src;
  }

  const candidateNames = Array.from(definitionMap.keys()).filter((name) => name !== 'main');
  const keep = new Set(['main']);
  const queue = [];
  const enqueueReferenced = (text) => {
    for (const name of candidateNames) {
      if (keep.has(name)) {
        continue;
      }
      const pattern = new RegExp(`\\b${name}\\b`);
      if (pattern.test(text)) {
        keep.add(name);
        queue.push(name);
      }
    }
  };

  enqueueReferenced(mainDef.text);
  while (queue.length > 0) {
    const name = queue.shift();
    const def = definitionMap.get(name);
    if (!def) {
      continue;
    }
    enqueueReferenced(def.text);
  }

  const prunedLines = lines.slice();
  for (const [name, def] of definitionMap.entries()) {
    if (keep.has(name)) {
      continue;
    }
    for (let i = def.start; i <= def.end; i += 1) {
      prunedLines[i] = null;
    }
    const protoLines = prototypeMap.get(name) || [];
    for (const lineIndex of protoLines) {
      prunedLines[lineIndex] = null;
    }
  }

  return prunedLines.filter((line) => line !== null).join('\n');
}

function rewriteClassMethodBodyLinesForWrapper(bodyLines, className) {
  return (bodyLines || []).map((line) => {
    let rewritten = line;
    rewritten = rewritten.replace(/\bthis->([A-Za-z_][A-Za-z0-9_]*)\s*\(/g, (_, methodName) => `${getClassMethodWrapperName(className, methodName)}(self, `);
    rewritten = rewritten.replace(/\(self,\s*\)/g, '(self)');
    rewritten = rewritten.replace(/\bthis->([A-Za-z_][A-Za-z0-9_]*)\b(?!\s*\()/g, 'self->$1');
    return rewritten;
  });
}

function getClassInitWrapperName(className) {
  return `${className}_ctor_init`;
}

function getClassInitWrapperMangledName(className, arity = 0) {
  return `${getClassInitWrapperName(className)}__pv${'i'.repeat(Math.max(0, Number(arity) || 0))}`;
}

function getClassMethodWrapperName(className, methodName) {
  return `${className}_meth_${methodName}`;
}

function emitTopLevelClassDefinitions(tree, compileContext) {
  const classDefinitions = [];

  for (const classDeclaration of collectTopLevelClassDeclarations(tree)) {
    const className = extractClassDeclarationName(classDeclaration);
    if (!className) {
      continue;
    }

    const heritageName = extractClassHeritageName(classDeclaration);
    const methodEntries = extractClassMethodEntries(classDeclaration);

    const classBodyLines = [];
    const wrapperLines = [];
    const inferredFieldNames = new Set();
    let constructorSuperArgs = null;
    if (methodEntries.length === 0) {
      classBodyLines.push('  // [empty class body]');
    }

    let hasConstructor = false;
    for (const { methodDefinition, isStatic } of methodEntries) {
      const methodName = extractMethodDefinitionName(methodDefinition);
      if (!methodName) {
        continue;
      }

      const params = extractMethodParameterNames(methodDefinition);
      const cppParams = params.length === 0
        ? 'void'
        : params.map((name) => `int ${name}`).join(', ');

      const staticQualifier = isStatic ? 'static ' : '';
      const isConstructor = (methodName === 'constructor');

      // Collect method body statement nodes (functionBody is in methodDefinition)
      const methodStatements = collectFunctionBodyStatementNodes(methodDefinition);
      const methodBodyLines = [];
      const methodReturnType = isConstructor ? 'void' : 'int';
      beginDeferredPromiseQueueScope(compileContext);
      for (const stmtNode of methodStatements) {
        const superCallNode = findFirstNonterminal(stmtNode, 'superCall');
        if (superCallNode) {
          const superArgumentsNode = findFirstNonterminal(superCallNode, 'arguments');
          const superArgumentList = superArgumentsNode
            ? findFirstNonterminal(superArgumentsNode, 'argumentList')
            : null;
          const superArgumentExprs = superArgumentList ? collectArgumentExpressions(superArgumentList) : [];
          if (!isConstructor || !heritageName || constructorSuperArgs !== null) {
            reportUnsupportedLowering(
              compileContext,
              'super-call-unlowerable',
              'super call must appear once in a derived class constructor'
            );
            if (compileContext && compileContext.strictLowering) {
              err('unsupported lowering: super call placement');
            }
            continue;
          }
          const loweredSuperArgs = superArgumentExprs.map((argumentExpr) =>
            lowerExpressionValue(argumentExpr, compileContext)
          );
          if (loweredSuperArgs.some((argument) => argument === null)) {
            reportUnsupportedLowering(
              compileContext,
              'super-call-unlowerable',
              'super call argument could not be lowered'
            );
            if (compileContext && compileContext.strictLowering) {
              err('unsupported lowering: super call argument');
            }
            continue;
          }
          constructorSuperArgs = loweredSuperArgs;
          continue;
        }
        methodBodyLines.push(...lowerStatementNode(stmtNode, compileContext, 2, { returnTypeCpp: methodReturnType }));
      }
      methodBodyLines.push(...takeDeferredPromiseStatements(compileContext, '    '));

      // Infer simple instance fields referenced as this->field in method bodies.
      // We intentionally skip method-call forms like this->run(...).
      for (const bodyLine of methodBodyLines) {
        const thisFieldPattern = /\bthis->([A-Za-z_][A-Za-z0-9_]*)\b(?!\s*\()/g;
        let match = thisFieldPattern.exec(bodyLine);
        while (match) {
          inferredFieldNames.add(match[1]);
          match = thisFieldPattern.exec(bodyLine);
        }
      }

      // Only add auto-return for non-void (non-constructor) methods that have no return
      if (!isConstructor && !methodBodyLines.some((line) => /^\s*return\b/.test(line))) {
        methodBodyLines.push(`    return ${defaultCppValue(methodReturnType)};`);
      }

      if (isConstructor) {
        hasConstructor = true;
        const initWrapperName = getClassInitWrapperName(className);
        const initWrapperMangledName = getClassInitWrapperMangledName(className, params.length);
        const wrapperBodyLines = rewriteClassMethodBodyLinesForWrapper(methodBodyLines, className);
        wrapperLines.push(`void ${initWrapperName}(${className}* self${cppParams === 'void' ? '' : `, ${cppParams}`}) {`);
        if (heritageName) {
          const forwardedSuperArgs = constructorSuperArgs || [];
          wrapperLines.push(`  ${getClassInitWrapperMangledName(heritageName, forwardedSuperArgs.length)}((${heritageName}*)self${forwardedSuperArgs.length > 0 ? `, ${forwardedSuperArgs.join(', ')}` : ''});`);
        }
        for (const line of wrapperBodyLines) {
          wrapperLines.push(line.replace(/^ {4}/, '  '));
        }
        wrapperLines.push('}');
        const forwardedArgs = params.length > 0 ? `, ${params.join(', ')}` : '';
        wrapperLines.push(`void ${initWrapperMangledName}(${className}* self${cppParams === 'void' ? '' : `, ${cppParams}`}) {`);
        wrapperLines.push(`  ${initWrapperName}(self${forwardedArgs});`);
        wrapperLines.push('}');
        continue;
      }

      if (!isStatic) {
        const methodWrapperName = getClassMethodWrapperName(className, methodName);
        const wrapperBodyLines = rewriteClassMethodBodyLinesForWrapper(methodBodyLines, className);
        wrapperLines.push(`${methodReturnType} ${methodWrapperName}(${className}* self${cppParams === 'void' ? '' : `, ${cppParams}`}) {`);
        for (const line of wrapperBodyLines) {
          wrapperLines.push(line.replace(/^ {4}/, '  '));
        }
        wrapperLines.push('}');
      }
    }

    if (!hasConstructor) {
      const initWrapperName = getClassInitWrapperName(className);
      const initWrapperMangledName = getClassInitWrapperMangledName(className, 0);
      if (heritageName) {
        wrapperLines.unshift(`void ${initWrapperName}(${className}* self) {`);
        wrapperLines.splice(1, 0, `  ${getClassInitWrapperMangledName(heritageName, 0)}((${heritageName}*)self);`);
        wrapperLines.splice(2, 0, '}');
      } else {
        wrapperLines.unshift(`void ${initWrapperName}(${className}* self) {`);
        wrapperLines.splice(1, 0, '}');
      }
      wrapperLines.push(`void ${initWrapperMangledName}(${className}* self) {`);
      wrapperLines.push(`  ${initWrapperName}(self);`);
      wrapperLines.push('}');
    }

    if (inferredFieldNames.size > 0) {
      const fieldLines = Array.from(inferredFieldNames)
        .sort()
        .map((fieldName) => `  int ${fieldName};`);
      classBodyLines.unshift(...fieldLines);
    }

    classDefinitions.push(
      `struct ${className}${heritageName ? ` : public ${heritageName}` : ''} {\n`
      + `${classBodyLines.join('\n')}\n`
      + `};${wrapperLines.length > 0 ? `\n\n${wrapperLines.join('\n')}` : ''}`
    );
  }

  return classDefinitions.join('\n\n');
}

function buildAsyncRuntimeBridgePlan(asyncFunctions) {
  const plan = [];
  let nextScheduleState = 1;

  for (let index = 0; index < (asyncFunctions || []).length; index += 1) {
    const machine = asyncFunctions[index];
    const structName = `__async_${machine.name}`;
    const suspendCount = Number(machine.suspendPointCount) || 0;
    const hasSuspendPoints = suspendCount > 0;
    const scheduleStateStart = hasSuspendPoints ? nextScheduleState : null;
    const scheduleStateEnd = hasSuspendPoints ? (nextScheduleState + suspendCount - 1) : null;

    if (hasSuspendPoints) {
      nextScheduleState = scheduleStateEnd + 1;
    }

    plan.push({
      functionName: machine.name,
      structName,
      // MaiaCpp lowers the C++ bridge `__async_name__resume_bridge(void*)`
      // into this stable C/WASM ABI symbol.
      bridgeSymbol: `async_${machine.name}_resume__pv`,
      machineId: index + 1,
      suspendPointCount: suspendCount,
      scheduleStateStart,
      scheduleStateEnd
    });
  }

  return plan;
}

function generateCpp(inputPath, tree, hostCalls, compileContext) {

function lowerAsyncStateStatements(machine, stateIndex, compileContext) {
  const statementNodes = Array.isArray(machine.statementNodes) ? machine.statementNodes : [];
  const suspendPoints = Array.isArray(machine.body) ? machine.body : [];
  const previousSuspend = stateIndex === 0 ? null : suspendPoints[stateIndex - 1];
  const nextSuspend = suspendPoints[stateIndex] || null;
  const startIndex = previousSuspend ? previousSuspend.statementIndex + 1 : 0;
  const endIndex = nextSuspend ? nextSuspend.statementIndex : statementNodes.length;
  const lines = [];

  beginDeferredPromiseQueueScope(compileContext);
  for (let index = startIndex; index < endIndex; index += 1) {
    resetStatementLoweringState(compileContext);
    lines.push(...lowerStatementNode(statementNodes[index], compileContext, 3, { returnTypeCpp: machine.returnValueCppType }));
  }
  lines.push(...takeDeferredPromiseStatements(compileContext, '      '));
  return { lines, suspendPoint: nextSuspend };
}

function extractAsyncAwaitOperand(awaitNode) {
  return awaitNode && (awaitNode.children || []).find(
    (child) => child && child.kind === 'nonterminal'
  ) || null;
}

function extractAsyncPromiseResolveValueNode(suspendPoint) {
  const operand = extractAsyncAwaitOperand(suspendPoint && suspendPoint.awaitNode);
  const callExpression = operand ? extractDirectCallExpressionNode(operand) : null;
  const { memberExprNode, argExprs } = extractCallExpressionMemberAndArgs(callExpression);
  const pathSegments = memberExprNode ? extractPathFromMemberExpression(memberExprNode, null) : null;
  if (!Array.isArray(pathSegments)
    || pathSegments.length !== 2
    || pathSegments[0] !== 'Promise'
    || pathSegments[1] !== 'resolve') {
    return null;
  }
  return argExprs[0] || null;
}

function collectAsyncStateLocalFields(machine, compileContext) {
  const fields = [];
  const bindings = new Set(machine.localBindings || []);
  if (bindings.size === 0) {
    return fields;
  }

  for (const statementNode of (machine.statementNodes || [])) {
    const declarationNode = (statementNode.children || []).find(
      (child) => child
        && child.kind === 'nonterminal'
        && (child.name === 'variableStatement' || child.name === 'letDeclaration' || child.name === 'constDeclaration')
    );
    const declarationList = declarationNode
      ? (declarationNode.children || []).find(
        (child) => child && child.kind === 'nonterminal' && child.name === 'variableDeclarationList'
      )
      : null;
    for (const declaration of extractVariableDeclarations(declarationList)) {
      const name = extractVariableDeclarationName(declaration);
      if (!name || !bindings.has(name) || fields.some((field) => field.name === name)) {
        continue;
      }
      const initializer = extractVariableDeclarationInitializer(declaration);
      const awaitNode = initializer ? findFirstNonterminal(initializer, 'awaitExpression') : null;
      const awaitedValueNode = awaitNode
        ? extractAsyncPromiseResolveValueNode({ awaitNode })
        : null;
      fields.push({
        name,
        fieldName: `__local_${name}`,
        cppType: awaitedValueNode
          ? inferInitializerCppType(awaitedValueNode, compileContext)
          : awaitNode
            ? 'int'
          : inferInitializerCppType(initializer, compileContext)
      });
    }
  }

  return fields;
}

function lowerAsyncAwaitedExpression(suspendPoint, compileContext) {
  const operand = extractAsyncAwaitOperand(suspendPoint && suspendPoint.awaitNode);
  return operand ? lowerExpressionValue(operand, compileContext) : suspendPoint.awaitedExpr;
}

function lowerAsyncAwaitResultAssignment(suspendPoint, compileContext) {
  const binding = suspendPoint && suspendPoint.resultBinding;
  if (!binding || binding.kind !== 'declaration' || !binding.name) {
    return null;
  }

  const fieldName = compileContext
    && compileContext.asyncStateLocalFields
    && compileContext.asyncStateLocalFields.get(binding.name);
  const valueNode = extractAsyncPromiseResolveValueNode(suspendPoint);
  if (!fieldName) {
    reportUnsupportedLowering(
      compileContext,
      'async-await-result-unlowerable',
      `await result assignment for '${binding.name}' could not be associated with async state`
    );
    return null;
  }

  if (!valueNode) {
    const fieldType = compileContext
      && compileContext.asyncStateLocalFieldTypes
      && compileContext.asyncStateLocalFieldTypes.get(binding.name);
    if (fieldType === 'const char*' || fieldType === 'void*') {
      reportUnsupportedLowering(
        compileContext,
        'async-await-result-unlowerable',
        `await result assignment for '${binding.name}' requires a scalar runtime value; string and object transport are not available yet`
      );
      return null;
    }
    const takeResult = fieldType === 'double'
      ? '__async_take_f64((void*)__sm)'
      : '__async_take_i32((void*)__sm)';
    return `      __sm->${fieldName} = ${takeResult};`;
  }

  const value = lowerExpressionValue(valueNode, compileContext);
  return value === null ? null : `      __sm->${fieldName} = ${value};`;
}

function awaitUsesDynamicRuntimeTransport(suspendPoint) {
  return !extractAsyncPromiseResolveValueNode(suspendPoint);
}

function emitAsyncStateMachinesCpp(machines, bridgePlanByFunctionName = new Map(), compileContext = null) {
  if (!machines || machines.length === 0) { return ''; }

  return machines.map((machine) => {
    const structName = `__async_${machine.name}`;
    const machinePlan = bridgePlanByFunctionName.get(machine.name) || null;
    const terminalState = machine.suspendPointCount + 1;
    let nextSyntheticState = terminalState + 1;
    const catchStatesBySuspend = new Map();
    const syntheticCatchStates = [];
    for (const suspendPoint of (machine.body || [])) {
      const states = [];
      for (const handler of ((suspendPoint && suspendPoint.catchHandlers) || [])) {
        const stateId = nextSyntheticState;
        nextSyntheticState += 1;
        const entry = { stateId, handler };
        states.push(entry);
        syntheticCatchStates.push(entry);
      }
      catchStatesBySuspend.set(suspendPoint, states);
    }
    const localFields = compileContext ? collectAsyncStateLocalFields(machine, compileContext) : [];
    const previousAsyncStateFields = compileContext ? compileContext.asyncStateLocalFields : null;
    const previousAsyncStateFieldTypes = compileContext ? compileContext.asyncStateLocalFieldTypes : null;
    const previousAsyncStateDynamicHandleFields = compileContext ? compileContext.asyncStateDynamicHandleFields : null;
    if (compileContext) {
      compileContext.asyncStateLocalFields = new Map(localFields.map((field) => [field.name, field.fieldName]));
      compileContext.asyncStateLocalFieldTypes = new Map(localFields.map((field) => [field.name, field.cppType]));
      compileContext.asyncStateDynamicHandleFields = new Map(
        machine.body
          .filter((suspendPoint) => suspendPoint && suspendPoint.resultBinding && awaitUsesDynamicRuntimeTransport(suspendPoint))
          .map((suspendPoint) => [
            suspendPoint.resultBinding.name,
            `__local_${suspendPoint.resultBinding.name}`
          ])
      );
    }

    const paramFields = machine.params.length === 0
      ? '  // no parameters'
      : machine.params.map((p) => `  ${p.cppType} ${p.name};`).join('\n');

    let switchBody = '';

    for (let stateIndex = 0; stateIndex <= machine.suspendPointCount; stateIndex += 1) {
      const stateBody = compileContext
        ? lowerAsyncStateStatements(machine, stateIndex, compileContext)
        : { lines: [], suspendPoint: machine.body[stateIndex] || null };
      const suspendPoint = stateBody.suspendPoint;
      const previousSuspendPoint = stateIndex > 0 ? machine.body[stateIndex - 1] : null;
      const resumedAssignment = stateIndex > 0
        ? lowerAsyncAwaitResultAssignment(previousSuspendPoint, compileContext)
        : null;
      switchBody += `    case ${stateIndex}: ${stateIndex === 0 ? '/* initial state */' : `/* resumed after await ${stateIndex} */`}\n`;
      const resumeCatchStates = catchStatesBySuspend.get(previousSuspendPoint) || [];
      if (resumeCatchStates.length > 0) {
        for (const entry of resumeCatchStates) {
          switchBody += `      if (__exc_active() && __exc_matches(__exc_type(), ${entry.handler.typeCode})) {\n`;
          switchBody += `        __sm->__state = ${entry.stateId};\n`;
          switchBody += `        ${structName}__resume(__sm);\n`;
          switchBody += `        return;\n`;
          switchBody += `      }\n`;
        }
        switchBody += `      if (__exc_active()) {\n`;
        switchBody += `        __sm->__state = ${terminalState};\n`;
        switchBody += `        ${structName}__resume(__sm);\n`;
        switchBody += `        return;\n`;
        switchBody += `      }\n`;
      }
      if (resumedAssignment) {
        switchBody += `${resumedAssignment}\n`;
      }
      for (const line of stateBody.lines) {
        switchBody += `${line}\n`;
      }

      if (!suspendPoint) {
        switchBody += `      __async_complete((void*)__sm);\n`;
        switchBody += `      __free((void*)__sm);\n`;
        switchBody += `      return;\n`;
        continue;
      }

      const i = stateIndex + 1;
      const awaitedExpr = lowerAsyncAwaitedExpression(suspendPoint, compileContext);
      const awaitedExprComment = awaitedExpr
        ? `: ${awaitedExpr}`
        : '';
      const tryDepth = suspendPoint ? suspendPoint.tryDepth : 0;
      const finallyDepth = suspendPoint ? suspendPoint.finallyDepth : 0;
      const catchHandlers = (suspendPoint && suspendPoint.catchHandlers) || [];
      const finallyHandlers = (suspendPoint && suspendPoint.finallyHandlers) || [];
      const globalScheduleState = machinePlan && Number.isInteger(machinePlan.scheduleStateStart)
        ? (machinePlan.scheduleStateStart + i - 1)
        : i;
      const usesDynamicTransport = awaitUsesDynamicRuntimeTransport(suspendPoint);

      switchBody += `      __sm->__state = ${i};\n`;
      if (usesDynamicTransport) {
        switchBody += `      __async_prepare_await((void*)__sm, ${globalScheduleState});\n`;
      }
      switchBody += `      /* await checkpoint ${i}${awaitedExprComment} */\n`;
      if (awaitedExpr) {
        switchBody += `      ${awaitedExpr};\n`;
      }
      
      if (tryDepth > 0) {
        if (catchHandlers.length > 0) {
          // Generate __exc_matches() type routing for each catch handler.
          const catchStates = catchStatesBySuspend.get(suspendPoint) || [];
          for (const entry of catchStates) {
            switchBody += `      if (__exc_active() && __exc_matches(__exc_type(), ${entry.handler.typeCode})) {\n`;
            switchBody += `        /* catch handler for ${entry.handler.paramName} (state ${entry.stateId}) */\n`;
            switchBody += `        __sm->__state = ${entry.stateId};\n`;
            switchBody += `        ${structName}__resume(__sm);\n`;
            switchBody += `        return;\n`;
            switchBody += `      }\n`;
          }
        }

        if (finallyDepth > 0 && finallyHandlers.length > 0) {
          // Route through finally handlers before outer propagation.
          for (let j = 0; j < finallyHandlers.length; j += 1) {
            const finallyState = nextSyntheticState;
            nextSyntheticState += 1;
            switchBody += `      if (__exc_active()) {\n`;
            switchBody += `        /* finally handler transition (state ${finallyState}, depth ${finallyDepth}) */\n`;
            switchBody += `        __sm->__state = ${finallyState};\n`;
            switchBody += `        ${structName}__resume(__sm);\n`;
            switchBody += `        return;\n`;
            switchBody += `      }\n`;
          }
        }

        switchBody += `      if (__exc_active()) {\n`;
        switchBody += `        /* exception frame depth: ${tryDepth} - propagate to outer handler */\n`;
        switchBody += `        __sm->__state = ${terminalState};\n`;
        switchBody += `        ${structName}__resume(__sm);\n`;
        switchBody += `        return;\n`;
        switchBody += `      }\n`;
      }
      
      switchBody += `      __async_schedule((void*)__sm, ${globalScheduleState});\n`;
      switchBody += `      return;\n`;
    }
    for (const entry of syntheticCatchStates) {
      const catchBlock = entry.handler.catchNode
        ? findFirstNonterminal(entry.handler.catchNode, 'block')
        : null;
      const catchStatements = catchBlock
        ? (catchBlock.children || []).filter((child) => child && child.kind === 'nonterminal' && child.name === 'statement')
        : [];
      switchBody += `    case ${entry.stateId}: { /* async catch handler */\n`;
      switchBody += `      __exc_clear();\n`;
      switchBody += `      const char* ${entry.handler.paramName} = (const char*)0;\n`;
      for (const statement of catchStatements) {
        const loweredCatchLines = lowerStatementNode(statement, compileContext, 3, { returnTypeCpp: machine.returnValueCppType });
        for (const line of loweredCatchLines) {
          switchBody += `${line}\n`;
        }
      }
      switchBody += `      __async_complete((void*)__sm);\n`;
      switchBody += `      __free((void*)__sm);\n`;
      switchBody += `      return;\n`;
      switchBody += `    }\n`;
    }
    switchBody += `    default:\n`;
    switchBody += `      __async_complete((void*)__sm);\n`;
    switchBody += `      __free((void*)__sm);\n`;
    switchBody += `      return;\n`;

    const paramList = machine.params.length === 0
      ? 'void'
      : machine.params.map((p) => `${p.cppType} ${p.name}`).join(', ');
    const paramAssignments = machine.params.map((p) => `  __sm->${p.name} = ${p.name};`);
    const paramLocals = machine.params.map((p) => `  ${p.cppType} ${p.name} = __sm->${p.name};`);
    const localFieldLines = localFields.length === 0
      ? ''
      : localFields.map((field) => `  ${field.cppType} ${field.fieldName};`).join('\n');
    const localFieldAssignments = localFields.map(
      (field) => `  __sm->${field.fieldName} = ${defaultCppValue(field.cppType)};`
    );

    if (compileContext) {
      compileContext.asyncStateLocalFields = previousAsyncStateFields;
      compileContext.asyncStateLocalFieldTypes = previousAsyncStateFieldTypes;
      compileContext.asyncStateDynamicHandleFields = previousAsyncStateDynamicHandleFields;
    }

    return [
      `/* async function ${machine.name} -> state machine */`,
      `/* host resume bridge symbol: ${machinePlan ? machinePlan.bridgeSymbol : `${structName}__resume_bridge`} */`,
      `struct ${structName} {`,
      `  int __state;`,
      `  ${machine.returnValueCppType} __result;`,
      paramFields,
      localFieldLines,
      `};`,
      ``,
      `static void ${structName}__resume(struct ${structName}* __sm) {`,
      paramLocals.join('\n'),
      `  switch (__sm->__state) {`,
      switchBody.trimRight(),
      `  }`,
      `}`,
      ``,
      `extern "C" void ${structName}__resume_bridge(void* __smv) {`,
      `  ${structName}__resume((struct ${structName}*)__smv);`,
      `}`,
      ``,
      `void ${machine.name}(${paramList}) {`,
      `  struct ${structName}* __sm = (struct ${structName}*)__malloc(sizeof(struct ${structName}));`,
      `  if (!__sm) { return; }`,
      `  __sm->__state = 0;`,
      `  __sm->__result = 0;`,
      paramAssignments.join('\n'),
      localFieldAssignments.join('\n'),
      `  ${structName}__resume(__sm);`,
      `}`
    ].join('\n');
  }).join('\n\n');
}

function emitAsyncSchedulerHookDeclsCpp(machines) {
  if (!machines || machines.length === 0) { return ''; }

  return [
    '/* async scheduler hooks (runtime-provided) */',
    'extern void __async_schedule(void* sm, int state_id);',
    'extern void __async_prepare_await(void* sm, int state_id);',
    'extern int __async_take_i32(void* sm);',
    'extern double __async_take_f64(void* sm);',
    'extern int __async_handle_get_i32(int handle, const char* key);',
    'extern double __async_handle_get_f64(int handle, const char* key);',
    'extern const char* __async_handle_get_string(int handle);',
    'extern int __async_handle_length(int handle);',
    'extern void __async_complete(void* sm);',
    'extern void* __malloc(unsigned long size);',
    'extern void __free(void* ptr);'
  ].join('\n');
}

function treeUsesExponentiationAssignment(tree) {
  let found = false;
  walk(tree, (node) => {
    if (found || !node || node.kind !== 'nonterminal' || node.name !== 'assignmentOperator') {
      return;
    }
    const operatorToken = (node.children || []).find((child) => child && child.kind === 'terminal');
    if (operatorToken && String(operatorToken.value || '').trim() === '**=') {
      found = true;
    }
  });
  return found;
}

function emitExponentiationAssignmentHelpersCpp(tree) {
  if (!treeUsesExponentiationAssignment(tree)) {
    return '';
  }

  return [
    'static int __maia_pow_i32(int base, int exponent) {',
    '  if (exponent < 0) {',
    '    return 0;',
    '  }',
    '  int result = 1;',
    '  int current = base;',
    '  int power = exponent;',
    '  while (power > 0) {',
    '    if ((power & 1) != 0) {',
    '      result *= current;',
    '    }',
    '    power >>= 1;',
    '    if (power > 0) {',
    '      current *= current;',
    '    }',
    '  }',
    '  return result;',
    '}'
  ].join('\n');
}

function treeUsesConsoleConcatHelper(tree, compileContext) {
  let found = false;
  const helperProbeContext = compileContext
    ? {
      ...compileContext,
      _preludeStatements: [],
      _consoleConcatTempCount: 0,
      _consoleValueTempCount: 0
    }
    : null;
  walk(tree, (node) => {
    if (found || !node || node.kind !== 'nonterminal' || node.name !== 'callExpression') {
      return;
    }
    const children = node.children || [];
    const memberExprNode = children.find((child) => child && child.kind === 'nonterminal' && child.name === 'memberExpression') || null;
    const argsNode = children.find((child) => child && child.kind === 'nonterminal' && child.name === 'arguments') || null;
    if (!memberExprNode || !argsNode) {
      return;
    }
    const pathSegments = extractPathFromMemberExpression(memberExprNode, null);
    if (!Array.isArray(pathSegments) || pathSegments.join('.') !== 'console.log') {
      return;
    }
    const argListNode = (argsNode.children || []).find((child) => child && child.kind === 'nonterminal' && child.name === 'argumentList') || null;
    const argExprs = argListNode ? collectArgumentExpressions(argListNode) : [];
    if (argExprs.length > 1) {
      found = true;
      return;
    }
    if (argExprs.length !== 1) {
      return;
    }
    if (tryLowerConsoleLogConcatExpression(argExprs[0], helperProbeContext) !== null) {
      found = true;
    }
  });
  return found;
}

function emitConsoleConcatHelpersCpp(tree, compileContext) {
  if (!treeUsesConsoleConcatHelper(tree, compileContext)) {
    return '';
  }

  return [
    'extern "C" int snprintf(char* buffer, unsigned long size, const char* format, ...);',
    'static char* __maia_console_next_buffer(void) {',
    '  char* buffer = new char[256];',
    '  buffer[0] = \'\\0\';',
    '  return buffer;',
    '}',
    'static const char* __maia_console_to_cstr_string(const void* value) {',
    '  const char* text = (const char*)value;',
    '  const char* safe_text = text;',
    '  if (!safe_text) { safe_text = ""; }',
    '  return safe_text;',
    '}',
    'static const char* __maia_console_to_cstr_bool(int value) {',
    '  const char* safe_text = "false";',
    '  if (value) { safe_text = "true"; }',
    '  return safe_text;',
    '}',
    'static const char* __maia_console_to_cstr_number(double value) {',
    '  char* buffer = __maia_console_next_buffer();',
    '  snprintf(buffer, 256, "%.17g", value);',
    '  return buffer;',
    '}',
    'static const char* __maia_console_to_cstr_ptr(const void* value) {',
    '  const char* safe_text = "[ptr]";',
    '  if (!value) { safe_text = "null"; }',
    '  return safe_text;',
    '}',
    'static const char* __maia_console_concat2(const void* left, const void* right) {',
    '  const char* left_text = (const char*)left;',
    '  const char* right_text = (const char*)right;',
    '  const char* safe_left_text = left_text;',
    '  const char* safe_right_text = right_text;',
    '  if (!safe_left_text) { safe_left_text = ""; }',
    '  if (!safe_right_text) { safe_right_text = ""; }',
    '  char* buffer = __maia_console_next_buffer();',
    '  int write_index = 0;',
    '  while (safe_left_text[write_index] && write_index < 255) {',
    '    buffer[write_index] = safe_left_text[write_index];',
    '    write_index += 1;',
    '  }',
    '  int right_index = 0;',
    '  while (safe_right_text[right_index] && write_index < 255) {',
    '    buffer[write_index] = safe_right_text[right_index];',
    '    write_index += 1;',
    '    right_index += 1;',
    '  }',
    '  buffer[write_index] = \'\\0\';',
    '  return buffer;',
    '}'
  ].join('\n');
}

  const signatures = profileStep('collectHostSignatures', () => collectHostSignatures(tree, compileContext));
  const hostConstructorSymbols = profileStep('collectHostConstructorSymbols', () => collectHostConstructorSymbols(tree, compileContext));
  const hostDeclMap = new Map();
  const getHostReturnType = (fn) => {
    if (fn === '__Object__getOwnPropertyDescriptors' || fn === '__Object__values' || fn === '__Object__entries' || fn === '__Reflect__ownKeys') {
      return 'void*';
    }
    if (fn === '__str__padStart' || fn === '__str__padEnd') {
      return 'const char*';
    }
    if (fn === '__new__Error') {
      return 'const char*';
    }
    if (fn === '__new__WeakMap') {
      return 'void*';
    }
    if (fn === '__Symbol') {
      return 'void*';
    }
    if (/__reduce(?:Right)?$/.test(fn)) {
      return 'double';
    }
    if (/__(map|filter|find)$/.test(fn)) {
      return 'void*';
    }
    if (/__(indexOf|lastIndexOf|findIndex)$/.test(fn)) {
      return 'int';
    }
    if (/__includes$/.test(fn)) {
      return 'int';
    }
    return 'void';
  };
  Array.from(signatures.entries())
    .forEach(([fn, argTypes]) => {
      if (fn === '__Reflect') {
        return;
      }
      if (/^___/.test(fn)) {
        hostDeclMap.set(fn, `extern void* ${fn}(void*, ...);`);
        return;
      }
      if (/__call$/.test(fn)) {
        hostDeclMap.set(fn, `extern void ${fn}(void*, ...);`);
        return;
      }
      if (/__forEach$/.test(fn)) {
        hostDeclMap.set(fn, `extern void ${fn}(void*, ...);`);
        return;
      }

      const cppArgs = argTypes.length === 0 ? 'void' : argTypes.map(cppArgType).join(', ');
      hostDeclMap.set(fn, `extern ${getHostReturnType(fn)} ${fn}(${cppArgs});`);
    });
  for (const ctorSymbol of hostConstructorSymbols) {
    if (!hostDeclMap.has(ctorSymbol)) {
      const ctorArgs = ctorSymbol === '__new__WeakMap'
        ? 'void'
        : (ctorSymbol === '__new__Error' ? 'const char*' : 'void');
      hostDeclMap.set(ctorSymbol, `extern ${getHostReturnType(ctorSymbol)} ${ctorSymbol}(${ctorArgs});`);
    }
  }
  const hostDecls = Array.from(hostDeclMap.values()).join('\n');

  const functionPrototypes = profileStep('emitTopLevelFunctionPrototypes', () => emitTopLevelFunctionPrototypes(tree, compileContext));
  const functionDefs = profileStep('emitTopLevelFunctionDefinitions', () => emitTopLevelFunctionDefinitions(tree, compileContext));
  const classDefs = profileStep('emitTopLevelClassDefinitions', () => emitTopLevelClassDefinitions(tree, compileContext));
  const sharedRuntimeFallbackHelpers = profileStep('emitSharedRuntimeFallbackHelpersCpp', () => emitSharedRuntimeFallbackHelpersCpp(tree, compileContext));
  const consoleConcatHelpers = profileStep('emitConsoleConcatHelpersCpp', () => emitConsoleConcatHelpersCpp(tree, compileContext));
  const exponentiationAssignmentHelpers = profileStep('emitExponentiationAssignmentHelpersCpp', () => emitExponentiationAssignmentHelpersCpp(tree));
  const objectLiteralDecls = profileStep('emitObjectLiteralRuntimeDeclsCpp', () => emitObjectLiteralRuntimeDeclsCpp(tree, compileContext));
  const objectLiteralFallback = profileStep('emitObjectLiteralRuntimeFallbackCpp', () => emitObjectLiteralRuntimeFallbackCpp(tree, compileContext));
  const arrayLiteralDecls = profileStep('emitArrayLiteralRuntimeDeclsCpp', () => emitArrayLiteralRuntimeDeclsCpp(tree));
  const arrayLiteralFallback = profileStep('emitArrayLiteralRuntimeFallbackCpp', () => emitArrayLiteralRuntimeFallbackCpp(tree));
  const lambdaDecls = profileStep('emitLambdaRuntimeDeclsCpp', () => emitLambdaRuntimeDeclsCpp(tree));
  const lambdaFallback = profileStep('emitLambdaRuntimeFallbackCpp', () => emitLambdaRuntimeFallbackCpp(tree));

  const asyncIr = profileStep('buildAsyncIR', () => buildAsyncIR(tree, {
    lowerAwaitOperand: (node) => lowerExpressionValue(node, compileContext)
  }));
  const asyncRuntimeBridgePlan = profileStep('buildAsyncRuntimeBridgePlan', () => buildAsyncRuntimeBridgePlan(asyncIr.asyncFunctions));
  const bridgePlanByFunctionName = new Map(
    asyncRuntimeBridgePlan.map((entry) => [entry.functionName, entry])
  );
  const asyncSchedulerHooks = profileStep('emitAsyncSchedulerHookDeclsCpp', () => emitAsyncSchedulerHookDeclsCpp(asyncIr.asyncFunctions));
  const asyncCpp = profileStep('emitAsyncStateMachinesCpp', () => emitAsyncStateMachinesCpp(asyncIr.asyncFunctions, bridgePlanByFunctionName, compileContext));

  const statements = profileStep('lowerProgramToCppStatements', () => lowerProgramToCppStatements(tree, compileContext, {
    includeFunctionDeclarations: false,
    includeClassDeclarations: false
  }));
  const body = statements.length > 0 ? statements.join('\n') : '';

  const generatedCpp = `${hostDecls}${hostDecls ? '\n\n' : ''}`
    + `${sharedRuntimeFallbackHelpers}${sharedRuntimeFallbackHelpers ? '\n\n' : ''}`
    + `${consoleConcatHelpers}${consoleConcatHelpers ? '\n\n' : ''}`
    + `${exponentiationAssignmentHelpers}${exponentiationAssignmentHelpers ? '\n\n' : ''}`
    + `${objectLiteralDecls}${objectLiteralDecls ? '\n\n' : ''}`
    + `${objectLiteralFallback}${objectLiteralFallback ? '\n\n' : ''}`
    + `${arrayLiteralDecls}${arrayLiteralDecls ? '\n\n' : ''}`
    + `${arrayLiteralFallback}${arrayLiteralFallback ? '\n\n' : ''}`
    + `${lambdaDecls}${lambdaDecls ? '\n\n' : ''}`
    + `${lambdaFallback}${lambdaFallback ? '\n\n' : ''}`
    + `${asyncSchedulerHooks}${asyncSchedulerHooks ? '\n\n' : ''}`
    + `${asyncCpp}${asyncCpp ? '\n\n' : ''}`
    + `${classDefs}${classDefs ? '\n\n' : ''}`
    + `${functionPrototypes}${functionPrototypes ? '\n\n' : ''}`
    + `${functionDefs}${functionDefs ? '\n\n' : ''}`
    + `int main() {\n`
    + `${body}\n`
    + `  return 0;\n`
    + `}\n`;

  return generatedCpp;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const inputPath = path.resolve(options.file);

  if (!fs.existsSync(inputPath)) {
    err(`input file not found: ${inputPath}`);
  }

  const source = profileStep('readSource', () => fs.readFileSync(inputPath, 'utf8'));
  const hostRegistry = new HostRegistry();
  const collector = new ParseTreeCollector();
  const parser = new Parser(source, collector);

  try {
    profileStep('parse', () => collector.parse(parser, source));
  } catch (e) {
    err(`parse failed: ${e.message}`);
  }

  const tree = collector.root;
  const compileContext = profileStep('buildCompileContext', () => buildCompileContext(tree, hostRegistry, options));
  const hostCalls = profileStep('extractHostCallsFromTree', () => extractHostCallsFromTree(tree, compileContext));

  if (!tree) {
    err('parser completed but parse tree collector has no root node');
  }

  if (options.astShow) {
    printTree(tree);
  }

  if (options.astXmlOut) {
    profileStep('writeAstXml', () => {
      ensureParentDir(options.astXmlOut);
      fs.writeFileSync(options.astXmlOut, collector.toXml({ includeDeclaration: true }));
    });
  }

  const astJson = profileStep('serializeAstJson', () => JSON.stringify(toJsonTree(tree), null, 2) + '\n');

  if (options.astJsonOut) {
    profileStep('writeAstJson', () => {
      ensureParentDir(options.astJsonOut);
      fs.writeFileSync(options.astJsonOut, astJson);
    });
  }

  if (options.irJsonOut) {
    const asyncIr = profileStep('ir.buildAsyncIR', () => buildAsyncIR(tree, {
      lowerAwaitOperand: (node) => lowerExpressionValue(node, compileContext)
    }));
    const resumeBridges = profileStep('ir.buildAsyncRuntimeBridgePlan', () => buildAsyncRuntimeBridgePlan(asyncIr.asyncFunctions));
    const ir = {
      version: 1,
      kind: 'placeholder-ir',
      source: inputPath,
      hostInterop: {
        strategy: compileContext.hostRegistry.strategy(),
        mappings: compileContext.hostRegistry.listMappings(),
        detectedCalls: hostCalls
      },
      asyncIR: asyncIr,
      asyncRuntime: {
        resumeBridges: resumeBridges
      },
      notes: [
        'Replace with semantic/lowering pipeline described in docs/ECMAScript_Compiler_Architecture.md'
      ]
    };
    profileStep('writeIrJson', () => {
      ensureParentDir(options.irJsonOut);
      fs.writeFileSync(options.irJsonOut, JSON.stringify(ir, null, 2) + '\n');
    });
  }

  if (options.cppOut) {
    profileStep('writeCpp', () => {
      ensureParentDir(options.cppOut);
      fs.writeFileSync(options.cppOut, generateCpp(inputPath, tree, hostCalls, compileContext));
    });
  }

  printLoweringWarnings(compileContext);
}

main();
