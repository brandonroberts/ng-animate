"use strict";
var lang_1 = require('../facade/lang');
var collection_1 = require('../facade/collection');
var metadata_1 = require('./metadata');
var animation_constants_1 = require('../animation/animation_constants');
var AnimationStyleUtil = (function () {
    function AnimationStyleUtil() {
    }
    AnimationStyleUtil.balanceStyles = function (previousStyles, newStyles, nullValue) {
        if (nullValue === void 0) { nullValue = null; }
        var finalStyles = {};
        collection_1.StringMapWrapper.forEach(newStyles, function (value, prop) {
            finalStyles[prop] = value;
        });
        collection_1.StringMapWrapper.forEach(previousStyles, function (value, prop) {
            if (!lang_1.isPresent(finalStyles[prop])) {
                finalStyles[prop] = nullValue;
            }
        });
        return finalStyles;
    };
    AnimationStyleUtil.balanceKeyframes = function (collectedStyles, finalStateStyles, keyframes) {
        var limit = keyframes.length - 1;
        var firstKeyframe = keyframes[0];
        // phase 1: copy all the styles from the first keyframe into the lookup map
        var flatenedFirstKeyframeStyles = {};
        var keyframeCollectedStyles = {};
        var extraFirstKeyframeStyles = {};
        var hasExtraFirstStyles = false;
        collection_1.StringMapWrapper.forEach(collectedStyles, function (value, prop) {
            keyframeCollectedStyles[prop] = value;
            flatenedFirstKeyframeStyles[prop] = value;
            extraFirstKeyframeStyles[prop] = value;
            hasExtraFirstStyles = true;
        });
        firstKeyframe.styles.styles.forEach(function (entry) {
            collection_1.StringMapWrapper.forEach(entry, function (value, prop) {
                keyframeCollectedStyles[prop] = value;
                flatenedFirstKeyframeStyles[prop] = value;
            });
        });
        // phase 2: normalize the final keyframe
        var finalKeyframe = keyframes[limit];
        finalKeyframe.styles.styles.push(finalStateStyles);
        var flatenedFinalKeyframeStyles = _flattenStyles(finalKeyframe.styles.styles);
        var extraFinalKeyframeStyles = {};
        var hasExtraFinalStyles = false;
        collection_1.StringMapWrapper.forEach(keyframeCollectedStyles, function (value, prop) {
            if (!lang_1.isPresent(flatenedFinalKeyframeStyles[prop])) {
                extraFinalKeyframeStyles[prop] = metadata_1.AUTO_STYLE;
                hasExtraFinalStyles = true;
            }
        });
        if (hasExtraFinalStyles) {
            finalKeyframe.styles.styles.push(extraFinalKeyframeStyles);
        }
        collection_1.StringMapWrapper.forEach(flatenedFinalKeyframeStyles, function (value, prop) {
            if (!lang_1.isPresent(flatenedFirstKeyframeStyles[prop])) {
                extraFirstKeyframeStyles[prop] = metadata_1.AUTO_STYLE;
                hasExtraFirstStyles = true;
            }
        });
        if (hasExtraFirstStyles) {
            firstKeyframe.styles.styles.push(extraFirstKeyframeStyles);
        }
        return keyframes;
    };
    AnimationStyleUtil.clearStyles = function (styles) {
        var finalStyles = {};
        collection_1.StringMapWrapper.keys(styles).forEach(function (key) {
            finalStyles[key] = null;
        });
        return finalStyles;
    };
    AnimationStyleUtil.collectAndResolveStyles = function (collection, newStyles) {
        newStyles.forEach(function (entry) {
            collection_1.StringMapWrapper.forEach(entry, function (value, prop) {
                if (value == animation_constants_1.FILL_STYLE_FLAG) {
                    value = collection[prop];
                    if (!lang_1.isPresent(value)) {
                        value = metadata_1.AUTO_STYLE;
                    }
                    entry[prop] = value;
                }
                collection[prop] = value;
            });
        });
        return newStyles;
    };
    return AnimationStyleUtil;
}());
exports.AnimationStyleUtil = AnimationStyleUtil;
function _flattenStyles(styles) {
    var finalStyles = {};
    styles.forEach(function (entry) {
        collection_1.StringMapWrapper.forEach(entry, function (value, prop) {
            finalStyles[prop] = value;
        });
    });
    return finalStyles;
}
//# sourceMappingURL=animation_style_util.js.map