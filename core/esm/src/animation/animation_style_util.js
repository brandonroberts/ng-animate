import { isPresent } from '../facade/lang';
import { StringMapWrapper } from '../facade/collection';
import { AUTO_STYLE } from './metadata';
import { FILL_STYLE_FLAG } from '../animation/animation_constants';
export class AnimationStyleUtil {
    static balanceStyles(previousStyles, newStyles, nullValue = null) {
        var finalStyles = {};
        StringMapWrapper.forEach(newStyles, (value, prop) => {
            finalStyles[prop] = value;
        });
        StringMapWrapper.forEach(previousStyles, (value, prop) => {
            if (!isPresent(finalStyles[prop])) {
                finalStyles[prop] = nullValue;
            }
        });
        return finalStyles;
    }
    static balanceKeyframes(collectedStyles, finalStateStyles, keyframes) {
        var limit = keyframes.length - 1;
        var firstKeyframe = keyframes[0];
        // phase 1: copy all the styles from the first keyframe into the lookup map
        var flatenedFirstKeyframeStyles = {};
        var keyframeCollectedStyles = {};
        var extraFirstKeyframeStyles = {};
        var hasExtraFirstStyles = false;
        StringMapWrapper.forEach(collectedStyles, (value, prop) => {
            keyframeCollectedStyles[prop] = value;
            flatenedFirstKeyframeStyles[prop] = value;
            extraFirstKeyframeStyles[prop] = value;
            hasExtraFirstStyles = true;
        });
        firstKeyframe.styles.styles.forEach(entry => {
            StringMapWrapper.forEach(entry, (value, prop) => {
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
        StringMapWrapper.forEach(keyframeCollectedStyles, (value, prop) => {
            if (!isPresent(flatenedFinalKeyframeStyles[prop])) {
                extraFinalKeyframeStyles[prop] = AUTO_STYLE;
                hasExtraFinalStyles = true;
            }
        });
        if (hasExtraFinalStyles) {
            finalKeyframe.styles.styles.push(extraFinalKeyframeStyles);
        }
        StringMapWrapper.forEach(flatenedFinalKeyframeStyles, (value, prop) => {
            if (!isPresent(flatenedFirstKeyframeStyles[prop])) {
                extraFirstKeyframeStyles[prop] = AUTO_STYLE;
                hasExtraFirstStyles = true;
            }
        });
        if (hasExtraFirstStyles) {
            firstKeyframe.styles.styles.push(extraFirstKeyframeStyles);
        }
        return keyframes;
    }
    static clearStyles(styles) {
        var finalStyles = {};
        StringMapWrapper.keys(styles).forEach(key => {
            finalStyles[key] = null;
        });
        return finalStyles;
    }
    static collectAndResolveStyles(collection, newStyles) {
        newStyles.forEach(entry => {
            StringMapWrapper.forEach(entry, (value, prop) => {
                if (value == FILL_STYLE_FLAG) {
                    value = collection[prop];
                    if (!isPresent(value)) {
                        value = AUTO_STYLE;
                    }
                    entry[prop] = value;
                }
                collection[prop] = value;
            });
        });
        return newStyles;
    }
}
function _flattenStyles(styles) {
    var finalStyles = {};
    styles.forEach(entry => {
        StringMapWrapper.forEach(entry, (value, prop) => {
            finalStyles[prop] = value;
        });
    });
    return finalStyles;
}
//# sourceMappingURL=animation_style_util.js.map