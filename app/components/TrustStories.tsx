import {
  useCallback,
  useMemo,
  useState,
  type MouseEvent,
  type ReactNode,
} from 'react';
import {Link} from 'react-router';

import {StoryViewer, type Story} from '~/components/StoryViewer';
import {SHOP} from '~/data/shop';
import {useLocalizedHref} from '~/lib/localizedLink';
import {useTranslate} from '~/lib/useTranslate';

/**
 * Story-style circles under the buy box on the product page: a gradient ring,
 * a round photo and a short label, each answering the question a shopper has
 * right before paying — how is it checked, who is selling it, can I send it
 * back.
 *
 * "About us" and "Returns" open a full-screen, Instagram-style story
 * (StoryViewer) that walks through the answer with photos. They are still
 * real links to the About page and the refund policy, so they work before
 * hydration, with cmd/ctrl-click and for crawlers; a plain click opens the
 * story instead. "Authenticity" goes straight to its page.
 *
 * Every line in the stories restates what the About page and the Shopify
 * refund / shipping policies already say — change the policy first, then
 * this copy (and its translations). About us (3 slides) uses the owner's own
 * photos in `public/stories/about-*.jpg`, including the team photo; Returns
 * (3 slides) is text only, on the brand background. The circle thumbnails are 192px squares in
 * `public/stories/` (plain JPEG on purpose — Shopify's image service
 * re-encodes modern formats served from `public/`).
 */
type StoryId = 'about' | 'returns';

const CIRCLES: Array<{label: string; to: string; image: string; story?: StoryId}> =
  [
    {
      label: 'Authenticity',
      to: '/pages/authenticity',
      image: '/stories/story-authenticity.jpg',
    },
    {
      label: 'About us',
      to: '/pages/about',
      image: '/stories/story-about.jpg',
      story: 'about',
    },
    {
      label: 'Returns',
      to: '/policies/refund-policy',
      image: '/stories/story-returns.jpg',
      story: 'returns',
    },
  ];

/** Story order = circle order; after one story ends the next one plays. */
const STORY_ORDER: StoryId[] = ['about', 'returns'];

const LABELS: Record<StoryId, string> = {about: 'About us', returns: 'Returns'};

/**
 * Slide copy as English source strings, translated through `t`. Tokens:
 * {name} shop name, {days} return window, {email} the support address
 * (rendered as a mailto link).
 *
 * About us: photo slides (the owner's photos, shown whole). Returns: text
 * slides on the brand background — no photos, just the policy, laid out to
 * be read in a few seconds each.
 */
type SlideSource = {
  tag: string;
  image?: string;
  title?: string;
  text?: string;
  points?: string[];
  list?: 'check' | 'steps';
  cta?: {label: string; to: string};
};

const SLIDES: Record<StoryId, SlideSource[]> = {
  about: [
    {
      image: '/stories/about-team.jpg',
      tag: 'Who we are',
      text: 'Hey, we’re {name} — a team of sneaker and streetwear fans who built the store we always wanted to shop at ourselves.',
    },
    {
      image: '/stories/about-check.jpg',
      tag: '100% authentic',
      text: 'Every item is checked piece by piece before it ships — 100% authentic. If we wouldn’t wear it ourselves, it doesn’t go on the site.',
    },
    {
      image: '/stories/about-worn.jpg',
      tag: 'Talk to us',
      text: 'Got a question about a size or an order? Just email {email} — a real person gets back to you within 1–2 business days.',
      cta: {label: 'More about us', to: '/pages/about'},
    },
  ],
  returns: [
    {
      tag: '{days}-day returns',
      title: 'Changed your mind? No problem.',
      list: 'check',
      points: [
        'Return any item within {days} days of delivery, no reason needed.',
        'Items must be unworn, with their tags and original box. Trying them on is fine.',
        'Not shipped yet? Cancel for free and get a full refund.',
      ],
    },
    {
      tag: 'How to return',
      title: 'Returning is easy',
      list: 'steps',
      points: [
        'Email {email} with your order number and the items you want to return.',
        'We confirm your return within 1–2 business days.',
        'Send the items back within 14 days of your request. You choose the carrier and pay the return postage.',
      ],
    },
    {
      tag: 'Your refund',
      title: 'Refunded within 14 days',
      list: 'check',
      points: [
        'We refund your original payment method within 14 days, once we have the items or your proof of sending.',
        'No restocking or admin fees.',
        'Faulty, damaged or not what you ordered? Email us photos within 14 days of delivery: we send a replacement or a full refund and cover the return shipping.',
      ],
      cta: {label: 'Read the full return policy', to: '/policies/refund-policy'},
    },
  ],
};

function useStories(): Story[] {
  const t = useTranslate();
  return useMemo(() => {
    const fill = (text: string) =>
      text
        .replace('{name}', SHOP.name)
        .replace('{days}', String(SHOP.returnDays));
    const render = (text: string): ReactNode => {
      const [before, after] = fill(t(text)).split('{email}');
      if (after === undefined) return before;
      return (
        <>
          {before}
          <a href={`mailto:${SHOP.email}`}>{SHOP.email}</a>
          {after}
        </>
      );
    };
    return STORY_ORDER.map((id) => ({
      id,
      label: t(LABELS[id]),
      slides: SLIDES[id].map((slide) => ({
        tag: fill(t(slide.tag)),
        image: slide.image,
        title: slide.title ? fill(t(slide.title)) : undefined,
        text: slide.text ? render(slide.text) : undefined,
        points: slide.points?.map(render),
        list: slide.list,
        cta: slide.cta
          ? {label: t(slide.cta.label), to: slide.cta.to}
          : undefined,
      })),
    }));
  }, [t]);
}

export function TrustStories() {
  const t = useTranslate();
  const localize = useLocalizedHref();
  const stories = useStories();
  const [open, setOpen] = useState<number | null>(null);
  const close = useCallback(() => setOpen(null), []);

  return (
    <>
      <nav className="trust-stories" aria-label={t('Good to know')}>
        {CIRCLES.map((circle) => {
          const index = circle.story ? STORY_ORDER.indexOf(circle.story) : -1;
          const openStory =
            index < 0
              ? undefined
              : (event: MouseEvent<HTMLAnchorElement>) => {
                  // Let cmd/ctrl/shift/middle-click open the page as usual.
                  if (
                    event.button !== 0 ||
                    event.metaKey ||
                    event.ctrlKey ||
                    event.shiftKey ||
                    event.altKey
                  ) {
                    return;
                  }
                  event.preventDefault();
                  setOpen(index);
                };
          return (
            <Link
              key={circle.to}
              className="trust-story"
              to={localize(circle.to)}
              prefetch="intent"
              onClick={openStory}
              aria-haspopup={openStory ? 'dialog' : undefined}
            >
              <span className="trust-story-ring">
                <img
                  src={circle.image}
                  alt=""
                  width={96}
                  height={96}
                  loading="lazy"
                  decoding="async"
                />
              </span>
              <span className="trust-story-label">{t(circle.label)}</span>
            </Link>
          );
        })}
      </nav>
      {open === null ? null : (
        <StoryViewer stories={stories} startAt={open} onClose={close} />
      )}
    </>
  );
}
