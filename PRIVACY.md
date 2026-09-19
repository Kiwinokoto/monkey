# RER Reader privacy

RER Reader is designed to work locally in the browser.

## Data collection

**RER Reader does not collect or transmit personal data, analytics, telemetry,
browsing history, or usage statistics to the developer or to any RER Reader
server. There is no RER Reader backend service.**

## Local data

The Reader stores only data needed for its features:

- Reader preferences such as theme, control position, opacity, scroll state,
  and speed are stored locally in the browser.
- Buffered chapter/page HTML and cacheable resources are stored locally so
  reading can continue during unreliable connectivity.

This local data is used only by the Reader on the user's device.

## Network requests

To pre-buffer reading content, RER Reader may request the current site's next
chapters/pages and resources referenced by those pages. These requests are made
to the websites/resources the user is reading; they are not sent to the
developer.

The Reader respects normal HTTP failures and stops on access/rate-limit
responses such as 401, 403, and 429 rather than trying to bypass them.

## Third parties

RER Reader does not add advertising, analytics SDKs, tracking pixels, remote
code, or third-party telemetry.

The websites the user visits remain governed by their own privacy policies and
terms.

## Removing local data

Users can remove locally stored Reader data through their browser's site/
extension storage controls or by uninstalling/clearing the extension. The
Reader also prunes its reading buffer automatically.

## Contact / source

Source code: https://github.com/Kiwinokoto/monkey
