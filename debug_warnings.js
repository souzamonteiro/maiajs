#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Read and parse compiler with warning tracking
const compilerCode = fs.readFileSync('./compiler/ecmascript-compiler.js', 'utf8');

// Instrument reportUnsupportedLowering to collect source info
const lines = compilerCode.split('\n');
const warningLog = [];

// Find all diagnostic codes
const diagnosticCodes = new Set();
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (line.includes("'infix-expression-unlowerable'") ||
      line.includes("'postfix-expression-unlowerable'") ||
      line.includes("'unary-expression-unlowerable'") ||
      line.includes("'call-expression-unlowerable'") ||
      line.includes("'conditional-expression-unlowerable'") ||
      line.includes("'assignment-expression-unlowerable'") ||
      line.includes("'expression-statement-unlowerable'") ||
      line.includes("'member-expression-path-unlowerable'")) {
    
    // Extract function name from context
    let funcName = '';
    for (let j = i; j >= Math.max(0, i - 50); j--) {
      if (lines[j].includes('function ')) {
        const match = lines[j].match(/function\s+(\w+)/);
        if (match) {
          funcName = match[1];
          break;
        }
      }
    }
    
    const codeMatch = line.match(/'([^']+)'/);
    if (codeMatch) {
      console.log(`Line ${i + 1}: ${funcName} -> ${codeMatch[1]}`);
    }
  }
}
