#!/usr/bin/env node

'use strict';

const fs = require('fs');
const path = require('path');
const Parser = require('./ecmascript-parser');
const { ParseTreeCollector, printTree } = require('./parse-tree-collector');
const { HostRegistry } = require('./ecmascript/host-registry');
const { buildAsyncIR } = require('./ecmascript/async-ir');
const closures = require('./ecmascript/closures');
const promises = require('./ecmascript/promises');
const iterators = require('./ecmascript/iterators');
const atomics = require('./ecmascript/atomics');
const collections = require('./ecmascript/collections');
const {
  walk,
  flattenNodeText,
  getTreeNavigationIndex,
  findFirstIdentifierValue,
  findNodePath,
  nodeContainsTarget,
  findFirstTerminalByToken,
  hasNonterminal,
  findFirstNonterminal
} = require('./ecmascript/ast-utils');

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
      case '--library':
        options.library = true;
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

const { createAstCollectors } = require('./ecmascript/ast-collectors');
let _astCollectors = null;
function getAstCollectors() {
  if (!_astCollectors) {
    _astCollectors = createAstCollectors({
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
    });
  }
  return _astCollectors;
}
function extractTopLevelStatementNodes(...args) { return getAstCollectors().extractTopLevelStatementNodes(...args); }
function extractFunctionDeclarationFromStatement(...args) { return getAstCollectors().extractFunctionDeclarationFromStatement(...args); }
function extractAsyncFunctionDeclarationFromStatement(...args) { return getAstCollectors().extractAsyncFunctionDeclarationFromStatement(...args); }
function collectTopLevelFunctionDeclarations(...args) { return getAstCollectors().collectTopLevelFunctionDeclarations(...args); }
function extractDirectFunctionExpressionInitializer(...args) { return getAstCollectors().extractDirectFunctionExpressionInitializer(...args); }
function extractDirectArrowFunctionInitializer(...args) { return getAstCollectors().extractDirectArrowFunctionInitializer(...args); }
function extractDirectCallableInitializer(...args) { return getAstCollectors().extractDirectCallableInitializer(...args); }
function collectTopLevelArrowFunctionBindings(...args) { return getAstCollectors().collectTopLevelArrowFunctionBindings(...args); }
function collectTopLevelFunctionExpressionBindings(...args) { return getAstCollectors().collectTopLevelFunctionExpressionBindings(...args); }
function sanitizeFunctionSymbolSuffix(...args) { return getAstCollectors().sanitizeFunctionSymbolSuffix(...args); }
function collectTopLevelAssignedFunctionExpressionBindings(...args) { return getAstCollectors().collectTopLevelAssignedFunctionExpressionBindings(...args); }
function collectTopLevelObjectLiteralFunctionExpressionBindings(...args) { return getAstCollectors().collectTopLevelObjectLiteralFunctionExpressionBindings(...args); }
function collectTopLevelObjectLiteralPropertyTypeInfo(...args) { return getAstCollectors().collectTopLevelObjectLiteralPropertyTypeInfo(...args); }
function collectTopLevelPrototypeHeritageMap(...args) { return getAstCollectors().collectTopLevelPrototypeHeritageMap(...args); }
function collectTopLevelCallArgumentFunctionExpressionBindings(...args) { return getAstCollectors().collectTopLevelCallArgumentFunctionExpressionBindings(...args); }
function collectTopLevelForEachArrowFunctionBindings(...args) { return getAstCollectors().collectTopLevelForEachArrowFunctionBindings(...args); }
function nodeContainsThisReference(...args) { return getAstCollectors().nodeContainsThisReference(...args); }
function collectNewExpressionTargetNames(...args) { return getAstCollectors().collectNewExpressionTargetNames(...args); }
function collectTopLevelConstructorFunctionExpressionBindings(...args) { return getAstCollectors().collectTopLevelConstructorFunctionExpressionBindings(...args); }
function rewriteConstructorThisReferences(...args) { return getAstCollectors().rewriteConstructorThisReferences(...args); }
function rewriteObjectLiteralMethodThisReferences(...args) { return getAstCollectors().rewriteObjectLiteralMethodThisReferences(...args); }
function extractClassDeclarationFromStatement(...args) { return getAstCollectors().extractClassDeclarationFromStatement(...args); }
function collectTopLevelClassDeclarations(...args) { return getAstCollectors().collectTopLevelClassDeclarations(...args); }
function extractClassDeclarationName(...args) { return getAstCollectors().extractClassDeclarationName(...args); }
function extractClassHeritageName(...args) { return getAstCollectors().extractClassHeritageName(...args); }
function extractClassMethodDefinitions(...args) { return getAstCollectors().extractClassMethodDefinitions(...args); }
function extractClassMethodEntries(...args) { return getAstCollectors().extractClassMethodEntries(...args); }
function extractMethodDefinitionName(...args) { return getAstCollectors().extractMethodDefinitionName(...args); }
function extractMethodParameterNames(...args) { return getAstCollectors().extractMethodParameterNames(...args); }
function extractFunctionDeclarationName(...args) { return getAstCollectors().extractFunctionDeclarationName(...args); }
function collectTopLevelFunctionNames(...args) { return getAstCollectors().collectTopLevelFunctionNames(...args); }
function functionBodyUsesArguments(...args) { return getAstCollectors().functionBodyUsesArguments(...args); }
function collectLocalFunctionArgumentsInfo(...args) { return getAstCollectors().collectLocalFunctionArgumentsInfo(...args); }
function collectTopLevelBindingNames(...args) { return getAstCollectors().collectTopLevelBindingNames(...args); }
function collectTopLevelClassNames(...args) { return getAstCollectors().collectTopLevelClassNames(...args); }
function collectTopLevelClassHeritageMap(...args) { return getAstCollectors().collectTopLevelClassHeritageMap(...args); }
function collectTopLevelLambdaBindingInfo(...args) { return getAstCollectors().collectTopLevelLambdaBindingInfo(...args); }
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

  function applyBindingState(name, valueExprNode, fromAssignment = false) {
    if (!name) {
      return;
    }
    const captureAwareInfo = extractCaptureAwareLambdaBindingInfoFromExpression(valueExprNode, lambdaCompileContext);
    if (captureAwareInfo) {
      states.set(name, {
        isCaptureAware: true,
        isAsync: captureAwareInfo.isAsync,
        fromAssignment: Boolean(fromAssignment)
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
    applyBindingState(lhsIdentifier, assignmentChildren[2], true);
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
    const stmtFirst = (statementNode.children || []).find((c) => c && c.kind === 'nonterminal');
    if (stmtFirst && (stmtFirst.name === 'functionDeclaration' || stmtFirst.name === 'classDeclaration' || stmtFirst.name === 'asyncFunctionDeclaration')) {
      return;
    }
    const declarationNode = (statementNode.children || []).find(
      (child) => child
        && child.kind === 'nonterminal'
        && (child.name === 'variableStatement' || child.name === 'letDeclaration' || child.name === 'constDeclaration' || child.name === 'lexicalDeclaration')
    ) || (stmtFirst && stmtFirst.name === 'declaration'
      ? (findFirstNonterminal(stmtFirst, 'lexicalDeclaration') || findFirstNonterminal(stmtFirst, 'variableStatement') || findFirstNonterminal(stmtFirst, 'letDeclaration') || findFirstNonterminal(stmtFirst, 'constDeclaration'))
      : null);
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

    const treeIdx = getTreeNavigationIndex(compileContext.tree);
    const tEnter = treeIdx ? treeIdx.enterByNode.get(targetNode) : undefined;
    const tExit = treeIdx ? treeIdx.exitByNode.get(targetNode) : undefined;
    const hasFastBounds = Number.isInteger(tEnter) && Number.isInteger(tExit);
    for (const statementNode of scopeStatements) {
      if (!statementNode) {
        continue;
      }
      if (hasFastBounds) {
        const sEnter = treeIdx.enterByNode.get(statementNode);
        const sExit = treeIdx.exitByNode.get(statementNode);
        if (Number.isInteger(sEnter) && Number.isInteger(sExit) && sEnter <= tEnter && tExit <= sExit) {
          break;
        }
      } else if (nodeContainsTarget(statementNode, targetNode)) {
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
  return JSON.stringify(value == null ? '' : String(value))
    .replace(/;/g, '\\073')
    .replace(/\{/g, '\\173')
    .replace(/\}/g, '\\175')
    .replace(/\/\//g, '\\057\\057')
    .replace(/\/\*/g, '\\057*')
    .replace(/\*\//g, '*\\057');
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
    return `__maia_runtime_value_get_property((void*)(${normalizedBase}), (void*)(${loweredProperty}))`;
  }

  return `__maia_runtime_value_get_index((void*)(${normalizedBase}), (int)(${loweredProperty}))`;
}

const { createStaticModel } = require('./ecmascript/static-model');
let _staticModel = null;
function getStaticModel() {
  if (!_staticModel) {
    _staticModel = createStaticModel({
      collectVisibleVariableBindingsAtNode,
      extractArrayLiteralElements,
      extractObjectLiteralProperties,
      extractStringLiteralValue,
      lowerLiteralValue,
      findBoundVariableInitializerExpressionAtNode,
      extractPathFromMemberExpression,
      unwrapExpressionNode,
      extractComputedMemberAccessInfo,
      staticStringLiteralCpp,
      extractLambdaBodyNode,
      extractLambdaParameterNames,
      extractFunctionParameterNames,
      collectArgumentExpressions,
      collectLambdaCaptureNames,
      collectTopLevelFunctionDeclarations,
      extractFunctionDeclarationName,
      normalizeJsStringLiteralForCpp,
      enqueueDeferredPromiseStatement
    });
  }
  return _staticModel;
}
function resolveStaticModelFromExpression(...args) { return getStaticModel().resolveStaticModelFromExpression(...args); }
function lowerStaticModelToExpression(...args) { return getStaticModel().lowerStaticModelToExpression(...args); }
function lowerStaticModelToRuntimeExpression(...args) { return getStaticModel().lowerStaticModelToRuntimeExpression(...args); }
function staticModelToJsString(...args) { return getStaticModel().staticModelToJsString(...args); }
function resolveStaticSearchFromIndex(...args) { return getStaticModel().resolveStaticSearchFromIndex(...args); }
function extractCallableReturnExpressionNode(...args) { return getStaticModel().extractCallableReturnExpressionNode(...args); }
function extractCallableParameterNames(...args) { return getStaticModel().extractCallableParameterNames(...args); }
function extractOutermostCallMemberExpression(...args) { return getStaticModel().extractOutermostCallMemberExpression(...args); }
function extractCallExpressionMemberAndArgs(...args) { return getStaticModel().extractCallExpressionMemberAndArgs(...args); }
function applyStaticStringMethodModel(...args) { return getStaticModel().applyStaticStringMethodModel(...args); }
function applyStaticArrayCallbackModel(...args) { return getStaticModel().applyStaticArrayCallbackModel(...args); }
function resolveStaticArrowCaptureModels(...args) { return getStaticModel().resolveStaticArrowCaptureModels(...args); }
function applyStaticArrowCallModel(...args) { return getStaticModel().applyStaticArrowCallModel(...args); }
function resolveStaticModelFromCallChainSuffix(...args) { return getStaticModel().resolveStaticModelFromCallChainSuffix(...args); }
function findCallableNodeFromExpression(...args) { return getStaticModel().findCallableNodeFromExpression(...args); }
function resolveCallableNodeFromExpression(...args) { return getStaticModel().resolveCallableNodeFromExpression(...args); }
function resolveFlatStaticPrimitiveModel(...args) { return getStaticModel().resolveFlatStaticPrimitiveModel(...args); }
function resolveStaticPromiseSeedModel(...args) { return getStaticModel().resolveStaticPromiseSeedModel(...args); }
function analyzeStaticPromiseThenChain(...args) { return getStaticModel().analyzeStaticPromiseThenChain(...args); }
function tryLowerStaticPromiseThenChain(...args) { return getStaticModel().tryLowerStaticPromiseThenChain(...args); }
function evaluateStaticExpressionModel(...args) { return getStaticModel().evaluateStaticExpressionModel(...args); }
function tryResolveStaticFilterResultModel(...args) { return getStaticModel().tryResolveStaticFilterResultModel(...args); }
function tryResolveStaticMapResultModel(...args) { return getStaticModel().tryResolveStaticMapResultModel(...args); }

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

function buildCompileContext(tree, hostRegistry, optionsArg = {}) {
  const functionReturnTypes = profileStep("ctx.inferTopLevelFunctionReturnTypes", () => inferTopLevelFunctionReturnTypes(tree));
  const lambdaStats = profileStep("ctx.collectLambdaSignatures", () => collectLambdaSignatures(tree));
  const topLevelArrowFunctionBindings = collectTopLevelArrowFunctionBindings(tree);
  const topLevelAssignedFunctionExpressionBindings = collectTopLevelAssignedFunctionExpressionBindings(tree);
  const topLevelObjectLiteralFunctionExpressionBindings = collectTopLevelObjectLiteralFunctionExpressionBindings(tree);
  const objectLiteralPropertyTypesByFunctionNode = collectTopLevelObjectLiteralPropertyTypeInfo(tree);
  const topLevelCallArgumentFunctionExpressionBindings = collectTopLevelCallArgumentFunctionExpressionBindings(tree);
  const topLevelForEachArrowFunctionBindings = collectTopLevelForEachArrowFunctionBindings(tree);
  const localFunctionArgumentsInfo = collectLocalFunctionArgumentsInfo(tree);
  const hasLambdaCapturePayload = [
    ...Array.from(lambdaStats.syncSignatures.values()),
    ...Array.from(lambdaStats.asyncSignatures.values())
  ].some((signature) => signature.captureCount > 0);

  const options = optionsArg || {};

  const baseCompileContext = {
    tree,
    _visibleVariableBindingsCache: new WeakMap(),
    _staticModelCache: new WeakMap(),
    _staticModelNullSentinel: Symbol('static-model-null'),
    _inferExprTypeCache: new WeakMap(),
    _inferExprTypeActive: new WeakSet(),
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
  const callableParameterTypesByNode = profileStep("ctx.collectCallableParameterCppTypes", () => collectCallableParameterCppTypes(tree, baseCompileContext));
  profileStep("ctx.refineFunctionReturnTypesWithParameterInfo", () => refineFunctionReturnTypesWithParameterInfo(tree, functionReturnTypes, callableParameterTypesByNode));

  const compileContext = {
    tree,
    hostRegistry,
    strictLowering: Boolean(options.strictLowering),
    library: Boolean(options.library),
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
      ...topLevelCallArgumentFunctionExpressionBindings.map((binding) => [binding.functionExpressionNode, binding.symbolName]),
      ...topLevelForEachArrowFunctionBindings.map((binding) => [binding.arrowFunctionNode, binding.symbolName])
    ]),
    _visibleVariableBindingsCache: new WeakMap(),
    _staticModelCache: new WeakMap(),
    _staticModelNullSentinel: Symbol('static-model-null'),
    hasLambdaCapturePayload,
    functionReturnTypes,
    callableParameterTypesByNode
  };

  compileContext.promisePlan = promises.analyzePromiseUsage(tree, { findFirstIdentifierValue });
  compileContext.iteratorPlan = iterators.analyzeIteratorUsage(tree);
  compileContext.atomicsPlan = atomics.analyzeAtomicsUsage(tree);
  compileContext.collectionsPlan = collections.analyzeCollectionsPlan(tree, { walk, findFirstIdentifierValue });
  compileContext.generatedGenerators = [];
  compileContext.generatorStepDecls = [];
  compileContext.generatorYieldTypes = new Map();
  compileContext.iteratorVarTypes = new Map();
  compileContext.iteratorResultTypes = new Map();
  compileContext.closurePlan = profileStep("ctx.analyzeClosures", () => closures.analyzeClosures(tree, compileContext, {
    extractLambdaParameterNames,
    extractFunctionParameterNames,
    extractLambdaBodyNode,
    extractFunctionDeclarationName,
    findFirstNonterminal,
    findFirstIdentifierValue
  }));

  profileStep("ctx.refineFunctionReturnTypesWithLoweredExpressions", () => refineFunctionReturnTypesWithLoweredExpressions(tree, compileContext));
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
    let depth = 0;
    let inQuote = null;
    let start = 0;
    for (let i = 0; i < args.length; i += 1) {
      const ch = args[i];
      if (inQuote) {
        if (ch === '\\') { i += 1; continue; }
        if (ch === inQuote) { inQuote = null; }
        continue;
      }
      if (ch === '"' || ch === '\'') { inQuote = ch; continue; }
      if (ch === '(' || ch === '[' || ch === '{') { depth += 1; continue; }
      if (ch === ')' || ch === ']' || ch === '}') { depth -= 1; continue; }
      if (ch === ',' && depth === 0) {
        const part = args.slice(start, i).trim();
        if (part) { actualArgs.push(part); }
        start = i + 1;
      }
    }
    const tail = args.slice(start).trim();
    if (tail) { actualArgs.push(tail); }
  }
  const targetArity = functionArgumentsInfo.usesArguments
    ? functionArgumentsInfo.maxCallArity
    : functionArgumentsInfo.formalCount;
  while (actualArgs.length < targetArity) {
    actualArgs.push('0');
  }
  const formattedArgs = (compileContext && compileContext.closurePlan && compileContext.closurePlan.orderedClosures.length > 0)
    ? actualArgs.map((arg) => {
      if (/^__maia_(?:closure|lambda)/.test(arg)) {
        if (!Array.isArray(compileContext._preludeStatements)) {
          compileContext._preludeStatements = [];
        }
        compileContext._callArgTmpCounter = (compileContext._callArgTmpCounter || 0) + 1;
        const tmpName = `__maia_call_arg_${compileContext._callArgTmpCounter}`;
        compileContext._preludeStatements.push(`int ${tmpName} = (int)(${arg});`);
        return tmpName;
      }
      return arg;
    })
    : actualArgs;
  if (!functionArgumentsInfo.usesArguments) {
    return formattedArgs.join(', ');
  }
  return [String(Array.isArray(argExprs) ? argExprs.length : formattedArgs.length), ...formattedArgs].join(', ');
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
      const foundArity = extractCallableParameterArities(ancestor).get(name); return foundArity !== undefined ? foundArity : null;
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

  const ctorPath = extractPathFromMemberExpression(children[1], null);
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
    return (compileContext && compileContext._enclosingClassName) || null;
  }

  const path = findNodePath(compileContext.tree, node);
  if (path.length === 0) {
    return (compileContext && compileContext._enclosingClassName) || null;
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
  for (const { symbolName, arrowFunctionNode } of collectTopLevelForEachArrowFunctionBindings(tree)) {
    registerCallable(symbolName, arrowFunctionNode, extractCallableParameterNames(arrowFunctionNode));
  }
  for (const { bindingName, functionExpressionNode } of collectTopLevelConstructorFunctionExpressionBindings(tree)) {
    registerCallable(bindingName, functionExpressionNode, extractCallableParameterNames(functionExpressionNode));
  }
  for (const { lhs, functionExpressionNode } of collectTopLevelAssignedFunctionExpressionBindings(tree)) {
    registerCallable(lhs, functionExpressionNode, extractCallableParameterNames(functionExpressionNode));
  }
  const hasPrototypeCallable = Array.from(callableByKey.keys())
    .some((key) => key.includes('.prototype.'));

  const iterStaticModelCache = (baseCompileContext && baseCompileContext._staticModelCache) || new WeakMap();
  const iterStaticModelNullSentinel = (baseCompileContext && baseCompileContext._staticModelNullSentinel) || Symbol('iter-static-model-null');
  const iterVisibleBindingsCache = (baseCompileContext && baseCompileContext._visibleVariableBindingsCache) || new WeakMap();
  const buildIterationContext = () => ({
    tree,
    _staticModelCache: iterStaticModelCache,
    _staticModelNullSentinel: iterStaticModelNullSentinel,
    _visibleVariableBindingsCache: iterVisibleBindingsCache,
    _inferExprTypeCache: new WeakMap(),
    _inferExprTypeActive: new WeakSet(),
    topLevelFunctionExpressionSymbols: baseCompileContext ? baseCompileContext.topLevelFunctionExpressionSymbols : new Map(),
    topLevelArrowFunctionSymbols: baseCompileContext ? baseCompileContext.topLevelArrowFunctionSymbols : new Map(),
    topLevelAssignedFunctionExpressionSymbols: baseCompileContext ? baseCompileContext.topLevelAssignedFunctionExpressionSymbols : new Map(),
    functionReturnTypes: baseCompileContext ? baseCompileContext.functionReturnTypes : new Map(),
    callableParameterTypesByNode
  });

  const mergeCallbackParamTypeHints = (callbackExprNode, hintedCppTypes = []) => {
    const callbackNode = resolveCallableNodeFromExpression(callbackExprNode, buildIterationContext());
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

const CPP_RESERVED_KEYWORDS = new Set([
  'operator', 'template', 'typename', 'namespace', 'using', 'virtual', 'inline',
  'friend', 'explicit', 'mutable', 'struct', 'union', 'typedef', 'register', 'asm',
  'sizeof', 'signed', 'unsigned', 'short', 'long', 'char', 'int', 'float', 'double',
  'bool', 'and', 'or', 'not', 'xor', 'bitand', 'bitor', 'compl', 'auto', 'goto'
]);
function sanitizeCppIdentifier(name) {
  return CPP_RESERVED_KEYWORDS.has(name) ? `__maia_kw_${name}` : name;
}

function buildCppParamsFromFunctionNode(functionNode, functionName = null, compileContext = null) {
  const params = extractCallableParameterNames(functionNode);
  const callableArities = extractCallableParameterArities(functionNode);
  const loweredParams = params.map((name) => {
    const safeName = sanitizeCppIdentifier(name);
    if (callableArities.has(name)) {
      if (compileContext && compileContext.closurePlan && compileContext.closurePlan.orderedClosures.length > 0) {
        return `int ${safeName}`;
      }
      const arity = callableArities.get(name);
      const fnParams = arity === 0
        ? 'void'
        : Array.from({ length: arity }, () => 'int').join(', ');
      return `int (*${safeName})(${fnParams})`;
    }
    const inferredParamType = compileContext
      && compileContext.callableParameterTypesByNode
      && compileContext.callableParameterTypesByNode.get(functionNode)
      ? compileContext.callableParameterTypesByNode.get(functionNode).get(name)
      : null;
    return `${inferredParamType || 'int'} ${safeName}`;
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

    if (pathSegments.length >= 2 && pathSegments[pathSegments.length - 1] === 'test') { return; }
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

  const inlineReplacement = compileContext
    && compileContext.inlineIdentifierExpressions
    && compileContext.inlineIdentifierExpressions.get(identifierValue);
  if (inlineReplacement) {
    return inlineReplacement;
  }

  const asyncStateField = compileContext
    && compileContext.asyncStateLocalFields
    && compileContext.asyncStateLocalFields.get(identifierValue);
  if (asyncStateField) {
    return `__sm->${asyncStateField}`;
  }

  if (compileContext
    && !compileContext._resolvingDirectCallee
    && !compileContext._inStaticForEachCallback
    && !(compileContext.localVariables && compileContext.localVariables.has(identifierValue))
    && compileContext.localFunctionNames
    && compileContext.localFunctionNames.has(identifierValue)
    && compileContext.closurePlan
    && compileContext.closurePlan.topLevelClosureByName
    && compileContext.closurePlan.topLevelClosureByName.has(identifierValue)) {
    const scope = compileContext.closurePlan.topLevelClosureByName.get(identifierValue);
    return `__maia_closure_alloc(${scope.fnId}, ${scope.params.length}, ${scope.isAsync ? 1 : 0}, 0)`;
  }

  return sanitizeCppIdentifier(identifierValue);
}

const { createTypeInference } = require('./ecmascript/type-inference');
let _typeInference = null;
function getTypeInference() {
  if (!_typeInference) {
    _typeInference = createTypeInference({
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
    });
  }
  return _typeInference;
}
function inferExprType(...args) { return getTypeInference().inferExprType(...args); }
function _inferExprTypeUncached(...args) { return getTypeInference()._inferExprTypeUncached(...args); }
function inferPreciseCppTypeFromExpression(...args) { return getTypeInference().inferPreciseCppTypeFromExpression(...args); }
function cppArgType(...args) { return getTypeInference().cppArgType(...args); }
function inferDirectNewClassCppType(...args) { return getTypeInference().inferDirectNewClassCppType(...args); }
function inferInitializerCppType(...args) { return getTypeInference().inferInitializerCppType(...args); }
function defaultCppValue(...args) { return getTypeInference().defaultCppValue(...args); }
function castReturnExpression(...args) { return getTypeInference().castReturnExpression(...args); }
function isStringLikeLoweredReturnExpression(...args) { return getTypeInference().isStringLikeLoweredReturnExpression(...args); }
function buildFlattenedWeakMapPropertyWrites(...args) { return getTypeInference().buildFlattenedWeakMapPropertyWrites(...args); }
function collectFunctionBodyStatementNodes(...args) { return getTypeInference().collectFunctionBodyStatementNodes(...args); }
function collectReturnExpressionNodesFromStatement(...args) { return getTypeInference().collectReturnExpressionNodesFromStatement(...args); }
function inferReturnExpressionCppType(...args) { return getTypeInference().inferReturnExpressionCppType(...args); }
function inferFunctionReturnCppType(...args) { return getTypeInference().inferFunctionReturnCppType(...args); }
function inferTopLevelFunctionReturnTypes(...args) { return getTypeInference().inferTopLevelFunctionReturnTypes(...args); }
function refineFunctionReturnTypesWithParameterInfo(...args) { return getTypeInference().refineFunctionReturnTypesWithParameterInfo(...args); }
function refineFunctionReturnTypesWithLoweredExpressions(...args) { return getTypeInference().refineFunctionReturnTypesWithLoweredExpressions(...args); }

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

function tryLowerIifeExpressionStatement(expressionNode, compileContext, indentLevel, options) {
  const callExpressionNode = extractDirectCallExpressionNode(expressionNode);
  if (!callExpressionNode) {
    return null;
  }

  const { memberExprNode, argExprs } = extractCallExpressionMemberAndArgs(callExpressionNode);
  const functionExpressionNode = memberExprNode
    ? findFirstNonterminal(memberExprNode, 'functionExpression')
    : null;
  if (!functionExpressionNode) {
    return null;
  }

  const parameterNames = extractFunctionParameterNames(functionExpressionNode);
  const statementNodes = collectFunctionBodyStatementNodes(functionExpressionNode);
  const hasReturn = statementNodes.some((statementNode) =>
    Boolean(findFirstNonterminal(statementNode, 'returnStatement'))
  );
  const hasLocalDeclaration = statementNodes.some((statementNode) => (
    Boolean(findFirstNonterminal(statementNode, 'variableStatement'))
    || Boolean(findFirstNonterminal(statementNode, 'letDeclaration'))
    || Boolean(findFirstNonterminal(statementNode, 'constDeclaration'))
  ));
  const usesThis = nodeContainsThisReference(functionExpressionNode);
  if (parameterNames.length > 0 || argExprs.length > 0 || hasReturn || hasLocalDeclaration || usesThis) {
    const unsupportedParts = [];
    if (parameterNames.length > 0 || argExprs.length > 0) {
      unsupportedParts.push('parameters or arguments');
    }
    if (hasReturn) {
      unsupportedParts.push('return');
    }
    if (hasLocalDeclaration) {
      unsupportedParts.push('local declarations');
    }
    if (usesThis) {
      unsupportedParts.push('this');
    }
    reportUnsupportedLowering(
      compileContext,
      'iife-unlowerable',
      `IIFE requires unsupported ${unsupportedParts.join(', ')}`
    );
    return [`${indentation(indentLevel)}(void)0;`];
  }

  const lines = [];
  for (const statementNode of statementNodes) {
    resetStatementLoweringState(compileContext);
    lines.push(...lowerStatementNode(statementNode, compileContext, indentLevel, options));
  }
  return lines;
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
  if (directPropertyName !== 'then' && directPropertyName !== 'catch' && directPropertyName !== 'finally') {
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

const { createLiteralLambdaLowering } = require('./ecmascript/literal-lambda-lowering');
let _literalLambdaLowering = null;
function getLiteralLambdaLowering() {
  if (!_literalLambdaLowering) {
    _literalLambdaLowering = createLiteralLambdaLowering({
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
    });
  }
  return _literalLambdaLowering;
}
function collectConsoleConcatExpressionPieces(...args) { return getLiteralLambdaLowering().collectConsoleConcatExpressionPieces(...args); }
function lowerConsoleConcatPieceAsCString(...args) { return getLiteralLambdaLowering().lowerConsoleConcatPieceAsCString(...args); }
function tryLowerConsoleLogConcatExpression(...args) { return getLiteralLambdaLowering().tryLowerConsoleLogConcatExpression(...args); }
function lowerRequiredExpressionValue(...args) { return getLiteralLambdaLowering().lowerRequiredExpressionValue(...args); }
function lowerConsoleLogArgumentExpression(...args) { return getLiteralLambdaLowering().lowerConsoleLogArgumentExpression(...args); }
function lowerConsoleLogCallArguments(...args) { return getLiteralLambdaLowering().lowerConsoleLogCallArguments(...args); }
function lowerConditionalExpressionValue(...args) { return getLiteralLambdaLowering().lowerConditionalExpressionValue(...args); }
function lowerMemberExpressionNewCallValue(...args) { return getLiteralLambdaLowering().lowerMemberExpressionNewCallValue(...args); }
function extractObjectLiteralProperties(...args) { return getLiteralLambdaLowering().extractObjectLiteralProperties(...args); }
function extractObjectLiteralOperations(...args) { return getLiteralLambdaLowering().extractObjectLiteralOperations(...args); }
function lowerObjectLiteralValue(...args) { return getLiteralLambdaLowering().lowerObjectLiteralValue(...args); }
function extractArrayLiteralElements(...args) { return getLiteralLambdaLowering().extractArrayLiteralElements(...args); }
function lowerAdvancedArrayLiteralValue(...args) { return getLiteralLambdaLowering().lowerAdvancedArrayLiteralValue(...args); }
function takePreludeStatements(...args) { return getLiteralLambdaLowering().takePreludeStatements(...args); }
function beginDeferredPromiseQueueScope(...args) { return getLiteralLambdaLowering().beginDeferredPromiseQueueScope(...args); }
function enqueueDeferredPromiseStatement(...args) { return getLiteralLambdaLowering().enqueueDeferredPromiseStatement(...args); }
function takeDeferredPromiseStatements(...args) { return getLiteralLambdaLowering().takeDeferredPromiseStatements(...args); }
function resetStatementLoweringState(...args) { return getLiteralLambdaLowering().resetStatementLoweringState(...args); }
function lowerArrayLiteralValue(...args) { return getLiteralLambdaLowering().lowerArrayLiteralValue(...args); }
function extractLambdaParameterNames(...args) { return getLiteralLambdaLowering().extractLambdaParameterNames(...args); }
function extractLambdaParameterDefaultExpressions(...args) { return getLiteralLambdaLowering().extractLambdaParameterDefaultExpressions(...args); }
function extractLambdaBodyNode(...args) { return getLiteralLambdaLowering().extractLambdaBodyNode(...args); }
function collectAvailableLambdaCaptureNames(...args) { return getLiteralLambdaLowering().collectAvailableLambdaCaptureNames(...args); }
function collectLambdaCaptureNames(...args) { return getLiteralLambdaLowering().collectLambdaCaptureNames(...args); }
function getLambdaRuntimeHookName(...args) { return getLiteralLambdaLowering().getLambdaRuntimeHookName(...args); }
function getLambdaRuntimeFunctionId(...args) { return getLiteralLambdaLowering().getLambdaRuntimeFunctionId(...args); }
function lowerArrowFunctionValue(...args) { return getLiteralLambdaLowering().lowerArrowFunctionValue(...args); }
function normalizeJsStringLiteralForCpp(...args) { return getLiteralLambdaLowering().normalizeJsStringLiteralForCpp(...args); }
function lowerLiteralValue(...args) { return getLiteralLambdaLowering().lowerLiteralValue(...args); }
const { createExpressionLowering } = require('./ecmascript/expression-lowering');
let _expressionLowering = null;
function getExpressionLowering() {
  if (!_expressionLowering) {
    _expressionLowering = createExpressionLowering({
      EXPR_PASSTHROUGH_NODES,
      INFIX_EXPRESSION_NODES,
      SUPPORTED_INFIX_OPERATORS,
      INT_ONLY_INFIX_OPERATORS,
      err,
      extractArrayLiteralElements,
      extractCallExpressionMemberAndArgs,
      extractComputedMemberAccessInfo,
      extractDirectArrowFunctionInitializer,
      extractDirectCallExpressionNode,
      extractDirectFunctionExpressionInitializer,
      extractObjectLiteralProperties,
      extractOutermostCallMemberExpression,
      extractPathFromMemberExpression,
      findBoundClassInstanceTypeAtNode,
      findEnclosingClassNameAtNode,
      findFirstPromiseThenCallExpression,
      inferExprType,
      isBoundVariableInitializedWithCallPathAtNode,
      isBoundVariableInitializedWithHostCtorAtNode,
      isDirectNullishExpression,
      lowerArrayLiteralValue,
      lowerArrowFunctionValue,
      lowerCallExpressionValue,
      lowerComputedMemberAccessValue,
      lowerConditionalExpressionValue,
      lowerConsoleConcatPieceAsCString,
      lowerIdentifierValue,
      lowerLiteralValue,
      lowerMemberExpressionNewCallValue,
      lowerObjectLiteralValue,
      lowerOpaqueMemberAccessChain,
      lowerStaticModelToExpression,
      mapInfixOperator,
      reportUnsupportedLowering,
      resolveStaticMemberAccessExpression,
      resolveStaticModelFromExpression,
      sanitizeCppIdentifier,
      staticStringLiteralCpp,
      tryLowerConsoleLogConcatExpression,
      tryLowerStaticPromiseThenChain,
      unwrapDirectIdentifierExpression
    });
  }
  return _expressionLowering;
}
function lowerIdentifierFromLeftHandSideExpression(...args) { return getExpressionLowering().lowerIdentifierFromLeftHandSideExpression(...args); }
function lowerAssignmentExpressionValue(...args) { return getExpressionLowering().lowerAssignmentExpressionValue(...args); }
function lowerPostfixExpressionValue(...args) { return getExpressionLowering().lowerPostfixExpressionValue(...args); }
function lowerUnaryExpressionValue(...args) { return getExpressionLowering().lowerUnaryExpressionValue(...args); }
function isFractionalNumericExpression(...args) { return getExpressionLowering().isFractionalNumericExpression(...args); }
function isDynamicHandleMemberExpression(...args) { return getExpressionLowering().isDynamicHandleMemberExpression(...args); }
function lowerDynamicHandleMemberAsF64(...args) { return getExpressionLowering().lowerDynamicHandleMemberAsF64(...args); }
function getCallExpressionTrailingPropertyName(...args) { return getExpressionLowering().getCallExpressionTrailingPropertyName(...args); }
function getCallExpressionTrailingPropertyNames(...args) { return getExpressionLowering().getCallExpressionTrailingPropertyNames(...args); }
function isDynamicHandleMethodCall(...args) { return getExpressionLowering().isDynamicHandleMethodCall(...args); }
function isDynamicHandleMethodPropertyCall(...args) { return getExpressionLowering().isDynamicHandleMethodPropertyCall(...args); }
function lowerDynamicHandleMethodPropertyAsF64(...args) { return getExpressionLowering().lowerDynamicHandleMethodPropertyAsF64(...args); }
function lowerDynamicHandleMethodPropertyAsString(...args) { return getExpressionLowering().lowerDynamicHandleMethodPropertyAsString(...args); }
function lowerDynamicHandleMethodAsNumeric(...args) { return getExpressionLowering().lowerDynamicHandleMethodAsNumeric(...args); }
function lowerDynamicHandleMethodAsString(...args) { return getExpressionLowering().lowerDynamicHandleMethodAsString(...args); }
function getDynamicHandleMethodCallInfo(...args) { return getExpressionLowering().getDynamicHandleMethodCallInfo(...args); }
function tryLowerDynamicHandleAggregateValue(...args) { return getExpressionLowering().tryLowerDynamicHandleAggregateValue(...args); }
function tryLowerDynamicHandleArgument(...args) { return getExpressionLowering().tryLowerDynamicHandleArgument(...args); }
function tryLowerDynamicHandleMethodCall(...args) { return getExpressionLowering().tryLowerDynamicHandleMethodCall(...args); }
function lowerInfixExpressionValue(...args) { return getExpressionLowering().lowerInfixExpressionValue(...args); }
function lowerExponentiationExpressionValue(...args) { return getExpressionLowering().lowerExponentiationExpressionValue(...args); }
function lowerExpressionValue(...args) { return getExpressionLowering().lowerExpressionValue(...args); }
const { createRuntimeEmitters } = require('./ecmascript/runtime-emitters');
let _runtimeEmitters = null;
function getRuntimeEmitters() {
  if (!_runtimeEmitters) {
    _runtimeEmitters = createRuntimeEmitters({
      walk,
      findFirstNonterminal,
      extractObjectLiteralProperties,
      extractObjectLiteralOperations,
      collectTopLevelConstructorFunctionExpressionBindings,
      extractArrayLiteralElements,
      extractLambdaParameterNames,
      collectLambdaCaptureNames,
      getLambdaRuntimeHookName,
      getLambdaRuntimeFunctionId,
      collectTopLevelBindingNames,
      collectTopLevelFunctionNames
    });
  }
  return _runtimeEmitters;
}
function collectObjectLiteralArities(tree, compileContext = null) { return getRuntimeEmitters().collectObjectLiteralArities(tree, compileContext); }
function emitObjectLiteralRuntimeDeclsCpp(tree, compileContext = null) { return getRuntimeEmitters().emitObjectLiteralRuntimeDeclsCpp(tree, compileContext); }
function emitSharedRuntimeFallbackHelpersCpp(tree, compileContext = null) { return getRuntimeEmitters().emitSharedRuntimeFallbackHelpersCpp(tree, compileContext); }
function emitObjectLiteralRuntimeFallbackCpp(tree, compileContext = null) { return getRuntimeEmitters().emitObjectLiteralRuntimeFallbackCpp(tree, compileContext); }
function collectArrayLiteralArities(tree) { return getRuntimeEmitters().collectArrayLiteralArities(tree); }
function emitArrayLiteralRuntimeDeclsCpp(tree) { return getRuntimeEmitters().emitArrayLiteralRuntimeDeclsCpp(tree); }
function emitArrayLiteralRuntimeFallbackCpp(tree) { return getRuntimeEmitters().emitArrayLiteralRuntimeFallbackCpp(tree); }
function collectLambdaSignatures(tree) { return getRuntimeEmitters().collectLambdaSignatures(tree); }
function emitLambdaRuntimeDeclsCpp(tree) { return getRuntimeEmitters().emitLambdaRuntimeDeclsCpp(tree); }
function emitLambdaRuntimeFallbackCpp(tree) { return getRuntimeEmitters().emitLambdaRuntimeFallbackCpp(tree); }

const { createCallLowering } = require('./ecmascript/call-lowering');
let _callLowering = null;
function getCallLowering() {
  if (!_callLowering) {
    _callLowering = createCallLowering({
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
    });
  }
  return _callLowering;
}
function isSideEffectFreeInlineArgument(...args) { return getCallLowering().isSideEffectFreeInlineArgument(...args); }
function isUnshadowedUndefinedExpression(...args) { return getCallLowering().isUnshadowedUndefinedExpression(...args); }
function lowerImmediateCapturedArrowCall(...args) { return getCallLowering().lowerImmediateCapturedArrowCall(...args); }
function isDirectExpressionStatementCall(...args) { return getCallLowering().isDirectExpressionStatementCall(...args); }
function lowerImmediateCapturedArrowBlockCall(...args) { return getCallLowering().lowerImmediateCapturedArrowBlockCall(...args); }
function lowerStaticCapturedForEachCallbacks(...args) { return getCallLowering().lowerStaticCapturedForEachCallbacks(...args); }
function lowerCallExpressionValue(...args) { return getCallLowering().lowerCallExpressionValue(...args); }
function collectHostSignatures(tree, compileContext) {
  const signatures = new Map();
  const usedAsValueHosts = new Set();
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
    if (pathSegments && pathSegments.length >= 2 && !['console', 'Math', 'Object', 'Reflect', 'Promise', 'Atomics', 'Array', 'JSON', 'String', 'Number'].includes(pathSegments[0])) {
      const nPath = compileContext && compileContext.tree ? findNodePath(compileContext.tree, node) : null;
      const isValueUsed = Array.isArray(nPath) && nPath.some((anc) => anc && anc.kind === 'nonterminal' && (anc.name === 'variableDeclaration' || anc.name === 'initializer' || anc.name === 'assignmentExpression' || anc.name === 'returnStatement' || anc.name === 'ifStatement'));
      if (isValueUsed) {
        usedAsValueHosts.add(host);
      }
    }
    const inferredArgTypes = host === '__console__log'
      ? (argExprs.length > 0 ? ['string'] : [])
      : reflectiveHostArgTypes.has(host)
        ? reflectiveHostArgTypes.get(host).slice(0, argExprs.length)
      : reflectiveObjectHosts.has(host)
        ? argExprs.map(() => 'object')
      : argExprs.map((argExpr) => {
          const t = inferExprType(argExpr, compileContext);
          if (t === 'number' && usedAsValueHosts.has(host)) {
            const m = resolveStaticModelFromExpression(argExpr, argExpr, compileContext);
            if (m && m.kind === 'number' && Number.isInteger(m.value)) return 'int';
          }
          return t;
        });
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
  signatures._usedAsValueHosts = usedAsValueHosts;
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
const { createStatementLowering } = require('./ecmascript/statement-lowering');
let _statementLowering = null;
function getStatementLowering() {
  if (!_statementLowering) {
    _statementLowering = createStatementLowering({
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
    });
  }
  return _statementLowering;
}
function extractArrayBindingIdentifiers(...args) { return getStatementLowering().extractArrayBindingIdentifiers(...args); }
function extractSimpleArrayBindingEntries(...args) { return getStatementLowering().extractSimpleArrayBindingEntries(...args); }
function extractObjectBindingIdentifiers(...args) { return getStatementLowering().extractObjectBindingIdentifiers(...args); }
function extractSimpleObjectBindingEntries(...args) { return getStatementLowering().extractSimpleObjectBindingEntries(...args); }
function extractVariableDeclarations(...args) { return getStatementLowering().extractVariableDeclarations(...args); }
function extractVariableDeclarationName(...args) { return getStatementLowering().extractVariableDeclarationName(...args); }
function extractVariableDeclarationInitializer(...args) { return getStatementLowering().extractVariableDeclarationInitializer(...args); }
function lowerVariableDeclarations(...args) { return getStatementLowering().lowerVariableDeclarations(...args); }
function indentation(...args) { return getStatementLowering().indentation(...args); }
function isIterationStatementNode(...args) { return getStatementLowering().isIterationStatementNode(...args); }
function allocateLabelTarget(...args) { return getStatementLowering().allocateLabelTarget(...args); }
function lowerStatementNode(...args) { return getStatementLowering().lowerStatementNode(...args); }
function lowerProgramToCppStatements(...args) { return getStatementLowering().lowerProgramToCppStatements(...args); }
function extractFunctionParameterNames(functionNode) {
  if (!functionNode
    || functionNode.kind !== 'nonterminal'
    || (functionNode.name !== 'functionDeclaration' && functionNode.name !== 'functionExpression' && functionNode.name !== 'methodDefinition')) {
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

function setupFunctionBoxedScope(fnNode, compileContext, bodyLines) {
  const prevBoxedVars = compileContext.activeBoxedVars || null;
  const prevLocalVariables = compileContext.localVariables;
  const prevInlineIdentifierExpressions = compileContext.inlineIdentifierExpressions;
  const scope = compileContext && compileContext.closurePlan && compileContext.closurePlan.scopesByNode
    ? compileContext.closurePlan.scopesByNode.get(fnNode)
    : null;
  const boxedVars = scope ? scope.boxedVars : new Set();
  const paramNames = scope && Array.isArray(scope.params)
    ? scope.params
    : extractFunctionParameterNames(fnNode);
  compileContext.activeBoxedVars = boxedVars;
  compileContext.localVariables = new Map(prevLocalVariables);
  compileContext.inlineIdentifierExpressions = new Map(prevInlineIdentifierExpressions);

  for (const paramName of paramNames) {
    if (boxedVars.has(paramName)) {
      bodyLines.push(`  int* __cell_${paramName} = new int[1];`);
      bodyLines.push(`  __cell_${paramName}[0] = (int)(${paramName});`);
      compileContext.inlineIdentifierExpressions.set(paramName, `__cell_${paramName}[0]`);
    }
    compileContext.localVariables.set(paramName, 'int');
  }

  return () => {
    compileContext.activeBoxedVars = prevBoxedVars;
    compileContext.localVariables = prevLocalVariables;
    compileContext.inlineIdentifierExpressions = prevInlineIdentifierExpressions;
  };
}

const { createCppEmitters } = require('./ecmascript/cpp-emitters');
let _cppEmitters = null;
function getCppEmitters() {
  if (!_cppEmitters) {
    _cppEmitters = createCppEmitters({
      beginDeferredPromiseQueueScope,
      buildCppParamsFromFunctionNode,
      castReturnExpression,
      collectArgumentExpressions,
      collectFunctionBodyStatementNodes,
      collectTopLevelArrowFunctionBindings,
      collectTopLevelAssignedFunctionExpressionBindings,
      collectTopLevelCallArgumentFunctionExpressionBindings,
      collectTopLevelClassDeclarations,
      collectTopLevelConstructorFunctionExpressionBindings,
      collectTopLevelForEachArrowFunctionBindings,
      collectTopLevelFunctionDeclarations,
      collectTopLevelFunctionExpressionBindings,
      collectTopLevelObjectLiteralFunctionExpressionBindings,
      defaultCppValue,
      err,
      extractCallableReturnExpressionNode,
      extractClassDeclarationName,
      extractClassHeritageName,
      extractClassMethodEntries,
      extractFormalParameterNamesFromNode,
      extractFunctionDeclarationName,
      extractFunctionParameterNames,
      extractMethodDefinitionName,
      extractMethodParameterNames,
      extractStatementsFromScopeContainer,
      extractTopLevelStatementNodes,
      lowerExpressionValue,
      lowerStatementNode,
      reportUnsupportedLowering,
      resetStatementLoweringState,
      rewriteConstructorThisReferences,
      rewriteObjectLiteralMethodThisReferences,
      sanitizeCppIdentifier,
      setupFunctionBoxedScope,
      takeDeferredPromiseStatements,
      takePreludeStatements
    });
  }
  return _cppEmitters;
}
function emitClosureImplementationsCpp(...args) { return getCppEmitters().emitClosureImplementationsCpp(...args); }
function emitTopLevelFunctionDefinitions(...args) { return getCppEmitters().emitTopLevelFunctionDefinitions(...args); }
function emitTopLevelFunctionPrototypes(...args) { return getCppEmitters().emitTopLevelFunctionPrototypes(...args); }
function pruneUnusedGeneratedFunctionsCpp(...args) { return getCppEmitters().pruneUnusedGeneratedFunctionsCpp(...args); }
function rewriteClassMethodBodyLinesForWrapper(...args) { return getCppEmitters().rewriteClassMethodBodyLinesForWrapper(...args); }
function getClassInitWrapperName(...args) { return getCppEmitters().getClassInitWrapperName(...args); }
function getClassInitWrapperMangledName(...args) { return getCppEmitters().getClassInitWrapperMangledName(...args); }
function getClassMethodWrapperName(...args) { return getCppEmitters().getClassMethodWrapperName(...args); }
function emitTopLevelClassDefinitions(...args) { return getCppEmitters().emitTopLevelClassDefinitions(...args); }
function buildAsyncRuntimeBridgePlan(...args) { return getCppEmitters().buildAsyncRuntimeBridgePlan(...args); }
function collectTopLevelAsyncFunctionDeclarations(...args) { return getCppEmitters().collectTopLevelAsyncFunctionDeclarations(...args); }
function findStatementWrapping(...args) { return getCppEmitters().findStatementWrapping(...args); }
function emitGeneratorFunctionsCpp(...args) { return getCppEmitters().emitGeneratorFunctionsCpp(...args); }
function emitPromiseAsyncFunctionsCpp(...args) { return getCppEmitters().emitPromiseAsyncFunctionsCpp(...args); }

const { createCppCodegen } = require('./ecmascript/cpp-codegen');
let _cppCodegen = null;
function getCppCodegen() {
  if (!_cppCodegen) {
    _cppCodegen = createCppCodegen({
      beginDeferredPromiseQueueScope,
      buildAsyncRuntimeBridgePlan,
      collectArgumentExpressions,
      collectHostConstructorSymbols,
      collectHostSignatures,
      cppArgType,
      defaultCppValue,
      emitArrayLiteralRuntimeDeclsCpp,
      emitArrayLiteralRuntimeFallbackCpp,
      emitClosureImplementationsCpp,
      emitGeneratorFunctionsCpp,
      emitLambdaRuntimeDeclsCpp,
      emitLambdaRuntimeFallbackCpp,
      emitObjectLiteralRuntimeDeclsCpp,
      emitObjectLiteralRuntimeFallbackCpp,
      emitPromiseAsyncFunctionsCpp,
      emitSharedRuntimeFallbackHelpersCpp,
      emitTopLevelClassDefinitions,
      emitTopLevelFunctionDefinitions,
      emitTopLevelFunctionPrototypes,
      extractCallExpressionMemberAndArgs,
      extractDirectCallExpressionNode,
      extractOutermostCallMemberExpression,
      extractPathFromMemberExpression,
      extractVariableDeclarationInitializer,
      extractVariableDeclarationName,
      extractVariableDeclarations,
      inferInitializerCppType,
      lowerExpressionValue,
      lowerProgramToCppStatements,
      lowerStatementNode,
      profileStep,
      reportUnsupportedLowering,
      resetStatementLoweringState,
      takeDeferredPromiseStatements,
      tryLowerConsoleLogConcatExpression
    });
  }
  return _cppCodegen;
}
function generateCpp(...args) { return getCppCodegen().generateCpp(...args); }
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
