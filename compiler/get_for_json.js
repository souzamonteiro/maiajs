'use strict';

const fs = require('fs');
const path = require('path');
const Parser = require('./ecmascript-parser');
const { ParseTreeCollector } = require('./parse-tree-collector');

const sourcePath = path.join(__dirname, 'examples', 'test.js');
const source = fs.readFileSync(sourcePath, 'utf8');

const collector = new ParseTreeCollector();
const parser = new Parser(source, collector);

try {
  collector.parse(parser);
} catch (err) {
  process.exit(1);
}

const root = collector.root;

function findNodes(node, name, results = []) {
  if (node.name === name) {
    results.push(node);
  }
  if (node.children) {
    for (const child of node.children) {
      findNodes(child, name, results);
    }
  }
  return results;
}

const forNodes = findNodes(root, 'iterationStatement').filter(node => 
  node.children && node.children[0] && node.children[0].token === 'TOKEN_for'
);

function getSubtreeSummary(node, maxDepth, currentDepth = 0) {
  if (currentDepth >= maxDepth) return undefined;
  
  const summary = {};
  if (node.name) summary.name = node.name;
  if (node.token) summary.token = node.token;
  if (node.value) summary.value = node.value;
  
  if (node.children && currentDepth + 1 < maxDepth) {
    const children = node.children
      .map(child => getSubtreeSummary(child, maxDepth, currentDepth + 1))
      .filter(c => c !== undefined);
    if (children.length > 0) summary.children = children;
  }
  return summary;
}

function hasLexicalDeclaration(node) {
    if (node.name === 'lexicalDeclaration') return true;
    if (node.children) {
        return node.children.some(hasLexicalDeclaration);
    }
    return false;
}

const target = forNodes.find(hasLexicalDeclaration);

if (target) {
    console.log(JSON.stringify(getSubtreeSummary(target, 6), null, 2));
}
