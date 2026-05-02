// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

import React from 'react'
const Header = ({ user }: any) => (
  <header>
    <h1>Peripateticware</h1>
    {user && <p>Welcome</p>}
  </header>
)
export default Header
