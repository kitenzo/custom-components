/*
 * The reorder link, locally: `?subscription=<id>` answered with a subscription.
 *
 * A Recurring bundles reminder email links to the bundle's page with `?subscription=<id>`; the
 * SDK reads it (`readRecurringSubscriptionId`) and fetches the bundle with it, and the real API
 * answers with `recurringSubscription` set. The shared mock backend (dev/mock/backend.ts) ignores
 * that query parameter, and it is shared verbatim with every example, so this wraps one backend
 * instance instead of changing it: a `GET /bundles/:id?subscription=sub_demo_club` gains the
 * subscription below. Any other id gets the bundle without one, which is what the API does for an
 * expired or foreign subscription.
 *
 * Used by the dev page (try `/?subscription=sub_demo_club`) and by e2e/cocktail-case.spec.ts.
 */
import type { RecurringSubscription } from '@kitenzo/core';

import type { MockBackend } from './mock/backend';

export const DEMO_SUBSCRIPTION: RecurringSubscription = {
    id: 'sub_demo_club',
    email: 'sam@example.com',
    frequency: 4,
    unit: 'weeks',
    discountType: 'percentage',
    discountValue: 10,
    applyDiscountToInitialOrder: true,
    lineItemProperties: null,
};

export function serveReorderLinks(backend: MockBackend, subscription: RecurringSubscription = DEMO_SUBSCRIPTION): MockBackend {
    const handle = backend.handle.bind(backend);
    backend.handle = (request) => {
        const answer = handle(request);
        const isBundleRead = request.method === 'GET' && /\/bundles\/\d+$/.test(request.path);
        if (!answer || !isBundleRead || answer.status !== 200 || request.query.subscription !== subscription.id) return answer;
        return { ...answer, body: { ...(answer.body as object), recurringSubscription: subscription } };
    };
    return backend;
}
