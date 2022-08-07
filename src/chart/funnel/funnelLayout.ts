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

import * as layout from '../../util/layout';
import { parsePercent, linearMap } from '../../util/number';
import FunnelSeriesModel, { FunnelSeriesOption, FunnelDataItemOption } from './FunnelSeries';
import ExtensionAPI from '../../core/ExtensionAPI';
import SeriesData from '../../data/SeriesData';
import GlobalModel from '../../model/Global';
import { isFunction } from 'zrender/src/core/util';

function getViewRect(seriesModel: FunnelSeriesModel, api: ExtensionAPI) {
    return layout.getLayoutRect(
        seriesModel.getBoxLayoutParams(), {
        width: api.getWidth(),
        height: api.getHeight()
    }
    );
}

function getSortedIndices(data: SeriesData, sort: FunnelSeriesOption['sort']) {
    const valueDim = data.mapDimension('value');
    const valueArr = data.mapArray(valueDim, function (val: number) {
        return val;
    });
    const indices: number[] = [];
    const isAscending = sort === 'ascending';
    for (let i = 0, len = data.count(); i < len; i++) {
        indices[i] = i;
    }

    // Add custom sortable function & none sortable opetion by "options.sort"
    if (isFunction(sort)) {
        indices.sort(sort as any);
    }
    else if (sort !== 'none') {
        indices.sort(function (a, b) {
            return isAscending
                ? valueArr[a] - valueArr[b]
                : valueArr[b] - valueArr[a];
        });
    }
    return indices;
}

function labelLayout(data: SeriesData) {
    const seriesModel = data.hostModel;
    const orient = seriesModel.get('orient');
    data.each(function (idx) {
        const itemModel = data.getItemModel<FunnelDataItemOption>(idx);
        const labelModel = itemModel.getModel('label');
        let labelPosition = labelModel.get('position');

        const labelLineModel = itemModel.getModel('labelLine');

        const layout = data.getItemLayout(idx);
        const points = layout.points;

        const isLabelInside = labelPosition === 'inner'
            || labelPosition === 'inside' || labelPosition === 'center'
            || labelPosition === 'insideLeft' || labelPosition === 'insideRight';

        let textAlign;
        let textX;
        let textY;
        let linePoints;

        if (isLabelInside) {
            if (labelPosition === 'insideLeft') {
                textX = (points[0][0] + points[3][0]) / 2 + 5;
                textY = (points[0][1] + points[3][1]) / 2;
                textAlign = 'left';
            }
            else if (labelPosition === 'insideRight') {
                textX = (points[1][0] + points[2][0]) / 2 - 5;
                textY = (points[1][1] + points[2][1]) / 2;
                textAlign = 'right';
            }
            else {
                textX = (points[0][0] + points[1][0] + points[2][0] + points[3][0]) / 4;
                textY = (points[0][1] + points[1][1] + points[2][1] + points[3][1]) / 4;
                textAlign = 'center';
            }
            linePoints = [
                [textX, textY], [textX, textY]
            ];
        }
        else {
            let x1;
            let y1;
            let x2;
            let y2;
            const labelLineLen = labelLineModel.get('length');
            if (__DEV__) {
                if (orient === 'vertical' && ['top', 'bottom'].indexOf(labelPosition as string) > -1) {
                    labelPosition = 'left';
                    console.warn('Position error: Funnel chart on vertical orient dose not support top and bottom.');
                }
                if (orient === 'horizontal' && ['left', 'right'].indexOf(labelPosition as string) > -1) {
                    labelPosition = 'bottom';
                    console.warn('Position error: Funnel chart on horizontal orient dose not support left and right.');
                }
            }
            if (labelPosition === 'left') {
                // Left side
                x1 = (points[3][0] + points[0][0]) / 2;
                y1 = (points[3][1] + points[0][1]) / 2;
                x2 = x1 - labelLineLen;
                textX = x2 - 5;
                textAlign = 'right';
            }
            else if (labelPosition === 'right') {
                // Right side
                x1 = (points[1][0] + points[2][0]) / 2;
                y1 = (points[1][1] + points[2][1]) / 2;
                x2 = x1 + labelLineLen;
                textX = x2 + 5;
                textAlign = 'left';
            }
            else if (labelPosition === 'top') {
                // Top side
                x1 = (points[3][0] + points[0][0]) / 2;
                y1 = (points[3][1] + points[0][1]) / 2;
                y2 = y1 - labelLineLen;
                textY = y2 - 5;
                textAlign = 'center';
            }
            else if (labelPosition === 'bottom') {
                // Bottom side
                x1 = (points[1][0] + points[2][0]) / 2;
                y1 = (points[1][1] + points[2][1]) / 2;
                y2 = y1 + labelLineLen;
                textY = y2 + 5;
                textAlign = 'center';
            }
            else if (labelPosition === 'rightTop') {
                // RightTop side
                x1 = orient === 'horizontal' ? points[3][0] : points[1][0];
                y1 = orient === 'horizontal' ? points[3][1] : points[1][1];
                if (orient === 'horizontal') {
                    y2 = y1 - labelLineLen;
                    textY = y2 - 5;
                    textAlign = 'center';
                }
                else {
                    x2 = x1 + labelLineLen;
                    textX = x2 + 5;
                    textAlign = 'top';
                }
            }
            else if (labelPosition === 'rightBottom') {
                // RightBottom side
                x1 = points[2][0];
                y1 = points[2][1];
                if (orient === 'horizontal') {
                    y2 = y1 + labelLineLen;
                    textY = y2 + 5;
                    textAlign = 'center';
                }
                else {
                    x2 = x1 + labelLineLen;
                    textX = x2 + 5;
                    textAlign = 'bottom';
                }
            }
            else if (labelPosition === 'leftTop') {
                // LeftTop side
                x1 = points[0][0];
                y1 = orient === 'horizontal' ? points[0][1] : points[1][1];
                if (orient === 'horizontal') {
                    y2 = y1 - labelLineLen;
                    textY = y2 - 5;
                    textAlign = 'center';
                }
                else {
                    x2 = x1 - labelLineLen;
                    textX = x2 - 5;
                    textAlign = 'right';
                }
            }
            else if (labelPosition === 'leftBottom') {
                // LeftBottom side
                x1 = orient === 'horizontal' ? points[1][0] : points[3][0];
                y1 = orient === 'horizontal' ? points[1][1] : points[2][1];
                if (orient === 'horizontal') {
                    y2 = y1 + labelLineLen;
                    textY = y2 + 5;
                    textAlign = 'center';
                }
                else {
                    x2 = x1 - labelLineLen;
                    textX = x2 - 5;
                    textAlign = 'right';
                }
            }
            else {
                // Right side or Bottom side
                x1 = (points[1][0] + points[2][0]) / 2;
                y1 = (points[1][1] + points[2][1]) / 2;
                if (orient === 'horizontal') {
                    y2 = y1 + labelLineLen;
                    textY = y2 + 5;
                    textAlign = 'center';
                }
                else {
                    x2 = x1 + labelLineLen;
                    textX = x2 + 5;
                    textAlign = 'left';
                }
            }
            if (orient === 'horizontal') {
                x2 = x1;
                textX = x2;
            }
            else {
                y2 = y1;
                textY = y2;
            }
            linePoints = [[x1, y1], [x2, y2]];
        }

        layout.label = {
            linePoints: linePoints,
            x: textX,
            y: textY,
            verticalAlign: 'middle',
            textAlign: textAlign,
            inside: isLabelInside
        };
    });
}

