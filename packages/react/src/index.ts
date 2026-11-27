'use client';
/**
 * @luzia/react: a thin React wrapper over `@luzia/widget`, configured with
 * props instead of script tag attributes.
 */
import { createElement, type ReactElement } from 'react';
import { defineLuziaWidget, LUZIA_WIDGET_TAG, type LuziaWidgetConfig } from '@luzia/widget';

// Register the custom element as soon as this module runs in a browser; on the
// server the tag is rendered as plain markup and upgraded on hydration.
if (typeof customElements !== 'undefined') defineLuziaWidget();

/** Same options as the `<luzia-widget>` attributes. */
export type LuziaWidgetProps = LuziaWidgetConfig;

/** The luzIA chat widget: a floating bubble that opens a chat with the Agent. */
export function LuziaWidget({ endpoint, contact }: LuziaWidgetProps): ReactElement {
  return createElement(LUZIA_WIDGET_TAG, { endpoint, contact });
}
