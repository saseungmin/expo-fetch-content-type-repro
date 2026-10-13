# Title

[expo/fetch] Blob body overwrites an explicitly provided Content-Type header

# Minimal reproducible example

https://github.com/saseungmin/expo-fetch-content-type-repro

# Steps to reproduce

## Platform and environment

- Reproduced on iOS, iPhone 17 Pro Max simulator running iOS 26.1.
- Also reproduced on Android 16 / API 36, using a separate emulator with Pixel 8 hardware profile.
- Expo Go native app 57.0.9.
- Reproduced with Expo JS packages 57.0.24 and 57.0.28, using separate fresh bundles.
- Final repro uses Expo 57.0.28, React 19.2.3, react-native npm package 0.86.3.
- The Expo Go native runtime reports React Native 0.86.2.
- Package manager: npm 11.12.1; Node 24.15.0.
- Physical devices, web, and standalone release builds have not been tested.

## Reproduction steps

1. Clone the linked reproduction and run `npm ci`.
2. Run `npm run server` to start the local echo server on 127.0.0.1:8787.
3. In a second terminal, run `npm run ios` and open the project in Expo Go.
4. The app runs five identical body/header cases through two implementations:
   - The named import `fetch` from `expo/fetch`.
   - `globalThis.fetch`, kept as RN Fetch by `EXPO_PUBLIC_USE_RN_FETCH=1` in `.env`.
5. Read the app results and the server's `artifacts/wire-results.json`.

For Android, start an emulator, run `adb reverse tcp:8787 tcp:8787`, and use
`npm run android` instead of `npm run ios`. Expo CLI connects the Metro port.

The runtime confirms `globalThis.fetch !== expoFetch`, so the named Expo Fetch
and RN Fetch control are distinct in the same app. The opt-out flag does not
affect the named `expo/fetch` import.

The key request is:

```js
import { fetch as expoFetch } from 'expo/fetch';

const blob = new Blob(['test payload'], { type: '' });
await expoFetch('http://127.0.0.1:8787/echo', {
  method: 'PUT',
  headers: new Headers({ 'Content-Type': 'image/jpeg' }),
  body: blob,
});
```

The server reads `request.headers['content-type']` before returning it as JSON.
It also verifies the same 12-byte `test payload` body arrived.

## Expected behavior

Preserve the caller-provided `Content-Type`, even if it differs from the Blob's
type or the Blob's type is empty. The Fetch Standard's Request constructor only
adds a body-derived Content-Type if that header is not already present:
https://fetch.spec.whatwg.org/#dom-request

## Actual behavior

The native `expo/fetch` path replaces the explicit header with the Blob's type.
Observed server-side results were identical on both iOS and Android, with Expo
57.0.24 and 57.0.28 tested separately on each platform:

| Request body | Explicit Content-Type | Expo Fetch received header | RN Fetch received header |
| --- | --- | --- | --- |
| Blob type `text/plain` | `application/octet-stream` | `text/plain` | `application/octet-stream` |
| Blob type empty | `image/jpeg` | empty string | `image/jpeg` |
| Blob type `text/plain` | `text/plain` | `text/plain` | `text/plain` |
| ArrayBuffer | `image/jpeg` | `image/jpeg` | `image/jpeg` |
| Response.blob() from response without Content-Type | `image/jpeg` | empty string | `image/jpeg` |

All ten requests in each platform/version run arrived with exactly the same
12-byte body. This was verified for four platform/version combinations, 40
requests in total; additional repeat runs are not counted in this total.
The final project passes all 21 Expo Doctor checks.

## Source observation

In `packages/expo/src/winter/fetch/RequestUtils.ts`, the Blob branch of
`normalizeBodyInitAsync()` returns:

```ts
overriddenHeaders: [['Content-Type', body.type]]
```

`fetch()` applies this through `overrideHeaders()`, which removes the explicit
Content-Type before adding the Blob-derived value, even if that value is empty.

## Impact and limits

This can affect uploads requiring a caller-selected Content-Type, including
presigned uploads whose signature covers that header. The reproduction uses no
S3 or credentials; it proves the header mutation rather than a specific S3 error.

## Related work

- https://github.com/expo/expo/pull/46630

# Environment

Paste the captured `artifacts/environment.txt` into this template field.

# Expo Doctor Diagnostics

Paste the captured `artifacts/doctor.txt` into this template field.
