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

function emitPlaceholderCpp(inputPath, hostCalls) {
  const base = path.basename(inputPath);
  const uniqueHostFns = Array.from(new Set(hostCalls.map((c) => c.host)));
  const hostFnDecls = uniqueHostFns
    .map((hostFn) => `extern void ${hostFn}(const char*);`)
    .join('\n');
  const hostMapComments = hostCalls.length === 0
    ? '// Host-call map: (none detected)\n'
    : hostCalls.map((call) => `// Host-call map: ${call.source} -> ${call.host}`).join('\n') + '\n';

  return `// Auto-generated by ecmascript-compiler.js\n`
    + `// Source: ${base}\n`
    + `// NOTE: Placeholder backend. Replace with full ES->C++98 lowering.\n`
    + `${hostMapComments}\n`
    + `#include <stdio.h>\n\n`
    + `${hostFnDecls}${hostFnDecls ? '\n\n' : ''}`
    + `int main() {\n`
    + `  puts(\"ecmascript-compiler placeholder output\");\n`
    + `  puts(\"AST nodes captured: yes\");\n`
    + `  puts(\"Host-call mapping stage: enabled\");\n`
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
    fs.writeFileSync(options.cppOut, emitPlaceholderCpp(inputPath, hostCalls));
  }
}

main();
