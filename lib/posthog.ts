import posthog from 'posthog-js/dist/module.slim.no-external';

import { APP_HOSTS } from './domains';

const projectToken = 'phc_zF8Frrhbb5eqiYQaDjcSURrVfU5Qq2GTktnZmJ2zWTuq';

// The SDK enriches events with URLs and attribution, including query strings.
// Only forward Web Analytics fields and the route supplied by the page.
const fields = new Set([
  'token', 'distinct_id', '$device_id', '$session_id', '$window_id',
  '$lib', '$lib_version', '$process_person_profile', '$is_identified',
  '$host', '$pathname', '$current_url', '$referrer', '$referring_domain',
  '$browser', '$browser_version', '$os', '$os_version', '$device_type',
  '$viewport_width', '$viewport_height', '$screen_width', '$screen_height',
  '$browser_language', '$timezone',
]);

let initialized = false;

export function capturePageview(path: string) {
  if (!APP_HOSTS.includes(location.hostname)) return;
  if (!initialized) {
    posthog.init(projectToken, {
      api_host: 'https://eu.i.posthog.com',
      persistence: 'localStorage',
      person_profiles: 'never',
      autocapture: false,
      capture_pageview: false,
      capture_pageleave: false,
      capture_exceptions: false,
      capture_performance: false,
      disable_session_recording: true,
      advanced_disable_flags: true,
      save_campaign_params: false,
      save_referrer: false,
      before_send(event) {
        if (event?.event !== '$pageview') return null;
        const properties = Object.fromEntries(Object.entries(event.properties).filter(([key]) => fields.has(key)));
        return { event: event.event, uuid: event.uuid, timestamp: event.timestamp, properties };
      },
    });
    initialized = true;
  }

  const referrer = document.referrer ? new URL(document.referrer) : null;
  posthog.capture('$pageview', {
    $current_url: location.origin + path,
    $pathname: path,
    $host: location.host,
    $referrer: referrer?.origin ?? '$direct',
    $referring_domain: referrer?.hostname ?? '$direct',
  });
}
