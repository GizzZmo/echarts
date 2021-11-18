/*
* Licensed to the Apache Software Foundation (ASF) under one
* or more contributor license agreements.  See the NOTICE file
* distributed with this work for additional information
* regarding copyright ownership.  The ASF licenses this file
* to you under the Apache License, Version 2.0 (the
* "License"); you may not use this file except in compliance
* with the License.  You may obtain a copy of the License at
*
*   http://www.apache.org/licenses/LICENSE-2.0
*
* Unless required by applicable law or agreed to in writing,
* software distributed under the License is distributed on an
* "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
* KIND, either express or implied.  See the License for the
* specific language governing permissions and limitations
* under the License.
*/

// Helpers for custom graphic elements in custom series and graphic components.

import Transformable from 'zrender/src/core/Transformable';
import Element, { ElementProps } from 'zrender/src/Element';

import { makeInner, normalizeToArray } from '../util/model';
import { assert, bind, eqNaN, hasOwn, indexOf, isArrayLike, keys } from 'zrender/src/core/util';
import { cloneValue } from 'zrender/src/animation/Animator';
import Displayable, { DisplayableProps } from 'zrender/src/graphic/Displayable';
import Model from '../model/Model';
import { initProps, updateProps } from './basicTrasition';
import { Path } from '../util/graphic';
import { warn } from '../util/log';
import { AnimationOptionMixin, ZRStyleProps } from '../util/types';
import { Dictionary } from 'zrender/lib/core/types';
import { PathStyleProps } from 'zrender';

const LEGACY_TRANSFORM_PROPS = {
    position: ['x', 'y'],
    scale: ['scaleX', 'scaleY'],
    origin: ['originX', 'originY']
} as const;
type LegacyTransformProp = keyof typeof LEGACY_TRANSFORM_PROPS;

export type CustomTransitionProps = string | string[];
export interface ElementTransitionOptionMixin {
    transition?: CustomTransitionProps;
    enterFrom?: Dictionary<unknown>;
    leaveTo?: Dictionary<unknown>;
};

export type ElementTransformTransitionOptionMixin = {
    transition?: ElementRootTransitionProp | ElementRootTransitionProp[];
    enterFrom?: Dictionary<number>;
    leaveTo?: Dictionary<number>;
};
type ElementRootTransitionProp = TransformProp | 'shape' | 'extra' | 'style';

export const TRANSFORM_PROPS = {
    x: 1,
    y: 1,
    scaleX: 1,
    scaleY: 1,
    originX: 1,
    originY: 1,
    rotation: 1
} as const;
export type TransformProp = keyof typeof TRANSFORM_PROPS;

interface LooseElementProps extends ElementProps {
    style?: ZRStyleProps;
    shape?: Dictionary<unknown>;
}

type TransitionElementOption = Partial<Record<TransformProp, number>> & {
    shape?: Dictionary<any> & ElementTransitionOptionMixin
    style?: PathStyleProps & ElementTransitionOptionMixin
    extra?: Dictionary<any> & ElementTransitionOptionMixin
    invisible?: boolean
    silent?: boolean
    autoBatch?: boolean
    ignore?: boolean

    during?: (params: TransitionDuringAPI) => void
} & ElementTransformTransitionOptionMixin;

const transitionInnerStore = makeInner<{
    leaveToProps: ElementProps;
    userDuring: (params: TransitionDuringAPI) => void;
}, Element>();

const transformPropNamesStr = keys(TRANSFORM_PROPS).join(', ');

function setLegacyTransformProp(
    elOption: TransitionElementOption,
    targetProps: Partial<Pick<Transformable, TransformProp>>,
    legacyName: LegacyTransformProp
): void {
    const legacyArr = (elOption as any)[legacyName];
    const xyName = LEGACY_TRANSFORM_PROPS[legacyName];
    if (legacyArr) {
        targetProps[xyName[0]] = legacyArr[0];
        targetProps[xyName[1]] = legacyArr[1];
    }
}

function setTransformProp(
    elOption: TransitionElementOption,
    allProps: Partial<Pick<Transformable, TransformProp>>,
    name: TransformProp
): void {
    if (elOption[name] != null) {
        allProps[name] = elOption[name];
    }
}

