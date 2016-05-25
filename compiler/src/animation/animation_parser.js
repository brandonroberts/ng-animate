"use strict";
var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
var collection_1 = require('../facade/collection');
var math_1 = require('../facade/math');
var lang_1 = require('../facade/lang');
var core_private_1 = require('../../core_private');
var compile_metadata_1 = require('../compile_metadata');
var animation_ast_1 = require('./animation_ast');
var styles_collection_1 = require('./styles_collection');
var parse_util_1 = require('../parse_util');
var _INITIAL_KEYFRAME = 0;
var _TERMINAL_KEYFRAME = 1;
var _ONE_SECOND = 1000;
var AnimationParseError = (function (_super) {
    __extends(AnimationParseError, _super);
    function AnimationParseError(message) {
        _super.call(this, null, message);
    }
    AnimationParseError.prototype.toString = function () { return "" + this.msg; };
    return AnimationParseError;
}(parse_util_1.ParseError));
exports.AnimationParseError = AnimationParseError;
var ParsedAnimationResult = (function () {
    function ParsedAnimationResult(ast, errors) {
        this.ast = ast;
        this.errors = errors;
    }
    return ParsedAnimationResult;
}());
exports.ParsedAnimationResult = ParsedAnimationResult;
function parseAnimationEntry(entry) {
    var errors = [];
    var stateStyles = {};
    var definitions = [];
    var transitions = [];
    entry.definitions.forEach(function (def) {
        if (def instanceof compile_metadata_1.CompileAnimationStateDeclarationMetadata) {
            var stateAst = _parseAnimationStateDeclaration(def, errors);
            definitions.push(stateAst);
            stateStyles[stateAst.stateName] = stateAst.styles;
        }
        else {
            transitions.push(def);
        }
    });
    transitions.forEach(function (transDef) {
        var transAst = _parseAnimationStateTransition(transDef, stateStyles, errors);
        definitions.push(transAst);
    });
    var ast = new animation_ast_1.AnimationEntryAst(entry.name, definitions);
    return new ParsedAnimationResult(ast, errors);
}
exports.parseAnimationEntry = parseAnimationEntry;
function _parseAnimationStateDeclaration(stateMetadata, errors) {
    var styleValues = [];
    stateMetadata.styles.styles.forEach(function (stylesEntry) {
        // TODO (matsko): change this when we get CSS class integration support
        if (lang_1.isStringMap(stylesEntry)) {
            styleValues.push(stylesEntry);
        }
        else {
            errors.push(new AnimationParseError("State based animations cannot contain references to other states"));
        }
    });
    var defStyles = new animation_ast_1.AnimationStylesAst(styleValues);
    return new animation_ast_1.AnimationStateDeclarationAst(stateMetadata.stateName, defStyles);
}
function _parseAnimationStateTransition(transitionStateMetadata, stateStyles, errors) {
    var styles = new styles_collection_1.StylesCollection();
    var transitionExpr = _parseAnimationTransitionExpr(transitionStateMetadata.stateChangeExpr, errors);
    var entry = _normalizeAnimationEntry(transitionStateMetadata.animation);
    var animation = _normalizeStyleSteps(entry, stateStyles, errors);
    var animationAst = _parseTransitionAnimation(animation, 0, styles, stateStyles, errors);
    if (errors.length == 0) {
        _fillAnimationAstStartingKeyframes(animationAst, styles, errors);
    }
    return new animation_ast_1.AnimationStateTransitionAst(transitionExpr.fromState, transitionExpr.toState, animationAst);
}
var _ParsedTransitionExprResult = (function () {
    function _ParsedTransitionExprResult(fromState, toState) {
        this.fromState = fromState;
        this.toState = toState;
    }
    return _ParsedTransitionExprResult;
}());
function _parseAnimationTransitionExpr(eventStr, errors) {
    var stateTokens = eventStr.split(/\s*[=-]>\s*/g);
    if (!lang_1.isPresent(stateTokens) || stateTokens.length < 2) {
        errors.push(new AnimationParseError("the provided " + eventStr + " is not of a supported format"));
    }
    return new _ParsedTransitionExprResult(stateTokens[0], stateTokens[1]);
}
function _fetchSylesFromState(stateName, stateStyles) {
    var entry = stateStyles[stateName];
    if (lang_1.isPresent(entry)) {
        var styles = entry.styles;
        return new compile_metadata_1.CompileAnimationStyleMetadata(0, styles);
    }
    return null;
}
function _normalizeAnimationEntry(entry) {
    return lang_1.isArray(entry)
        ? new compile_metadata_1.CompileAnimationSequenceMetadata(entry)
        : entry;
}
function _normalizeStyleMetadata(entry, stateStyles, errors) {
    var normalizedStyles = [];
    entry.styles.forEach(function (styleEntry) {
        if (lang_1.isString(styleEntry)) {
            collection_1.ListWrapper.addAll(normalizedStyles, _resolveStylesFromState(styleEntry, stateStyles, errors));
        }
        else {
            normalizedStyles.push(styleEntry);
        }
    });
    return normalizedStyles;
}
function _normalizeStyleSteps(entry, stateStyles, errors) {
    var steps = _normalizeStyleStepEntry(entry, stateStyles, errors);
    if (steps.length == 1 && steps[0] instanceof compile_metadata_1.CompileAnimationAnimateMetadata) {
        return steps[0];
    }
    return new compile_metadata_1.CompileAnimationSequenceMetadata(steps);
}
function _mergeAnimationStyles(stylesList, newItem) {
    if (lang_1.isStringMap(newItem) && stylesList.length > 0) {
        var lastIndex = stylesList.length - 1;
        var lastItem = stylesList[lastIndex];
        if (lang_1.isStringMap(lastItem)) {
            stylesList[lastIndex] = collection_1.StringMapWrapper.merge(lastItem, newItem);
            return;
        }
    }
    stylesList.push(newItem);
}
function _normalizeStyleStepEntry(entry, stateStyles, errors) {
    var steps;
    if (entry instanceof compile_metadata_1.CompileAnimationWithStepsMetadata) {
        steps = entry.steps;
    }
    else {
        return [entry];
    }
    var newSteps = [];
    var combinedStyles;
    steps.forEach(function (step) {
        if (step instanceof compile_metadata_1.CompileAnimationStyleMetadata) {
            // this occurs when a style step is followed by a previous style step
            // or when the first style step is run. We want to concatenate all subsequent
            // style steps together into a single style step such that we have the correct
            // starting keyframe data to pass into the animation player.
            if (!lang_1.isPresent(combinedStyles)) {
                combinedStyles = [];
            }
            _normalizeStyleMetadata(step, stateStyles, errors).forEach(function (entry) {
                _mergeAnimationStyles(combinedStyles, entry);
            });
        }
        else {
            // it is important that we create a metadata entry of the combined styles
            // before we go on an process the animate, sequence or group metadata steps.
            // This will ensure that the AST will have the previous styles painted on
            // screen before any further animations that use the styles take place.
            if (lang_1.isPresent(combinedStyles)) {
                newSteps.push(new compile_metadata_1.CompileAnimationStyleMetadata(0, combinedStyles));
                combinedStyles = null;
            }
            if (step instanceof compile_metadata_1.CompileAnimationAnimateMetadata) {
                // we do not recurse into CompileAnimationAnimateMetadata since
                // those style steps are not going to be squashed
                var animateStyleValue = step.styles;
                if (animateStyleValue instanceof compile_metadata_1.CompileAnimationStyleMetadata) {
                    animateStyleValue.styles = _normalizeStyleMetadata(animateStyleValue, stateStyles, errors);
                }
                else if (animateStyleValue instanceof compile_metadata_1.CompileAnimationKeyframesSequenceMetadata) {
                    animateStyleValue.steps.forEach(function (step) {
                        step.styles = _normalizeStyleMetadata(step, stateStyles, errors);
                    });
                }
            }
            else if (step instanceof compile_metadata_1.CompileAnimationWithStepsMetadata) {
                var innerSteps = _normalizeStyleStepEntry(step, stateStyles, errors);
                step = step instanceof compile_metadata_1.CompileAnimationGroupMetadata
                    ? new compile_metadata_1.CompileAnimationGroupMetadata(innerSteps)
                    : new compile_metadata_1.CompileAnimationSequenceMetadata(innerSteps);
            }
            newSteps.push(step);
        }
    });
    // this happens when only styles were animated within the sequence
    if (lang_1.isPresent(combinedStyles)) {
        newSteps.push(new compile_metadata_1.CompileAnimationStyleMetadata(0, combinedStyles));
    }
    return newSteps;
}
function _resolveStylesFromState(stateName, stateStyles, errors) {
    var styles = [];
    if (stateName[0] != ':') {
        errors.push(new AnimationParseError("Animation states via styles must be prefixed with a \":\""));
    }
    else {
        var normalizedStateName = stateName.substring(1);
        var value = stateStyles[normalizedStateName];
        if (!lang_1.isPresent(value)) {
            errors.push(new AnimationParseError("Unable to apply styles due to missing a state " + normalizedStateName));
        }
        else {
            value.styles.forEach(function (stylesEntry) {
                if (lang_1.isStringMap(stylesEntry)) {
                    styles.push(stylesEntry);
                }
            });
        }
    }
    return styles;
}
var _AnimationTimings = (function () {
    function _AnimationTimings(duration, delay, easing) {
        this.duration = duration;
        this.delay = delay;
        this.easing = easing;
    }
    return _AnimationTimings;
}());
function _parseAnimationKeyframes(keyframeSequence, currentTime, collectedStyles, stateStyles, errors) {
    var totalEntries = keyframeSequence.steps.length;
    var totalOffsets = 0;
    keyframeSequence.steps.forEach(function (step) {
        totalOffsets += lang_1.isPresent(step.offset) ? 1 : 0;
    });
    if (totalOffsets > 0 && totalOffsets < totalEntries) {
        errors.push(new AnimationParseError("Not all style() entries contain an offset for the provided keyframe()"));
        totalOffsets = totalEntries;
    }
    var limit = totalEntries - 1;
    var margin = totalOffsets == 0 ? (1 / limit) : 0;
    var keyframes = [];
    var index = 0;
    var doSortKeyframes = false;
    var lastOffset = 0;
    keyframeSequence.steps.forEach(function (styleMetadata) {
        var offset = styleMetadata.offset;
        var keyframeStyles = styleMetadata.styles.map(function (entry) {
            var styles = {};
            collection_1.StringMapWrapper.forEach(entry, function (value, prop) {
                if (prop != 'offset') {
                    styles[prop] = value;
                }
            });
            return styles;
        });
        if (lang_1.isPresent(offset)) {
            doSortKeyframes = doSortKeyframes || (offset < lastOffset);
        }
        else {
            offset = index == limit ? _TERMINAL_KEYFRAME : (margin * index);
        }
        var keyframe = new animation_ast_1.AnimationKeyframeAst(offset, new animation_ast_1.AnimationStylesAst(keyframeStyles));
        keyframes.push(keyframe);
        lastOffset = offset;
        index++;
    });
    if (doSortKeyframes) {
        collection_1.ListWrapper.sort(keyframes, function (a, b) { return a.offset <= b.offset ? -1 : 1; });
    }
    return keyframes;
}
function _parseTransitionAnimation(entry, currentTime, collectedStyles, stateStyles, errors) {
    var ast;
    var playTime = 0;
    var startingTime = currentTime;
    if (entry instanceof compile_metadata_1.CompileAnimationWithStepsMetadata) {
        var maxDuration = 0;
        var steps = [];
        var isGroup = entry instanceof compile_metadata_1.CompileAnimationGroupMetadata;
        var previousStyles;
        entry.steps.forEach(function (entry) {
            // these will get picked up by the next step...
            var time = isGroup ? startingTime : currentTime;
            if (entry instanceof compile_metadata_1.CompileAnimationStyleMetadata) {
                entry.styles.forEach(function (stylesEntry) {
                    // by this point we know that we only have stringmap values
                    var map = stylesEntry;
                    collection_1.StringMapWrapper.forEach(map, function (value, prop) {
                        collectedStyles.insertAtTime(prop, time, value);
                    });
                });
                previousStyles = entry.styles;
                return;
            }
            var innerAst = _parseTransitionAnimation(entry, time, collectedStyles, stateStyles, errors);
            if (lang_1.isPresent(previousStyles)) {
                if (entry instanceof compile_metadata_1.CompileAnimationWithStepsMetadata) {
                    var startingStyles = new animation_ast_1.AnimationStylesAst(previousStyles);
                    steps.push(new animation_ast_1.AnimationStepAst(startingStyles, [], 0, 0, ''));
                }
                else {
                    var innerStep = innerAst;
                    collection_1.ListWrapper.addAll(innerStep.startingStyles.styles, previousStyles);
                }
                previousStyles = null;
            }
            var astDuration = innerAst.playTime;
            currentTime += astDuration;
            playTime += astDuration;
            maxDuration = math_1.Math.max(astDuration, maxDuration);
            steps.push(innerAst);
        });
        if (lang_1.isPresent(previousStyles)) {
            var startingStyles = new animation_ast_1.AnimationStylesAst(previousStyles);
            steps.push(new animation_ast_1.AnimationStepAst(startingStyles, [], 0, 0, ''));
        }
        if (isGroup) {
            ast = new animation_ast_1.AnimationGroupAst(steps);
            playTime = maxDuration;
            currentTime = startingTime + playTime;
        }
        else {
            ast = new animation_ast_1.AnimationSequenceAst(steps);
        }
    }
    else if (entry instanceof compile_metadata_1.CompileAnimationAnimateMetadata) {
        var timings = _parseTimeExpression(entry.timings, errors);
        var styles = entry.styles;
        var keyframes;
        if (styles instanceof compile_metadata_1.CompileAnimationKeyframesSequenceMetadata) {
            keyframes = _parseAnimationKeyframes(styles, currentTime, collectedStyles, stateStyles, errors);
        }
        else {
            var styleData = styles;
            var offset = _TERMINAL_KEYFRAME;
            var styleAst = new animation_ast_1.AnimationStylesAst(styleData.styles);
            var keyframe = new animation_ast_1.AnimationKeyframeAst(offset, styleAst);
            keyframes = [keyframe];
        }
        ast = new animation_ast_1.AnimationStepAst(new animation_ast_1.AnimationStylesAst([]), keyframes, timings.duration, timings.delay, timings.easing);
        playTime = timings.duration + timings.delay;
        currentTime += playTime;
        keyframes.forEach(function (keyframe) {
            return keyframe.styles.styles.forEach(function (entry) {
                return collection_1.StringMapWrapper.forEach(entry, function (value, prop) {
                    return collectedStyles.insertAtTime(prop, currentTime, value);
                });
            });
        });
    }
    else {
        // if the code reaches this stage then an error
        // has already been populated within the _normalizeStyleSteps()
        // operation...
        ast = new animation_ast_1.AnimationStepAst(null, [], 0, 0, '');
    }
    ast.playTime = playTime;
    ast.startTime = startingTime;
    return ast;
}
function _fillAnimationAstStartingKeyframes(ast, collectedStyles, errors) {
    // steps that only contain style will not be filled
    if ((ast instanceof animation_ast_1.AnimationStepAst) && ast.keyframes.length > 0) {
        var keyframes = ast.keyframes;
        if (keyframes.length == 1) {
            var endKeyframe = keyframes[0];
            var startKeyframe = _createStartKeyframeFromEndKeyframe(endKeyframe, ast.startTime, ast.playTime, collectedStyles, errors);
            ast.keyframes = [startKeyframe, endKeyframe];
        }
    }
    else if (ast instanceof animation_ast_1.AnimationWithStepsAst) {
        ast.steps.forEach(function (entry) { return _fillAnimationAstStartingKeyframes(entry, collectedStyles, errors); });
    }
}
function _parseTimeExpression(exp, errors) {
    var regex = /^([\.\d]+)(m?s)(?:\s+([\.\d]+)(m?s))?(?:\s+([-a-z]+))?/gi;
    var duration;
    var delay = 0;
    var easing = null;
    if (lang_1.isString(exp)) {
        var matches = lang_1.RegExpWrapper.firstMatch(regex, exp);
        if (!lang_1.isPresent(matches)) {
            errors.push(new AnimationParseError("The provided timing value \"" + exp + "\" is invalid."));
            return new _AnimationTimings(0, 0, null);
        }
        var durationMatch = lang_1.NumberWrapper.parseFloat(matches[1]);
        var durationUnit = matches[2];
        if (durationUnit == 's') {
            durationMatch *= _ONE_SECOND;
        }
        duration = math_1.Math.floor(durationMatch);
        var delayMatch = matches[3];
        var delayUnit = matches[4];
        if (lang_1.isPresent(delayMatch)) {
            var delayVal = lang_1.NumberWrapper.parseFloat(delayMatch);
            if (lang_1.isPresent(delayUnit) && delayUnit == 's') {
                delayVal *= _ONE_SECOND;
            }
            delay = math_1.Math.floor(delayVal);
        }
        var easingVal = matches[5];
        if (!lang_1.isBlank(easingVal)) {
            easing = easingVal;
        }
    }
    else {
        duration = exp;
    }
    return new _AnimationTimings(duration, delay, easing);
}
function _createStartKeyframeFromEndKeyframe(endKeyframe, startTime, duration, collectedStyles, errors) {
    var values = {};
    var endTime = startTime + duration;
    endKeyframe.styles.styles.forEach(function (styleData) {
        collection_1.StringMapWrapper.forEach(styleData, function (val, prop) {
            if (prop == 'offset')
                return;
            var resultIndex = collectedStyles.indexOfAtOrBeforeTime(prop, startTime);
            var resultEntry, nextEntry, value;
            if (lang_1.isPresent(resultIndex)) {
                resultEntry = collectedStyles.getByIndex(prop, resultIndex);
                value = resultEntry.value;
                nextEntry = collectedStyles.getByIndex(prop, resultIndex + 1);
            }
            else {
                // this is a flag that the runtime code uses to pass
                // in a value either from the state declaration styles
                // or using the AUTO_STYLE value (e.g. getComputedStyle)
                value = core_private_1.FILL_STYLE_FLAG;
            }
            if (lang_1.isPresent(nextEntry) && !nextEntry.matches(endTime, val)) {
                errors.push(new AnimationParseError("The animated CSS property \"" + prop + "\" unexpectedly changes between steps \"" + resultEntry.time + "ms\" and \"" + endTime + "ms\" at \"" + nextEntry.time + "ms\""));
            }
            values[prop] = value;
        });
    });
    return new animation_ast_1.AnimationKeyframeAst(_INITIAL_KEYFRAME, new animation_ast_1.AnimationStylesAst([values]));
}
//# sourceMappingURL=animation_parser.js.map