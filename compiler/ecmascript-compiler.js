#!/usr/bin/env node

'use strict';

const fs = require('fs');
const path = require('path');
const Parser = require('./ecmascript-parser');
const { ParseTreeCollector, printTree } = require('./parse-tree-collector');
const { HostRegistry } = require('./ecmascript/host-registry');

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

function extractHostCallsFromTree(tree, hostRegistry) {
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

    const host = hostRegistry.resolvePath(pathSegments);
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

function inferExprType(node) {
  if (!node || node.kind !== 'nonterminal') { return 'any'; }
  if (EXPR_PASSTHROUGH_NODES.has(node.name)) {
    const ntc = (node.children || []).filter((c) => c.kind === 'nonterminal');
    return ntc.length === 1 ? inferExprType(ntc[0]) : 'any';
  }
  if (node.name === 'primaryExpression') {
    const litChild = (node.children || []).find((c) => c.kind === 'nonterminal' && c.name === 'literal');
    return litChild ? inferExprType(litChild) : 'any';
  }
  if (node.name === 'literal') {
    for (const child of (node.children || [])) {
      if (child.kind !== 'nonterminal') { continue; }
      if (child.name === 'stringLiteral') { return 'string'; }
      if (child.name === 'numericLiteral') { return 'number'; }
      if (child.name === 'booleanLiteral') { return 'bool'; }
      if (child.name === 'nullLiteral') { return 'null'; }
    }
  }
  return 'any';
}

function cppArgType(jsType) {
  const typeMap = { string: 'const char*', number: 'double', bool: 'int', null: 'void*' };
  return typeMap[jsType] || 'void*';
}

function collectArgumentExpressions(argListNode) {
  const result = [];
  function collect(node) {
    if (!node || node.name !== 'argumentList') { return; }
    const children = node.children || [];
    if (children[0] && children[0].kind === 'nonterminal' && children[0].name === 'argumentList') {
      collect(children[0]);
      const expr = children.find((c, i) => i > 0 && c.kind === 'nonterminal' && c.name === 'assignmentExpression');
      if (expr) { result.push(expr); }
    } else {
      const expr = children.find((c) => c.kind === 'nonterminal' && c.name === 'assignmentExpression');
      if (expr) { result.push(expr); }
    }
  }
  collect(argListNode);
  return result;
}

function lowerLiteralValue(node) {
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
  }
  return null;
}

function lowerExpressionValue(node, hostRegistry) {
  if (!node || node.kind !== 'nonterminal') { return null; }
  if (EXPR_PASSTHROUGH_NODES.has(node.name)) {
    const ntc = (node.children || []).filter((c) => c.kind === 'nonterminal');
    return ntc.length === 1 ? lowerExpressionValue(ntc[0], hostRegistry) : null;
  }
  if (node.name === 'callExpression') { return lowerCallExpressionValue(node, hostRegistry); }
  if (node.name === 'primaryExpression') {
    for (const child of (node.children || [])) {
      if (child.kind === 'terminal' && child.token === 'TOKEN_this') { return 'this'; }
      if (child.kind === 'nonterminal') {
        if (child.name === 'literal') { return lowerLiteralValue(child); }
        if (child.name === 'identifier') { return findFirstIdentifierValue(child); }
      }
    }
  }
  return null;
}

function lowerCallExpressionValue(node, hostRegistry) {
  const children = node.children || [];
  const memberExprNode = children.find((c) => c && c.kind === 'nonterminal' && c.name === 'memberExpression');
  const argsNode = children.find((c) => c && c.kind === 'nonterminal' && c.name === 'arguments');
  if (!memberExprNode || !argsNode) { return null; }

  const pathSegments = extractPathFromMemberExpression(memberExprNode);
  if (!pathSegments || pathSegments.length === 0) { return null; }

  const hostSymbol = hostRegistry.resolvePath(pathSegments);
  if (!hostSymbol) { return null; }

  const argListNode = (argsNode.children || []).find((c) => c.kind === 'nonterminal' && c.name === 'argumentList');
  const argExprs = argListNode ? collectArgumentExpressions(argListNode) : [];
  const args = argExprs.map((expr) => {
    const val = lowerExpressionValue(expr, hostRegistry);
    return val !== null ? val : '/* expr */';
  }).join(', ');

  return `${hostSymbol}(${args})`;
}