function setTransformPropToTransitionFrom(
    transitionFrom: Partial<Pick<Transformable, TransformProp>>,
    name: TransformProp,
    fromTransformable?: Transformable // If provided, retrieve from the element.
): void {
    if (fromTransformable) {
        transitionFrom[name] = fromTransformable[name];
    }
}


export interface TransitionBaseDuringAPI {
    // Usually other props do not need to be changed in animation during.
    setTransform(key: TransformProp, val: number): this
    getTransform(key: TransformProp): number;
    setExtra(key: string, val: unknown): this
    getExtra(key: string): unknown
}
export interface TransitionDuringAPI<
    StyleOpt extends any = any,
    ShapeOpt extends any = any
> extends TransitionBaseDuringAPI {
    setShape<T extends keyof ShapeOpt>(key: T, val: ShapeOpt[T]): this;
    getShape<T extends keyof ShapeOpt>(key: T): ShapeOpt[T];
    setStyle<T extends keyof StyleOpt>(key: T, val: StyleOpt[T]): this
    getStyle<T extends keyof StyleOpt>(key: T): StyleOpt[T];
};

export function updateTransition(
    el: Element,
    elOption: TransitionElementOption,
    animatableModel?: Model<AnimationOptionMixin>,
    dataIndex?: number,
    isInit?: boolean
) {
    // Save the meta info for further morphing. Like apply on the sub morphing elements.
    const store = transitionInnerStore(el);
    const styleOpt = elOption.style;
    store.userDuring = elOption.during;

    const transFromProps = {} as ElementProps;
    const propsToSet = {} as ElementProps;

    prepareShapeOrExtraTransitionFrom('shape', el, elOption, transFromProps, isInit);
    prepareShapeOrExtraAllPropsFinal('shape', elOption, propsToSet);
    prepareTransformTransitionFrom(el, elOption, transFromProps, isInit);
    prepareTransformAllPropsFinal(el, elOption, propsToSet);
    prepareShapeOrExtraTransitionFrom('extra', el, elOption, transFromProps, isInit);
    prepareShapeOrExtraAllPropsFinal('extra', elOption, propsToSet);
    prepareStyleTransitionFrom(el, elOption, styleOpt, transFromProps, isInit);
    (propsToSet as DisplayableProps).style = styleOpt;
    applyPropsDirectly(el, propsToSet);
    applyPropsTransition(el, dataIndex, animatableModel, transFromProps, isInit);
    applyMiscProps(el, elOption);

    styleOpt ? el.dirty() : el.markRedraw();
}

export function leaveTransition(
    el: Element,
    seriesModel: Model<AnimationOptionMixin>
): void {
    if (el) {
        const parent = el.parent;
        const leaveToProps = transitionInnerStore(el).leaveToProps;
        leaveToProps
            ? updateProps(el, leaveToProps, seriesModel, {
                cb: function () {
                    parent.remove(el);
                }
            })
            : parent.remove(el);
    }
}


function applyPropsDirectly(
    el: Element,
    // Can be null/undefined
    allPropsFinal: ElementProps
) {
    const elDisplayable = el.isGroup ? null : el as Displayable;
    const styleOpt = (allPropsFinal as Displayable).style;

    if (elDisplayable && styleOpt) {

        // PENDING: here the input style object is used directly.
        // Good for performance but bad for compatibility control.
        elDisplayable.useStyle(styleOpt);
        // When style object changed, how to trade the existing animation?
        // It is probably complicated and not needed to cover all the cases.
        // But still need consider the case:
        // (1) When using init animation on `style.opacity`, and before the animation
        //     ended users triggers an update by mousewhel. At that time the init
        //     animation should better be continued rather than terminated.
        //     So after `useStyle` called, we should change the animation target manually
        //     to continue the effect of the init animation.
        // (2) PENDING: If the previous animation targeted at a `val1`, and currently we need
        //     to update the value to `val2` and no animation declared, should be terminate
        //     the previous animation or just modify the target of the animation?
        //     Therotically That will happen not only on `style` but also on `shape` and
        //     `transfrom` props. But we haven't handle this case at present yet.
        // (3) PENDING: Is it proper to visit `animators` and `targetName`?
        const animators = elDisplayable.animators;
        for (let i = 0; i < animators.length; i++) {
            const animator = animators[i];
            // targetName is the "topKey".
            if (animator.targetName === 'style') {
                animator.changeTarget(elDisplayable.style);
            }
        }
    }

    if (allPropsFinal) {
        // Not set style here.
        (allPropsFinal as DisplayableProps).style = null;
        // Set el to the final state firstly.
        allPropsFinal && el.attr(allPropsFinal);
        (allPropsFinal as DisplayableProps).style = styleOpt;
    }
}

