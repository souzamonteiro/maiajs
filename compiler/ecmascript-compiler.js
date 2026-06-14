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

function collectTopLevelFunctionDeclarations(tree) {
  return extractTopLevelStatementNodes(tree)
    .map(extractFunctionDeclarationFromStatement)
    .filter(Boolean);
}

function extractDirectFunctionExpressionInitializer(exprNode) {
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
    if (current.name === 'functionExpression') {
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

function collectTopLevelCallArgumentFunctionExpressionBindings(tree) {
  const bindings = [];

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

  return collectTopLevelFunctionExpressionBindings(tree)
    .filter(({ bindingName, functionExpressionNode }) => newTargets.has(bindingName) && nodeContainsThisReference(functionExpressionNode));
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
  if (!functionDeclarationNode || functionDeclarationNode.kind !== 'nonterminal' || functionDeclarationNode.name !== 'functionDeclaration') {
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

  for (const { bindingName } of collectTopLevelFunctionExpressionBindings(tree)) {
    names.add(bindingName);
  }

  return names;
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

function findNodePath(root, target) {
  const path = [];

  function visit(node, ancestors) {
    if (!node || typeof node !== 'object') {
      return false;
    }

    if (node === target) {
      path.push(...ancestors, node);
      return true;
    }

    if (!Array.isArray(node.children)) {
      return false;
    }

    for (const child of node.children) {
      if (visit(child, [...ancestors, node])) {
        return true;
      }
    }

    return false;
  }

  visit(root, []);
  return path;
}

function nodeContainsTarget(root, target) {
  if (!root || !target) {
    return false;
  }

  let found = false;
  walk(root, (node) => {
    if (!found && node === target) {
      found = true;
    }
  });
  return found;
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
  const topLevelAssignedFunctionExpressionBindings = collectTopLevelAssignedFunctionExpressionBindings(tree);
  const topLevelObjectLiteralFunctionExpressionBindings = collectTopLevelObjectLiteralFunctionExpressionBindings(tree);
  const topLevelCallArgumentFunctionExpressionBindings = collectTopLevelCallArgumentFunctionExpressionBindings(tree);
  const hasLambdaCapturePayload = [
    ...Array.from(lambdaStats.syncSignatures.values()),
    ...Array.from(lambdaStats.asyncSignatures.values())
  ].some((signature) => signature.captureCount > 0);

  const options = arguments.length > 2 && arguments[2] ? arguments[2] : {};

  return {
    tree,
    hostRegistry,
    strictLowering: Boolean(options.strictLowering),
    loweringWarnings: [],
    loweringWarningKeys: new Set(),
    localFunctionNames: collectTopLevelFunctionNames(tree),
    topLevelBindingNames: collectTopLevelBindingNames(tree),
    topLevelClassNames: collectTopLevelClassNames(tree),
    topLevelClassHeritageMap: collectTopLevelClassHeritageMap(tree),
    topLevelLambdaBindingInfo: collectTopLevelLambdaBindingInfo(tree),
    topLevelAssignedFunctionExpressionSymbols: new Map(
      topLevelAssignedFunctionExpressionBindings.map((binding) => [binding.lhs, binding.symbolName])
    ),
    inlineFunctionExpressionSymbols: new Map([
      ...topLevelObjectLiteralFunctionExpressionBindings.map((binding) => [binding.functionExpressionNode, binding.symbolName]),
      ...topLevelCallArgumentFunctionExpressionBindings.map((binding) => [binding.functionExpressionNode, binding.symbolName])
    ]),
    hasLambdaCapturePayload,
    functionReturnTypes
  };
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

  const path = findNodePath(compileContext.tree, node);
  if (path.length === 0) {
    return null;
  }

  for (let i = path.length - 2; i >= 0; i -= 1) {
    const ancestor = path[i];
    if (!ancestor || ancestor.kind !== 'nonterminal') {
      continue;
    }

    if (ancestor.name === 'functionBody' || ancestor.name === 'asyncFunctionBody' || ancestor.name === 'block') {
      for (const statementNode of extractStatementsFromScopeContainer(ancestor)) {
        if (nodeContainsTarget(statementNode, node)) {
          break;
        }

        const declarationNode = (statementNode.children || []).find(
          (child) => child
            && child.kind === 'nonterminal'
            && (child.name === 'variableStatement' || child.name === 'letDeclaration' || child.name === 'constDeclaration')
        );
        if (!declarationNode) {
          continue;
        }

        for (const variableDeclaration of extractVariableDeclarations((declarationNode.children || []).find(
          (child) => child && child.kind === 'nonterminal' && child.name === 'variableDeclarationList'
        ))) {
          if (extractVariableDeclarationName(variableDeclaration) !== name) {
            continue;
          }
          const initializerExpr = extractVariableDeclarationInitializer(variableDeclaration);
          const newClassInfo = extractDirectNewClassInfo(initializerExpr, compileContext);
          if (newClassInfo) {
            return newClassInfo.className;
          }
        }
      }
    }
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

function extractCallableParameterArities(functionNode) {
  const arities = new Map();
  const parameterNames = new Set(extractFunctionParameterNames(functionNode));
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

function buildCppParamsFromFunctionNode(functionNode) {
  const params = extractFunctionParameterNames(functionNode);
  if (params.length === 0) {
    return 'void';
  }

  const callableArities = extractCallableParameterArities(functionNode);
  return params.map((name) => {
    if (callableArities.has(name)) {
      const arity = callableArities.get(name);
      const fnParams = arity === 0
        ? 'void'
        : Array.from({ length: arity }, () => 'int').join(', ');
      return `int (*${name})(${fnParams})`;
    }
    return `int ${name}`;
  }).join(', ');
}

function extractHostCallsFromTree(tree, compileContext) {
  const hostCalls = [];
  let callIndex = 0;

  walk(tree, (node) => {
    if (node.kind !== 'nonterminal' || node.name !== 'callExpression') {
      return;
    }

    const children = Array.isArray(node.children) ? node.children : [];
    const memberExpressionNode = children.find((child) => child && child.kind === 'nonterminal' && child.name === 'memberExpression');
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
    return 'nullptr';
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
    return 'nullptr';
  }

  return identifierValue;
}

function inferExprType(node, compileContext = null) {
  if (!node || node.kind !== 'nonterminal') { return 'any'; }
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
    const loweredKinds = (node.children || []).filter((child) => child && child.kind === 'nonterminal');
    const childTypes = loweredKinds.map((child) => inferExprType(child, compileContext));
    if (childTypes.some((type) => type === 'string')) {
      return 'string';
    }
    if (childTypes.every((type) => type === 'number' || type === 'bool')) {
      return 'number';
    }
  }
  if (EXPR_PASSTHROUGH_NODES.has(node.name)) {
    const ntc = (node.children || []).filter((c) => c.kind === 'nonterminal');
    return ntc.length === 1 ? inferExprType(ntc[0], compileContext) : 'any';
  }
  if (node.name === 'callExpression') {
    const children = node.children || [];
    const memberExprNode = children.find((child) => child && child.kind === 'nonterminal' && child.name === 'memberExpression');
    const pathSegments = memberExprNode ? extractPathFromMemberExpression(memberExprNode) : null;
    if (Array.isArray(pathSegments) && pathSegments.length === 1 && compileContext) {
      const calleeName = pathSegments[0];
      const returnTypeCpp = compileContext.functionReturnTypes && compileContext.functionReturnTypes.get(calleeName);
      if (returnTypeCpp === 'const char*') { return 'string'; }
      if (returnTypeCpp === 'double' || returnTypeCpp === 'int') { return 'number'; }
      if (returnTypeCpp === 'void*') { return 'object'; }
      if (isIdentifierBoundAtNode(calleeName, node, compileContext)) { return 'number'; }
    }

    if (Array.isArray(pathSegments) && pathSegments.length >= 2 && compileContext && isIdentifierBoundAtNode(pathSegments[0], node, compileContext)) {
      return 'number';
    }
  }
  if (node.name === 'primaryExpression') {
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

  const inferredType = initializerExpr ? inferExprType(initializerExpr, compileContext) : 'any';
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
  return 'nullptr';
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
  let found = null;
  walk(node, (candidate) => {
    if (found || !candidate || candidate.kind !== 'terminal') {
      return;
    }
    if (candidate.token === tokenName) {
      found = candidate;
    }
  });
  return found;
}

function hasNonterminal(node, nonterminalName) {
  let matched = false;
  walk(node, (candidate) => {
    if (matched || !candidate || candidate.kind !== 'nonterminal') {
      return;
    }
    if (candidate.name === nonterminalName) {
      matched = true;
    }
  });
  return matched;
}

function findFirstNonterminal(node, nonterminalName) {
  let found = null;
  walk(node, (candidate) => {
    if (found || !candidate || candidate.kind !== 'nonterminal') {
      return;
    }
    if (candidate.name === nonterminalName) {
      found = candidate;
    }
  });
  return found;
}

function inferReturnExpressionCppType(expressionNode, returnTypeMap = new Map()) {
  if (!expressionNode || expressionNode.kind !== 'nonterminal') {
    return 'int';
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
      ? (callExpressionNode.children || []).find(
          (child) => child && child.kind === 'nonterminal' && child.name === 'memberExpression'
        )
      : null;
    const pathSegments = memberExpressionNode ? extractPathFromMemberExpression(memberExpressionNode) : null;

    if (Array.isArray(pathSegments) && pathSegments.length === 1) {
      const calleeName = pathSegments[0];
      const calleeReturnType = returnTypeMap.get(calleeName);
      if (calleeReturnType) {
        return calleeReturnType;
      }
    }

    return 'int';
  }

  if (hasNonterminal(expressionNode, 'identifier')) {
    return 'int';
  }

  return 'int';
}

function inferFunctionReturnCppType(functionDeclarationNode, returnTypeMap = new Map()) {
  const statementNodes = collectFunctionBodyStatementNodes(functionDeclarationNode);
  const returnExprNodes = [];

  for (const statementNode of statementNodes) {
    collectReturnExpressionNodesFromStatement(statementNode, returnExprNodes);
  }

  const returnCppTypes = returnExprNodes.map((expr) => inferReturnExpressionCppType(expr, returnTypeMap));
  return mergeReturnCppTypes(returnCppTypes);
}

function inferTopLevelFunctionReturnTypes(tree) {
  const declarations = collectTopLevelFunctionDeclarations(tree);
  const functionExpressionBindings = collectTopLevelFunctionExpressionBindings(tree);
  const assignedFunctionExpressionBindings = collectTopLevelAssignedFunctionExpressionBindings(tree);
  const objectLiteralFunctionExpressionBindings = collectTopLevelObjectLiteralFunctionExpressionBindings(tree);
  const callArgumentFunctionExpressionBindings = collectTopLevelCallArgumentFunctionExpressionBindings(tree);
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

  for (const { symbolName } of assignedFunctionExpressionBindings) {
    returnTypes.set(symbolName, 'int');
  }

  for (const { symbolName } of objectLiteralFunctionExpressionBindings) {
    returnTypes.set(symbolName, 'int');
  }

  for (const { symbolName } of callArgumentFunctionExpressionBindings) {
    returnTypes.set(symbolName, 'int');
  }

  for (let i = 0; i < declarations.length + functionExpressionBindings.length + assignedFunctionExpressionBindings.length + objectLiteralFunctionExpressionBindings.length + callArgumentFunctionExpressionBindings.length + 1; i += 1) {
    let changed = false;

    for (const functionDeclaration of declarations) {
      const functionName = extractFunctionDeclarationName(functionDeclaration);
      if (!functionName) {
        continue;
      }

      const inferredType = inferFunctionReturnCppType(functionDeclaration, returnTypes);
      if (returnTypes.get(functionName) !== inferredType) {
        returnTypes.set(functionName, inferredType);
        changed = true;
      }
    }

    for (const { bindingName, functionExpressionNode } of functionExpressionBindings) {
      const inferredType = inferFunctionReturnCppType(functionExpressionNode, returnTypes);
      if (returnTypes.get(bindingName) !== inferredType) {
        returnTypes.set(bindingName, inferredType);
        changed = true;
      }
    }

    for (const { symbolName, functionExpressionNode } of assignedFunctionExpressionBindings) {
      const inferredType = inferFunctionReturnCppType(functionExpressionNode, returnTypes);
      if (returnTypes.get(symbolName) !== inferredType) {
        returnTypes.set(symbolName, inferredType);
        changed = true;
      }
    }

    for (const { symbolName, functionExpressionNode } of objectLiteralFunctionExpressionBindings) {
      const inferredType = inferFunctionReturnCppType(functionExpressionNode, returnTypes);
      if (returnTypes.get(symbolName) !== inferredType) {
        returnTypes.set(symbolName, inferredType);
        changed = true;
      }
    }

    for (const { symbolName, functionExpressionNode } of callArgumentFunctionExpressionBindings) {
      const inferredType = inferFunctionReturnCppType(functionExpressionNode, returnTypes);
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
    if (current.name === 'literal' || current.name === 'additiveExpression') {
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
  if (!normalized || normalized.length < 2) {
    return '';
  }

  return normalized.slice(1, -1);
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
  const lowered = lowerExpressionValue(expressionNode, compileContext);
  if (lowered !== null && /^"(?:[^"\\]|\\.)*"$/.test(lowered)) {
    return lowered;
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
  const nonterminalChildren = children.filter((child) => child && child.kind === 'nonterminal');

  if (!hasTernary) {
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
  if (children.length < 3) {
    const startsWithNew = children[0]
      && children[0].kind === 'terminal'
      && children[0].token === 'TOKEN_new';
    if (startsWithNew) {
      reportUnsupportedLowering(
        compileContext,
        'new-expression-unlowerable',
        'new expression is missing constructor/member/arguments structure'
      );
      if (compileContext && compileContext.strictLowering) {
        err('unsupported lowering: malformed new expression structure');
      }
    }
    return null;
  }

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
    const startsWithNew = children[0]
      && children[0].kind === 'terminal'
      && children[0].token === 'TOKEN_new';
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

  const ctorPath = extractPathFromMemberExpression(children[1], compileContext);
  const ctorBase = Array.isArray(ctorPath) && ctorPath.length > 0
    ? ctorPath.join('__')
    : findFirstIdentifierValue(children[1]);

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

  const args = lowerArgumentsNode(children[2], compileContext);
  if (compileContext && compileContext.topLevelClassNames && compileContext.topLevelClassNames.has(ctorBase)) {
    return `new ${ctorBase}(${args})`;
  }
  return `__new__${ctorBase}(${args})`;
}

function extractObjectLiteralProperties(objectLiteralNode) {
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
      (candidate) => candidate && candidate.kind === 'nonterminal' && candidate.name === 'assignmentExpression'
    ) || null;
    if (!valueExprNode) {
      valueExprNode = findFirstNonterminal(child, 'assignmentExpression');
    }
    if (!propertyNameNode || !valueExprNode) {
      continue;
    }

    const key = findFirstIdentifierValue(propertyNameNode);
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

  const properties = extractObjectLiteralProperties(objectLiteralNode);
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
      const keyLiteral = JSON.stringify(property.key);
      const loweredValue = lowerRequiredExpressionValue(
        property.valueExprNode,
        compileContext,
        'object-literal-value-unlowerable',
        `object literal property '${property.key}' value expression`
      );
      chain = `__maia_obj_builder_set_key(${chain}, ${keyLiteral}, (int)(${loweredValue}))`;
    }
    return `__maia_obj_builder_end(${chain})`;
  }

  const args = [];
  for (const property of properties) {
    const keyLiteral = JSON.stringify(property.key);
    const loweredValue = lowerRequiredExpressionValue(
      property.valueExprNode,
      compileContext,
      'object-literal-value-unlowerable',
      `object literal property '${property.key}' value expression`
    );
    args.push(`${keyLiteral}, (int)(${loweredValue})`);
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

    const loweredValue = operation.valueExprNode
      ? lowerRequiredExpressionValue(
        operation.valueExprNode,
        compileContext,
        'array-element-unlowerable',
        'array element expression'
      )
      : '0';
    chain = `__maia_arr_builder_push_value(${chain}, (int)(${loweredValue}))`;
  }

  return `__maia_arr_builder_end(${chain})`;
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

  if (!arrayInfo.hasSpread && !arrayInfo.hasElision && elements.length === 0) {
    return '__maia_arr_literal0()';
  }

  if (!arrayInfo.hasSpread && !arrayInfo.hasElision && elements.length <= 4) {
    const args = elements.map((element) => {
      const lowered = lowerRequiredExpressionValue(
        element,
        compileContext,
        'array-element-unlowerable',
        'array literal element expression'
      );
      return `(int)(${lowered})`;
    });

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
      (child) => child && child.kind === 'nonterminal' && child.name === 'identifier'
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
    if (child.name === 'nullLiteral') { return 'nullptr'; }
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
  return identifier || null;
}

function lowerAssignmentExpressionValue(node, compileContext) {
  if (!node || node.kind !== 'nonterminal' || node.name !== 'assignmentExpression') {
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
  if (children.length === 3
      && children[0].kind === 'nonterminal'
      && children[0].name === 'leftHandSideExpression'
      && children[1].kind === 'nonterminal'
      && children[1].name === 'assignmentOperator'
      && children[2].kind === 'nonterminal'
      && children[2].name === 'assignmentExpression') {
    const lhs = lowerIdentifierFromLeftHandSideExpression(children[0], compileContext);
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

    const operatorToken = (children[1].children || []).find((child) => child.kind === 'terminal');
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

    const assignedFunctionSymbol = compileContext
      && compileContext.topLevelAssignedFunctionExpressionSymbols
      ? compileContext.topLevelAssignedFunctionExpressionSymbols.get(lhs)
      : null;
    const rhs = assignedFunctionSymbol || lowerExpressionValue(children[2], compileContext);

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
    return `${lhs} ${operatorValue} ${rhsValue}`;
  }

  const nonterminalChildren = children.filter((child) => child.kind === 'nonterminal');
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

  const nonterminalChildren = children.filter((child) => child.kind === 'nonterminal');
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
  if (children.length === 2
      && children[0].kind === 'terminal'
      && (children[0].token === 'TOKEN__21_' || children[0].token === 'TOKEN__2D_' || children[0].token === 'TOKEN__2B_' || children[0].token === 'TOKEN__7E_')
      && children[1].kind === 'nonterminal') {
    const operand = lowerExpressionValue(children[1], compileContext);
    if (operand === null) {
      reportUnsupportedLowering(
        compileContext,
        'unary-expression-unlowerable',
        `unary expression operand could not be lowered for '${children[0].value}'`
      );
      if (compileContext && compileContext.strictLowering) {
        err(`unsupported lowering: unary expression operand '${children[0].value}'`);
      }
      return null;
    }
    if (children[0].token === 'TOKEN__21_') {
      return `!((int)(${operand}))`;
    }
    return `${children[0].value}(${operand})`;
  }

  if (children.length === 2
      && children[0].kind === 'terminal'
      && (children[0].token === 'TOKEN__2B__2B_' || children[0].token === 'TOKEN__2D__2D_')
      && children[1].kind === 'nonterminal'
      && children[1].name === 'unaryExpression') {
    let postfixNode = (children[1].children || []).find(
      (child) => child.kind === 'nonterminal' && child.name === 'postfixExpression'
    ) || null;
    if (!postfixNode) {
      postfixNode = findFirstNonterminal(children[1], 'postfixExpression');
    }
    if (!postfixNode) {
      reportUnsupportedLowering(
        compileContext,
        'unary-expression-unlowerable',
        `prefix update expression is missing postfix target for '${children[0].value}'`
      );
      if (compileContext && compileContext.strictLowering) {
        err(`unsupported lowering: prefix update expression '${children[0].value}'`);
      }
      return null;
    }

    let lhsNode = (postfixNode.children || []).find(
      (child) => child.kind === 'nonterminal' && child.name === 'leftHandSideExpression'
    ) || null;
    if (!lhsNode) {
      lhsNode = findFirstNonterminal(postfixNode, 'leftHandSideExpression');
    }
    const target = lowerIdentifierFromLeftHandSideExpression(lhsNode, compileContext);
    if (!target) {
      reportUnsupportedLowering(
        compileContext,
        'unary-expression-unlowerable',
        `prefix update target could not be lowered for '${children[0].value}'`
      );
      if (compileContext && compileContext.strictLowering) {
        err(`unsupported lowering: prefix update target '${children[0].value}'`);
      }
      return null;
    }

    return `${children[0].value}${target}`;
  }

  const nonterminalChildren = children.filter((child) => child.kind === 'nonterminal');
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
    const nonterminalChildren = (node.children || []).filter((child) => child && child.kind === 'nonterminal');
    if (nonterminalChildren.length === 2) {
      const lhs = lowerExpressionValue(nonterminalChildren[0], compileContext);
      const rhsClassName = findFirstIdentifierValue(nonterminalChildren[1]);
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

  const parts = [];
  for (const child of (node.children || [])) {
    if (!child) {
      continue;
    }

    if (child.kind === 'nonterminal') {
      const lowered = lowerExpressionValue(child, compileContext);
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

  const hasIntOnlyOperator = parts.some((part, index) => index % 2 === 1 && INT_ONLY_INFIX_OPERATORS.has(part));
  if (hasIntOnlyOperator) {
    for (let i = 0; i < parts.length; i += 2) {
      parts[i] = `(int)(${parts[i]})`;
    }
  }

  return parts.join(' ');
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
  if (node.name === 'assignmentExpression') { return lowerAssignmentExpressionValue(node, compileContext); }
  if (node.name === 'conditionalExpression' || node.name === 'conditionalExpressionNoIn') { return lowerConditionalExpressionValue(node, compileContext); }
  if (node.name === 'unaryExpression') { return lowerUnaryExpressionValue(node, compileContext); }
  if (node.name === 'postfixExpression') { return lowerPostfixExpressionValue(node, compileContext); }
  if (INFIX_EXPRESSION_NODES.has(node.name)) { return lowerInfixExpressionValue(node, compileContext); }
  if (node.name === 'memberExpression') {
    const loweredNewCall = lowerMemberExpressionNewCallValue(node, compileContext);
    if (loweredNewCall !== null) {
      return loweredNewCall;
    }

    const segments = extractPathFromMemberExpression(node, compileContext);
    if (segments && segments.length >= 2) {
      // Use -> for this and . for local stack-instantiated class objects.
      let result = segments[0];
      for (let i = 1; i < segments.length; i++) {
        const usePointerAccess = i === 1 && segments[0] === 'this';
        result += usePointerAccess ? '->' + segments[i] : '.' + segments[i];
      }
      return result;
    }

    const ntc = (node.children || []).filter((c) => c && c.kind === 'nonterminal');
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
    const ntc = (node.children || []).filter((c) => c.kind === 'nonterminal');
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
      if (child.kind === 'terminal' && child.token === 'TOKEN_null') { return 'nullptr'; }
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
  return null;
}

function collectObjectLiteralArities(tree) {
  const simpleArities = new Set();
  let requiresBuilderHooks = false;

  walk(tree, (node) => {
    if (!node || node.kind !== 'nonterminal' || node.name !== 'objectLiteral') {
      return;
    }

    const properties = extractObjectLiteralProperties(node);
    if (properties.length > 4) {
      requiresBuilderHooks = true;
    } else {
      simpleArities.add(properties.length);
    }
  });

  return { simpleArities, requiresBuilderHooks };
}

function emitObjectLiteralRuntimeDeclsCpp(tree) {
  const { simpleArities, requiresBuilderHooks } = collectObjectLiteralArities(tree);
  const requiresCtorObjectSeed = collectTopLevelConstructorFunctionExpressionBindings(tree).length > 0;
  if (simpleArities.size === 0 && !requiresBuilderHooks && !requiresCtorObjectSeed) {
    return '';
  }

  const decls = ['/* object literal runtime hooks (runtime-provided) */'];

  if (simpleArities.size > 0) {
    const maxArity = Math.max(...Array.from(simpleArities.values()));
    for (let arity = 0; arity <= maxArity; arity += 1) {
      if (arity === 0) {
        decls.push('extern void* __maia_obj_literal0(void);');
        continue;
      }
      const params = [];
      for (let i = 1; i <= arity; i += 1) {
        params.push(`const char* k${i}`);
        params.push(`int v${i}`);
      }
      decls.push(`extern void* __maia_obj_literal${arity}(${params.join(', ')});`);
    }
  } else {
    decls.push('extern void* __maia_obj_literal0(void);');
  }

  if (requiresBuilderHooks) {
    decls.push('extern void* __maia_obj_builder_begin(void);');
    decls.push('extern void* __maia_obj_builder_set_key(void* builder, const char* key, int value);');
    decls.push('extern void* __maia_obj_builder_end(void* builder);');
  }

  return decls.join('\n');
}

function emitSharedRuntimeFallbackHelpersCpp(tree) {
  const objArities = collectObjectLiteralArities(tree);
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
    '/* shared local runtime helpers for literal/lambda fallbacks */',
    '#ifndef MAIA_RUNTIME_LOCAL_HELPERS_DEFINED',
    '#define MAIA_RUNTIME_LOCAL_HELPERS_DEFINED 1',
    'struct __maia_runtime_value {',
    '  int tag;',
    '  int a;',
    '  int b;',
    '  int c;',
    '};',
    'static void* __maia_runtime_alloc_value(int tag, int a, int b, int c) {',
    '  __maia_runtime_value* v = new __maia_runtime_value();',
    '  v->tag = tag;',
    '  v->a = a;',
    '  v->b = b;',
    '  v->c = c;',
    '  return (void*)v;',
    '}',
    ...(hasLambdaCapturePayload ? [
      '/* lambda closure/env fallback contract (local MVP)',
      ' * - function_id is deterministic per lowered lambda hook signature.',
      ' * - capture_count is the canonical total capture count via env/value API.',
      ' * - __maia_runtime_lambda_get_capture_at returns capture value by index or 0 if out-of-range.',
      ' * - mirror fields (capture1..capture4, extra_*) are legacy-only compatibility projections; env-backed accessors are canonical.',
      ' */',
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
      'static void* __maia_runtime_alloc_lambda_env(int capture_count, int c1, int c2, int c3, int c4, int extra_capture_count, const int* extra_captures) {',
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
      '  switch (function_id) {',
      ...lambdaDispatchCases.flatMap((dispatchCase) => [
        `    case ${dispatchCase.functionId}:`,
        dispatchCase.captureCount > 4
          ? `      return (__maia_runtime_lambda_get_arity(lambda_value) * 10) + ${dispatchCase.functionId % 10} + 40 + ${dispatchCase.arity > 1 ? 200 : 100} + (__maia_runtime_lambda_get_capture_count(lambda_value) * 1000);`
          : `      return (__maia_runtime_lambda_get_arity(lambda_value) * 10) + ${dispatchCase.functionId % 10} + ${dispatchCase.captureCount > 1 ? 20 : 10} + ${dispatchCase.arity > 1 ? 200 : 100} + (__maia_runtime_lambda_get_capture_count(lambda_value) * 1000);`
      ]),
      '    default:',
      '      return 0;',
      '  }',
      '}',
      'static int __maia_runtime_lambda_known_case_polarity(int function_id) {',
      '  switch (function_id) {',
      ...lambdaDispatchCases.flatMap((dispatchCase) => [
        `    case ${dispatchCase.functionId}:`,
        `      return ${dispatchCase.isAsync ? '-1' : '1'};`
      ]),
      '    default:',
      '      return 0;',
      '  }',
      '}',
      'static int __maia_runtime_lambda_known_case_weighted_capture_value(void* lambda_value, int function_id) {',
      '  switch (function_id) {',
      ...lambdaDispatchCases.flatMap((dispatchCase) => [
        `    case ${dispatchCase.functionId}:`,
        dispatchCase.captureCount > 4
          ? '      return (__maia_runtime_lambda_get_capture_at(lambda_value, 0) * 1) + (__maia_runtime_lambda_get_capture_at(lambda_value, 1) * 2) + (__maia_runtime_lambda_get_capture_at(lambda_value, 2) * 3) + (__maia_runtime_lambda_get_capture_at(lambda_value, 3) * 4) + __maia_runtime_lambda_get_capture_at(lambda_value, 4);'
          : '      return (__maia_runtime_lambda_get_capture_at(lambda_value, 0) * 1) + (__maia_runtime_lambda_get_capture_at(lambda_value, 1) * 2) + (__maia_runtime_lambda_get_capture_at(lambda_value, 2) * 3) + (__maia_runtime_lambda_get_capture_at(lambda_value, 3) * 4);'
      ]),
      '    default:',
      '      return 0;',
      '  }',
      '}',
      'static int __maia_runtime_lambda_known_case_matches_function_id(void* lambda_value, int function_id) {',
      '  switch (function_id) {',
      ...lambdaDispatchCases.flatMap((dispatchCase) => [
        `    case ${dispatchCase.functionId}:`,
        `      if (__maia_runtime_lambda_get_arity(lambda_value) != ${dispatchCase.arity}) { return 0; }`,
        `      if (__maia_runtime_lambda_get_is_async(lambda_value) != ${dispatchCase.isAsync}) { return 0; }`,
        '      return 1;'
      ]),
      '    default:',
      '      return 0;',
      '  }',
      '}',
      'static int __maia_runtime_lambda_has_known_case(int function_id) {',
      '  switch (function_id) {',
      ...lambdaDispatchCases.flatMap((dispatchCase) => [
        `    case ${dispatchCase.functionId}:`,
        '      return 1;'
      ]),
      '    default:',
      '      return 0;',
      '  }',
      '}',
      'static int __maia_runtime_lambda_invoke_known_case(void* lambda_value, int function_id, int argc) {',
      '  if (!__maia_runtime_lambda_has_known_case(function_id)) { return 0; }',
      '  int known_case_token = __maia_runtime_lambda_known_case_token(lambda_value, function_id);',
      '  if (!known_case_token) { return 0; }',
      '  int known_case_polarity = __maia_runtime_lambda_known_case_polarity(function_id);',
      '  if (!known_case_polarity) { return 0; }',
      '  int weighted_capture_value = __maia_runtime_lambda_known_case_weighted_capture_value(lambda_value, function_id);',
      '  if (!__maia_runtime_lambda_known_case_matches_function_id(lambda_value, function_id)) { return 0; }',
      '  return known_case_polarity * (weighted_capture_value + argc + known_case_token);',
      '}',
      'static int __maia_runtime_lambda_invoke_function_id(void* lambda_value, int argc, int async_call) {',
      '  if (!__maia_runtime_lambda_can_invoke(lambda_value, argc, async_call)) { return 0; }',
      '  int function_id = __maia_runtime_lambda_select_function_id(lambda_value, argc, async_call);',
      '  if (!function_id) { return 0; }',
      '  return __maia_runtime_lambda_invoke_known_case(lambda_value, function_id, argc);',
      '}',
      'static void* __maia_runtime_alloc_lambda_value(int function_id, int arity, int is_async, int capture_count, int c1, int c2, int c3, int c4, int extra_capture_count, const int* extra_captures) {',
      '  __maia_runtime_lambda_value* fn = new __maia_runtime_lambda_value();',
      '  __maia_runtime_lambda_env* env = (__maia_runtime_lambda_env*)__maia_runtime_alloc_lambda_env(capture_count, c1, c2, c3, c4, extra_capture_count, extra_captures);',
      '  fn->function_id = function_id;',
      '  fn->arity = arity;',
      '  fn->is_async = is_async;',
      '  fn->env = (void*)env;',
      '  fn->capture_count = __maia_runtime_lambda_get_capture_count((void*)fn);',
      '  fn->truncated_captures = env ? env->truncated_captures : 0;',
      '  /* legacy-only mirror projection seed from constructor arguments */',
      '  fn->capture1 = c1;',
      '  fn->capture2 = c2;',
      '  fn->capture3 = c3;',
      '  fn->capture4 = c4;',
      '  fn->extra_capture_count = env ? env->extra_capture_count : extra_capture_count;',
      '  fn->extra_captures = env ? env->extra_captures : 0;',
      '  /* legacy-only mirror projection from canonical runtime capture API */',
      '  fn->capture1 = __maia_runtime_lambda_get_capture_at((void*)fn, 0);',
      '  fn->capture2 = __maia_runtime_lambda_get_capture_at((void*)fn, 1);',
      '  fn->capture3 = __maia_runtime_lambda_get_capture_at((void*)fn, 2);',
      '  fn->capture4 = __maia_runtime_lambda_get_capture_at((void*)fn, 3);',
      '  return (void*)fn;',
      '}'
    ] : []),
    '#endif'
  ].join('\n');
}

function emitObjectLiteralRuntimeFallbackCpp(tree) {
  const { simpleArities, requiresBuilderHooks } = collectObjectLiteralArities(tree);
  const requiresCtorObjectSeed = collectTopLevelConstructorFunctionExpressionBindings(tree).length > 0;
  if (simpleArities.size === 0 && !requiresBuilderHooks && !requiresCtorObjectSeed) {
    return '';
  }

  const maxArity = simpleArities.size > 0 ? Math.max(...Array.from(simpleArities.values())) : 0;
  const lines = [
    '/* local fallback runtime for object literal hooks */',
    '#ifndef MAIA_RUNTIME_PROVIDES_OBJECT_HOOKS'
  ];

  lines.push('void* __maia_obj_literal0(void) {');
  lines.push('  return __maia_runtime_alloc_value(1, 0, 0, 0);');
  lines.push('}');

  for (let arity = 1; arity <= maxArity; arity += 1) {
    const params = [];
    for (let i = 1; i <= arity; i += 1) {
      params.push(`const char* k${i}`);
      params.push(`int v${i}`);
    }
    lines.push(`void* __maia_obj_literal${arity}(${params.join(', ')}) {`);
    for (let i = 1; i <= arity; i += 1) {
      lines.push(`  (void)k${i};`);
      lines.push(`  (void)v${i};`);
    }
    lines.push(`  return __maia_runtime_alloc_value(1, ${arity}, 0, 0);`);
    lines.push('}');
  }

  if (requiresBuilderHooks) {
    lines.push('void* __maia_obj_builder_begin(void) {');
    lines.push('  return __maia_runtime_alloc_value(5, 0, 0, 0);');
    lines.push('}');
    lines.push('void* __maia_obj_builder_set_key(void* builder, const char* key, int value) {');
    lines.push('  (void)key;');
    lines.push('  (void)value;');
    lines.push('  __maia_runtime_value* b = (__maia_runtime_value*)builder;');
    lines.push('  if (!b) { return builder; }');
    lines.push('  b->a += 1;');
    lines.push('  return builder;');
    lines.push('}');
    lines.push('void* __maia_obj_builder_end(void* builder) {');
    lines.push('  __maia_runtime_value* b = (__maia_runtime_value*)builder;');
    lines.push('  if (!b) { return __maia_obj_literal0(); }');
    lines.push('  void* obj = __maia_runtime_alloc_value(1, b->a, 0, 0);');
    lines.push('  delete b;');
    lines.push('  return obj;');
    lines.push('}');
  }

  lines.push('#endif');
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
  const decls = ['/* array literal runtime hooks (runtime-provided) */'];

  if (maxArity >= 0) {
    for (let arity = 0; arity <= maxArity; arity += 1) {
      if (arity === 0) {
        decls.push('extern void* __maia_arr_literal0(void);');
        continue;
      }

      const params = [];
      for (let i = 1; i <= arity; i += 1) {
        params.push(`int v${i}`);
      }
      decls.push(`extern void* __maia_arr_literal${arity}(${params.join(', ')});`);
    }
  }

  if (stats.requiresBuilderHooks) {
    decls.push('extern void* __maia_arr_builder_begin(void);');
    decls.push('extern void* __maia_arr_builder_push_value(void* builder, int value);');
    decls.push('extern void* __maia_arr_builder_push_hole(void* builder);');
    decls.push('extern void* __maia_arr_builder_spread(void* builder, void* source_array);');
    decls.push('extern void* __maia_arr_builder_end(void* builder);');
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
  const lines = [
    '/* local fallback runtime for array literal hooks */',
    '#ifndef MAIA_RUNTIME_PROVIDES_ARRAY_HOOKS'
  ];

  lines.push('void* __maia_arr_literal0(void) {');
  lines.push('  return __maia_runtime_alloc_value(2, 0, 0, 0);');
  lines.push('}');

  if (maxArity >= 1) {
    for (let arity = 1; arity <= maxArity; arity += 1) {
      const params = [];
      for (let i = 1; i <= arity; i += 1) {
        params.push(`int v${i}`);
      }
      lines.push(`void* __maia_arr_literal${arity}(${params.join(', ')}) {`);
      lines.push(`  return __maia_runtime_alloc_value(2, ${arity}, 0, 0);`);
      lines.push('}');
    }
  }

  if (stats.requiresBuilderHooks) {
    lines.push('void* __maia_arr_builder_begin(void) {');
    lines.push('  return __maia_runtime_alloc_value(4, 0, 0, 0);');
    lines.push('}');
    lines.push('void* __maia_arr_builder_push_value(void* builder, int value) {');
    lines.push('  (void)value;');
    lines.push('  __maia_runtime_value* b = (__maia_runtime_value*)builder;');
    lines.push('  if (!b) { return builder; }');
    lines.push('  b->a += 1;');
    lines.push('  return builder;');
    lines.push('}');
    lines.push('void* __maia_arr_builder_push_hole(void* builder) {');
    lines.push('  __maia_runtime_value* b = (__maia_runtime_value*)builder;');
    lines.push('  if (!b) { return builder; }');
    lines.push('  b->a += 1;');
    lines.push('  b->b += 1;');
    lines.push('  return builder;');
    lines.push('}');
    lines.push('void* __maia_arr_builder_spread(void* builder, void* source_array) {');
    lines.push('  __maia_runtime_value* b = (__maia_runtime_value*)builder;');
    lines.push('  if (!b) { return builder; }');
    lines.push('  b->c += 1;');
    lines.push('  __maia_runtime_value* src = (__maia_runtime_value*)source_array;');
    lines.push('  if (src && src->tag == 2) { b->a += src->a; }');
    lines.push('  return builder;');
    lines.push('}');
    lines.push('void* __maia_arr_builder_end(void* builder) {');
    lines.push('  __maia_runtime_value* b = (__maia_runtime_value*)builder;');
    lines.push('  if (!b) { return __maia_arr_literal0(); }');
    lines.push('  void* arr = __maia_runtime_alloc_value(2, b->a, b->b, b->c);');
    lines.push('  delete b;');
    lines.push('  return arr;');
    lines.push('}');
  }

  lines.push('#endif');
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

  const decls = ['/* lambda runtime hooks (runtime-provided, non-closure MVP) */'];
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

  const lines = [
    '/* local fallback runtime for lambda hooks */',
    '#ifndef MAIA_RUNTIME_PROVIDES_LAMBDA_HOOKS'
  ];

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

  lines.push('#endif');
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
  let memberExprNode = children.find((c) => c && c.kind === 'nonterminal' && c.name === 'memberExpression') || null;
  let argsNode = children.find((c) => c && c.kind === 'nonterminal' && c.name === 'arguments') || null;
  if (!memberExprNode) {
    memberExprNode = findFirstNonterminal(node, 'memberExpression');
  }
  if (!argsNode) {
    argsNode = findFirstNonterminal(node, 'arguments');
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

  const pathSegments = extractPathFromMemberExpression(memberExprNode, compileContext);
  const memberChildren = memberExprNode.children || [];
  const directPropertyIndex = memberChildren.findIndex((child) => child && child.kind === 'terminal' && child.value === '.');
  const directPropertyNode = directPropertyIndex >= 0 ? memberChildren[directPropertyIndex + 1] : null;
  const directPropertyName = directPropertyNode ? findFirstIdentifierValue(directPropertyNode) : null;
  const baseExpressionNode = directPropertyIndex > 0 ? memberChildren[0] : null;

  let argListNode = (argsNode.children || []).find((c) => c && c.kind === 'nonterminal' && c.name === 'argumentList') || null;
  if (!argListNode) {
    argListNode = findFirstNonterminal(argsNode, 'argumentList');
  }
  const argExprs = argListNode ? collectArgumentExpressions(argListNode) : [];
  const args = lowerArgumentsNode(argsNode, compileContext);

  let loweredCall = null;

  if (pathSegments && pathSegments.length > 0 && isLocalFunctionPath(pathSegments, compileContext)) {
    loweredCall = `${pathSegments[0]}(${args})`;
  }

  if (!loweredCall && pathSegments && pathSegments.length === 1 && isIdentifierBoundAtNode(pathSegments[0], node, compileContext)) {
    loweredCall = `${pathSegments[0]}(${args})`;
  }

  if (!loweredCall && pathSegments && pathSegments.length === 1) {
    const globalCallName = pathSegments[0];
    const isBoundLocalCall = isIdentifierBoundAtNode(globalCallName, node, compileContext);
    if (!isBoundLocalCall) {
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

  // Member method call: this->method(args) or obj.method(args)
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
          loweredCall = `${getClassMethodWrapperName(wrapperClassName, methodName)}(&${loweredBase}${args && args.trim() ? `, ${args}` : ''})`;
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
    }
  }

  const lambdaBindingState = getLambdaBindingStateAtCallNode(node, pathSegments, compileContext);
  if (!loweredCall
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
    if (hostSymbol === '__console__log' && argExprs.length === 1) {
      const safeArg = lowerConsoleLogArgumentExpression(argExprs[0], compileContext);
      loweredCall = `${hostSymbol}(${safeArg})`;
      return loweredCall;
    }
    loweredCall = `${hostSymbol}(${args})`;
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
      const propertyNode = children[i + 1];
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
  walk(tree, (node) => {
    if (!node || node.kind !== 'nonterminal' || node.name !== 'callExpression') { return; }
    const children = node.children || [];
    const memberExprNode = children.find((c) => c && c.kind === 'nonterminal' && c.name === 'memberExpression');
    const argsNode = children.find((c) => c && c.kind === 'nonterminal' && c.name === 'arguments');
    if (!memberExprNode || !argsNode) { return; }
    const pathSegments = extractPathFromMemberExpression(memberExprNode);
    if (!pathSegments) { return; }

    if (isLocalFunctionPath(pathSegments, compileContext)) {
      return;
    }

    const lambdaBindingState = getLambdaBindingStateAtCallNode(node, pathSegments, compileContext);
    if (lambdaBindingState && lambdaBindingState.isCaptureAware) {
      return;
    }

    const host = compileContext.hostRegistry.resolvePath(pathSegments);
    if (!host || signatures.has(host)) { return; }
    const argListNode = (argsNode.children || []).find((c) => c.kind === 'nonterminal' && c.name === 'argumentList');
    const argExprs = argListNode ? collectArgumentExpressions(argListNode) : [];
    signatures.set(host, argExprs.map(inferExprType));
  });
  return signatures;
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

  const bel = (arrayBindingPatternNode.children || []).find(
    (c) => c && c.kind === 'nonterminal' && c.name === 'bindingElementList'
  );
  if (!bel) { return names; }
  for (const child of (bel.children || [])) {
    if (!child || child.kind !== 'nonterminal' || child.name !== 'bindingElisionElement') { continue; }
    const ident = findFirstIdentifierValue(child);
    if (ident) { names.push(ident); }
  }
  return names;
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

  const bpl = (objectBindingPatternNode.children || []).find(
    (c) => c && c.kind === 'nonterminal' && c.name === 'bindingPropertyList'
  );
  if (!bpl) { return names; }
  for (const child of (bpl.children || [])) {
    if (!child || child.kind !== 'nonterminal' || child.name !== 'bindingProperty') { continue; }
    const ident = findFirstIdentifierValue(child);
    if (ident) { names.push(ident); }
  }
  return names;
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

  return (variableDeclarationListNode.children || []).filter(
    (child) => child && child.kind === 'nonterminal' && child.name === 'variableDeclaration'
  );
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

  const bindingIdentifier = (variableDeclarationNode.children || []).find(
    (child) => child && child.kind === 'nonterminal' && child.name === 'bindingIdentifier'
  );
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

  const initializer = (variableDeclarationNode.children || []).find(
    (child) => child && child.kind === 'nonterminal' && child.name === 'initializer'
  );
  if (!initializer) {
    return null;
  }

  const assignmentExpression = (initializer.children || []).find(
    (child) => child && child.kind === 'nonterminal' && child.name === 'assignmentExpression'
  ) || null;
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
          reportUnsupportedLowering(
            compileContext,
            'unsupported-array-destructuring',
            `array destructuring is not supported (${namesLabel})`
          );
          err(`unsupported lowering: array destructuring declaration (${namesLabel})`);
        } else if (objectPattern) {
          const names = extractObjectBindingIdentifiers(objectPattern, compileContext);
          const namesLabel = names.length > 0 ? names.join(', ') : '(empty pattern)';
          reportUnsupportedLowering(
            compileContext,
            'unsupported-object-destructuring',
            `object destructuring is not supported (${namesLabel})`
          );
          err(`unsupported lowering: object destructuring declaration (${namesLabel})`);
        } else {
          reportUnsupportedLowering(
            compileContext,
            'unsupported-destructuring-pattern',
            'destructuring pattern is not supported'
          );
          err('unsupported lowering: destructuring pattern declaration');
        }
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
    const topLevelFunctionExpression = isTopLevelStatement
      ? extractDirectFunctionExpressionInitializer(initializerExpr)
      : null;
    if (topLevelFunctionExpression) {
      continue;
    }

    const newClassInfo = extractDirectNewClassInfo(initializerExpr, compileContext);
    if (newClassInfo) {
      lowered.push(`${indent}${newClassInfo.className} ${variableName};`);
      const ctorSymbol = `${getClassInitWrapperName(newClassInfo.className)}__pv${'i'.repeat(Math.max(0, Number(newClassInfo.argCount) || 0))}`;
      lowered.push(`${indent}${ctorSymbol}((${newClassInfo.className}*)&${variableName}${newClassInfo.args && newClassInfo.args.trim() ? `, ${newClassInfo.args}` : ''});`);
      continue;
    }

    const cppType = inferInitializerCppType(initializerExpr, compileContext);
    const loweredInit = initializerExpr ? lowerExpressionValue(initializerExpr, compileContext) : null;
    if (initializerExpr && loweredInit === null) {
      reportUnsupportedLowering(
        compileContext,
        'variable-initializer-unlowerable',
        `variable initializer for '${variableName}' could not be lowered`
      );
      if (compileContext && compileContext.strictLowering) {
        err(`unsupported lowering: variable initializer '${variableName}'`);
      }
    }
    const initValue = loweredInit !== null ? loweredInit : defaultCppValue(cppType);

    const constQualifier = isConst && cppType !== 'const char*' ? 'const ' : '';
    lowered.push(`${indent}${constQualifier}${cppType} ${variableName} = ${initValue};`);
  }

  return lowered;
}

function indentation(level) {
  return '  '.repeat(level);
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

    return [`${indent}return ${castReturnExpression(loweredReturn, returnTypeCpp)};`];
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

    for (const nested of nestedStatements) {
      lines.push(...lowerStatementNode(nested, compileContext, indentLevel, options));
    }

    if (lines.length === 0) {
      lines.push(`${indent}// [empty block]`);
    }

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
    const lowered = lowerExpressionValue(exprNode, compileContext);
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
    return [`${indent}${lowered};`];
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
        lines.push(...lowerStatementNode(bodyStmt, compileContext, indentLevel + 1, options));
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
        lines.push(...lowerStatementNode(bodyStmt, compileContext, indentLevel + 1, options));
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
            } else if (child.kind === 'nonterminal' && child.name === 'expression') {
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
        lines.push(...lowerStatementNode(bodyStmt, compileContext, bodyIndentLevel, options));
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
      return [`${indent}throw nullptr;`];
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
    const throwValue = loweredThrowExpr !== null ? loweredThrowExpr : 'nullptr';
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
    if (label) { lines.push(`${indent}${label}:`); }
    if (nestedStmt) { 
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
  for (const stmtNode of extractTopLevelStatementNodes(tree)) {
    if (!stmtNode) { continue; }

    if (!includeFunctionDeclarations && extractFunctionDeclarationFromStatement(stmtNode)) {
      continue;
    }

    if (!includeClassDeclarations && extractClassDeclarationFromStatement(stmtNode)) {
      continue;
    }

    lines.push(...lowerStatementNode(stmtNode, compileContext, 1));
  }
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

  for (const functionDeclaration of collectTopLevelFunctionDeclarations(tree)) {
    const functionName = extractFunctionDeclarationName(functionDeclaration);
    if (!functionName) {
      continue;
    }

    const returnTypeCpp = compileContext.functionReturnTypes.get(functionName) || 'int';

    const params = extractFunctionParameterNames(functionDeclaration);
    const cppParams = buildCppParamsFromFunctionNode(functionDeclaration);

    const statementNodes = collectFunctionBodyStatementNodes(functionDeclaration);

    const bodyLines = [];
    for (const statementNode of statementNodes) {
      bodyLines.push(...lowerStatementNode(statementNode, compileContext, 1, { returnTypeCpp }));
    }

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
    const params = extractFunctionParameterNames(functionExpressionNode);
    const cppParams = buildCppParamsFromFunctionNode(functionExpressionNode);
    const statementNodes = collectFunctionBodyStatementNodes(functionExpressionNode);

    const bodyLines = [];
    for (const statementNode of statementNodes) {
      bodyLines.push(...lowerStatementNode(statementNode, compileContext, 1, { returnTypeCpp }));
    }

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
    const returnTypeCpp = compileContext.functionReturnTypes.get(symbolName) || 'int';
    const params = extractFunctionParameterNames(functionExpressionNode);
    const cppParams = buildCppParamsFromFunctionNode(functionExpressionNode);
    const statementNodes = collectFunctionBodyStatementNodes(functionExpressionNode);

    const bodyLines = [];
    for (const statementNode of statementNodes) {
      bodyLines.push(...lowerStatementNode(statementNode, compileContext, 1, { returnTypeCpp }));
    }

    if (!bodyLines.some((line) => /^\s*return\b/.test(line))) {
      bodyLines.push(`  return ${defaultCppValue(returnTypeCpp)};`);
    }

    definitions.push(
      `${returnTypeCpp} ${symbolName}(${cppParams}) {\n`
      + `${bodyLines.join('\n')}\n`
      + `}`
    );
  }

  for (const { symbolName, functionExpressionNode } of collectTopLevelObjectLiteralFunctionExpressionBindings(tree)) {
    const returnTypeCpp = compileContext.functionReturnTypes.get(symbolName) || 'int';
    const params = extractFunctionParameterNames(functionExpressionNode);
    const cppParams = buildCppParamsFromFunctionNode(functionExpressionNode);
    const statementNodes = collectFunctionBodyStatementNodes(functionExpressionNode);
    const bodyLines = [];

    for (const statementNode of statementNodes) {
      bodyLines.push(...lowerStatementNode(statementNode, compileContext, 1, { returnTypeCpp }));
    }

    if (!bodyLines.some((line) => /^\s*return\b/.test(line))) {
      bodyLines.push(`  return ${defaultCppValue(returnTypeCpp)};`);
    }

    definitions.push(
      `${returnTypeCpp} ${symbolName}(${cppParams}) {\n`
      + `${bodyLines.join('\n')}\n`
      + `}`
    );
  }

  for (const { symbolName, functionExpressionNode } of collectTopLevelCallArgumentFunctionExpressionBindings(tree)) {
    const returnTypeCpp = compileContext.functionReturnTypes.get(symbolName) || 'int';
    const params = extractFunctionParameterNames(functionExpressionNode);
    const cppParams = buildCppParamsFromFunctionNode(functionExpressionNode);
    const statementNodes = collectFunctionBodyStatementNodes(functionExpressionNode);
    const bodyLines = [];

    for (const statementNode of statementNodes) {
      bodyLines.push(...lowerStatementNode(statementNode, compileContext, 1, { returnTypeCpp }));
    }

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
    const cppParams = buildCppParamsFromFunctionNode(functionExpressionNode);
    const statementNodes = collectFunctionBodyStatementNodes(functionExpressionNode);
    const bodyLines = ['  const void* __maia_this = __maia_obj_literal0();'];

    for (const statementNode of statementNodes) {
      const loweredLines = lowerStatementNode(statementNode, compileContext, 1, { returnTypeCpp: 'int' })
        .map(rewriteConstructorThisReferences)
        .filter((line) => !/^\s*return\b/.test(line));
      bodyLines.push(...loweredLines);
    }

    bodyLines.push('  return (void*)__maia_this;');

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

  for (const functionDeclaration of collectTopLevelFunctionDeclarations(tree)) {
    const functionName = extractFunctionDeclarationName(functionDeclaration);
    if (!functionName || seen.has(functionName)) {
      continue;
    }

    const params = extractFunctionParameterNames(functionDeclaration);
    const returnTypeCpp = compileContext.functionReturnTypes.get(functionName) || 'int';
    const cppParams = buildCppParamsFromFunctionNode(functionDeclaration);

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
    const cppParams = buildCppParamsFromFunctionNode(functionExpressionNode);

    prototypes.push(`${returnTypeCpp} ${bindingName}(${cppParams});`);
    seen.add(bindingName);
  }

  for (const { symbolName, functionExpressionNode } of collectTopLevelAssignedFunctionExpressionBindings(tree)) {
    if (seen.has(symbolName)) {
      continue;
    }

    const params = extractFunctionParameterNames(functionExpressionNode);
    const returnTypeCpp = compileContext.functionReturnTypes.get(symbolName) || 'int';
    const cppParams = buildCppParamsFromFunctionNode(functionExpressionNode);

    prototypes.push(`${returnTypeCpp} ${symbolName}(${cppParams});`);
    seen.add(symbolName);
  }

  for (const { symbolName, functionExpressionNode } of collectTopLevelObjectLiteralFunctionExpressionBindings(tree)) {
    if (seen.has(symbolName)) {
      continue;
    }

    const params = extractFunctionParameterNames(functionExpressionNode);
    const returnTypeCpp = compileContext.functionReturnTypes.get(symbolName) || 'int';
    const cppParams = buildCppParamsFromFunctionNode(functionExpressionNode);

    prototypes.push(`${returnTypeCpp} ${symbolName}(${cppParams});`);
    seen.add(symbolName);
  }

  for (const { symbolName, functionExpressionNode } of collectTopLevelCallArgumentFunctionExpressionBindings(tree)) {
    if (seen.has(symbolName)) {
      continue;
    }

    const params = extractFunctionParameterNames(functionExpressionNode);
    const returnTypeCpp = compileContext.functionReturnTypes.get(symbolName) || 'int';
    const cppParams = buildCppParamsFromFunctionNode(functionExpressionNode);

    prototypes.push(`${returnTypeCpp} ${symbolName}(${cppParams});`);
    seen.add(symbolName);
  }

  for (const { bindingName, functionExpressionNode } of collectTopLevelConstructorFunctionExpressionBindings(tree)) {
    const ctorSymbol = `__new__${bindingName}`;
    if (seen.has(ctorSymbol)) {
      continue;
    }

    const params = extractFunctionParameterNames(functionExpressionNode);
    const cppParams = buildCppParamsFromFunctionNode(functionExpressionNode);

    prototypes.push(`void* ${ctorSymbol}(${cppParams});`);
    seen.add(ctorSymbol);
  }

  return prototypes.join('\n');
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
    const wrapperAliasLines = [];
    const inferredFieldNames = new Set();
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
      for (const stmtNode of methodStatements) {
        methodBodyLines.push(...lowerStatementNode(stmtNode, compileContext, 2, { returnTypeCpp: methodReturnType }));
      }

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
        const wrapperBodyLines = rewriteClassMethodBodyLinesForWrapper(methodBodyLines, className);
        wrapperLines.push(`void ${initWrapperName}(${className}* self${cppParams === 'void' ? '' : `, ${cppParams}`}) {`);
        if (heritageName) {
          wrapperLines.push(`  ${getClassInitWrapperName(heritageName)}((${heritageName}*)self);`);
        }
        for (const line of wrapperBodyLines) {
          wrapperLines.push(line.replace(/^ {4}/, '  '));
        }
        wrapperLines.push('}');
        wrapperAliasLines.push(`#define ${initWrapperName} ${initWrapperName}__pv${'i'.repeat(params.length)}`);
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
        wrapperAliasLines.push(`#define ${methodWrapperName} ${methodWrapperName}__pv${'i'.repeat(params.length)}`);
      }
    }

    if (!hasConstructor) {
      const initWrapperName = getClassInitWrapperName(className);
      if (heritageName) {
        wrapperLines.unshift(`void ${initWrapperName}(${className}* self) {`);
        wrapperLines.splice(1, 0, `  ${getClassInitWrapperName(heritageName)}((${heritageName}*)self);`);
        wrapperLines.splice(2, 0, '}');
      } else {
        wrapperLines.unshift(`void ${initWrapperName}(${className}* self) {`);
        wrapperLines.splice(1, 0, '}');
      }
      wrapperAliasLines.unshift(`#define ${initWrapperName} ${initWrapperName}__pv`);
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
      + `};${wrapperLines.length > 0 ? `\n\n${wrapperLines.join('\n')}` : ''}${wrapperAliasLines.length > 0 ? `\n${wrapperAliasLines.join('\n')}` : ''}`
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
      bridgeSymbol: `${structName}__resume_bridge`,
      machineId: index + 1,
      suspendPointCount: suspendCount,
      scheduleStateStart,
      scheduleStateEnd
    });
  }

  return plan;
}

function generateCpp(inputPath, tree, hostCalls, compileContext) {
  const base = path.basename(inputPath);

function emitAsyncStateMachinesCpp(machines, bridgePlanByFunctionName = new Map()) {
  if (!machines || machines.length === 0) { return ''; }

  return machines.map((machine) => {
    const structName = `__async_${machine.name}`;
    const machinePlan = bridgePlanByFunctionName.get(machine.name) || null;
    const terminalState = machine.suspendPointCount + 1;
    let nextSyntheticState = terminalState + 1;

    const paramFields = machine.params.length === 0
      ? '  // no parameters'
      : machine.params.map((p) => `  ${p.cppType} ${p.name};`).join('\n');

    let switchBody = '    case 0: /* initial state */ break;\n';
    
    for (let i = 1; i <= machine.suspendPointCount; i += 1) {
      const suspendPoint = machine.body[i - 1] || null;
      const awaitedExprComment = suspendPoint && suspendPoint.awaitedExpr
        ? `: ${suspendPoint.awaitedExpr}`
        : '';
      const tryDepth = suspendPoint ? suspendPoint.tryDepth : 0;
      const finallyDepth = suspendPoint ? suspendPoint.finallyDepth : 0;
      const catchHandlers = (suspendPoint && suspendPoint.catchHandlers) || [];
      const finallyHandlers = (suspendPoint && suspendPoint.finallyHandlers) || [];
      const globalScheduleState = machinePlan && Number.isInteger(machinePlan.scheduleStateStart)
        ? (machinePlan.scheduleStateStart + i - 1)
        : i;

      switchBody += `    case ${i}: /* await checkpoint ${i}${awaitedExprComment} */\n`;
      switchBody += `      __async_schedule((void*)__sm, ${globalScheduleState});\n`;
      
      if (tryDepth > 0) {
        if (catchHandlers.length > 0) {
          // Generate __exc_matches() type routing for each catch handler.
          for (let j = 0; j < catchHandlers.length; j += 1) {
            const handler = catchHandlers[j];
            const handlerState = nextSyntheticState;
            nextSyntheticState += 1;
            switchBody += `      if (__exc_active() && __exc_matches(__exc_type(), ${handler.typeCode})) {\n`;
            switchBody += `        /* catch handler for ${handler.paramName} (state ${handlerState}) */\n`;
            switchBody += `        __sm->__state = ${handlerState};\n`;
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
            switchBody += `        return;\n`;
            switchBody += `      }\n`;
          }
        }

        switchBody += `      if (__exc_active()) {\n`;
        switchBody += `        /* exception frame depth: ${tryDepth} - propagate to outer handler */\n`;
        switchBody += `        __sm->__state = ${terminalState};\n`;
        switchBody += `        return;\n`;
        switchBody += `      }\n`;
      }
      
      switchBody += `      break;\n`;
    }
    
    switchBody += `    default:\n`;
    switchBody += `      __async_complete((void*)__sm);\n`;
    switchBody += `      __sm->__state = ${terminalState};\n`;
    switchBody += `      return;\n`;

    return [
      `/* async function ${machine.name} -> state machine */`,
      `/* host resume bridge symbol: ${structName}__resume_bridge */`,
      `struct ${structName} {`,
      `  int __state;`,
      `  ${machine.returnValueCppType} __result;`,
      paramFields,
      `};`,
      ``,
      `static void ${structName}__resume(struct ${structName}* __sm) {`,
      `  switch (__sm->__state) {`,
      switchBody.trimRight(),
      `  }`,
      `}`,
      ``,
      `extern "C" void ${structName}__resume_bridge(void* __smv) {`,
      `  ${structName}__resume((struct ${structName}*)__smv);`,
      `}`
    ].join('\n');
  }).join('\n\n');
}

function emitAsyncSchedulerHookDeclsCpp(machines) {
  if (!machines || machines.length === 0) { return ''; }

  return [
    '/* async scheduler hooks (runtime-provided) */',
    'extern void __async_schedule(void* sm, int state_id);',
    'extern void __async_complete(void* sm);'
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
    '/* local helper for ES exponentiation-assignment lowering (C++98-safe) */',
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

  const signatures = profileStep('collectHostSignatures', () => collectHostSignatures(tree, compileContext));
  const hostDecls = Array.from(signatures.entries())
    .map(([fn, argTypes]) => {
      const cppArgs = argTypes.length === 0 ? 'void' : argTypes.map(cppArgType).join(', ');
      return `extern void ${fn}(${cppArgs});`;
    })
    .join('\n');

  const functionPrototypes = profileStep('emitTopLevelFunctionPrototypes', () => emitTopLevelFunctionPrototypes(tree, compileContext));
  const functionDefs = profileStep('emitTopLevelFunctionDefinitions', () => emitTopLevelFunctionDefinitions(tree, compileContext));
  const classDefs = profileStep('emitTopLevelClassDefinitions', () => emitTopLevelClassDefinitions(tree, compileContext));
  const sharedRuntimeFallbackHelpers = profileStep('emitSharedRuntimeFallbackHelpersCpp', () => emitSharedRuntimeFallbackHelpersCpp(tree));
  const exponentiationAssignmentHelpers = profileStep('emitExponentiationAssignmentHelpersCpp', () => emitExponentiationAssignmentHelpersCpp(tree));
  const objectLiteralDecls = profileStep('emitObjectLiteralRuntimeDeclsCpp', () => emitObjectLiteralRuntimeDeclsCpp(tree));
  const objectLiteralFallback = profileStep('emitObjectLiteralRuntimeFallbackCpp', () => emitObjectLiteralRuntimeFallbackCpp(tree));
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
  const asyncCpp = profileStep('emitAsyncStateMachinesCpp', () => emitAsyncStateMachinesCpp(asyncIr.asyncFunctions, bridgePlanByFunctionName));

  const hostMapComments = hostCalls.length === 0
    ? '// Host-call map: (none detected)'
    : hostCalls.map((call) => `// Host-call map: ${call.source} -> ${call.host}`).join('\n');

  const statements = profileStep('lowerProgramToCppStatements', () => lowerProgramToCppStatements(tree, compileContext, {
    includeFunctionDeclarations: false,
    includeClassDeclarations: false
  }));
  const body = statements.length > 0 ? statements.join('\n') : '  // empty program';

  return `// Auto-generated by ecmascript-compiler.js\n`
    + `// Source: ${base}\n`
    + `${hostMapComments}\n\n`
    + `${hostDecls}${hostDecls ? '\n\n' : ''}`
    + `${sharedRuntimeFallbackHelpers}${sharedRuntimeFallbackHelpers ? '\n\n' : ''}`
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
