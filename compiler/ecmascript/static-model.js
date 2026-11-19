'use strict';

/**
 * Static expression & promise-then model evaluation for MaiaJS.
 */

const {
  walk,
  flattenNodeText,
  hasNonterminal,
  nodeContainsTarget,
  findFirstIdentifierValue,
  findNodePath,
  findFirstTerminalByToken,
  findFirstNonterminal
} = require('./ast-utils');

function createStaticModel(deps) {
  const {
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
  } = deps;

  function resolveStaticModelFromExpression(expressionNode, targetNode, compileContext, seenBindings = new Set()) {
    if (!expressionNode || expressionNode.kind !== 'nonterminal') {
      return null;
    }

    let containsUpdateOperator = false;
    walk(expressionNode, (candidate) => {
      if (containsUpdateOperator || !candidate || candidate.kind !== 'terminal') {
        return;
      }
      if (candidate.token === 'TOKEN__2B__2B_' || candidate.token === 'TOKEN__2D__2D_') {
        containsUpdateOperator = true;
      }
    });
    if (containsUpdateOperator) {
      return null;
    }

    const canUseCache = compileContext
      && compileContext._staticModelCache
      && targetNode
      && seenBindings
      && seenBindings.size === 0;
    if (canUseCache) {
      const perTargetCache = compileContext._staticModelCache.get(targetNode);
      if (perTargetCache && perTargetCache.has(expressionNode)) {
        const cached = perTargetCache.get(expressionNode);
        return cached === compileContext._staticModelNullSentinel ? null : cached;
      }
    }
    const finish = (model) => {
      if (canUseCache) {
        let perTargetCache = compileContext._staticModelCache.get(targetNode);
        if (!perTargetCache) {
          perTargetCache = new WeakMap();
          compileContext._staticModelCache.set(targetNode, perTargetCache);
        }
        perTargetCache.set(expressionNode, model === null ? compileContext._staticModelNullSentinel : model);
      }
      return model;
    };

    const flatPrimitiveModel = resolveFlatStaticPrimitiveModel(expressionNode);
    if (flatPrimitiveModel) {
      return finish(flatPrimitiveModel);
    }

    const flattenedExpression = flattenNodeText(expressionNode);
    if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(flattenedExpression)) {
      const identifierName = flattenedExpression;
      const inlineStaticModel = compileContext
        && compileContext.inlineIdentifierStaticModels
        && compileContext.inlineIdentifierStaticModels.get(identifierName);
      if (inlineStaticModel) {
        return finish(inlineStaticModel);
      }
      if (!seenBindings.has(identifierName)) {
        const visibleBindings = collectVisibleVariableBindingsAtNode(targetNode, compileContext);
        const bindingInfo = visibleBindings.get(identifierName) || null;
        if (bindingInfo && bindingInfo.kind === 'initializer' && bindingInfo.expressionNode) {
          seenBindings.add(identifierName);
          const sourceModel = resolveStaticModelFromExpression(
            bindingInfo.expressionNode,
            targetNode,
            compileContext,
            seenBindings
          );
          seenBindings.delete(identifierName);
          if (bindingInfo.staticProjection && bindingInfo.staticProjection.kind === 'array-index'
            && sourceModel && sourceModel.kind === 'array' && Array.isArray(sourceModel.values)) {
            const projected = sourceModel.values[bindingInfo.staticProjection.index] || null;
            return finish(projected);
          }
          if (bindingInfo.staticProjection && bindingInfo.staticProjection.kind === 'object-property'
            && sourceModel && sourceModel.kind === 'object' && sourceModel.properties instanceof Map) {
            return finish(sourceModel.properties.get(bindingInfo.staticProjection.property) || null);
          }
          return finish(sourceModel);
        }
      }
    }
    if (flattenedExpression.startsWith('[') && flattenedExpression.endsWith(']')) {
      const directArrayLiteral = findFirstNonterminal(expressionNode, 'arrayLiteral');
      if (directArrayLiteral) {
        const arrayInfo = extractArrayLiteralElements(directArrayLiteral);
        if (!arrayInfo.hasSpread && !arrayInfo.hasElision) {
          const values = (arrayInfo.values || []).map(
            (valueNode) => resolveStaticModelFromExpression(valueNode, targetNode, compileContext, seenBindings)
          );
          return finish({ kind: 'array', length: values.length, values });
        }
      }
    }
    if (flattenedExpression.startsWith('{') && flattenedExpression.endsWith('}')) {
      const directObjectLiteral = findFirstNonterminal(expressionNode, 'objectLiteral');
      if (directObjectLiteral) {
        const properties = extractObjectLiteralProperties(directObjectLiteral, compileContext);
        const propertyMap = new Map();
        for (const property of properties) {
          propertyMap.set(
            property.key,
            resolveStaticModelFromExpression(property.valueExprNode, targetNode, compileContext, seenBindings)
          );
        }
        return finish({ kind: 'object', properties: propertyMap });
      }
    }

    let current = expressionNode;
    while (current && current.kind === 'nonterminal') {
      if (current.name === 'literal'
        || current.name === 'identifier'
        || current.name === 'arrayLiteral'
        || current.name === 'objectLiteral'
        || current.name === 'callExpression'
        || current.name === 'unaryExpression'
        || current.name === 'memberExpression') {
        break;
      }
      const nonterminalChildren = (current.children || []).filter(
        (child) => child && child.kind === 'nonterminal'
      );
      if (nonterminalChildren.length !== 1) {
        break;
      }
      current = nonterminalChildren[0];
    }

    if (current.name === 'literal') {
      const stringValue = extractStringLiteralValue(current);
      if (stringValue !== null) {
        return finish({ kind: 'string', value: stringValue });
      }
      const literalLowered = lowerLiteralValue(current, null);
      if (literalLowered === 'true' || literalLowered === 'false') {
        return finish({ kind: 'bool', value: literalLowered === 'true' ? 1 : 0 });
      }
      if (literalLowered === 'nullptr') {
        return finish({ kind: 'null', value: null });
      }
      if (literalLowered !== null && /^-?\d+(\.\d+)?$/.test(literalLowered)) {
        return finish({ kind: 'number', value: Number(literalLowered) });
      }
    }

    if (current.name === 'unaryExpression') {
      const children = current.children || [];
      const operatorToken = children.find(
        (child) => child
          && child.kind === 'terminal'
          && ['TOKEN__21_', 'TOKEN__2D_', 'TOKEN__2B_', 'TOKEN__7E_'].includes(child.token)
      ) || null;
      const operandNode = children.find((child) => child && child.kind === 'nonterminal') || null;
      if (!operatorToken || !operandNode) {
        if (!operatorToken && operandNode) {
          return finish(resolveStaticModelFromExpression(operandNode, targetNode, compileContext, seenBindings));
        }
        return finish(null);
      }
      const operandModel = resolveStaticModelFromExpression(operandNode, targetNode, compileContext, seenBindings);
      if (!operandModel) {
        return finish(null);
      }
      if (operatorToken.token === 'TOKEN__2B_') {
        return finish(operandModel);
      }
      if (operatorToken.token === 'TOKEN__2D_' && operandModel.kind === 'number') {
        return finish({ kind: 'number', value: -Number(operandModel.value) });
      }
      if (operatorToken.token === 'TOKEN__7E_' && operandModel.kind === 'number') {
        return finish({ kind: 'number', value: ~Math.trunc(Number(operandModel.value)) });
      }
      if (operatorToken.token === 'TOKEN__21_') {
        let truthy = true;
        if (operandModel.kind === 'number' || operandModel.kind === 'bool') {
          truthy = Number(operandModel.value) !== 0;
        } else if (operandModel.kind === 'string') {
          truthy = !!operandModel.value;
        } else if (operandModel.kind === 'null') {
          truthy = false;
        } else {
          return finish(null);
        }
        return finish({ kind: 'bool', value: truthy ? 0 : 1 });
      }
      return finish(null);
    }

    if (current.name === 'identifier') {
      const identifierName = findFirstIdentifierValue(current);
      if (!identifierName || seenBindings.has(identifierName)) {
        return finish(null);
      }
      const visibleBindings = collectVisibleVariableBindingsAtNode(targetNode, compileContext);
      const bindingInfo = visibleBindings.get(identifierName) || null;
      if (!bindingInfo) {
        const initializerExpr = findBoundVariableInitializerExpressionAtNode(identifierName, targetNode, compileContext);
        if (!initializerExpr || initializerExpr === current) {
          return finish(null);
        }
        seenBindings.add(identifierName);
        const resolvedInitializer = resolveStaticModelFromExpression(
          initializerExpr,
          targetNode,
          compileContext,
          seenBindings
        );
        seenBindings.delete(identifierName);
        return finish(resolvedInitializer);
      }
      if (bindingInfo.kind === 'catch-param') {
        return finish({ kind: 'catch-param', name: identifierName });
      }
      if (bindingInfo.kind === 'mutated' || bindingInfo.kind === 'mutable-binding' || bindingInfo.kind === 'parameter') {
        return finish(null);
      }
      if (!bindingInfo.expressionNode) {
        return finish(null);
      }
      seenBindings.add(identifierName);
      const resolved = resolveStaticModelFromExpression(bindingInfo.expressionNode, targetNode, compileContext, seenBindings);
      seenBindings.delete(identifierName);
      return finish(resolved);
    }

    if (current.name === 'arrayLiteral') {
      const arrayInfo = extractArrayLiteralElements(current);
      if (!arrayInfo || arrayInfo.hasSpread || arrayInfo.hasElision) {
        return finish({ kind: 'array', length: arrayInfo && arrayInfo.operations ? arrayInfo.operations.length : 0 });
      }
      const values = (arrayInfo.values || []).map((valueNode) => resolveStaticModelFromExpression(valueNode, targetNode, compileContext, seenBindings));
      return finish({ kind: 'array', length: values.length, values });
    }

    if (current.name === 'objectLiteral') {
      const properties = extractObjectLiteralProperties(current, compileContext);
      const propertyMap = new Map();
      for (const property of properties) {
        propertyMap.set(property.key, resolveStaticModelFromExpression(property.valueExprNode, targetNode, compileContext, seenBindings));
      }
      return finish({ kind: 'object', properties: propertyMap });
    }

    if (current.name === 'callExpression') {
      const { memberExprNode, argsNode, argExprs } = extractCallExpressionMemberAndArgs(current);
      const pathSegments = memberExprNode ? extractPathFromMemberExpression(memberExprNode, null) : null;
      const pathLabel = Array.isArray(pathSegments) ? pathSegments.join('.') : '';
      const memberChildren = memberExprNode ? (memberExprNode.children || []) : [];
      let directPropertyIndex = -1;
      for (let mi = memberChildren.length - 1; mi >= 0; mi -= 1) {
        if (memberChildren[mi] && memberChildren[mi].kind === 'terminal' && memberChildren[mi].value === '.') {
          directPropertyIndex = mi;
          break;
        }
      }
      const directPropertyNode = directPropertyIndex >= 0 ? memberChildren[directPropertyIndex + 1] : null;
      const directPropertyName = directPropertyNode ? findFirstIdentifierValue(directPropertyNode) : null;
      const baseExpressionNode = directPropertyIndex > 0 ? memberChildren[0] : null;

      let staticCallModel = null;
      const directObjectArgNode = argExprs.length >= 1 ? unwrapExpressionNode(argExprs[0]) : null;
      const canFoldReflectiveObjectShape = directObjectArgNode
        && directObjectArgNode.kind === 'nonterminal'
        && directObjectArgNode.name === 'objectLiteral';

      if (canFoldReflectiveObjectShape
        && (pathLabel === 'Object.values' || pathLabel === 'Object.entries' || pathLabel === 'Reflect.ownKeys')
        && argExprs.length >= 1) {
        const sourceModel = resolveStaticModelFromExpression(argExprs[0], targetNode, compileContext, seenBindings);
        if (sourceModel && sourceModel.kind === 'object') {
          staticCallModel = { kind: 'array', length: sourceModel.properties.size };
        }
      }

      if (!staticCallModel
        && canFoldReflectiveObjectShape
        && pathLabel === 'Object.getOwnPropertyDescriptors'
        && argExprs.length >= 1) {
        const sourceModel = resolveStaticModelFromExpression(argExprs[0], targetNode, compileContext, seenBindings);
        if (sourceModel && sourceModel.kind === 'object') {
          const descriptorMap = new Map();
          for (const key of sourceModel.properties.keys()) {
            descriptorMap.set(key, {
              kind: 'object',
              properties: new Map([['enumerable', { kind: 'bool', value: 1 }]])
            });
          }
          staticCallModel = { kind: 'object', properties: descriptorMap };
        }
      }

      if (!staticCallModel && directPropertyName === 'filter') {
        const filteredModel = tryResolveStaticFilterResultModel(current, baseExpressionNode, argExprs, targetNode, compileContext, seenBindings);
        if (filteredModel) {
          staticCallModel = filteredModel;
        }
      }

      if (!staticCallModel && directPropertyName === 'map') {
        const mappedModel = tryResolveStaticMapResultModel(baseExpressionNode, argExprs, targetNode, compileContext, seenBindings);
        if (mappedModel) {
          staticCallModel = mappedModel;
        }
      }

      if (!staticCallModel
        && Array.isArray(pathSegments)
        && pathSegments.length === 1
        && !directPropertyName) {
        const callableModel = applyStaticArrowCallModel(
          resolveCallableNodeFromExpression(memberExprNode, compileContext),
          argExprs,
          targetNode,
          compileContext,
          seenBindings
        );
        if (callableModel) {
          staticCallModel = callableModel;
        }
      }

      if (!staticCallModel
        && ['some', 'every', 'find', 'findIndex'].includes(directPropertyName)
        && baseExpressionNode
        && argExprs.length >= 1) {
        const baseModel = resolveStaticModelFromExpression(baseExpressionNode, targetNode, compileContext, seenBindings);
        const predicateResult = applyStaticArrayCallbackModel(
          baseModel,
          directPropertyName,
          argExprs,
          targetNode,
          compileContext,
          seenBindings
        );
        if (predicateResult) {
          staticCallModel = predicateResult;
        }
      }

      if (!staticCallModel && (directPropertyName === 'padStart' || directPropertyName === 'padEnd') && baseExpressionNode && argExprs.length >= 1) {
        const baseModel = resolveStaticModelFromExpression(baseExpressionNode, targetNode, compileContext, seenBindings);
        const widthModel = resolveStaticModelFromExpression(argExprs[0], targetNode, compileContext, seenBindings);
        const fillModel = argExprs.length >= 2
          ? resolveStaticModelFromExpression(argExprs[1], targetNode, compileContext, seenBindings)
          : { kind: 'string', value: ' ' };
        if (baseModel && baseModel.kind === 'string' && widthModel && widthModel.kind === 'number') {
          const fillText = fillModel && fillModel.kind === 'string' && fillModel.value ? fillModel.value : ' ';
          const width = Math.max(0, Math.trunc(widthModel.value));
          staticCallModel = {
            kind: 'string',
            value: directPropertyName === 'padStart'
              ? baseModel.value.padStart(width, fillText)
              : baseModel.value.padEnd(width, fillText)
          };
        }
      }

      if (!staticCallModel && baseExpressionNode) {
        const baseModel = resolveStaticModelFromExpression(baseExpressionNode, targetNode, compileContext, seenBindings);
        const argumentModels = argExprs.map((argument) =>
          resolveStaticModelFromExpression(argument, targetNode, compileContext, seenBindings)
        );
        staticCallModel = applyStaticStringMethodModel(baseModel, directPropertyName, argumentModels);
      }

      if (!staticCallModel && directPropertyName === 'join' && baseExpressionNode && argExprs.length <= 1) {
        const baseModel = resolveStaticModelFromExpression(baseExpressionNode, targetNode, compileContext, seenBindings);
        const separatorModel = argExprs.length === 1
          ? resolveStaticModelFromExpression(argExprs[0], targetNode, compileContext, seenBindings)
          : { kind: 'string', value: ',' };
        if (baseModel
          && baseModel.kind === 'array'
          && Array.isArray(baseModel.values)
          && separatorModel
          && separatorModel.kind === 'string') {
          const values = baseModel.values.map(staticModelToJsString);
          if (values.every((value) => value !== null)) {
            staticCallModel = { kind: 'string', value: values.join(separatorModel.value) };
          }
        }
      }

      if (!staticCallModel && directPropertyName === 'includes' && baseExpressionNode && argExprs.length >= 1 && argExprs.length <= 2) {
        const baseModel = resolveStaticModelFromExpression(baseExpressionNode, targetNode, compileContext, seenBindings);
        const searchModel = resolveStaticModelFromExpression(argExprs[0], targetNode, compileContext, seenBindings);
        const fromIndex = argExprs.length === 2
          ? resolveStaticSearchFromIndex(argExprs[1], targetNode, compileContext, seenBindings)
          : 0;
        if (fromIndex !== null && baseModel && searchModel && baseModel.kind === 'array' && Array.isArray(baseModel.values)) {
          const searchKey = JSON.stringify(searchModel);
          const startIndex = fromIndex < 0
            ? Math.max(baseModel.values.length + fromIndex, 0)
            : Math.min(fromIndex, baseModel.values.length);
          staticCallModel = {
            kind: 'bool',
            value: baseModel.values.slice(startIndex).some((valueModel) => JSON.stringify(valueModel) === searchKey) ? 1 : 0
          };
        }
        if (!staticCallModel && fromIndex !== null && baseModel && searchModel && baseModel.kind === 'string' && searchModel.kind === 'string') {
          staticCallModel = { kind: 'bool', value: baseModel.value.includes(searchModel.value, fromIndex) ? 1 : 0 };
        }
      }

      if (!staticCallModel
        && (directPropertyName === 'indexOf' || directPropertyName === 'lastIndexOf')
        && baseExpressionNode
        && argExprs.length >= 1
        && argExprs.length <= 2) {
        const baseModel = resolveStaticModelFromExpression(baseExpressionNode, targetNode, compileContext, seenBindings);
        const searchModel = resolveStaticModelFromExpression(argExprs[0], targetNode, compileContext, seenBindings);
        const fromIndex = argExprs.length === 2
          ? resolveStaticSearchFromIndex(argExprs[1], targetNode, compileContext, seenBindings)
          : null;
        const hasUsableFromIndex = argExprs.length === 1 || fromIndex !== null;
        if (hasUsableFromIndex && baseModel && searchModel && baseModel.kind === 'array' && Array.isArray(baseModel.values)) {
          const searchKey = JSON.stringify(searchModel);
          let foundIndex = -1;
          if (directPropertyName === 'indexOf') {
            const startIndex = fromIndex !== null && fromIndex < 0
              ? Math.max(baseModel.values.length + fromIndex, 0)
              : Math.min(fromIndex || 0, baseModel.values.length);
            for (let index = startIndex; index < baseModel.values.length; index += 1) {
              if (JSON.stringify(baseModel.values[index]) === searchKey) {
                foundIndex = index;
                break;
              }
            }
          } else {
            const startIndex = fromIndex === null
              ? baseModel.values.length - 1
              : (fromIndex >= 0
                ? Math.min(fromIndex, baseModel.values.length - 1)
                : baseModel.values.length + fromIndex);
            for (let index = startIndex; index >= 0; index -= 1) {
              if (JSON.stringify(baseModel.values[index]) === searchKey) {
                foundIndex = index;
                break;
              }
            }
          }
          staticCallModel = { kind: 'number', value: foundIndex };
        }
        if (!staticCallModel && hasUsableFromIndex && baseModel && searchModel && baseModel.kind === 'string' && searchModel.kind === 'string') {
          staticCallModel = {
            kind: 'number',
            value: directPropertyName === 'indexOf'
              ? baseModel.value.indexOf(searchModel.value, fromIndex === null ? undefined : fromIndex)
              : baseModel.value.lastIndexOf(searchModel.value, fromIndex === null ? undefined : fromIndex)
          };
        }
      }

      if (!staticCallModel && (directPropertyName === 'reduce' || directPropertyName === 'reduceRight') && baseExpressionNode && argExprs.length >= 1) {
        const baseModel = resolveStaticModelFromExpression(baseExpressionNode, targetNode, compileContext, seenBindings);
        const callbackNode = resolveCallableNodeFromExpression(argExprs[0], compileContext);
        const callbackParams = extractCallableParameterNames(callbackNode);
        const callbackReturnExpression = extractCallableReturnExpressionNode(callbackNode);
        const callbackCaptureModels = resolveStaticArrowCaptureModels(
          callbackNode,
          targetNode,
          compileContext,
          seenBindings
        );
        const hasInitialValue = argExprs.length >= 2;
        const initialModel = hasInitialValue
          ? resolveStaticModelFromExpression(argExprs[1], targetNode, compileContext, seenBindings)
          : null;
        if (baseModel
          && baseModel.kind === 'array'
          && Array.isArray(baseModel.values)
          && callbackNode
          && callbackReturnExpression
          && callbackCaptureModels
          && (hasInitialValue ? initialModel : baseModel.values.length > 0)) {
          const values = directPropertyName === 'reduceRight'
            ? Array.from(baseModel.values).reverse()
            : baseModel.values;
          let accModel = hasInitialValue ? initialModel : values[0];
          for (let index = hasInitialValue ? 0 : 1; index < values.length; index += 1) {
            const scopeModels = new Map(callbackCaptureModels);
            if (callbackParams[0]) {
              scopeModels.set(callbackParams[0], accModel);
            }
            if (callbackParams[1]) {
              scopeModels.set(callbackParams[1], values[index]);
            }
            if (callbackParams[2]) {
              scopeModels.set(callbackParams[2], {
                kind: 'number',
                value: directPropertyName === 'reduceRight'
                  ? baseModel.values.length - 1 - index
                  : index
              });
            }
            if (callbackParams[3]) {
              scopeModels.set(callbackParams[3], baseModel);
            }
            const nextModel = evaluateStaticExpressionModel(callbackReturnExpression, scopeModels, compileContext);
            if (!nextModel) {
              return finish(null);
            }
            accModel = nextModel;
          }
          staticCallModel = accModel;
        }
      }

      if (staticCallModel) {
        return finish(resolveStaticModelFromCallChainSuffix(
          current,
          argsNode,
          staticCallModel,
          targetNode,
          compileContext,
          seenBindings
        ));
      }
    }

    if (current.name === 'memberExpression') {
      const memberChildren = current.children || [];
      const directPropertyIndex = memberChildren.findIndex((child) => child && child.kind === 'terminal' && child.value === '.');
      const directPropertyNode = directPropertyIndex >= 0 ? memberChildren[directPropertyIndex + 1] : null;
      const directPropertyName = directPropertyNode ? findFirstIdentifierValue(directPropertyNode) : null;
      const baseExpressionNode = directPropertyIndex > 0 ? memberChildren[0] : null;
      if (directPropertyIndex < 0) {
        const nonterminalChildren = memberChildren.filter((child) => child && child.kind === 'nonterminal');
        if (nonterminalChildren.length === 1) {
          return finish(resolveStaticModelFromExpression(
            nonterminalChildren[0],
            targetNode,
            compileContext,
            seenBindings
          ));
        }
      }
      if (baseExpressionNode && directPropertyName) {
        const baseModel = resolveStaticModelFromExpression(
          baseExpressionNode,
          targetNode,
          compileContext,
          seenBindings
        );
        if (baseModel && baseModel.kind === 'array' && directPropertyName === 'length') {
          return finish({ kind: 'number', value: baseModel.length || 0 });
        }
        if (baseModel && baseModel.kind === 'object') {
          return finish(baseModel.properties.get(directPropertyName) || null);
        }
      }

      const computedInfo = extractComputedMemberAccessInfo(current);
      if (computedInfo) {
        const baseModel = resolveStaticModelFromExpression(
          computedInfo.baseExpressionNode,
          targetNode,
          compileContext,
          seenBindings
        );
        const propertyModel = resolveStaticModelFromExpression(
          computedInfo.propertyExpressionNode,
          targetNode,
          compileContext,
          seenBindings
        );
        if (baseModel && baseModel.kind === 'array' && propertyModel && propertyModel.kind === 'number') {
          const index = propertyModel.value;
          if (Number.isInteger(index) && index >= 0 && Array.isArray(baseModel.values) && index < baseModel.values.length) {
            return finish(baseModel.values[index] || null);
          }
        }
        if (baseModel && baseModel.kind === 'object' && propertyModel && propertyModel.kind === 'string') {
          return finish(baseModel.properties.get(propertyModel.value) || null);
        }
      }

      const passthroughChild = (current.children || []).find(
        (child) => child && child.kind === 'nonterminal'
      ) || null;
      if (passthroughChild) {
        return finish(resolveStaticModelFromExpression(passthroughChild, targetNode, compileContext, seenBindings));
      }
    }

    return finish(null);
  }

  function lowerStaticModelToExpression(model) {
    if (!model) {
      return null;
    }
    if (model.kind === 'number') {
      return String(model.value);
    }
    if (model.kind === 'bool') {
      return model.value ? '1' : '0';
    }
    if (model.kind === 'string') {
      return staticStringLiteralCpp(model.value);
    }
    if (model.kind === 'catch-param') {
      return model.name || null;
    }
    return null;
  }

  function lowerStaticModelToRuntimeExpression(model) {
    if (!model) {
      return null;
    }
    const scalar = lowerStaticModelToExpression(model);
    if (scalar !== null) {
      return scalar;
    }
    if (model.kind === 'array') {
      const values = Array.isArray(model.values) ? model.values : null;
      if (values && values.length <= 4) {
        const loweredValues = values.map((value) => lowerStaticModelToExpression(value));
        if (loweredValues.every((value) => value !== null)) {
          return `__maia_arr_literal${values.length}(${loweredValues.map((value) => `(long)(${value})`).join(', ')})`;
        }
      }
      return `__maia_runtime_alloc_value(2, ${model.length || 0}, 0, 0)`;
    }
    return null;
  }

  function staticModelToJsString(model) {
    if (!model) {
      return null;
    }
    if (model.kind === 'string') {
      return model.value;
    }
    if (model.kind === 'number') {
      return String(model.value);
    }
    if (model.kind === 'bool') {
      return model.value ? 'true' : 'false';
    }
    return null;
  }

  function resolveStaticSearchFromIndex(expressionNode, targetNode, compileContext, seenBindings) {
    const model = resolveStaticModelFromExpression(expressionNode, targetNode, compileContext, seenBindings);
    if (!model || model.kind !== 'number' || !Number.isFinite(Number(model.value))) {
      return null;
    }
    return Math.trunc(Number(model.value));
  }

  function extractCallableReturnExpressionNode(callableNode) {
    if (!callableNode || callableNode.kind !== 'nonterminal') {
      return null;
    }

    if (callableNode.name === 'arrowFunction' || callableNode.name === 'asyncArrowFunction') {
      const bodyNode = extractLambdaBodyNode(callableNode);
      if (!bodyNode) {
        return null;
      }
      const directExpression = (bodyNode.children || []).find(
        (child) => child && child.kind === 'nonterminal' && ['expression', 'assignmentExpression'].includes(child.name)
      );
      if (directExpression) {
        return directExpression;
      }
      return findFirstNonterminal(bodyNode, 'expression') || findFirstNonterminal(bodyNode, 'assignmentExpression');
    }

    if (callableNode.name === 'functionExpression' || callableNode.name === 'functionDeclaration') {
      const returnStatement = findFirstNonterminal(callableNode, 'returnStatement');
      if (!returnStatement) {
        return null;
      }
      const directExpression = (returnStatement.children || []).find(
        (child) => child && child.kind === 'nonterminal' && ['expression', 'assignmentExpression'].includes(child.name)
      );
      if (directExpression) {
        return directExpression;
      }
      return findFirstNonterminal(returnStatement, 'expression') || findFirstNonterminal(returnStatement, 'assignmentExpression');
    }

    return null;
  }

  function extractCallableParameterNames(callableNode) {
    if (!callableNode || callableNode.kind !== 'nonterminal') {
      return [];
    }
    if (callableNode.name === 'arrowFunction' || callableNode.name === 'asyncArrowFunction') {
      return extractLambdaParameterNames(callableNode);
    }
    return extractFunctionParameterNames(callableNode);
  }

  function extractOutermostCallMemberExpression(callExpressionNode) {
    if (!callExpressionNode || callExpressionNode.kind !== 'nonterminal' || callExpressionNode.name !== 'callExpression') {
      return null;
    }
    const children = callExpressionNode.children || [];
    const directChild = children.find((child) => child && child.kind === 'nonterminal' && child.name === 'memberExpression') || null;
    if (directChild) {
      return directChild;
    }
    let lastMemberExpression = null;
    walk(callExpressionNode, (child) => {
      if (child && child.kind === 'nonterminal' && child.name === 'memberExpression') {
        lastMemberExpression = child;
      }
    });
    return lastMemberExpression;
  }

  function extractCallExpressionMemberAndArgs(callExpressionNode) {
    if (!callExpressionNode || callExpressionNode.kind !== 'nonterminal' || callExpressionNode.name !== 'callExpression') {
      return { memberExprNode: null, argsNode: null, argExprs: [] };
    }

    const children = callExpressionNode.children || [];
    let memberExprNode = extractOutermostCallMemberExpression(callExpressionNode);
    let argsNode = children.find((child) => child && child.kind === 'nonterminal' && child.name === 'arguments') || null;
    if (!argsNode) {
      argsNode = findFirstNonterminal(callExpressionNode, 'arguments');
    }
    const argListNode = argsNode
      ? ((argsNode.children || []).find((child) => child && child.kind === 'nonterminal' && child.name === 'argumentList')
        || findFirstNonterminal(argsNode, 'argumentList'))
      : null;
    const argExprs = argListNode ? collectArgumentExpressions(argListNode) : [];
    return { memberExprNode, argsNode, argExprs };
  }

  function applyStaticStringMethodModel(baseModel, methodName, argumentModels) {
    if (!baseModel || baseModel.kind !== 'string') {
      return null;
    }
    const value = baseModel.value;
    if (methodName === 'trim' && argumentModels.length === 0) {
      return { kind: 'string', value: value.trim() };
    }
    if (methodName === 'trimStart' && argumentModels.length === 0) {
      return { kind: 'string', value: value.trimStart() };
    }
    if (methodName === 'trimEnd' && argumentModels.length === 0) {
      return { kind: 'string', value: value.trimEnd() };
    }
    if (methodName === 'toUpperCase' && argumentModels.length === 0) {
      return { kind: 'string', value: value.toUpperCase() };
    }
    if (methodName === 'toLowerCase' && argumentModels.length === 0) {
      return { kind: 'string', value: value.toLowerCase() };
    }
    if ((methodName === 'startsWith' || methodName === 'endsWith')
      && argumentModels.length >= 1
      && argumentModels.length <= 2
      && argumentModels[0]
      && argumentModels[0].kind === 'string'
      && (argumentModels.length === 1
        || (argumentModels[1]
          && argumentModels[1].kind === 'number'
          && Number.isFinite(Number(argumentModels[1].value))))) {
      const position = argumentModels.length === 2
        ? Math.trunc(Number(argumentModels[1].value))
        : undefined;
      const matched = methodName === 'startsWith'
        ? value.startsWith(argumentModels[0].value, position)
        : value.endsWith(argumentModels[0].value, position);
      return { kind: 'bool', value: matched ? 1 : 0 };
    }
    return null;
  }

  function applyStaticArrayCallbackModel(baseModel, methodName, argExprs, targetNode, compileContext, seenBindings) {
    if (!baseModel || baseModel.kind !== 'array' || !Array.isArray(baseModel.values) || !Array.isArray(argExprs) || argExprs.length < 1) {
      return null;
    }

    const callbackNode = resolveCallableNodeFromExpression(argExprs[0], compileContext);
    const callbackParams = extractCallableParameterNames(callbackNode);
    const callbackReturnExpression = extractCallableReturnExpressionNode(callbackNode);
    const callbackCaptureModels = resolveStaticArrowCaptureModels(
      callbackNode,
      targetNode,
      compileContext,
      seenBindings
    );
    if (!callbackNode || !callbackReturnExpression || !callbackCaptureModels) {
      return null;
    }

    if (methodName === 'map') {
      const mappedValues = [];
      for (let index = 0; index < baseModel.values.length; index += 1) {
        const scopeModels = new Map(callbackCaptureModels);
        if (callbackParams[0]) { scopeModels.set(callbackParams[0], baseModel.values[index]); }
        if (callbackParams[1]) { scopeModels.set(callbackParams[1], { kind: 'number', value: index }); }
        if (callbackParams[2]) { scopeModels.set(callbackParams[2], baseModel); }
        const valueModel = evaluateStaticExpressionModel(callbackReturnExpression, scopeModels, compileContext);
        if (!valueModel) {
          return null;
        }
        mappedValues.push(valueModel);
      }
      return { kind: 'array', length: mappedValues.length, values: mappedValues };
    }

    if (methodName === 'filter') {
      const filteredValues = [];
      for (let index = 0; index < baseModel.values.length; index += 1) {
        const scopeModels = new Map(callbackCaptureModels);
        if (callbackParams[0]) { scopeModels.set(callbackParams[0], baseModel.values[index]); }
        if (callbackParams[1]) { scopeModels.set(callbackParams[1], { kind: 'number', value: index }); }
        if (callbackParams[2]) { scopeModels.set(callbackParams[2], baseModel); }
        const predicateModel = evaluateStaticExpressionModel(callbackReturnExpression, scopeModels, compileContext);
        if (!predicateModel || predicateModel.kind !== 'bool') {
          return null;
        }
        if (predicateModel.value) {
          filteredValues.push(baseModel.values[index]);
        }
      }
      return { kind: 'array', length: filteredValues.length, values: filteredValues };
    }

    if (methodName === 'some'
      || methodName === 'every'
      || methodName === 'find'
      || methodName === 'findIndex') {
      let matchedIndex = -1;
      let everyMatches = true;
      for (let index = 0; index < baseModel.values.length; index += 1) {
        const scopeModels = new Map(callbackCaptureModels);
        if (callbackParams[0]) { scopeModels.set(callbackParams[0], baseModel.values[index]); }
        if (callbackParams[1]) { scopeModels.set(callbackParams[1], { kind: 'number', value: index }); }
        if (callbackParams[2]) { scopeModels.set(callbackParams[2], baseModel); }
        const predicateModel = evaluateStaticExpressionModel(callbackReturnExpression, scopeModels, compileContext);
        if (!predicateModel || predicateModel.kind !== 'bool') {
          return null;
        }
        if (predicateModel.value) {
          matchedIndex = index;
          if (methodName !== 'every') {
            break;
          }
        } else if (methodName === 'every') {
          everyMatches = false;
          break;
        }
      }
      if (methodName === 'some') {
        return { kind: 'bool', value: matchedIndex >= 0 ? 1 : 0 };
      }
      if (methodName === 'every') {
        return { kind: 'bool', value: everyMatches ? 1 : 0 };
      }
      if (methodName === 'findIndex') {
        return { kind: 'number', value: matchedIndex };
      }
      return matchedIndex >= 0 ? baseModel.values[matchedIndex] : null;
    }

    if (methodName === 'reduce' || methodName === 'reduceRight') {
      const hasInitialValue = argExprs.length >= 2;
      if (!hasInitialValue && baseModel.values.length === 0) {
        return null;
      }
      const values = methodName === 'reduceRight'
        ? Array.from(baseModel.values).reverse()
        : baseModel.values;
      let accModel = hasInitialValue
        ? resolveStaticModelFromExpression(argExprs[1], targetNode, compileContext, seenBindings)
        : values[0];
      if (!accModel) {
        return null;
      }
      for (let index = hasInitialValue ? 0 : 1; index < values.length; index += 1) {
        const scopeModels = new Map(callbackCaptureModels);
        if (callbackParams[0]) { scopeModels.set(callbackParams[0], accModel); }
        if (callbackParams[1]) { scopeModels.set(callbackParams[1], values[index]); }
        if (callbackParams[2]) {
          scopeModels.set(callbackParams[2], {
            kind: 'number',
            value: methodName === 'reduceRight'
              ? baseModel.values.length - 1 - index
              : index
          });
        }
        if (callbackParams[3]) { scopeModels.set(callbackParams[3], baseModel); }
        const nextModel = evaluateStaticExpressionModel(callbackReturnExpression, scopeModels, compileContext);
        if (!nextModel) {
          return null;
        }
        accModel = nextModel;
      }
      return accModel;
    }

    return null;
  }

  function resolveStaticArrowCaptureModels(callbackNode, targetNode, compileContext, seenBindings) {
    if (!callbackNode || callbackNode.kind !== 'nonterminal') {
      return null;
    }
    if (callbackNode.name !== 'arrowFunction' && callbackNode.name !== 'asyncArrowFunction') {
      return new Map();
    }

    const visibleBindings = collectVisibleVariableBindingsAtNode(targetNode, compileContext);
    const captureModels = new Map();
    for (const captureName of collectLambdaCaptureNames(callbackNode, compileContext)) {
      const bindingInfo = visibleBindings.get(captureName) || null;
      if (!bindingInfo || bindingInfo.kind !== 'initializer' || !bindingInfo.expressionNode) {
        return null;
      }
      const captureModel = resolveStaticModelFromExpression(
        bindingInfo.expressionNode,
        targetNode,
        compileContext,
        seenBindings
      );
      if (!captureModel) {
        return null;
      }
      captureModels.set(captureName, captureModel);
    }
    return captureModels;
  }

  function applyStaticArrowCallModel(arrowNode, argExprs, targetNode, compileContext, seenBindings) {
    if (!arrowNode || arrowNode.kind !== 'nonterminal' || arrowNode.name !== 'arrowFunction') {
      return null;
    }
    if (collectLambdaCaptureNames(arrowNode, compileContext).length === 0) {
      return null;
    }
    const parameterNames = extractCallableParameterNames(arrowNode);
    const returnExpression = extractCallableReturnExpressionNode(arrowNode);
    if (!returnExpression || parameterNames.length !== argExprs.length) {
      return null;
    }
    const captureModels = resolveStaticArrowCaptureModels(
      arrowNode,
      targetNode,
      compileContext,
      seenBindings
    );
    if (!captureModels) {
      return null;
    }
    const scopeModels = new Map(captureModels);
    for (let index = 0; index < parameterNames.length; index += 1) {
      const argumentModel = resolveStaticModelFromExpression(
        argExprs[index],
        targetNode,
        compileContext,
        seenBindings
      );
      if (!argumentModel) {
        return null;
      }
      scopeModels.set(parameterNames[index], argumentModel);
    }
    return evaluateStaticExpressionModel(returnExpression, scopeModels, compileContext);
  }

  function resolveStaticModelFromCallChainSuffix(callExpressionNode, argsNode, initialModel, targetNode, compileContext, seenBindings) {
    if (!callExpressionNode || !initialModel) {
      return initialModel;
    }

    const children = callExpressionNode.children || [];
    const firstArgsIndex = argsNode ? children.indexOf(argsNode) : -1;
    if (firstArgsIndex < 0) {
      return initialModel;
    }

    let currentModel = initialModel;
    for (let i = firstArgsIndex + 1; i < children.length; i += 1) {
      const child = children[i];
      if (!child || child.kind !== 'terminal' || child.value !== '.') {
        continue;
      }

      let propertyNode = children[i + 1] || null;
      if (propertyNode && (propertyNode.kind !== 'nonterminal' || propertyNode.name !== 'propertyIdentifierName')) {
        const fallbackPropertyNode = findFirstNonterminal(propertyNode, 'propertyIdentifierName');
        if (fallbackPropertyNode) {
          propertyNode = fallbackPropertyNode;
        }
      }
      if (!propertyNode) {
        return null;
      }

      const propertyName = findFirstIdentifierValue(propertyNode);
      if (!propertyName) {
        return null;
      }

      const nextChainChild = children[i + 2] || null;
      const propertyFollowedByArgs = Boolean(
        nextChainChild
        && nextChainChild.kind === 'nonterminal'
        && nextChainChild.name === 'arguments'
      );

      if (propertyFollowedByArgs) {
        const argumentList = (nextChainChild.children || []).find(
          (candidate) => candidate && candidate.kind === 'nonterminal' && candidate.name === 'argumentList'
        ) || findFirstNonterminal(nextChainChild, 'argumentList');
        const argumentExprs = argumentList ? collectArgumentExpressions(argumentList) : [];
        const argumentModels = argumentExprs
          ? argumentExprs.map((argument) =>
            resolveStaticModelFromExpression(argument, targetNode, compileContext, seenBindings)
          )
          : [];
        const stringMethodModel = applyStaticStringMethodModel(currentModel, propertyName, argumentModels);
        if (stringMethodModel) {
          currentModel = stringMethodModel;
          i += 2;
          continue;
        }
        if (currentModel.kind === 'array' && ['map', 'filter', 'some', 'every', 'find', 'findIndex', 'reduce', 'reduceRight'].includes(propertyName)) {
          const nextModel = applyStaticArrayCallbackModel(
            currentModel,
            propertyName,
            argumentExprs,
            targetNode,
            compileContext,
            seenBindings
          );
          if (!nextModel) {
            return null;
          }
          currentModel = nextModel;
          i += 2;
          continue;
        }
        return null;
      }

      if (propertyName === 'length' && currentModel.kind === 'array') {
        currentModel = { kind: 'number', value: currentModel.length || 0 };
        i += 1;
        continue;
      }

      if (propertyName === 'message' && currentModel.kind === 'catch-param') {
        i += 1;
        continue;
      }

      if (currentModel.kind === 'object') {
        currentModel = currentModel.properties.get(propertyName) || null;
        if (!currentModel) {
          return null;
        }
        i += 1;
        continue;
      }

      return null;
    }

    return currentModel;
  }

  function findCallableNodeFromExpression(expressionNode) {
    if (!expressionNode || expressionNode.kind !== 'nonterminal') {
      return null;
    }
    if (expressionNode.name === 'arrowFunction'
      || expressionNode.name === 'asyncArrowFunction'
      || expressionNode.name === 'functionExpression'
      || expressionNode.name === 'functionDeclaration') {
      return expressionNode;
    }
    return findFirstNonterminal(expressionNode, 'arrowFunction')
      || findFirstNonterminal(expressionNode, 'asyncArrowFunction')
      || findFirstNonterminal(expressionNode, 'functionExpression')
      || findFirstNonterminal(expressionNode, 'functionDeclaration');
  }

  function resolveCallableNodeFromExpression(expressionNode, compileContext) {
    const inlineCallable = findCallableNodeFromExpression(expressionNode);
    if (inlineCallable) {
      return inlineCallable;
    }

    const bindingName = findFirstIdentifierValue(expressionNode);
    if (!bindingName || !compileContext) {
      return null;
    }

    // Capture-aware arrows are intentionally absent from the concrete C++
    // callable-symbol table. They can still participate in static collection
    // evaluation when their immutable binding is visible at this call site.
    const visibleBindings = collectVisibleVariableBindingsAtNode(expressionNode, compileContext);
    const bindingInfo = visibleBindings.get(bindingName) || null;
    if (bindingInfo && bindingInfo.kind === 'initializer' && bindingInfo.expressionNode) {
      const boundCallable = findCallableNodeFromExpression(bindingInfo.expressionNode);
      if (boundCallable) {
        return boundCallable;
      }
    }
    const lexicalInitializer = findBoundVariableInitializerExpressionAtNode(
      bindingName,
      expressionNode,
      compileContext
    );
    const lexicalCallable = findCallableNodeFromExpression(lexicalInitializer);
    if (lexicalCallable) {
      return lexicalCallable;
    }
    if (compileContext.topLevelArrowFunctionSymbols) {
      for (const [arrowNode, name] of compileContext.topLevelArrowFunctionSymbols.entries()) {
        if (name === bindingName) {
          return arrowNode;
        }
      }
    }

    for (const functionNode of collectTopLevelFunctionDeclarations(compileContext.tree)) {
      if (extractFunctionDeclarationName(functionNode) === bindingName) {
        return functionNode;
      }
    }

    if (compileContext.topLevelFunctionExpressionSymbols) {
      for (const [functionNode, name] of compileContext.topLevelFunctionExpressionSymbols.entries()) {
        if (name === bindingName) {
          return functionNode;
        }
      }
    }
    return null;
  }

  function resolveFlatStaticPrimitiveModel(expressionNode) {
    const flattenedText = flattenNodeText(expressionNode);
    if (/^(?:'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*")$/.test(flattenedText)) {
      const normalized = normalizeJsStringLiteralForCpp(flattenedText);
      if (!normalized) {
        return { kind: 'string', value: '' };
      }
      try {
        return { kind: 'string', value: JSON.parse(normalized) };
      } catch (_) {
        return { kind: 'string', value: normalized.slice(1, -1) };
      }
    }
    if (/^-?\d+(\.\d+)?$/.test(flattenedText)) {
      return { kind: 'number', value: Number(flattenedText) };
    }
    if (flattenedText === 'true' || flattenedText === 'false') {
      return { kind: 'bool', value: flattenedText === 'true' ? 1 : 0 };
    }
    if (flattenedText === 'null') {
      return { kind: 'null', value: null };
    }
    return null;
  }

  function resolveStaticPromiseSeedModel(expressionNode, targetNode, scopeModels, compileContext) {
    const flatPrimitiveModel = resolveFlatStaticPrimitiveModel(expressionNode);
    if (flatPrimitiveModel) {
      return flatPrimitiveModel;
    }

    const directStringValue = extractStringLiteralValue(expressionNode);
    if (directStringValue !== null) {
      return { kind: 'string', value: directStringValue };
    }

    const directModel = resolveStaticModelFromExpression(expressionNode, targetNode, compileContext);
    if (directModel) {
      return directModel;
    }

    let current = expressionNode;
    while (current && current.kind === 'nonterminal') {
      if (current.name === 'literal'
        || current.name === 'identifier'
        || current.name === 'callExpression'
        || current.name === 'memberExpression'
        || current.name === 'equalityExpression'
        || current.name === 'multiplicativeExpression'
        || current.name === 'additiveExpression') {
        break;
      }
      if (current.name === 'primaryExpression') {
        const literalChild = (current.children || []).find(
          (child) => child && child.kind === 'nonterminal' && child.name === 'literal'
        );
        if (literalChild) {
          current = literalChild;
          break;
        }
      }
      const nonterminalChildren = (current.children || []).filter(
        (child) => child && child.kind === 'nonterminal'
      );
      if (nonterminalChildren.length !== 1) {
        break;
      }
      current = nonterminalChildren[0];
    }

    if (!current || current.kind !== 'nonterminal') {
      return null;
    }

    if (current.name === 'literal') {
      const numericLiteralNode = (current.children || []).find(
        (child) => child && child.kind === 'nonterminal' && child.name === 'numericLiteral'
      );
      if (numericLiteralNode) {
        const terminal = (numericLiteralNode.children || []).find((child) => child && child.kind === 'terminal');
        if (terminal) {
          const numericValue = Number(terminal.value);
          if (Number.isFinite(numericValue)) {
            return { kind: 'number', value: numericValue };
          }
        }
      }

      const booleanLiteralNode = (current.children || []).find(
        (child) => child && child.kind === 'nonterminal' && child.name === 'booleanLiteral'
      );
      if (booleanLiteralNode) {
        const terminal = (booleanLiteralNode.children || []).find((child) => child && child.kind === 'terminal');
        if (terminal) {
          return { kind: 'bool', value: terminal.value === 'true' ? 1 : 0 };
        }
      }
    }

    if (current.name === 'identifier') {
      const name = findFirstIdentifierValue(current);
      if (name && scopeModels && scopeModels.has(name)) {
        return scopeModels.get(name);
      }
    }

    return evaluateStaticExpressionModel(current, scopeModels, compileContext);
  }

  function analyzeStaticPromiseThenChain(callExpressionNode, scopeModels, compileContext) {
    if (!callExpressionNode || callExpressionNode.kind !== 'nonterminal' || callExpressionNode.name !== 'callExpression') {
      return null;
    }

    const { memberExprNode, argsNode, argExprs } = extractCallExpressionMemberAndArgs(callExpressionNode);
    if (!memberExprNode || !argsNode) {
      return null;
    }

    const pathSegments = extractPathFromMemberExpression(memberExprNode, null);
    let currentValueModel = null;
    let scheduleKind = null;
    const initialValueArgNode = Array.isArray(pathSegments) && pathSegments.length === 2 && pathSegments[0] === 'Promise' && pathSegments[1] === 'resolve'
      ? (argExprs[0] || null)
      : (argExprs[1] || null);

    if (Array.isArray(pathSegments) && pathSegments.length === 2 && pathSegments[0] === 'Promise' && pathSegments[1] === 'resolve' && argExprs.length >= 1) {
      currentValueModel = resolveStaticPromiseSeedModel(initialValueArgNode, callExpressionNode, scopeModels, compileContext);
      scheduleKind = 'microtask';
    } else if (Array.isArray(pathSegments) && pathSegments.length === 1 && pathSegments[0] === 'delay' && argExprs.length >= 2) {
      currentValueModel = resolveStaticPromiseSeedModel(initialValueArgNode, callExpressionNode, scopeModels, compileContext);
      scheduleKind = 'timer';
    } else {
      return null;
    }

    if (!currentValueModel) {
      return null;
    }

    const children = callExpressionNode.children || [];
    const firstArgsIndex = children.indexOf(argsNode);
    if (firstArgsIndex < 0) {
      return null;
    }

    let sawThen = false;
    for (let i = firstArgsIndex + 1; i < children.length; i += 1) {
      const dotNode = children[i];
      if (!dotNode || dotNode.kind !== 'terminal' || dotNode.value !== '.') {
        return null;
      }

      const propertyNode = children[i + 1] || null;
      const propertyName = propertyNode ? findFirstIdentifierValue(propertyNode) : null;
      const thenArgsNode = children[i + 2] || null;
      if (propertyName !== 'then'
        || !thenArgsNode
        || thenArgsNode.kind !== 'nonterminal'
        || thenArgsNode.name !== 'arguments') {
        return null;
      }

      const thenArgListNode = (thenArgsNode.children || []).find(
        (child) => child && child.kind === 'nonterminal' && child.name === 'argumentList'
      ) || findFirstNonterminal(thenArgsNode, 'argumentList');
      const thenArgExprs = thenArgListNode ? collectArgumentExpressions(thenArgListNode) : [];
      if (thenArgExprs.length < 1) {
        return null;
      }

      const callbackNode = findCallableNodeFromExpression(thenArgExprs[0]);
      const callbackReturnExpression = extractCallableReturnExpressionNode(callbackNode);
      const callbackParams = extractCallableParameterNames(callbackNode);
      if (!callbackNode || !callbackReturnExpression) {
        return null;
      }

      const callbackScopeModels = new Map(scopeModels || []);
      if (callbackParams[0]) {
        callbackScopeModels.set(callbackParams[0], currentValueModel);
      }

      const callbackResultModel = evaluateStaticExpressionModel(callbackReturnExpression, callbackScopeModels, compileContext);
      if (!callbackResultModel) {
        return null;
      }

      currentValueModel = callbackResultModel;
      sawThen = true;
      i += 2;
    }

    if (!sawThen) {
      return null;
    }

    return {
      scheduleKind,
      resultModel: currentValueModel
    };
  }

  function tryLowerStaticPromiseThenChain(callExpressionNode, compileContext) {
    if (compileContext && compileContext.promisePlan && compileContext.promisePlan.enabled) {
      return null;
    }
    const analysis = analyzeStaticPromiseThenChain(callExpressionNode, new Map(), compileContext);
    if (!analysis) {
      return null;
    }
    const { resultModel, scheduleKind } = analysis;
    if (resultModel.kind === 'console-log') {
      enqueueDeferredPromiseStatement(
        compileContext,
        scheduleKind,
        `__console__log(${staticStringLiteralCpp(resultModel.value)});`
      );
      return '0';
    }
    return lowerStaticModelToRuntimeExpression(resultModel);
  }

  function evaluateStaticExpressionModel(expressionNode, scopeModels, compileContext) {
    if (!expressionNode || expressionNode.kind !== 'nonterminal') {
      return null;
    }

    const flatPrimitiveModel = resolveFlatStaticPrimitiveModel(expressionNode);
    if (flatPrimitiveModel) {
      return flatPrimitiveModel;
    }

    const directStaticModel = resolveStaticModelFromExpression(expressionNode, expressionNode, compileContext);
    if (directStaticModel) {
      return directStaticModel;
    }

    let current = expressionNode;
    while (current && current.kind === 'nonterminal') {
      if (current.name === 'literal'
        || current.name === 'identifier'
        || current.name === 'callExpression'
        || current.name === 'memberExpression'
        || current.name === 'equalityExpression'
        || current.name === 'multiplicativeExpression'
        || current.name === 'additiveExpression') {
        break;
      }
      const nonterminalChildren = (current.children || []).filter((child) => child && child.kind === 'nonterminal');
      if (nonterminalChildren.length !== 1) {
        break;
      }
      current = nonterminalChildren[0];
    }

    if (current.name === 'literal') {
      return resolveStaticModelFromExpression(current, current, compileContext);
    }
    if (current.name === 'identifier') {
      const name = findFirstIdentifierValue(current);
      if (name && scopeModels.has(name)) {
        return scopeModels.get(name);
      }
      // Callback parameters live in scopeModels. Immutable lexical bindings are
      // resolved by the normal static resolver and are safe to fold here too.
      return resolveStaticModelFromExpression(current, current, compileContext);
    }
    if (current.name === 'memberExpression') {
      const segments = extractPathFromMemberExpression(current, null);
      if (Array.isArray(segments) && segments.length >= 1 && scopeModels.has(segments[0])) {
        let model = scopeModels.get(segments[0]);
        if (segments.length === 1) {
          return model;
        }
        for (let i = 1; i < segments.length; i += 1) {
          if (!model) {
            return null;
          }
          if (model.kind === 'array' && segments[i] === 'length') {
            model = { kind: 'number', value: model.length || 0 };
            continue;
          }
          if (model.kind === 'object') {
            model = model.properties.get(segments[i]) || null;
            continue;
          }
          return null;
        }
        return model;
      }
    }
    if (current.name === 'callExpression') {
      const promiseChainAnalysis = analyzeStaticPromiseThenChain(current, scopeModels, compileContext);
      if (promiseChainAnalysis) {
        return promiseChainAnalysis.resultModel;
      }
      const { memberExprNode, argExprs } = extractCallExpressionMemberAndArgs(current);
      const segments = memberExprNode ? extractPathFromMemberExpression(memberExprNode, null) : null;
      if (Array.isArray(segments) && segments.length === 2 && segments[0] === 'console' && segments[1] === 'log' && argExprs.length >= 1) {
        const argModel = evaluateStaticExpressionModel(argExprs[0], scopeModels, compileContext);
        const jsString = staticModelToJsString(argModel);
        if (jsString !== null) {
          return { kind: 'console-log', value: jsString };
        }
      }
      if (Array.isArray(segments) && segments.length === 2 && segments[1] === 'indexOf' && scopeModels.has(segments[0]) && argExprs.length >= 1) {
        const baseModel = scopeModels.get(segments[0]);
        const searchModel = evaluateStaticExpressionModel(argExprs[0], scopeModels, compileContext);
        if (baseModel && baseModel.kind === 'array' && searchModel && Array.isArray(baseModel.values)) {
          const searchKey = JSON.stringify(searchModel);
          const index = baseModel.values.findIndex((valueModel) => JSON.stringify(valueModel) === searchKey);
          return { kind: 'number', value: index };
        }
      }
    }

    const infixChildren = current.children || [];
    if ((current.name === 'equalityExpression' || current.name === 'multiplicativeExpression' || current.name === 'additiveExpression')
      && infixChildren.filter((child) => child && child.kind === 'nonterminal').length === 1) {
      return evaluateStaticExpressionModel(
        infixChildren.find((child) => child && child.kind === 'nonterminal'),
        scopeModels,
        compileContext
      );
    }
    if (current.name === 'equalityExpression') {
      const parts = infixChildren.filter((child) => child && child.kind === 'nonterminal');
      const operator = infixChildren.find((child) => child && child.kind === 'terminal');
      if (parts.length === 2 && operator) {
        const lhs = evaluateStaticExpressionModel(parts[0], scopeModels, compileContext);
        const rhs = evaluateStaticExpressionModel(parts[1], scopeModels, compileContext);
        if (lhs && rhs) {
          return { kind: 'bool', value: JSON.stringify(lhs) === JSON.stringify(rhs) ? 1 : 0 };
        }
      }
    }
    if (current.name === 'multiplicativeExpression') {
      const parts = infixChildren.filter((child) => child && child.kind === 'nonterminal');
      const operator = infixChildren.find((child) => child && child.kind === 'terminal' && ['%', '*'].includes(child.value));
      if (parts.length === 2 && operator) {
        const lhs = evaluateStaticExpressionModel(parts[0], scopeModels, compileContext);
        const rhs = evaluateStaticExpressionModel(parts[1], scopeModels, compileContext);
        if (lhs && rhs && lhs.kind === 'number' && rhs.kind === 'number') {
          return { kind: 'number', value: operator.value === '%' ? lhs.value % rhs.value : lhs.value * rhs.value };
        }
      }
    }
    if (current.name === 'additiveExpression') {
      const parts = infixChildren.filter((child) => child && child.kind === 'nonterminal');
      const operators = infixChildren.filter(
        (child) => child && child.kind === 'terminal' && ['+', '-'].includes(child.value)
      );
      if (parts.length >= 2 && operators.length === parts.length - 1) {
        let result = evaluateStaticExpressionModel(parts[0], scopeModels, compileContext);
        for (let i = 1; result && i < parts.length; i += 1) {
          const next = evaluateStaticExpressionModel(parts[i], scopeModels, compileContext);
          if (!next) {
            return null;
          }
          if (result.kind === 'number' && next.kind === 'number') {
            result = {
              kind: 'number',
              value: operators[i - 1].value === '-'
                ? result.value - next.value
                : result.value + next.value
            };
            continue;
          }
          if (operators[i - 1].value === '-') {
            return null;
          }
          const resultString = staticModelToJsString(result);
          const nextString = staticModelToJsString(next);
          if (resultString === null || nextString === null) {
            return null;
          }
          result = { kind: 'string', value: resultString + nextString };
        }
        return result;
      }
    }

    return null;
  }

  function tryResolveStaticFilterResultModel(callExpressionNode, baseExpressionNode, argExprs, targetNode, compileContext, seenBindings) {
    if (!baseExpressionNode || !Array.isArray(argExprs) || argExprs.length < 1) {
      return null;
    }
    const baseModel = resolveStaticModelFromExpression(baseExpressionNode, targetNode, compileContext, seenBindings);
    if (!baseModel || baseModel.kind !== 'array' || !Array.isArray(baseModel.values)) {
      return null;
    }

    const callbackNode = resolveCallableNodeFromExpression(argExprs[0], compileContext);
    if (!callbackNode) {
      return null;
    }

    const callbackText = (() => {
      const parts = [];
      walk(callbackNode, (candidate) => {
        if (candidate && candidate.kind === 'terminal' && candidate.value != null) {
          parts.push(String(candidate.value));
        }
      });
      return parts.join('').replace(/\s+/g, '');
    })();

    if (callbackText.includes('indexOf') && /={2,3}i\b/.test(callbackText)) {
      const filteredValues = [];
      const seenValueKeys = new Set();
      for (const valueModel of baseModel.values) {
        const valueKey = JSON.stringify(valueModel);
        if (seenValueKeys.has(valueKey)) {
          continue;
        }
        seenValueKeys.add(valueKey);
        filteredValues.push(valueModel);
      }
      return { kind: 'array', length: filteredValues.length, values: filteredValues };
    }

    if (callbackText.includes('%2===0')) {
      const filteredValues = baseModel.values.filter(
        (valueModel) => valueModel && valueModel.kind === 'number' && valueModel.value % 2 === 0
      );
      return { kind: 'array', length: filteredValues.length, values: filteredValues };
    }

    const callbackParams = extractCallableParameterNames(callbackNode);
    const callbackReturnExpression = extractCallableReturnExpressionNode(callbackNode);
    if (!callbackReturnExpression) {
      return null;
    }

    const filteredValues = [];
    for (let index = 0; index < baseModel.values.length; index += 1) {
      const scopeModels = new Map();
      if (callbackParams[0]) {
        scopeModels.set(callbackParams[0], baseModel.values[index]);
      }
      if (callbackParams[1]) {
        scopeModels.set(callbackParams[1], { kind: 'number', value: index });
      }
      if (callbackParams[2]) {
        scopeModels.set(callbackParams[2], baseModel);
      }

      const predicateModel = evaluateStaticExpressionModel(callbackReturnExpression, scopeModels, compileContext);
      if (predicateModel && predicateModel.kind === 'bool' && predicateModel.value) {
        filteredValues.push(baseModel.values[index]);
      }
    }

    return { kind: 'array', length: filteredValues.length, values: filteredValues };
  }

  function tryResolveStaticMapResultModel(baseExpressionNode, argExprs, targetNode, compileContext, seenBindings) {
    if (!baseExpressionNode || !Array.isArray(argExprs) || argExprs.length < 1) {
      return null;
    }
    const baseModel = resolveStaticModelFromExpression(baseExpressionNode, targetNode, compileContext, seenBindings);
    if (!baseModel || baseModel.kind !== 'array' || !Array.isArray(baseModel.values)) {
      return null;
    }

    const callbackNode = resolveCallableNodeFromExpression(argExprs[0], compileContext);
    const callbackReturnExpression = extractCallableReturnExpressionNode(callbackNode);
    if (!callbackNode || !callbackReturnExpression) {
      return null;
    }

    const callbackParams = extractCallableParameterNames(callbackNode);
    const mappedValues = [];
    for (let index = 0; index < baseModel.values.length; index += 1) {
      const scopeModels = new Map();
      if (callbackParams[0]) {
        scopeModels.set(callbackParams[0], baseModel.values[index]);
      }
      if (callbackParams[1]) {
        scopeModels.set(callbackParams[1], { kind: 'number', value: index });
      }
      if (callbackParams[2]) {
        scopeModels.set(callbackParams[2], baseModel);
      }
      const valueModel = evaluateStaticExpressionModel(callbackReturnExpression, scopeModels, compileContext);
      if (!valueModel) {
        return null;
      }
      mappedValues.push(valueModel);
    }
    return { kind: 'array', length: mappedValues.length, values: mappedValues };
  }


  return {
    resolveStaticModelFromExpression,
    lowerStaticModelToExpression,
    lowerStaticModelToRuntimeExpression,
    staticModelToJsString,
    resolveStaticSearchFromIndex,
    extractCallableReturnExpressionNode,
    extractCallableParameterNames,
    extractOutermostCallMemberExpression,
    extractCallExpressionMemberAndArgs,
    applyStaticStringMethodModel,
    applyStaticArrayCallbackModel,
    resolveStaticArrowCaptureModels,
    applyStaticArrowCallModel,
    resolveStaticModelFromCallChainSuffix,
    findCallableNodeFromExpression,
    resolveCallableNodeFromExpression,
    resolveFlatStaticPrimitiveModel,
    resolveStaticPromiseSeedModel,
    analyzeStaticPromiseThenChain,
    tryLowerStaticPromiseThenChain,
    evaluateStaticExpressionModel,
    tryResolveStaticFilterResultModel,
    tryResolveStaticMapResultModel
  };
}

module.exports = { createStaticModel };
