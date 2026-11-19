'use strict';

const closures = require('./closures');
const atomics = require('./atomics');
const {
  walk,
  flattenNodeText,
  findFirstIdentifierValue,
  findFirstNonterminal
} = require('./ast-utils');

function createExpressionLowering(deps) {
  const {
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
  } = deps;

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
      const segments = extractPathFromMemberExpression(memberExprNode, null);
      if (segments && segments.length >= 2) {
        if (!compileContext) {
          return segments.join('.');
        }
        const memberPath = segments.join('.');
        const isKnownAssignedFunctionTarget = compileContext.topLevelAssignedFunctionExpressionSymbols
          && compileContext.topLevelAssignedFunctionExpressionSymbols.has(memberPath);
        if (isKnownAssignedFunctionTarget) {
          return memberPath;
        }
        const isThisMember = segments[0] === 'this';
        const localClassType = isThisMember ? null : findBoundClassInstanceTypeAtNode(segments[0], memberExprNode, compileContext);
        if (compileContext && compileContext.atomicsPlan && compileContext.atomicsPlan.enabled && segments.length === 2 && segments[1] === 'byteLength') {
          return `__maia_runtime_value_get_property((void*)(${sanitizeCppIdentifier(segments[0])}), (void*)"byteLength")`;
        }
        if (segments.length === 2 && segments[1] === 'size' && (localClassType === 'Set' || localClassType === 'Map')) {
          if (compileContext) { compileContext.runtimeFallbackHelpersUsed = true; }
          return localClassType === 'Set'
            ? `__maia_set_size((void*)(${sanitizeCppIdentifier(segments[0])}))`
            : `__maia_map_size((void*)(${sanitizeCppIdentifier(segments[0])}))`;
        }
        if (!isThisMember && !localClassType) {
          if (compileContext && compileContext.atomicsPlan && compileContext.atomicsPlan.enabled && segments.length === 2 && segments[1] === 'byteLength') {
            return `__maia_runtime_value_get_property((void*)(${segments[0]}), (void*)"byteLength")`;
          }
          reportUnsupportedLowering(
            compileContext,
            'left-hand-side-unlowerable',
            `member assignment target '${memberPath}' is not a known C++ object`
          );
          if (compileContext && compileContext.strictLowering) {
            err(`unsupported lowering: member assignment target '${memberPath}'`);
          }
          return null;
        }
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
    if (identifier && compileContext && compileContext.inlineIdentifierExpressions) {
      const inlineTarget = compileContext.inlineIdentifierExpressions.get(identifier);
      if (inlineTarget) {
        return inlineTarget;
      }
    }
    if (identifier && compileContext && compileContext.asyncStateLocalFields) {
      const asyncStateField = compileContext.asyncStateLocalFields.get(identifier);
      if (asyncStateField) {
        return `__sm->${asyncStateField}`;
      }
    }
    return identifier ? sanitizeCppIdentifier(identifier) : null;
  }

  function lowerAssignmentExpressionValue(node, compileContext) {
    if (!node
      || node.kind !== 'nonterminal'
      || (node.name !== 'assignmentExpression' && node.name !== 'assignmentExpressionNoIn')) {
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
    let lhsChild = (children[0] && children[0].kind === 'nonterminal' && children[0].name === 'leftHandSideExpression') 
      ? children[0] 
      : null;
    if (!lhsChild) {
      lhsChild = findFirstNonterminal(node, 'leftHandSideExpression');
    }
    let opChild = (children[1] && children[1].kind === 'nonterminal' && children[1].name === 'assignmentOperator')
      ? children[1]
      : null;
    if (!opChild) {
      opChild = findFirstNonterminal(node, 'assignmentOperator');
    }
    let rhsChild = (children[2] && children[2].kind === 'nonterminal' && children[2].name === 'assignmentExpression')
      ? children[2]
      : null;
    if (!rhsChild) {
      for (let index = 2; index < children.length; index += 1) {
        rhsChild = findFirstNonterminal(children[index], 'assignmentExpression');
        if (rhsChild) {
          break;
        }
      }
    }
    if (!rhsChild && children[2] && children[2].kind === 'nonterminal' && children[2].name === 'assignmentExpressionNoIn') {
      rhsChild = children[2];
    }
    if (!rhsChild) {
      for (let index = 2; index < children.length; index += 1) {
        rhsChild = findFirstNonterminal(children[index], 'assignmentExpressionNoIn');
        if (rhsChild) {
          break;
        }
      }
    }

    if (lhsChild && opChild && rhsChild) {
      const fallbackLhs = lowerIdentifierFromLeftHandSideExpression(lhsChild, null);
      const lhsMemberExprNode = findFirstNonterminal(lhsChild, 'memberExpression');
      const lhsComputedInfo = lhsMemberExprNode ? extractComputedMemberAccessInfo(lhsMemberExprNode) : null;

      let operatorToken = (opChild.children || []).find((child) => child && child.kind === 'terminal') || null;
      if (!operatorToken) {
        walk(opChild, (child) => {
          if (!operatorToken && child && child.kind === 'terminal') {
            operatorToken = child;
          }
        });
      }
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

      if (lhsComputedInfo && operatorValue === '=') {
        const loweredBase = lowerExpressionValue(lhsComputedInfo.baseExpressionNode, compileContext);
        const loweredProperty = lowerExpressionValue(lhsComputedInfo.propertyExpressionNode, compileContext);
        const rhsValue = lowerExpressionValue(rhsChild, compileContext);
        const propertyModel = compileContext
          ? resolveStaticModelFromExpression(lhsComputedInfo.propertyExpressionNode, lhsComputedInfo.propertyExpressionNode, compileContext)
          : null;
        if (loweredBase !== null && loweredProperty !== null && rhsValue !== null) {
          const normalizedRhs = rhsValue === 'null' ? 'nullptr' : rhsValue;
          if (propertyModel && propertyModel.kind === 'string') {
            return `(__maia_runtime_value_set_property((void*)(${loweredBase}), ${JSON.stringify(propertyModel.value)}, (long)(${normalizedRhs})), ${normalizedRhs})`;
          }
          return `(__maia_runtime_value_set_index((void*)(${loweredBase}), (int)(${loweredProperty}), (long)(${normalizedRhs})), ${normalizedRhs})`;
        }
      }

      if (operatorValue && operatorValue.endsWith('=') && operatorValue !== '=' && lhsMemberExprNode && !lhsComputedInfo) {
        const lhsSegments = extractPathFromMemberExpression(lhsMemberExprNode);
        if (lhsSegments && lhsSegments.length >= 2 && lhsSegments[0] !== 'this' && !findBoundClassInstanceTypeAtNode(lhsSegments[0], lhsMemberExprNode, compileContext)) {
          const rhsValue = lowerExpressionValue(rhsChild, compileContext);
          if (rhsValue !== null) {
            if (compileContext) compileContext.runtimeFallbackHelpersUsed = true;
            let baseExpr = lhsSegments[0];
            for (let si = 1; si < lhsSegments.length - 1; si += 1) {
              baseExpr = `__maia_runtime_value_get_property((void*)(${baseExpr}), (void*)${staticStringLiteralCpp(lhsSegments[si])})`;
            }
            const propName = lhsSegments[lhsSegments.length - 1];
            const binOp = operatorValue.slice(0, -1);
            const curVal = `__maia_runtime_value_get_property((void*)(${baseExpr}), (void*)${staticStringLiteralCpp(propName)})`;
            return `(__maia_runtime_value_set_property((void*)(${baseExpr}), ${staticStringLiteralCpp(propName)}, (long)((long)(${curVal}) ${binOp} (long)(${rhsValue}))), __maia_runtime_value_get_property((void*)(${baseExpr}), (void*)${staticStringLiteralCpp(propName)}))`;
          }
        }
      }
      if (operatorValue === '=' && lhsMemberExprNode && !lhsComputedInfo) {
        const lhsSegments = extractPathFromMemberExpression(lhsMemberExprNode);
        if (!lhsSegments) {
          const mChildren = lhsMemberExprNode.children || [];
          if (mChildren.length >= 3 && mChildren[1] && mChildren[1].kind === 'terminal' && mChildren[1].value === '.') {
            const baseExpr = lowerExpressionValue(mChildren[0], compileContext);
            const propName = findFirstIdentifierValue(mChildren[2]);
            const rhsValue = lowerExpressionValue(rhsChild, compileContext);
            if (baseExpr !== null && propName && rhsValue !== null) {
              if (compileContext) compileContext.runtimeFallbackHelpersUsed = true;
              const normalizedRhs = rhsValue === 'null' ? 'nullptr' : rhsValue;
              return `(__maia_runtime_value_set_property((void*)(${baseExpr}), ${JSON.stringify(propName)}, (long)(${normalizedRhs})), ${normalizedRhs})`;
            }
          }
        }
        if (lhsSegments && ((lhsSegments.length >= 2 && lhsSegments[0] !== 'this') || (lhsSegments.length >= 3 && lhsSegments[0] === 'this'))) {
          const localClassType = compileContext ? findBoundClassInstanceTypeAtNode(lhsSegments[0], lhsMemberExprNode, compileContext) : null;
          const memberPath = lhsSegments.join('.');
          const isAssignedFn = compileContext && compileContext.topLevelAssignedFunctionExpressionSymbols && compileContext.topLevelAssignedFunctionExpressionSymbols.has(memberPath);
          if (!localClassType && !isAssignedFn) {
            const rhsValue = lowerExpressionValue(rhsChild, compileContext);
            if (rhsValue !== null) {
              if (compileContext) { compileContext.runtimeFallbackHelpersUsed = true; }
              const normalizedRhs = rhsValue === 'null' ? 'nullptr' : rhsValue;
              let baseExpr = lhsSegments[0] === 'this' ? `this->${lhsSegments[1]}` : lhsSegments[0];
              const startSi = lhsSegments[0] === 'this' ? 2 : 1;
              for (let si = startSi; si < lhsSegments.length - 1; si += 1) {
                baseExpr = `__maia_runtime_value_get_property((void*)(${baseExpr}), ${JSON.stringify(lhsSegments[si])})`;
              }
              const propName = lhsSegments[lhsSegments.length - 1];
              return `(__maia_runtime_value_set_property((void*)(${baseExpr}), ${JSON.stringify(propName)}, (long)(${normalizedRhs})), ${normalizedRhs})`;
            }
          }
        }
      }
      if (operatorValue === '=' && fallbackLhs) {
        const assignedCallableSymbol = compileContext
          && compileContext.topLevelAssignedFunctionExpressionSymbols
          ? compileContext.topLevelAssignedFunctionExpressionSymbols.get(fallbackLhs)
          : null;
        const rhsCallExpression = extractDirectCallExpressionNode(rhsChild);
        const rhsMemberExpression = rhsCallExpression
          ? (rhsCallExpression.children || []).find(
            (child) => child && child.kind === 'nonterminal' && child.name === 'memberExpression'
          ) || null
          : null;
        const rhsPathSegments = rhsMemberExpression
          ? extractPathFromMemberExpression(rhsMemberExpression, null)
          : null;
        const isPrototypeCreateAssignment = fallbackLhs.endsWith('.prototype')
          && rhsCallExpression
          && Array.isArray(rhsPathSegments)
          && rhsPathSegments.join('.') === 'Object.create';
        const isPrototypeConstructorAssignment = fallbackLhs.endsWith('.prototype.constructor');
        const rhsFunctionExpression = extractDirectFunctionExpressionInitializer(rhsChild);
        const rhsArrowFunction = extractDirectArrowFunctionInitializer(rhsChild);
        const isPrototypeMethodAssignment = fallbackLhs.includes('.prototype.')
          && (assignedCallableSymbol || rhsFunctionExpression || rhsArrowFunction);
        const isTopLevelStaticMethodAssignment = fallbackLhs.includes('.')
          && !fallbackLhs.includes('.prototype.')
          && (assignedCallableSymbol || rhsFunctionExpression || rhsArrowFunction)
          && compileContext
          && compileContext.topLevelBindingNames
          && compileContext.topLevelBindingNames.has(fallbackLhs.split('.')[0]);
        if (isPrototypeCreateAssignment || isPrototypeConstructorAssignment || isPrototypeMethodAssignment || isTopLevelStaticMethodAssignment) {
          return '(void)0';
        }
      }

      let lhs = lowerIdentifierFromLeftHandSideExpression(lhsChild, compileContext);
      if (!lhs && compileContext && compileContext.topLevelAssignedFunctionExpressionSymbols) {
        if (fallbackLhs && compileContext.topLevelAssignedFunctionExpressionSymbols.has(fallbackLhs)) {
          lhs = fallbackLhs;
        }
      }

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

      const assignedFunctionSymbol = compileContext
        && compileContext.topLevelAssignedFunctionExpressionSymbols
        ? compileContext.topLevelAssignedFunctionExpressionSymbols.get(lhs)
        : null;
      const rhs = assignedFunctionSymbol || lowerExpressionValue(rhsChild, compileContext);

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
      if (operatorValue === '%=') {
        return `${lhs} = (double)((int)(${lhs}) % (int)(${rhsValue}))`;
      }
      return `${lhs} ${operatorValue} ${rhsValue}`;
    }

    let nonterminalChildren = children.filter((child) => child && child.kind === 'nonterminal');
    const directCallChildren = nonterminalChildren.filter((child) => child.name === 'callExpression');
    if (directCallChildren.length === 1) {
      nonterminalChildren = directCallChildren;
    }
    if (nonterminalChildren.length === 0) {
      const fallbackCandidates = [];
      const fallbackNames = [
        'conditionalExpression',
        'conditionalExpressionNoIn',
        'leftHandSideExpression',
        'unaryExpression',
        'postfixExpression',
        'primaryExpression'
      ];
      for (const child of children) {
        if (!child || child.kind !== 'nonterminal') {
          continue;
        }
        let candidate = null;
        for (const name of fallbackNames) {
          candidate = findFirstNonterminal(child, name);
          if (candidate) {
            break;
          }
        }
        if (candidate) {
          fallbackCandidates.push(candidate);
        }
      }
      nonterminalChildren = fallbackCandidates;
    }
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
      const lhsMember = findFirstNonterminal(children[0], 'memberExpression');
      const lhsSegs = lhsMember ? extractPathFromMemberExpression(lhsMember, null) : null;
      if (lhsSegs && lhsSegs.length >= 2 && lhsSegs[0] !== 'this' && !findBoundClassInstanceTypeAtNode(lhsSegs[0], lhsMember, compileContext)) {
        if (compileContext) compileContext.runtimeFallbackHelpersUsed = true;
        let baseExpr = lhsSegs[0];
        for (let si = 1; si < lhsSegs.length - 1; si += 1) {
          baseExpr = `__maia_runtime_value_get_property((void*)(${baseExpr}), (void*)${staticStringLiteralCpp(lhsSegs[si])})`;
        }
        const propName = lhsSegs[lhsSegs.length - 1];
        const delta = children[1].token === 'TOKEN__2B__2B_' ? 1 : -1;
        const curVal = `__maia_runtime_value_get_property((void*)(${baseExpr}), (void*)${staticStringLiteralCpp(propName)})`;
        if (compileContext) {
          if (!Array.isArray(compileContext._preludeStatements)) compileContext._preludeStatements = [];
          compileContext._postTmpCount = (compileContext._postTmpCount || 0) + 1;
          const tmp = `__maia_post_tmp_${compileContext._postTmpCount}`;
          compileContext._preludeStatements.push(`long ${tmp} = (long)(${curVal});`);
          compileContext._preludeStatements.push(`__maia_runtime_value_set_property((void*)(${baseExpr}), ${staticStringLiteralCpp(propName)}, ${tmp} + (${delta}));`);
          return tmp;
        }
        return `__maia_runtime_value_set_property((void*)(${baseExpr}), ${staticStringLiteralCpp(propName)}, (long)(${curVal}) + (${delta}))`;
      }
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

    let nonterminalChildren = children.filter((child) => child && child.kind === 'nonterminal');
    if (nonterminalChildren.length === 0) {
      const fallbackCandidates = [];
      const fallbackNames = [
        'callExpression',
        'leftHandSideExpression',
        'unaryExpression',
        'primaryExpression',
        'memberExpression'
      ];
      for (const child of children) {
        if (!child || child.kind !== 'nonterminal') {
          continue;
        }
        let candidate = null;
        for (const name of fallbackNames) {
          candidate = findFirstNonterminal(child, name);
          if (candidate) {
            break;
          }
        }
        if (candidate) {
          fallbackCandidates.push(candidate);
        }
      }
      nonterminalChildren = fallbackCandidates;
    }
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
    if (compileContext && compileContext.atomicsPlan && compileContext.atomicsPlan.enabled
      && children[0] && children[0].kind === 'terminal' && children[0].value === 'typeof') {
      const id = children[1] ? findFirstIdentifierValue(children[1]) : null;
      if (id === 'SharedArrayBuffer' || (id && Object.prototype.hasOwnProperty.call(atomics.TYPED_ARRAY_SPECS, id))) {
        return '"function"';
      }
      if (id === 'Atomics') {
        return '"object"';
      }
    }
    
    // Try to find operator and operand even if encapsulated
    let opTerminal = (children[0] && children[0].kind === 'terminal' 
      && (children[0].token === 'TOKEN__21_' || children[0].token === 'TOKEN__2D_' || children[0].token === 'TOKEN__2B_' || children[0].token === 'TOKEN__7E_'))
      ? children[0]
      : null;
    if (!opTerminal) {
      for (const child of children) {
        if (child && child.kind === 'terminal'
          && (child.token === 'TOKEN__21_' || child.token === 'TOKEN__2D_' || child.token === 'TOKEN__2B_' || child.token === 'TOKEN__7E_')) {
          opTerminal = child;
          break;
        }
      }
    }
    
    let operandNode = (children[1] && children[1].kind === 'nonterminal')
      ? children[1]
      : null;
    if (!operandNode) {
      operandNode = findFirstNonterminal(node, 'postfixExpression') || findFirstNonterminal(node, 'unaryExpression') || findFirstNonterminal(node, 'primaryExpression');
    }
    
    if (opTerminal && operandNode && !opTerminal.token.includes('__2B__2B_') && !opTerminal.token.includes('__2D__2D_')) {
      const operand = lowerExpressionValue(operandNode, compileContext);
      if (operand === null) {
        reportUnsupportedLowering(
          compileContext,
          'unary-expression-unlowerable',
          `unary expression operand could not be lowered for '${opTerminal.value}'`
        );
        if (compileContext && compileContext.strictLowering) {
          err(`unsupported lowering: unary expression operand '${opTerminal.value}'`);
        }
        return null;
      }
      if (opTerminal.token === 'TOKEN__21_') {
        return `!((int)(${operand}))`;
      }
      if (opTerminal.token === 'TOKEN__2B_') {
        return operand;
      }
      return `${opTerminal.value}(${operand})`;
    }

    // Try to match prefix update operators (++/--)
    let prefixOpTerminal = (children[0] && children[0].kind === 'terminal'
      && (children[0].token === 'TOKEN__2B__2B_' || children[0].token === 'TOKEN__2D__2D_'))
      ? children[0]
      : null;
    if (!prefixOpTerminal) {
      for (const child of children) {
        if (child && child.kind === 'terminal' && (child.token === 'TOKEN__2B__2B_' || child.token === 'TOKEN__2D__2D_')) {
          prefixOpTerminal = child;
          break;
        }
      }
    }
    
    let prefixTargetNode = (children[1] && children[1].kind === 'nonterminal' && children[1].name === 'unaryExpression')
      ? children[1]
      : null;
    if (!prefixTargetNode) {
      prefixTargetNode = findFirstNonterminal(node, 'unaryExpression');
    }
    
    if (prefixOpTerminal && prefixTargetNode) {
      let postfixNode = (prefixTargetNode.children || []).find(
        (child) => child && child.kind === 'nonterminal' && child.name === 'postfixExpression'
      ) || null;
      if (!postfixNode) {
        postfixNode = findFirstNonterminal(prefixTargetNode, 'postfixExpression');
      }
      if (postfixNode) {
        let lhsNode = (postfixNode.children || []).find(
          (child) => child && child.kind === 'nonterminal' && child.name === 'leftHandSideExpression'
        ) || null;
        if (!lhsNode) {
          lhsNode = findFirstNonterminal(postfixNode, 'leftHandSideExpression');
        }
        if (lhsNode) {
          const target = lowerIdentifierFromLeftHandSideExpression(lhsNode, compileContext);
          if (target) {
            return `${prefixOpTerminal.value}${target}`;
          }
        }
      }
      reportUnsupportedLowering(
        compileContext,
        'unary-expression-unlowerable',
        `prefix update target could not be lowered for '${prefixOpTerminal.value}'`
      );
      if (compileContext && compileContext.strictLowering) {
        err(`unsupported lowering: prefix update target '${prefixOpTerminal.value}'`);
      }
      return null;
    }

    let nonterminalChildren = children.filter((child) => child && child.kind === 'nonterminal');
    const directCallChildren = nonterminalChildren.filter((child) => child.name === 'callExpression');
    if (directCallChildren.length === 1) {
      nonterminalChildren = directCallChildren;
    }
    if (nonterminalChildren.length === 0) {
      const fallbackCandidates = [];
      const fallbackNames = [
        'callExpression',
        'postfixExpression',
        'leftHandSideExpression',
        'primaryExpression',
        'memberExpression'
      ];
      for (const child of children) {
        if (!child || child.kind !== 'nonterminal') {
          continue;
        }
        let candidate = null;
        for (const name of fallbackNames) {
          candidate = findFirstNonterminal(child, name);
          if (candidate) {
            break;
          }
        }
        if (candidate) {
          fallbackCandidates.push(candidate);
        }
      }
      nonterminalChildren = fallbackCandidates;
    }
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

  function isFractionalNumericExpression(node) {
    const text = flattenNodeText(node, 64);
    return /^[+-]?(?:\d+\.\d*|\d*\.\d+)(?:[eE][+-]?\d+)?$/.test(text);
  }

  function isDynamicHandleMemberExpression(node, compileContext) {
    if (!compileContext || !compileContext.asyncStateDynamicHandleFields) return false;
    const memberNode = node && node.name === 'memberExpression'
      ? node
      : findFirstNonterminal(node, 'memberExpression');
    const segments = memberNode ? extractPathFromMemberExpression(memberNode, null) : null;
    return !!(segments && segments.length >= 2 && compileContext.asyncStateDynamicHandleFields.has(segments[0]));
  }

  function lowerDynamicHandleMemberAsF64(node, compileContext) {
    const previousType = compileContext.dynamicHandleNumericType;
    compileContext.dynamicHandleNumericType = 'f64';
    try {
      return lowerExpressionValue(node, compileContext);
    } finally {
      compileContext.dynamicHandleNumericType = previousType;
    }
  }

  function getCallExpressionTrailingPropertyName(node) {
    const propertyNames = getCallExpressionTrailingPropertyNames(node);
    return propertyNames.length > 0 ? propertyNames[0] : null;
  }

  function getCallExpressionTrailingPropertyNames(node) {
    const callNode = node && node.name === 'callExpression'
      ? node
      : findFirstNonterminal(node, 'callExpression');
    if (!callNode) return [];
    const children = callNode.children || [];
    const argsIndex = children.findIndex((child) => child && child.kind === 'nonterminal' && child.name === 'arguments');
    if (argsIndex < 0) return [];
    const names = [];
    for (let index = argsIndex + 1; index + 1 < children.length; index += 2) {
      if (!children[index] || children[index].kind !== 'terminal' || children[index].value !== '.') {
        break;
      }
      const name = findFirstIdentifierValue(children[index + 1]);
      if (!name) break;
      names.push(name);
    }
    return names;
  }

  function isDynamicHandleMethodCall(node, compileContext) {
    return getCallExpressionTrailingPropertyName(node) === null
      && getDynamicHandleMethodCallInfo(node, compileContext) !== null;
  }

  function isDynamicHandleMethodPropertyCall(node, compileContext) {
    return getCallExpressionTrailingPropertyName(node) !== null
      && getDynamicHandleMethodCallInfo(node, compileContext) !== null;
  }

  function lowerDynamicHandleMethodPropertyAsF64(node, compileContext) {
    const previousType = compileContext.dynamicHandleNumericType;
    compileContext.dynamicHandleNumericType = 'f64';
    try {
      return lowerExpressionValue(node, compileContext);
    } finally {
      compileContext.dynamicHandleNumericType = previousType;
    }
  }

  function lowerDynamicHandleMethodPropertyAsString(node, compileContext) {
    const previousType = compileContext.dynamicHandleMethodPropertyResultType;
    compileContext.dynamicHandleMethodPropertyResultType = 'string';
    try {
      return lowerExpressionValue(node, compileContext);
    } finally {
      compileContext.dynamicHandleMethodPropertyResultType = previousType;
    }
  }

  function lowerDynamicHandleMethodAsNumeric(node, compileContext, numericType) {
    const previousType = compileContext.dynamicHandleMethodResultType;
    compileContext.dynamicHandleMethodResultType = numericType;
    try {
      return lowerExpressionValue(node, compileContext);
    } finally {
      compileContext.dynamicHandleMethodResultType = previousType;
    }
  }

  function lowerDynamicHandleMethodAsString(node, compileContext) {
    const previousType = compileContext.dynamicHandleMethodResultType;
    compileContext.dynamicHandleMethodResultType = 'string';
    try {
      return lowerExpressionValue(node, compileContext);
    } finally {
      compileContext.dynamicHandleMethodResultType = previousType;
    }
  }

  function getDynamicHandleMethodCallInfo(node, compileContext) {
    if (!compileContext || !compileContext.asyncStateDynamicHandleFields) return null;

    const callNode = node && node.name === 'callExpression'
      ? node
      : findFirstNonterminal(node, 'callExpression');
    if (!callNode) return null;

    const memberExprNode = extractOutermostCallMemberExpression(callNode);
    const { argsNode, argExprs } = extractCallExpressionMemberAndArgs(callNode);
    if (!memberExprNode || !argsNode) return null;

    const segments = extractPathFromMemberExpression(memberExprNode, null);
    if (!segments || segments.length < 2) return null;

    const dynamicHandleField = compileContext.asyncStateDynamicHandleFields.get(segments[0]);
    if (!dynamicHandleField) return null;

    let handleExpression = `__sm->${dynamicHandleField}`;
    for (let index = 1; index < segments.length - 1; index += 1) {
      handleExpression = `__async_handle_get_handle(${handleExpression}, (const char*)"${segments[index]}")`;
    }
    return {
      handleExpression,
      methodName: segments[segments.length - 1],
      argExprs
    };
  }

  function tryLowerDynamicHandleAggregateValue(node, compileContext) {
    const arrayLiteral = node && node.name === 'arrayLiteral'
      ? node
      : findFirstNonterminal(node, 'arrayLiteral');
    const objectLiteral = node && node.name === 'objectLiteral'
      ? node
      : findFirstNonterminal(node, 'objectLiteral');
    if (!arrayLiteral && !objectLiteral) return null;
    if (!compileContext) return null;
    if (!Array.isArray(compileContext._preludeStatements)) {
      compileContext._preludeStatements = [];
    }
    if (compileContext._dynamicAggregateTempCount === undefined) {
      compileContext._dynamicAggregateTempCount = 0;
    }

    const lowerItem = (valueNode, operation, key = null) => {
      const nested = tryLowerDynamicHandleAggregateValue(valueNode, compileContext);
      let kind = 'handle';
      let value = nested;
      if (value === null) {
        value = tryLowerDynamicHandleArgument(valueNode, compileContext);
      }
      if (value === null) {
        value = lowerExpressionValue(valueNode, compileContext);
        if (value === null) return null;
        if (inferExprType(valueNode, compileContext) === 'string') kind = 'string';
        else if (isFractionalNumericExpression(valueNode)) kind = 'f64';
        else if (inferExprType(valueNode, compileContext) === 'number' || inferExprType(valueNode, compileContext) === 'bool') kind = 'i32';
        else return null;
      }
      const prefix = key === null
        ? `__async_handle_aggregate_push_${kind}`
        : `__async_handle_aggregate_set_${kind}`;
      const valueArg = kind === 'string' ? `(const char*)(${value})` : value;
      return key === null
        ? `${prefix}(${valueArg})`
        : `${prefix}((const char*)${JSON.stringify(key)}, ${valueArg})`;
    };

    if (arrayLiteral) {
      const info = extractArrayLiteralElements(arrayLiteral);
      if (info.hasSpread || info.hasElision) return null;
      const operations = [];
      for (const valueNode of info.values) {
        const lowered = lowerItem(valueNode, 'push');
        if (lowered === null) return null;
        operations.push(lowered);
      }
      const tempName = `__async_aggregate_tmp${compileContext._dynamicAggregateTempCount++}`;
      compileContext._preludeStatements.push('__async_handle_aggregate_begin_array();');
      for (const operation of operations) compileContext._preludeStatements.push(`${operation};`);
      compileContext._preludeStatements.push(`int ${tempName} = __async_handle_aggregate_end();`);
      return tempName;
    }

    const properties = extractObjectLiteralProperties(objectLiteral, compileContext);
    const operations = [];
    for (const property of properties) {
      const lowered = lowerItem(property.valueExprNode, 'set', property.key);
      if (lowered === null) return null;
      operations.push(lowered);
    }
    const tempName = `__async_aggregate_tmp${compileContext._dynamicAggregateTempCount++}`;
    compileContext._preludeStatements.push('__async_handle_aggregate_begin_object();');
    for (const operation of operations) compileContext._preludeStatements.push(`${operation};`);
    compileContext._preludeStatements.push(`int ${tempName} = __async_handle_aggregate_end();`);
    return tempName;
  }

  function tryLowerDynamicHandleArgument(node, compileContext) {
    if (!compileContext || !compileContext.asyncStateDynamicHandleFields) return null;

    const directIdentifier = unwrapDirectIdentifierExpression(node);
    const directName = directIdentifier ? findFirstIdentifierValue(directIdentifier) : null;
    if (directName && compileContext.asyncStateDynamicHandleFields.has(directName)) {
      return `__sm->${compileContext.asyncStateDynamicHandleFields.get(directName)}`;
    }

    const aggregateValue = tryLowerDynamicHandleAggregateValue(node, compileContext);
    if (aggregateValue !== null) return aggregateValue;

    const callNode = node && node.name === 'callExpression'
      ? node
      : findFirstNonterminal(node, 'callExpression');
    if (callNode && getCallExpressionTrailingPropertyNames(callNode).length === 0) {
      const callInfo = getDynamicHandleMethodCallInfo(callNode, compileContext);
      if (callInfo) {
        const rawResultContext = {
          ...compileContext,
          dynamicHandleMethodResultType: null
        };
        const loweredCall = tryLowerDynamicHandleMethodCall(callNode, rawResultContext);
        if (loweredCall !== null) return loweredCall;
      }
    }

    const memberNode = node && node.name === 'memberExpression'
      ? node
      : findFirstNonterminal(node, 'memberExpression');
    const segments = memberNode ? extractPathFromMemberExpression(memberNode, null) : null;
    if (!segments || segments.length < 2) return null;
    const dynamicHandleField = compileContext.asyncStateDynamicHandleFields.get(segments[0]);
    if (!dynamicHandleField) return null;

    let handleExpression = `__sm->${dynamicHandleField}`;
    for (let index = 1; index < segments.length; index += 1) {
      handleExpression = `__async_handle_get_handle(${handleExpression}, (const char*)"${segments[index]}")`;
    }
    return handleExpression;
  }

  function tryLowerDynamicHandleMethodCall(node, compileContext) {
    const info = getDynamicHandleMethodCallInfo(node, compileContext);
    if (!info) return null;

    const prefix = `${info.handleExpression}, (const char*)"${info.methodName}"`;
    let loweredCall = null;
    if (info.argExprs.length === 0) {
      loweredCall = `__async_handle_call0(${prefix})`;
    }

    if (!loweredCall && info.argExprs.length === 1) {
      const argumentNode = info.argExprs[0];
      const dynamicHandleArgument = tryLowerDynamicHandleArgument(argumentNode, compileContext);
      if (dynamicHandleArgument !== null) {
        loweredCall = `(__async_handle_arg_handle(${dynamicHandleArgument}), __async_handle_callN(${prefix}, 1))`;
      } else {
        const loweredArgument = lowerExpressionValue(argumentNode, compileContext);
        if (loweredArgument === null) return null;
        if (inferExprType(argumentNode, compileContext) === 'string') {
          loweredCall = `__async_handle_call1_string(${prefix}, (const char*)(${loweredArgument}))`;
        }
        if (!loweredCall && isFractionalNumericExpression(argumentNode)) {
          loweredCall = `__async_handle_call1_f64(${prefix}, ${loweredArgument})`;
        }
        if (!loweredCall && (inferExprType(argumentNode, compileContext) === 'number'
          || inferExprType(argumentNode, compileContext) === 'bool')) {
          loweredCall = `__async_handle_call1_i32(${prefix}, ${loweredArgument})`;
        }
      }
    }

    if (!loweredCall) {
      const stagedArguments = [];
      for (const argumentNode of info.argExprs) {
        const dynamicHandleArgument = tryLowerDynamicHandleArgument(argumentNode, compileContext);
        if (dynamicHandleArgument !== null) {
          stagedArguments.push(`__async_handle_arg_handle(${dynamicHandleArgument})`);
          continue;
        }
        const loweredArgument = lowerExpressionValue(argumentNode, compileContext);
        if (loweredArgument === null) return null;
        if (inferExprType(argumentNode, compileContext) === 'string') {
          stagedArguments.push(`__async_handle_arg_string((const char*)(${loweredArgument}))`);
          continue;
        }
        if (isFractionalNumericExpression(argumentNode)) {
          stagedArguments.push(`__async_handle_arg_f64(${loweredArgument})`);
          continue;
        }
        if (inferExprType(argumentNode, compileContext) === 'number'
          || inferExprType(argumentNode, compileContext) === 'bool') {
          stagedArguments.push(`__async_handle_arg_i32(${loweredArgument})`);
          continue;
        }
        return null;
      }
      loweredCall = `(${stagedArguments.join(', ')}, __async_handle_callN(${prefix}, ${info.argExprs.length}))`;
    }

    if (compileContext.dynamicHandleMethodResultType === 'f64') {
      return `__async_handle_to_f64(${loweredCall})`;
    }
    if (compileContext.dynamicHandleMethodResultType === 'i32') {
      return `__async_handle_to_i32(${loweredCall})`;
    }
    if (compileContext.dynamicHandleMethodResultType === 'string') {
      return `__async_handle_get_string(${loweredCall})`;
    }
    return loweredCall;
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
      let nonterminalChildren = (node.children || []).filter((child) => child && child.kind === 'nonterminal');
      if (nonterminalChildren.length !== 2) {
        const fallbackCandidates = [];
        const fallbackNames = [
          'leftHandSideExpression',
          'unaryExpression',
          'postfixExpression',
          'primaryExpression',
          'identifier'
        ];
        for (const child of (node.children || [])) {
          if (!child || child.kind !== 'nonterminal') {
            continue;
          }
          let candidate = null;
          for (const name of fallbackNames) {
            candidate = findFirstNonterminal(child, name);
            if (candidate) {
              break;
            }
          }
          if (candidate) {
            fallbackCandidates.push(candidate);
          }
        }
        if (fallbackCandidates.length > 0) {
          nonterminalChildren = fallbackCandidates;
        }
      }
      if (nonterminalChildren.length === 2) {
        let lhs = lowerExpressionValue(nonterminalChildren[0], compileContext);
        const lhsIdentifier = findFirstIdentifierValue(nonterminalChildren[0]);
        const lhsInstanceType = lhsIdentifier && compileContext
          ? findBoundClassInstanceTypeAtNode(lhsIdentifier, node, compileContext)
          : null;
        if (lhsIdentifier && lhsInstanceType && compileContext && compileContext.topLevelClassNames && compileContext.topLevelClassNames.has(lhsInstanceType)) {
          lhs = `&${lhsIdentifier}`;
        }
        const rhsClassName = findFirstIdentifierValue(nonterminalChildren[1]);
        if (lhsInstanceType && rhsClassName) {
          let currentType = lhsInstanceType;
          const seenTypes = new Set();
          while (currentType && !seenTypes.has(currentType)) {
            if (currentType === rhsClassName) {
              return '1';
            }
            seenTypes.add(currentType);
            currentType = compileContext && compileContext.topLevelPrototypeHeritageMap
              ? (compileContext.topLevelPrototypeHeritageMap.get(currentType) || null)
              : null;
          }
        }
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

    if (operatorTokens.includes('in')) {
      const nonterminalChildren = (node.children || []).filter((child) => child && child.kind === 'nonterminal');
      if (nonterminalChildren.length === 2) {
        const lhs = lowerExpressionValue(nonterminalChildren[0], compileContext);
        const rhs = lowerExpressionValue(nonterminalChildren[1], compileContext);
        if (lhs !== null && rhs !== null) {
          if (compileContext) { compileContext.runtimeFallbackHelpersUsed = true; }
          return `__maia_runtime_value_has_property((void*)(${rhs}), (void*)(${lhs}))`;
        }
      }
    }

    if (node.name === 'additiveExpression'
      && operatorTokens.includes('+')
      && inferExprType(node, compileContext) === 'string') {
      const loweredConcat = tryLowerConsoleLogConcatExpression(node, compileContext);
      if (loweredConcat !== null) {
        return loweredConcat;
      }
    }

    const parts = [];
    const operandNodes = [];
    for (const child of (node.children || [])) {
      if (!child) {
        continue;
      }

      if (child.kind === 'nonterminal') {
        let lowered = lowerExpressionValue(child, compileContext);
        
        // Fallback: if direct lowering failed, try to find nested expression
        if (lowered === null) {
          const fallbackNames = [
            'expression',
            'assignmentExpression',
            'conditionalExpression',
            'conditionalExpressionNoIn',
            'arrowFunction',
            'asyncArrowFunction',
            'unaryExpression',
            'postfixExpression',
            'callExpression',
            'memberExpression',
            'leftHandSideExpression',
            'primaryExpression',
            'identifier'
          ];
          for (const fallbackName of fallbackNames) {
            const nestedExpr = findFirstNonterminal(child, fallbackName);
            if (nestedExpr) {
              lowered = lowerExpressionValue(nestedExpr, compileContext);
              if (lowered !== null) {
                break;
              }
            }
          }
        }
        
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
        operandNodes.push(child);
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

    if (parts.length === 3 && ['==', '!=', '<', '<=', '>', '>='].includes(parts[1])) {
      for (const [dynamicIndex, otherIndex] of [[0, 1], [1, 0]]) {
        if (!isFractionalNumericExpression(operandNodes[otherIndex])
          || !isDynamicHandleMemberExpression(operandNodes[dynamicIndex], compileContext)) {
          continue;
        }
        const loweredF64 = lowerDynamicHandleMemberAsF64(operandNodes[dynamicIndex], compileContext);
        if (loweredF64 !== null) {
          parts[dynamicIndex * 2] = loweredF64;
        }
      }
      for (const [dynamicIndex, otherIndex] of [[0, 1], [1, 0]]) {
        if (!isDynamicHandleMethodCall(operandNodes[dynamicIndex], compileContext)) continue;
        if (operatorTokens.includes('===') || operatorTokens.includes('!==')) {
          if (inferExprType(operandNodes[otherIndex], compileContext) === 'string') {
            const dynamicHandle = tryLowerDynamicHandleMethodCall(operandNodes[dynamicIndex], compileContext);
            const otherString = lowerExpressionValue(operandNodes[otherIndex], compileContext);
            if (dynamicHandle !== null && otherString !== null) {
              const equals = `__async_handle_equals_string(${dynamicHandle}, (const char*)(${otherString}))`;
              return operatorTokens.includes('!==') ? `(!${equals})` : equals;
            }
          }
        }
        const numericType = isFractionalNumericExpression(operandNodes[otherIndex]) ? 'f64' : 'i32';
        const loweredNumeric = lowerDynamicHandleMethodAsNumeric(operandNodes[dynamicIndex], compileContext, numericType);
        if (loweredNumeric !== null) {
          parts[dynamicIndex * 2] = loweredNumeric;
        }
      }
      for (const [dynamicIndex, otherIndex] of [[0, 1], [1, 0]]) {
        if (!(operatorTokens.includes('===') || operatorTokens.includes('!=='))
          || !isDynamicHandleMethodPropertyCall(operandNodes[dynamicIndex], compileContext)
          || inferExprType(operandNodes[otherIndex], compileContext) !== 'string') {
          continue;
        }
        const propertyHandle = lowerDynamicHandleMethodPropertyAsString(operandNodes[dynamicIndex], compileContext);
        const otherString = lowerExpressionValue(operandNodes[otherIndex], compileContext);
        if (propertyHandle !== null && otherString !== null) {
          const equals = `__async_handle_equals_string(${propertyHandle}, (const char*)(${otherString}))`;
          return operatorTokens.includes('!==') ? `(!${equals})` : equals;
        }
      }
      for (const [dynamicIndex, otherIndex] of [[0, 1], [1, 0]]) {
        if (!isFractionalNumericExpression(operandNodes[otherIndex])
          || !isDynamicHandleMethodPropertyCall(operandNodes[dynamicIndex], compileContext)) {
          continue;
        }
        const loweredF64 = lowerDynamicHandleMethodPropertyAsF64(operandNodes[dynamicIndex], compileContext);
        if (loweredF64 !== null) {
          parts[dynamicIndex * 2] = loweredF64;
        }
      }
    }

    if (parts.length === 3 && ['+', '-', '*', '/', '%'].includes(parts[1])) {
      for (const dynamicIndex of [0, 1]) {
        const otherIndex = dynamicIndex === 0 ? 1 : 0;
        if (!isDynamicHandleMethodCall(operandNodes[dynamicIndex], compileContext)
          || !isFractionalNumericExpression(operandNodes[otherIndex])) {
          continue;
        }
        const loweredF64 = lowerDynamicHandleMethodAsNumeric(operandNodes[dynamicIndex], compileContext, 'f64');
        if (loweredF64 !== null) {
          parts[dynamicIndex * 2] = loweredF64;
        }
      }
    }

    if (parts.length === 3 && (parts[1] === '||' || parts[1] === '&&') && compileContext) {
      if (!Array.isArray(compileContext._preludeStatements)) {
        compileContext._preludeStatements = [];
      }
      if (compileContext._logicalValueTempCount === undefined) {
        compileContext._logicalValueTempCount = 0;
      }

      const lhsType = operandNodes[0] ? inferExprType(operandNodes[0], compileContext) : 'any';
      const lhsCppType = lhsType === 'string'
        ? 'const char*'
        : (lhsType === 'number'
          ? 'double'
          : (lhsType === 'bool' ? 'int' : 'void*'));
      const lhsTempName = `__maia_logical_tmp${compileContext._logicalValueTempCount++}`;
      compileContext._preludeStatements.push(`${lhsCppType} ${lhsTempName} = (${lhsCppType})(${parts[0]});`);
      const lhsTruthyExpr = lhsType === 'string'
        ? `(${lhsTempName} != 0 && ${lhsTempName}[0] != '\\0')`
        : `(${lhsTempName} != 0)`;
      return parts[1] === '||'
        ? `((${lhsTruthyExpr}) ? ${lhsTempName} : ${parts[2]})`
        : `((${lhsTruthyExpr}) ? ${parts[2]} : ${lhsTempName})`;
    }

    const hasIntOnlyOperator = parts.some((part, index) => index % 2 === 1 && INT_ONLY_INFIX_OPERATORS.has(part));
    if (hasIntOnlyOperator) {
      for (let i = 0; i < parts.length; i += 2) {
        parts[i] = `(int)(${parts[i]})`;
      }
    }

    if (parts.includes('>>>')) {
      let acc = parts[0];
      for (let i = 1; i < parts.length; i += 2) {
        const op = parts[i];
        const rhs = parts[i + 1];
        if (op === '>>>') {
          acc = `__maia_ushift_r((int)(${acc}), (int)(${rhs}))`;
        } else {
          acc = `(${acc} ${op} ${rhs})`;
        }
      }
      return acc;
    }

    if (parts.length === 3 && parts[1] === '/') {
      const lhsType = operandNodes[0] ? inferExprType(operandNodes[0], compileContext) : 'any';
      const rhsType = operandNodes[1] ? inferExprType(operandNodes[1], compileContext) : 'any';
      if ((lhsType === 'number' || lhsType === 'bool') && (rhsType === 'number' || rhsType === 'bool')) {
        return `((double)(${parts[0]}) / (double)(${parts[2]}))`;
      }
    }

    if (parts.length === 3 && (parts[1] === '==' || parts[1] === '!=')) {
      const lhsType = operandNodes[0] ? inferExprType(operandNodes[0], compileContext) : 'any';
      const rhsType = operandNodes[1] ? inferExprType(operandNodes[1], compileContext) : 'any';
      const strictOperator = operatorTokens.find((token) => token === '===' || token === '!==') || null;
      const lhsIsNullish = operandNodes[0] ? isDirectNullishExpression(operandNodes[0]) : false;
      const rhsIsNullish = operandNodes[1] ? isDirectNullishExpression(operandNodes[1]) : false;
      const lhsIdentifier = operandNodes[0] ? findFirstIdentifierValue(operandNodes[0]) : null;
      const rhsIdentifier = operandNodes[1] ? findFirstIdentifierValue(operandNodes[1]) : null;
      const lhsIsSymbolBinding = lhsIdentifier && isBoundVariableInitializedWithCallPathAtNode(lhsIdentifier, operandNodes[0], 'Symbol', compileContext);
      const rhsIsSymbolBinding = rhsIdentifier && isBoundVariableInitializedWithCallPathAtNode(rhsIdentifier, operandNodes[1], 'Symbol', compileContext);
      if (strictOperator && lhsIsSymbolBinding && rhsIsSymbolBinding && lhsIdentifier !== rhsIdentifier) {
        return strictOperator === '!==' ? '1' : '0';
      }
      if (lhsIsNullish || rhsIsNullish) {
        const otherNode = lhsIsNullish ? operandNodes[1] : operandNodes[0];
        const otherType = lhsIsNullish ? rhsType : lhsType;
        if (otherType === 'number' || otherType === 'bool') {
          return parts[1] === '!=' ? '1' : '0';
        }
        const otherExpr = otherNode ? lowerExpressionValue(otherNode, compileContext) : null;
        if (otherExpr !== null) {
          return `((${otherExpr}) ${parts[1]} 0)`;
        }
      }
      if (strictOperator && lhsType !== 'any' && rhsType !== 'any' && lhsType !== rhsType) {
        return strictOperator === '!==' ? '1' : '0';
      }
      if (lhsType === 'string' || rhsType === 'string') {
        const otherIsDynamic = (lhsType === 'any' || rhsType === 'any'
          || parts[0].includes('__maia_runtime_value_get_') || parts[2].includes('__maia_runtime_value_get_'));
        if (strictOperator && lhsType !== rhsType && !otherIsDynamic) {
          return strictOperator === '!==' ? '1' : '0';
        }
        if (otherIsDynamic) {
          const lStr = lhsType === 'string' ? (lowerConsoleConcatPieceAsCString(operandNodes[0], compileContext) || parts[0]) : `(const char*)(${parts[0]})`;
          const rStr = rhsType === 'string' ? (lowerConsoleConcatPieceAsCString(operandNodes[1], compileContext) || parts[2]) : `(const char*)(${parts[2]})`;
          return parts[1] === '=='
            ? `(${lStr} != 0 && ${rStr} != 0 && strcmp(${lStr}, ${rStr}) == 0)`
            : `(${lStr} == 0 || ${rStr} == 0 || strcmp(${lStr}, ${rStr}) != 0)`;
        }
        const lhsExpr = lowerConsoleConcatPieceAsCString(operandNodes[0], compileContext);
        const rhsExpr = lowerConsoleConcatPieceAsCString(operandNodes[1], compileContext);
        if (lhsExpr !== null && rhsExpr !== null) {
          return `(strcmp(${lhsExpr}, ${rhsExpr}) ${parts[1]} 0)`;
        }
      }
    }

    return parts.join(' ');
  }

  function lowerExponentiationExpressionValue(node, compileContext) {
    if (!node || node.kind !== 'nonterminal'
      || (node.name !== 'exponentiationExpression' && node.name !== 'exponentiationExpressionNoIn')) {
      reportUnsupportedLowering(
        compileContext,
        'expression-unlowerable',
        'exponentiation expression node is missing or malformed'
      );
      if (compileContext && compileContext.strictLowering) {
        err('unsupported lowering: exponentiation expression node');
      }
      return null;
    }

    const children = node.children || [];
    const operatorIndex = children.findIndex((child) => child && child.kind === 'terminal' && child.value === '**');
    if (operatorIndex === -1) {
      const nonterminalChildren = children.filter((child) => child && child.kind === 'nonterminal');
      if (nonterminalChildren.length === 1) {
        return lowerExpressionValue(nonterminalChildren[0], compileContext);
      }
      reportUnsupportedLowering(
        compileContext,
        'expression-unlowerable',
        `passthrough expression node '${node.name}' did not reduce to a single child`
      );
      if (compileContext && compileContext.strictLowering) {
        err(`unsupported lowering: expression passthrough '${node.name}'`);
      }
      return null;
    }

    const lhsNode = children.slice(0, operatorIndex).filter((child) => child && child.kind === 'nonterminal').pop() || null;
    const rhsNode = children.slice(operatorIndex + 1).find((child) => child && child.kind === 'nonterminal') || null;
    const lhs = lhsNode ? lowerExpressionValue(lhsNode, compileContext) : null;
    const rhs = rhsNode ? lowerExpressionValue(rhsNode, compileContext) : null;
    if (lhs === null || rhs === null) {
      reportUnsupportedLowering(
        compileContext,
        'expression-unlowerable',
        'exponentiation expression operand could not be lowered'
      );
      if (compileContext && compileContext.strictLowering) {
        err('unsupported lowering: exponentiation expression operand');
      }
      return null;
    }
    return `__maia_pow_i32((int)(${lhs}), (int)(${rhs}))`;
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
    const skipStaticCallShortcut = Boolean(
      compileContext && (
        (compileContext.closurePlan
          && compileContext.closurePlan.orderedClosures.length > 0
          && (findFirstNonterminal(node, 'arrowFunction') || findFirstNonterminal(node, 'functionExpression')))
        || compileContext._inPromiseAsyncFn
      )
    );
    if (!skipStaticCallShortcut && compileContext && (
      node.name === 'callExpression'
      || node.name === 'conditionalExpression'
      || node.name === 'conditionalExpressionNoIn'
      || node.name === 'exponentiationExpression'
      || node.name === 'exponentiationExpressionNoIn'
      || INFIX_EXPRESSION_NODES.has(node.name)
    )) {
      // This precedence-level shortcut is safe only for scalar constants. An
      // aggregate model may represent a literal array below this node, whose
      // dedicated lowering must retain element values, spread operations and
      // elisions instead of collapsing it to an empty runtime shape.
      const staticResolved = lowerStaticModelToExpression(
        resolveStaticModelFromExpression(node, node, compileContext)
      );
      if (staticResolved !== null) {
        return staticResolved;
      }
    }
    if (compileContext) {
      const promiseThenCallNode = findFirstPromiseThenCallExpression(node);
      if (promiseThenCallNode) {
        const loweredStaticPromiseThenChain = tryLowerStaticPromiseThenChain(promiseThenCallNode, compileContext);
        if (loweredStaticPromiseThenChain !== null) {
          return loweredStaticPromiseThenChain;
        }
      }
      const directCallExpressionNode = extractDirectCallExpressionNode(node);
      if (directCallExpressionNode) {
        const loweredStaticPromiseThenChain = tryLowerStaticPromiseThenChain(directCallExpressionNode, compileContext);
        if (loweredStaticPromiseThenChain !== null) {
          return loweredStaticPromiseThenChain;
        }
      }
    }
    if (node.name === 'arrowFunction') { return lowerArrowFunctionValue(node, false, compileContext); }
    if (node.name === 'asyncArrowFunction') { return lowerArrowFunctionValue(node, true, compileContext); }
    if (node.name === 'functionExpression') {
      const closureScopeEarly = compileContext && compileContext.closurePlan && compileContext.closurePlan.scopesByNode
        ? compileContext.closurePlan.scopesByNode.get(node)
        : null;
      const inlineSymbol = compileContext && compileContext.inlineFunctionExpressionSymbols
        ? compileContext.inlineFunctionExpressionSymbols.get(node)
        : null;
      if (inlineSymbol && !(compileContext && compileContext.iteratorPlan && compileContext.iteratorPlan.enabled && closureScopeEarly && closureScopeEarly.isClosure)) {
        return inlineSymbol;
      }

      const closureScope = compileContext && compileContext.closurePlan && compileContext.closurePlan.scopesByNode
        ? compileContext.closurePlan.scopesByNode.get(node)
        : null;
      if (closureScope && closureScope.isClosure) {
        const { preLines, envExpr } = closures.emitClosureCaptureEnvCode(closureScope, null, compileContext);
        if (preLines.length > 0) {
          if (!Array.isArray(compileContext._preludeStatements)) {
            compileContext._preludeStatements = [];
          }
          compileContext._preludeStatements.push(...preLines);
        }
        return `__maia_closure_alloc(${closureScope.fnId}, ${closureScope.params.length}, ${closureScope.isAsync ? 1 : 0}, ${envExpr})`;
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
    if (node.name === 'assignmentExpression' || node.name === 'assignmentExpressionNoIn') { return lowerAssignmentExpressionValue(node, compileContext); }
    if (node.name === 'conditionalExpression' || node.name === 'conditionalExpressionNoIn') { return lowerConditionalExpressionValue(node, compileContext); }
    if (node.name === 'unaryExpression') { return lowerUnaryExpressionValue(node, compileContext); }
    if (node.name === 'postfixExpression') { return lowerPostfixExpressionValue(node, compileContext); }
    if (node.name === 'exponentiationExpression' || node.name === 'exponentiationExpressionNoIn') { return lowerExponentiationExpressionValue(node, compileContext); }
    if (INFIX_EXPRESSION_NODES.has(node.name)) { return lowerInfixExpressionValue(node, compileContext); }
    if (node.name === 'memberExpression') {
      const memberTplChildren = node.children || [];
      const tplChildIdx = memberTplChildren.findIndex((c) => c && c.kind === 'nonterminal' && c.name === 'templateLiteral');
      if (tplChildIdx > 0) {
        const calleeNode = memberTplChildren[0];
        const tplNode = memberTplChildren[tplChildIdx];
        const calleeExpr = lowerExpressionValue(calleeNode, compileContext);
        if (calleeExpr !== null) {
          const tagStrings = [];
          const tagExprs = [];
          const collectTagParts = (n) => {
            if (!n) return;
            if (n.kind === 'terminal') {
              const tok = n.token || '';
              const val = String(n.value || '');
              if (tok === 'NoSubstitutionTemplate') tagStrings.push(val.slice(1, -1));
              else if (tok === 'TemplateHead') tagStrings.push(val.slice(1, -2));
              else if (tok === 'TemplateMiddle') tagStrings.push(val.slice(1, -2));
              else if (tok === 'TemplateTail') tagStrings.push(val.slice(1, -1));
              return;
            }
            if (n.kind === 'nonterminal' && (n.name === 'expression' || n.name === 'assignmentExpression')) {
              const loweredArg = lowerExpressionValue(n, compileContext);
              if (loweredArg !== null) tagExprs.push(loweredArg);
              return;
            }
            for (const ch of (n.children || [])) collectTagParts(ch);
          };
          collectTagParts(tplNode);
          if (compileContext) {
            compileContext.runtimeFallbackHelpersUsed = true;
            if (!Array.isArray(compileContext._preludeStatements)) compileContext._preludeStatements = [];
            compileContext._tplTempSeq = (compileContext._tplTempSeq || 0) + 1;
            const arrVar = `__maia_tag_strings_${compileContext._tplTempSeq}`;
            compileContext._preludeStatements.push(`void* ${arrVar} = __maia_runtime_alloc_value(2, ${tagStrings.length}, 0, 0);`);
            for (let si = 0; si < tagStrings.length; si += 1) {
              compileContext._preludeStatements.push(`__maia_runtime_value_set_index(${arrVar}, ${si}, (long)(${JSON.stringify(tagStrings[si])}));`);
            }
            const calleeIdent = findFirstIdentifierValue(calleeNode);
            const directCallee = (calleeIdent && /^__maia_closure_alloc\(/.test(calleeExpr.trim())) ? calleeIdent : calleeExpr;
            const callArgs = [arrVar, ...tagExprs].join(', ');
            return `${directCallee}(${callArgs})`;
          }
        }
      }

      const loweredNewCall = lowerMemberExpressionNewCallValue(node, compileContext);
      if (loweredNewCall !== null) {
        return loweredNewCall;
      }

      const computedInfo = extractComputedMemberAccessInfo(node);
      if (computedInfo) {
        const staticResolved = compileContext
          ? lowerStaticModelToExpression(resolveStaticModelFromExpression(node, node, compileContext))
          : null;
        if (staticResolved !== null) {
          return staticResolved;
        }
        const loweredComputed = lowerComputedMemberAccessValue(computedInfo, compileContext);
        if (loweredComputed !== null) {
          return loweredComputed;
        }
      }

      const memberChildren = (node.children || []);
      // Only attempt path extraction if the memberExpression has property access (a '.' terminal).
      // If it's a simple passthrough (single nonterminal child, no dot), skip to passthrough logic.
      const hasDotAccess = memberChildren.some((c) => c && c.kind === 'terminal' && c.value === '.');
      const segments = hasDotAccess ? extractPathFromMemberExpression(node, null) : null;
      if (hasDotAccess && !segments && memberChildren.length >= 3 && memberChildren[1] && memberChildren[1].kind === 'terminal' && memberChildren[1].value === '.') {
        const baseExpr = lowerExpressionValue(memberChildren[0], compileContext);
        const propName = findFirstIdentifierValue(memberChildren[2]);
        if (baseExpr !== null && propName) {
          if (compileContext) compileContext.runtimeFallbackHelpersUsed = true;
          return `__maia_runtime_value_get_property((void*)(${baseExpr}), (void*)${JSON.stringify(propName)})`;
        }
      }
      if (segments && segments.length >= 2) {
        // Use -> for this and . for local stack-instantiated class objects.
        const isThisMember = segments[0] === 'this';
        const localClassType = isThisMember ? null : findBoundClassInstanceTypeAtNode(segments[0], node, compileContext);
        if (compileContext && compileContext.atomicsPlan && compileContext.atomicsPlan.enabled && segments.length === 2 && segments[1] === 'byteLength') {
          return `__maia_runtime_value_get_property((void*)(${sanitizeCppIdentifier(segments[0])}), (void*)"byteLength")`;
        }
        if (segments.length === 2 && segments[1] === 'size' && (localClassType === 'Set' || localClassType === 'Map')) {
          if (compileContext) { compileContext.runtimeFallbackHelpersUsed = true; }
          return localClassType === 'Set'
            ? `__maia_set_size((void*)(${sanitizeCppIdentifier(segments[0])}))`
            : `__maia_map_size((void*)(${sanitizeCppIdentifier(segments[0])}))`;
        }
        if (isThisMember && compileContext && compileContext.iteratorPlan && compileContext.iteratorPlan.enabled && !findEnclosingClassNameAtNode(node, compileContext)) {
          let expr = '__maia_this_ptr';
          for (let si = 1; si < segments.length; si += 1) {
            expr = `__maia_runtime_value_get_property((void*)(${expr}), (void*)${JSON.stringify(segments[si])})`;
          }
          return expr;
        }
        if (!isThisMember && !localClassType) {
          const dynamicHandleField = compileContext
            && compileContext.asyncStateDynamicHandleFields
            && compileContext.asyncStateDynamicHandleFields.get(segments[0]);
          if (dynamicHandleField && segments.length >= 2) {
            let handleExpression = `__sm->${dynamicHandleField}`;
            for (let index = 1; index < segments.length - 1; index += 1) {
              handleExpression = `__async_handle_get_handle(${handleExpression}, (const char*)"${segments[index]}")`;
            }
            const getter = compileContext.dynamicHandleNumericType === 'f64'
              ? '__async_handle_get_f64'
              : '__async_handle_get_i32';
            return `${getter}(${handleExpression}, (const char*)"${segments[segments.length - 1]}")`;
          }
          const staticResolved = resolveStaticMemberAccessExpression(segments, node, compileContext);
          if (staticResolved !== null) {
            return staticResolved;
          }
          const loweredOpaqueChain = lowerOpaqueMemberAccessChain(sanitizeCppIdentifier(segments[0]), segments);
          if (loweredOpaqueChain !== null) {
            return loweredOpaqueChain;
          }
          reportUnsupportedLowering(
            compileContext,
            'member-expression-unlowerable',
            `member access '${segments.join('.')}' is not a known C++ object and falls back to 0`
          );
          if (compileContext && compileContext.strictLowering) {
            err(`unsupported lowering: member access '${segments.join('.')}'`);
          }
          return '0';
        }
        let result = isThisMember ? segments[0] : sanitizeCppIdentifier(segments[0]);
        for (let i = 1; i < segments.length; i++) {
          if (i === 1) {
            result += isThisMember ? '->' + segments[i] : '.' + segments[i];
          } else if (segments[i] === 'length') {
            if (compileContext) compileContext.runtimeFallbackHelpersUsed = true;
            result = `__maia_runtime_value_length((void*)(${result}))`;
          } else if (isThisMember) {
            if (compileContext) compileContext.runtimeFallbackHelpersUsed = true;
            result = `__maia_runtime_value_get_property((void*)(${result}), (void*)${staticStringLiteralCpp(segments[i])})`;
          } else {
            result += '.' + segments[i];
          }
        }
        return result;
      }

      let directPropertyIndex = -1;
      for (let i = memberChildren.length - 1; i >= 0; i -= 1) {
        const child = memberChildren[i];
        if (child && child.kind === 'terminal' && child.value === '.') {
          directPropertyIndex = i;
          break;
        }
      }
      const directPropertyNode = directPropertyIndex >= 0 ? memberChildren[directPropertyIndex + 1] : null;
      const directPropertyName = directPropertyNode ? findFirstIdentifierValue(directPropertyNode) : null;
      const baseExpressionNode = directPropertyIndex > 0 ? memberChildren[0] : null;
      if (directPropertyName && baseExpressionNode) {
        const baseCallExpressionNode = baseExpressionNode.name === 'callExpression'
          ? baseExpressionNode
          : findFirstNonterminal(baseExpressionNode, 'callExpression');
        if (baseCallExpressionNode) {
          const dynamicMethodCall = tryLowerDynamicHandleMethodCall(baseCallExpressionNode, compileContext);
          if (dynamicMethodCall !== null) {
            return `__async_handle_get_i32(${dynamicMethodCall}, (const char*)"${directPropertyName}")`;
          }
          const { memberExprNode: weakMapMemberExprNode, argExprs: weakMapArgExprs } = extractCallExpressionMemberAndArgs(baseCallExpressionNode);
          const weakMapPathSegments = weakMapMemberExprNode ? extractPathFromMemberExpression(weakMapMemberExprNode, null) : null;
          const weakMapMemberChildren = weakMapMemberExprNode ? (weakMapMemberExprNode.children || []) : [];
          const weakMapDirectPropertyIndex = weakMapMemberChildren.findIndex(
            (child) => child && child.kind === 'terminal' && child.value === '.'
          );
          const weakMapDirectPropertyNode = weakMapDirectPropertyIndex >= 0 ? weakMapMemberChildren[weakMapDirectPropertyIndex + 1] : null;
          const weakMapDirectPropertyName = weakMapDirectPropertyNode ? findFirstIdentifierValue(weakMapDirectPropertyNode) : null;
          const weakMapBaseExpressionNode = weakMapDirectPropertyIndex > 0 ? weakMapMemberChildren[0] : null;
          const weakMapBaseName = (weakMapPathSegments && weakMapPathSegments.length > 0 ? weakMapPathSegments[0] : null)
            || (weakMapBaseExpressionNode ? findFirstIdentifierValue(weakMapBaseExpressionNode) : null);
          if (weakMapDirectPropertyName === 'get'
            && weakMapBaseName
            && isBoundVariableInitializedWithHostCtorAtNode(weakMapBaseName, baseCallExpressionNode, 'WeakMap', compileContext)
            && weakMapArgExprs.length >= 1) {
            const loweredWeakMapKeyExpr = lowerExpressionValue(weakMapArgExprs[0], compileContext);
            if (loweredWeakMapKeyExpr !== null) {
              return `__maia_runtime_value_get_property((void*)(${loweredWeakMapKeyExpr}), (void*)${JSON.stringify(`__maia_weakmap_${weakMapBaseName}__${directPropertyName}`)})`;
            }
          }
        }
        const loweredBase = lowerExpressionValue(baseExpressionNode, compileContext);
        if (loweredBase !== null) {
          const flattenedWeakMapReadMatch = loweredBase.match(/^__maia_runtime_value_get_property\(\(void\*\)\((.+)\), \(void\*\)"(__maia_weakmap_[A-Za-z0-9_]+)"\)$/);
          if (flattenedWeakMapReadMatch) {
            const receiverExpr = flattenedWeakMapReadMatch[1];
            const hiddenKey = flattenedWeakMapReadMatch[2];
            return `__maia_runtime_value_get_property((void*)(${receiverExpr}), (void*)${JSON.stringify(`${hiddenKey}__${directPropertyName}`)})`;
          }
          if (directPropertyName === 'message') {
            return loweredBase;
          }
          if (directPropertyName === 'length') {
            return `__maia_runtime_value_length((void*)(${loweredBase}))`;
          }
          return `__maia_runtime_value_get_property((void*)(${loweredBase}), (void*)"${directPropertyName}")`;
        }
      }

      let ntc = (node.children || []).filter((c) => c && c.kind === 'nonterminal');
      const directCallChildren = ntc.filter((child) => child.name === 'callExpression');
      if (directCallChildren.length === 1) {
        ntc = directCallChildren;
      }
      if (ntc.length !== 1) {
        const fallbackCandidates = [];
        const fallbackNames = [
          'callExpression',
          'primaryExpression',
          'memberExpression',
          'leftHandSideExpression',
          'identifier'
        ];
        for (const child of (node.children || [])) {
          if (!child || child.kind !== 'nonterminal') {
            continue;
          }
          let candidate = null;
          for (const name of fallbackNames) {
            candidate = findFirstNonterminal(child, name);
            if (candidate) {
              break;
            }
          }
          if (candidate) {
            fallbackCandidates.push(candidate);
          }
        }
        if (fallbackCandidates.length > 0) {
          ntc = fallbackCandidates;
        }
      }
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
      let ntc = (node.children || []).filter((c) => c && c.kind === 'nonterminal');
      const directCallChildren = ntc.filter((child) => child.name === 'callExpression');
      if (directCallChildren.length === 1) {
        ntc = directCallChildren;
      }
      if (ntc.length !== 1) {
        const fallbackCandidates = [];
        const fallbackNames = [
          'callExpression',
          'assignmentExpression',
          'conditionalExpression',
          'conditionalExpressionNoIn',
          'unaryExpression',
          'postfixExpression',
          'primaryExpression',
          'memberExpression',
          'identifier'
        ];
        for (const child of (node.children || [])) {
          if (!child || child.kind !== 'nonterminal') {
            continue;
          }
          let candidate = null;
          for (const name of fallbackNames) {
            candidate = findFirstNonterminal(child, name);
            if (candidate) {
              break;
            }
          }
          if (candidate) {
            fallbackCandidates.push(candidate);
          }
        }
        if (fallbackCandidates.length > 0) {
          ntc = fallbackCandidates;
        }
      }
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
    if (node.name === 'templateLiteral') {
      const parts = [];
      const collectTemplateParts = (n) => {
        if (!n) return;
        if (n.kind === 'terminal') {
          const tok = n.token || '';
          const val = String(n.value || '');
          let text = null;
          if (tok === 'NoSubstitutionTemplate') text = val.slice(1, -1);
          else if (tok === 'TemplateHead') text = val.slice(1, -2);
          else if (tok === 'TemplateMiddle') text = val.slice(1, -2);
          else if (tok === 'TemplateTail') text = val.slice(1, -1);
          if (text !== null && text.length > 0) {
            parts.push(staticStringLiteralCpp(text));
          }
          return;
        }
        if (n.kind === 'nonterminal' && (n.name === 'expression' || n.name === 'assignmentExpression')) {
          const lowered = lowerExpressionValue(n, compileContext);
          if (lowered !== null) {
            const trimmedLowered = lowered.trim();
            const localType = (compileContext && compileContext.localVariables && /^[A-Za-z_][A-Za-z0-9_]*$/.test(trimmedLowered))
              ? compileContext.localVariables.get(trimmedLowered)
              : null;
            const exprType = inferExprType(n, compileContext);
            const isStr = localType === 'const char*' || /^"(?:[^"\\]|\\.)*"$/.test(trimmedLowered) || exprType === 'string' || /^__(?:maia_console_concat|maia_str_chain_|maiaregex__replace|maia_array_join|maia_str_slice|JSON__stringify|String)/.test(trimmedLowered);
            if (isStr) {
              parts.push(lowered);
            } else if (localType === 'void*' || localType === 'const void*' || exprType === 'object' || exprType === 'array') {
              if (compileContext) compileContext.consoleConcatHelperUsed = true;
              parts.push(`__maia_console_to_cstr_ptr((void*)(${lowered}))`);
            } else {
              if (compileContext) compileContext.consoleConcatHelperUsed = true;
              parts.push(`__maia_console_to_cstr_number((double)(${lowered}))`);
            }
          }
          return;
        }
        for (const ch of (n.children || [])) collectTemplateParts(ch);
      };
      collectTemplateParts(node);
      if (parts.length === 0) return '""';
      if (compileContext) compileContext.consoleConcatHelperUsed = true;
      if (compileContext && parts.length > 1) {
        if (!Array.isArray(compileContext._preludeStatements)) compileContext._preludeStatements = [];
        const prelude = compileContext._preludeStatements;
        if (compileContext._tplTempSeq == null) compileContext._tplTempSeq = 0;
        const toTemp = (expr) => {
          if (/^"(?:[^"\\]|\\.)*"$/.test(expr.trim()) || /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(expr.trim())) return expr;
          const t = `__maia_tpl_${compileContext._tplTempSeq++}`;
          prelude.push(`const char* ${t} = ${expr};`);
          return t;
        };
        let acc = toTemp(parts[0]);
        for (let i = 1; i < parts.length; i += 1) {
          const rhs = toTemp(parts[i]);
          const t = `__maia_tpl_${compileContext._tplTempSeq++}`;
          prelude.push(`const char* ${t} = __maia_console_concat2(${acc}, ${rhs});`);
          acc = t;
        }
        return acc;
      }
      let acc = parts[0];
      for (let i = 1; i < parts.length; i += 1) {
        acc = `__maia_console_concat2(${acc}, ${parts[i]})`;
      }
      return acc;
    }
    if (node.name === 'callExpression') { return lowerCallExpressionValue(node, compileContext); }
    if (node.name === 'primaryExpression') {
      for (const child of (node.children || [])) {
        if (child.kind === 'terminal' && child.token === 'TOKEN_this') {
          if (compileContext && compileContext.iteratorPlan && compileContext.iteratorPlan.enabled && !findEnclosingClassNameAtNode(node, compileContext)) {
            return '__maia_this_ptr';
          }
          return 'this';
        }
        if (child.kind === 'terminal' && child.token === 'TOKEN_null') { return '0'; }
        if (child.kind === 'nonterminal') {
          if (child.name === 'expression') { return lowerExpressionValue(child, compileContext); }
          if (child.name === 'literal') { return lowerLiteralValue(child, compileContext); }
          if (child.name === 'objectLiteral') { return lowerObjectLiteralValue(child, compileContext); }
          if (child.name === 'arrayLiteral') { return lowerArrayLiteralValue(child, compileContext); }
          if (child.name === 'templateLiteral') { return lowerExpressionValue(child, compileContext); }
          if (child.name === 'identifier') {
            return lowerIdentifierValue(findFirstIdentifierValue(child), compileContext);
          }
          if (child.name === 'identifierReference') {
            return lowerIdentifierValue(findFirstIdentifierValue(child), compileContext);
          }
        }
      }

      const fallbackNames = ['expression', 'literal', 'objectLiteral', 'arrayLiteral', 'identifier', 'identifierReference'];
      for (const name of fallbackNames) {
        const fallbackNode = findFirstNonterminal(node, name);
        if (!fallbackNode) {
          continue;
        }
        if (name === 'expression') { return lowerExpressionValue(fallbackNode, compileContext); }
        if (name === 'literal') { return lowerLiteralValue(fallbackNode, compileContext); }
        if (name === 'objectLiteral') { return lowerObjectLiteralValue(fallbackNode, compileContext); }
        if (name === 'arrayLiteral') { return lowerArrayLiteralValue(fallbackNode, compileContext); }
        if (name === 'identifier') {
          return lowerIdentifierValue(findFirstIdentifierValue(fallbackNode), compileContext);
        }
        if (name === 'identifierReference') {
          return lowerIdentifierValue(findFirstIdentifierValue(fallbackNode), compileContext);
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
    
    // Last resort: try to find ANY expression-like child and recurse
    const anyExprChild = findFirstNonterminal(node, 'expression') || 
                         findFirstNonterminal(node, 'primaryExpression') ||
                         findFirstNonterminal(node, 'callExpression') ||
                         findFirstNonterminal(node, 'memberExpression');
    if (anyExprChild) {
      return lowerExpressionValue(anyExprChild, compileContext);
    }
    
    return null;
  }


  return {
    lowerIdentifierFromLeftHandSideExpression,
    lowerAssignmentExpressionValue,
    lowerPostfixExpressionValue,
    lowerUnaryExpressionValue,
    isFractionalNumericExpression,
    isDynamicHandleMemberExpression,
    lowerDynamicHandleMemberAsF64,
    getCallExpressionTrailingPropertyName,
    getCallExpressionTrailingPropertyNames,
    isDynamicHandleMethodCall,
    isDynamicHandleMethodPropertyCall,
    lowerDynamicHandleMethodPropertyAsF64,
    lowerDynamicHandleMethodPropertyAsString,
    lowerDynamicHandleMethodAsNumeric,
    lowerDynamicHandleMethodAsString,
    getDynamicHandleMethodCallInfo,
    tryLowerDynamicHandleAggregateValue,
    tryLowerDynamicHandleArgument,
    tryLowerDynamicHandleMethodCall,
    lowerInfixExpressionValue,
    lowerExponentiationExpressionValue,
    lowerExpressionValue
  };
}

module.exports = { createExpressionLowering };
