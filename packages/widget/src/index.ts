/**
 * @luzia/widget: the embeddable luzIA chat widget, a framework-free Web
 * Component that Visitors use to chat with the Agent.
 *
 * It talks to the luzIA server handler from `@luzia/core`: POST
 * `{ messages: [{ role, content }] }` as JSON and read the reply as a streamed
 * `text/plain` body. Non-2xx responses carry `{ error: { code, message } }`.
 */
import { LUZIA_WIDGET_TAG, LuziaWidgetElement } from './element.ts';

export { LUZIA_WIDGET_TAG, LuziaWidgetElement };

/** Registers `<luzia-widget>`. Safe to call more than once. */
export function defineLuziaWidget(): void {
  if (!customElements.get(LUZIA_WIDGET_TAG)) customElements.define(LUZIA_WIDGET_TAG, LuziaWidgetElement);
}
