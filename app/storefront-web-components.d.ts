/**
 * Shopify's storefront web components are custom elements, so React has to be
 * told they exist — without this TypeScript rejects the tags outright.
 *
 * Attribute names are hyphenated because that is how custom elements read
 * them; React passes unknown hyphenated props straight through to the DOM.
 *
 * Only the two components this storefront uses are declared. Docs:
 * https://shopify.dev/docs/api/storefront-web-components
 */
import type {ReactNode} from 'react';

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      /** Provides store context and tokens to the components nested inside. */
      'shopify-store': {
        'store-domain'?: string;
        'public-access-token'?: string;
        /** Omitted while the visitor is signed out. */
        'customer-access-token'?: string;
        children?: ReactNode;
      };
      /** Avatar + sign-in sheet. Keeps the customer on the storefront. */
      'shopify-account': {
        /** Menu handle whose links fill the sheet. */
        menu?: string;
        /** Route that starts the OAuth handshake. */
        'sign-in-url'?: string;
        children?: ReactNode;
      };
    }
  }
}
