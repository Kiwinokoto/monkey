# Tunnel Reader privacy

Tunnel Reader is designed to work locally in the browser.

## Local processing and storage

Tunnel Reader processes and stores limited reading data locally on the user's
device solely to provide its core reading features.

This may include:

- chapter/page URLs needed for cache-first navigation and reading resume;
- reading position information such as scroll position, progress ratio, and a
  local reading anchor;
- Reader preferences such as theme, control position, opacity, Focus Mode,
  auto-scroll state, and speed;
- buffered chapter/page HTML and cacheable images/resources used for offline or
  unreliable-connectivity reading.

This data remains on the user's device and is used only by Tunnel Reader to
provide those features.

## Data transmission and developer access

**Tunnel Reader does not transmit this local reading data to the developer or
to any Tunnel Reader backend. There is no Tunnel Reader backend service.**

The developer does not receive users' chapter URLs, reading positions, cached
page content, browsing activity, or Reader settings.

Tunnel Reader has no analytics, telemetry, advertising, tracking pixels, or
usage-statistics service.

## Network requests

To pre-buffer reading content, Tunnel Reader may request the current site's next
chapters/pages and resources referenced by those pages. These requests are made
directly to the websites and resources the user is reading; they are not sent
to the developer.

The Reader respects normal HTTP failures and stops on access/rate-limit
responses such as 401, 403, and 429 rather than trying to bypass them.

## Remote code

Tunnel Reader does not execute remote JavaScript or WebAssembly. All executable
extension code is bundled with the extension. Network responses are treated as
reading content only; cached HTML is sanitized before it is restored.

## Third parties

Tunnel Reader does not sell or transfer user data to third parties.

The websites and content providers the user visits remain governed by their own
privacy policies and terms.

## Removing local data

Users can remove locally stored Reader data through their browser's
site/extension storage controls or by uninstalling or clearing the extension.
Tunnel Reader also prunes its reading buffer automatically.

## Contact / source

Source code: https://github.com/Kiwinokoto/monkey