export default function funnelLayout(ecModel: GlobalModel, api: ExtensionAPI) {
    ecModel.eachSeriesByType('funnel', function (seriesModel: FunnelSeriesModel) {
        const data = seriesModel.getData();
        const valueDim = data.mapDimension('value');
        const valueArr = data.mapArray(valueDim, function (val: number) {
            return val;
        });
        const sort = seriesModel.get('sort');
        const viewRect = getViewRect(seriesModel, api);
        const orient = seriesModel.get('orient');
        const dynamicHeight = seriesModel.get('dynamicHeight');
        const viewWidth = viewRect.width;
        const viewHeight = viewRect.height;
        let indices = getSortedIndices(data, sort);
        let x = viewRect.x;
        let y = viewRect.y;

        let gap = seriesModel.get('gap');
        const gapSum = gap * (data.count() - 1);
        let sizeExtent: Array<number> = null;
        if (dynamicHeight) {
            sizeExtent = orient === 'horizontal' ? [
                parsePercent(seriesModel.get('minSize'), viewWidth - gapSum),
                parsePercent(seriesModel.get('maxSize'), viewWidth - gapSum)
            ] : [
                parsePercent(seriesModel.get('minSize'), viewHeight - gapSum),
                parsePercent(seriesModel.get('maxSize'), viewHeight - gapSum)
            ];
        }
        else {
            sizeExtent = orient === 'horizontal' ? [
                parsePercent(seriesModel.get('minSize'), viewHeight),
                parsePercent(seriesModel.get('maxSize'), viewHeight)
            ] : [
                parsePercent(seriesModel.get('minSize'), viewWidth),
                parsePercent(seriesModel.get('maxSize'), viewWidth)
            ];
        }

        const dataExtent = data.getDataExtent(valueDim);
        let min = seriesModel.get('min');
        let max = seriesModel.get('max');
        if (min == null) {
            min = Math.min(dataExtent[0], 0);
        }
        if (max == null) {
            max = dataExtent[1];
        }

        const funnelAlign = seriesModel.get('funnelAlign');
        let viewSize: number;
        if (dynamicHeight) {
            viewSize = orient === 'vertical' ? viewWidth : viewHeight;
        }
        else {
            viewSize = orient === 'horizontal' ? viewWidth : viewHeight;
        }
        let itemSize = (viewSize - gapSum) / data.count();

        const getLinePoints = function (idx: number, offset: number) {
            // End point index is data.count() and we assign it 0
            if (orient === 'horizontal') {
                const val = data.get(valueDim, idx) as number || 0;
                const itemHeight = linearMap(val, [min, max], sizeExtent, true);
                let y0;
                switch (funnelAlign) {
                    case 'top':
                        y0 = y;
                        break;
                    case 'center':
                        y0 = y + (viewHeight - itemHeight) / 2;
                        break;
                    case 'bottom':
                        y0 = y + (viewHeight - itemHeight);
                        break;
                }

                return [
                    [offset, y0],
                    [offset, y0 + itemHeight]
                ];
            }
            const val = data.get(valueDim, idx) as number || 0;
            const itemWidth = linearMap(val, [min, max], sizeExtent, true);
            let x0;
            switch (funnelAlign) {
                case 'left':
                    x0 = x;
                    break;
                case 'center':
                    x0 = x + (viewWidth - itemWidth) / 2;
                    break;
                case 'right':
                    x0 = x + viewWidth - itemWidth;
                    break;
            }
            return [
                [x0, offset],
                [x0 + itemWidth, offset]
            ];
        };

        const getLinePointsInDyHeight = function (offset: number, itemSize: number) {
            if (orient === 'horizontal') {
                const itemHeight = itemSize;
                let y0;
                switch (funnelAlign) {
                    case 'top':
                        y0 = y;
                        break;
                    case 'center':
                        y0 = y + (viewHeight - itemHeight) / 2;
                        break;
                    case 'bottom':
                        y0 = y + (viewHeight - itemHeight);
                        break;
                }

                return [
                    [offset, y0],
                    [offset, y0 + itemHeight]
                ];
            }
            const itemWidth = itemSize;
            let x0;
            switch (funnelAlign) {
                case 'left':
                    x0 = x;
                    break;
                case 'center':
                    x0 = x + (viewWidth - itemWidth) / 2;
                    break;
                case 'right':
                    x0 = x + viewWidth - itemWidth;
                    break;
            }
            return [
                [x0, offset],
                [x0 + itemWidth, offset]
            ];
        };

        if (sort === 'ascending') {
            // From bottom to top
            itemSize = -itemSize;
            gap = -gap;
            if (orient === 'horizontal') {
                x += viewWidth;
            }
            else {
                y += viewHeight;
            }
            indices = indices.reverse();
        }

        const valueSum = valueArr.reduce((pre, cur) => pre + cur);

        const getSideLen = function (sideLen: number | string, idx?: number): number {
            if (dynamicHeight) {
                // in dy height, user can't set itemHeight or itemWidth
                const val = data.get(valueDim, idx) as number || 0;
                sideLen = linearMap(val, [0, valueSum], sizeExtent, true);
                sideLen = sort === 'ascending' ? -sideLen : sideLen;
                return sideLen;
            }

            if (sideLen == null) {
                sideLen = itemSize;
            }
            else {
                if (orient === 'horizontal') {
                    sideLen = parsePercent(sideLen, viewWidth);
                }
                else {
                    sideLen = parsePercent(sideLen, viewHeight);
                }

                if (sort === 'ascending') {
                    sideLen = -sideLen;
                }
            }
            return sideLen;
        };

        const exitShape = seriesModel.get('exitShape');
        let resSize = sizeExtent[1];
        const maxSize = sizeExtent[1];
        const setLayoutPoints =
            // The subsequent funnel shape modification will be done in this func.
            // We don’t need to concern direction when we use this function to set points.
            function (
                index: number,
                idx: number,
                nextIdx: number,
                sideLen: number,
                pos: number
            ): void {
                if (dynamicHeight) {
                    const start = getLinePointsInDyHeight(pos, resSize / maxSize * viewSize);
                    let end;

                    if (index === indices.length - 1 && exitShape === 'rect') {
                        end = getLinePointsInDyHeight(pos + sideLen, resSize / maxSize * viewSize);
                    }
                    else {
                        resSize += sort === 'ascending' ? sideLen : -sideLen;
                        end = getLinePointsInDyHeight(pos + sideLen, resSize / maxSize * viewSize);
                    }

                    data.setItemLayout(idx, {
                        points: start.concat(end.slice().reverse())
                    });
                    return;
                }
                const start = getLinePoints(idx, pos);
                let end;

                if (index === indices.length - 1 && exitShape === 'rect') {
                    end = getLinePoints(idx, pos + sideLen);
                }
                else {
                    end = getLinePoints(nextIdx, pos + sideLen);
                }

                data.setItemLayout(idx, {
                    points: start.concat(end.slice().reverse())
                });
            };

        for (let i = 0; i < indices.length; i++) {
            const idx = indices[i];
            const nextIdx = indices[i + 1];
            const itemModel = data.getItemModel<FunnelDataItemOption>(idx);

            if (orient === 'horizontal') {
                const width = getSideLen(itemModel.get(['itemStyle', 'width']), idx);

                setLayoutPoints(i, idx, nextIdx, width, x);

                x += width + gap;
            }
            else {
                const height = getSideLen(itemModel.get(['itemStyle', 'height']), idx);

                setLayoutPoints(i, idx, nextIdx, height, y);

                y += height + gap;
            }
        }

        labelLayout(data);
    });
}
