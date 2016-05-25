import { ListWrapper, StringMapWrapper } from '../facade/collection';
import { Math } from '../facade/math';
import { RegExpWrapper, isArray, isPresent, isBlank, isString, isStringMap, NumberWrapper } from '../facade/lang';
import { FILL_STYLE_FLAG } from '../../core_private';
import { CompileAnimationStateDeclarationMetadata, CompileAnimationWithStepsMetadata, CompileAnimationStyleMetadata, CompileAnimationAnimateMetadata, CompileAnimationGroupMetadata, CompileAnimationSequenceMetadata, CompileAnimationKeyframesSequenceMetadata } from '../compile_metadata';
import { AnimationEntryAst, AnimationStateTransitionAst, AnimationStateDeclarationAst, AnimationKeyframeAst, AnimationStylesAst, AnimationWithStepsAst, AnimationSequenceAst, AnimationGroupAst, AnimationStepAst } from './animation_ast';
import { StylesCollection } from './styles_collection';
import { ParseError } from '../parse_util';
const _INITIAL_KEYFRAME = 0;
const _TERMINAL_KEYFRAME = 1;
const _ONE_SECOND = 1000;
export class AnimationParseError extends ParseError {
    constructor(message) {
        super(null, message);
    }
    toString() { return `${this.msg}`; }
}
export class ParsedAnimationResult {
    constructor(ast, errors) {
        this.ast = ast;
        this.errors = errors;
    }
}
export function parseAnimationEntry(entry) {
    var errors = [];
    var stateStyles = {};
    var definitions = [];
    var transitions = [];
    entry.definitions.forEach(def => {
        if (def instanceof CompileAnimationStateDeclarationMetadata) {
            var stateAst = _parseAnimationStateDeclaration(def, errors);
            definitions.push(stateAst);
            stateStyles[stateAst.stateName] = stateAst.styles;
        }
        else {
            transitions.push(def);
        }
    });
    transitions.forEach(transDef => {
        var transAst = _parseAnimationStateTransition(transDef, stateStyles, errors);
        definitions.push(transAst);
    });
    var ast = new AnimationEntryAst(entry.name, definitions);
    return new ParsedAnimationResult(ast, errors);
}
function _parseAnimationStateDeclaration(stateMetadata, errors) {
    var styleValues = [];
    stateMetadata.styles.styles.forEach(stylesEntry => {
        // TODO (matsko): change this when we get CSS class integration support
        if (isStringMap(stylesEntry)) {
            styleValues.push(stylesEntry);
        }
        else {
            errors.push(new AnimationParseError(`State based animations cannot contain references to other states`));
        }
    });
    var defStyles = new AnimationStylesAst(styleValues);
    return new AnimationStateDeclarationAst(stateMetadata.stateName, defStyles);
}
function _parseAnimationStateTransition(transitionStateMetadata, stateStyles, errors) {
    var styles = new StylesCollection();
    var transitionExpr = _parseAnimationTransitionExpr(transitionStateMetadata.stateChangeExpr, errors);
    var entry = _normalizeAnimationEntry(transitionStateMetadata.animation);
    var animation = _normalizeStyleSteps(entry, stateStyles, errors);
    var animationAst = _parseTransitionAnimation(animation, 0, styles, stateStyles, errors);
    if (errors.length == 0) {
        _fillAnimationAstStartingKeyframes(animationAst, styles, errors);
    }
    return new AnimationStateTransitionAst(transitionExpr.fromState, transitionExpr.toState, animationAst);
}
class _ParsedTransitionExprResult {
    constructor(fromState, toState) {
        this.fromState = fromState;
        this.toState = toState;
    }
}
function _parseAnimationTransitionExpr(eventStr, errors) {
    var stateTokens = eventStr.split(/\s*[=-]>\s*/g);
    if (!isPresent(stateTokens) || stateTokens.length < 2) {
        errors.push(new AnimationParseError(`the provided ${eventStr} is not of a supported format`));
    }
    return new _ParsedTransitionExprResult(stateTokens[0], stateTokens[1]);
}
function _fetchSylesFromState(stateName, stateStyles) {
    var entry = stateStyles[stateName];
    if (isPresent(entry)) {
        var styles = entry.styles;
        return new CompileAnimationStyleMetadata(0, styles);
    }
    return null;
}
function _normalizeAnimationEntry(entry) {
    return isArray(entry)
        ? new CompileAnimationSequenceMetadata(entry)
        : entry;
}
function _normalizeStyleMetadata(entry, stateStyles, errors) {
    var normalizedStyles = [];
    entry.styles.forEach(styleEntry => {
        if (isString(styleEntry)) {
            ListWrapper.addAll(normalizedStyles, _resolveStylesFromState(styleEntry, stateStyles, errors));
        }
        else {
            normalizedStyles.push(styleEntry);
        }
    });
    return normalizedStyles;
}
function _normalizeStyleSteps(entry, stateStyles, errors) {
    var steps = _normalizeStyleStepEntry(entry, stateStyles, errors);
    if (steps.length == 1 && steps[0] instanceof CompileAnimationAnimateMetadata) {
        return steps[0];
    }
    return new CompileAnimationSequenceMetadata(steps);
}
function _mergeAnimationStyles(stylesList, newItem) {
    if (isStringMap(newItem) && stylesList.length > 0) {
        var lastIndex = stylesList.length - 1;
        var lastItem = stylesList[lastIndex];
        if (isStringMap(lastItem)) {
            stylesList[lastIndex] = StringMapWrapper.merge(lastItem, newItem);
            return;
        }
    }
    stylesList.push(newItem);
}
function _normalizeStyleStepEntry(entry, stateStyles, errors) {
    var steps;
    if (entry instanceof CompileAnimationWithStepsMetadata) {
        steps = entry.steps;
    }
    else {
        return [entry];
    }
    var newSteps = [];
    var combinedStyles;
    steps.forEach(step => {
        if (step instanceof CompileAnimationStyleMetadata) {
            // this occurs when a style step is followed by a previous style step
            // or when the first style step is run. We want to concatenate all subsequent
            // style steps together into a single style step such that we have the correct
            // starting keyframe data to pass into the animation player.
            if (!isPresent(combinedStyles)) {
                combinedStyles = [];
            }
            _normalizeStyleMetadata(step, stateStyles, errors).forEach(entry => {
                _mergeAnimationStyles(combinedStyles, entry);
            });
        }
        else {
            // it is important that we create a metadata entry of the combined styles
            // before we go on an process the animate, sequence or group metadata steps.
            // This will ensure that the AST will have the previous styles painted on
            // screen before any further animations that use the styles take place.
            if (isPresent(combinedStyles)) {
                newSteps.push(new CompileAnimationStyleMetadata(0, combinedStyles));
                combinedStyles = null;
            }
            if (step instanceof CompileAnimationAnimateMetadata) {
                // we do not recurse into CompileAnimationAnimateMetadata since
                // those style steps are not going to be squashed
                var animateStyleValue = step.styles;
                if (animateStyleValue instanceof CompileAnimationStyleMetadata) {
                    animateStyleValue.styles = _normalizeStyleMetadata(animateStyleValue, stateStyles, errors);
                }
                else if (animateStyleValue instanceof CompileAnimationKeyframesSequenceMetadata) {
                    animateStyleValue.steps.forEach(step => {
                        step.styles = _normalizeStyleMetadata(step, stateStyles, errors);
                    });
                }
            }
            else if (step instanceof CompileAnimationWithStepsMetadata) {
                let innerSteps = _normalizeStyleStepEntry(step, stateStyles, errors);
                step = step instanceof CompileAnimationGroupMetadata
                    ? new CompileAnimationGroupMetadata(innerSteps)
                    : new CompileAnimationSequenceMetadata(innerSteps);
            }
            newSteps.push(step);
        }
    });
    // this happens when only styles were animated within the sequence
    if (isPresent(combinedStyles)) {
        newSteps.push(new CompileAnimationStyleMetadata(0, combinedStyles));
    }
    return newSteps;
}
function _resolveStylesFromState(stateName, stateStyles, errors) {
    var styles = [];
    if (stateName[0] != ':') {
        errors.push(new AnimationParseError(`Animation states via styles must be prefixed with a ":"`));
    }
    else {
        var normalizedStateName = stateName.substring(1);
        var value = stateStyles[normalizedStateName];
        if (!isPresent(value)) {
            errors.push(new AnimationParseError(`Unable to apply styles due to missing a state ${normalizedStateName}`));
        }
        else {
            value.styles.forEach(stylesEntry => {
                if (isStringMap(stylesEntry)) {
                    styles.push(stylesEntry);
                }
            });
        }
    }
    return styles;
}
class _AnimationTimings {
    constructor(duration, delay, easing) {
        this.duration = duration;
        this.delay = delay;
        this.easing = easing;
    }
}
function _parseAnimationKeyframes(keyframeSequence, currentTime, collectedStyles, stateStyles, errors) {
    var totalEntries = keyframeSequence.steps.length;
    var totalOffsets = 0;
    keyframeSequence.steps.forEach(step => {
        totalOffsets += isPresent(step.offset) ? 1 : 0;
    });
    if (totalOffsets > 0 && totalOffsets < totalEntries) {
        errors.push(new AnimationParseError(`Not all style() entries contain an offset for the provided keyframe()`));
        totalOffsets = totalEntries;
    }
    var limit = totalEntries - 1;
    var margin = totalOffsets == 0 ? (1 / limit) : 0;
    var keyframes = [];
    var index = 0;
    var doSortKeyframes = false;
    var lastOffset = 0;
    keyframeSequence.steps.forEach(styleMetadata => {
        var offset = styleMetadata.offset;
        var keyframeStyles = styleMetadata.styles.map(entry => {
            var styles = {};
            StringMapWrapper.forEach(entry, (value, prop) => {
                if (prop != 'offset') {
                    styles[prop] = value;
                }
            });
            return styles;
        });
        if (isPresent(offset)) {
            doSortKeyframes = doSortKeyframes || (offset < lastOffset);
        }
        else {
            offset = index == limit ? _TERMINAL_KEYFRAME : (margin * index);
        }
        var keyframe = new AnimationKeyframeAst(offset, new AnimationStylesAst(keyframeStyles));
        keyframes.push(keyframe);
        lastOffset = offset;
        index++;
    });
    if (doSortKeyframes) {
        ListWrapper.sort(keyframes, (a, b) => a.offset <= b.offset ? -1 : 1);
    }
    return keyframes;
}
function _parseTransitionAnimation(entry, currentTime, collectedStyles, stateStyles, errors) {
    var ast;
    var playTime = 0;
    var startingTime = currentTime;
    if (entry instanceof CompileAnimationWithStepsMetadata) {
        var maxDuration = 0;
        var steps = [];
        var isGroup = entry instanceof CompileAnimationGroupMetadata;
        var previousStyles;
        entry.steps.forEach(entry => {
            // these will get picked up by the next step...
            var time = isGroup ? startingTime : currentTime;
            if (entry instanceof CompileAnimationStyleMetadata) {
                entry.styles.forEach(stylesEntry => {
                    // by this point we know that we only have stringmap values
                    var map = stylesEntry;
                    StringMapWrapper.forEach(map, (value, prop) => {
                        collectedStyles.insertAtTime(prop, time, value);
                    });
                });
                previousStyles = entry.styles;
                return;
            }
            var innerAst = _parseTransitionAnimation(entry, time, collectedStyles, stateStyles, errors);
            if (isPresent(previousStyles)) {
                if (entry instanceof CompileAnimationWithStepsMetadata) {
                    let startingStyles = new AnimationStylesAst(previousStyles);
                    steps.push(new AnimationStepAst(startingStyles, [], 0, 0, ''));
                }
                else {
                    var innerStep = innerAst;
                    ListWrapper.addAll(innerStep.startingStyles.styles, previousStyles);
                }
                previousStyles = null;
            }
            var astDuration = innerAst.playTime;
            currentTime += astDuration;
            playTime += astDuration;
            maxDuration = Math.max(astDuration, maxDuration);
            steps.push(innerAst);
        });
        if (isPresent(previousStyles)) {
            let startingStyles = new AnimationStylesAst(previousStyles);
            steps.push(new AnimationStepAst(startingStyles, [], 0, 0, ''));
        }
        if (isGroup) {
            ast = new AnimationGroupAst(steps);
            playTime = maxDuration;
            currentTime = startingTime + playTime;
        }
        else {
            ast = new AnimationSequenceAst(steps);
        }
    }
    else if (entry instanceof CompileAnimationAnimateMetadata) {
        var timings = _parseTimeExpression(entry.timings, errors);
        var styles = entry.styles;
        var keyframes;
        if (styles instanceof CompileAnimationKeyframesSequenceMetadata) {
            keyframes = _parseAnimationKeyframes(styles, currentTime, collectedStyles, stateStyles, errors);
        }
        else {
            let styleData = styles;
            let offset = _TERMINAL_KEYFRAME;
            let styleAst = new AnimationStylesAst(styleData.styles);
            var keyframe = new AnimationKeyframeAst(offset, styleAst);
            keyframes = [keyframe];
        }
        ast = new AnimationStepAst(new AnimationStylesAst([]), keyframes, timings.duration, timings.delay, timings.easing);
        playTime = timings.duration + timings.delay;
        currentTime += playTime;
        keyframes.forEach(keyframe => keyframe.styles.styles.forEach(entry => StringMapWrapper.forEach(entry, (value, prop) => collectedStyles.insertAtTime(prop, currentTime, value))));
    }
    else {
        // if the code reaches this stage then an error
        // has already been populated within the _normalizeStyleSteps()
        // operation...
        ast = new AnimationStepAst(null, [], 0, 0, '');
    }
    ast.playTime = playTime;
    ast.startTime = startingTime;
    return ast;
}
function _fillAnimationAstStartingKeyframes(ast, collectedStyles, errors) {
    // steps that only contain style will not be filled
    if ((ast instanceof AnimationStepAst) && ast.keyframes.length > 0) {
        var keyframes = ast.keyframes;
        if (keyframes.length == 1) {
            var endKeyframe = keyframes[0];
            var startKeyframe = _createStartKeyframeFromEndKeyframe(endKeyframe, ast.startTime, ast.playTime, collectedStyles, errors);
            ast.keyframes = [startKeyframe, endKeyframe];
        }
    }
    else if (ast instanceof AnimationWithStepsAst) {
        ast.steps.forEach(entry => _fillAnimationAstStartingKeyframes(entry, collectedStyles, errors));
    }
}
function _parseTimeExpression(exp, errors) {
    var regex = /^([\.\d]+)(m?s)(?:\s+([\.\d]+)(m?s))?(?:\s+([-a-z]+))?/gi;
    var duration;
    var delay = 0;
    var easing = null;
    if (isString(exp)) {
        var matches = RegExpWrapper.firstMatch(regex, exp);
        if (!isPresent(matches)) {
            errors.push(new AnimationParseError(`The provided timing value "${exp}" is invalid.`));
            return new _AnimationTimings(0, 0, null);
        }
        var durationMatch = NumberWrapper.parseFloat(matches[1]);
        var durationUnit = matches[2];
        if (durationUnit == 's') {
            durationMatch *= _ONE_SECOND;
        }
        duration = Math.floor(durationMatch);
        var delayMatch = matches[3];
        var delayUnit = matches[4];
        if (isPresent(delayMatch)) {
            var delayVal = NumberWrapper.parseFloat(delayMatch);
            if (isPresent(delayUnit) && delayUnit == 's') {
                delayVal *= _ONE_SECOND;
            }
            delay = Math.floor(delayVal);
        }
        var easingVal = matches[5];
        if (!isBlank(easingVal)) {
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
    endKeyframe.styles.styles.forEach((styleData) => {
        StringMapWrapper.forEach(styleData, (val, prop) => {
            if (prop == 'offset')
                return;
            var resultIndex = collectedStyles.indexOfAtOrBeforeTime(prop, startTime);
            var resultEntry, nextEntry, value;
            if (isPresent(resultIndex)) {
                resultEntry = collectedStyles.getByIndex(prop, resultIndex);
                value = resultEntry.value;
                nextEntry = collectedStyles.getByIndex(prop, resultIndex + 1);
            }
            else {
                // this is a flag that the runtime code uses to pass
                // in a value either from the state declaration styles
                // or using the AUTO_STYLE value (e.g. getComputedStyle)
                value = FILL_STYLE_FLAG;
            }
            if (isPresent(nextEntry) && !nextEntry.matches(endTime, val)) {
                errors.push(new AnimationParseError(`The animated CSS property "${prop}" unexpectedly changes between steps "${resultEntry.time}ms" and "${endTime}ms" at "${nextEntry.time}ms"`));
            }
            values[prop] = value;
        });
    });
    return new AnimationKeyframeAst(_INITIAL_KEYFRAME, new AnimationStylesAst([values]));
}
//# sourceMappingURL=animation_parser.js.map