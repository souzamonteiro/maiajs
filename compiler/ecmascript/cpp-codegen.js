'use strict';

const { buildAsyncIR } = require('./async-ir');
const closures = require('./closures');
const promises = require('./promises');
const iterators = require('./iterators');
const atomics = require('./atomics');
const collections = require('./collections');
const {
  walk,
  findFirstIdentifierValue,
  nodeContainsTarget,
  findFirstNonterminal
} = require('./ast-utils');

function createCppCodegen(deps) {
  const {
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
  } = deps;

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

  function findAsyncIfGuard(machine, suspendPoint) {
    const awaitNode = suspendPoint && suspendPoint.awaitNode;
    if (!awaitNode) { return null; }

    for (const statementNode of (machine.statementNodes || [])) {
      if (!nodeContainsTarget(statementNode, awaitNode)) { continue; }
      const ifNodes = [];
      walk(statementNode, (node) => {
        if (node && node.kind === 'nonterminal' && node.name === 'ifStatement') {
          ifNodes.push(node);
        }
      });

      for (let ifIndex = ifNodes.length - 1; ifIndex >= 0; ifIndex -= 1) {
        const ifNode = ifNodes[ifIndex];
        const branchStatements = (ifNode.children || []).filter(
          (child) => child && child.kind === 'nonterminal' && child.name === 'statement'
        );
        const consequent = branchStatements[0] || null;
        const alternate = branchStatements[1] || null;
        const inConsequent = consequent && nodeContainsTarget(consequent, awaitNode);
        const activeBranch = inConsequent ? consequent : alternate;
        if (!activeBranch || !nodeContainsTarget(activeBranch, awaitNode)) { continue; }

        const awaitNodes = [];
        walk(activeBranch, (node) => {
          if (node && node.kind === 'nonterminal' && node.name === 'awaitExpression') {
            awaitNodes.push(node);
          }
        });
        const awaitIndex = awaitNodes.indexOf(awaitNode);
        if (awaitIndex < 0) { continue; }

        const condition = (ifNode.children || []).find(
          (child) => child && child.kind === 'nonterminal' && child.name === 'expression'
        ) || null;
        if (condition) {
          const block = findFirstNonterminal(activeBranch, 'block');
          const consequentStatements = block
            ? (block.children || []).filter((child) => child && child.kind === 'nonterminal' && child.name === 'statement')
            : [consequent];
          const awaitStatementIndex = consequentStatements.findIndex(
            (statement) => nodeContainsTarget(statement, awaitNode)
          );
          if (awaitStatementIndex < 0) { continue; }
          const previousAwaitStatementIndex = awaitIndex === 0
            ? -1
            : consequentStatements.findIndex((statement) => nodeContainsTarget(statement, awaitNodes[awaitIndex - 1]));
          const nextAwaitStatementIndex = awaitIndex + 1 < awaitNodes.length
            ? consequentStatements.findIndex((statement) => nodeContainsTarget(statement, awaitNodes[awaitIndex + 1]))
            : consequentStatements.length;
          if (previousAwaitStatementIndex >= awaitStatementIndex || nextAwaitStatementIndex <= awaitStatementIndex) {
            continue;
          }
          return {
            condition,
            alternate,
            branchKind: inConsequent ? 'consequent' : 'alternate',
            alternateHasAwait: !!findFirstNonterminal(alternate, 'awaitExpression'),
            ifNode,
            isFirstAwait: awaitIndex === 0,
            isLastAwait: awaitIndex + 1 === awaitNodes.length,
            preAwaitStatements: consequentStatements.slice(previousAwaitStatementIndex + 1, awaitStatementIndex),
            postAwaitStatements: awaitIndex + 1 === awaitNodes.length
              ? consequentStatements.slice(awaitStatementIndex + 1, nextAwaitStatementIndex)
              : []
          };
        }
      }
    }

    return null;
  }

  function getAsyncLoopKind(loop) {
    const loopToken = (loop && loop.children || []).find(
      (child) => child && child.kind === 'terminal' && (child.value === 'for' || child.value === 'while')
    );
    return loopToken ? loopToken.value : null;
  }

  function findEnclosingAsyncLoopNodes(machine, awaitNode) {
    const loops = [];
    for (const statementNode of (machine.statementNodes || [])) {
      if (!nodeContainsTarget(statementNode, awaitNode)) continue;
      walk(statementNode, (node) => {
        if (
          node
          && node.kind === 'nonterminal'
          && node.name === 'iterationStatement'
          && nodeContainsTarget(node, awaitNode)
          && getAsyncLoopKind(node)
        ) {
          loops.push(node);
        }
      });
    }
    return loops;
  }

  function findAsyncWhileGuard(machine, suspendPoint, selectedLoop = null) {
    const awaitNode = suspendPoint && suspendPoint.awaitNode;
    if (!awaitNode) return null;
    const loops = selectedLoop ? [selectedLoop] : findEnclosingAsyncLoopNodes(machine, awaitNode);
    for (const loop of loops) {
      if (getAsyncLoopKind(loop) !== 'while') continue;
      const condition = (loop.children || []).find((child) => child && child.kind === 'nonterminal' && child.name === 'expression');
      const body = (loop.children || []).find((child) => child && child.kind === 'nonterminal' && child.name === 'statement');
      const block = body && findFirstNonterminal(body, 'block');
      const statements = block ? (block.children || []).filter((child) => child && child.kind === 'nonterminal' && child.name === 'statement') : [];
      const awaitStatements = statements.filter((statement) => findFirstNonterminal(statement, 'awaitExpression'));
      const awaitIndex = awaitStatements.findIndex((statement) => nodeContainsTarget(statement, awaitNode));
      if (!condition || awaitIndex < 0) continue;
      const statementIndex = statements.findIndex((statement) => nodeContainsTarget(statement, awaitNode));
      if (statementIndex < 0) continue;
      const previousStatementIndex = awaitIndex === 0
        ? -1
        : statements.findIndex((statement) => statement === awaitStatements[awaitIndex - 1]);
      return {
        condition,
        isLastAwait: awaitIndex === awaitStatements.length - 1,
        preAwaitStatements: statements.slice(previousStatementIndex + 1, statementIndex),
        postAwaitStatements: awaitIndex === awaitStatements.length - 1 ? statements.slice(statementIndex + 1) : []
      };
    }
    return null;
  }

  function findAsyncForGuard(machine, suspendPoint, selectedLoop = null) {
    const awaitNode = suspendPoint && suspendPoint.awaitNode;
    if (!awaitNode) return null;
    const loops = selectedLoop ? [selectedLoop] : findEnclosingAsyncLoopNodes(machine, awaitNode);
    for (const loop of loops) {
      if (getAsyncLoopKind(loop) !== 'for') continue;
      const body = (loop.children || []).find((child) => child && child.kind === 'nonterminal' && child.name === 'statement');
      const block = body && findFirstNonterminal(body, 'block');
      const statements = block ? (block.children || []).filter((child) => child && child.kind === 'nonterminal' && child.name === 'statement') : [];
      const awaitStatements = statements.filter((statement) => findFirstNonterminal(statement, 'awaitExpression'));
      const awaitIndex = awaitStatements.findIndex((statement) => nodeContainsTarget(statement, awaitNode));
      if (awaitIndex < 0) continue;

      const lexicalDeclaration = (loop.children || []).find((child) => child && child.kind === 'nonterminal' && child.name === 'lexicalDeclaration');
      const lexicalBinding = lexicalDeclaration && findFirstNonterminal(lexicalDeclaration, 'lexicalBinding');
      const bindingIdentifier = lexicalBinding && findFirstNonterminal(lexicalBinding, 'bindingIdentifier');
      const initializer = lexicalBinding && findFirstNonterminal(lexicalBinding, 'initializer');
      const initializerExpression = initializer && findFirstNonterminal(initializer, 'assignmentExpression');
      const variableName = bindingIdentifier && findFirstIdentifierValue(bindingIdentifier);
      const expressions = (loop.children || []).filter((child) => child && child.kind === 'nonterminal' && child.name === 'expression');
      const condition = expressions[0] || null;
      const increment = expressions[1] || null;
      const statementIndex = statements.findIndex((statement) => nodeContainsTarget(statement, awaitNode));
      if (!variableName || !initializerExpression || !condition || !increment || statementIndex < 0) continue;
      const previousStatementIndex = awaitIndex === 0
        ? -1
        : statements.findIndex((statement) => statement === awaitStatements[awaitIndex - 1]);

      return {
        variableName,
        initializerExpression,
        condition,
        increment,
        isLastAwait: awaitIndex === awaitStatements.length - 1,
        preAwaitStatements: statements.slice(previousStatementIndex + 1, statementIndex),
        postAwaitStatements: awaitIndex === awaitStatements.length - 1 ? statements.slice(statementIndex + 1) : []
      };
    }
    return null;
  }

  function findAsyncLoopGuards(machine, suspendPoint) {
    const awaitNode = suspendPoint && suspendPoint.awaitNode;
    if (!awaitNode) return [];
    return findEnclosingAsyncLoopNodes(machine, awaitNode)
      .map((loop, depth) => {
        const kind = getAsyncLoopKind(loop);
        const guard = kind === 'while'
          ? findAsyncWhileGuard(machine, suspendPoint, loop)
          : findAsyncForGuard(machine, suspendPoint, loop);
        return guard ? { ...guard, kind, depth } : null;
      })
      .filter(Boolean);
  }

  function getAsyncLoopTailControl(statements) {
    const last = statements && statements[statements.length - 1];
    if (!last) return null;
    if ((last.children || []).some((child) => child && child.kind === 'nonterminal' && child.name === 'breakStatement')) return 'break';
    if ((last.children || []).some((child) => child && child.kind === 'nonterminal' && child.name === 'continueStatement')) return 'continue';
    return null;
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

      walk(statementNode, (node) => {
        if (node && node.kind === 'nonterminal' && node.name === 'variableDeclaration') {
          const name = extractVariableDeclarationName(node);
          if (!name || fields.some((field) => field.name === name)) return;
          const initializer = extractVariableDeclarationInitializer(node);
          fields.push({
            name,
            fieldName: `__local_${name}`,
            cppType: inferInitializerCppType(initializer, compileContext)
          });
          return;
        }
        if (!node || node.kind !== 'nonterminal' || node.name !== 'lexicalBinding') return;
        const bindingIdentifier = findFirstNonterminal(node, 'bindingIdentifier');
        const initializer = findFirstNonterminal(node, 'initializer');
        const name = bindingIdentifier && findFirstIdentifierValue(bindingIdentifier);
        const initializerExpression = initializer && findFirstNonterminal(initializer, 'assignmentExpression');
        if (!name || !initializerExpression || fields.some((field) => field.name === name)) return;
        fields.push({
          name,
          fieldName: `__local_${name}`,
          cppType: inferInitializerCppType(initializerExpression, compileContext)
        });
      });
    }

    return fields;
  }

  function collectAsyncStateDynamicHandleFields(machine, localFields) {
    const dynamicFields = new Map(
      machine.body
        .filter((suspendPoint) => suspendPoint && suspendPoint.resultBinding && awaitUsesDynamicRuntimeTransport(suspendPoint))
        .map((suspendPoint) => [
          suspendPoint.resultBinding.name,
          `__local_${suspendPoint.resultBinding.name}`
        ])
    );
    const localFieldNames = new Map(localFields.map((field) => [field.name, field.fieldName]));

    // Method results remain opaque host values. Discover these declarations after
    // the awaited bindings so a later local can be used like any other handle.
    let changed = true;
    while (changed) {
      changed = false;
      for (const statementNode of (machine.statementNodes || [])) {
        walk(statementNode, (node) => {
          if (!node || node.kind !== 'nonterminal' || node.name !== 'variableDeclaration') return;
          const name = extractVariableDeclarationName(node);
          const initializer = extractVariableDeclarationInitializer(node);
          const callNode = initializer ? extractDirectCallExpressionNode(initializer) : null;
          const memberExprNode = callNode ? extractOutermostCallMemberExpression(callNode) : null;
          const segments = memberExprNode ? extractPathFromMemberExpression(memberExprNode, null) : null;
          if (!name || dynamicFields.has(name) || !localFieldNames.has(name)
            || !segments || segments.length < 2 || !dynamicFields.has(segments[0])) {
            return;
          }
          dynamicFields.set(name, localFieldNames.get(name));
          changed = true;
        });
      }
    }
    return dynamicFields;
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
      const syntheticCatchStates = [];
      const syntheticFinallyStates = [];
      const syntheticExceptionRouteStates = [];
      const exceptionRoutesBySuspend = new Map();
      for (const suspendPoint of (machine.body || [])) {
        const frames = (suspendPoint && suspendPoint.exceptionFrames) || [{
          catchHandlers: (suspendPoint && suspendPoint.catchHandlers) || [],
          finallyHandler: ((suspendPoint && suspendPoint.finallyHandlers) || [])[0] || null
        }];
        const routes = frames.map((frame, frameIndex) => {
          const route = {
            stateId: nextSyntheticState,
            catchStates: [],
            finallyState: null,
            nextStateId: terminalState,
            frameIndex,
            frameDepth: frames.length - frameIndex
          };
          nextSyntheticState += 1;
          for (const handler of (frame.catchHandlers || [])) {
            const entry = {
              stateId: nextSyntheticState,
              handler,
              continuationStateId: suspendPoint.stateId,
              postCatchFinallyState: null
            };
            nextSyntheticState += 1;
            route.catchStates.push(entry);
            syntheticCatchStates.push(entry);
          }
          if (frame.finallyHandler) {
            const entry = { stateId: nextSyntheticState, handler: frame.finallyHandler, nextStateId: terminalState };
            nextSyntheticState += 1;
            route.finallyState = entry;
            syntheticFinallyStates.push(entry);
          }
          if (frame.finallyHandler) {
            for (const catchState of route.catchStates) {
              const entry = {
                stateId: nextSyntheticState,
                handler: frame.finallyHandler,
                nextStateId: catchState.continuationStateId
              };
              nextSyntheticState += 1;
              catchState.postCatchFinallyState = entry;
              syntheticFinallyStates.push(entry);
            }
          }
          syntheticExceptionRouteStates.push(route);
          return route;
        });
        for (let index = 0; index < routes.length; index += 1) {
          const nextStateId = index + 1 < routes.length ? routes[index + 1].stateId : terminalState;
          routes[index].nextStateId = nextStateId;
          if (routes[index].finallyState) {
            routes[index].finallyState.nextStateId = nextStateId;
          }
        }
        exceptionRoutesBySuspend.set(suspendPoint, routes);
      }
      const ifGuardsBySuspend = new Map();
      const loopGuardsBySuspend = new Map();
      const ifBranchMarkersByNode = new Map();
      let nextIfBranchMarker = 1;
      for (const suspendPoint of (machine.body || [])) {
        const guard = findAsyncIfGuard(machine, suspendPoint);
        if (guard) {
          let markers = ifBranchMarkersByNode.get(guard.ifNode);
          if (!markers) {
            markers = { consequent: nextIfBranchMarker, alternate: nextIfBranchMarker + 1 };
            nextIfBranchMarker += 2;
            ifBranchMarkersByNode.set(guard.ifNode, markers);
          }
          guard.branchMarker = markers[guard.branchKind];
          guard.otherBranchMarker = markers[guard.branchKind === 'consequent' ? 'alternate' : 'consequent'];
          ifGuardsBySuspend.set(suspendPoint, guard);
        }
        const loopGuards = findAsyncLoopGuards(machine, suspendPoint);
        if (loopGuards.length > 0) loopGuardsBySuspend.set(suspendPoint, loopGuards);
      }
      const localFields = compileContext ? collectAsyncStateLocalFields(machine, compileContext) : [];
      const previousAsyncStateFields = compileContext ? compileContext.asyncStateLocalFields : null;
      const previousAsyncStateFieldTypes = compileContext ? compileContext.asyncStateLocalFieldTypes : null;
      const previousAsyncStateDynamicHandleFields = compileContext ? compileContext.asyncStateDynamicHandleFields : null;
      if (compileContext) {
        const dynamicHandleFields = collectAsyncStateDynamicHandleFields(machine, localFields);
        for (const field of localFields) {
          if (dynamicHandleFields.has(field.name)) {
            field.cppType = 'int';
          }
        }
        compileContext.asyncStateLocalFields = new Map(localFields.map((field) => [field.name, field.fieldName]));
        compileContext.asyncStateLocalFieldTypes = new Map(localFields.map((field) => [field.name, field.cppType]));
        compileContext.asyncStateDynamicHandleFields = dynamicHandleFields;
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
        const previousIfGuard = ifGuardsBySuspend.get(previousSuspendPoint) || null;
        const previousLoopGuards = loopGuardsBySuspend.get(previousSuspendPoint) || [];
        const previousLoopGuard = previousLoopGuards[previousLoopGuards.length - 1] || null;
        const previousParentLoopGuard = previousLoopGuards[previousLoopGuards.length - 2] || null;
        const loopGuards = loopGuardsBySuspend.get(suspendPoint) || [];
        const resumedAssignment = stateIndex > 0
          ? lowerAsyncAwaitResultAssignment(previousSuspendPoint, compileContext)
          : null;
        const previousLoopProgress = previousLoopGuard
          ? `__sm->__loop_progress_${previousLoopGuard.depth}`
          : null;
        switchBody += `    case ${stateIndex}: ${stateIndex === 0 ? '/* initial state */' : `/* resumed after await ${stateIndex} */`}\n`;
        const resumeRoutes = exceptionRoutesBySuspend.get(previousSuspendPoint) || [];
        if (resumeRoutes.length > 0) {
          switchBody += `      if (__exc_active()) {\n`;
          if (previousIfGuard) {
            switchBody += `        __sm->__branch = 0;\n`;
          }
          switchBody += `        __sm->__state = ${resumeRoutes[0].stateId};\n`;
          switchBody += `        ${structName}__resume(__sm);\n`;
          switchBody += `        return;\n`;
          switchBody += `      }\n`;
        }
        if (previousIfGuard && (previousIfGuard.isLastAwait || resumedAssignment || previousIfGuard.postAwaitStatements.length > 0)) {
          switchBody += `      if (__sm->__branch == ${previousIfGuard.branchMarker}) {\n`;
          if (previousIfGuard.isLastAwait && !previousLoopGuard) {
            switchBody += `        __sm->__branch = 0;\n`;
          }
          if (resumedAssignment) {
            switchBody += `${resumedAssignment}\n`;
          }
          for (const statement of previousIfGuard.postAwaitStatements) {
            const postAwaitLines = lowerStatementNode(
              statement,
              compileContext,
              3,
              { returnTypeCpp: machine.returnValueCppType }
            );
            for (const line of postAwaitLines) {
              switchBody += `${line}\n`;
            }
          }
          switchBody += `      }\n`;
        } else if (!previousIfGuard && resumedAssignment) {
          switchBody += `${resumedAssignment}\n`;
        }
        if (previousLoopGuard && previousLoopGuard.isLastAwait) {
          const branchRequirement = previousIfGuard
            ? ` && __sm->__branch == ${previousIfGuard.branchMarker}`
            : '';
          switchBody += `      if (${previousLoopProgress} == 1${branchRequirement}) {\n`;
          const tailControl = getAsyncLoopTailControl(previousLoopGuard.postAwaitStatements);
          const tailStatements = tailControl ? previousLoopGuard.postAwaitStatements.slice(0, -1) : previousLoopGuard.postAwaitStatements;
          for (const statement of tailStatements) {
            for (const line of lowerStatementNode(statement, compileContext, 3, { returnTypeCpp: machine.returnValueCppType })) switchBody += `${line}\n`;
          }
          if (previousIfGuard) {
            switchBody += `        __sm->__branch = 0;\n`;
          }
          if (tailControl === 'break') {
            if (previousParentLoopGuard) {
              switchBody += `        ${previousLoopProgress} = 0;\n`;
              for (const statement of previousParentLoopGuard.postAwaitStatements) {
                for (const line of lowerStatementNode(statement, compileContext, 4, { returnTypeCpp: machine.returnValueCppType })) switchBody += `${line}\n`;
              }
              switchBody += `        __sm->__loop_progress_${previousParentLoopGuard.depth} = 2;\n        __sm->__state = 0;\n        ${structName}__resume(__sm);\n        return;\n      }\n`;
            } else {
              switchBody += `        ${previousLoopProgress} = 0;\n        __sm->__state = ${stateIndex};\n        ${structName}__resume(__sm);\n        return;\n      }\n`;
            }
          } else {
            switchBody += `        ${previousLoopProgress} = 2;\n        __sm->__state = 0;\n        ${structName}__resume(__sm);\n        return;\n      }\n`;
          }
        }
        const initializingLoop = stateIndex === 0 && loopGuards.length > 0;
        const entryLoopProgress = loopGuards.length > 0
          ? `__sm->__loop_progress_${loopGuards[0].depth}`
          : null;
        if (initializingLoop) switchBody += `      if (${entryLoopProgress} == 0) {\n`;
        for (const line of stateBody.lines) {
          switchBody += `${line}\n`;
        }
        if (initializingLoop) switchBody += `      }\n`;

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
        const ifGuard = ifGuardsBySuspend.get(suspendPoint) || null;
        const globalScheduleState = machinePlan && Number.isInteger(machinePlan.scheduleStateStart)
          ? (machinePlan.scheduleStateStart + i - 1)
          : i;
        const usesDynamicTransport = awaitUsesDynamicRuntimeTransport(suspendPoint);

        switchBody += `      /* await checkpoint ${i}${awaitedExprComment} */\n`;
        for (const [loopIndex, loopGuard] of loopGuards.entries()) {
          const activeLoopProgress = `__sm->__loop_progress_${loopGuard.depth}`;
          const parentLoopGuard = loopGuards[loopIndex - 1] || null;
          const appendLoopExitRoute = () => {
            if (!parentLoopGuard) {
              const exitProgress = loopGuard.kind === 'for' ? 3 : 0;
              switchBody += `        ${activeLoopProgress} = ${exitProgress};\n        __sm->__state = ${i};\n        ${structName}__resume(__sm);\n        return;\n      }\n`;
              return;
            }
            switchBody += `        ${activeLoopProgress} = 0;\n`;
            for (const descendantGuard of loopGuards.slice(loopIndex + 1)) {
              switchBody += `        __sm->__loop_progress_${descendantGuard.depth} = 0;\n`;
            }
            for (const statement of parentLoopGuard.postAwaitStatements) {
              for (const line of lowerStatementNode(statement, compileContext, 4, { returnTypeCpp: machine.returnValueCppType })) switchBody += `${line}\n`;
            }
            switchBody += `        __sm->__loop_progress_${parentLoopGuard.depth} = 2;\n        __sm->__state = 0;\n        ${structName}__resume(__sm);\n        return;\n      }\n`;
          };
          if (loopGuard.kind === 'while') {
            const loweredCondition = lowerExpressionValue(loopGuard.condition, compileContext);
            switchBody += `      if (!(${loweredCondition})) {\n`;
            appendLoopExitRoute();
            const childLoopGuard = loopGuards[loopIndex + 1] || null;
            if (childLoopGuard) switchBody += `      if (__sm->__loop_progress_${childLoopGuard.depth} == 0) {\n`;
            for (const statement of loopGuard.preAwaitStatements) {
              for (const line of lowerStatementNode(statement, compileContext, 3, { returnTypeCpp: machine.returnValueCppType })) switchBody += `${line}\n`;
            }
            if (childLoopGuard) switchBody += `      }\n`;
            switchBody += `      ${activeLoopProgress} = 1;\n`;
          } else {
            const localField = `__sm->__local_${loopGuard.variableName}`;
            const loweredInitializer = lowerExpressionValue(loopGuard.initializerExpression, compileContext);
            const loweredCondition = lowerExpressionValue(loopGuard.condition, compileContext);
            const loweredIncrement = lowerExpressionValue(loopGuard.increment, compileContext);
            switchBody += `      if (${activeLoopProgress} == 0) {\n        ${localField} = ${loweredInitializer};\n      }\n`;
            switchBody += `      if (${activeLoopProgress} == 2) {\n        ${loweredIncrement};\n      }\n`;
            switchBody += `      if (!(${loweredCondition})) {\n`;
            appendLoopExitRoute();
            const childLoopGuard = loopGuards[loopIndex + 1] || null;
            if (childLoopGuard) switchBody += `      if (__sm->__loop_progress_${childLoopGuard.depth} == 0) {\n`;
            for (const statement of loopGuard.preAwaitStatements) {
              for (const line of lowerStatementNode(statement, compileContext, 3, { returnTypeCpp: machine.returnValueCppType })) switchBody += `${line}\n`;
            }
            if (childLoopGuard) switchBody += `      }\n`;
            switchBody += `      ${activeLoopProgress} = 1;\n`;
          }
        }
        if (ifGuard) {
          if (ifGuard.isFirstAwait && ifGuard.branchKind === 'consequent') {
            const loweredCondition = lowerExpressionValue(ifGuard.condition, compileContext);
            if (loweredCondition !== null) {
              switchBody += `      if (!(${loweredCondition})) {\n`;
              if (ifGuard.alternateHasAwait) {
                switchBody += `        __sm->__branch = ${ifGuard.otherBranchMarker};\n`;
              } else if (ifGuard.alternate) {
                const alternateLines = lowerStatementNode(
                  ifGuard.alternate,
                  compileContext,
                  3,
                  { returnTypeCpp: machine.returnValueCppType }
                );
                for (const line of alternateLines) {
                  switchBody += `${line}\n`;
                }
              }
              switchBody += `        __sm->__state = ${i};\n`;
              switchBody += `        ${structName}__resume(__sm);\n`;
              switchBody += `        return;\n`;
              switchBody += `      }\n`;
            }
          } else {
            switchBody += `      if (__sm->__branch != ${ifGuard.branchMarker}) {\n`;
            switchBody += `        __sm->__state = ${i};\n`;
            switchBody += `        ${structName}__resume(__sm);\n`;
            switchBody += `        return;\n`;
            switchBody += `      }\n`;
          }
          for (const statement of ifGuard.preAwaitStatements) {
            const preAwaitLines = lowerStatementNode(
              statement,
              compileContext,
              3,
              { returnTypeCpp: machine.returnValueCppType }
            );
            for (const line of preAwaitLines) {
              switchBody += `${line}\n`;
            }
          }
          if (ifGuard.isFirstAwait) {
            switchBody += `      __sm->__branch = ${ifGuard.branchMarker};\n`;
          }
        }
        switchBody += `      __sm->__state = ${i};\n`;
        if (usesDynamicTransport) {
          switchBody += `      __async_prepare_await((void*)__sm, ${globalScheduleState});\n`;
        }
        if (awaitedExpr) {
          switchBody += `      ${awaitedExpr};\n`;
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
        switchBody += `      const char* ${entry.handler.paramName} = __async_handle_get_string(__exc_data());\n`;
        switchBody += `      __exc_clear();\n`;
        for (const statement of catchStatements) {
          const loweredCatchLines = lowerStatementNode(statement, compileContext, 3, { returnTypeCpp: machine.returnValueCppType });
          for (const line of loweredCatchLines) {
            switchBody += `${line}\n`;
          }
        }
        const catchContinuationState = entry.postCatchFinallyState
          ? entry.postCatchFinallyState.stateId
          : entry.continuationStateId;
        switchBody += `      __sm->__state = ${catchContinuationState};\n`;
        switchBody += `      ${structName}__resume(__sm);\n`;
        switchBody += `      return;\n`;
        switchBody += `    }\n`;
      }
      for (const route of syntheticExceptionRouteStates) {
        switchBody += `    case ${route.stateId}: { /* async exception frame ${route.frameIndex} */\n`;
        switchBody += `      /* exception frame depth: ${route.frameDepth} */\n`;
        for (const entry of route.catchStates) {
          switchBody += `      if (__exc_active() && __exc_matches(__exc_type(), ${entry.handler.typeCode})) {\n`;
          switchBody += `        /* catch handler for ${entry.handler.paramName} (state ${entry.stateId}) */\n`;
          switchBody += `        __sm->__state = ${entry.stateId};\n`;
          switchBody += `        ${structName}__resume(__sm);\n`;
          switchBody += `        return;\n`;
          switchBody += `      }\n`;
        }
        if (route.finallyState) {
          switchBody += `      if (__exc_active()) {\n`;
          switchBody += `        /* finally handler transition (state ${route.finallyState.stateId}, frame ${route.frameIndex}) */\n`;
          switchBody += `        __sm->__state = ${route.finallyState.stateId};\n`;
          switchBody += `        ${structName}__resume(__sm);\n`;
          switchBody += `        return;\n`;
          switchBody += `      }\n`;
        }
        switchBody += `      __sm->__state = ${route.nextStateId};\n`;
        switchBody += `      ${structName}__resume(__sm);\n`;
        switchBody += `      return;\n`;
        switchBody += `    }\n`;
      }
      for (const entry of syntheticFinallyStates) {
        const finallyBlock = entry.handler.finallyNode
          ? findFirstNonterminal(entry.handler.finallyNode, 'block')
          : null;
        const finallyStatements = finallyBlock
          ? (finallyBlock.children || []).filter((child) => child && child.kind === 'nonterminal' && child.name === 'statement')
          : [];
        switchBody += `    case ${entry.stateId}: { /* async finally handler */\n`;
        for (const statement of finallyStatements) {
          const loweredFinallyLines = lowerStatementNode(statement, compileContext, 3, { returnTypeCpp: machine.returnValueCppType });
          for (const line of loweredFinallyLines) {
            switchBody += `${line}\n`;
          }
        }
        switchBody += `      __sm->__state = ${entry.nextStateId};\n`;
        switchBody += `      ${structName}__resume(__sm);\n`;
        switchBody += `      return;\n`;
        switchBody += `    }\n`;
      }
      switchBody += `    default:\n`;
      switchBody += `      __exc_clear();\n`;
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
      const loopProgressDepth = Math.max(
        0,
        ...(machine.body || []).map((suspendPoint) => (suspendPoint.loopChain || []).length)
      );
      const loopProgressFieldLines = Array.from(
        { length: loopProgressDepth },
        (_, depth) => `  int __loop_progress_${depth};`
      ).join('\n');
      const loopProgressAssignments = Array.from(
        { length: loopProgressDepth },
        (_, depth) => `  __sm->__loop_progress_${depth} = 0;`
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
        `  int __branch;`,
        `  int __loop;`,
        loopProgressFieldLines,
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
        `  __sm->__branch = 0;`,
        `  __sm->__loop = 0;`,
        loopProgressAssignments.join('\n'),
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
      'extern int __async_handle_get_handle(int handle, const char* key);',
      'extern int __async_handle_call0(int handle, const char* key);',
      'extern int __async_handle_call1_i32(int handle, const char* key, int value);',
      'extern int __async_handle_call1_f64(int handle, const char* key, double value);',
      'extern int __async_handle_call1_string(int handle, const char* key, const char* value);',
      'extern int __async_handle_arg_i32(int value);',
      'extern int __async_handle_arg_f64(double value);',
      'extern int __async_handle_arg_string(const char* value);',
      'extern int __async_handle_arg_handle(int value);',
      'extern int __async_handle_aggregate_begin_array(void);',
      'extern int __async_handle_aggregate_begin_object(void);',
      'extern int __async_handle_aggregate_push_i32(int value);',
      'extern int __async_handle_aggregate_push_f64(double value);',
      'extern int __async_handle_aggregate_push_string(const char* value);',
      'extern int __async_handle_aggregate_push_handle(int value);',
      'extern int __async_handle_aggregate_set_i32(const char* key, int value);',
      'extern int __async_handle_aggregate_set_f64(const char* key, double value);',
      'extern int __async_handle_aggregate_set_string(const char* key, const char* value);',
      'extern int __async_handle_aggregate_set_handle(const char* key, int value);',
      'extern int __async_handle_aggregate_end(void);',
      'extern int __async_handle_callN(int handle, const char* key, int count);',
      'extern int __async_handle_to_i32(int handle);',
      'extern double __async_handle_to_f64(int handle);',
      'extern int __async_handle_equals_string(int handle, const char* value);',
      'extern const char* __async_handle_get_property_string(int handle, const char* key);',
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
    if (!found) {
      walk(tree, (node) => {
        if (found || !node || node.kind !== 'nonterminal') return;
        if (node.name === 'exponentiationExpression' || node.name === 'exponentiationExpressionNoIn') {
          if ((node.children || []).some((c) => c && c.kind === 'terminal' && String(c.value || '').trim() === '**')) {
            found = true;
          }
        }
      });
    }
    return found;
  }

  function treeUsesUnsignedRightShift(tree) {
    let found = false;
    walk(tree, (node) => {
      if (found || !node || node.kind !== 'terminal') return;
      if (String(node.value || '').trim() === '>>>') found = true;
    });
    return found;
  }

  function emitExponentiationAssignmentHelpersCpp(tree) {
    const parts = [];
    if (treeUsesUnsignedRightShift(tree)) {
      parts.push([
        'static double __maia_ushift_r(int a, int b) {',
        '  int s = b & 31;',
        '  if (s == 0) {',
        '    return a < 0 ? 4294967296.0 + (double)a : (double)a;',
        '  }',
        '  int masked = (a >> 1) & 0x7fffffff;',
        '  return (double)(masked >> (s - 1));',
        '}'
      ].join('\n'));
    }
    if (!treeUsesExponentiationAssignment(tree)) {
      return parts.join('\n');
    }

    parts.push([
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
    ].join('\n'));
    return parts.join('\n');
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
    const needsRuntimeCstr = Boolean(
      compileContext && (
        compileContext.consoleConcatHelperUsed
        || (compileContext.closurePlan && compileContext.closurePlan.orderedClosures.length > 0)
        || (compileContext.promisePlan && compileContext.promisePlan.enabled)
        || (compileContext.iteratorPlan && compileContext.iteratorPlan.enabled)
        || (compileContext.atomicsPlan && compileContext.atomicsPlan.enabled)
      )
    );
    if (!needsRuntimeCstr && !treeUsesConsoleConcatHelper(tree, compileContext)) {
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
      if (/__(map|filter|find|pop|shift)$/.test(fn)) {
        return 'void*';
      }
      if (/__(indexOf|lastIndexOf|findIndex)$/.test(fn)) {
        return 'int';
      }
      if (/__includes$/.test(fn) || fn === '__Array__isArray' || fn === '__Number__isInteger' || fn === '__Object__prototype__hasOwnProperty__call') {
        return 'int';
      }
      if (fn === '__Math__min' || fn === '__Math__max') {
        return 'double';
      }
      if (fn === '__Number') {
        return 'int';
      }
      if (fn === '__String' || fn === '__String__fromCharCode' || fn === '__JSON__stringify') {
        return 'const char*';
      }
      if (signatures._usedAsValueHosts && signatures._usedAsValueHosts.has(fn)) {
        return 'int';
      }
      return 'void';
    };
    Array.from(signatures.entries())
      .forEach(([fn, argTypes]) => {
        if (fn === '__Reflect' || fn === '__maia_this_ptr' || fn === '__const' || fn === '__let') {
          return;
        }
        if (/^___/.test(fn)) {
          hostDeclMap.set(fn, `extern void* ${fn}(void*, ...);`);
          return;
        }
        if (/__call$/.test(fn)) {
          const callRet = fn === '__Object__prototype__hasOwnProperty__call' ? 'int' : 'void';
          hostDeclMap.set(fn, `extern ${callRet} ${fn}(void*, ...);`);
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

    const functionPrototypes = profileStep('emitTopLevelFunctionPrototypes', () => emitTopLevelFunctionPrototypes(tree, compileContext));
    const functionDefs = profileStep('emitTopLevelFunctionDefinitions', () => emitTopLevelFunctionDefinitions(tree, compileContext));
    const classDefs = profileStep('emitTopLevelClassDefinitions', () => emitTopLevelClassDefinitions(tree, compileContext));
    const sharedRuntimeFallbackHelpers = profileStep('emitSharedRuntimeFallbackHelpersCpp', () => emitSharedRuntimeFallbackHelpersCpp(tree, compileContext));
    const filteredHostDecls = [];
    for (const [fn, decl] of hostDeclMap.entries()) {
      if (sharedRuntimeFallbackHelpers && new RegExp(`static\\s+[^;]*\\b${fn}\\s*\\(`).test(sharedRuntimeFallbackHelpers)) {
        continue;
      }
      filteredHostDecls.push(decl);
    }
    const hostDecls = filteredHostDecls.join('\n');
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
    const hasPromisePlanEarly = Boolean(compileContext && compileContext.promisePlan && compileContext.promisePlan.enabled);
    const asyncCpp = hasPromisePlanEarly ? '' : profileStep('emitAsyncStateMachinesCpp', () => emitAsyncStateMachinesCpp(asyncIr.asyncFunctions, bridgePlanByFunctionName, compileContext));

    const hasPromisePlan = Boolean(
      compileContext
      && compileContext.promisePlan
      && compileContext.promisePlan.enabled
    );
    const hasClosurePlan = Boolean(
      compileContext
      && compileContext.closurePlan
      && compileContext.closurePlan.orderedClosures.length > 0
    );
    const hasIteratorPlan = Boolean(compileContext && compileContext.iteratorPlan && compileContext.iteratorPlan.enabled);
    const closureHelpers = (hasClosurePlan || hasPromisePlan || hasIteratorPlan)
      ? profileStep('emitClosureRuntimeHelpersCpp', () => closures.emitClosureRuntimeHelpersCpp(compileContext.closurePlan, { hasPromises: hasPromisePlan }))
      : '';
    const genResult = hasIteratorPlan
      ? profileStep('emitGeneratorFunctionsCpp', () => emitGeneratorFunctionsCpp(tree, compileContext))
      : { structs: '', stepProtos: '', protos: '', defs: '', generators: [] };
    const iteratorHelpers = hasIteratorPlan
      ? profileStep('emitIteratorRuntimeHelpersCpp', () => iterators.emitIteratorRuntimeHelpersCpp({ generators: genResult.generators }).join('\n'))
      : '';
    const hasAtomicsPlan = Boolean(compileContext && compileContext.atomicsPlan && compileContext.atomicsPlan.enabled);
    const atomicsHelpers = hasAtomicsPlan
      ? profileStep('emitAtomicsRuntimeHelpersCpp', () => atomics.emitAtomicsRuntimeHelpersCpp())
      : '';
    const hasCollectionsPlan = Boolean(compileContext && compileContext.collectionsPlan && compileContext.collectionsPlan.enabled);
    const collectionsHelpers = hasCollectionsPlan
      ? profileStep('emitCollectionsRuntimeHelpersCpp', () => collections.emitCollectionsRuntimeHelpersCpp({ hasClosurePlan: Boolean(compileContext && compileContext.closurePlan && compileContext.closurePlan.orderedClosures && compileContext.closurePlan.orderedClosures.length > 0) }))
      : '';
    const promiseHelpers = hasPromisePlan
      ? profileStep('emitPromiseRuntimeHelpersCpp', () => promises.emitPromiseRuntimeHelpersCpp())
      : '';
    const promiseAsyncFns = hasPromisePlan
      ? profileStep('emitPromiseAsyncFunctionsCpp', () => emitPromiseAsyncFunctionsCpp(tree, compileContext))
      : { structs: '', protos: '', defs: '' };
    const closureImpls = hasClosurePlan
      ? profileStep('emitClosureImplementationsCpp', () => emitClosureImplementationsCpp(compileContext))
      : '';

    const prevRootBoxedVars = compileContext.activeBoxedVars || null;
    compileContext.activeBoxedVars = compileContext.closurePlan && compileContext.closurePlan.rootScope
      ? compileContext.closurePlan.rootScope.boxedVars
      : null;
    const statements = profileStep('lowerProgramToCppStatements', () => lowerProgramToCppStatements(tree, compileContext, {
      includeFunctionDeclarations: false,
      includeClassDeclarations: false
    }));
    compileContext.activeBoxedVars = prevRootBoxedVars;
    const body = statements.length > 0 ? statements.join('\n') : '';
    let libraryGlobals = '';
    if (compileContext && compileContext.library && statements.length > 0) {
      const globalLines = [];
      for (const stmt of statements) {
        const cellMatch = String(stmt).match(/^\s{2}int\*\s+(__cell_([A-Za-z_][A-Za-z0-9_]*))\s*=\s*new int\[1\];$/);
        if (cellMatch) {
          globalLines.push(`static int ${cellMatch[2]} = 0;`);
          globalLines.push(`static int ${cellMatch[1]}[1] = {0};`);
          continue;
        }
        const m = String(stmt).match(/^\s{2}((?:const\s+)?(?:int|double|void\*|const char\*)\s+[A-Za-z_][A-Za-z0-9_]*\s*=\s*(?:0|0\.0|1|-?\d+(?:\.\d+)?|"(?:[^"\\]|\\.)*"|\(void\*\)\(0\));)$/);
        if (m) {
          globalLines.push(`static ${m[1].replace(/^const\s+/, '')}`);
        }
      }
      if (globalLines.length > 0) {
        libraryGlobals = globalLines.join('\n') + '\n\n';
      }
    }

    const strSliceDecl = (compileContext && compileContext.strSliceUsed)
      ? "extern const char* __maia_str_slice(const char*, int, int, int);\n"
      : "";
    const arrayJoinDecl = (compileContext && compileContext.arrayJoinUsed)
      ? "extern const char* __maia_array_join(void*, const char*);\n"
      : "";
    const mathMinMaxDecls = (compileContext && compileContext.mathMinMaxHelpersUsed)
      ? "static double __maia_math_min2(double a, double b) { return a < b ? a : b; }\nstatic double __maia_math_max2(double a, double b) { return a > b ? a : b; }\n"
      : "";
    const chainedJsDecls = (compileContext && compileContext.chainedJsRuntimeMethodsUsed && compileContext.chainedJsRuntimeMethodsUsed.size > 0)
      ? Array.from(compileContext.chainedJsRuntimeMethodsUsed.entries()).map(([mName, maxArgs]) => {
          const isStrRet = mName === 'trim' || mName === 'trimStart' || mName === 'trimEnd' || mName === 'toLowerCase' || mName === 'toUpperCase' || mName === 'charAt' || mName === 'repeat' || mName === 'padStart' || mName === 'padEnd' || mName === 'replaceAll';
          const retType = isStrRet ? 'const char*' : 'void*';
          const params = ['void*', ...Array.from({ length: maxArgs }, () => 'long')].join(', ');
          return `extern ${retType} __maia_js_${mName}(${params});\n`;
        }).join('')
      : "";
      const regexHostDecls = (compileContext && compileContext.regexUsed)
      ? "extern void* __maiaregex__new(const char*, const char*);\nextern int __maiaregex__test(void*, const char*);\nextern const char* __maiaregex__replace(const char*, void*, const char*);\nextern void* __maiaregex__match(const char*, void*);\n"
      : "";
    const generatedCpp = `${mathMinMaxDecls}${strSliceDecl}${arrayJoinDecl}${chainedJsDecls}${regexHostDecls}${hostDecls}${hostDecls ? '\n\n' : (regexHostDecls ? '\n' : '')}`
      + `${sharedRuntimeFallbackHelpers}${sharedRuntimeFallbackHelpers ? '\n\n' : ''}`
      + `${consoleConcatHelpers}${consoleConcatHelpers ? '\n\n' : ''}`
      + `${exponentiationAssignmentHelpers}${exponentiationAssignmentHelpers ? '\n\n' : ''}`
      + `${objectLiteralDecls}${objectLiteralDecls ? '\n\n' : ''}`
      + `${objectLiteralFallback}${objectLiteralFallback ? '\n\n' : ''}`
      + `${arrayLiteralDecls}${arrayLiteralDecls ? '\n\n' : ''}`
      + `${arrayLiteralFallback}${arrayLiteralFallback ? '\n\n' : ''}`
      + `${lambdaDecls}${lambdaDecls ? '\n\n' : ''}`
      + `${lambdaFallback}${lambdaFallback ? '\n\n' : ''}`
      + `${closureHelpers}${closureHelpers ? '\n\n' : ''}`
      + `${promiseHelpers}${promiseHelpers ? '\n\n' : ''}`
      + `${genResult.structs}${genResult.structs ? '\n\n' : ''}`
      + `${genResult.stepProtos}${genResult.stepProtos ? '\n\n' : ''}`
      + `${iteratorHelpers}${iteratorHelpers ? '\n\n' : ''}`
      + `${atomicsHelpers}${atomicsHelpers ? '\n\n' : ''}`
      + `${collectionsHelpers}${collectionsHelpers ? '\n\n' : ''}`
      + `${asyncSchedulerHooks}${asyncSchedulerHooks ? '\n\n' : ''}`
      + `${asyncCpp}${asyncCpp ? '\n\n' : ''}`
      + `${classDefs}${classDefs ? '\n\n' : ''}`
      + `${promiseAsyncFns.structs}${promiseAsyncFns.structs ? '\n\n' : ''}`
      + `${libraryGlobals}`
      + `${functionPrototypes}${functionPrototypes ? '\n\n' : ''}`
      + `${promiseAsyncFns.protos}${promiseAsyncFns.protos ? '\n\n' : ''}`
      + `${genResult.protos}${genResult.protos ? '\n\n' : ''}`
      + `${closureImpls}${closureImpls ? '\n\n' : ''}`
      + `${functionDefs}${functionDefs ? '\n\n' : ''}`
      + `${promiseAsyncFns.defs}${promiseAsyncFns.defs ? '\n\n' : ''}`
      + `${genResult.defs}${genResult.defs ? '\n\n' : ''}`
      + (compileContext && compileContext.library ? '' : (
        `int main() {\n`
        + `${body}\n`
        + `${hasPromisePlan ? '  __maia_event_loop_drain();\n' : ''}`
        + `  return 0;\n`
        + `}\n`
      ));

    return generatedCpp;
  }


  return {
    generateCpp
  };
}

module.exports = { createCppCodegen };
