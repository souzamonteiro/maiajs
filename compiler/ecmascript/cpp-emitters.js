'use strict';

const {
  findFirstIdentifierValue,
  findFirstNonterminal,
  nodeContainsTarget,
  walk
} = require('./ast-utils');

function createCppEmitters(deps) {
  const {
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
  } = deps;

  function emitClosureImplementationsCpp(compileContext) {
    const closurePlan = compileContext && compileContext.closurePlan;
    if (!closurePlan || !Array.isArray(closurePlan.orderedClosures) || closurePlan.orderedClosures.length === 0) {
      return '';
    }

    const impls = [];
    for (const c of closurePlan.orderedClosures) {
      const retType = c.returnTypeCpp || 'int';
      const paramDecls = ['void* __maia_env'];
      for (let i = 0; i < c.params.length; i += 1) {
        paramDecls.push(`int ${sanitizeCppIdentifier(c.params[i])}`);
      }

      const prevBoxedVars = compileContext.activeBoxedVars || null;
      const prevLocalVariables = compileContext.localVariables;
      const prevInlineIdentifierExpressions = compileContext.inlineIdentifierExpressions;
      compileContext.activeBoxedVars = c.boxedVars || new Set();
      compileContext.localVariables = new Map();
      compileContext.inlineIdentifierExpressions = new Map();

      const bodyLines = [];
      if (Array.isArray(c.captures) && c.captures.length > 0) {
        bodyLines.push('  int* __maia_env_arr = (int*)__maia_env;');
        for (let i = 0; i < c.captures.length; i += 1) {
          const cap = c.captures[i];
          if (cap.isBoxed) {
            bodyLines.push(`  int* __cell_${cap.name} = (int*)__maia_env_arr[${i}];`);
            compileContext.inlineIdentifierExpressions.set(cap.name, `__cell_${cap.name}[0]`);
          } else {
            bodyLines.push(`  int __cap_${cap.name} = __maia_env_arr[${i}];`);
            compileContext.inlineIdentifierExpressions.set(cap.name, `__cap_${cap.name}`);
          }
          compileContext.localVariables.set(cap.name, 'int');
        }
      }

      for (const paramName of c.params) {
        if (compileContext.activeBoxedVars.has(paramName)) {
          bodyLines.push(`  int* __cell_${paramName} = new int[1];`);
          bodyLines.push(`  __cell_${paramName}[0] = (int)(${paramName});`);
          compileContext.inlineIdentifierExpressions.set(paramName, `__cell_${paramName}[0]`);
        }
        compileContext.localVariables.set(paramName, 'int');
      }

      beginDeferredPromiseQueueScope(compileContext);
      const statementNodes = collectFunctionBodyStatementNodes(c.node);
      if (statementNodes.length > 0) {
        for (const statementNode of statementNodes) {
          resetStatementLoweringState(compileContext);
          bodyLines.push(...lowerStatementNode(statementNode, compileContext, 1, { returnTypeCpp: retType }));
        }
      } else {
        const returnExprNode = extractCallableReturnExpressionNode(c.node);
        if (returnExprNode) {
          const loweredReturn = lowerExpressionValue(returnExprNode, compileContext);
          if (loweredReturn !== null) {
            bodyLines.push(...takePreludeStatements(compileContext, '  '));
            if (/^__console__log\(/.test(loweredReturn.trim())) {
              bodyLines.push(`  ${loweredReturn};`);
            } else {
              bodyLines.push(`  return ${castReturnExpression(loweredReturn, retType)};`);
            }
          }
        }
      }
      bodyLines.push(...takeDeferredPromiseStatements(compileContext, '  '));
      if (!bodyLines.some((line) => /^\s*return\b/.test(line))) {
        bodyLines.push(`  return ${defaultCppValue(retType)};`);
      }

      compileContext.activeBoxedVars = prevBoxedVars;
      compileContext.localVariables = prevLocalVariables;
      compileContext.inlineIdentifierExpressions = prevInlineIdentifierExpressions;

      impls.push(
        `static ${retType} __maia_closure_impl_${c.fnId}(${paramDecls.join(', ')}) {\n`
        + `${bodyLines.join('\n')}\n`
        + `}`
      );
    }

    return impls.join('\n\n');
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
      const restoreScope = setupFunctionBoxedScope(functionDeclaration, compileContext, bodyLines);
      beginDeferredPromiseQueueScope(compileContext);
      for (const statementNode of statementNodes) {
        resetStatementLoweringState(compileContext);
        bodyLines.push(...lowerStatementNode(statementNode, compileContext, 1, { returnTypeCpp }));
      }
      bodyLines.push(...takeDeferredPromiseStatements(compileContext, '  '));
      restoreScope();
      if (!bodyLines.some((line) => /^\s*return\b/.test(line))) {
        bodyLines.push(`  return ${defaultCppValue(returnTypeCpp)};`);
      }
      const libPrefix = compileContext && compileContext.library ? 'extern "C" ' : '';
      definitions.push(
        `${libPrefix}${returnTypeCpp} ${functionName}(${cppParams}) {\n`
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
      const restoreScope = setupFunctionBoxedScope(functionExpressionNode, compileContext, bodyLines);
      beginDeferredPromiseQueueScope(compileContext);
      for (const statementNode of statementNodes) {
        resetStatementLoweringState(compileContext);
        bodyLines.push(...lowerStatementNode(statementNode, compileContext, 1, { returnTypeCpp }));
      }
      bodyLines.push(...takeDeferredPromiseStatements(compileContext, '  '));
      restoreScope();
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
      const restoreScope = setupFunctionBoxedScope(arrowFunctionNode, compileContext, bodyLines);
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
            if (/^__console__log\(/.test(loweredReturn.trim())) {
              bodyLines.push(`  ${loweredReturn};`);
            } else {
              bodyLines.push(`  return ${castReturnExpression(loweredReturn, returnTypeCpp)};`);
            }
          }
        }
      }
      bodyLines.push(...takeDeferredPromiseStatements(compileContext, '  '));
      restoreScope();

      if (!bodyLines.some((line) => /^\s*return\b/.test(line))) {
        bodyLines.push(`  return ${defaultCppValue(returnTypeCpp)};`);
      }

      definitions.push(
        `${returnTypeCpp} ${bindingName}(${cppParams}) {\n`
        + `${bodyLines.join('\n')}\n`
        + `}`
      );
    }

    for (const { symbolName, arrowFunctionNode } of collectTopLevelForEachArrowFunctionBindings(tree)) {
      const returnTypeCpp = compileContext.functionReturnTypes.get(symbolName) || 'int';
      const cppParams = buildCppParamsFromFunctionNode(arrowFunctionNode, symbolName, compileContext);
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
            if (/^__console__log\(/.test(loweredReturn.trim())) {
              bodyLines.push(`  ${loweredReturn};`);
            } else {
              bodyLines.push(`  return ${castReturnExpression(loweredReturn, returnTypeCpp)};`);
            }
          }
        }
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
      if (compileContext && compileContext.iteratorPlan && compileContext.iteratorPlan.enabled && compileContext.closurePlan && compileContext.closurePlan.scopesByNode && (compileContext.closurePlan.scopesByNode.get(functionExpressionNode) && compileContext.closurePlan.scopesByNode.get(functionExpressionNode).isClosure)) { continue; }
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

      const libPrefix = compileContext && compileContext.library ? 'extern "C" ' : '';
      prototypes.push(`${libPrefix}${returnTypeCpp} ${functionName}(${cppParams});`);
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

    for (const { symbolName, arrowFunctionNode } of collectTopLevelForEachArrowFunctionBindings(tree)) {
      if (seen.has(symbolName)) {
        continue;
      }
      const returnTypeCpp = compileContext.functionReturnTypes.get(symbolName) || 'int';
      const cppParams = buildCppParamsFromFunctionNode(arrowFunctionNode, symbolName, compileContext);
      prototypes.push(`${returnTypeCpp} ${symbolName}(${cppParams});`);
      seen.add(symbolName);
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
      if (compileContext && compileContext.iteratorPlan && compileContext.iteratorPlan.enabled && compileContext.closurePlan && compileContext.closurePlan.scopesByNode && (compileContext.closurePlan.scopesByNode.get(functionExpressionNode) && compileContext.closurePlan.scopesByNode.get(functionExpressionNode).isClosure)) { continue; }
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
      if (compileContext) compileContext._enclosingClassName = className;

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

    if (compileContext) compileContext._enclosingClassName = null;
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


  function collectTopLevelAsyncFunctionDeclarations(tree) {
    const decls = [];
    for (const stmt of extractTopLevelStatementNodes(tree)) {
      const asyncDecl = findFirstNonterminal(stmt, 'asyncFunctionDeclaration');
      if (asyncDecl && stmt === findStatementWrapping(stmt, asyncDecl)) {
        decls.push(asyncDecl);
      } else {
        const fn = (stmt.children || []).find((c) => c && c.kind === 'nonterminal' && c.name === 'asyncFunctionDeclaration');
        if (fn) decls.push(fn);
      }
    }
    return decls;
  }

  function findStatementWrapping(stmt, target) {
    return stmt;
  }

  function emitGeneratorFunctionsCpp(tree, compileContext) {
    const genDecls = [];
    for (const stmt of extractTopLevelStatementNodes(tree)) {
      const genDecl = findFirstNonterminal(stmt, 'generatorDeclaration');
      if (genDecl) {
        let isTop = true;
        walk(stmt, (n) => {
          if (n !== genDecl && (n.name === 'functionDeclaration' || n.name === 'generatorDeclaration' || n.name === 'asyncFunctionDeclaration') && nodeContainsTarget(n, genDecl)) {
            isTop = false;
          }
        });
        if (isTop && !genDecls.includes(genDecl)) {
          genDecls.push(genDecl);
        }
      }
    }
    if (genDecls.length === 0) return { structs: '', stepProtos: '', protos: '', defs: '', generators: [] };

    const structs = [];
    const stepProtos = [];
    const protos = [];
    const defs = [];
    const generators = [];
    let nextGenId = 1;

    for (const fnNode of genDecls) {
      const fnName = extractFunctionDeclarationName(fnNode);
      if (!fnName) continue;
      const genId = nextGenId++;
      const stepName = `__maia_gen_step_${fnName}`;
      generators.push({ genId, fnName, stepName });

      const params = extractFormalParameterNamesFromNode(fnNode);
      const cppParams = params.length > 0 ? params.map((pName) => `int ${pName}`).join(', ') : 'void';
      protos.push(`void* ${fnName}(${cppParams});`);
      stepProtos.push(`static void* ${stepName}(void* raw_frame, int __sent_val);`);

      if (compileContext) {
        if (!compileContext.generatorFunctionNames) compileContext.generatorFunctionNames = new Set();
        compileContext.generatorFunctionNames.add(fnName);
      }
      let bodyNode = (fnNode.children || []).find((c) => c && c.kind === 'nonterminal' && (c.name === 'functionBody' || c.name === 'generatorBody')) || fnNode;
      if (bodyNode && bodyNode.name === 'generatorBody' && bodyNode.children) {
        bodyNode = bodyNode.children.find((c) => c && c.kind === 'nonterminal' && c.name === 'functionBody') || bodyNode;
      }
      const stmtNodes = collectFunctionBodyStatementNodes(fnNode);

      let hasStringYield = false;
      walk(bodyNode, (n) => {
        if (!n || n.kind !== 'nonterminal') return;
        if (n.name === 'yieldExpression' || n.name === 'returnStatement') {
          walk(n, (t) => {
            if (t && ((t.kind === 'nonterminal' && t.name === 'stringLiteral') || (t.kind === 'terminal' && typeof t.value === 'string' && /^['"]/.test(t.value)))) {
              hasStringYield = true;
            }
          });
        }
      });
      if (hasStringYield && compileContext) {
        compileContext.hasStringYieldingGenerator = true;
      }

      const localVars = new Set(params);
      walk(bodyNode, (n) => {
        if (!n || n.kind !== 'nonterminal') return;
        if (n.name === 'variableDeclaration' || n.name === 'lexicalBinding') {
          const id = findFirstIdentifierValue(n);
          if (id) localVars.add(id);
        }
      });

      const frameType = `__maia_gen_frame_${fnName}`;
      const structLines = [
        `struct ${frameType} {`,
        '  int state;',
        '  int done;',
        '  long ret_val;',
        '  void* delegate_iter;'
      ];
      for (const v of localVars) {
        structLines.push(`  long ${v};`);
      }
      structLines.push('};');
      structs.push(structLines.join('\n'));

      const prevLocalVars = compileContext.localVariables;
      const prevInline = compileContext.inlineIdentifierExpressions;
      const prevInPromiseAsyncFn = compileContext._inPromiseAsyncFn;
      compileContext._inPromiseAsyncFn = true;
      compileContext.localVariables = new Map(prevLocalVars);
      compileContext.inlineIdentifierExpressions = new Map(prevInline);
      for (const v of localVars) {
        compileContext.localVariables.set(v, 'int');
        compileContext.inlineIdentifierExpressions.set(v, `f->${v}`);
      }

      const states = [[]];
      let currentState = 0;
      const newState = () => {
        const id = states.length;
        states.push([]);
        return id;
      };
      const emit = (line) => states[currentState].push(line);

      for (const stmtNode of stmtNodes) {
        const yieldNode = findFirstNonterminal(stmtNode, 'yieldExpression');
        if (yieldNode) {
          const isDelegate = (yieldNode.children || []).some((c) => c && c.kind === 'terminal' && c.value === '*');
          const exprNode = (yieldNode.children || []).find((c) => c && c.kind === 'nonterminal');
          const lowered = exprNode ? lowerExpressionValue(exprNode, compileContext) : '0';
          for (const pr of takePreludeStatements(compileContext, '')) emit(pr);
          if (isDelegate) {
            const loopState = newState();
            const afterState = newState();
            emit(`f->delegate_iter = __maia_iter_get_iterator((void*)(${lowered !== null ? lowered : '0'}));`);
            emit(`f->state = ${loopState};`);
            emit('continue;');
            currentState = loopState;
            emit('void* __dr = __maia_iter_next(f->delegate_iter, __sent_val);');
            emit('if (!__maia_iter_result_done(__dr)) { return __maia_iter_make_result(__maia_iter_result_value(__dr), 0); }');
            emit('f->delegate_iter = 0;');
            emit(`f->state = ${afterState};`);
            emit('continue;');
            currentState = afterState;
          } else {
            const resumeState = newState();
            emit(`f->state = ${resumeState};`);
            emit(`return __maia_iter_make_result((long)(${lowered !== null ? lowered : '0'}), 0);`);
            currentState = resumeState;
            const varDecl = findFirstNonterminal(stmtNode, 'variableDeclaration') || findFirstNonterminal(stmtNode, 'lexicalBinding');
            if (varDecl) {
              const targetId = findFirstIdentifierValue(varDecl);
              if (targetId) emit(`f->${targetId} = __sent_val;`);
            }
          }
          continue;
        }

        const returnNode = findFirstNonterminal(stmtNode, 'returnStatement');
        if (returnNode) {
          const expr = (returnNode.children || []).find((c) => c && c.kind === 'nonterminal' && c.name === 'expression');
          const lowered = expr ? lowerExpressionValue(expr, compileContext) : '0';
          for (const pr of takePreludeStatements(compileContext, '')) emit(pr);
          emit('f->done = 1;');
          emit(`return __maia_iter_make_result((long)(${lowered !== null ? lowered : '0'}), 1);`);
          continue;
        }

        const varDecl = findFirstNonterminal(stmtNode, 'variableDeclaration') || findFirstNonterminal(stmtNode, 'lexicalBinding');
        if (varDecl) {
          const targetId = findFirstIdentifierValue(varDecl);
          const init = (varDecl.children || []).find((c) => c && c.kind === 'nonterminal' && c.name === 'initializer');
          const initExpr = init ? (init.children || []).find((c) => c && c.kind === 'nonterminal') : null;
          if (targetId && initExpr) {
            const lowered = lowerExpressionValue(initExpr, compileContext);
            for (const pr of takePreludeStatements(compileContext, '')) emit(pr);
            emit(`f->${targetId} = (long)(${lowered !== null ? lowered : '0'});`);
            continue;
          }
        }

        resetStatementLoweringState(compileContext);
        for (const line of lowerStatementNode(stmtNode, compileContext, 0)) {
          const trimmed = line.trim();
          if (trimmed) emit(trimmed);
        }
      }

      emit('f->done = 1;');
      emit('return __maia_iter_make_result(0, 1);');

      compileContext._inPromiseAsyncFn = prevInPromiseAsyncFn;
      compileContext.localVariables = prevLocalVars;
      compileContext.inlineIdentifierExpressions = prevInline;

      const stepLines = [
        `static void* ${stepName}(void* raw_frame, int __sent_val) {`,
        `  ${frameType}* f = (${frameType}*)raw_frame;`,
        '  if (f->done) { return __maia_iter_make_result(0, 1); }',
        '  while (1) {',
        '    switch (f->state) {'
      ];
      for (let si = 0; si < states.length; si += 1) {
        stepLines.push(`      case ${si}: {`);
        for (const l of states[si]) {
          stepLines.push(`        ${l}`);
        }
        stepLines.push('        break;');
        stepLines.push('      }');
      }
      stepLines.push('      default: { f->done = 1; return __maia_iter_make_result(0, 1); }');
      stepLines.push('    }');
      stepLines.push('  }');
      stepLines.push('  return __maia_iter_make_result(0, 1);');
      stepLines.push('}');
      defs.push(stepLines.join('\n'));

      const wrapLines = [
        `void* ${fnName}(${cppParams}) {`,
        `  ${frameType}* f = new ${frameType}();`,
        '  f->state = 0;',
        '  f->done = 0;',
        '  f->ret_val = 0;',
        '  f->delegate_iter = 0;'
      ];
      for (const pName of params) {
        wrapLines.push(`  f->${pName} = ${pName};`);
      }
      wrapLines.push(`  return __maia_iter_make_generator(${genId}, (void*)f);`);
      wrapLines.push('}');
      defs.push(wrapLines.join('\n'));
    }

    return {
      structs: structs.join('\n\n'),
      stepProtos: stepProtos.join('\n'),
      protos: protos.join('\n'),
      defs: defs.join('\n\n'),
      generators
    };
  }

  function emitPromiseAsyncFunctionsCpp(tree, compileContext) {
    const asyncDecls = [];
    for (const stmt of extractTopLevelStatementNodes(tree)) {
      const asyncDecl = findFirstNonterminal(stmt, 'asyncFunctionDeclaration');
      if (asyncDecl) {
        // Check it is directly a top-level asyncFunctionDeclaration (not nested inside another function)
        let isTop = true;
        walk(stmt, (n) => {
          if (n !== asyncDecl && (n.name === 'functionDeclaration' || n.name === 'asyncFunctionDeclaration') && nodeContainsTarget(n, asyncDecl)) {
            isTop = false;
          }
        });
        if (isTop && !asyncDecls.includes(asyncDecl)) {
          asyncDecls.push(asyncDecl);
        }
      }
    }
    if (asyncDecls.length === 0) return { structs: '', protos: '', defs: '' };

    const structs = [];
    const protos = [];
    const defs = [];

    for (const fnNode of asyncDecls) {
      const fnName = extractFunctionDeclarationName(fnNode);
      if (!fnName) continue;
      const params = extractFormalParameterNamesFromNode(fnNode);
      const cppParams = params.length > 0 ? params.map((p) => `int ${p}`).join(', ') : 'void';
      protos.push(`void* ${fnName}(${cppParams});`);

      const bodyNode = (fnNode.children || []).find((c) => c && c.kind === 'nonterminal' && c.name === 'asyncFunctionBody') || fnNode;
      const stmtNodes = collectFunctionBodyStatementNodes(fnNode);

      // Collect all local variable names declared in the async function
      const localVars = new Set(params);
      walk(bodyNode, (n) => {
        if (!n || n.kind !== 'nonterminal') return;
        if (n.name === 'variableDeclaration' || n.name === 'lexicalBinding') {
          const id = findFirstIdentifierValue(n);
          if (id) localVars.add(id);
        } else if (n.name === 'catchClause' || n.name === 'catch') {
          for (const ch of (n.children || [])) {
            if (ch && ch.kind === 'nonterminal' && ch.name === 'block') break;
            if (ch && ch.kind === 'nonterminal' && ch.name === 'identifier') {
              const cid = findFirstIdentifierValue(ch);
              if (cid) localVars.add(cid);
              break;
            }
          }
        }
      });

      const frameType = `__maia_async_frame_${fnName}`;
      const stepFn = `__maia_async_step_${fnName}`;

      const structLines = [
        `struct ${frameType} {`,
        '  int state;',
        '  void* promise;',
        '  int has_err;',
        '  int err_val;',
        '  int has_ret;',
        '  int ret_val;',
        '  int catch_state;'
      ];
      for (const v of localVars) {
        structLines.push(`  int ${v};`);
      }
      structLines.push('};');
      structs.push(structLines.join('\n'));

      // Setup inlineIdentifierExpressions so locals/params resolve to f->name
      const prevLocalVars = compileContext.localVariables;
      const prevInline = compileContext.inlineIdentifierExpressions;
      const prevInPromiseAsyncFn = compileContext._inPromiseAsyncFn;
      compileContext._inPromiseAsyncFn = true;
      compileContext.localVariables = new Map(prevLocalVars);
      compileContext.inlineIdentifierExpressions = new Map(prevInline);
      for (const v of localVars) {
        compileContext.localVariables.set(v, 'int');
        compileContext.inlineIdentifierExpressions.set(v, `f->${v}`);
      }

      // Build basic blocks (states)
      const states = [[]];
      let currentState = 0;
      const newState = () => {
        const id = states.length;
        states.push([]);
        return id;
      };
      const emit = (line) => states[currentState].push(line);

      function lowerAsyncBlock(nodes, tryCtx) {
        for (const s of nodes) {
          lowerAsyncStmt(s, tryCtx);
        }
      }

      function lowerAsyncStmt(stmtNode, tryCtx) {
        if (!stmtNode) return;
        const tryNode = findFirstNonterminal(stmtNode, 'tryStatement');
        if (tryNode) {
          const blocks = (tryNode.children || []).filter((c) => c && c.kind === 'nonterminal' && c.name === 'block');
          const catchNode = (tryNode.children || []).find((c) => c && c.kind === 'nonterminal' && (c.name === 'catch' || c.name === 'catchClause'));
          const finallyNode = (tryNode.children || []).find((c) => c && c.kind === 'nonterminal' && c.name === 'finally');
          const tryBlock = blocks[0] || null;
          const catchBlock = catchNode ? (findFirstNonterminal(catchNode, 'block') || blocks[1] || null) : null;
          const finallyBlock = finallyNode ? (findFirstNonterminal(finallyNode, 'block') || blocks[catchBlock ? 2 : 1] || null) : null;

          const catchState = catchBlock ? newState() : -1;
          const finallyState = finallyBlock ? newState() : -1;
          const afterState = newState();

          const nextTryCtx = {
            catchState: catchState >= 0 ? catchState : (finallyState >= 0 ? finallyState : tryCtx.catchState),
            finallyState: finallyState >= 0 ? finallyState : tryCtx.finallyState,
            outerCatchState: tryCtx.catchState,
            outerFinallyState: tryCtx.finallyState
          };

          const tryStmts = tryBlock ? extractStatementsFromScopeContainer(tryBlock) : [];
          lowerAsyncBlock(tryStmts, nextTryCtx);
          emit(`f->state = ${finallyState >= 0 ? finallyState : afterState};`);
          emit('continue;');

          if (catchBlock && catchState >= 0) {
            currentState = catchState;
            emit('f->has_err = 0;');
            let errId = null;
            if (catchNode) {
              for (const ch of (catchNode.children || [])) {
                if (ch && ch.kind === 'nonterminal' && ch.name === 'block') break;
                if (ch && ch.kind === 'nonterminal' && ch.name === 'identifier') {
                  errId = findFirstIdentifierValue(ch);
                  break;
                }
              }
            }
            if (errId) {
              emit(`f->${errId} = f->err_val;`);
            }
            const catchTryCtx = {
              catchState: finallyState >= 0 ? finallyState : tryCtx.catchState,
              finallyState: finallyState >= 0 ? finallyState : tryCtx.finallyState,
              outerCatchState: tryCtx.catchState,
              outerFinallyState: tryCtx.finallyState
            };
            lowerAsyncBlock(extractStatementsFromScopeContainer(catchBlock), catchTryCtx);
            emit(`f->state = ${finallyState >= 0 ? finallyState : afterState};`);
            emit('continue;');
          }

          if (finallyBlock && finallyState >= 0) {
            currentState = finallyState;
            lowerAsyncBlock(extractStatementsFromScopeContainer(finallyBlock), tryCtx);
            emit(`if (f->has_err) { ${tryCtx.catchState >= 0 ? `f->state = ${tryCtx.catchState}; continue;` : '__maia_promise_reject_value(f->promise, f->err_val); return 0;'} }`);
            emit(`if (f->has_ret) { ${tryCtx.finallyState >= 0 ? `f->state = ${tryCtx.finallyState}; continue;` : '__maia_promise_resolve_value(f->promise, f->ret_val); return 0;'} }`);
            emit(`f->state = ${afterState};`);
            emit('continue;');
          }

          currentState = afterState;
          return;
        }

        const throwNode = findFirstNonterminal(stmtNode, 'throwStatement');
        if (throwNode) {
          const expr = (throwNode.children || []).find((c) => c && c.kind === 'nonterminal' && c.name === 'expression');
          const loweredErr = expr ? lowerExpressionValue(expr, compileContext) : '0';
          for (const p of takePreludeStatements(compileContext, '')) emit(p);
          emit(`f->err_val = (int)(${loweredErr !== null ? loweredErr : '0'});`);
          emit('f->has_err = 1;');
          if (tryCtx.catchState >= 0) {
            emit(`f->state = ${tryCtx.catchState};`);
            emit('continue;');
          } else if (tryCtx.finallyState >= 0) {
            emit(`f->state = ${tryCtx.finallyState};`);
            emit('continue;');
          } else {
            emit('__maia_promise_reject_value(f->promise, f->err_val);');
            emit('return 0;');
          }
          return;
        }

        const returnNode = findFirstNonterminal(stmtNode, 'returnStatement');
        if (returnNode) {
          const expr = (returnNode.children || []).find((c) => c && c.kind === 'nonterminal' && c.name === 'expression');
          const awaitInRet = expr ? findFirstNonterminal(expr, 'awaitExpression') : null;
          let retExpr = '0';
          if (awaitInRet) {
            const inner = (awaitInRet.children || []).find((c) => c && c.kind === 'nonterminal');
            const loweredAwait = inner ? lowerExpressionValue(inner, compileContext) : '0';
            for (const p of takePreludeStatements(compileContext, '')) emit(p);
            const resumeState = newState();
            emit(`f->state = ${resumeState};`);
            emit(`f->catch_state = ${tryCtx.catchState};`);
            emit(`__maia_promise_async_await((int)(${loweredAwait !== null ? loweredAwait : '0'}), (void*)${stepFn}, (void*)f);`);
            emit('return 0;');
            currentState = resumeState;
            emit(`if (__is_reject) { f->err_val = __val; f->has_err = 1; ${tryCtx.catchState >= 0 ? `f->state = ${tryCtx.catchState}; continue;` : '__maia_promise_reject_value(f->promise, __val); return 0;'} }`);
            retExpr = '__val';
          } else if (expr) {
            const lowered = lowerExpressionValue(expr, compileContext);
            for (const p of takePreludeStatements(compileContext, '')) emit(p);
            retExpr = lowered !== null ? lowered : '0';
          }
          emit(`f->ret_val = (int)(${retExpr});`);
          emit('f->has_ret = 1;');
          if (tryCtx.finallyState >= 0) {
            emit(`f->state = ${tryCtx.finallyState};`);
            emit('continue;');
          } else {
            emit('__maia_promise_resolve_value(f->promise, f->ret_val);');
            emit('return 0;');
          }
          return;
        }

        const awaitNode = findFirstNonterminal(stmtNode, 'awaitExpression');
        if (awaitNode) {
          const inner = (awaitNode.children || []).find((c) => c && c.kind === 'nonterminal');
          const loweredAwait = inner ? lowerExpressionValue(inner, compileContext) : '0';
          for (const p of takePreludeStatements(compileContext, '')) emit(p);
          const resumeState = newState();
          emit(`f->state = ${resumeState};`);
          emit(`f->catch_state = ${tryCtx.catchState};`);
          emit(`__maia_promise_async_await((int)(${loweredAwait !== null ? loweredAwait : '0'}), (void*)${stepFn}, (void*)f);`);
          emit('return 0;');
          currentState = resumeState;
          emit(`if (__is_reject) { f->err_val = __val; f->has_err = 1; ${tryCtx.catchState >= 0 ? `f->state = ${tryCtx.catchState}; continue;` : '__maia_promise_reject_value(f->promise, __val); return 0;'} }`);
          const varDecl = findFirstNonterminal(stmtNode, 'variableDeclaration') || findFirstNonterminal(stmtNode, 'lexicalBinding');
          if (varDecl) {
            const targetId = findFirstIdentifierValue(varDecl);
            if (targetId) emit(`f->${targetId} = __val;`);
          }
          return;
        }

        // Variable declaration without await: assign to f->name
        const varDecl = findFirstNonterminal(stmtNode, 'variableDeclaration') || findFirstNonterminal(stmtNode, 'lexicalBinding');
        if (varDecl) {
          const targetId = findFirstIdentifierValue(varDecl);
          const init = (varDecl.children || []).find((c) => c && c.kind === 'nonterminal' && c.name === 'initializer');
          const initExpr = init ? (init.children || []).find((c) => c && c.kind === 'nonterminal') : null;
          if (targetId && initExpr) {
            const lowered = lowerExpressionValue(initExpr, compileContext);
            for (const p of takePreludeStatements(compileContext, '')) emit(p);
            emit(`f->${targetId} = (int)(${lowered !== null ? lowered : '0'});`);
            return;
          }
        }

        // Fallback: regular statement
        resetStatementLoweringState(compileContext);
        for (const line of lowerStatementNode(stmtNode, compileContext, 0)) {
          const trimmed = line.trim();
          if (trimmed) emit(trimmed);
        }
      }

      lowerAsyncBlock(stmtNodes, { catchState: -1, finallyState: -1, outerCatchState: -1, outerFinallyState: -1 });
      emit('__maia_promise_resolve_value(f->promise, 0);');
      emit('return 0;');

      compileContext._inPromiseAsyncFn = prevInPromiseAsyncFn;
      compileContext.localVariables = prevLocalVars;
      compileContext.inlineIdentifierExpressions = prevInline;

      protos.push(`static int ${stepFn}(void* raw_frame, int __val, int __is_reject);`);
      const stepLines = [
        `static int ${stepFn}(void* raw_frame, int __val, int __is_reject) {`,
        `  ${frameType}* f = (${frameType}*)raw_frame;`,
        '  while (1) {',
        '    switch (f->state) {'
      ];
      for (let i = 0; i < states.length; i += 1) {
        stepLines.push(`      case ${i}: {`);
        for (const l of states[i]) {
          stepLines.push(`        ${l}`);
        }
        stepLines.push('        break;');
        stepLines.push('      }');
      }
      stepLines.push('      default: return 0;');
      stepLines.push('    }');
      stepLines.push('  }');
      stepLines.push('  return 0;');
      stepLines.push('}');
      defs.push(stepLines.join('\n'));

      const wrapLines = [
        `void* ${fnName}(${cppParams}) {`,
        `  ${frameType}* f = new ${frameType}();`,
        '  f->state = 0;',
        '  f->promise = __maia_promise_new(0);',
        '  f->has_err = 0;',
        '  f->err_val = 0;',
        '  f->has_ret = 0;',
        '  f->ret_val = 0;',
        '  f->catch_state = -1;'
      ];
      for (const p of params) {
        wrapLines.push(`  f->${p} = ${p};`);
      }
      wrapLines.push(`  ${stepFn}((void*)f, 0, 0);`);
      wrapLines.push('  return f->promise;');
      wrapLines.push('}');
      defs.push(wrapLines.join('\n'));
    }

    return { structs: structs.join('\n\n'), protos: protos.join('\n'), defs: defs.join('\n\n') };
  }

  return {
    emitClosureImplementationsCpp,
    emitTopLevelFunctionDefinitions,
    emitTopLevelFunctionPrototypes,
    pruneUnusedGeneratedFunctionsCpp,
    rewriteClassMethodBodyLinesForWrapper,
    getClassInitWrapperName,
    getClassInitWrapperMangledName,
    getClassMethodWrapperName,
    emitTopLevelClassDefinitions,
    buildAsyncRuntimeBridgePlan,
    collectTopLevelAsyncFunctionDeclarations,
    findStatementWrapping,
    emitGeneratorFunctionsCpp,
    emitPromiseAsyncFunctionsCpp
  };
}

module.exports = { createCppEmitters };
