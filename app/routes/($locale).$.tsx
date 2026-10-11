import type {Route} from './+types/($locale).$';
import {NotFound} from '~/components/NotFound';

export async function loader(_args: Route.LoaderArgs) {
  throw new Response('Not found', {status: 404});
}

export default function CatchAllPage() {
  return null;
}

export function ErrorBoundary() {
  return <NotFound />;
}