function applyPropsTransition(
    el: Element,
    dataIndex: number,
    model: Model<AnimationOptionMixin>,
    // Can be null/undefined
    transFromProps: ElementProps,
    isInit: boolean
): void {
    if (transFromProps) {
        // NOTE: Do not use `el.updateDuringAnimation` here becuase `el.updateDuringAnimation` will
        // be called mutiple time in each animation frame. For example, if both "transform" props
        // and shape props and style props changed, it will generate three animator and called
        // one-by-one in each animation frame.
        // We use the during in `animateTo/From` params.
        const userDuring = transitionInnerStore(el).userDuring;
        // For simplicity, if during not specified, the previous during will not work any more.
        const cfgDuringCall = userDuring ? bind(duringCall, { el: el, userDuring: userDuring }) : null;
        const cfg = {
            dataIndex: dataIndex,
            isFrom: true,
            during: cfgDuringCall
        };
        isInit
            ? initProps(el, transFromProps, model, cfg)
            : updateProps(el, transFromProps, model, cfg);
    }
}


function applyMiscProps(
    el: Element,
    elOption: TransitionElementOption
) {
    // Merge by default.
    hasOwn(elOption, 'silent') && (el.silent = elOption.silent);
    hasOwn(elOption, 'ignore') && (el.ignore = elOption.ignore);
    if (el instanceof Displayable) {
        hasOwn(elOption, 'invisible') && ((el as Path).invisible = elOption.invisible);
    }
    if (el instanceof Path) {
        hasOwn(elOption, 'autoBatch') && ((el as Path).autoBatch = elOption.autoBatch);
    }
}

// Use it to avoid it be exposed to user.
const tmpDuringScope = {} as {
    el: Element;
    isShapeDirty: boolean;
    isStyleDirty: boolean;
};
const transitionDuringAPI: TransitionDuringAPI = {
    // Usually other props do not need to be changed in animation during.
    setTransform(key: TransformProp, val: unknown) {
        if (__DEV__) {
            assert(hasOwn(TRANSFORM_PROPS, key), 'Only ' + transformPropNamesStr + ' available in `setTransform`.');
        }
        tmpDuringScope.el[key] = val as number;
        return this;
    },
    getTransform(key: TransformProp): number {
        if (__DEV__) {
            assert(hasOwn(TRANSFORM_PROPS, key), 'Only ' + transformPropNamesStr + ' available in `getTransform`.');
        }
        return tmpDuringScope.el[key];
    },
    setShape(key: any, val: unknown) {
        if (__DEV__) {
            assertNotReserved(key);
        }
        const shape = (tmpDuringScope.el as Path).shape
            || ((tmpDuringScope.el as Path).shape = {});
        shape[key] = val;
        tmpDuringScope.isShapeDirty = true;
        return this;
    },
    getShape(key: any): any {
        if (__DEV__) {
            assertNotReserved(key);
        }
        const shape = (tmpDuringScope.el as Path).shape;
        if (shape) {
            return shape[key];
        }
    },
    setStyle(key: any, val: unknown) {
        if (__DEV__) {
            assertNotReserved(key);
        }
        const style = (tmpDuringScope.el as Displayable).style;
        if (style) {
            if (__DEV__) {
                if (eqNaN(val)) {
                    warn('style.' + key + ' must not be assigned with NaN.');
                }
            }
            style[key] = val;
            tmpDuringScope.isStyleDirty = true;
        }
        return this;
    },
    getStyle(key: any): any {
        if (__DEV__) {
            assertNotReserved(key);
        }
        const style = (tmpDuringScope.el as Displayable).style;
        if (style) {
            return style[key];
        }
    },
    setExtra(key: any, val: unknown) {
        if (__DEV__) {
            assertNotReserved(key);
        }
        const extra = (tmpDuringScope.el as LooseElementProps).extra
            || ((tmpDuringScope.el as LooseElementProps).extra = {});
        extra[key] = val;
        return this;
    },
    getExtra(key: string): unknown {
        if (__DEV__) {
            assertNotReserved(key);
        }
        const extra = (tmpDuringScope.el as LooseElementProps).extra;
        if (extra) {
            return extra[key];
        }
    }
};

