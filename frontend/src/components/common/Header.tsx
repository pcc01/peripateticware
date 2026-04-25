import React from 'react'
const Header = ({ user }: any) => (
  <header>
    <h1>Peripateticware</h1>
    {user && <p>Welcome</p>}
  </header>
)
export default Header
