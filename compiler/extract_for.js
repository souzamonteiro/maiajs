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
  console.error(err);
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

const forNodes = findNodes(root, 'iterationStatement');

function getSubtreeSummary(node, maxDepth, currentDepth = 0) {
  if (currentDepth >= maxDepth) return null;
  const summary = { name: node.name || node.token || node.kind };
  if (node.children && currentDepth + 1 < maxDepth) {
    summary.children = node.children.map(child => getSubtreeSummary(child, maxDepth, currentDepth + 1));
  }
  return summary;
}

const findings = forNodes.map((node, index) => {
  if (node.children && node.children[0] && node.children[0].token === 'TOKEN_for') {
    const immediateChildren = node.children.map(c => ({
      kind: c.kind,
      name: c.name,
      token: c.token,
      value: c.value
    }));

    let semiColonCount = 0;
    function countSemiColons(n) {
      if (n.token === 'TOKEN__3B_' || (n.token && n.token.includes('3B'))) {
        semiColonCount++;
      }
      if (n.children) {
        for (const child of n.children) {
          countSemiColons(child);
        }
      }
    }
    countSemiColons(node);

    return {
      index,
      immediateChildren,
      semiColonCount,
      subtreeSummary: getSubtreeSummary(node, 3)
    };
  }
  return null;
}).filter(n => n !== null);

console.log(JSON.stringify(findings, null, 2));

// Print one representative raw structure
if (forNodes.length > 0) {
    console.log('\nRepresentative Raw Structure:');
    console.log(JSON.stringify(forNodes[0], null, 2));
}