function assertNotReserved(key: string) {
    if (__DEV__) {
        if (key === 'transition' || key === 'enterFrom' || key === 'leaveTo') {
            throw new Error('key must not be "' + key + '"');
        }
    }
}

function duringCall(
    this: {
        el: Element;
        userDuring: (params: TransitionDuringAPI) => void;
    }
): void {
    // Do not provide "percent" until some requirements come.
    // Because consider thies case:
    // enterFrom: {x: 100, y: 30}, transition: 'x'.
    // And enter duration is different from update duration.
    // Thus it might be confused about the meaning of "percent" in during callback.
    const scope = this;
    const el = scope.el;
    if (!el) {
        return;
    }
    // If el is remove from zr by reason like legend, during still need to called,
    // becuase el will be added back to zr and the prop value should not be incorrect.

    const latestUserDuring = transitionInnerStore(el).userDuring;
    const scopeUserDuring = scope.userDuring;
    // Ensured a during is only called once in each animation frame.
    // If a during is called multiple times in one frame, maybe some users' calulation logic
    // might be wrong (not sure whether this usage exists).
    // The case of a during might be called twice can be: by default there is a animator for
    // 'x', 'y' when init. Before the init animation finished, call `setOption` to start
    // another animators for 'style'/'shape'/'extra'.
    if (latestUserDuring !== scopeUserDuring) {
        // release
        scope.el = scope.userDuring = null;
        return;
    }

    tmpDuringScope.el = el;
    tmpDuringScope.isShapeDirty = false;
    tmpDuringScope.isStyleDirty = false;

    // Give no `this` to user in "during" calling.
    scopeUserDuring(transitionDuringAPI);

    if (tmpDuringScope.isShapeDirty && (el as Path).dirtyShape) {
        (el as Path).dirtyShape();
    }
    if (tmpDuringScope.isStyleDirty && (el as Displayable).dirtyStyle) {
        (el as Displayable).dirtyStyle();
    }
    // markRedraw() will be called by default in during.
    // FIXME `this.markRedraw();` directly ?

    // FIXME: if in future meet the case that some prop will be both modified in `during` and `state`,
    // consider the issue that the prop might be incorrect when return to "normal" state.
}

function prepareShapeOrExtraTransitionFrom(
    mainAttr: 'shape' | 'extra',
    fromEl: Element,
    elOption: TransitionElementOption,
    transFromProps: LooseElementProps,
    isInit: boolean
): void {

    const attrOpt: Dictionary<unknown> & ElementTransitionOptionMixin = (elOption as any)[mainAttr];
    if (!attrOpt) {
        return;
    }

    const elPropsInAttr = (fromEl as LooseElementProps)[mainAttr];
    let transFromPropsInAttr: Dictionary<unknown>;

    const enterFrom = attrOpt.enterFrom;
    if (isInit && enterFrom) {
        !transFromPropsInAttr && (transFromPropsInAttr = transFromProps[mainAttr] = {});
        const enterFromKeys = keys(enterFrom);
        for (let i = 0; i < enterFromKeys.length; i++) {
            // `enterFrom` props are not necessarily also declared in `shape`/`style`/...,
            // for example, `opacity` can only declared in `enterFrom` but not in `style`.
            const key = enterFromKeys[i];
            // Do not clone, animator will perform that clone.
            transFromPropsInAttr[key] = enterFrom[key];
        }
    }

    if (!isInit && elPropsInAttr) {
        if (attrOpt.transition) {
            !transFromPropsInAttr && (transFromPropsInAttr = transFromProps[mainAttr] = {});
            const transitionKeys = normalizeToArray(attrOpt.transition);
            for (let i = 0; i < transitionKeys.length; i++) {
                const key = transitionKeys[i];
                const elVal = elPropsInAttr[key];
                if (__DEV__) {
                    checkNonStyleTansitionRefer(key, (attrOpt as any)[key], elVal);
                }
                // Do not clone, see `checkNonStyleTansitionRefer`.
                transFromPropsInAttr[key] = elVal;
            }
        }
        else if (indexOf(elOption.transition, mainAttr) >= 0) {
            !transFromPropsInAttr && (transFromPropsInAttr = transFromProps[mainAttr] = {});
            const elPropsInAttrKeys = keys(elPropsInAttr);
            for (let i = 0; i < elPropsInAttrKeys.length; i++) {
                const key = elPropsInAttrKeys[i];
                const elVal = elPropsInAttr[key];
                if (isNonStyleTransitionEnabled((attrOpt as any)[key], elVal)) {
                    transFromPropsInAttr[key] = elVal;
                }
            }
        }
    }

    const leaveTo = attrOpt.leaveTo;
    if (leaveTo) {
        const leaveToProps = getOrCreateLeaveToPropsFromEl(fromEl);
        const leaveToPropsInAttr: Dictionary<unknown> = leaveToProps[mainAttr] || (leaveToProps[mainAttr] = {});
        const leaveToKeys = keys(leaveTo);
        for (let i = 0; i < leaveToKeys.length; i++) {
            const key = leaveToKeys[i];
            leaveToPropsInAttr[key] = leaveTo[key];
        }
    }
}

