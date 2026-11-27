'use client';
/**
 * luzia-react: a thin React wrapper over `luzia-widget`, configured with
 * props instead of script tag attributes.
 */
import { createElement, type CSSProperties, type ReactElement } from 'react';
import { defineLuziaWidget, LUZIA_WIDGET_TAG, type LuziaWidgetConfig } from 'luzia-widget';

// Register the custom element as soon as this module runs in a browser; on the
// server the tag is rendered as plain markup and upgraded on hydration.
if (typeof customElements !== 'undefined') defineLuziaWidget();

/**
 * Same options as the `<luzia-widget>` attributes, with `suggestedQuestions`
 * as a real array. `className` and `style` go on the element, so theme custom
 * properties can be set inline: `style={{ '--luzia-accent': '#e11d48' }}`.
 */
export interface LuziaWidgetProps extends LuziaWidgetConfig {
  className?: string;
  style?: CSSProperties & Record<`--luzia-${string}`, string>;
}

/** The luzIA chat widget: a floating bubble (or an inline chat) to talk with the Agent. */
export function LuziaWidget({
  endpoint,
  contact,
  greeting,
  suggestedQuestions,
  mode,
  theme,
  avatar,
  className,
  style,
}: LuziaWidgetProps): ReactElement {
  return createElement(LUZIA_WIDGET_TAG, {
    endpoint,
    contact,
    greeting,
    mode,
    theme,
    avatar,
    // Passed as the attribute so it renders the same on the server and the client.
    'suggested-questions': suggestedQuestions ? JSON.stringify(suggestedQuestions) : undefined,
    className,
    style,
  });
}