function collectHostSignatures(tree, hostRegistry) {
  const signatures = new Map();
  walk(tree, (node) => {
    if (!node || node.kind !== 'nonterminal' || node.name !== 'callExpression') { return; }
    const children = node.children || [];
    const memberExprNode = children.find((c) => c && c.kind === 'nonterminal' && c.name === 'memberExpression');
    const argsNode = children.find((c) => c && c.kind === 'nonterminal' && c.name === 'arguments');
    if (!memberExprNode || !argsNode) { return; }
    const pathSegments = extractPathFromMemberExpression(memberExprNode);
    if (!pathSegments) { return; }
    const host = hostRegistry.resolvePath(pathSegments);
    if (!host || signatures.has(host)) { return; }
    const argListNode = (argsNode.children || []).find((c) => c.kind === 'nonterminal' && c.name === 'argumentList');
    const argExprs = argListNode ? collectArgumentExpressions(argListNode) : [];
    signatures.set(host, argExprs.map(inferExprType));
  });
  return signatures;
}

function lowerProgramToCppStatements(tree, hostRegistry) {
  const lines = [];
  for (const child of (tree.children || [])) {
    if (!child || child.kind !== 'nonterminal' || child.name !== 'sourceElement') { continue; }
    const stmtNode = (child.children || []).find((c) => c.kind === 'nonterminal' && c.name === 'statement');
    if (!stmtNode) { continue; }
    const exprStmtNode = (stmtNode.children || []).find((c) => c.kind === 'nonterminal' && c.name === 'expressionStatement');
    if (!exprStmtNode) {
      lines.push('  // [statement not yet lowered]');
      continue;
    }
    const exprNode = (exprStmtNode.children || []).find((c) => c.kind === 'nonterminal' && c.name === 'expression');
    if (!exprNode) { continue; }
    const lowered = lowerExpressionValue(exprNode, hostRegistry);
    lines.push(lowered !== null ? `  ${lowered};` : '  // [expression not yet lowered]');
  }
  return lines;
}

function generateCpp(inputPath, tree, hostCalls, hostRegistry) {
  const base = path.basename(inputPath);

  const signatures = collectHostSignatures(tree, hostRegistry);
  const hostDecls = Array.from(signatures.entries())
    .map(([fn, argTypes]) => {
      const cppArgs = argTypes.length === 0 ? 'void' : argTypes.map(cppArgType).join(', ');
      return `extern void ${fn}(${cppArgs});`;
    })
    .join('\n');

  const hostMapComments = hostCalls.length === 0
    ? '// Host-call map: (none detected)'
    : hostCalls.map((call) => `// Host-call map: ${call.source} -> ${call.host}`).join('\n');

  const statements = lowerProgramToCppStatements(tree, hostRegistry);
  const body = statements.length > 0 ? statements.join('\n') : '  // empty program';

  return `// Auto-generated by ecmascript-compiler.js\n`
    + `// Source: ${base}\n`
    + `${hostMapComments}\n\n`
    + `${hostDecls}${hostDecls ? '\n\n' : ''}`
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
  const hostCalls = extractHostCallsFromTree(tree, hostRegistry);

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
    const ir = {
      version: 1,
      kind: 'placeholder-ir',
      source: inputPath,
      hostInterop: {
        strategy: hostRegistry.strategy(),
        mappings: hostRegistry.listMappings(),
        detectedCalls: hostCalls
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
    fs.writeFileSync(options.cppOut, generateCpp(inputPath, tree, hostCalls, hostRegistry));
  }
}

main();