function prepareShapeOrExtraAllPropsFinal(
    mainAttr: 'shape' | 'extra',
    elOption: TransitionElementOption,
    allProps: LooseElementProps
): void {
    const attrOpt: Dictionary<unknown> & ElementTransitionOptionMixin = (elOption as any)[mainAttr];
    if (!attrOpt) {
        return;
    }
    const allPropsInAttr = allProps[mainAttr] = {} as Dictionary<unknown>;
    const keysInAttr = keys(attrOpt);
    for (let i = 0; i < keysInAttr.length; i++) {
        const key = keysInAttr[i];
        // To avoid share one object with different element, and
        // to avoid user modify the object inexpectedly, have to clone.
        allPropsInAttr[key] = cloneValue((attrOpt as any)[key]);
    }
}

function prepareTransformTransitionFrom(
    el: Element,
    elOption: TransitionElementOption,
    transFromProps: ElementProps,
    isInit: boolean
): void {
    const enterFrom = elOption.enterFrom;
    if (isInit && enterFrom) {
        const enterFromKeys = keys(enterFrom);
        for (let i = 0; i < enterFromKeys.length; i++) {
            const key = enterFromKeys[i] as TransformProp;
            if (__DEV__) {
                checkTransformPropRefer(key, 'el.enterFrom');
            }
            // Do not clone, animator will perform that clone.
            transFromProps[key] = enterFrom[key] as number;
        }
    }

    if (!isInit) {
        if (elOption.transition) {
            const transitionKeys = normalizeToArray(elOption.transition);
            for (let i = 0; i < transitionKeys.length; i++) {
                const key = transitionKeys[i];
                if (key === 'style' || key === 'shape' || key === 'extra') {
                    continue;
                }
                const elVal = el[key];
                if (__DEV__) {
                    checkTransformPropRefer(key, 'el.transition');
                    checkNonStyleTansitionRefer(key, elOption[key], elVal);
                }
                // Do not clone, see `checkNonStyleTansitionRefer`.
                transFromProps[key] = elVal;
            }
        }
        // This default transition see [STRATEGY_TRANSITION]
        else {
            setTransformPropToTransitionFrom(transFromProps, 'x', el);
            setTransformPropToTransitionFrom(transFromProps, 'y', el);
        }
    }

    const leaveTo = elOption.leaveTo;
    if (leaveTo) {
        const leaveToProps = getOrCreateLeaveToPropsFromEl(el);
        const leaveToKeys = keys(leaveTo);
        for (let i = 0; i < leaveToKeys.length; i++) {
            const key = leaveToKeys[i] as TransformProp;
            if (__DEV__) {
                checkTransformPropRefer(key, 'el.leaveTo');
            }
            leaveToProps[key] = leaveTo[key] as number;
        }
    }
}

function prepareTransformAllPropsFinal(
    el: Element,
    elOption: TransitionElementOption,
    allProps: ElementProps
): void {
    setLegacyTransformProp(elOption, allProps, 'position');
    setLegacyTransformProp(elOption, allProps, 'scale');
    setLegacyTransformProp(elOption, allProps, 'origin');

    setTransformProp(elOption, allProps, 'x');
    setTransformProp(elOption, allProps, 'y');
    setTransformProp(elOption, allProps, 'scaleX');
    setTransformProp(elOption, allProps, 'scaleY');
    setTransformProp(elOption, allProps, 'originX');
    setTransformProp(elOption, allProps, 'originY');
    setTransformProp(elOption, allProps, 'rotation');
}

