import {Form, Link} from 'react-router';
import {useLocalizedHref} from '~/lib/localizedLink';

/**
 * Branded 404 content, rendered inside the page layout (header/footer stay
 * visible) by the catch-all route's ErrorBoundary.
 */
export function NotFound() {
  const localize = useLocalizedHref();
  return (
    <div className="not-found">
      <span className="route-error-status">Error 404</span>
      <h1>We can&rsquo;t find that page</h1>
      <p>
        The link may be broken, or the page may have moved. Try searching for
        what you need, or jump back into the shop.
      </p>
      <Form
        method="get"
        action={localize('/search')}
        className="not-found-search"
      >
        <input
          type="search"
          name="q"
          placeholder="Search products…"
          aria-label="Search products"
        />
        <button type="submit" className="btn btn-primary">
          Search
        </button>
      </Form>
      <div className="not-found-links">
        <Link className="btn btn-ghost" to={localize('/collections/all')}>
          Shop all products
        </Link>
        <Link className="btn btn-ghost" to={localize('/pages/how-it-works')}>
          How it works
        </Link>
        <Link className="btn btn-ghost" to={localize('/pages/faq')}>
          FAQ
        </Link>
        <Link className="btn btn-ghost" to={localize('/pages/contact')}>
          Contact
        </Link>
      </div>
    </div>
  );
}
