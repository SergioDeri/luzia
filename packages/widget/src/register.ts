/**
 * Entry of the script bundle (`dist/luzia-widget.js`): registers
 * `<luzia-widget>` as soon as it loads, so a static site only needs
 *
 *   <script type="module" src=".../luzia-widget.js"></script>
 *   <luzia-widget endpoint="https://luzia.example.com/api/luzia"></luzia-widget>
 *
 * It also re-exports the package API for pages that import it as a module.
 */
import { defineLuziaWidget } from './index.ts';

defineLuziaWidget();

export * from './index.ts';