function prepareStyleTransitionFrom(
    fromEl: Element,
    elOption: TransitionElementOption,
    styleOpt: TransitionElementOption['style'],
    transFromProps: LooseElementProps,
    isInit: boolean
): void {
    if (!styleOpt) {
        return;
    }

    const fromElStyle = (fromEl as LooseElementProps).style as LooseElementProps['style'];
    let transFromStyleProps: LooseElementProps['style'];

    const enterFrom = styleOpt.enterFrom;
    if (isInit && enterFrom) {
        const enterFromKeys = keys(enterFrom);
        !transFromStyleProps && (transFromStyleProps = transFromProps.style = {});
        for (let i = 0; i < enterFromKeys.length; i++) {
            const key = enterFromKeys[i];
            // Do not clone, animator will perform that clone.
            (transFromStyleProps as any)[key] = enterFrom[key];
        }
    }

    if (!isInit && fromElStyle) {
        if (styleOpt.transition) {
            const transitionKeys = normalizeToArray(styleOpt.transition);
            !transFromStyleProps && (transFromStyleProps = transFromProps.style = {});
            for (let i = 0; i < transitionKeys.length; i++) {
                const key = transitionKeys[i];
                const elVal = (fromElStyle as any)[key];
                // Do not clone, see `checkNonStyleTansitionRefer`.
                (transFromStyleProps as any)[key] = elVal;
            }
        }
        else if (
            (fromEl as Displayable).getAnimationStyleProps
            && indexOf(elOption.transition, 'style') >= 0
        ) {
            const animationProps = (fromEl as Displayable).getAnimationStyleProps();
            const animationStyleProps = animationProps ? animationProps.style : null;
            if (animationStyleProps) {
                !transFromStyleProps && (transFromStyleProps = transFromProps.style = {});
                const styleKeys = keys(styleOpt);
                for (let i = 0; i < styleKeys.length; i++) {
                    const key = styleKeys[i];
                    if ((animationStyleProps as Dictionary<unknown>)[key]) {
                        const elVal = (fromElStyle as any)[key];
                        (transFromStyleProps as any)[key] = elVal;
                    }
                }
            }
        }
    }

    const leaveTo = styleOpt.leaveTo;
    if (leaveTo) {
        const leaveToKeys = keys(leaveTo);
        const leaveToProps = getOrCreateLeaveToPropsFromEl(fromEl);
        const leaveToStyleProps = leaveToProps.style || (leaveToProps.style = {});
        for (let i = 0; i < leaveToKeys.length; i++) {
            const key = leaveToKeys[i];
            (leaveToStyleProps as any)[key] = leaveTo[key];
        }
    }
}

let checkNonStyleTansitionRefer: (propName: string, optVal: unknown, elVal: unknown) => void;
if (__DEV__) {
    checkNonStyleTansitionRefer = function (propName: string, optVal: unknown, elVal: unknown): void {
        if (!isArrayLike(optVal)) {
            assert(
                optVal != null && isFinite(optVal as number),
                'Prop `' + propName + '` must refer to a finite number or ArrayLike for transition.'
            );
        }
        else {
            // Try not to copy array for performance, but if user use the same object in different
            // call of `renderItem`, it will casue animation transition fail.
            assert(
                optVal !== elVal,
                'Prop `' + propName + '` must use different Array object each time for transition.'
            );
        }
    };
}

function isNonStyleTransitionEnabled(optVal: unknown, elVal: unknown): boolean {
    // The same as `checkNonStyleTansitionRefer`.
    return !isArrayLike(optVal)
        ? (optVal != null && isFinite(optVal as number))
        : optVal !== elVal;
}

let checkTransformPropRefer: (key: string, usedIn: string) => void;
if (__DEV__) {
    checkTransformPropRefer = function (key: string, usedIn: string): void {
        assert(
            hasOwn(TRANSFORM_PROPS, key),
            'Prop `' + key + '` is not a permitted in `' + usedIn + '`. '
                + 'Only `' + keys(TRANSFORM_PROPS).join('`, `') + '` are permitted.'
        );
    };
}

function getOrCreateLeaveToPropsFromEl(el: Element): LooseElementProps {
    const innerEl = transitionInnerStore(el);
    return innerEl.leaveToProps || (innerEl.leaveToProps = {});
}
