// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

// Vitest setup file (see vite.config.ts's test.setupFiles). Runs once per
// test file, before any tests in it.
import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// @testing-library/react's auto-cleanup normally self-registers via a
// global `afterEach`, but this project runs Vitest with test.globals:
// false (explicit imports everywhere, matching its existing style) -- so
// that global doesn't exist and nothing ever unmounted a previous test's
// render. Every subsequent render() call kept stacking a fresh copy of
// the tree into document.body instead of replacing it, which made every
// query after the first test see duplicate matches / query the wrong
// (unmounted) instance. Register cleanup explicitly instead.
afterEach(() => {
  cleanup()
})
