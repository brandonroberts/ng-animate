"use strict";
var exceptions_1 = require('../facade/exceptions');
var collection_1 = require('../facade/collection');
var lang_1 = require('../facade/lang');
var identifiers_1 = require('../identifiers');
var o = require('../output/output_ast');
var core_private_1 = require('../../core_private');
var animation_parser_1 = require('./animation_parser');
var animation_ast_1 = require('./animation_ast');
var CompiledAnimation = (function () {
    function CompiledAnimation(name, fnStatement, fnVariable) {
        this.name = name;
        this.fnStatement = fnStatement;
        this.fnVariable = fnVariable;
    }
    return CompiledAnimation;
}());
exports.CompiledAnimation = CompiledAnimation;
var AnimationCompiler = (function () {
    function AnimationCompiler() {
    }
    AnimationCompiler.prototype.compileComponent = function (component) {
        var compiledAnimations = [];
        var index = 0;
        component.template.animations.forEach(function (entry) {
            var result = animation_parser_1.parseAnimationEntry(entry);
            if (result.errors.length > 0) {
                var errorMessage = '';
                result.errors.forEach(function (error) { errorMessage += "\n- " + error.msg; });
                // todo (matsko): include the component name when throwing
                throw new exceptions_1.BaseException(("Unable to parse the animation sequence for \"" + entry.name + "\" due to the following errors: ") +
                    errorMessage);
            }
            var factoryName = component.type.name + "_" + entry.name + "_" + index;
            index++;
            var visitor = new _AnimationBuilder(entry.name, factoryName);
            compiledAnimations.push(visitor.build(result.ast));
        });
        return compiledAnimations;
    };
    return AnimationCompiler;
}());
exports.AnimationCompiler = AnimationCompiler;
var _AnimationStyleStepState;
(function (_AnimationStyleStepState) {
    _AnimationStyleStepState[_AnimationStyleStepState["FirstStateChangeStartingStyles"] = 0] = "FirstStateChangeStartingStyles";
    _AnimationStyleStepState[_AnimationStyleStepState["FinalStateChangeStartingStyles"] = 1] = "FinalStateChangeStartingStyles";
    _AnimationStyleStepState[_AnimationStyleStepState["FinalStateChangeKeyframeStyles"] = 2] = "FinalStateChangeKeyframeStyles";
    _AnimationStyleStepState[_AnimationStyleStepState["InsideKeyframeSequence"] = 3] = "InsideKeyframeSequence";
    _AnimationStyleStepState[_AnimationStyleStepState["NormalStyles"] = 4] = "NormalStyles";
})(_AnimationStyleStepState || (_AnimationStyleStepState = {}));
var _ANIMATION_VOID_STATE_VALUE = o.literal('void');
var _ANIMATION_STYLE_UTIL = o.importExpr(identifiers_1.Identifiers.AnimationStyleUtil);
var _ANIMATION_FACTORY_ELEMENT_VAR = o.variable('element');
var _ANIMATION_FACTORY_VIEW_VAR = o.variable('view');
var _ANIMATION_FACTORY_RENDERER_VAR = _ANIMATION_FACTORY_VIEW_VAR.prop('renderer');
var _ANIMATION_CURRENT_STATE_VAR = o.variable('currentState');
var _ANIMATION_NEXT_STATE_VAR = o.variable('nextState');
var _ANIMATION_PLAYER_VAR = o.variable('player');
var _ANIMATION_START_STATE_STYLES_VAR = o.variable('startStateStyles');
var _ANIMATION_FINAL_STATE_STYLES_VAR = o.variable('finalStateStyles');
var _ANIMATION_STYLES_LOOKUP = o.variable('animationStateStyles');
var _ANIMATION_COLLECTED_STYLES = o.variable('collectedStyles');
var _AnimationBuilder = (function () {
    function _AnimationBuilder(animationName, factoryName) {
        this.animationName = animationName;
        this.factoryName = factoryName;
    }
    _AnimationBuilder.prototype.visitAnimationStyles = function (ast, context) {
        var stylesArr = [];
        if (context.styleState == _AnimationStyleStepState.FirstStateChangeStartingStyles) {
            stylesArr.push(_ANIMATION_START_STATE_STYLES_VAR);
        }
        ast.styles.forEach(function (entry) {
            stylesArr.push(o.literalMap(collection_1.StringMapWrapper.keys(entry).map(function (key) { return [key, o.literal(entry[key])]; })));
        });
        return o.importExpr(identifiers_1.Identifiers.AnimationStyles).instantiate([
            _ANIMATION_STYLE_UTIL.callMethod('collectAndResolveStyles', [
                _ANIMATION_COLLECTED_STYLES,
                o.literalArr(stylesArr)
            ])
        ]);
    };
    _AnimationBuilder.prototype.visitAnimationKeyframe = function (ast, context) {
        return o.importExpr(identifiers_1.Identifiers.AnimationKeyframe).instantiate([
            o.literal(ast.offset),
            ast.styles.visit(this, context)
        ]);
    };
    _AnimationBuilder.prototype.visitAnimationStep = function (ast, context) {
        var _this = this;
        if (!lang_1.isPresent(context.finalAnimateStepAst) && ast.keyframes.length > 0) {
            context.finalAnimateStepAst = ast;
            context.styleState = _AnimationStyleStepState.FirstStateChangeStartingStyles;
        }
        if (context.finalAnimateStepAst === ast && ast.keyframes[0].styles.styles.length == 1) {
            var astStyles = ast.keyframes[0].styles.styles[0];
            if (collection_1.StringMapWrapper.isEmpty(astStyles)) {
                return this._visitFinalAnimationStep(ast, context);
            }
        }
        var startingStylesExpr = ast.startingStyles.visit(this, context);
        var totalKeyframes = ast.keyframes.length;
        if (totalKeyframes > 2) {
            context.styleState = _AnimationStyleStepState.InsideKeyframeSequence;
        }
        else if (context.styleState == _AnimationStyleStepState.FirstStateChangeStartingStyles) {
            context.styleState = _AnimationStyleStepState.NormalStyles;
        }
        var keyframes = ast.keyframes.map(function (keyframeEntry) { return keyframeEntry.visit(_this, context); });
        context.styleState = _AnimationStyleStepState.NormalStyles;
        var keyframesExpr = o.literalArr(keyframes);
        return this._callAnimateMethod(ast, startingStylesExpr, keyframesExpr);
    };
    _AnimationBuilder.prototype._visitFinalAnimationStep = function (ast, context) {
        var _this = this;
        context.styleState = _AnimationStyleStepState.FinalStateChangeStartingStyles;
        var startingStylesExpr = ast.startingStyles.visit(this, context);
        context.styleState = _AnimationStyleStepState.FinalStateChangeKeyframeStyles;
        var keyframeExpressions = ast.keyframes.map(function (keyframe) {
            return keyframe.visit(_this, context);
        });
        context.styleState = _AnimationStyleStepState.FinalStateChangeKeyframeStyles;
        var keyframesExpr = _ANIMATION_STYLE_UTIL.callMethod('balanceKeyframes', [
            _ANIMATION_COLLECTED_STYLES,
            _ANIMATION_FINAL_STATE_STYLES_VAR,
            o.literalArr(keyframeExpressions)
        ]);
        return this._callAnimateMethod(ast, startingStylesExpr, keyframesExpr);
    };
    _AnimationBuilder.prototype._callAnimateMethod = function (ast, startingStylesExpr, keyframesExpr) {
        return _ANIMATION_FACTORY_RENDERER_VAR.callMethod('animate', [
            _ANIMATION_FACTORY_ELEMENT_VAR,
            startingStylesExpr,
            keyframesExpr,
            o.literal(ast.duration),
            o.literal(ast.delay),
            o.literal(ast.easing)
        ]);
    };
    _AnimationBuilder.prototype.visitAnimationSequence = function (ast, context) {
        var _this = this;
        if (!lang_1.isPresent(context.finalAnimateStepAst)) {
            context.finalAnimateStepAst = ast.steps[ast.steps.length - 1];
            context.styleState = _AnimationStyleStepState.FirstStateChangeStartingStyles;
        }
        var playerExprs = ast.steps.map(function (step) { return step.visit(_this, context); });
        return o.importExpr(identifiers_1.Identifiers.AnimationSequencePlayer).instantiate([
            o.literalArr(playerExprs)]);
    };
    _AnimationBuilder.prototype.visitAnimationGroup = function (ast, context) {
        var _this = this;
        var playerExprs = ast.steps.map(function (step) { return step.visit(_this, context); });
        return o.importExpr(identifiers_1.Identifiers.AnimationGroupPlayer).instantiate([
            o.literalArr(playerExprs)]);
    };
    _AnimationBuilder.prototype.visitAnimationStateDeclaration = function (ast, context) {
        var flatStyles = {};
        ast.styles.styles.forEach(function (entry) {
            collection_1.StringMapWrapper.forEach(entry, function (value, key) {
                flatStyles[key] = value;
            });
        });
        context.stateMap.registerState(ast.stateName, flatStyles);
    };
    _AnimationBuilder.prototype.visitAnimationStateTransition = function (ast, context) {
        context.finalAnimateStepAst = null;
        var playerExpr = ast.animation.visit(this, context);
        var precondition = _ANIMATION_PLAYER_VAR.equals(o.NULL_EXPR);
        if (ast.fromState == core_private_1.ANY_STATE && ast.toState == core_private_1.ANY_STATE) {
            context.fullAnyStateDetected = true;
        }
        else {
            if (ast.fromState != core_private_1.ANY_STATE) {
                precondition = precondition.and(_compareToAnimationStateExpr(_ANIMATION_CURRENT_STATE_VAR, ast.fromState));
                context.stateMap.registerState(ast.fromState);
            }
            if (ast.toState != core_private_1.ANY_STATE) {
                precondition = precondition.and(_compareToAnimationStateExpr(_ANIMATION_NEXT_STATE_VAR, ast.toState));
                context.stateMap.registerState(ast.toState);
            }
        }
        return new o.IfStmt(precondition, [
            _ANIMATION_PLAYER_VAR.set(playerExpr).toStmt()
        ]);
    };
    _AnimationBuilder.prototype.visitAnimationEntry = function (ast, context) {
        var _this = this;
        var EMPTY_MAP = o.literalMap([]);
        var statements = [];
        var transitionStatements = [];
        ast.definitions.forEach(function (def) {
            var result = def.visit(_this, context);
            // the declaration state will be applied later
            if (!(def instanceof animation_ast_1.AnimationStateDeclarationAst)) {
                transitionStatements.push(result);
            }
        });
        var lookupMap = [];
        collection_1.StringMapWrapper.forEach(context.stateMap.states, function (value, stateName) {
            var variableValue = EMPTY_MAP;
            if (lang_1.isPresent(value)) {
                var styleMap_1 = [];
                collection_1.StringMapWrapper.forEach(value, function (value, key) {
                    styleMap_1.push([key, o.literal(value)]);
                });
                variableValue = o.literalMap(styleMap_1);
            }
            lookupMap.push([stateName, variableValue]);
        });
        statements.push(_ANIMATION_STYLES_LOOKUP.set(o.literalMap(lookupMap)).toDeclStmt());
        statements.push(_ANIMATION_COLLECTED_STYLES.set(EMPTY_MAP).toDeclStmt());
        statements.push(_ANIMATION_PLAYER_VAR.set(o.NULL_EXPR).toDeclStmt());
        // it's important to normalize the void value as `void` explicitly
        // so that the styles data can be obtained from the stringmap
        statements.push(
        // void => ...
        new o.IfStmt(_ANIMATION_CURRENT_STATE_VAR.equals(o.importExpr(identifiers_1.Identifiers.uninitialized)), [
            _ANIMATION_CURRENT_STATE_VAR.set(_ANIMATION_VOID_STATE_VALUE).toStmt()
        ]), 
        // ... => void
        new o.IfStmt(_ANIMATION_NEXT_STATE_VAR.equals(o.importExpr(identifiers_1.Identifiers.uninitialized)), [
            _ANIMATION_NEXT_STATE_VAR.set(_ANIMATION_VOID_STATE_VALUE).toStmt()
        ]));
        statements.push(_ANIMATION_START_STATE_STYLES_VAR.set(_ANIMATION_STYLES_LOOKUP.key(_ANIMATION_CURRENT_STATE_VAR)).toDeclStmt());
        statements.push(_ANIMATION_FINAL_STATE_STYLES_VAR.set(_ANIMATION_STYLES_LOOKUP.key(_ANIMATION_NEXT_STATE_VAR)).toDeclStmt());
        // before we start any animation we want to clear out the starting
        // styles from the element's style property (since they were placed
        // there at the end of the last animation
        statements.push(_ANIMATION_FACTORY_RENDERER_VAR.callMethod('setElementStyles', [
            _ANIMATION_FACTORY_ELEMENT_VAR,
            _ANIMATION_STYLE_UTIL.callMethod('clearStyles', [_ANIMATION_START_STATE_STYLES_VAR]),
        ]).toStmt());
        collection_1.ListWrapper.addAll(statements, transitionStatements);
        // in the situation where a any to any state transition (* => *) has
        // not occurred then we should create a NoOp player so that the onDone
        // callback can be used for tracking
        if (!context.fullAnyStateDetected) {
            statements.push(new o.IfStmt(_ANIMATION_PLAYER_VAR.equals(o.NULL_EXPR), [
                _ANIMATION_PLAYER_VAR.set(o.importExpr(identifiers_1.Identifiers.NoOpAnimationPlayer).instantiate([])).toStmt()
            ]));
        }
        // once complete we want to apply the styles on the element
        // since the destination state's values should persist once
        // the animation sequence has completed.
        statements.push(_ANIMATION_PLAYER_VAR.callMethod('onDone', [
            o.fn([], [
                _ANIMATION_FACTORY_RENDERER_VAR.callMethod('setElementStyles', [
                    _ANIMATION_FACTORY_ELEMENT_VAR,
                    _ANIMATION_STYLE_UTIL.callMethod('balanceStyles', [
                        _ANIMATION_START_STATE_STYLES_VAR,
                        _ANIMATION_FINAL_STATE_STYLES_VAR
                    ])
                ]).toStmt()
            ])
        ]).toStmt());
        statements.push(_ANIMATION_FACTORY_VIEW_VAR.callMethod('registerActiveAnimation', [_ANIMATION_PLAYER_VAR]).toStmt());
        statements.push(_ANIMATION_PLAYER_VAR.callMethod('play', []).toStmt());
        statements.push(new o.ReturnStatement(_ANIMATION_PLAYER_VAR));
        return o.fn([
            new o.FnParam(_ANIMATION_FACTORY_VIEW_VAR.name, o.importType(identifiers_1.Identifiers.AppView)),
            new o.FnParam(_ANIMATION_FACTORY_ELEMENT_VAR.name, o.DYNAMIC_TYPE),
            new o.FnParam(_ANIMATION_CURRENT_STATE_VAR.name, o.DYNAMIC_TYPE),
            new o.FnParam(_ANIMATION_NEXT_STATE_VAR.name, o.DYNAMIC_TYPE)
        ], statements);
    };
    _AnimationBuilder.prototype.build = function (ast) {
        var context = new _AnimationBuilderContext();
        var fnStatement = ast.visit(this, context).toDeclStmt(this.factoryName);
        var fnVariable = o.variable(this.factoryName);
        return new CompiledAnimation(this.animationName, fnStatement, fnVariable);
    };
    return _AnimationBuilder;
}());
var _AnimationBuilderContext = (function () {
    function _AnimationBuilderContext() {
        this.stateMap = new _AnimationBuilderStateMap();
        this.fullAnyStateDetected = false;
    }
    return _AnimationBuilderContext;
}());
var _AnimationBuilderStateMap = (function () {
    function _AnimationBuilderStateMap() {
        this._states = {};
    }
    Object.defineProperty(_AnimationBuilderStateMap.prototype, "states", {
        get: function () { return this._states; },
        enumerable: true,
        configurable: true
    });
    _AnimationBuilderStateMap.prototype.registerState = function (name, value) {
        if (value === void 0) { value = null; }
        var existingEntry = this._states[name];
        if (lang_1.isBlank(existingEntry)) {
            this._states[name] = value;
        }
    };
    return _AnimationBuilderStateMap;
}());
function _compareToAnimationStateExpr(value, animationState) {
    var compareValue = animationState == core_private_1.EMPTY_STATE ? _ANIMATION_VOID_STATE_VALUE : o.literal(animationState);
    return value.equals(compareValue);
}
//# sourceMappingURL=animation_compiler.js.map