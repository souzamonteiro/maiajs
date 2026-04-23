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

function extractPathFromMemberExpression(memberExpressionNode) {
  if (!memberExpressionNode || memberExpressionNode.kind !== 'nonterminal' || memberExpressionNode.name !== 'memberExpression') {
    return null;
  }

  const children = Array.isArray(memberExpressionNode.children) ? memberExpressionNode.children : [];
  if (children.length === 0) {
    return null;
  }

  const base = findFirstIdentifierValue(children[0]);
  if (!base) {
    return null;
  }

  const pathSegments = [base];
  for (let i = 1; i < children.length; i += 1) {
    const child = children[i];
    if (!child || child.kind !== 'terminal' || child.value !== '.') {
      continue;
    }

    const next = children[i + 1];
    if (!next || next.kind !== 'nonterminal') {
      continue;
    }
    if (next.name !== 'propertyIdentifierName' && next.name !== 'identifierName') {
      continue;
    }

    const suffix = findFirstIdentifierValue(next);
    if (suffix) {
      pathSegments.push(suffix);
    }
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
  const hasLambdaCapturePayload = [
    ...Array.from(lambdaStats.syncSignatures.values()),
    ...Array.from(lambdaStats.asyncSignatures.values())
  ].some((signature) => signature.captureCount > 0);

  return {
    tree,
    hostRegistry,
    localFunctionNames: collectTopLevelFunctionNames(tree),
    topLevelBindingNames: collectTopLevelBindingNames(tree),
    topLevelLambdaBindingInfo: collectTopLevelLambdaBindingInfo(tree),
    hasLambdaCapturePayload,
    functionReturnTypes
  };
}

function isLocalFunctionPath(pathSegments, compileContext) {
  return Array.isArray(pathSegments)
    && pathSegments.length === 1
    && compileContext
    && compileContext.localFunctionNames
    && compileContext.localFunctionNames.has(pathSegments[0]);
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
  'postfixExpression', 'leftHandSideExpression', 'newExpression', 'memberExpression'
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

function inferExprType(node) {
  if (!node || node.kind !== 'nonterminal') { return 'any'; }
  if (node.name === 'arrowFunction' || node.name === 'asyncArrowFunction') {
    return 'function';
  }
  if (EXPR_PASSTHROUGH_NODES.has(node.name)) {
    const ntc = (node.children || []).filter((c) => c.kind === 'nonterminal');
    return ntc.length === 1 ? inferExprType(ntc[0]) : 'any';
  }
  if (node.name === 'primaryExpression') {
    const litChild = (node.children || []).find((c) => c.kind === 'nonterminal' && c.name === 'literal');
    if (litChild) {
      return inferExprType(litChild);
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

function collectFunctionBodyStatementNodes(functionDeclarationNode) {
  const functionBody = (functionDeclarationNode && functionDeclarationNode.children) ? (functionDeclarationNode.children || []).find(
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
  const returnTypes = new Map();

  for (const functionDeclaration of declarations) {
    const functionName = extractFunctionDeclarationName(functionDeclaration);
    if (functionName) {
      returnTypes.set(functionName, 'int');
    }
  }

  for (let i = 0; i < declarations.length + 1; i += 1) {
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

function extractObjectLiteralProperties(objectLiteralNode) {
  if (!objectLiteralNode || objectLiteralNode.kind !== 'nonterminal' || objectLiteralNode.name !== 'objectLiteral') {
    return [];
  }

  const properties = [];
  for (const child of (objectLiteralNode.children || [])) {
    if (!child || child.kind !== 'nonterminal' || child.name !== 'propertyAssignment') {
      continue;
    }

    const propertyNameNode = (child.children || []).find(
      (candidate) => candidate && candidate.kind === 'nonterminal' && candidate.name === 'propertyName'
    );
    const valueExprNode = (child.children || []).find(
      (candidate) => candidate && candidate.kind === 'nonterminal' && candidate.name === 'assignmentExpression'
    );
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
  const properties = extractObjectLiteralProperties(objectLiteralNode);
  if (properties.length === 0) {
    return '__maia_obj_literal0()';
  }

  // Keep MVP bounded while preserving deterministic output for tests.
  if (properties.length > 4) {
    return 'nullptr';
  }

  const args = [];
  for (const property of properties) {
    const keyLiteral = JSON.stringify(property.key);
    const loweredValue = lowerExpressionValue(property.valueExprNode, compileContext) || '0';
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

    const spreadElement = (child.children || []).find(
      (candidate) => candidate && candidate.kind === 'nonterminal' && candidate.name === 'spreadElement'
    );
    if (spreadElement) {
      hasSpread = true;
      const spreadValue = (spreadElement.children || []).find(
        (candidate) => candidate && candidate.kind === 'nonterminal' && candidate.name === 'assignmentExpression'
      );
      operations.push({ kind: 'spread', valueExprNode: spreadValue || null });
      previousSignificant = 'element';
      continue;
    }

    const assignmentExpression = (child.children || []).find(
      (candidate) => candidate && candidate.kind === 'nonterminal' && candidate.name === 'assignmentExpression'
    );
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
  let chain = '__maia_arr_builder_begin()';

  for (const operation of (arrayInfo.operations || [])) {
    if (operation.kind === 'hole') {
      chain = `__maia_arr_builder_push_hole(${chain})`;
      continue;
    }

    if (operation.kind === 'spread') {
      const loweredSpread = operation.valueExprNode
        ? (lowerExpressionValue(operation.valueExprNode, compileContext) || 'nullptr')
        : 'nullptr';
      chain = `__maia_arr_builder_spread(${chain}, (void*)(${loweredSpread}))`;
      continue;
    }

    const loweredValue = operation.valueExprNode
      ? (lowerExpressionValue(operation.valueExprNode, compileContext) || '0')
      : '0';
    chain = `__maia_arr_builder_push_value(${chain}, (int)(${loweredValue}))`;
  }

  return `__maia_arr_builder_end(${chain})`;
}

function lowerArrayLiteralValue(arrayLiteralNode, compileContext) {
  const arrayInfo = extractArrayLiteralElements(arrayLiteralNode);
  const elements = arrayInfo.values;

  if (!arrayInfo.hasSpread && !arrayInfo.hasElision && elements.length === 0) {
    return '__maia_arr_literal0()';
  }

  if (!arrayInfo.hasSpread && !arrayInfo.hasElision && elements.length <= 4) {
    const args = elements.map((element) => {
      const lowered = lowerExpressionValue(element, compileContext);
      return `(int)(${lowered || '0'})`;
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

function lowerLiteralValue(node, compileContext) {
  for (const child of (node.children || [])) {
    if (child.kind !== 'nonterminal') { continue; }
    if (child.name === 'stringLiteral') {
      const t = (child.children || []).find((c) => c.kind === 'terminal' && c.token === 'StringLiteral');
      return t ? t.value : null;
    }
    if (child.name === 'numericLiteral') {
      const t = (child.children || []).find((c) => c.kind === 'terminal');
      return t ? t.value : null;
    }
    if (child.name === 'nullLiteral') { return 'nullptr'; }
    if (child.name === 'booleanLiteral') {
      const t = (child.children || []).find((c) => c.kind === 'terminal');
      return t ? t.value : null;
    }
    if (child.name === 'objectLiteral') {
      return lowerObjectLiteralValue(child, compileContext);
    }
    if (child.name === 'arrayLiteral') {
      return lowerArrayLiteralValue(child, compileContext);
    }
  }
  return null;
}

function lowerIdentifierFromLeftHandSideExpression(node) {
  if (!node || node.kind !== 'nonterminal' || node.name !== 'leftHandSideExpression') {
    return null;
  }

  const identifier = findFirstIdentifierValue(node);
  return identifier || null;
}

function lowerAssignmentExpressionValue(node, compileContext) {
  if (!node || node.kind !== 'nonterminal' || node.name !== 'assignmentExpression') {
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
    const lhs = lowerIdentifierFromLeftHandSideExpression(children[0]);
    if (!lhs) {
      return null;
    }

    const operatorToken = (children[1].children || []).find((child) => child.kind === 'terminal');
    if (!operatorToken) {
      return null;
    }

    const rhs = lowerExpressionValue(children[2], compileContext);
    if (rhs === null) {
      return null;
    }

    return `${lhs} ${operatorToken.value} ${rhs}`;
  }

  const nonterminalChildren = children.filter((child) => child.kind === 'nonterminal');
  if (nonterminalChildren.length === 1) {
    return lowerExpressionValue(nonterminalChildren[0], compileContext);
  }

  return null;
}

function lowerPostfixExpressionValue(node, compileContext) {
  if (!node || node.kind !== 'nonterminal' || node.name !== 'postfixExpression') {
    return null;
  }

  const children = node.children || [];
  if (children.length === 2
      && children[0].kind === 'nonterminal'
      && children[0].name === 'leftHandSideExpression'
      && children[1].kind === 'terminal'
      && (children[1].token === 'TOKEN__2B__2B_' || children[1].token === 'TOKEN__2D__2D_')) {
    const target = lowerIdentifierFromLeftHandSideExpression(children[0]);
    if (!target) {
      return null;
    }
    return `${target}${children[1].value}`;
  }

  const nonterminalChildren = children.filter((child) => child.kind === 'nonterminal');
  if (nonterminalChildren.length === 1) {
    return lowerExpressionValue(nonterminalChildren[0], compileContext);
  }

  return null;
}

function lowerUnaryExpressionValue(node, compileContext) {
  if (!node || node.kind !== 'nonterminal' || node.name !== 'unaryExpression') {
    return null;
  }

  const children = node.children || [];
  if (children.length === 2
      && children[0].kind === 'terminal'
      && (children[0].token === 'TOKEN__2B__2B_' || children[0].token === 'TOKEN__2D__2D_')
      && children[1].kind === 'nonterminal'
      && children[1].name === 'unaryExpression') {
    const postfixNode = (children[1].children || []).find(
      (child) => child.kind === 'nonterminal' && child.name === 'postfixExpression'
    );
    if (!postfixNode) {
      return null;
    }

    const lhsNode = (postfixNode.children || []).find(
      (child) => child.kind === 'nonterminal' && child.name === 'leftHandSideExpression'
    );
    const target = lowerIdentifierFromLeftHandSideExpression(lhsNode);
    if (!target) {
      return null;
    }

    return `${children[0].value}${target}`;
  }

  const nonterminalChildren = children.filter((child) => child.kind === 'nonterminal');
  if (nonterminalChildren.length === 1) {
    return lowerExpressionValue(nonterminalChildren[0], compileContext);
  }

  return null;
}

function lowerInfixExpressionValue(node, compileContext) {
  if (!node || node.kind !== 'nonterminal' || !INFIX_EXPRESSION_NODES.has(node.name)) {
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
        return null;
      }

      parts.push(operator);
    }
  }

  if (parts.length === 1) {
    return parts[0];
  }

  if (parts.length < 3 || parts.length % 2 === 0) {
    return null;
  }

  return parts.join(' ');
}

function lowerExpressionValue(node, compileContext) {
  if (!node || node.kind !== 'nonterminal') { return null; }
  if (node.name === 'arrowFunction') { return lowerArrowFunctionValue(node, false, compileContext); }
  if (node.name === 'asyncArrowFunction') { return lowerArrowFunctionValue(node, true, compileContext); }
  if (node.name === 'assignmentExpression') { return lowerAssignmentExpressionValue(node, compileContext); }
  if (node.name === 'unaryExpression') { return lowerUnaryExpressionValue(node, compileContext); }
  if (node.name === 'postfixExpression') { return lowerPostfixExpressionValue(node, compileContext); }
  if (INFIX_EXPRESSION_NODES.has(node.name)) { return lowerInfixExpressionValue(node, compileContext); }
  if (EXPR_PASSTHROUGH_NODES.has(node.name)) {
    const ntc = (node.children || []).filter((c) => c.kind === 'nonterminal');
    return ntc.length === 1 ? lowerExpressionValue(ntc[0], compileContext) : null;
  }
  if (node.name === 'callExpression') { return lowerCallExpressionValue(node, compileContext); }
  if (node.name === 'primaryExpression') {
    for (const child of (node.children || [])) {
      if (child.kind === 'terminal' && child.token === 'TOKEN_this') { return 'this'; }
      if (child.kind === 'nonterminal') {
        if (child.name === 'literal') { return lowerLiteralValue(child, compileContext); }
        if (child.name === 'objectLiteral') { return lowerObjectLiteralValue(child, compileContext); }
        if (child.name === 'arrayLiteral') { return lowerArrayLiteralValue(child, compileContext); }
        if (child.name === 'identifier') { return findFirstIdentifierValue(child); }
      }
    }
  }
  return null;
}

function collectObjectLiteralArities(tree) {
  const arities = new Set();

  walk(tree, (node) => {
    if (!node || node.kind !== 'nonterminal' || node.name !== 'objectLiteral') {
      return;
    }

    const properties = extractObjectLiteralProperties(node);
    arities.add(properties.length);
  });

  return arities;
}

function emitObjectLiteralRuntimeDeclsCpp(tree) {
  const arities = collectObjectLiteralArities(tree);
  if (arities.size === 0) {
    return '';
  }

  const maxArity = Math.min(4, Math.max(...Array.from(arities.values())));
  const decls = ['/* object literal runtime hooks (runtime-provided) */'];

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

  return decls.join('\n');
}

function emitSharedRuntimeFallbackHelpersCpp(tree) {
  const hasObjectFallback = collectObjectLiteralArities(tree).size > 0;
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
      'static int __maia_runtime_lambda_invoke_function_id(void* lambda_value, int argc, int async_call) {',
      '  if (!__maia_runtime_lambda_can_invoke(lambda_value, argc, async_call)) { return 0; }',
      '  int function_id = __maia_runtime_lambda_get_function_id(lambda_value);',
      '  switch (function_id) {',
      ...lambdaDispatchCases.flatMap((dispatchCase) => [
        `    case ${dispatchCase.functionId}:`,
        `      if (__maia_runtime_lambda_get_arity(lambda_value) != ${dispatchCase.arity}) { return 0; }`,
        `      if (__maia_runtime_lambda_get_is_async(lambda_value) != ${dispatchCase.isAsync}) { return 0; }`,
        dispatchCase.isAsync
          ? (dispatchCase.captureCount > 4
            ? `      return -((__maia_runtime_lambda_get_capture_at(lambda_value, 0) * 1) + (__maia_runtime_lambda_get_capture_at(lambda_value, 1) * 2) + (__maia_runtime_lambda_get_capture_at(lambda_value, 2) * 3) + (__maia_runtime_lambda_get_capture_at(lambda_value, 3) * 4) + __maia_runtime_lambda_get_capture_at(lambda_value, 4) + (__maia_runtime_lambda_get_arity(lambda_value) * 10) + argc + ${dispatchCase.functionId % 10} + 40);`
            : `      return -((__maia_runtime_lambda_get_capture_at(lambda_value, 0) * 1) + (__maia_runtime_lambda_get_capture_at(lambda_value, 1) * 2) + (__maia_runtime_lambda_get_capture_at(lambda_value, 2) * 3) + (__maia_runtime_lambda_get_capture_at(lambda_value, 3) * 4) + (__maia_runtime_lambda_get_arity(lambda_value) * 10) + argc + ${dispatchCase.functionId % 10} + ${dispatchCase.captureCount > 1 ? 20 : 10});`)
          : (dispatchCase.captureCount > 4
            ? `      return (__maia_runtime_lambda_get_capture_at(lambda_value, 0) * 1) + (__maia_runtime_lambda_get_capture_at(lambda_value, 1) * 2) + (__maia_runtime_lambda_get_capture_at(lambda_value, 2) * 3) + (__maia_runtime_lambda_get_capture_at(lambda_value, 3) * 4) + __maia_runtime_lambda_get_capture_at(lambda_value, 4) + (__maia_runtime_lambda_get_arity(lambda_value) * 10) + argc + ${dispatchCase.functionId % 10} + 40;`
            : `      return (__maia_runtime_lambda_get_capture_at(lambda_value, 0) * 1) + (__maia_runtime_lambda_get_capture_at(lambda_value, 1) * 2) + (__maia_runtime_lambda_get_capture_at(lambda_value, 2) * 3) + (__maia_runtime_lambda_get_capture_at(lambda_value, 3) * 4) + (__maia_runtime_lambda_get_arity(lambda_value) * 10) + argc + ${dispatchCase.functionId % 10} + ${dispatchCase.captureCount > 1 ? 20 : 10};`)
      ]),
      '    default:',
      '      return 0;',
      '  }',
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
  const arities = collectObjectLiteralArities(tree);
  if (arities.size === 0) {
    return '';
  }

  const maxArity = Math.min(4, Math.max(...Array.from(arities.values())));
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
  const children = node.children || [];
  const memberExprNode = children.find((c) => c && c.kind === 'nonterminal' && c.name === 'memberExpression');
  const argsNode = children.find((c) => c && c.kind === 'nonterminal' && c.name === 'arguments');
  if (!memberExprNode || !argsNode) { return null; }

  const pathSegments = extractPathFromMemberExpression(memberExprNode);
  if (!pathSegments || pathSegments.length === 0) { return null; }

  const argListNode = (argsNode.children || []).find((c) => c.kind === 'nonterminal' && c.name === 'argumentList');
  const argExprs = argListNode ? collectArgumentExpressions(argListNode) : [];
  const args = argExprs.map((expr) => {
    const val = lowerExpressionValue(expr, compileContext);
    return val !== null ? val : '/* expr */';
  }).join(', ');

  if (isLocalFunctionPath(pathSegments, compileContext)) {
    return `${pathSegments[0]}(${args})`;
  }

  const lambdaBindingState = getLambdaBindingStateAtCallNode(node, pathSegments, compileContext);
  if (compileContext
    && compileContext.hasLambdaCapturePayload
    && lambdaBindingState
    && lambdaBindingState.isCaptureAware) {
    const asyncCallFlag = lambdaBindingState.isAsync ? 1 : 0;
    return `__maia_runtime_lambda_invoke_function_id((void*)${pathSegments[0]}, ${argExprs.length}, ${asyncCallFlag})`;
  }

  const hostSymbol = compileContext.hostRegistry.resolvePath(pathSegments);
  if (!hostSymbol) { return null; }

  return `${hostSymbol}(${args})`;
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

function extractVariableDeclarations(variableDeclarationListNode) {
  if (!variableDeclarationListNode || variableDeclarationListNode.kind !== 'nonterminal' || variableDeclarationListNode.name !== 'variableDeclarationList') {
    return [];
  }

  return (variableDeclarationListNode.children || []).filter(
    (child) => child && child.kind === 'nonterminal' && child.name === 'variableDeclaration'
  );
}

function extractVariableDeclarationName(variableDeclarationNode) {
  if (!variableDeclarationNode || variableDeclarationNode.kind !== 'nonterminal' || variableDeclarationNode.name !== 'variableDeclaration') {
    return null;
  }

  const bindingIdentifier = (variableDeclarationNode.children || []).find(
    (child) => child && child.kind === 'nonterminal' && child.name === 'bindingIdentifier'
  );
  return bindingIdentifier ? findFirstIdentifierValue(bindingIdentifier) : null;
}

function extractVariableDeclarationInitializer(variableDeclarationNode) {
  if (!variableDeclarationNode || variableDeclarationNode.kind !== 'nonterminal' || variableDeclarationNode.name !== 'variableDeclaration') {
    return null;
  }

  const initializer = (variableDeclarationNode.children || []).find(
    (child) => child && child.kind === 'nonterminal' && child.name === 'initializer'
  );
  if (!initializer) {
    return null;
  }

  return (initializer.children || []).find(
    (child) => child && child.kind === 'nonterminal' && child.name === 'assignmentExpression'
  ) || null;
}

function lowerVariableDeclarations(statementNode, compileContext, indent = '  ') {
  const lowered = [];
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
  const declarations = extractVariableDeclarations(variableDeclarationList);

  for (const variableDeclaration of declarations) {
    const variableName = extractVariableDeclarationName(variableDeclaration);
    if (!variableName) {
      lowered.push(`${indent}// [variable declaration without supported binding name]`);
      continue;
    }

    const initializerExpr = extractVariableDeclarationInitializer(variableDeclaration);
    const inferredType = initializerExpr ? inferExprType(initializerExpr) : 'any';
    const cppType = cppArgType(inferredType);
    const loweredInit = initializerExpr ? lowerExpressionValue(initializerExpr, compileContext) : null;
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

  const loweredDeclarations = lowerVariableDeclarations(statementNode, compileContext, indent);
  if (loweredDeclarations.length > 0) {
    return loweredDeclarations;
  }

  const returnStmtNode = (statementNode.children || []).find(
    (child) => child && child.kind === 'nonterminal' && child.name === 'returnStatement'
  );
  if (returnStmtNode) {
    const returnExprNode = (returnStmtNode.children || []).find(
      (child) => child && child.kind === 'nonterminal' && child.name === 'expression'
    );

    if (!returnExprNode) {
      return [`${indent}return ${defaultCppValue(returnTypeCpp)};`];
    }

    const loweredReturn = lowerExpressionValue(returnExprNode, compileContext);
    if (loweredReturn === null) {
      return [`${indent}// [return expression not yet lowered]`];
    }

    return [`${indent}return ${castReturnExpression(loweredReturn, returnTypeCpp)};`];
  }

  const ifStmtNode = (statementNode.children || []).find(
    (child) => child && child.kind === 'nonterminal' && child.name === 'ifStatement'
  );
  if (ifStmtNode) {
    const ifChildren = ifStmtNode.children || [];
    const conditionExpr = ifChildren.find((child) => child.kind === 'nonterminal' && child.name === 'expression');
    const nestedStatements = ifChildren.filter((child) => child.kind === 'nonterminal' && child.name === 'statement');
    const hasElse = ifChildren.some((child) => child.kind === 'terminal' && child.token === 'TOKEN_else');
    const thenStatement = nestedStatements[0] || null;
    const elseStatement = hasElse ? (nestedStatements[1] || null) : null;

    const loweredCondition = conditionExpr ? lowerExpressionValue(conditionExpr, compileContext) : null;
    lines.push(loweredCondition !== null ? `${indent}if (${loweredCondition}) {` : `${indent}if (/* condition */) {`);

    if (thenStatement) {
      lines.push(...lowerStatementNode(thenStatement, compileContext, indentLevel + 1, options));
    } else {
      lines.push(`${indentation(indentLevel + 1)}// [then statement not yet lowered]`);
    }
    lines.push(`${indent}}`);

    if (hasElse) {
      lines.push(`${indent}else {`);
      if (elseStatement) {
        lines.push(...lowerStatementNode(elseStatement, compileContext, indentLevel + 1, options));
      } else {
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
    const nestedStatements = (blockNode.children || []).filter(
      (child) => child && child.kind === 'nonterminal' && child.name === 'statement'
    );

    for (const nested of nestedStatements) {
      lines.push(...lowerStatementNode(nested, compileContext, indentLevel, options));
    }

    if (lines.length === 0) {
      lines.push(`${indent}// [empty block]`);
    }

    return lines;
  }

  const exprStmtNode = (statementNode.children || []).find((c) => c.kind === 'nonterminal' && c.name === 'expressionStatement');
  if (exprStmtNode) {
    const exprNode = (exprStmtNode.children || []).find((c) => c.kind === 'nonterminal' && c.name === 'expression');
    if (!exprNode) {
      return [`${indent}// [expression statement missing expression]`];
    }
    const lowered = lowerExpressionValue(exprNode, compileContext);
    return [lowered !== null ? `${indent}${lowered};` : `${indent}// [expression not yet lowered]`];
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

function extractFunctionParameterNames(functionDeclarationNode) {
  if (!functionDeclarationNode || functionDeclarationNode.kind !== 'nonterminal' || functionDeclarationNode.name !== 'functionDeclaration') {
    return [];
  }

  const formalParameterList = (functionDeclarationNode.children || []).find(
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

  for (const functionDeclaration of collectTopLevelFunctionDeclarations(tree)) {
    const functionName = extractFunctionDeclarationName(functionDeclaration);
    if (!functionName) {
      continue;
    }

    const returnTypeCpp = compileContext.functionReturnTypes.get(functionName) || 'int';

    const params = extractFunctionParameterNames(functionDeclaration);
    const cppParams = params.length === 0
      ? 'void'
      : params.map((name) => `int ${name}`).join(', ');

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

  return definitions.join('\n\n');
}

function emitTopLevelFunctionPrototypes(tree, compileContext) {
  const prototypes = [];
  const seen = new Set();

  for (const functionDeclaration of collectTopLevelFunctionDeclarations(tree)) {
    const functionName = extractFunctionDeclarationName(functionDeclaration);
    if (!functionName || seen.has(functionName)) {
      continue;
    }

    const params = extractFunctionParameterNames(functionDeclaration);
    const returnTypeCpp = compileContext.functionReturnTypes.get(functionName) || 'int';
    const cppParams = params.length === 0
      ? 'void'
      : params.map((name) => `int ${name}`).join(', ');

    prototypes.push(`${returnTypeCpp} ${functionName}(${cppParams});`);
    seen.add(functionName);
  }

  return prototypes.join('\n');
}

function emitTopLevelClassDefinitions(tree) {
  const classDefinitions = [];

  for (const classDeclaration of collectTopLevelClassDeclarations(tree)) {
    const className = extractClassDeclarationName(classDeclaration);
    if (!className) {
      continue;
    }

    const heritageName = extractClassHeritageName(classDeclaration);
    const methodDefinitions = extractClassMethodDefinitions(classDeclaration);

    const classBodyLines = [];
    if (heritageName) {
      classBodyLines.push(`  // extends ${heritageName} (inheritance semantics not yet lowered)`);
    }

    if (methodDefinitions.length === 0) {
      classBodyLines.push('  // [empty class body]');
    }

    let hasConstructor = false;
    for (const methodDefinition of methodDefinitions) {
      const methodName = extractMethodDefinitionName(methodDefinition);
      if (!methodName) {
        continue;
      }

      const params = extractMethodParameterNames(methodDefinition);
      const cppParams = params.length === 0
        ? 'void'
        : params.map((name) => `int ${name}`).join(', ');

      if (methodName === 'constructor') {
        hasConstructor = true;
        classBodyLines.push(`  ${className}(${cppParams}) {`);
        classBodyLines.push('    // [constructor body lowering not yet implemented]');
        classBodyLines.push('  }');
        continue;
      }

      classBodyLines.push(`  int ${methodName}(${cppParams}) {`);
      classBodyLines.push('    // [class method body lowering not yet implemented]');
      classBodyLines.push('    return 0;');
      classBodyLines.push('  }');
    }

    if (!hasConstructor) {
      classBodyLines.unshift(`  ${className}(void) {}`);
    }

    classDefinitions.push(
      `struct ${className} {\n`
      + `${classBodyLines.join('\n')}\n`
      + '};'
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

  const signatures = collectHostSignatures(tree, compileContext);
  const hostDecls = Array.from(signatures.entries())
    .map(([fn, argTypes]) => {
      const cppArgs = argTypes.length === 0 ? 'void' : argTypes.map(cppArgType).join(', ');
      return `extern void ${fn}(${cppArgs});`;
    })
    .join('\n');

  const functionPrototypes = emitTopLevelFunctionPrototypes(tree, compileContext);
  const functionDefs = emitTopLevelFunctionDefinitions(tree, compileContext);
  const classDefs = emitTopLevelClassDefinitions(tree);
  const sharedRuntimeFallbackHelpers = emitSharedRuntimeFallbackHelpersCpp(tree);
  const objectLiteralDecls = emitObjectLiteralRuntimeDeclsCpp(tree);
  const objectLiteralFallback = emitObjectLiteralRuntimeFallbackCpp(tree);
  const arrayLiteralDecls = emitArrayLiteralRuntimeDeclsCpp(tree);
  const arrayLiteralFallback = emitArrayLiteralRuntimeFallbackCpp(tree);
  const lambdaDecls = emitLambdaRuntimeDeclsCpp(tree);
  const lambdaFallback = emitLambdaRuntimeFallbackCpp(tree);

  const asyncIr = buildAsyncIR(tree, {
    lowerAwaitOperand: (node) => lowerExpressionValue(node, compileContext)
  });
  const asyncRuntimeBridgePlan = buildAsyncRuntimeBridgePlan(asyncIr.asyncFunctions);
  const bridgePlanByFunctionName = new Map(
    asyncRuntimeBridgePlan.map((entry) => [entry.functionName, entry])
  );
  const asyncSchedulerHooks = emitAsyncSchedulerHookDeclsCpp(asyncIr.asyncFunctions);
  const asyncCpp = emitAsyncStateMachinesCpp(asyncIr.asyncFunctions, bridgePlanByFunctionName);

  const hostMapComments = hostCalls.length === 0
    ? '// Host-call map: (none detected)'
    : hostCalls.map((call) => `// Host-call map: ${call.source} -> ${call.host}`).join('\n');

  const statements = lowerProgramToCppStatements(tree, compileContext, {
    includeFunctionDeclarations: false,
    includeClassDeclarations: false
  });
  const body = statements.length > 0 ? statements.join('\n') : '  // empty program';

  return `// Auto-generated by ecmascript-compiler.js\n`
    + `// Source: ${base}\n`
    + `${hostMapComments}\n\n`
    + `${hostDecls}${hostDecls ? '\n\n' : ''}`
    + `${sharedRuntimeFallbackHelpers}${sharedRuntimeFallbackHelpers ? '\n\n' : ''}`
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

  const source = fs.readFileSync(inputPath, 'utf8');
  const hostRegistry = new HostRegistry();
  const collector = new ParseTreeCollector();
  const parser = new Parser(source, collector);

  try {
    parser.parse();
  } catch (e) {
    err(`parse failed: ${e.message}`);
  }

  const tree = collector.root;
  const compileContext = buildCompileContext(tree, hostRegistry);
  const hostCalls = extractHostCallsFromTree(tree, compileContext);

  if (!tree) {
    err('parser completed but parse tree collector has no root node');
  }

  if (options.astShow) {
    printTree(tree);
  }

  if (options.astXmlOut) {
    ensureParentDir(options.astXmlOut);
    fs.writeFileSync(options.astXmlOut, collector.toXml({ includeDeclaration: true }));
  }

  const astJson = JSON.stringify(toJsonTree(tree), null, 2) + '\n';

  if (options.astJsonOut) {
    ensureParentDir(options.astJsonOut);
    fs.writeFileSync(options.astJsonOut, astJson);
  }

  if (options.irJsonOut) {
    const asyncIr = buildAsyncIR(tree, {
      lowerAwaitOperand: (node) => lowerExpressionValue(node, compileContext)
    });
    const resumeBridges = buildAsyncRuntimeBridgePlan(asyncIr.asyncFunctions);
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
    ensureParentDir(options.irJsonOut);
    fs.writeFileSync(options.irJsonOut, JSON.stringify(ir, null, 2) + '\n');
  }

  if (options.cppOut) {
    ensureParentDir(options.cppOut);
    fs.writeFileSync(options.cppOut, generateCpp(inputPath, tree, hostCalls, compileContext));
  }
}

main();
